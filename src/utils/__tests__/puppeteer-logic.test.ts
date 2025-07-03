/**
 * Tests for pure business logic extracted from puppeteer utilities
 * No mocking required - these are pure functions!
 */
import { describe, expect, it } from "vitest";
import type { ErrorAnalysis, RecoveryContext } from "../../types/index.js";
import {
  analyzeError,
  calculateRetryDelay,
  determineRecoveryLevel,
  generateBrowserArgs,
  getCaptchaSelectors,
  getSearchInputSelectors,
  isNavigationFailure,
  validateNavigationUrl,
} from "../puppeteer-logic.js";

describe("determineRecoveryLevel", () => {
  it("should return 1 for no error", () => {
    expect(determineRecoveryLevel()).toBe(1);
  });

  it("should return 3 for critical frame errors", () => {
    const error = new Error("Frame detached");
    expect(determineRecoveryLevel(error)).toBe(3);
  });

  it("should return 3 for session closed errors", () => {
    const error = new Error("Session closed");
    expect(determineRecoveryLevel(error)).toBe(3);
  });

  it("should return 3 for protocol errors", () => {
    const error = new Error("Protocol error occurred");
    expect(determineRecoveryLevel(error)).toBe(3);
  });

  it("should return 3 when browser is not connected", () => {
    const error = new Error("Some error");
    const context: RecoveryContext = {
      hasValidPage: true,
      hasBrowser: true,
      isBrowserConnected: false,
      operationCount: 1,
    };
    expect(determineRecoveryLevel(error, context)).toBe(3);
  });

  it("should return 3 when browser is missing", () => {
    const error = new Error("Some error");
    const context: RecoveryContext = {
      hasValidPage: true,
      hasBrowser: false,
      isBrowserConnected: true,
      operationCount: 1,
    };
    expect(determineRecoveryLevel(error, context)).toBe(3);
  });

  it("should return 2 when page is invalid", () => {
    const error = new Error("Some error");
    const context: RecoveryContext = {
      hasValidPage: false,
      hasBrowser: true,
      isBrowserConnected: true,
      operationCount: 1,
    };
    expect(determineRecoveryLevel(error, context)).toBe(2);
  });

  it("should return 1 for normal errors with valid context", () => {
    const error = new Error("Normal error");
    const context: RecoveryContext = {
      hasValidPage: true,
      hasBrowser: true,
      isBrowserConnected: true,
      operationCount: 1,
    };
    expect(determineRecoveryLevel(error, context)).toBe(1);
  });
});

describe("analyzeError", () => {
  it("should detect timeout errors", () => {
    const result = analyzeError(new Error("Request timeout"));
    expect(result.isTimeout).toBe(true);
    expect(result.isNavigation).toBe(false);
  });

  it("should detect timed out errors", () => {
    const result = analyzeError("Operation timed out");
    expect(result.isTimeout).toBe(true);
  });

  it("should detect navigation errors", () => {
    const result = analyzeError(new Error("Navigation failed"));
    expect(result.isNavigation).toBe(true);
    expect(result.isTimeout).toBe(false);
  });

  it("should detect connection errors", () => {
    const result = analyzeError("net::ERR_CONNECTION_REFUSED");
    expect(result.isConnection).toBe(true);
  });

  it("should detect detached frame errors", () => {
    const result = analyzeError("Frame was detached");
    expect(result.isDetachedFrame).toBe(true);
  });

  it("should detect CAPTCHA errors", () => {
    const result = analyzeError("CAPTCHA challenge");
    expect(result.isCaptcha).toBe(true);
  });

  it("should handle string errors", () => {
    const result = analyzeError("timeout occurred");
    expect(result.isTimeout).toBe(true);
  });

  it("should initialize consecutive counters to 0", () => {
    const result = analyzeError("any error");
    expect(result.consecutiveTimeouts).toBe(0);
    expect(result.consecutiveNavigationErrors).toBe(0);
  });
});

