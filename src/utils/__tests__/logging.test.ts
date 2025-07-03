import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type LogLevel, log, logError, logInfo, logWarn } from "../logging";

describe("Logging Utility", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Mock console.error to capture log output
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  describe("log function", () => {
    it("should log info messages with timestamp", () => {
      const message = "Test info message";
      log("info", message);

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const logCall = consoleErrorSpy.mock.calls[0]?.[0] as string;
      expect(logCall).toContain("[INFO]");
      expect(logCall).toContain(message);
      expect(logCall).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });

    it("should log warn messages with timestamp", () => {
      const message = "Test warning message";
      log("warn", message);
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const logCall = consoleErrorSpy.mock.calls[0]?.[0] as string;
      expect(logCall).toContain("[WARN]");
      expect(logCall).toContain(message);
    });

    it("should log error messages with timestamp", () => {
      const message = "Test error message";
      log("error", message);

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const logCall = consoleErrorSpy.mock.calls[0]?.[0] as string;
      expect(logCall).toContain("[ERROR]");
      expect(logCall).toContain(message);
    });

    it("should include metadata when provided", () => {
      const message = "Test message with metadata";
      const metadata = { userId: "123", action: "test" };
      log("info", message, metadata);

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(message), metadata);
    });

    it("should not include metadata parameter when not provided", () => {
      const message = "Test message without metadata";
      log("info", message);

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(message));
      // Should be called with only one argument (the formatted message)
      expect(consoleErrorSpy.mock.calls[0]).toHaveLength(1);
    });

    it("should handle empty metadata object", () => {
      const message = "Test message with empty metadata";
      const metadata = {};
      log("info", message, metadata);

      // Should not include metadata when it's empty
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(message));
      expect(consoleErrorSpy.mock.calls[0]).toHaveLength(1);
    });
  });

  describe("convenience functions", () => {
    it("should call log with info level", () => {
      const message = "Info convenience test";
      logInfo(message);

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const logCall = consoleErrorSpy.mock.calls[0]?.[0] as string;
      expect(logCall).toContain("[INFO]");
      expect(logCall).toContain(message);
    });

    it("should call log with warn level", () => {
      const message = "Warn convenience test";
      logWarn(message);

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const logCall = consoleErrorSpy.mock.calls[0]?.[0] as string;
      expect(logCall).toContain("[WARN]");
      expect(logCall).toContain(message);
    });

    it("should call log with error level", () => {
      const message = "Error convenience test";
      logError(message);

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const logCall = consoleErrorSpy.mock.calls[0]?.[0] as string;
      expect(logCall).toContain("[ERROR]");
      expect(logCall).toContain(message);
    });

    it("should pass metadata through convenience functions", () => {
      const message = "Test with metadata";
      const metadata = { test: true };

      logInfo(message, metadata);

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(message), metadata);
    });
  });

  describe("log level types", () => {
    it("should accept valid log levels", () => {
      const validLevels: LogLevel[] = ["info", "warn", "error"];

      for (const level of validLevels) {
        log(level, `Test ${level} message`);
      }

      expect(consoleErrorSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe("timestamp format", () => {
    it("should use ISO string format for timestamps", () => {
      log("info", "Timestamp test");

      const logCall = consoleErrorSpy.mock.calls[0]?.[0] as string;
      const timestampMatch = logCall.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/);

      expect(timestampMatch).toBeTruthy();
      if (timestampMatch?.[1]) {
        const timestamp = timestampMatch[1];
        expect(() => new Date(timestamp)).not.toThrow();
        expect(new Date(timestamp).toISOString()).toBe(timestamp);
      }
    });
  });
});
