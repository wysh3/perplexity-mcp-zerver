import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
/**
 * DatabaseManager - Handles all database operations
 * Focused, testable module for SQLite database management
 */
import { Database } from "bun:sqlite";
import type { ChatMessage, IDatabaseManager } from "../../types/index.js";
import { getChatHistory, initializeDatabase, saveChatMessage } from "../../utils/db.js";
import { logError, logInfo } from "../../utils/logging.js";

export class DatabaseManager implements IDatabaseManager {
  private db: Database | null = null;
  private initialized = false;

  constructor(private readonly customDbPath?: string) {}

  initialize(): void {
    try {
      // Determine database path
      const dbPath =
        this.customDbPath ||
        join(dirname(fileURLToPath(import.meta.url)), "..", "..", "chat_history.db");

      const dbDir = dirname(dbPath);

      logInfo(`Initializing database at: ${dbPath}`);

      // Create directory if it doesn't exist
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
        logInfo(`Created database directory: ${dbDir}`);
      }

      // Initialize SQLite database
      this.db = new Database(dbPath, { create: true });

      // Run database initialization script
      initializeDatabase(this.db);

      this.initialized = true;
      logInfo("DatabaseManager initialized successfully");
    } catch (error) {
      logError("DatabaseManager initialization failed:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  getChatHistory(chatId?: string): ChatMessage[] {
    if (!this.isInitialized()) {
      throw new Error("Database not initialized");
    }

    if (!chatId) {
      throw new Error("Chat ID is required");
    }

    try {
      return getChatHistory(this.db as Database, chatId);
    } catch (error) {
      logError("Failed to get chat history:", {
        error: error instanceof Error ? error.message : String(error),
        chatId,
      });
      throw error;
    }
  }

  saveChatMessage(chatId: string, role: "user" | "assistant", content: string): void {
    if (!this.isInitialized()) {
      throw new Error("Database not initialized");
    }

    try {
      const message: ChatMessage = { role, content };
      saveChatMessage(this.db as Database, chatId, message);
      logInfo(`Saved ${role} message for chat ${chatId}`);
    } catch (error) {
      logError("Failed to save chat message:", {
        error: error instanceof Error ? error.message : String(error),
        chatId,
        role,
      });
      throw error;
    }
  }

  close(): void {
    try {
      if (this.db) {
        this.db.close();
        this.db = null;
        this.initialized = false;
        logInfo("Database connection closed successfully");
      }
    } catch (error) {
      logError("Error closing database:", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  isInitialized(): boolean {
    return this.initialized && this.db !== null;
  }

  // Getter for testing purposes
  getDatabase(): Database | null {
    return this.db;
  }
}
