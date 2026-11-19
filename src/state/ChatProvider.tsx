import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { GatewayError, gatewayOrigin, streamCompletion } from "@/gateway/client";
import { clearGatewayToken, loadGatewayToken, saveGatewayToken } from "@/security/credentials";
import { getDatabase } from "@/storage/database";
import {
  appendTurn,
  createConversationWithUserMessage,
  getConversation,
  getMessages,
  loadSettings,
  resetAssistantMessage,
  saveSettings as persistSettings,
  updateAssistantMessage,
} from "@/storage/repository";
import type { ActiveGeneration, GatewaySettings, Message } from "@/domain/types";

type ChatContextValue = {
  ready: boolean;
  isPreparing: boolean;
  activeGeneration: ActiveGeneration | null;
  settings: GatewaySettings;
  hasGatewayToken: boolean;
  initializationError: string | null;
  sendMessage: (conversationId: number | null, text: string) => Promise<number>;
  retryLastTurn: (conversationId: number) => Promise<void>;
  stopGeneration: (conversationId?: number) => void;
  saveSettings: (settings: GatewaySettings, tokenInput: string) => Promise<void>;
  removeToken: () => Promise<void>;
};

const ChatContext = createContext<ChatContextValue | null>(null);

type StartGenerationInput = {
  conversationId: number;
  assistantMessage: Message;
  requestMessages: Pick<Message, "role" | "content">[];
  settings: GatewaySettings;
  token: string | null;
  controllerRef: React.MutableRefObject<{ conversationId: number; controller: AbortController } | null>;
  publishGeneration: React.Dispatch<React.SetStateAction<ActiveGeneration | null>>;
};

