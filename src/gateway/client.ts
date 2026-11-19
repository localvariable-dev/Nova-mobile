import { fetch } from "expo/fetch";
import type { GatewaySettings, Message } from "@/domain/types";

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly kind: "configuration" | "http" | "network" | "stream",
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

type CompletionInput = {
  settings: GatewaySettings;
  token: string | null;
  messages: Pick<Message, "role" | "content">[];
  signal: AbortSignal;
  onDelta: (text: string) => void;
};

export function validateBaseUrl(baseUrl: string): string {
  const value = baseUrl.trim();
  let url: URL;
  try {
    url = new URL(value.endsWith("/") ? value : `${value}/`);
  } catch {
    throw new GatewayError("Enter a valid gateway URL in Settings.", "configuration");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new GatewayError("The gateway URL cannot include credentials or query values.", "configuration");
  }
  const localHosts = new Set(["localhost", "127.0.0.1", "10.0.2.2"]);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHosts.has(url.hostname))) {
    throw new GatewayError("Use HTTPS for a remote gateway URL.", "configuration");
  }
  let path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/v1")) path = path.slice(0, -3);
  url.pathname = `${path || ""}/`;
  return new URL("v1/chat/completions", url).toString();
}

export function gatewayOrigin(baseUrl: string): string | null {
  try {
    return new URL(baseUrl.trim()).origin;
  } catch {
    return null;
  }
}

function errorText(status: number): string {
  if (status === 401 || status === 403) return "The gateway rejected the token. Check it in Settings.";
  if (status === 404) return "The chat endpoint was not found. Check the gateway base URL.";
  if (status === 429) return "The gateway is rate limiting requests. Wait a moment and try again.";
  if (status >= 500) return "The gateway had a server error. Try again later.";
  return `The gateway returned an error (${status}). Check the model and settings.`;
}

function parseCompletionChunk(payload: unknown): { text: string; finished: boolean } {
  if (!payload || typeof payload !== "object") return { text: "", finished: false };
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
    return { text: "", finished: false };
  }
  const choice = choices[0] as { delta?: { content?: unknown }; finish_reason?: unknown };
  const delta = choice.delta;
  const content = delta?.content;
  if (typeof content === "string") {
    return { text: content, finished: choice.finish_reason != null };
  }
  if (Array.isArray(content)) {
    const text = content
      .filter((part): part is { type: string; text: string } =>
        Boolean(part && typeof part === "object" && "text" in part && typeof part.text === "string"),
      )
      .map((part) => part.text)
      .join("");
    return { text, finished: choice.finish_reason != null };
  }
  return { text: "", finished: choice.finish_reason != null };
}

export async function streamCompletion({
  settings,
  token,
  messages,
  signal,
  onDelta,
}: CompletionInput): Promise<void> {
  if (!settings.baseUrl.trim() || !settings.model.trim()) {
    throw new GatewayError("Add the gateway URL and model ID in Settings first.", "configuration");
  }
  const endpoint = validateBaseUrl(settings.baseUrl);
  if (token && /\s/.test(token)) {
    throw new GatewayError("The bearer token must not contain whitespace.", "configuration");
  }
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({
        model: settings.model.trim(),
        messages: messages.map(({ role, content }) => ({ role, content })),
        stream: true,
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
      }),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new GatewayError("Could not reach the gateway. Check your connection and URL.", "network");
  }

  if (!response.ok) {
    throw new GatewayError(errorText(response.status), "http");
  }
  if (!response.body) {
    throw new GatewayError("The gateway returned no response stream.", "stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];
  let receivedDone = false;
  let receivedFinishReason = false;

  const dispatch = () => {
    if (dataLines.length === 0) return;
    const data = dataLines.join("\n");
    dataLines = [];
    if (data === "[DONE]") {
      receivedDone = true;
      return;
    }
    try {
      const chunk = parseCompletionChunk(JSON.parse(data));
      if (chunk.finished) receivedFinishReason = true;
      if (chunk.text) onDelta(chunk.text);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new GatewayError("The gateway sent an unreadable stream event.", "stream");
      }
      throw error;
    }
  };

  const consumeLines = (flushRemainder = false) => {
    const lines = buffer.split("\n");
    buffer = flushRemainder ? "" : lines.pop() ?? "";
    for (const rawLine of lines) {
      if (receivedDone || receivedFinishReason) break;
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (!line) {
        dispatch();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""));
      }
    }
    if (flushRemainder && buffer) {
      const line = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
      if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
      buffer = "";
    }
  };

  try {
    while (!receivedDone && !receivedFinishReason) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw new Error("Request aborted.");
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      consumeLines();
    }
    if (!receivedDone) {
      buffer += decoder.decode();
      consumeLines(true);
      dispatch();
      if (!receivedDone && !receivedFinishReason) {
        throw new GatewayError("The response stream ended before it was complete.", "stream");
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The request may already have closed or been aborted.
    }
    reader.releaseLock();
  }
}
