import { describe, expect, it, vi } from "vitest";
import type { LogLevel } from "../../utils/logging.js";

describe("Logging Utilities", () => {
  // Mock console.error to capture log output
  const mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    mockConsoleError.mockRestore();
  });

  describe("Core log function", () => {
    it("should export logging functions", async () => {
      const logging = await import("../../utils/logging.js");

      expect(logging.log).toBeDefined();
      expect(typeof logging.log).toBe("function");
      expect(logging.logInfo).toBeDefined();
      expect(typeof logging.logInfo).toBe("function");
      expect(logging.logWarn).toBeDefined();
      expect(typeof logging.logWarn).toBe("function");
      expect(logging.logError).toBeDefined();
      expect(typeof logging.logError).toBe("function");
    });

    it("should define LogLevel type", async () => {
      // This is a type-only test, so we just verify it compiles
      const level: LogLevel = "info";
      expect(["info", "warn", "error"]).toContain(level);
    });

    it("should log error messages to console.error", async () => {
      const { log } = await import("../../utils/logging.js");

      const testMessage = "Test error message";
      log("error", testMessage);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[ERROR\] Test error message$/,
        ),
      );
    });

    it("should log error messages with metadata to console.error", async () => {
      const { log } = await import("../../utils/logging.js");

      const testMessage = "Test error with metadata";
      const testMeta = { userId: "123", action: "login" };
      log("error", testMessage, testMeta);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[ERROR\] Test error with metadata$/,
        ),
        testMeta,
      );
    });

    it("should log info messages to console.error", async () => {
      const { log } = await import("../../utils/logging.js");

      const testMessage = "Test info message";
      log("info", testMessage);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] Test info message$/,
        ),
      );
    });

    it("should log info messages with metadata to console.error", async () => {
      const { log } = await import("../../utils/logging.js");

      const testMessage = "Test info with metadata";
      const testMeta = { processId: "abc", status: "running" };
      log("info", testMessage, testMeta);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] Test info with metadata$/,
        ),
        testMeta,
      );
    });

    it("should filter out most warn messages", async () => {
      const { log } = await import("../../utils/logging.js");

      const testMessage = "Regular warning message";
      log("warn", testMessage);

      expect(mockConsoleError).not.toHaveBeenCalled();
    });

    it("should log warn messages containing 'CAPTCHA'", async () => {
      const { log } = await import("../../utils/logging.js");

      const testMessage = "CAPTCHA detected during operation";
      log("warn", testMessage);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[WARN\] CAPTCHA detected during operation$/,
        ),
      );
    });

    it("should log warn messages containing 'failed'", async () => {
      const { log } = await import("../../utils/logging.js");

      const testMessage = "Operation failed unexpectedly";
      log("warn", testMessage);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[WARN\] Operation failed unexpectedly$/,
        ),
      );
    });

    it("should log warn messages with metadata when they contain 'CAPTCHA' or 'failed'", async () => {
      const { log } = await import("../../utils/logging.js");

      const testMessage = "CAPTCHA challenge failed";
      const testMeta = { url: "https://example.com", attempt: 3 };
      log("warn", testMessage, testMeta);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[WARN\] CAPTCHA challenge failed$/,
        ),
        testMeta,
      );
    });
  });

  describe("Convenience logging functions", () => {
    it("should log info messages using logInfo helper", async () => {
      const { logInfo } = await import("../../utils/logging.js");

      const testMessage = "Test info via helper";
      logInfo(testMessage);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] Test info via helper$/,
        ),
      );
    });

    it("should log warn messages using logWarn helper", async () => {
      const { logWarn } = await import("../../utils/logging.js");

      const testMessage = "CAPTCHA warning via helper";
      logWarn(testMessage);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[WARN\] CAPTCHA warning via helper$/,
        ),
      );
    });

    it("should log error messages using logError helper", async () => {
      const { logError } = await import("../../utils/logging.js");

      const testMessage = "Test error via helper";
      logError(testMessage);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[ERROR\] Test error via helper$/,
        ),
      );
    });

    it("should support metadata in convenience functions", async () => {
      const { logInfo, logWarn, logError } = await import("../../utils/logging.js");

      const testMeta = { component: "test-suite", version: "1.0" };

      logInfo("Info with metadata", testMeta);
      logWarn("CAPTCHA with metadata", testMeta);
      logError("Error with metadata", testMeta);

      expect(mockConsoleError).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] Info with metadata$/,
        ),
        testMeta,
      );

      expect(mockConsoleError).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[WARN\] CAPTCHA with metadata$/,
        ),
        testMeta,
      );

      expect(mockConsoleError).toHaveBeenNthCalledWith(
        3,
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[ERROR\] Error with metadata$/,
        ),
        testMeta,
      );
    });
  });

  describe("Timestamp formatting", () => {
    it("should include ISO formatted timestamps in log messages", async () => {
      const { log } = await import("../../utils/logging.js");

      const before = new Date().toISOString();
      log("info", "Timestamp test");
      const after = new Date().toISOString();

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] Timestamp test$/,
        ),
      );

      // Verify timestamp is between before and after
      const callArg = mockConsoleError.mock.calls[0]?.[0] as string;
      const timestampStr = callArg?.match(/\[(.*?)\]/)?.[1];
      if (timestampStr) {
        const timestamp = new Date(timestampStr);
        expect(timestamp.getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
        expect(timestamp.getTime()).toBeLessThanOrEqual(new Date(after).getTime());
      }
    });

    it("should uppercase log levels in output", async () => {
      const { log } = await import("../../utils/logging.js");

      log("info", "Level test");
      log("warn", "CAPTCHA level test");
      log("error", "Level test");

      expect(mockConsoleError).toHaveBeenNthCalledWith(1, expect.stringContaining("[INFO]"));

      expect(mockConsoleError).toHaveBeenNthCalledWith(2, expect.stringContaining("[WARN]"));

      expect(mockConsoleError).toHaveBeenNthCalledWith(3, expect.stringContaining("[ERROR]"));
    });
  });

  describe("Edge cases", () => {
    it("should handle empty messages", async () => {
      const { log } = await import("../../utils/logging.js");

      log("info", "");

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] $/),
      );
    });

    it("should handle special characters in messages", async () => {
      const { log } = await import("../../utils/logging.js");

      const specialMessage = "Message with 'quotes', \"double quotes\", \n newlines, and \t tabs";
      log("error", specialMessage);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[ERROR\] Message with 'quotes', "double quotes", \n newlines, and \t tabs$/,
        ),
      );
    });

    it("should handle empty metadata objects", async () => {
      const { log } = await import("../../utils/logging.js");

      log("info", "Empty metadata test", {});

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] Empty metadata test$/,
        ),
      );
    });

    it("should handle undefined metadata", async () => {
      const { log } = await import("../../utils/logging.js");

      log("info", "Undefined metadata test", undefined);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] Undefined metadata test$/,
        ),
      );
    });
  });
});
