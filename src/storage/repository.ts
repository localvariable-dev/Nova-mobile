import type { Conversation, GatewaySettings, Message } from "@/domain/types";
import { DEFAULT_SETTINGS } from "@/domain/types";
import { getDatabase } from "./database";

type ConversationRow = {
  id: number;
  title: string;
  created_at: number;
  updated_at: number;
};

type MessageRow = {
  id: number;
  conversation_id: number;
  role: Message["role"];
  content: string;
  status: Message["status"];
  created_at: number;
};

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function listConversations(): Promise<Conversation[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ConversationRow>(
    "SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC, id DESC",
  );
  return rows.map(toConversation);
}

export async function getConversation(id: number): Promise<Conversation | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ConversationRow>(
    "SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?",
    id,
  );
  return row ? toConversation(row) : null;
}

export async function getMessages(conversationId: number): Promise<Message[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<MessageRow>(
    "SELECT id, conversation_id, role, content, status, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at, id",
    conversationId,
  );
  return rows.map(toMessage);
}

export async function createConversationWithUserMessage(
  content: string,
): Promise<{ conversationId: number; userMessage: Message; assistantMessage: Message }> {
  const db = await getDatabase();
  const now = Date.now();
  const title = content.trim().replace(/\s+/g, " ").slice(0, 56) || "New conversation";
  let conversationId = 0;
  let userMessageId = 0;
  let assistantMessageId = 0;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const conversationResult = await transaction.runAsync(
      "INSERT INTO conversations (title, created_at, updated_at) VALUES (?, ?, ?)",
      title,
      now,
      now,
    );
    conversationId = conversationResult.lastInsertRowId;
    const userResult = await transaction.runAsync(
      "INSERT INTO messages (conversation_id, role, content, status, created_at) VALUES (?, 'user', ?, 'complete', ?)",
      conversationId,
      content,
      now,
    );
    userMessageId = userResult.lastInsertRowId;
    const assistantResult = await transaction.runAsync(
      "INSERT INTO messages (conversation_id, role, content, status, created_at) VALUES (?, 'assistant', '', 'streaming', ?)",
      conversationId,
      now + 1,
    );
    assistantMessageId = assistantResult.lastInsertRowId;
  });

  return {
    conversationId,
    userMessage: {
      id: userMessageId,
      conversationId,
      role: "user",
      content,
      status: "complete",
      createdAt: now,
    },
    assistantMessage: {
      id: assistantMessageId,
      conversationId,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: now + 1,
    },
  };
}

export async function appendTurn(
  conversationId: number,
  content: string,
): Promise<{ userMessage: Message; assistantMessage: Message }> {
  const db = await getDatabase();
  const now = Date.now();
  let userMessageId = 0;
  let assistantMessageId = 0;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const result = await transaction.runAsync(
      "INSERT INTO messages (conversation_id, role, content, status, created_at) VALUES (?, 'user', ?, 'complete', ?)",
      conversationId,
      content,
      now,
    );
    userMessageId = result.lastInsertRowId;
    const assistant = await transaction.runAsync(
      "INSERT INTO messages (conversation_id, role, content, status, created_at) VALUES (?, 'assistant', '', 'streaming', ?)",
      conversationId,
      now + 1,
    );
    assistantMessageId = assistant.lastInsertRowId;
    await transaction.runAsync(
      "UPDATE conversations SET updated_at = ? WHERE id = ?",
      now,
      conversationId,
    );
  });
  return {
    userMessage: {
      id: userMessageId,
      conversationId,
      role: "user",
      content,
      status: "complete",
      createdAt: now,
    },
    assistantMessage: {
      id: assistantMessageId,
      conversationId,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: now + 1,
    },
  };
}

export async function updateAssistantMessage(
  messageId: number,
  content: string,
  status: Message["status"],
): Promise<void> {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      "UPDATE messages SET content = ?, status = ? WHERE id = ? AND role = 'assistant'",
      content,
      status,
      messageId,
    );
    await transaction.runAsync(
      "UPDATE conversations SET updated_at = ? WHERE id = (SELECT conversation_id FROM messages WHERE id = ?)",
      Date.now(),
      messageId,
    );
  });
}

export async function saveSettings(settings: GatewaySettings): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO settings (key, value) VALUES ('gateway', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    JSON.stringify(settings),
  );
}

export async function loadSettings(): Promise<GatewaySettings> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'gateway'",
  );
  if (!row) return DEFAULT_SETTINGS;
  try {
    const value = JSON.parse(row.value) as Partial<GatewaySettings>;
    return {
      baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : "",
      model: typeof value.model === "string" ? value.model : "",
      temperature:
        typeof value.temperature === "number" && Number.isFinite(value.temperature)
          ? value.temperature
          : DEFAULT_SETTINGS.temperature,
      maxTokens:
        typeof value.maxTokens === "number" && Number.isFinite(value.maxTokens)
          ? value.maxTokens
          : DEFAULT_SETTINGS.maxTokens,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function deleteConversation(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM conversations WHERE id = ?", id);
}

export async function markAssistantMessage(
  messageId: number,
  status: Message["status"],
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE messages SET status = ? WHERE id = ? AND role = 'assistant'",
    status,
    messageId,
  );
}

export async function resetAssistantMessage(messageId: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE messages SET content = '', status = 'streaming' WHERE id = ? AND role = 'assistant'",
    messageId,
  );
}
