/**
 * Database and Chat related type definitions
 */
// ─── CHAT & DATABASE TYPES ────────────────────────────────────────────
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResult {
  chat_id: string;
  response: string;
}

// ─── DATABASE MANAGER INTERFACE ───────────────────────────────────────
export interface IDatabaseManager {
  initialize(): void;
  getChatHistory(chatId?: string): ChatMessage[];
  saveChatMessage(chatId: string, role: "user" | "assistant", content: string): void;
  close(): void;
  isInitialized(): boolean;
}
