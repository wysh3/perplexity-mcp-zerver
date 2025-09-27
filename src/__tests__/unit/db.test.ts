import { describe, expect, it, vi } from "vitest";
import type { Database } from "bun:sqlite";
import type { ChatMessage } from "../../types/index.js";
import * as dbModule from "../../utils/db.js";

// Mock logging
vi.mock("../../utils/logging.js", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

describe("Database Utilities", () => {
  // Create mock database implementation
  const createMockDatabase = () => {
    const tables: Record<string, any[]> = {};

    return {
      exec: vi.fn((sql: string) => {
        // Simulate table creation
        if (sql.includes("CREATE TABLE IF NOT EXISTS chats")) {
          tables["chats"] = tables["chats"] || [];
        }
        if (sql.includes("CREATE TABLE IF NOT EXISTS messages")) {
          tables["messages"] = tables["messages"] || [];
        }
      }),
      query: vi.fn((sql: string) => ({
        all: vi.fn((chatId: string) => {
          if (sql.includes("SELECT role, content FROM messages")) {
            // Return mock chat history
            return (
              tables["messages"]
                ?.filter((msg) => msg.chat_id === chatId)
                .map((msg) => ({ role: msg.role, content: msg.content })) || []
            );
          }
          return [];
        }),
      })),
      prepare: vi.fn((sql: string) => ({
        run: vi.fn((...params: any[]) => {
          if (sql.includes("INSERT OR IGNORE INTO chats")) {
            const chatId = params[0];
            // Simulate inserting chat if not exists
            if (!tables["chats"]?.some((chat) => chat.id === chatId)) {
              tables["chats"] = tables["chats"] || [];
              tables["chats"].push({ id: chatId, created_at: new Date().toISOString() });
            }
          } else if (sql.includes("INSERT INTO messages")) {
            const [chatId, role, content] = params;
            // Simulate inserting message
            tables["messages"] = tables["messages"] || [];
            tables["messages"].push({
              id: tables["messages"].length + 1,
              chat_id: chatId,
              role: role as string,
              content: content as string,
              created_at: new Date().toISOString(),
            });
          }
          return { changes: 1 };
        }),
      })),
    };
  };

  describe("Database Initialization", () => {
    it("should create required tables when initializing database", () => {
      const mockDb = createMockDatabase();

      dbModule.initializeDatabase(mockDb as unknown as Database);

      expect(mockDb.exec).toHaveBeenCalledTimes(2);
      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining("CREATE TABLE IF NOT EXISTS chats"),
      );
      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining("CREATE TABLE IF NOT EXISTS messages"),
      );
    });

    it("should create tables with correct schema", () => {
      const mockDb = createMockDatabase();

      dbModule.initializeDatabase(mockDb as unknown as Database);

      // Verify chats table structure
      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining("id TEXT PRIMARY KEY"));
      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining("created_at DATETIME DEFAULT CURRENT_TIMESTAMP"),
      );

      // Verify messages table structure
      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining("chat_id TEXT NOT NULL"));
      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining("role TEXT NOT NULL"));
      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining("content TEXT NOT NULL"));
      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining("FOREIGN KEY (chat_id) REFERENCES chats(id)"),
      );
    });
  });

  describe("Chat History Operations", () => {
    it("should retrieve chat history for a given chat ID", () => {
      const mockDb = createMockDatabase();

      // Initialize database and add some test data
      dbModule.initializeDatabase(mockDb as unknown as Database);

      const chatId = "test-chat-123";
      const testMessages: ChatMessage[] = [
        { role: "user", content: "Hello!" },
        { role: "assistant", content: "Hi there!" },
        { role: "user", content: "How are you?" },
      ];

      // Save test messages
      testMessages.forEach((msg) => {
        dbModule.saveChatMessage(mockDb as unknown as Database, chatId, msg);
      });

      // Retrieve chat history
      const history = dbModule.getChatHistory(mockDb as unknown as Database, chatId);

      expect(history).toHaveLength(3);
      expect(history[0]).toEqual(testMessages[0]);
      expect(history[1]).toEqual(testMessages[1]);
      expect(history[2]).toEqual(testMessages[2]);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT role, content FROM messages"),
      );
    });

    it("should return empty array for non-existent chat ID", () => {
      const mockDb = createMockDatabase();

      const history = dbModule.getChatHistory(mockDb as unknown as Database, "non-existent-chat");

      expect(history).toEqual([]);
      expect(Array.isArray(history)).toBe(true);
    });

    it("should return messages ordered by creation time", () => {
      const mockDb = createMockDatabase();

      dbModule.initializeDatabase(mockDb as unknown as Database);

      const chatId = "ordered-test-chat";
      const messagesInOrder: ChatMessage[] = [
        { role: "user", content: "First message" },
        { role: "assistant", content: "Second message" },
        { role: "user", content: "Third message" },
      ];

      // Save messages in order
      messagesInOrder.forEach((msg) => {
        dbModule.saveChatMessage(mockDb as unknown as Database, chatId, msg);
      });

      const history = dbModule.getChatHistory(mockDb as unknown as Database, chatId);

      expect(history).toHaveLength(3);
      expect(history[0]?.content).toBe("First message");
      expect(history[1]?.content).toBe("Second message");
      expect(history[2]?.content).toBe("Third message");
    });
  });

  describe("Chat Message Saving", () => {
    it("should save user message to database", () => {
      const mockDb = createMockDatabase();

      dbModule.initializeDatabase(mockDb as unknown as Database);

      const chatId = "save-user-test";
      const message: ChatMessage = { role: "user", content: "Test user message" };

      dbModule.saveChatMessage(mockDb as unknown as Database, chatId, message);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR IGNORE INTO chats"),
      );
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO messages"));
    });

    it("should save assistant message to database", () => {
      const mockDb = createMockDatabase();

      dbModule.initializeDatabase(mockDb as unknown as Database);

      const chatId = "save-assistant-test";
      const message: ChatMessage = { role: "assistant", content: "Test assistant response" };

      dbModule.saveChatMessage(mockDb as unknown as Database, chatId, message);

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR IGNORE INTO chats"),
      );
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO messages"));
    });

    it("should create chat record if it doesn't exist when saving message", () => {
      const mockDb = createMockDatabase();

      dbModule.initializeDatabase(mockDb as unknown as Database);

      const chatId = "new-chat-test";
      const message: ChatMessage = { role: "user", content: "First message in new chat" };

      // Before saving, chat should not exist
      let history = dbModule.getChatHistory(mockDb as unknown as Database, chatId);
      expect(history).toEqual([]);

      // Save message (should create chat)
      dbModule.saveChatMessage(mockDb as unknown as Database, chatId, message);

      // After saving, chat should exist with the message
      history = dbModule.getChatHistory(mockDb as unknown as Database, chatId);
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(message);
    });

    it("should prevent duplicate chat creation", () => {
      const mockDb = createMockDatabase();

      dbModule.initializeDatabase(mockDb as unknown as Database);

      const chatId = "duplicate-test";
      const message1: ChatMessage = { role: "user", content: "First message" };
      const message2: ChatMessage = { role: "assistant", content: "Response" };

      // Save two messages to the same chat
      dbModule.saveChatMessage(mockDb as unknown as Database, chatId, message1);
      dbModule.saveChatMessage(mockDb as unknown as Database, chatId, message2);

      // Should have called INSERT OR IGNORE twice but should only create chat once
      const prepareCalls = (mockDb.prepare as any).mock.calls;
      const insertOrIgnoreCalls = prepareCalls.filter((call: any) =>
        call[0]?.includes("INSERT OR IGNORE INTO chats"),
      );

      expect(insertOrIgnoreCalls).toHaveLength(2);
    });
  });

  describe("Edge Cases", () => {
    it("should handle special characters in message content", () => {
      const mockDb = createMockDatabase();

      dbModule.initializeDatabase(mockDb as unknown as Database);

      const chatId = "special-chars-test";
      const messageWithSpecialChars: ChatMessage = {
        role: "user",
        content: "Message with 'quotes', \"double quotes\", and \n newlines",
      };

      dbModule.saveChatMessage(mockDb as unknown as Database, chatId, messageWithSpecialChars);
      const history = dbModule.getChatHistory(mockDb as unknown as Database, chatId);

      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(messageWithSpecialChars);
    });

    it("should handle empty message content", () => {
      const mockDb = createMockDatabase();

      dbModule.initializeDatabase(mockDb as unknown as Database);

      const chatId = "empty-content-test";
      const emptyMessage: ChatMessage = { role: "user", content: "" };

      dbModule.saveChatMessage(mockDb as unknown as Database, chatId, emptyMessage);
      const history = dbModule.getChatHistory(mockDb as unknown as Database, chatId);

      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(emptyMessage);
    });
  });
});
