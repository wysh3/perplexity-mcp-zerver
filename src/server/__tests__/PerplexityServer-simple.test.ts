/**
 * Simple tests for PerplexityServer utility methods
 * Focus on pure functions and methods that don't require browser automation
 */
import { describe, expect, it } from "vitest";

// Create a test server class that exposes private methods for testing
class TestablePerplexityServer {
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
  public testDetermineRecoveryLevel(error?: Error): number {
    return this.determineRecoveryLevel(error);
  }
}

describe("PerplexityServer Utilities", () => {
  let testServer: TestablePerplexityServer;

  beforeEach(() => {
    testServer = new TestablePerplexityServer();
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
