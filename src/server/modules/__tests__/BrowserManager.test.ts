/**
 * Tests for BrowserManager module
 * Demonstrates how modular architecture enables easy testing
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Puppeteer utilities with proper hoisting
vi.mock("../../../utils/puppeteer.js", () => ({
  initializeBrowser: vi.fn(),
  navigateToPerplexity: vi.fn(),
  waitForSearchInput: vi.fn(),
  checkForCaptcha: vi.fn(),
  recoveryProcedure: vi.fn(),
  resetIdleTimeout: vi.fn(),
}));

import * as puppeteerUtils from "../../../utils/puppeteer.js";
import { BrowserManager } from "../BrowserManager.js";

// Extract mocked functions with proper typing
const mockInitializeBrowser = vi.mocked(puppeteerUtils.initializeBrowser);
const mockNavigateToPerplexity = vi.mocked(puppeteerUtils.navigateToPerplexity);
const mockWaitForSearchInput = vi.mocked(puppeteerUtils.waitForSearchInput);
const mockCheckForCaptcha = vi.mocked(puppeteerUtils.checkForCaptcha);
const mockRecoveryProcedure = vi.mocked(puppeteerUtils.recoveryProcedure);

// Mock logging - move functions inside factory to avoid hoisting issues
vi.mock("../../../utils/logging.js", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

// Import the mocked logging functions
import * as logging from "../../../utils/logging.js";
const mockLogInfo = vi.mocked(logging.logInfo);
const mockLogWarn = vi.mocked(logging.logWarn);
const mockLogError = vi.mocked(logging.logError);

// Mock browser and page objects
const mockPage = {
  isClosed: vi.fn().mockReturnValue(false),
  close: vi.fn(),
};

const mockBrowser = {
  isConnected: vi.fn().mockReturnValue(true),
  close: vi.fn(),
};

// Type for accessing private members (better than 'any')
interface BrowserManagerPrivate {
  browser: unknown;
  page: unknown;
  isInitializing: boolean;
  idleTimeout: NodeJS.Timeout | null;
  determineRecoveryLevel: (error?: Error) => number;
}

describe("BrowserManager", () => {
  let browserManager: BrowserManager;

  beforeEach(() => {
    vi.clearAllMocks();
    browserManager = new BrowserManager();
  });

  describe("initialize", () => {
    it("should initialize browser successfully", async () => {
      mockInitializeBrowser.mockResolvedValue(undefined);

      await browserManager.initialize();

      expect(mockInitializeBrowser).toHaveBeenCalledTimes(1);
      expect(mockLogInfo).toHaveBeenCalledWith("BrowserManager initialized successfully");
    });

    it("should handle initialization errors", async () => {
      const error = new Error("Initialization failed");
      mockInitializeBrowser.mockRejectedValue(error);

      await expect(browserManager.initialize()).rejects.toThrow("Initialization failed");

      expect(mockLogError).toHaveBeenCalledWith("BrowserManager initialization failed:", {
        error: "Initialization failed",
      });
    });

    it("should not initialize if already initializing", async () => {
      // Set private property to simulate ongoing initialization
      (browserManager as unknown as BrowserManagerPrivate).isInitializing = true;

      await browserManager.initialize();

      expect(mockInitializeBrowser).not.toHaveBeenCalled();
      expect(mockLogInfo).toHaveBeenCalledWith("Browser initialization already in progress...");
    });
  });

  describe("navigateToPerplexity", () => {
    it("should navigate to Perplexity successfully", async () => {
      mockNavigateToPerplexity.mockResolvedValue(undefined);

      await browserManager.navigateToPerplexity();

      expect(mockNavigateToPerplexity).toHaveBeenCalledTimes(1);
      expect(mockNavigateToPerplexity).toHaveBeenCalledWith(
        expect.objectContaining({
          browser: null,
          page: null,
          isInitializing: false,
        }),
      );
    });
  });

  describe("waitForSearchInput", () => {
    it("should return search input selector", async () => {
      const expectedSelector = 'textarea[placeholder*="Ask"]';
      mockWaitForSearchInput.mockResolvedValue(expectedSelector);

      const result = await browserManager.waitForSearchInput();

      expect(result).toBe(expectedSelector);
      expect(mockWaitForSearchInput).toHaveBeenCalledTimes(1);
    });

    it("should return null if no selector found", async () => {
      mockWaitForSearchInput.mockResolvedValue(null);

      const result = await browserManager.waitForSearchInput();

      expect(result).toBeNull();
    });
  });

  describe("checkForCaptcha", () => {
    it("should return true if captcha detected", async () => {
      mockCheckForCaptcha.mockResolvedValue(true);

      const result = await browserManager.checkForCaptcha();

      expect(result).toBe(true);
      expect(mockCheckForCaptcha).toHaveBeenCalledTimes(1);
    });

    it("should return false if no captcha", async () => {
      mockCheckForCaptcha.mockResolvedValue(false);

      const result = await browserManager.checkForCaptcha();

      expect(result).toBe(false);
    });
  });

  describe("performRecovery", () => {
    it("should perform recovery with error", async () => {
      const error = new Error("Test error");
      mockRecoveryProcedure.mockResolvedValue(undefined);

      await browserManager.performRecovery(error);

      expect(mockRecoveryProcedure).toHaveBeenCalledWith(
        expect.objectContaining({
          browser: null,
          page: null,
        }),
        error,
      );
    });

    it("should perform recovery without error", async () => {
      mockRecoveryProcedure.mockResolvedValue(undefined);

      await browserManager.performRecovery();

      expect(mockRecoveryProcedure).toHaveBeenCalledWith(expect.anything(), undefined);
    });
  });

  describe("isReady", () => {
    it("should return false when not initialized", () => {
      expect(browserManager.isReady()).toBe(false);
    });

    it("should return true when properly initialized", () => {
      // Set up mock browser and page
      (browserManager as unknown as BrowserManagerPrivate).browser = mockBrowser;
      (browserManager as unknown as BrowserManagerPrivate).page = mockPage;
      (browserManager as unknown as BrowserManagerPrivate).isInitializing = false;

      expect(browserManager.isReady()).toBe(true);
    });

    it("should return false when page is closed", () => {
      (browserManager as unknown as BrowserManagerPrivate).browser = mockBrowser;
      (browserManager as unknown as BrowserManagerPrivate).page = {
        ...mockPage,
        isClosed: () => true,
      };
      (browserManager as unknown as BrowserManagerPrivate).isInitializing = false;

      expect(browserManager.isReady()).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("should cleanup successfully", async () => {
      // Setup browser and page
      (browserManager as unknown as BrowserManagerPrivate).browser = mockBrowser;
      (browserManager as unknown as BrowserManagerPrivate).page = mockPage;
      (browserManager as unknown as BrowserManagerPrivate).idleTimeout = setTimeout(() => {}, 1000);

      await browserManager.cleanup();

      expect(mockPage.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
      expect(mockLogInfo).toHaveBeenCalledWith("BrowserManager cleanup completed");
    });

    it("should handle cleanup errors gracefully", async () => {
      const error = new Error("Cleanup failed");
      const failingPage = { ...mockPage, close: vi.fn().mockRejectedValue(error) };
      (browserManager as unknown as BrowserManagerPrivate).page = failingPage;

      await browserManager.cleanup();

      expect(mockLogError).toHaveBeenCalledWith("Error during BrowserManager cleanup:", {
        error: "Cleanup failed",
      });
    });

    it("should skip cleanup if browser/page not initialized", async () => {
      await browserManager.cleanup();

      expect(mockLogInfo).toHaveBeenCalledWith("BrowserManager cleanup completed");
      // Should not throw or call any close methods
    });
  });

  describe("determineRecoveryLevel", () => {
    it("should return level 1 for no error", () => {
      const result = (browserManager as unknown as BrowserManagerPrivate).determineRecoveryLevel();
      expect(result).toBe(1);
    });

    it("should return level 3 for critical errors", () => {
      const criticalErrors = [
        new Error("Frame detached"),
        new Error("Browser crashed"),
        new Error("Protocol error"),
      ];

      for (const error of criticalErrors) {
        const result = (browserManager as unknown as BrowserManagerPrivate).determineRecoveryLevel(
          error,
        );
        expect(result).toBe(3);
      }
    });

    it("should return level 2 for navigation errors", () => {
      const navigationErrors = [
        new Error("Navigation failed"),
        new Error("Timeout occurred"),
        new Error("net::ERR_FAILED"),
      ];

      for (const error of navigationErrors) {
        const result = (browserManager as unknown as BrowserManagerPrivate).determineRecoveryLevel(
          error,
        );
        expect(result).toBe(2);
      }
    });

    it("should return level 1 for minor errors", () => {
      const minorError = new Error("Minor issue");
      const result = (browserManager as unknown as BrowserManagerPrivate).determineRecoveryLevel(
        minorError,
      );
      expect(result).toBe(1);
    });
  });

  describe("getters", () => {
    it("should return null for browser and page initially", () => {
      expect(browserManager.getBrowser()).toBeNull();
      expect(browserManager.getPage()).toBeNull();
    });

    it("should return browser and page when set", () => {
      (browserManager as unknown as BrowserManagerPrivate).browser = mockBrowser;
      (browserManager as unknown as BrowserManagerPrivate).page = mockPage;

      expect(browserManager.getBrowser()).toBe(mockBrowser);
      expect(browserManager.getPage()).toBe(mockPage);
    });
  });
});
