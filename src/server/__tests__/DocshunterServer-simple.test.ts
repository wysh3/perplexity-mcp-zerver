/**
 * Simple tests for DocshunterServer utility methods
 * Focus on pure functions and methods that don't require browser automation
 */
import { describe, expect, it } from "vitest";

// Create a test server class that exposes private methods for testing
class TestableDocshunterServer {
  // Copy the private method implementations here for testing
  private splitCodeIntoChunks(code: string, maxLength: number): string[] {
    if (code.length <= maxLength) return [code];

    // Try to split at logical points (newlines, semicolons)
    const chunks: string[] = [];
    let currentChunk = "";

    const lines = code.split("\n");
    for (const line of lines) {
      if (currentChunk.length + line.length > maxLength) {
        chunks.push(currentChunk);
        currentChunk = `${line}\n`;
      } else {
        currentChunk += `${line}\n`;
      }
    }

    if (currentChunk) chunks.push(currentChunk);
    return chunks;
  }

  private determineRecoveryLevel(error?: Error): number {
    if (!error) return 1;

    const errorMessage = error.message.toLowerCase();

    // Level 3: Critical errors requiring full browser restart
    if (
      errorMessage.includes("detached") ||
      errorMessage.includes("crashed") ||
      errorMessage.includes("disconnected") ||
      errorMessage.includes("protocol error")
    ) {
      return 3;
    }

    // Level 2: Navigation/page errors requiring page restart
    if (
      errorMessage.includes("navigation") ||
      errorMessage.includes("timeout") ||
      errorMessage.includes("net::err")
    ) {
      return 2;
    }

    // Level 1: Minor errors requiring simple recovery
    return 1;
  }

  // Expose private methods for testing
  public testSplitCodeIntoChunks(code: string, maxLength: number): string[] {
    return this.splitCodeIntoChunks(code, maxLength);
  }

  public testDetermineRecoveryLevel(error?: Error): number {
    return this.determineRecoveryLevel(error);
  }
}

describe("DocshunterServer Utilities", () => {
  let testServer: TestableDocshunterServer;

  beforeEach(() => {
    testServer = new TestableDocshunterServer();
  });

  describe("splitCodeIntoChunks", () => {
    it("should return single chunk for short code", () => {
      const shortCode = "console.log('hello');";
      const chunks = testServer.testSplitCodeIntoChunks(shortCode, 1000);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(shortCode);
    });

    it("should split long code into multiple chunks", () => {
      const longCode = Array(100).fill("console.log('line');").join("\n");
      const chunks = testServer.testSplitCodeIntoChunks(longCode, 100);

      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk should be reasonably sized
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(200); // Allow some buffer for line breaks
      }
    });

    it("should preserve line breaks when splitting", () => {
      const code = "line1\nline2\nline3\nline4\n";
      const chunks = testServer.testSplitCodeIntoChunks(code, 10);

      // Each chunk should end with newline (except possibly empty chunks)
      for (const chunk of chunks.filter((chunk) => chunk.length > 0)) {
        expect(chunk.endsWith("\n")).toBe(true);
      }
    });

    it("should handle empty code", () => {
      const chunks = testServer.testSplitCodeIntoChunks("", 100);
      expect(chunks).toEqual([""]);
    });

    it("should handle single line code", () => {
      const singleLine = "const x = 1;";
      const chunks = testServer.testSplitCodeIntoChunks(singleLine, 5);

      // When the line is longer than maxLength, it gets split
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      // The original line should be preserved across chunks
      // Security: Use trimEnd() instead of regex to avoid potential backtracking issues
      const rejoined = chunks.join("").trimEnd();
      expect(rejoined).toBe(singleLine);
    });
  });

  describe("determineRecoveryLevel", () => {
    it("should return level 1 for no error", () => {
      const level = testServer.testDetermineRecoveryLevel();
      expect(level).toBe(1);
    });

    it("should return level 3 for critical errors", () => {
      const criticalErrors = [
        new Error("Frame detached"),
        new Error("Browser crashed"),
        new Error("Browser disconnected"),
        new Error("Protocol error occurred"),
        new Error("DETACHED frame issue"), // Test case insensitivity
      ];

      for (const error of criticalErrors) {
        expect(testServer.testDetermineRecoveryLevel(error)).toBe(3);
      }
    });

    it("should return level 2 for navigation/timeout errors", () => {
      const navigationErrors = [
        new Error("Navigation failed"),
        new Error("Timeout occurred"),
        new Error("net::ERR_CONNECTION_FAILED"),
        new Error("TIMEOUT while loading"), // Test case insensitivity
        new Error("Navigation error detected"),
      ];

      for (const error of navigationErrors) {
        expect(testServer.testDetermineRecoveryLevel(error)).toBe(2);
      }
    });

    it("should return level 1 for minor errors", () => {
      const minorErrors = [
        new Error("Some minor issue"),
        new Error("Element not found"),
        new Error("Click failed"),
        new Error("Selector failed"),
      ];

      for (const error of minorErrors) {
        expect(testServer.testDetermineRecoveryLevel(error)).toBe(1);
      }
    });

    it("should handle complex error messages", () => {
      const complexError = new Error("Multiple issues: navigation failed and timeout occurred");
      // Should match the first condition (navigation) and return level 2
      expect(testServer.testDetermineRecoveryLevel(complexError)).toBe(2);
    });

    it("should handle edge cases", () => {
      // Error with empty message
      const emptyError = new Error("");
      expect(testServer.testDetermineRecoveryLevel(emptyError)).toBe(1);

      // Error with whitespace only
      const whitespaceError = new Error("   ");
      expect(testServer.testDetermineRecoveryLevel(whitespaceError)).toBe(1);
    });
  });
});
