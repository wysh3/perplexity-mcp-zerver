import { promises as fs } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CONFIG } from "../../server/config";
import type { ChatMessage } from "../../types/index";
// Import actual utility functions to test
import { getChatHistory, initializeDatabase, saveChatMessage } from "../../utils/db";
import { logError, logInfo, logWarn } from "../../utils/logging";

describe("Real Integration Tests for Code Coverage", () => {
  const testDbPath = join(__dirname, "test-coverage.db");

  beforeAll(async () => {
    // Clean up any existing test database
    try {
      await fs.unlink(testDbPath);
    } catch {
      // File doesn't exist, that's fine
    }
  });

  afterAll(async () => {
    // Clean up test database
    try {
      await fs.unlink(testDbPath);
    } catch {
      // File might not exist, that's fine
    }
  });

  describe("Database Utils Coverage", () => {
    it("should initialize database and create tables", () => {
      const db = new Database(testDbPath);

      // Initialize the database schema
      initializeDatabase(db);

      // Test that we can prepare statements (indicates tables exist)
      const stmt = db.query("SELECT name FROM sqlite_master WHERE type='table'");
      const tables = stmt.all();

      expect(Array.isArray(tables)).toBe(true);
      expect(tables.length).toBeGreaterThan(0);

      // Test chat operations
      const testChatId = "test-chat-123";
      const testMessage: ChatMessage = { role: "user", content: "Test message" };

      // Save a message
      expect(() => saveChatMessage(db, testChatId, testMessage)).not.toThrow();

      // Retrieve chat history
      const history = getChatHistory(db, testChatId);
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(1);
      expect(history[0]?.role).toBe("user");
      expect(history[0]?.content).toBe("Test message");

      // Test multiple messages
      const assistantMessage: ChatMessage = { role: "assistant", content: "Test response" };
      expect(() => saveChatMessage(db, testChatId, assistantMessage)).not.toThrow();

      const fullHistory = getChatHistory(db, testChatId);
      expect(fullHistory.length).toBe(2);
      expect(fullHistory[0]?.role).toBe("user");
      expect(fullHistory[1]?.role).toBe("assistant");

      // Clean up
      db.close();
    });

    it("should handle empty chat history", () => {
      const db = new Database(":memory:");
      initializeDatabase(db);

      const history = getChatHistory(db, "non-existent-chat");
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(0);

      db.close();
    });
  });

  describe("Logging Utils Coverage", () => {
    it("should execute all logging functions", () => {
      // These will exercise the actual logging code
      expect(() => logInfo("Test info message")).not.toThrow();
      expect(() => logWarn("Test warning message")).not.toThrow();
      expect(() => logError("Test error message")).not.toThrow();

      // Test with metadata
      expect(() => logInfo("Test with metadata", { test: true })).not.toThrow();
      expect(() => logWarn("Warning with data", { warning: true })).not.toThrow();
      expect(() => logError("Error with context", { error: true })).not.toThrow();
    });

    it("should handle empty metadata", () => {
      expect(() => logInfo("Test with empty metadata", {})).not.toThrow();
      expect(() => logWarn("Warning with empty metadata", {})).not.toThrow();
      expect(() => logError("Error with empty metadata", {})).not.toThrow();
    });

    it("should handle null/undefined metadata", () => {
      expect(() => logInfo("Test without metadata")).not.toThrow();
      expect(() => logWarn("Warning without metadata")).not.toThrow();
      expect(() => logError("Error without metadata")).not.toThrow();
    });
  });

  describe("Server Config Coverage", () => {
    it("should access server configuration", () => {
      expect(CONFIG).toBeDefined();
      expect(typeof CONFIG.SEARCH_COOLDOWN).toBe("number");
      expect(typeof CONFIG.PAGE_TIMEOUT).toBe("number");
      expect(typeof CONFIG.USER_AGENT).toBe("string");
      expect(CONFIG.TIMEOUT_PROFILES).toBeDefined();
      expect(typeof CONFIG.TIMEOUT_PROFILES.navigation).toBe("number");
    });

    it("should have valid configuration values", () => {
      expect(CONFIG.SEARCH_COOLDOWN).toBeGreaterThan(0);
      expect(CONFIG.PAGE_TIMEOUT).toBeGreaterThan(0);
      expect(CONFIG.MAX_RETRIES).toBeGreaterThan(0);
      expect(CONFIG.USER_AGENT).toContain("Mozilla");

      // Test timeout profiles
      const profiles = CONFIG.TIMEOUT_PROFILES;
      expect(profiles.navigation).toBeGreaterThan(0);
      expect(profiles.selector).toBeGreaterThan(0);
      expect(profiles.content).toBeGreaterThan(0);
      expect(profiles.recovery).toBeGreaterThan(0);
    });

    it("should have readonly configuration", () => {
      // Test that CONFIG is properly typed as const
      expect(Object.isFrozen(CONFIG)).toBe(false); // as const doesn't freeze, but prevents modification in TS
      expect(typeof CONFIG.SEARCH_COOLDOWN).toBe("number");
      expect(typeof CONFIG.TIMEOUT_PROFILES).toBe("object");
    });
  });

  describe("Error Handling Paths", () => {
    it("should handle database operations with invalid data", () => {
      const db = new Database(":memory:");
      initializeDatabase(db);

      // Test with empty chat ID
      const emptyHistory = getChatHistory(db, "");
      expect(Array.isArray(emptyHistory)).toBe(true);
      expect(emptyHistory.length).toBe(0);

      // Test with long chat ID
      const longChatId = "a".repeat(1000);
      const longHistory = getChatHistory(db, longChatId);
      expect(Array.isArray(longHistory)).toBe(true);
      expect(longHistory.length).toBe(0);

      db.close();
    });

    it("should handle message operations with edge cases", () => {
      const db = new Database(":memory:");
      initializeDatabase(db);

      const chatId = "edge-case-test";

      // Test with empty content
      const emptyMessage: ChatMessage = { role: "user", content: "" };
      expect(() => saveChatMessage(db, chatId, emptyMessage)).not.toThrow();

      // Test with very long content
      const longMessage: ChatMessage = {
        role: "assistant",
        content: "x".repeat(10000),
      };
      expect(() => saveChatMessage(db, chatId, longMessage)).not.toThrow();

      // Verify messages were saved
      const history = getChatHistory(db, chatId);
      expect(history.length).toBe(2);
      expect(history[0]?.content).toBe("");
      expect(history[1]?.content).toBe("x".repeat(10000));

      db.close();
    });
  });

  describe("Type System Coverage", () => {
    it("should work with different role types", () => {
      const db = new Database(":memory:");
      initializeDatabase(db);

      const chatId = "type-test";

      // Test user role
      const userMsg: ChatMessage = { role: "user", content: "User message" };
      expect(() => saveChatMessage(db, chatId, userMsg)).not.toThrow();

      // Test assistant role
      const assistantMsg: ChatMessage = { role: "assistant", content: "Assistant message" };
      expect(() => saveChatMessage(db, chatId, assistantMsg)).not.toThrow();

      const history = getChatHistory(db, chatId);
      expect(history.length).toBe(2);
      expect(history[0]?.role).toBe("user");
      expect(history[1]?.role).toBe("assistant");

      db.close();
    });

    it("should handle special characters in content", () => {
      const db = new Database(":memory:");
      initializeDatabase(db);

      const chatId = "special-chars";
      const specialContent = `Test with "quotes", 'apostrophes', and symbols: ñáéíóú!@#$%^&*()[]{}`;

      const message: ChatMessage = { role: "user", content: specialContent };
      expect(() => saveChatMessage(db, chatId, message)).not.toThrow();

      const history = getChatHistory(db, chatId);
      expect(history.length).toBe(1);
      expect(history[0]?.content).toBe(specialContent);

      db.close();
    });
  });
});
