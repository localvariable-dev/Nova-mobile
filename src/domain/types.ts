export type MessageRole = "user" | "assistant";

export type GenerationStatus =
  | "complete"
  | "streaming"
  | "cancelled"
  | "failed"
  | "interrupted";

export interface Conversation {
  id: number;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: number;
  conversationId: number;
  role: MessageRole;
  content: string;
  status: GenerationStatus;
  createdAt: number;
}

export interface GatewaySettings {
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface ActiveGeneration {
  conversationId: number;
  messageId: number;
  text: string;
  status: "streaming" | "cancelled" | "failed" | "complete";
  error?: string;
}

export const DEFAULT_SETTINGS: GatewaySettings = {
  baseUrl: "",
  model: "",
  temperature: 0.7,
  maxTokens: 1024,
};