describe("calculateRetryDelay", () => {
  it("should calculate delay for timeout errors", () => {
    const errorAnalysis: ErrorAnalysis = {
      isTimeout: true,
      isNavigation: false,
      isConnection: false,
      isDetachedFrame: false,
      isCaptcha: false,
      consecutiveTimeouts: 2,
      consecutiveNavigationErrors: 0,
    };

    const delay = calculateRetryDelay(1, errorAnalysis);
    expect(delay).toBeGreaterThan(15000); // 5000 * (2 + 1)
    expect(delay).toBeLessThan(35000); // Base + max jitter
  });

  it("should calculate delay for navigation errors", () => {
    const errorAnalysis: ErrorAnalysis = {
      isTimeout: false,
      isNavigation: true,
      isConnection: false,
      isDetachedFrame: false,
      isCaptcha: false,
      consecutiveTimeouts: 0,
      consecutiveNavigationErrors: 1,
    };

    const delay = calculateRetryDelay(1, errorAnalysis);
    expect(delay).toBeGreaterThan(16000); // 8000 * (1 + 1)
    expect(delay).toBeLessThan(42000); // Base + max jitter
  });

  it("should calculate delay for connection errors", () => {
    const errorAnalysis: ErrorAnalysis = {
      isTimeout: false,
      isNavigation: false,
      isConnection: true,
      isDetachedFrame: false,
      isCaptcha: false,
      consecutiveTimeouts: 0,
      consecutiveNavigationErrors: 0,
    };

    const delay = calculateRetryDelay(1, errorAnalysis);
    expect(delay).toBeGreaterThan(15000);
    expect(delay).toBeLessThan(35000);
  });

  it("should calculate exponential backoff for standard errors", () => {
    const errorAnalysis: ErrorAnalysis = {
      isTimeout: false,
      isNavigation: false,
      isConnection: false,
      isDetachedFrame: false,
      isCaptcha: false,
      consecutiveTimeouts: 0,
      consecutiveNavigationErrors: 0,
    };

    const delay1 = calculateRetryDelay(0, errorAnalysis);
    const delay2 = calculateRetryDelay(1, errorAnalysis);
    const delay3 = calculateRetryDelay(2, errorAnalysis);

    // Should increase exponentially (with jitter, so we check ranges)
    expect(delay1).toBeLessThan(5000);
    expect(delay2).toBeGreaterThan(1000);
    expect(delay2).toBeLessThan(10000);
    expect(delay3).toBeGreaterThan(3000);
  });

  it("should respect max delay", () => {
    const errorAnalysis: ErrorAnalysis = {
      isTimeout: false,
      isNavigation: false,
      isConnection: false,
      isDetachedFrame: false,
      isCaptcha: false,
      consecutiveTimeouts: 0,
      consecutiveNavigationErrors: 0,
    };

    const delay = calculateRetryDelay(10, errorAnalysis, 5000);
    expect(delay).toBeLessThan(20000); // Max delay + max jitter
  });
});

describe("generateBrowserArgs", () => {
  it("should include user agent", () => {
    const userAgent = "test-user-agent";
    const args = generateBrowserArgs(userAgent);

    expect(args).toContain(`--user-agent=${userAgent}`);
  });

  it("should include security-related flags", () => {
    const args = generateBrowserArgs("test");

    expect(args).toContain("--no-sandbox");
    expect(args).toContain("--disable-setuid-sandbox");
    expect(args).toContain("--disable-web-security");
  });

  it("should include automation detection evasion", () => {
    const args = generateBrowserArgs("test");

    expect(args).toContain("--disable-blink-features=AutomationControlled");
  });

  it("should set window size", () => {
    const args = generateBrowserArgs("test");

    expect(args).toContain("--window-size=1920,1080");
  });
});

describe("getSearchInputSelectors", () => {
  it("should return selectors in priority order", () => {
    const selectors = getSearchInputSelectors();

    expect(selectors).toHaveLength(6);
    expect(selectors[0]).toBe('textarea[placeholder*="Ask"]');
    expect(selectors[1]).toBe('textarea[placeholder*="Search"]');
    expect(selectors).toContain("textarea");
  });

  it("should include role-based selectors", () => {
    const selectors = getSearchInputSelectors();

    expect(selectors).toContain('[role="textbox"]');
  });
});

describe("getCaptchaSelectors", () => {
  it("should include common CAPTCHA selectors", () => {
    const selectors = getCaptchaSelectors();

    expect(selectors).toContain('[class*="captcha"]');
    expect(selectors).toContain('[id*="captcha"]');
    expect(selectors).toContain('iframe[src*="recaptcha"]');
    expect(selectors).toContain('iframe[src*="turnstile"]');
  });

  it("should include challenge form selectors", () => {
    const selectors = getCaptchaSelectors();

    expect(selectors).toContain("#challenge-running");
    expect(selectors).toContain("#challenge-form");
  });
});

describe("validateNavigationUrl", () => {
  it("should accept valid HTTPS URLs", () => {
    expect(validateNavigationUrl("https://example.com")).toBe(true);
  });

  it("should accept valid HTTP URLs", () => {
    expect(validateNavigationUrl("http://example.com")).toBe(true);
  });

  it("should reject invalid URLs", () => {
    expect(validateNavigationUrl("not-a-url")).toBe(false);
    expect(validateNavigationUrl("")).toBe(false);
    expect(validateNavigationUrl("ftp://example.com")).toBe(false);
  });

  it("should validate expected domain", () => {
    expect(validateNavigationUrl("https://perplexity.ai", "perplexity")).toBe(true);
    expect(validateNavigationUrl("https://google.com", "perplexity")).toBe(false);
  });

  it("should handle malformed expected domain gracefully", () => {
    expect(validateNavigationUrl("https://example.com", "example")).toBe(true);
  });
});

describe("isNavigationFailure", () => {
  it("should detect N/A URLs as failures", () => {
    expect(isNavigationFailure("N/A")).toBe(true);
    expect(isNavigationFailure("")).toBe(true);
  });

  it("should compare hostnames when expected URL provided", () => {
    expect(isNavigationFailure("https://perplexity.ai", "https://perplexity.ai/search")).toBe(
      false,
    );

    expect(isNavigationFailure("https://google.com", "https://perplexity.ai")).toBe(true);
  });

  it("should handle malformed URLs gracefully", () => {
    expect(isNavigationFailure("not-a-url", "https://example.com")).toBe(true);
    expect(isNavigationFailure("https://example.com", "not-a-url")).toBe(true);
  });

  it("should accept valid URLs without expected URL", () => {
    expect(isNavigationFailure("https://example.com")).toBe(false);
  });
});
