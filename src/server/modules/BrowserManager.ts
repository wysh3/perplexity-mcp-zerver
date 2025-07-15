/**
 * BrowserManager - Handles all Puppeteer browser operations
 * Focused, testable module for browser automation
 */
import type { Browser, Page } from "puppeteer";
import type { IBrowserManager, PuppeteerContext } from "../../types/index.js";
import { logError, logInfo, logWarn } from "../../utils/logging.js";
import {
  checkForCaptcha,
  initializeBrowser,
  navigateToPerplexity,
  recoveryProcedure,
  resetIdleTimeout,
  waitForSearchInput,
} from "../../utils/puppeteer.js";

export class BrowserManager implements IBrowserManager {
  public browser: Browser | null = null;
  public page: Page | null = null;
  public isInitializing = false;
  public searchInputSelector = 'textarea[placeholder*="Ask"]';
  public readonly lastSearchTime = 0;
  public idleTimeout: NodeJS.Timeout | null = null;
  public operationCount = 0;
  public readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000;

  public getPuppeteerContext(): PuppeteerContext {
    return {
      browser: this.browser,
      page: this.page,
      isInitializing: this.isInitializing,
      searchInputSelector: this.searchInputSelector,
      lastSearchTime: this.lastSearchTime,
      idleTimeout: this.idleTimeout,
      operationCount: this.operationCount,
      log: this.log.bind(this),
      setBrowser: (browser) => {
        this.browser = browser;
      },
      setPage: (page) => {
        this.page = page;
      },
      setIsInitializing: (val) => {
        this.isInitializing = val;
      },
      setSearchInputSelector: (selector) => {
        this.searchInputSelector = selector;
      },
      setIdleTimeout: (timeout) => {
        this.idleTimeout = timeout;
      },
      incrementOperationCount: () => ++this.operationCount,
      determineRecoveryLevel: this.determineRecoveryLevel.bind(this),
      IDLE_TIMEOUT_MS: this.IDLE_TIMEOUT_MS,
    };
  }

  private log(level: "info" | "error" | "warn", message: string) {
    switch (level) {
      case "info":
        logInfo(message);
        break;
      case "warn":
        logWarn(message);
        break;
      case "error":
        logError(message);
        break;
      default:
        logInfo(message);
    }
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

  async initialize(): Promise<void> {
    if (this.isInitializing) {
      logInfo("Browser initialization already in progress...");
      return;
    }

    try {
      const ctx = this.getPuppeteerContext();
      await initializeBrowser(ctx);
      logInfo("BrowserManager initialized successfully");
    } catch (error) {
      logError("BrowserManager initialization failed:", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async navigateToPerplexity(): Promise<void> {
    const ctx = this.getPuppeteerContext();
    await navigateToPerplexity(ctx);
  }

  async waitForSearchInput(): Promise<string | null> {
    const ctx = this.getPuppeteerContext();
    const selector = await waitForSearchInput(ctx);
    return selector;
  }

  async checkForCaptcha(): Promise<boolean> {
    const ctx = this.getPuppeteerContext();
    return await checkForCaptcha(ctx);
  }

  async performRecovery(error?: Error): Promise<void> {
    const ctx = this.getPuppeteerContext();
    await recoveryProcedure(ctx, error);
  }

  isReady(): boolean {
    return !!(this.browser && this.page && !this.page.isClosed() && !this.isInitializing);
  }

  async cleanup(): Promise<void> {
    try {
      if (this.idleTimeout) {
        clearTimeout(this.idleTimeout);
        this.idleTimeout = null;
      }

      if (this.page && !this.page.isClosed()) {
        await this.page.close();
      }

      if (this.browser?.isConnected()) {
        await this.browser.close();
      }

      this.page = null;
      this.browser = null;
      this.isInitializing = false;

      logInfo("BrowserManager cleanup completed");
    } catch (error) {
      logError("Error during BrowserManager cleanup:", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  getPage(): Page | null {
    return this.page;
  }

  getBrowser(): Browser | null {
    return this.browser;
  }

  resetIdleTimeout(): void {
    const ctx = this.getPuppeteerContext();
    resetIdleTimeout(ctx);
  }
}
