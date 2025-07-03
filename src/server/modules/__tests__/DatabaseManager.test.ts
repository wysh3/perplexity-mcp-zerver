/**
 * Tests for DatabaseManager module
 * Comprehensive testing to achieve high code coverage
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import type { ChatMessage, IDatabaseManager } from "../../../types/index.js";
import { DatabaseManager } from "../DatabaseManager.js";

// Mock Node.js fs module
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock Node.js path module
const { mockDirname } = vi.hoisted(() => ({
  mockDirname: vi.fn(),
}));

vi.mock("node:path", () => ({
  dirname: mockDirname,
  join: vi.fn(),
}));

// Mock Node.js url module
vi.mock("node:url", () => ({
  fileURLToPath: vi.fn().mockReturnValue("/mock/path/to/module.js"),
}));

// Use vi.hoisted to create variables that can be used in vi.mock
const { mockDatabase, mockDatabaseConstructor } = vi.hoisted(() => {
  const mockDatabase = {
    close: vi.fn(),
    prepare: vi.fn(),
    exec: vi.fn(),
  } as unknown as Database.Database;

  const mockDatabaseConstructor = vi.fn().mockImplementation(() => mockDatabase);

  return { mockDatabase, mockDatabaseConstructor };
});

vi.mock("better-sqlite3", () => {
  return {
    default: mockDatabaseConstructor,
  };
});

// Mock database utilities
vi.mock("../../../utils/db.js", () => ({
  initializeDatabase: vi.fn(),
  getChatHistory: vi.fn(),
  saveChatMessage: vi.fn(),
}));

// Mock logging
vi.mock("../../../utils/logging.js", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

import * as dbUtils from "../../../utils/db.js";
import * as logging from "../../../utils/logging.js";

const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockJoin = vi.mocked(join);
const mockInitializeDatabase = vi.mocked(dbUtils.initializeDatabase);
const mockGetChatHistory = vi.mocked(dbUtils.getChatHistory);
const mockSaveChatMessage = vi.mocked(dbUtils.saveChatMessage);
const mockLogInfo = vi.mocked(logging.logInfo);
const mockLogError = vi.mocked(logging.logError);

// Type for accessing private members
interface DatabaseManagerPrivate {
  db: Database.Database | null;
  initialized: boolean;
}

describe("DatabaseManager", () => {
  let databaseManager: DatabaseManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure the mock close method returns this (Database instance)
    vi.mocked(mockDatabase.close).mockReset().mockReturnValue(mockDatabase);
    databaseManager = new DatabaseManager();
  });

  describe("constructor", () => {
    it("should create instance with default path", () => {
      const manager = new DatabaseManager();
      expect(manager).toBeInstanceOf(DatabaseManager);
    });

    it("should create instance with custom path", () => {
      const customPath = "/custom/path/to/db.sqlite";
      const manager = new DatabaseManager(customPath);
      expect(manager).toBeInstanceOf(DatabaseManager);
    });
  });

  describe("initialize", () => {
    beforeEach(() => {
      mockJoin.mockReturnValue("/mock/path/to/chat_history.db");
      mockExistsSync.mockReturnValue(true);
      mockDatabaseConstructor.mockReturnValue(mockDatabase);
      mockInitializeDatabase.mockImplementation(() => {});
    });

    it("should initialize successfully with existing directory", async () => {
      mockExistsSync.mockReturnValue(true);

      databaseManager.initialize();

      expect(mockJoin).toHaveBeenCalled();
      expect(mockDatabaseConstructor).toHaveBeenCalledWith("/mock/path/to/chat_history.db", {
        fileMustExist: false,
      });
      expect(mockInitializeDatabase).toHaveBeenCalledWith(mockDatabase);
      expect(mockLogInfo).toHaveBeenCalledWith("DatabaseManager initialized successfully");
      expect(databaseManager.isInitialized()).toBe(true);
    });

    it("should create directory if it doesn't exist", async () => {
      mockExistsSync.mockReturnValue(false);
      const mockDirPath = "/mock/path/to";
      mockDirname.mockReturnValue(mockDirPath);

      databaseManager.initialize();

      expect(mockMkdirSync).toHaveBeenCalledWith(mockDirPath, { recursive: true });
      expect(mockLogInfo).toHaveBeenCalledWith(`Created database directory: ${mockDirPath}`);
    });

    it("should use custom database path when provided", async () => {
      const customPath = "/custom/db/path.sqlite";
      const customManager = new DatabaseManager(customPath);

      customManager.initialize();

      expect(mockDatabaseConstructor).toHaveBeenCalledWith(customPath, {
        fileMustExist: false,
      });
    });

    it("should handle initialization errors", async () => {
      const error = new Error("Database initialization failed");
      // Reset mock and throw error
      mockDatabaseConstructor.mockReset();
      mockDatabaseConstructor.mockImplementation(() => {
        throw error;
      });

      expect(() => databaseManager.initialize()).toThrow("Database initialization failed");

      expect(mockLogError).toHaveBeenCalledWith("DatabaseManager initialization failed:", {
        error: "Database initialization failed",
        stack: error.stack,
      });

      // Restore normal behavior
      mockDatabaseConstructor.mockReset();
      mockDatabaseConstructor.mockImplementation(() => mockDatabase);
    });

    it("should handle non-Error initialization failures", async () => {
      const stringError = "String error";
      // Reset mock and throw error
      mockDatabaseConstructor.mockReset();
      mockDatabaseConstructor.mockImplementation(() => {
        throw stringError;
      });

      expect(() => databaseManager.initialize()).toThrow(stringError);

      expect(mockLogError).toHaveBeenCalledWith("DatabaseManager initialization failed:", {
        error: "String error",
        stack: undefined,
      });

      // Restore normal behavior
      mockDatabaseConstructor.mockReset();
      mockDatabaseConstructor.mockImplementation(() => mockDatabase);
    });
  });

  describe("getChatHistory", () => {
    beforeEach(() => {
      // Initialize the database manager
      mockJoin.mockReturnValue("/mock/path/to/chat_history.db");
      mockExistsSync.mockReturnValue(true);
      mockDatabaseConstructor.mockReturnValue(mockDatabase);
      mockInitializeDatabase.mockImplementation(() => {});
      databaseManager.initialize();
    });

    it("should get chat history successfully", () => {
      const chatId = "test-chat-123";
      const mockMessages: ChatMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];
      mockGetChatHistory.mockReturnValue(mockMessages);

      const result = databaseManager.getChatHistory(chatId);

      expect(result).toEqual(mockMessages);
      expect(mockGetChatHistory).toHaveBeenCalledWith(mockDatabase, chatId);
    });

    it("should throw error when not initialized", () => {
      const uninitializedManager = new DatabaseManager();

      expect(() => uninitializedManager.getChatHistory("test-chat")).toThrow(
        "Database not initialized",
      );
    });

    it("should throw error when chat ID is not provided", () => {
      expect(() => databaseManager.getChatHistory()).toThrow("Chat ID is required");
    });

    it("should throw error when chat ID is empty string", () => {
      expect(() => databaseManager.getChatHistory("")).toThrow("Chat ID is required");
    });

    it("should handle database errors", () => {
      const chatId = "test-chat-123";
      const dbError = new Error("Database query failed");
      mockGetChatHistory.mockImplementation(() => {
        throw dbError;
      });

      expect(() => databaseManager.getChatHistory(chatId)).toThrow("Database query failed");

      expect(mockLogError).toHaveBeenCalledWith("Failed to get chat history:", {
        error: "Database query failed",
        chatId,
      });
    });

    it("should handle non-Error database failures", () => {
      const chatId = "test-chat-123";
      const stringError = "String database error";
      mockGetChatHistory.mockImplementation(() => {
        throw stringError;
      });

      expect(() => databaseManager.getChatHistory(chatId)).toThrow(stringError);

      expect(mockLogError).toHaveBeenCalledWith("Failed to get chat history:", {
        error: "String database error",
        chatId,
      });
    });
  });

  describe("saveChatMessage", () => {
    beforeEach(() => {
      // Initialize the database manager
      mockJoin.mockReturnValue("/mock/path/to/chat_history.db");
      mockExistsSync.mockReturnValue(true);
      mockDatabaseConstructor.mockReturnValue(mockDatabase);
      mockInitializeDatabase.mockImplementation(() => {});
      databaseManager.initialize();
    });

    it("should save user message successfully", () => {
      const chatId = "test-chat-123";
      const role = "user";
      const content = "Hello, how are you?";

      databaseManager.saveChatMessage(chatId, role, content);

      expect(mockSaveChatMessage).toHaveBeenCalledWith(mockDatabase, chatId, {
        role,
        content,
      });
      expect(mockLogInfo).toHaveBeenCalledWith(`Saved ${role} message for chat ${chatId}`);
    });

    it("should save assistant message successfully", () => {
      const chatId = "test-chat-456";
      const role = "assistant";
      const content = "I'm doing well, thank you!";

      databaseManager.saveChatMessage(chatId, role, content);

      expect(mockSaveChatMessage).toHaveBeenCalledWith(mockDatabase, chatId, {
        role,
        content,
      });
      expect(mockLogInfo).toHaveBeenCalledWith(`Saved ${role} message for chat ${chatId}`);
    });

    it("should throw error when not initialized", () => {
      const uninitializedManager = new DatabaseManager();

      expect(() => uninitializedManager.saveChatMessage("chat", "user", "message")).toThrow(
        "Database not initialized",
      );
    });

    it("should handle database save errors", () => {
      const chatId = "test-chat-123";
      const role = "user";
      const content = "Test message";
      const dbError = new Error("Database save failed");
      mockSaveChatMessage.mockImplementation(() => {
        throw dbError;
      });

      expect(() => databaseManager.saveChatMessage(chatId, role, content)).toThrow(
        "Database save failed",
      );

      expect(mockLogError).toHaveBeenCalledWith("Failed to save chat message:", {
        error: "Database save failed",
        chatId,
        role,
      });
    });

    it("should handle non-Error save failures", () => {
      const chatId = "test-chat-123";
      const role = "assistant";
      const content = "Test response";
      const stringError = "String save error";
      mockSaveChatMessage.mockImplementation(() => {
        throw stringError;
      });

      expect(() => databaseManager.saveChatMessage(chatId, role, content)).toThrow(stringError);

      expect(mockLogError).toHaveBeenCalledWith("Failed to save chat message:", {
        error: "String save error",
        chatId,
        role,
      });
    });
  });

  describe("close", () => {
    it("should close database connection successfully", () => {
      // Initialize first
      mockJoin.mockReturnValue("/mock/path/to/chat_history.db");
      mockExistsSync.mockReturnValue(true);
      mockDatabaseConstructor.mockReturnValue(mockDatabase);
      databaseManager.initialize();

      databaseManager.close();

      expect(mockDatabase.close).toHaveBeenCalled();
      expect(databaseManager.isInitialized()).toBe(false);
      expect(mockLogInfo).toHaveBeenCalledWith("Database connection closed successfully");
    });

    it("should handle close when not initialized", () => {
      databaseManager.close();

      expect(mockDatabase.close).not.toHaveBeenCalled();
      // Should not throw error
    });

    it("should handle close errors", () => {
      // Initialize first
      mockJoin.mockReturnValue("/mock/path/to/chat_history.db");
      mockExistsSync.mockReturnValue(true);
      mockDatabaseConstructor.mockReturnValue(mockDatabase);
      databaseManager.initialize();

      const closeError = new Error("Close failed");
      vi.mocked(mockDatabase.close).mockImplementation(() => {
        throw closeError;
      });

      databaseManager.close();

      expect(mockLogError).toHaveBeenCalledWith("Error closing database:", {
        error: "Close failed",
      });
    });

    it("should handle non-Error close failures", () => {
      // Initialize first
      mockJoin.mockReturnValue("/mock/path/to/chat_history.db");
      mockExistsSync.mockReturnValue(true);
      mockDatabaseConstructor.mockReturnValue(mockDatabase);
      databaseManager.initialize();

      const stringError = "String close error";
      vi.mocked(mockDatabase.close).mockImplementation(() => {
        throw stringError;
      });

      databaseManager.close();

      expect(mockLogError).toHaveBeenCalledWith("Error closing database:", {
        error: "String close error",
      });
    });
  });

  describe("isInitialized", () => {
    it("should return false when not initialized", () => {
      expect(databaseManager.isInitialized()).toBe(false);
    });

    it("should return true when properly initialized", () => {
      mockJoin.mockReturnValue("/mock/path/to/chat_history.db");
      mockExistsSync.mockReturnValue(true);
      mockDatabaseConstructor.mockReturnValue(mockDatabase);
      databaseManager.initialize();

      expect(databaseManager.isInitialized()).toBe(true);
    });

    it("should return false after close", () => {
      // Create fresh instance to avoid state contamination
      const freshManager = new DatabaseManager();

      // Initialize first
      mockJoin.mockReturnValue("/mock/path/to/chat_history.db");
      mockExistsSync.mockReturnValue(true);
      mockDatabaseConstructor.mockReturnValue(mockDatabase);
      freshManager.initialize();

      expect(freshManager.isInitialized()).toBe(true);

      freshManager.close();

      expect(freshManager.isInitialized()).toBe(false);
    });
  });

  describe("getDatabase", () => {
    it("should return null when not initialized", () => {
      expect(databaseManager.getDatabase()).toBeNull();
    });

    it("should return database instance when initialized", () => {
      mockJoin.mockReturnValue("/mock/path/to/chat_history.db");
      mockExistsSync.mockReturnValue(true);
      mockDatabaseConstructor.mockReturnValue(mockDatabase);
      databaseManager.initialize();

      expect(databaseManager.getDatabase()).toBe(mockDatabase);
    });

    it("should return null after close", () => {
      // Create fresh instance to avoid state contamination
      const freshManager = new DatabaseManager();

      // Initialize first
      mockJoin.mockReturnValue("/mock/path/to/chat_history.db");
      mockExistsSync.mockReturnValue(true);
      mockDatabaseConstructor.mockReturnValue(mockDatabase);
      freshManager.initialize();

      expect(freshManager.getDatabase()).toBe(mockDatabase);

      freshManager.close();

      expect(freshManager.getDatabase()).toBeNull();
    });
  });
});