function startGeneration({
  conversationId,
  assistantMessage,
  requestMessages,
  settings,
  token,
  controllerRef,
  publishGeneration,
}: StartGenerationInput): void {
  const controller = new AbortController();
  controllerRef.current = { conversationId, controller };
  let accumulated = "";
  let lastPersistAt = 0;
  let lastUiUpdateAt = 0;
  let persistQueue = Promise.resolve();
  let persistenceError = false;
  const publish = (status: ActiveGeneration["status"], error?: string) => {
    publishGeneration({ conversationId, messageId: assistantMessage.id, text: accumulated, status, error });
  };
  const queuePersist = (status: Message["status"]) => {
    const snapshot = accumulated;
    persistQueue = persistQueue
      .then(() => updateAssistantMessage(assistantMessage.id, snapshot, status))
      .catch(() => { persistenceError = true; });
    return persistQueue;
  };

  publish("streaming");
  void (async () => {
    try {
      await streamCompletion({
        settings,
        token,
        messages: requestMessages,
        signal: controller.signal,
        onDelta: (delta) => {
          accumulated += delta;
          const now = Date.now();
          if (now - lastUiUpdateAt >= 33) {
            lastUiUpdateAt = now;
            publish("streaming");
          }
          if (now - lastPersistAt >= 500) {
            lastPersistAt = now;
            void queuePersist("streaming");
          }
        },
      });
      await queuePersist("complete");
      publish(persistenceError ? "failed" : "complete", persistenceError
        ? "The response arrived, but it could not be saved on this device."
        : undefined);
    } catch (error) {
      const cancelled = controller.signal.aborted;
      await queuePersist(cancelled ? "cancelled" : "failed");
      publish(
        cancelled ? "cancelled" : "failed",
        cancelled ? undefined : error instanceof Error ? error.message : "The response could not be completed.",
      );
    } finally {
      if (controllerRef.current?.controller === controller) controllerRef.current = null;
    }
  })();
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [settings, setSettings] = useState<GatewaySettings>({
    baseUrl: "",
    model: "",
    temperature: 0.7,
    maxTokens: 1024,
  });
  const [hasGatewayToken, setHasGatewayToken] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [activeGeneration, setActiveGeneration] = useState<ActiveGeneration | null>(null);
  const controllerRef = useRef<{ conversationId: number; controller: AbortController } | null>(null);
  const preparingRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([getDatabase(), loadSettings()])
      .then(async ([, storedSettings]) => {
        if (!mounted) return;
        setSettings(storedSettings);
        const token = await loadGatewayToken().catch(() => null);
        if (!mounted) return;
        setHasGatewayToken(Boolean(token));
        setReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        setInitializationError("Local storage could not be opened. Restart the app and try again.");
        setReady(true);
      });
    return () => {
      mounted = false;
      controllerRef.current?.controller.abort();
    };
  }, []);

  const stopGeneration = useCallback((conversationId?: number) => {
    const current = controllerRef.current;
    if (current && (conversationId === undefined || current.conversationId === conversationId)) {
      current.controller.abort();
    }
  }, []);

  const sendMessage = useCallback(async (requestedConversationId: number | null, text: string) => {
    if (controllerRef.current || preparingRef.current) throw new Error("A response is already being prepared or generated.");
    preparingRef.current = true;
    setIsPreparing(true);
    try {
      const currentSettings = await loadSettings();
      if (!currentSettings.baseUrl.trim() || !currentSettings.model.trim()) {
        throw new GatewayError("Add the gateway URL and model ID in Settings first.", "configuration");
      }
      const token = await loadGatewayToken();
      if (token && /\s/.test(token)) {
        throw new GatewayError("The bearer token must not contain whitespace.", "configuration");
      }
      const content = text.trim();
      if (!content) throw new Error("Write a message before sending.");

      let conversationId = requestedConversationId;
      if (conversationId === null || !(await getConversation(conversationId))) {
        const created = await createConversationWithUserMessage(content);
        conversationId = created.conversationId;
      } else {
        await appendTurn(conversationId, content);
      }

      const savedMessages = await getMessages(conversationId);
      const assistantMessage = [...savedMessages].reverse().find((message) =>
        message.role === "assistant" && message.status === "streaming",
      );
      if (!assistantMessage) throw new Error("The new response could not be prepared.");

      const requestMessages = savedMessages
        .filter((message) => message.id !== assistantMessage.id && message.content.length > 0)
        .map(({ role, content: messageContent }) => ({ role, content: messageContent }));
      startGeneration({
        conversationId,
        assistantMessage,
        requestMessages,
        settings: currentSettings,
        token,
        controllerRef,
        publishGeneration: setActiveGeneration,
      });
      return conversationId as number;
    } finally {
      preparingRef.current = false;
      setIsPreparing(false);
    }
  }, []);

  const retryLastTurn = useCallback(async (conversationId: number) => {
    if (controllerRef.current || preparingRef.current) throw new Error("A response is already being prepared or generated.");
    preparingRef.current = true;
    setIsPreparing(true);
    try {
      const currentSettings = await loadSettings();
      if (!currentSettings.baseUrl.trim() || !currentSettings.model.trim()) {
        throw new GatewayError("Add the gateway URL and model ID in Settings first.", "configuration");
      }
      const savedMessages = await getMessages(conversationId);
      const assistantMessage = [...savedMessages].reverse().find((message) => message.role === "assistant");
      if (!assistantMessage || !["failed", "cancelled", "interrupted"].includes(assistantMessage.status)) {
        throw new Error("There is no unfinished response to retry.");
      }
      const requestMessages = savedMessages
        .filter((message) => message.id !== assistantMessage.id && message.content.length > 0)
        .map(({ role, content }) => ({ role, content }));
      const token = await loadGatewayToken();
      if (token && /\s/.test(token)) {
        throw new GatewayError("The bearer token must not contain whitespace.", "configuration");
      }
      await resetAssistantMessage(assistantMessage.id);
      startGeneration({
        conversationId,
        assistantMessage: { ...assistantMessage, content: "", status: "streaming" },
        requestMessages,
        settings: currentSettings,
        token,
        controllerRef,
        publishGeneration: setActiveGeneration,
      });
    } finally {
      preparingRef.current = false;
      setIsPreparing(false);
    }
  }, []);

  const saveSettings = useCallback(async (nextSettings: GatewaySettings, tokenInput: string) => {
    const gatewayChanged = gatewayOrigin(settings.baseUrl) !== gatewayOrigin(nextSettings.baseUrl);
    await persistSettings(nextSettings);
    setSettings(nextSettings);
    if (tokenInput.trim()) {
      await saveGatewayToken(tokenInput);
      setHasGatewayToken(true);
    } else if (gatewayChanged && hasGatewayToken) {
      await clearGatewayToken();
      setHasGatewayToken(false);
    }
  }, [settings.baseUrl, hasGatewayToken]);

  const removeToken = useCallback(async () => {
    await clearGatewayToken();
    setHasGatewayToken(false);
  }, []);

  const value = useMemo<ChatContextValue>(() => ({
    ready,
    isPreparing,
    activeGeneration,
    settings,
    hasGatewayToken,
    initializationError,
    sendMessage,
    retryLastTurn,
    stopGeneration,
    saveSettings,
    removeToken,
  }), [
    ready,
    isPreparing,
    activeGeneration,
    settings,
    hasGatewayToken,
    initializationError,
    sendMessage,
    retryLastTurn,
    stopGeneration,
    saveSettings,
    removeToken,
  ]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const value = useContext(ChatContext);
  if (!value) throw new Error("useChat must be used inside ChatProvider.");
  return value;
}
