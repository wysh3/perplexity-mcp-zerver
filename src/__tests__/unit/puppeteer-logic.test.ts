import { describe, expect, it } from "vitest";

describe("Puppeteer Logic Utilities", () => {
  describe("Error Analysis Functions", () => {
    it("should detect timeout errors", async () => {
      const { analyzeError } = await import("../../utils/puppeteer-logic.js");

      const timeoutError = new Error("Navigation timeout of 30000 ms exceeded");
      const analysis = analyzeError(timeoutError);

      expect(analysis.isTimeout).toBe(true);
    });

    it("should detect navigation errors", async () => {
      const { analyzeError } = await import("../../utils/puppeteer-logic.js");

      const navError = new Error("net::ERR_NAME_NOT_RESOLVED");
      const analysis = analyzeError(navError);

      expect(analysis.isConnection).toBe(true);
    });

    it("should detect connection errors", async () => {
      const { analyzeError } = await import("../../utils/puppeteer-logic.js");

      const connError = new Error("net::ERR_CONNECTION_REFUSED");
      const analysis = analyzeError(connError);

      expect(analysis.isConnection).toBe(true);
    });

    it("should detect detached frame errors", async () => {
      const { analyzeError } = await import("../../utils/puppeteer-logic.js");

      const frameError = new Error("Execution context was destroyed, detached frame");
      const analysis = analyzeError(frameError);

      expect(analysis.isDetachedFrame).toBe(true);
    });

    it("should detect CAPTCHA errors", async () => {
      const { analyzeError } = await import("../../utils/puppeteer-logic.js");

      const captchaError = new Error("CAPTCHA challenge detected");
      const analysis = analyzeError(captchaError);

      expect(analysis.isCaptcha).toBe(true);
    });

    it("should handle string errors", async () => {
      const { analyzeError } = await import("../../utils/puppeteer-logic.js");

      const analysis = analyzeError("Random error message");

      // Should have all boolean properties
      expect(typeof analysis.isTimeout).toBe("boolean");
      expect(typeof analysis.isNavigation).toBe("boolean");
      expect(typeof analysis.isConnection).toBe("boolean");
      expect(typeof analysis.isDetachedFrame).toBe("boolean");
      expect(typeof analysis.isCaptcha).toBe("boolean");
    });
  });

  describe("Recovery Level Determination", () => {
    it("should determine level 1 recovery for minor errors", async () => {
      const { determineRecoveryLevel } = await import("../../utils/puppeteer-logic.js");

      const error = new Error("Minor error");
      const context = {
        hasValidPage: true,
        hasBrowser: true,
        isBrowserConnected: true,
        operationCount: 0,
        consecutiveTimeouts: 0,
        consecutiveNavigationErrors: 0,
      };
      const level = determineRecoveryLevel(error, context);

      expect(level).toBe(1);
    });

    it("should determine level 2 recovery for page issues", async () => {
      const { determineRecoveryLevel } = await import("../../utils/puppeteer-logic.js");

      const error = new Error("Page error");
      const context = {
        hasValidPage: false,
        hasBrowser: true,
        isBrowserConnected: true,
        operationCount: 0,
        consecutiveTimeouts: 0,
        consecutiveNavigationErrors: 0,
      };
      const level = determineRecoveryLevel(error, context);

      expect(level).toBe(2);
    });

    it("should determine level 3 recovery for critical errors", async () => {
      const { determineRecoveryLevel } = await import("../../utils/puppeteer-logic.js");

      const error = new Error("Frame detached error");
      const level = determineRecoveryLevel(error);

      expect(level).toBe(3);
    });

    it("should determine recovery level based on context", async () => {
      const { determineRecoveryLevel } = await import("../../utils/puppeteer-logic.js");

      const context = {
        hasValidPage: false,
        hasBrowser: true,
        isBrowserConnected: true,
        operationCount: 5,
        consecutiveTimeouts: 0,
        consecutiveNavigationErrors: 0,
      };

      const level = determineRecoveryLevel(undefined, context);

      // Should determine based on context when no error provided
      expect(typeof level).toBe("number");
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(3);
    });
  });

  describe("Retry Delay Calculation", () => {
    it("should calculate basic retry delay", async () => {
      const { calculateRetryDelay } = await import("../../utils/puppeteer-logic.js");

      const errorAnalysis = {
        isTimeout: false,
        isNavigation: false,
        isConnection: false,
        isDetachedFrame: false,
        isCaptcha: false,
        consecutiveTimeouts: 0,
        consecutiveNavigationErrors: 0,
      };

      const delay = calculateRetryDelay(1, errorAnalysis);

      expect(typeof delay).toBe("number");
      expect(delay).toBeGreaterThan(0);
    });

    it("should calculate increased delay for consecutive timeouts", async () => {
      const { calculateRetryDelay } = await import("../../utils/puppeteer-logic.js");

      const errorAnalysis1 = {
        isTimeout: false,
        isNavigation: false,
        isConnection: false,
        isDetachedFrame: false,
        isCaptcha: false,
        consecutiveTimeouts: 0,
        consecutiveNavigationErrors: 0,
      };

      const errorAnalysis2 = {
        isTimeout: true,
        isNavigation: false,
        isConnection: false,
        isDetachedFrame: false,
        isCaptcha: false,
        consecutiveTimeouts: 1,
        consecutiveNavigationErrors: 0,
      };

      const delay1 = calculateRetryDelay(1, errorAnalysis1);
      const delay2 = calculateRetryDelay(1, errorAnalysis2);

      expect(delay2).toBeGreaterThan(delay1);
    });

    it("should increase delay with attempt number", async () => {
      const { calculateRetryDelay } = await import("../../utils/puppeteer-logic.js");

      const errorAnalysis = {
        isTimeout: false,
        isNavigation: false,
        isConnection: false,
        isDetachedFrame: false,
        isCaptcha: false,
        consecutiveTimeouts: 0,
        consecutiveNavigationErrors: 0,
      };

      const delay1 = calculateRetryDelay(1, errorAnalysis);
      const delay3 = calculateRetryDelay(3, errorAnalysis);

      expect(delay3).toBeGreaterThan(delay1);
    });
  });

  describe("Browser Argument Generation", () => {
    it("should generate browser arguments with user agent", async () => {
      const { generateBrowserArgs } = await import("../../utils/puppeteer-logic.js");

      const userAgent = "test-user-agent";
      const args = generateBrowserArgs(userAgent);

      expect(Array.isArray(args)).toBe(true);
      expect(args.length).toBeGreaterThan(0);
      expect(args).toContain(`--user-agent=${userAgent}`);
    });

    it("should include essential browser arguments", async () => {
      const { generateBrowserArgs } = await import("../../utils/puppeteer-logic.js");

      const args = generateBrowserArgs("test-agent");

      expect(args).toContain("--no-sandbox");
      expect(args).toContain("--disable-setuid-sandbox");
      expect(args).toContain("--disable-dev-shm-usage");
    });
  });

  describe("URL Validation", () => {
    it("should validate navigation URLs", async () => {
      const { validateNavigationUrl } = await import("../../utils/puppeteer-logic.js");

      expect(validateNavigationUrl("https://www.perplexity.ai/")).toBe(true);
      expect(validateNavigationUrl("https://perplexity.ai/")).toBe(true);
      expect(validateNavigationUrl("http://example.com")).toBe(true);
    });

    it("should reject invalid URLs", async () => {
      const { validateNavigationUrl } = await import("../../utils/puppeteer-logic.js");

      expect(validateNavigationUrl("")).toBe(false);
      expect(validateNavigationUrl("invalid-url")).toBe(false);
      expect(validateNavigationUrl("javascript:alert(1)")).toBe(false);
    });

    it("should validate navigation failures", async () => {
      const { isNavigationFailure } = await import("../../utils/puppeteer-logic.js");

      expect(isNavigationFailure("https://www.perplexity.ai/", "https://www.perplexity.ai/")).toBe(
        false,
      );
      expect(isNavigationFailure("https://www.perplexity.ai/", "https://wrong-domain.com/")).toBe(
        true,
      );
    });
  });

  describe("Selector Functions", () => {
    it("should provide search input selectors", async () => {
      const { getSearchInputSelectors } = await import("../../utils/puppeteer-logic.js");

      const selectors = getSearchInputSelectors();

      expect(Array.isArray(selectors)).toBe(true);
      expect(selectors.length).toBeGreaterThan(0);
      expect(typeof selectors[0]).toBe("string");
    });

    it("should provide CAPTCHA selectors", async () => {
      const { getCaptchaSelectors } = await import("../../utils/puppeteer-logic.js");

      const selectors = getCaptchaSelectors();

      expect(Array.isArray(selectors)).toBe(true);
      expect(typeof selectors[0]).toBe("string");
    });
  });
});
