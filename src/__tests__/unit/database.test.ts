import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseManager } from "../../server/modules/DatabaseManager.js";
import type { ChatMessage } from "../../types/index.js";

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

// Mock bun:sqlite
const { mockStmt } = vi.hoisted(() => ({
  mockStmt: {
    all: vi.fn(),
    run: vi.fn(),
  },
}));

const { MockDatabase } = vi.hoisted(() => ({
  MockDatabase: class {
    close = vi.fn();
    exec = vi.fn();
    prepare = mockStmt as { all: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn> };
    query = mockStmt as { all: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn> };
  },
}));

vi.mock("bun:sqlite", () => ({
  Database: MockDatabase,
}));

// Mock database utilities
vi.mock("../../utils/db.js", () => ({
  initializeDatabase: vi.fn(),
  getChatHistory: vi.fn(),
  saveChatMessage: vi.fn(),
}));

// Mock logging
vi.mock("../../utils/logging.js", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

import * as dbUtils from "../../utils/db.js";
import * as logging from "../../utils/logging.js";

const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockJoin = vi.mocked(join);
const mockInitializeDatabase = vi.mocked(dbUtils.initializeDatabase);
const mockGetChatHistory = vi.mocked(dbUtils.getChatHistory);
const mockSaveChatMessage = vi.mocked(dbUtils.saveChatMessage);
const mockLogInfo = vi.mocked(logging.logInfo);
const mockLogError = vi.mocked(logging.logError);

describe("DatabaseManager", () => {
  let databaseManager: DatabaseManager;

  beforeEach(() => {
    vi.clearAllMocks();
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
      mockInitializeDatabase.mockImplementation(() => {});
    });

    it("should initialize successfully with existing directory", () => {
      mockExistsSync.mockReturnValue(true);

      databaseManager.initialize();

      expect(mockJoin).toHaveBeenCalled();
      expect(mockInitializeDatabase).toHaveBeenCalled();
      expect(mockLogInfo).toHaveBeenCalledWith(
        "DatabaseManager initialized successfully with optimizations",
      );
      expect(databaseManager.isInitialized()).toBe(true);
    });

    it("should create directory if it doesn't exist", () => {
      mockExistsSync.mockReturnValue(false);
      const mockDirPath = "/mock/path/to";
      mockDirname.mockReturnValue(mockDirPath);

      databaseManager.initialize();

      expect(mockMkdirSync).toHaveBeenCalledWith(mockDirPath, { recursive: true });
      expect(mockLogInfo).toHaveBeenCalledWith(`Created database directory: ${mockDirPath}`);
    });

    it("should use custom database path when provided", () => {
      const customPath = "/custom/db/path.sqlite";
      const customManager = new DatabaseManager(customPath);
      expect(customManager).toBeInstanceOf(DatabaseManager);
    });

    it("should handle initialization errors", () => {
      const error = new Error("Database initialization failed");
      mockInitializeDatabase.mockImplementationOnce(() => {
        throw error;
      });

      expect(() => databaseManager.initialize()).toThrow("Database initialization failed");
      expect(mockLogError).toHaveBeenCalledWith(
        "DatabaseManager initialization failed:",
        expect.any(Object),
      );
    });
  });

  describe("getChatHistory", () => {
    beforeEach(() => {
      // Initialize the database manager
      mockJoin.mockReturnValue("/mock/path/to/chat_history.db");
      mockExistsSync.mockReturnValue(true);
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
      expect(mockGetChatHistory).toHaveBeenCalledWith(expect.anything(), chatId);
    });

    it("should throw error when not initialized", () => {
      const uninitializedManager = new DatabaseManager();
      expect(() => uninitializedManager.getChatHistory("test-chat")).toThrow(
        "Database not initialized",
      );
    });

    it("should throw error when chat ID is not provided", () => {
      expect(() => databaseManager.getChatHistory("")).toThrow("Chat ID is required");
    });
  });

  describe("saveChatMessage", () => {
    beforeEach(() => {
      // Initialize the database manager
      mockJoin.mockReturnValue("/mock/path/to/chat_history.db");
      mockExistsSync.mockReturnValue(true);
      mockInitializeDatabase.mockImplementation(() => {});
      databaseManager.initialize();
    });

    it("should save user message successfully", () => {
      const chatId = "test-chat-123";
      const role = "user";
      const content = "Hello, how are you?";

      databaseManager.saveChatMessage(chatId, role, content);

      expect(mockSaveChatMessage).toHaveBeenCalledWith(expect.anything(), chatId, {
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

      expect(mockSaveChatMessage).toHaveBeenCalledWith(expect.anything(), chatId, {
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
  });

  describe("close", () => {
    it("should close database connection successfully", () => {
      // Initialize first
      mockJoin.mockReturnValue("/mock/path/to/chat_history.db");
      mockExistsSync.mockReturnValue(true);
      mockInitializeDatabase.mockImplementation(() => {});
      databaseManager.initialize();

      databaseManager.close();

      expect(mockLogInfo).toHaveBeenCalledWith("Database connection closed successfully");
      expect(databaseManager.isInitialized()).toBe(false);
    });

    it("should handle close when not initialized", () => {
      databaseManager.close();
      // Should not throw error
    });
  });

  describe("isInitialized", () => {
    it("should return false when not initialized", () => {
      expect(databaseManager.isInitialized()).toBe(false);
    });

    it("should return true when properly initialized", () => {
      mockJoin.mockReturnValue("/mock/path/to/chat_history.db");
      mockExistsSync.mockReturnValue(true);
      mockInitializeDatabase.mockImplementation(() => {});
      databaseManager.initialize();
      expect(databaseManager.isInitialized()).toBe(true);
    });
  });
});
