import type { Page } from "puppeteer";
/**
 * Tests for SearchEngine module
 * Comprehensive testing to achieve high code coverage
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IBrowserManager } from "../../../types/index.js";
import { SearchEngine } from "../SearchEngine.js";

// Type for accessing private methods in tests
interface SearchEnginePrivate {
  executeSearch(page: Page, selector: string, query: string): Promise<void>;
  waitForCompleteAnswer(page: Page): Promise<string>;
  extractCompleteAnswer(page: Page): Promise<string>;
  generateErrorResponse(error: unknown): string;
}

// Mock logging
vi.mock("../../../utils/logging.js", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

// Mock config
vi.mock("../../config.js", () => ({
  CONFIG: {
    SELECTOR_TIMEOUT: 5000,
    PAGE_TIMEOUT: 180000,
    MCP_TIMEOUT_BUFFER: 60000,
    MAX_RETRIES: 10,
  },
}));

// Mock retryOperation
vi.mock("../../../utils/puppeteer.js", () => ({
  retryOperation: vi.fn().mockImplementation(async (ctx, operation) => {
    // Simply execute the operation once for testing
    return await operation();
  }),
}));

import * as logging from "../../../utils/logging.js";
const mockLogInfo = vi.mocked(logging.logInfo);
const mockLogWarn = vi.mocked(logging.logWarn);
const mockLogError = vi.mocked(logging.logError);

describe("SearchEngine", () => {
  let searchEngine: SearchEngine;
  let mockBrowserManager: IBrowserManager;
  let mockPage: Page;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock page
    mockPage = {
      evaluate: vi.fn(),
      click: vi.fn(),
      type: vi.fn(),
      waitForSelector: vi.fn(),
      screenshot: vi.fn(),
      mainFrame: vi.fn().mockReturnValue({
        isDetached: vi.fn().mockReturnValue(false),
      }),
      keyboard: {
        press: vi.fn(),
      },
    } as unknown as Page;

    // Create mock browser manager
    mockBrowserManager = {
      isReady: vi.fn(),
      initialize: vi.fn(),
      navigateToPerplexity: vi.fn(),
      getPage: vi.fn(),
      waitForSearchInput: vi.fn(),
      resetIdleTimeout: vi.fn(),
      performRecovery: vi.fn(),
      checkForCaptcha: vi.fn(),
      cleanup: vi.fn(),
      getBrowser: vi.fn(),
      getPuppeteerContext: vi.fn().mockReturnValue({
        browser: null,
        page: mockPage,
        isInitializing: false,
        searchInputSelector: 'textarea[placeholder*="Ask"]',
        lastSearchTime: 0,
        idleTimeout: null,
        operationCount: 0,
        log: vi.fn(),
        setBrowser: vi.fn(),
        setPage: vi.fn(),
        setIsInitializing: vi.fn(),
        setSearchInputSelector: vi.fn(),
        setIdleTimeout: vi.fn(),
        incrementOperationCount: vi.fn().mockReturnValue(1),
        determineRecoveryLevel: vi.fn().mockReturnValue(1),
        IDLE_TIMEOUT_MS: 300000,
      }),
    };

    searchEngine = new SearchEngine(mockBrowserManager);
  });

  describe("performSearch", () => {
    const testQuery = "test search query";

    it("should perform successful search when browser is ready", async () => {
      // Setup successful flow
      mockBrowserManager.isReady = vi.fn().mockReturnValue(true);
      mockBrowserManager.getPage = vi.fn().mockReturnValue(mockPage);
      mockBrowserManager.waitForSearchInput = vi
        .fn()
        .mockResolvedValue('textarea[placeholder*="Ask"]');

      // Mock page interactions
      mockPage.evaluate = vi.fn().mockResolvedValue(undefined);
      mockPage.click = vi.fn().mockResolvedValue(undefined);
      mockPage.type = vi.fn().mockResolvedValue(undefined);
      mockPage.keyboard.press = vi.fn().mockResolvedValue(undefined);
      mockPage.waitForSelector = vi.fn().mockResolvedValue(undefined);

      // Mock answer extraction
      mockPage.evaluate = vi
        .fn()
        .mockResolvedValueOnce(undefined) // First call for clearing input
        .mockResolvedValue("Test answer from search"); // Second call for answer extraction

      const result = await searchEngine.performSearch(testQuery);

      expect(result).toBe("Test answer from search");
      expect(mockBrowserManager.navigateToPerplexity).toHaveBeenCalled();
      expect(mockBrowserManager.waitForSearchInput).toHaveBeenCalled();
      expect(mockBrowserManager.resetIdleTimeout).toHaveBeenCalled();
      expect(mockLogInfo).toHaveBeenCalledWith(expect.stringContaining("Executing search for"));
    });

    it("should initialize browser when not ready", async () => {
      mockBrowserManager.isReady = vi.fn().mockReturnValue(false);
      mockBrowserManager.initialize = vi.fn().mockResolvedValue(undefined);
      mockBrowserManager.getPage = vi.fn().mockReturnValue(mockPage);
      mockBrowserManager.waitForSearchInput = vi
        .fn()
        .mockResolvedValue('textarea[placeholder*="Ask"]');

      mockPage.evaluate = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValue("Test answer");

      await searchEngine.performSearch(testQuery);

      expect(mockLogInfo).toHaveBeenCalledWith("Browser not ready, initializing...");
      expect(mockBrowserManager.initialize).toHaveBeenCalled();
    });

    it("should handle no active page error", async () => {
      mockBrowserManager.isReady = vi.fn().mockReturnValue(true);
      mockBrowserManager.getPage = vi.fn().mockReturnValue(null);

      const result = await searchEngine.performSearch(testQuery);

      expect(result).toContain("technical issue");
      expect(mockBrowserManager.performRecovery).toHaveBeenCalled();
    });

    it("should handle search input not found error", async () => {
      mockBrowserManager.isReady = vi.fn().mockReturnValue(true);
      mockBrowserManager.getPage = vi.fn().mockReturnValue(mockPage);
      mockBrowserManager.waitForSearchInput = vi.fn().mockResolvedValue(null);

      const result = await searchEngine.performSearch(testQuery);

      expect(result).toContain("search operation could not be completed");
      expect(mockBrowserManager.performRecovery).toHaveBeenCalled();
    });

    it("should handle timeout errors with specific message", async () => {
      const timeoutError = new Error("Timed out waiting for selector");
      mockBrowserManager.isReady = vi.fn().mockReturnValue(true);
      mockBrowserManager.navigateToPerplexity = vi.fn().mockRejectedValue(timeoutError);

      const result = await searchEngine.performSearch(testQuery);

      expect(result).toContain("taking longer than expected");
      expect(result).toContain("high server load");
    });

    it("should handle navigation errors with specific message", async () => {
      const navError = new Error("Navigation failed");
      mockBrowserManager.isReady = vi.fn().mockReturnValue(true);
      mockBrowserManager.navigateToPerplexity = vi.fn().mockRejectedValue(navError);

      const result = await searchEngine.performSearch(testQuery);

      expect(result).toContain("navigation issue");
      expect(result).toContain("network connectivity problems");
    });

    it("should handle detached errors with specific message", async () => {
      const detachedError = new Error("Detached frame error");
      mockBrowserManager.isReady = vi.fn().mockReturnValue(true);
      mockBrowserManager.navigateToPerplexity = vi.fn().mockRejectedValue(detachedError);

      const result = await searchEngine.performSearch(testQuery);

      expect(result).toContain("technical issue");
    });
  });

  describe("executeSearch", () => {
    const selector = 'textarea[placeholder*="Ask"]';
    const query = "test query";

    it("should clear input and type query successfully", async () => {
      mockPage.evaluate = vi.fn().mockResolvedValue(undefined);
      mockPage.click = vi.fn().mockResolvedValue(undefined);
      mockPage.type = vi.fn().mockResolvedValue(undefined);
      mockPage.keyboard.press = vi.fn().mockResolvedValue(undefined);

      // Access private method via type assertion
      await (searchEngine as unknown as SearchEnginePrivate).executeSearch(
        mockPage,
        selector,
        query,
      );

      expect(mockPage.evaluate).toHaveBeenCalled();
      expect(mockPage.click).toHaveBeenCalledWith(selector, { clickCount: 3 });
      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Backspace");
      expect(mockPage.type).toHaveBeenCalledWith(
        selector,
        query,
        expect.objectContaining({
          delay: expect.any(Number),
        }),
      );
      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Enter");
      expect(mockLogInfo).toHaveBeenCalledWith("Search query submitted successfully");
    });

    it("should handle input clearing errors gracefully", async () => {
      const clearError = new Error("Clear input failed");
      mockPage.evaluate = vi.fn().mockRejectedValue(clearError);
      mockPage.click = vi.fn().mockRejectedValue(clearError);
      mockPage.type = vi.fn().mockResolvedValue(undefined);
      mockPage.keyboard.press = vi.fn().mockResolvedValue(undefined);

      await (searchEngine as unknown as SearchEnginePrivate).executeSearch(
        mockPage,
        selector,
        query,
      );

      expect(mockLogWarn).toHaveBeenCalledWith("Error clearing input field:", {
        error: "Clear input failed",
      });
      expect(mockPage.type).toHaveBeenCalled(); // Should still proceed with typing
    });

    it("should truncate long queries in log messages", async () => {
      const longQuery = "a".repeat(100);
      mockPage.evaluate = vi.fn().mockResolvedValue(undefined);
      mockPage.click = vi.fn().mockResolvedValue(undefined);
      mockPage.type = vi.fn().mockResolvedValue(undefined);
      mockPage.keyboard.press = vi.fn().mockResolvedValue(undefined);

      await (searchEngine as unknown as SearchEnginePrivate).executeSearch(
        mockPage,
        selector,
        longQuery,
      );

      expect(mockLogInfo).toHaveBeenCalledWith(expect.stringContaining("..."));
    });
  });

  describe("waitForCompleteAnswer", () => {
    it("should find response with first prose selector", async () => {
      mockPage.waitForSelector = vi.fn().mockResolvedValue(undefined);
      mockPage.evaluate = vi.fn().mockResolvedValue("Complete answer text");

      const result = await (searchEngine as unknown as SearchEnginePrivate).waitForCompleteAnswer(
        mockPage,
      );

      expect(result).toBe("Complete answer text");
      expect(mockPage.waitForSelector).toHaveBeenCalledWith(".prose", expect.any(Object));
      expect(mockLogInfo).toHaveBeenCalledWith("Found response with selector: .prose");
    });

    it("should try multiple selectors before finding one", async () => {
      mockPage.waitForSelector = vi
        .fn()
        .mockRejectedValueOnce(new Error("Selector not found"))
        .mockRejectedValueOnce(new Error("Selector not found"))
        .mockResolvedValue(undefined);
      mockPage.evaluate = vi.fn().mockResolvedValue("Answer found");

      const result = await (searchEngine as unknown as SearchEnginePrivate).waitForCompleteAnswer(
        mockPage,
      );

      expect(result).toBe("Answer found");
      expect(mockPage.waitForSelector).toHaveBeenCalledTimes(3);
      expect(mockLogWarn).toHaveBeenCalledTimes(2);
    });

    it("should throw error when no selectors found", async () => {
      mockPage.waitForSelector = vi.fn().mockRejectedValue(new Error("Selector not found"));

      await expect(
        (searchEngine as unknown as SearchEnginePrivate).waitForCompleteAnswer(mockPage),
      ).rejects.toThrow("No response elements found on page");

      expect(mockLogError).toHaveBeenCalledWith("No response selectors found");
    });
  });

  describe("extractCompleteAnswer", () => {
    it("should extract answer with URLs", async () => {
      const mockAnswerWithUrls = `Test answer content

URLs:
- https://example.com
- https://test.com`;

      mockPage.evaluate = vi.fn().mockResolvedValue(mockAnswerWithUrls);

      const result = await (searchEngine as unknown as SearchEnginePrivate).extractCompleteAnswer(
        mockPage,
      );

      expect(result).toBe(mockAnswerWithUrls);
    });

    it("should return fallback message when no content found", async () => {
      // Mock page.evaluate to simulate the internal logic returning the fallback
      mockPage.evaluate = vi
        .fn()
        .mockResolvedValue("No answer content found. The website may be experiencing issues.");

      const result = await (searchEngine as unknown as SearchEnginePrivate).extractCompleteAnswer(
        mockPage,
      );

      expect(result).toBe("No answer content found. The website may be experiencing issues.");
    });
  });

  describe("generateErrorResponse", () => {
    it("should generate timeout-specific error message", () => {
      const timeoutError = new Error("Timed out waiting for selector");
      const result = (searchEngine as unknown as SearchEnginePrivate).generateErrorResponse(
        timeoutError,
      );

      expect(result).toBe(
        "The search operation is taking longer than expected. This might be due to high server load. Please try again with a more specific query.",
      );
    });

    it("should generate navigation-specific error message", () => {
      const navError = new Error("Navigation failed");
      const result = (searchEngine as unknown as SearchEnginePrivate).generateErrorResponse(
        navError,
      );

      expect(result).toBe(
        "The search operation encountered a navigation issue. This might be due to network connectivity problems. Please try again later.",
      );
    });

    it("should generate detached-specific error message", () => {
      const detachedError = new Error("Page detached");
      const result = (searchEngine as unknown as SearchEnginePrivate).generateErrorResponse(
        detachedError,
      );

      expect(result).toBe(
        "The search operation encountered a technical issue. Please try again with a more specific query.",
      );
    });

    it("should generate generic error message for other errors", () => {
      const genericError = new Error("Some other error");
      const result = (searchEngine as unknown as SearchEnginePrivate).generateErrorResponse(
        genericError,
      );

      expect(result).toContain("search operation could not be completed");
      expect(result).toContain("Some other error");
    });

    it("should handle non-Error objects", () => {
      const stringError = "String error message";
      const result = (searchEngine as unknown as SearchEnginePrivate).generateErrorResponse(
        stringError,
      );

      expect(result).toContain("String error message");
    });
  });
});
