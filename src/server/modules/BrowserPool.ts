/**
 * BrowserPool - Manages multiple browser instances for parallel processing
 * Implements a pool pattern for efficient resource utilization
 */
import type { Browser, Page } from "puppeteer";
import type { IBrowserManager } from "../../types/index.js";
import { logError, logInfo, logWarn } from "../../utils/logging.js";
import { BrowserManager } from "./BrowserManager.js";

export interface BrowserPoolConfig {
  poolSize: number;
  maxRetries: number;
  initializeTimeout: number;
}

export interface PooledBrowser {
  id: string;
  manager: IBrowserManager;
  inUse: boolean;
  lastUsed: number;
}

export class BrowserPool {
  private browsers: Map<string, PooledBrowser> = new Map();
  private config: BrowserPoolConfig;
  private isShuttingDown = false;

  constructor(config: Partial<BrowserPoolConfig> = {}) {
    this.config = {
      poolSize: config.poolSize ?? 3,
      maxRetries: config.maxRetries ?? 3,
      initializeTimeout: config.initializeTimeout ?? 30000,
    };
  }

  async initialize(): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error("BrowserPool is shutting down");
    }

    logInfo(`Initializing BrowserPool with size ${this.config.poolSize}`);

    const initPromises = Array.from({ length: this.config.poolSize }, (_, i) =>
      this.createBrowserInstance(i),
    );

    await Promise.all(initPromises);
    logInfo(`BrowserPool initialized with ${this.browsers.size} browsers`);
  }

  private async createBrowserInstance(index: number): Promise<void> {
    const id = `browser-${index}`;
    const manager = new BrowserManager();

    try {
      await this.withTimeout(
        manager.initialize(),
        this.config.initializeTimeout,
        `Browser ${id} initialization timeout`,
      );

      const pooledBrowser: PooledBrowser = {
        id,
        manager,
        inUse: false,
        lastUsed: Date.now(),
      };

      this.browsers.set(id, pooledBrowser);
      logInfo(`Browser instance ${id} created successfully`);
    } catch (error) {
      logError(`Failed to create browser instance ${id}:`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async acquireBrowser(timeout = 10000): Promise<IBrowserManager> {
    if (this.isShuttingDown) {
      throw new Error("BrowserPool is shutting down");
    }

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const availableBrowser = this.findAvailableBrowser();

      if (availableBrowser) {
        availableBrowser.inUse = true;
        availableBrowser.lastUsed = Date.now();
        logInfo(`Browser ${availableBrowser.id} acquired`);
        return availableBrowser.manager;
      }

      await this.sleep(100);
    }

    throw new Error("No available browser in pool after timeout");
  }

  private findAvailableBrowser(): PooledBrowser | null {
    for (const browser of this.browsers.values()) {
      if (!browser.inUse && browser.manager.isReady()) {
        return browser;
      }
    }
    return null;
  }

  releaseBrowser(manager: IBrowserManager): void {
    for (const browser of this.browsers.values()) {
      if (browser.manager === manager) {
        browser.inUse = false;
        browser.lastUsed = Date.now();
        logInfo(`Browser ${browser.id} released`);
        return;
      }
    }

    logWarn("Attempted to release unknown browser");
  }

  getPoolStatus(): {
    total: number;
    inUse: number;
    available: number;
  } {
    let inUse = 0;
    let available = 0;

    for (const browser of this.browsers.values()) {
      if (browser.inUse) {
        inUse++;
      } else if (browser.manager.isReady()) {
        available++;
      }
    }

    return {
      total: this.browsers.size,
      inUse,
      available,
    };
  }

  async cleanup(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logInfo("Starting BrowserPool cleanup...");

    const cleanupPromises = Array.from(this.browsers.values()).map(async (pooledBrowser) => {
      try {
        await pooledBrowser.manager.cleanup();
      } catch (error) {
        logError(`Error cleaning up browser ${pooledBrowser.id}:`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await Promise.allSettled(cleanupPromises);
    this.browsers.clear();
    logInfo("BrowserPool cleanup completed");
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage: string,
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs),
    );

    return Promise.race([promise, timeoutPromise]);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async restartBrowser(id: string): Promise<void> {
    const pooledBrowser = this.browsers.get(id);

    if (!pooledBrowser) {
      throw new Error(`Browser ${id} not found`);
    }

    logInfo(`Restarting browser ${id}...`);

    try {
      await pooledBrowser.manager.cleanup();

      const manager = new BrowserManager();
      await manager.initialize();

      pooledBrowser.manager = manager;
      pooledBrowser.inUse = false;
      pooledBrowser.lastUsed = Date.now();

      logInfo(`Browser ${id} restarted successfully`);
    } catch (error) {
      logError(`Failed to restart browser ${id}:`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async healthCheck(): Promise<{
    healthy: string[];
    unhealthy: string[];
  }> {
    const healthy: string[] = [];
    const unhealthy: string[] = [];

    for (const [id, pooledBrowser] of this.browsers.entries()) {
      if (pooledBrowser.manager.isReady()) {
        healthy.push(id);
      } else {
        unhealthy.push(id);
      }
    }

    return { healthy, unhealthy };
  }
}
