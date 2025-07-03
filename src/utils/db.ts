/**
 * Database utility functions for chat message storage and retrieval
 */

import type Database from "better-sqlite3";
import type { ChatMessage } from "../types/index.js";

/**
 * Initializes the SQLite database schema for chat storage
 */
export function initializeDatabase(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chat_id) REFERENCES chats(id)
    )
  `);
}

/**
 * Retrieves the chat history for a given chat ID.
 * @param db The better-sqlite3 Database instance.
 * @param chatId The chat session ID.
 * @returns An array of chat messages.
 */
export function getChatHistory(db: Database.Database, chatId: string): ChatMessage[] {
  const messages = db
    .prepare("SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC")
    .all(chatId);
  return messages as ChatMessage[];
}

/**
 * Saves a chat message to the database, ensuring the chat exists.
 * @param db The better-sqlite3 Database instance.
 * @param chatId The chat session ID.
 * @param message The chat message to save.
 */
export function saveChatMessage(db: Database.Database, chatId: string, message: ChatMessage) {
  db.prepare("INSERT OR IGNORE INTO chats (id) VALUES (?)").run(chatId);
  db.prepare("INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)").run(
    chatId,
    message.role,
    message.content,
  );
}
