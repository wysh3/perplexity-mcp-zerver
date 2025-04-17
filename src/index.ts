#!/usr/bin/env node

// ─── TYPE DECLARATIONS ─────────────────────────────────────────────────
declare global {
  interface Window {
    chrome: {
      app: {
        InstallState: {
          DISABLED: string;
          INSTALLED: string;
          NOT_INSTALLED: string;
        };
        RunningState: {
          CANNOT_RUN: string;
          READY_TO_RUN: string;
          RUNNING: string;
        };
        getDetails: () => void;
        getIsInstalled: () => void;
        installState: () => void;
        isInstalled: boolean;
        runningState: () => void;
      };
      runtime: {
        OnInstalledReason: {
          CHROME_UPDATE: string;
          INSTALL: string;
          SHARED_MODULE_UPDATE: string;
          UPDATE: string;
        };
        PlatformArch: {
          ARM: string;
          ARM64: string;
          MIPS: string;
          MIPS64: string;
          X86_32: string;
          X86_64: string;
        };
        PlatformNaclArch: {
          ARM: string;
          MIPS: string;
          PNACL: string;
          X86_32: string;
          X86_64: string;
        };
        PlatformOs: {
          ANDROID: string;
          CROS: string;
          LINUX: string;
          MAC: string;
          OPENBSD: string;
          WIN: string;
        };
        RequestUpdateCheckStatus: {
          NO_UPDATE: string;
          THROTTLED: string;
          UPDATE_AVAILABLE: string;
        };
        connect: () => {
          postMessage: () => void;
          onMessage: {
            addListener: () => void;
            removeListener: () => void;
          };
          disconnect: () => void;
        };
      };
    };
  }
}

export {}; // This ensures the file is treated as a module

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import puppeteer, { Browser, Page } from 'puppeteer';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url'; // Added for ES Module path resolution
import crypto from 'crypto';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import axios from 'axios'; // Reverted: Remove explicit isAxiosError import

// ─── INTERFACES ────────────────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// --- Recursive Content Extraction Types ---
interface PageContentResult {
  url: string;
  title?: string | null;
  textContent?: string | null;
  error?: string | null;
}

interface RecursiveFetchResult {
  status: 'Success' | 'SuccessWithPartial' | 'Error';
  message?: string;
  rootUrl: string;
  explorationDepth: number;
  pagesExplored: number;
  content: PageContentResult[];
}

// ─── CONFIGURATION ─────────────────────────────────────────────────────
const CONFIG = {
  SEARCH_COOLDOWN: 5000,
  PAGE_TIMEOUT: 180000, 
  SELECTOR_TIMEOUT: 90000,
  MAX_RETRIES: 10,
  MCP_TIMEOUT_BUFFER: 60000,
  ANSWER_WAIT_TIMEOUT: 120000,
  RECOVERY_WAIT_TIME: 15000,
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  
  // Adaptive timeout profiles (in ms)
  TIMEOUT_PROFILES: {
    navigation: 45000,
    selector: 15000,
    content: 120000,
    recovery: 30000
  }
} as const;

// ─── MAIN SERVER CLASS ─────────────────────────────────────────────────
class PerplexityMCPServer {
  // Browser state
  private browser: Browser | null = null;
  private page: Page | null = null;
  private isInitializing = false;
  private searchInputSelector: string = 'textarea[placeholder*="Ask"]';
  private lastSearchTime = 0;
  
  // Database state
  private db: Database.Database;
  
  // Server state
  private server: Server;
  private idleTimeout: NodeJS.Timeout | null = null;
  private readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  
  private operationCount = 0;

  constructor() {
    this.server = new Server(
      { name: 'perplexity-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    // Initialize SQLite database (chat history) in the server's directory
    // Use import.meta.url for path relative to the current module file
    const dbPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'chat_history.db');
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }
    this.db = new Database(dbPath, { fileMustExist: false });
    this.initializeDatabase();

    this.setupToolHandlers();

    // Graceful shutdown on SIGINT
    process.on('SIGINT', async () => {
      if (this.browser) {
        await this.browser.close();
      }
      if (this.db) {
        this.db.close();
      }
      await this.server.close();
      process.exit(0);
    });
  }

  // ─── DATABASE METHODS ────────────────────────────────────────────────

  private initializeDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES chats(id)
      )
    `);
  }

  private getChatHistory(chatId: string): ChatMessage[] {
    const messages = this.db
      .prepare(
        'SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC'
      )
      .all(chatId);
    return messages as ChatMessage[];
  }

  private saveChatMessage(chatId: string, message: ChatMessage) {
    // Ensure chat exists
    this.db.prepare('INSERT OR IGNORE INTO chats (id) VALUES (?)').run(chatId);
    // Save the message
    this.db
      .prepare(
        'INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)'
      )
      .run(chatId, message.role, message.content);
  }

  // ─── BROWSER / PUPPETEER METHODS ───────────────────────────────────────

  private async initializeBrowser() {
    if (this.isInitializing) {
      console.log('Browser initialization already in progress...');
      return;
    }
    this.isInitializing = true;
    try {
      if (this.browser) {
        await this.browser.close();
      }
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1920,1080',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
          '--disable-notifications',
          '--disable-popup-blocking',
          '--disable-default-apps',
          '--disable-extensions',
          '--disable-translate',
          '--disable-sync',
          '--disable-background-networking',
          '--disable-client-side-phishing-detection',
          '--disable-component-update',
          '--disable-hang-monitor',
          '--disable-prompt-on-repost',
          '--disable-domain-reliability',
          '--disable-renderer-backgrounding',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-breakpad',
          '--disable-component-extensions-with-background-pages',
          '--disable-ipc-flooding-protection',
          '--disable-back-forward-cache',
          '--disable-partial-raster',
          '--disable-skia-runtime-opts',
          '--disable-smooth-scrolling',
          '--disable-features=site-per-process,TranslateUI,BlinkGenPropertyTrees',
          '--enable-features=NetworkService,NetworkServiceInProcess',
          '--force-color-profile=srgb',
          '--metrics-recording-only',
          '--mute-audio',
          '--no-first-run',
          '--no-default-browser-check',
          '--remote-debugging-port=0',
          '--use-mock-keychain',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ]
      });
      this.page = await this.browser.newPage();
      await this.setupBrowserEvasion();
      await this.page.setViewport({
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false
      });
      await this.page.setUserAgent(CONFIG.USER_AGENT);
      this.page.setDefaultNavigationTimeout(CONFIG.PAGE_TIMEOUT);
      await this.navigateToPerplexity();
    } catch (error) {
      console.error('Browser initialization failed:', error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  private async navigateToPerplexity() {
    if (!this.page) throw new Error('Page not initialized');
    try {
      console.log('Navigating to Perplexity.ai...');
      
      // Use 'domcontentloaded' as a balance between speed and initial readiness
      try {
        await this.page.goto('https://www.perplexity.ai/', {
          waitUntil: 'domcontentloaded', // Wait for DOM parsing, not full load
          timeout: CONFIG.PAGE_TIMEOUT
        });

        // Check for internal error page
        const isInternalError = await this.page.evaluate(() => {
          return document.querySelector('main')?.textContent?.includes('internal error') || false;
        });
        if (isInternalError) {
          throw new Error('Perplexity.ai returned internal error page');
        }
      } catch (gotoError) {
        // Ignore initial goto errors if they are timeout related, as we'll check readiness below
        if (gotoError instanceof Error && !gotoError.message.toLowerCase().includes('timeout') &&
            !gotoError.message.includes('internal error')) {
          console.error('Initial navigation request failed:', gotoError);
          throw gotoError; // Rethrow non-timeout errors
        }
        console.warn('Navigation issue detected:', gotoError instanceof Error ? gotoError.message : String(gotoError));
      }

      // Crucial check: Ensure the page/frame is still valid immediately after goto
      if (this.page.isClosed() || this.page.mainFrame().isDetached()) {
        console.error('Page closed or frame detached immediately after navigation attempt.');
        throw new Error('Frame detached during navigation');
      }

      console.log('Navigation initiated, waiting for search input to confirm readiness...');
      const searchInput = await this.waitForSearchInput(); // Wait for a key element
      if (!searchInput) {
        console.error('Search input not found after navigation, taking screenshot for debugging');
        if (!this.page.isClosed()) {
          await this.page.screenshot({ path: 'debug_no_search_input.png', fullPage: true });
        }
        throw new Error('Search input not found after navigation - page might not have loaded correctly');
      }
      console.log('Search input found, page appears ready.');

      // Allow some extra time for potential dynamic content loading
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Reduced settle time

      // Check page details (wrapped in try/catch)
      let pageTitle = 'N/A';
      let pageUrl = 'N/A';
      try {
        if (!this.page.isClosed()) {
          pageTitle = await this.page.title();
          pageUrl = this.page.url();
        }
      } catch (titleError) {
        console.warn('Could not retrieve page title/URL after navigation:', titleError);
      }
      console.log(`Page loaded: ${pageUrl} (${pageTitle})`);

      // Verify we're on the correct domain (if URL was retrieved)
      if (pageUrl !== 'N/A' && !pageUrl.includes('perplexity.ai')) {
        console.error(`Unexpected URL: ${pageUrl}`);
        throw new Error(`Navigation redirected to unexpected URL: ${pageUrl}`);
      }

      console.log('Navigation and readiness check completed successfully');
    } catch (error) {
      console.error('Navigation failed:', error);
      
      // Try to take a screenshot of the failed state if possible
      try {
        if (this.page) {
          await this.page.screenshot({ path: 'debug_navigation_failed.png', fullPage: true });
          console.log('Captured screenshot of failed navigation state');
        }
      } catch (screenshotError) {
        console.error('Failed to capture screenshot:', screenshotError);
      }
      
      throw error;
    }
  }

  private async setupBrowserEvasion() {
    if (!this.page) return;
    await this.page.evaluateOnNewDocument(() => {
      // Overwrite navigator properties to help avoid detection
      Object.defineProperties(navigator, {
        webdriver: { get: () => undefined },
        hardwareConcurrency: { get: () => 8 },
        deviceMemory: { get: () => 8 },
        platform: { get: () => 'Win32' },
        languages: { get: () => ['en-US', 'en'] },
        permissions: {
          get: () => ({
            query: async () => ({ state: 'prompt' })
          })
        }
      });

      // Only inject Chrome APIs if they don't exist
      if (typeof window.chrome === 'undefined') {
        window.chrome = {
          app: {
            InstallState: {
              DISABLED: 'disabled',
              INSTALLED: 'installed',
              NOT_INSTALLED: 'not_installed'
            },
            RunningState: {
              CANNOT_RUN: 'cannot_run',
              READY_TO_RUN: 'ready_to_run',
              RUNNING: 'running'
            },
            getDetails: function () {},
            getIsInstalled: function () {},
            installState: function () {},
            isInstalled: false,
            runningState: function () {}
          },
          runtime: {
            OnInstalledReason: {
              CHROME_UPDATE: 'chrome_update',
              INSTALL: 'install',
              SHARED_MODULE_UPDATE: 'shared_module_update',
              UPDATE: 'update'
            },
            PlatformArch: {
              ARM: 'arm',
              ARM64: 'arm64',
              MIPS: 'mips',
              MIPS64: 'mips64',
              X86_32: 'x86-32',
              X86_64: 'x86-64'
            },
            PlatformNaclArch: {
              ARM: 'arm',
              MIPS: 'mips',
              PNACL: 'pnacl',
              X86_32: 'x86-32',
              X86_64: 'x86-64'
            },
            PlatformOs: {
              ANDROID: 'android',
              CROS: 'cros',
              LINUX: 'linux',
              MAC: 'mac',
              OPENBSD: 'openbsd',
              WIN: 'win'
            },
            RequestUpdateCheckStatus: {
              NO_UPDATE: 'no_update',
              THROTTLED: 'throttled',
              UPDATE_AVAILABLE: 'update_available'
            },
            // Add basic connect stub to prevent errors
            connect: function() {
              return {
                postMessage: function() {},
                onMessage: {
                  addListener: function() {},
                  removeListener: function() {}
                },
                disconnect: function() {}
              };
            }
          }
        };
      }
    });
  }

  private async waitForSearchInput(
    timeout = CONFIG.SELECTOR_TIMEOUT
  ): Promise<string | null> {
    if (!this.page) return null;
    const possibleSelectors = [
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Search"]',
      'textarea.w-full',
      'textarea[rows="1"]',
      '[role="textbox"]',
      'textarea'
    ];
    for (const selector of possibleSelectors) {
      try {
        const element = await this.page.waitForSelector(selector, {
          timeout: 5000,
          visible: true
        });
        if (element) {
          const isInteractive = await this.page.evaluate((sel) => {
            const el = document.querySelector(sel);
            return el && !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true';
          }, selector);
          if (isInteractive) {
            console.log(`Found working search input: ${selector}`);
            this.searchInputSelector = selector;
            return selector;
          }
        }
      } catch (error) {
        console.warn(`Selector '${selector}' not found or not interactive`);
      }
    }
    // Take a screenshot for debugging if none is found
    await this.page.screenshot({ path: 'debug_search_not_found.png', fullPage: true });
    console.error('No working search input found');
    return null;
  }

  private async checkForCaptcha(): Promise<boolean> {
    if (!this.page) return false;
    const captchaIndicators = [
      '[class*="captcha"]',
      '[id*="captcha"]',
      'iframe[src*="captcha"]',
      'iframe[src*="recaptcha"]',
      'iframe[src*="turnstile"]',
      '#challenge-running',
      '#challenge-form'
    ];
    return await this.page.evaluate((selectors) => {
      return selectors.some((selector) => !!document.querySelector(selector));
    }, captchaIndicators);
  }

  private determineRecoveryLevel(error?: Error): number {
    if (!error) return 3; // Default to full restart if no error info

    const errorMsg = error.message.toLowerCase();
    if (errorMsg.includes('frame') || errorMsg.includes('detached') || errorMsg.includes('session closed') || errorMsg.includes('target closed')) {
      this.log('warn', 'Detached frame or closed session detected, escalating recovery to level 3 (full restart)');
      return 3; // Escalate frame issues to full restart for better reliability
    }
    if (errorMsg.includes('timeout') || errorMsg.includes('navigation')) {
      this.log('warn', 'Timeout or navigation error detected, setting recovery to level 1 (refresh)');
      return 1; // Refresh for timeouts/navigation
    }
    if (errorMsg.includes('internal error')) {
      this.log('warn', 'Internal error page detected, escalating to level 3 (full restart)');
      return 3; // Full restart for internal errors
    }
    this.log('warn', `Unknown error type ('${errorMsg.substring(0, 50)}...'), defaulting recovery to level 3`);
    return 3; // Full restart for other errors
  }

  private async recoveryProcedure(error?: Error): Promise<void> {
    const recoveryLevel = this.determineRecoveryLevel(error);
    const opId = ++this.operationCount;
    
    this.log('info', 'Starting recovery procedure');

    try {
      switch(recoveryLevel) {
        case 1: // Page refresh
          this.log('info', 'Attempting page refresh (Recovery Level 1)');
          if (this.page && !this.page.isClosed()) {
            try {
              await this.page.reload({ timeout: CONFIG.TIMEOUT_PROFILES.navigation });
            } catch (reloadError) {
              this.log('warn', `Page reload failed: ${reloadError instanceof Error ? reloadError.message : String(reloadError)}. Proceeding with recovery.`);
            }
          } else {
             this.log('warn', 'Page was null or closed, cannot refresh. Proceeding with recovery.');
          }
          break;

        case 2: // New page (Currently unused due to level escalation, kept for potential future use)
          this.log('info', 'Creating new page instance (Recovery Level 2)');
          if (this.page) {
             try {
               if (!this.page.isClosed()) await this.page.close();
             } catch (closeError) {
               this.log('warn', `Ignoring error closing old page: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
             }
             this.page = null;
          }
          if (this.browser && this.browser.isConnected()) {
            try {
              this.page = await this.browser.newPage();
              await this.setupBrowserEvasion();
              await this.page.setViewport({ width: 1920, height: 1080 });
              await this.page.setUserAgent(CONFIG.USER_AGENT);
            } catch (newPageError) {
               this.log('error', `Failed to create new page: ${newPageError instanceof Error ? newPageError.message : String(newPageError)}. Escalating to full restart.`);
               // Force level 3 if creating a new page fails
               return await this.recoveryProcedure(new Error('Fallback recovery: new page failed'));
            }
          } else {
             this.log('warn', 'Browser was null or disconnected, cannot create new page. Escalating to full restart.');
             return await this.recoveryProcedure(new Error('Fallback recovery: browser disconnected'));
          }
          break;

        case 3: // Full restart
        default:
          this.log('info', 'Performing full browser restart (Recovery Level 3)');
          if (this.page) {
            try {
              if (!this.page.isClosed()) await this.page.close();
            } catch (closeError) {
              this.log('warn', `Ignoring error closing page during full restart: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
            }
          }
          if (this.browser) {
            try {
              if (this.browser.isConnected()) await this.browser.close();
            } catch (closeError) {
              this.log('warn', `Ignoring error closing browser during full restart: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
            }
          }
          this.page = null;
          this.browser = null;
          this.isInitializing = false; // Ensure flag is reset
          this.log('info', 'Waiting before re-initializing browser...');
          await new Promise(resolve => setTimeout(resolve, CONFIG.RECOVERY_WAIT_TIME));
          await this.initializeBrowser(); // This will set page and browser again
          break;
      }
      
      this.log('info', 'Recovery completed');
    } catch (recoveryError) {
      this.log('error', 'Recovery failed: ' + (recoveryError instanceof Error ? recoveryError.message : String(recoveryError)));
      
      // Fall back to more aggressive recovery if initial attempt fails
      if (recoveryLevel < 3) {
        this.log('info', 'Attempting higher level recovery');
        await this.recoveryProcedure(new Error('Fallback recovery'));
      } else {
        throw recoveryError;
      }
    }
  }

  private log(level: 'info'|'error'|'warn', message: string) {
    console[level](message);
  }

  private resetIdleTimeout() {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
    }

    this.idleTimeout = setTimeout(async () => {
      console.log('Browser idle timeout reached, closing browser...');
      try {
        if (this.page) {
          await this.page.close();
          this.page = null;
        }
        if (this.browser) {
          await this.browser.close();
          this.browser = null;
        }
        this.isInitializing = false; // Reset initialization flag
        console.log('Browser cleanup completed successfully');
      } catch (error) {
        console.error('Error during browser cleanup:', error);
        // Reset states even if cleanup fails
        this.page = null;
        this.browser = null;
        this.isInitializing = false;
      }
    }, this.IDLE_TIMEOUT_MS);
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries = CONFIG.MAX_RETRIES
  ): Promise<T> {
    let lastError: Error | null = null;
    let consecutiveTimeouts = 0;
    let consecutiveNavigationErrors = 0;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        console.log(`Attempt ${i + 1}/${maxRetries}...`);
        const result = await operation();
        // Reset counters on success
        consecutiveTimeouts = 0;
        consecutiveNavigationErrors = 0;
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Attempt ${i + 1} failed:`, error);
        
        // Exit early if we've reached the max retries
        if (i === maxRetries - 1) {
          console.error(`Maximum retry attempts (${maxRetries}) reached. Giving up.`);
          break;
        }
        
        // Check for specific error conditions
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isTimeoutError = errorMsg.includes('timeout') || errorMsg.includes('Timed out');
        const isNavigationError = errorMsg.includes('navigation') || errorMsg.includes('Navigation');
        const isConnectionError = errorMsg.includes('net::') || errorMsg.includes('connection') || errorMsg.includes('network');
        const isProtocolError = errorMsg.includes('protocol error'); // Match case-insensitively
        const isDetachedFrameError = errorMsg.includes('frame') || errorMsg.includes('detached') || errorMsg.includes('session closed') || errorMsg.includes('target closed');

        // --- Prioritize Detached Frame / Protocol Errors ---
        if (isDetachedFrameError || isProtocolError) {
          console.error(`Detached frame or protocol error detected ('${errorMsg.substring(0, 100)}...'). Initiating immediate recovery.`);
          await this.recoveryProcedure(lastError); // Pass error for context
          // Wait a bit longer after this type of critical failure
          const criticalWaitTime = 10000 + (Math.random() * 5000);
          console.log(`Waiting ${Math.round(criticalWaitTime/1000)} seconds after critical error recovery...`);
          await new Promise((resolve) => setTimeout(resolve, criticalWaitTime));
          continue; // Skip other checks and proceed to next retry attempt
        }

        // If CAPTCHA is detected, try to recover immediately
        // Check CAPTCHA only if the page seems valid
        let captchaDetected = false;
        if (this.page && !this.page.isClosed() && !this.page.mainFrame().isDetached()) {
           try {
             captchaDetected = await this.checkForCaptcha();
           } catch (captchaCheckError) {
             console.warn(`Error checking for CAPTCHA: ${captchaCheckError}`);
             // Assume no CAPTCHA if check fails, but log it
           }
        } else {
           console.warn('Skipping CAPTCHA check as page is invalid.');
        }

        if (captchaDetected) {
          console.error('CAPTCHA detected! Initiating recovery...');
          await this.recoveryProcedure();
          // Add a small delay after recovery
          await new Promise((resolve) => setTimeout(resolve, 3000));
          continue;
        }

        // Handle timeout errors with progressive backoff
        if (isTimeoutError) {
          console.error(`Timeout detected during operation (${++consecutiveTimeouts} consecutive), attempting recovery...`);
          await this.recoveryProcedure();
          
          // If we have multiple consecutive timeouts, wait longer between attempts
          const timeoutWaitTime = Math.min(5000 * consecutiveTimeouts, 30000);
          console.log(`Waiting ${timeoutWaitTime/1000} seconds after timeout...`);
          await new Promise((resolve) => setTimeout(resolve, timeoutWaitTime));
          continue;
        }
        
        // Handle navigation errors with progressive backoff
        if (isNavigationError) {
          console.error(`Navigation error detected (${++consecutiveNavigationErrors} consecutive), attempting recovery...`);
          await this.recoveryProcedure();
          
          // If we have multiple consecutive navigation errors, wait longer
          const navWaitTime = Math.min(8000 * consecutiveNavigationErrors, 40000);
          console.log(`Waiting ${navWaitTime/1000} seconds after navigation error...`);
          await new Promise((resolve) => setTimeout(resolve, navWaitTime));
          continue;
        }
        
        // Handle connection errors
        if (isConnectionError || isProtocolError) {
          console.error('Connection or protocol error detected, attempting recovery with longer wait...');
          await this.recoveryProcedure();
          // Wait longer for connection issues
          const connectionWaitTime = 15000 + (Math.random() * 10000);
          console.log(`Waiting ${Math.round(connectionWaitTime/1000)} seconds after connection error...`);
          await new Promise((resolve) => setTimeout(resolve, connectionWaitTime));
          continue;
        }
        
        // Exponential backoff delay with progressive jitter to avoid thundering herd
        // More retries = more jitter to spread out retry attempts
        const baseDelay = Math.min(1000 * Math.pow(2, i), 30000);
        const maxJitter = Math.min(1000 * (i + 1), 10000); // Jitter increases with retry count
        const jitter = Math.random() * maxJitter;
        const delay = baseDelay + jitter;
        console.log(`Retrying in ${Math.round(delay/1000)} seconds (base: ${Math.round(baseDelay/1000)}s, jitter: ${Math.round(jitter/1000)}s)...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        
        // Try re-navigating with error handling
        try {
          console.log('Attempting to re-navigate to Perplexity...');
          await this.navigateToPerplexity();
          console.log('Re-navigation successful');
        } catch (navError) {
          console.error('Navigation failed during retry:', navError);
          // If navigation fails, wait a bit longer before next retry
          const navFailWaitTime = 10000 + (Math.random() * 5000);
          console.log(`Navigation failed, waiting ${Math.round(navFailWaitTime/1000)} seconds before next attempt...`);
          await new Promise((resolve) => setTimeout(resolve, navFailWaitTime));
          
          // If this is a later retry attempt and navigation keeps failing, try a full recovery
          if (i > 1) {
            console.log('Multiple navigation failures, attempting full recovery...');
            await this.recoveryProcedure();
          }
        }
      }
    }
    
    // If we've exhausted all retries, provide a detailed error message
    const errorMessage = lastError ? 
      `Operation failed after ${maxRetries} retries. Last error: ${lastError.message}` : 
      `Operation failed after ${maxRetries} retries with unknown error`;
    
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  private async waitForCompleteAnswer(page: Page): Promise<string> {
    // Set a timeout to ensure we don't wait indefinitely, but make it much longer
    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Waiting for complete answer timed out'));
      }, CONFIG.ANSWER_WAIT_TIMEOUT); // Use the dedicated answer wait timeout
    });

    const answerPromise = page.evaluate(async () => {
      const getAnswer = () => {
        const elements = Array.from(document.querySelectorAll('.prose'));
        const answerText = elements.map((el) => (el as HTMLElement).innerText.trim()).join('\n\n');
        
        // Extract all URLs from the answer
        const links = Array.from(document.querySelectorAll('.prose a[href]'));
        const urls = links.map(link => (link as HTMLAnchorElement).href)
          .filter(href => href && !href.startsWith('javascript:') && !href.startsWith('#'))
          .map(href => href.trim());
        
        // Combine text and URLs
        if (urls.length > 0) {
          return `${answerText}\n\nURLs:\n${urls.map(url => `- ${url}`).join('\n')}`;
        }
        return answerText;
      };
      
      let lastAnswer = '';
      let lastLength = 0;
      let stabilityCounter = 0;
      let noChangeCounter = 0;
      const maxAttempts = 60;
      const checkInterval = 600;
      
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
        const currentAnswer = getAnswer();
        const currentLength = currentAnswer.length;
        
        if (currentLength > 0) {
          if (currentLength > lastLength) {
            lastLength = currentLength;
            stabilityCounter = 0;
            noChangeCounter = 0;
          } else if (currentAnswer === lastAnswer) {
            stabilityCounter++;
            noChangeCounter++;
            
            if (currentLength > 1000 && stabilityCounter >= 3) {
              console.log('Long answer stabilized, exiting early');
              break;
            } else if (currentLength > 500 && stabilityCounter >= 4) {
              console.log('Medium answer stabilized, exiting');
              break;
            } else if (stabilityCounter >= 5) {
              console.log('Short answer stabilized, exiting');
              break;
            }
          } else {
            noChangeCounter++;
            stabilityCounter = 0;
          }
          lastAnswer = currentAnswer;
          
          if (noChangeCounter >= 10 && currentLength > 200) {
            console.log('Content stopped growing but has sufficient information');
            break;
          }
        }
        
        const lastProse = document.querySelector('.prose:last-child');
        const isComplete = lastProse?.textContent?.includes('.') || 
                          lastProse?.textContent?.includes('?') || 
                          lastProse?.textContent?.includes('!');
                          
        if (isComplete && stabilityCounter >= 2 && currentLength > 100) {
          console.log('Completion indicators found, exiting');
          break;
        }
      }
      return lastAnswer || 'No answer content found. The website may be experiencing issues.';
    });

    try {
      // Race between the answer generation and the timeout
      return await Promise.race([answerPromise, timeoutPromise]);
    } catch (error) {
      console.error('Error waiting for complete answer:', error);
      // Return partial answer if available
      try {
        // Make multiple attempts to get partial content
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const partialAnswer = await page.evaluate(() => {
              const elements = Array.from(document.querySelectorAll('.prose'));
              return elements.map((el) => (el as HTMLElement).innerText.trim()).join('\n\n');
            });
            
            if (partialAnswer && partialAnswer.length > 50) {
              return partialAnswer + '\n\n[Note: Answer retrieval was interrupted. This is a partial response.]';
            }
            
            // Wait briefly before trying again
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (evalError) {
            console.error(`Attempt ${attempt + 1} to get partial answer failed:`, evalError);
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        return 'Answer retrieval timed out. The service might be experiencing high load. Please try again with a more specific query.';
      } catch (e) {
        console.error('Failed to retrieve partial answer:', e);
        return 'Answer retrieval timed out. Please try again later.';
      }
    }
  }

  private async performSearch(query: string): Promise<string> {
    // Set a global timeout for the entire operation with a much longer duration
    const operationTimeout = setTimeout(() => {
      console.error('Global operation timeout reached, initiating recovery...');
      this.recoveryProcedure().catch((err: unknown) => {
        console.error('Recovery after timeout failed:', err);
      });
    }, CONFIG.PAGE_TIMEOUT - CONFIG.MCP_TIMEOUT_BUFFER);

    try {
      // If browser/page is not initialized or page is closed, initialize it
      if (!this.browser || !this.page || (this.page && this.page.isClosed())) {
        console.log('Browser/page not initialized or page closed, initializing now...');
        if (this.page && !this.page.isClosed()) {
          await this.page.close();
        }
        await this.initializeBrowser();
      }

      if (!this.page || this.page.isClosed()) {
        throw new Error('Page initialization failed or page was closed');
      }

      // Reset idle timeout
      this.resetIdleTimeout();
      
      // Use retry operation for the entire search process with increased retries
      return await this.retryOperation(async () => {
        console.log(`Navigating to Perplexity for query: "${query.substring(0, 30)}${query.length > 30 ? '...' : ''}"`);
        await this.navigateToPerplexity();

        // Validate main frame is attached
        if (!this.page || this.page.mainFrame().isDetached()) {
          console.error('Main frame is detached, will retry with new browser instance');
          throw new Error('Main frame is detached');
        }
        
        console.log('Waiting for search input...');
        const selector = await this.waitForSearchInput();
        if (!selector) {
          console.error('Search input not found, taking screenshot for debugging');
          if (this.page) {
            await this.page.screenshot({ path: 'debug_search_input_not_found.png', fullPage: true });
          }
          throw new Error('Search input not found');
        }

        console.log(`Found search input with selector: ${selector}`);
        
        // Clear any existing text with multiple approaches for reliability
        try {
          // First approach: using evaluate
          await this.page.evaluate((sel) => {
            const input = document.querySelector(sel) as HTMLTextAreaElement;
            if (input) input.value = '';
          }, selector);
          
          // Second approach: using keyboard shortcuts
          await this.page.click(selector, { clickCount: 3 }); // Triple click to select all text
          await this.page.keyboard.press('Backspace'); // Delete selected text
        } catch (clearError) {
          console.warn('Error clearing input field:', clearError);
          // Continue anyway, as the typing might still work
        }

        // Type the query with variable delay to appear more human-like
        console.log('Typing search query...');
        const typeDelay = Math.floor(Math.random() * 20) + 20; // Random delay between 20-40ms
        await this.page.type(selector, query, { delay: typeDelay });
        await this.page.keyboard.press('Enter');

        // Wait for response with multiple selector options and extended timeout
        console.log('Waiting for response...');
        const proseSelectors = [
          '.prose', 
          '[class*="prose"]',
          '[class*="answer"]',
          '[class*="result"]'
        ];
        
        let selectorFound = false;
        for (const proseSelector of proseSelectors) {
          try {
            await this.page.waitForSelector(proseSelector, {
              timeout: CONFIG.SELECTOR_TIMEOUT,
              visible: true
            });
            console.log(`Found response with selector: ${proseSelector}`);
            selectorFound = true;
            break;
          } catch (selectorError) {
            console.warn(`Selector ${proseSelector} not found, trying next...`);
          }
        }
        
        if (!selectorFound) {
          console.error('No response selectors found, checking page state...');
          // Check if page is still valid before throwing
          if (!this.page || this.page.mainFrame().isDetached()) {
            throw new Error('Page became invalid while waiting for response');
          }
          // Take a screenshot for debugging
          await this.page.screenshot({ path: 'debug_prose_not_found.png', fullPage: true });
          
          // Check if there's any visible text content that might contain an answer
          const pageText = await this.page.evaluate(() => document.body.innerText);
          if (pageText && pageText.length > 200) {
            console.log('Found text content on page, attempting to extract answer...');
            // Try to extract meaningful content
            return await this.extractFallbackAnswer(this.page);
          }
          
          throw new Error('Timed out waiting for response from Perplexity');
        }

        console.log('Waiting for complete answer...');
        const answer = await this.waitForCompleteAnswer(this.page);
        console.log(`Answer received (${answer.length} characters)`);
        return answer;
      }, CONFIG.MAX_RETRIES);
    } catch (error) {
      console.error('Search operation failed:', error);
      
      // Handle specific error cases
      if (error instanceof Error) {
        if (error.message.includes('detached') || error.message.includes('Detached')) {
          console.error('Frame detachment detected, attempting recovery...');
          await this.recoveryProcedure();
          // Return a helpful message instead of retrying to avoid potential infinite loops
          return 'The search operation encountered a technical issue. Please try again with a more specific query.';
        }
        
        if (error.message.includes('timeout') || error.message.includes('Timed out')) {
          console.error('Timeout detected, attempting recovery...');
          await this.recoveryProcedure();
          return 'The search operation is taking longer than expected. This might be due to high server load. Your query has been submitted and we\'re waiting for results. Please try again with a more specific query if needed.';
        }
        
        if (error.message.includes('navigation') || error.message.includes('Navigation')) {
          console.error('Navigation error detected, attempting recovery...');
          await this.recoveryProcedure();
          return 'The search operation encountered a navigation issue. This might be due to network connectivity problems. Please try again later.';
        }
      }
      
      // For any other errors, return a user-friendly message
      return `The search operation could not be completed. Error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again later with a more specific query.`;
    } finally {
      clearTimeout(operationTimeout);
    }
  }
  
  // Helper method to extract answer when normal selectors fail
  private async extractFallbackAnswer(page: Page): Promise<string> {
    try {
      return await page.evaluate(() => {
        // Try various ways to find content
        const contentSelectors = [
          // Common content containers
          'main', 'article', '.content', '.answer', '.result',
          // Text containers
          'p', 'div > p', '.text', '[class*="text"]',
          // Any large text block
          'div:not(:empty)'
        ];
        
        for (const selector of contentSelectors) {
          const elements = Array.from(document.querySelectorAll(selector));
          // Filter to elements with substantial text
          const textElements = elements.filter(el => {
            const text = (el as HTMLElement).innerText.trim();
            return text.length > 100; // Only consider elements with substantial text
          });
          
          if (textElements.length > 0) {
            // Sort by text length to find the most substantial content
            textElements.sort((a, b) => {
              return (b as HTMLElement).innerText.length - (a as HTMLElement).innerText.length;
            });
            
            // Get the top 3 elements with the most text
            const topElements = textElements.slice(0, 3);
            return topElements.map(el => (el as HTMLElement).innerText.trim()).join('\n\n');
          }
        }
        
        // Last resort: get any visible text
        return document.body.innerText.substring(0, 2000) + '\n\n[Note: Content extraction used fallback method due to page structure changes]';
      });
    } catch (error) {
      console.error('Error in fallback answer extraction:', error);
      return 'Unable to extract answer content. The website structure may have changed.';
    }
  }

  // ─── TOOL HANDLERS ──────────────────────────────────────────────────

  // ─── TOOL IMPLEMENTATIONS ────────────────────────────────────────────

  private async handleChatPerplexity(args: {message: string, chat_id?: string}): Promise<string> {
    const { message, chat_id = crypto.randomUUID() } = args;
    const history = this.getChatHistory(chat_id);
    const userMessage: ChatMessage = { role: 'user', content: message };
    this.saveChatMessage(chat_id, userMessage);
    
    let conversationPrompt = '';
    history.forEach((msg) => {
      conversationPrompt += msg.role === 'user' 
        ? `User: ${msg.content}\n` 
        : `Assistant: ${msg.content}\n`;
    });
    conversationPrompt += `User: ${message}\n`;
    
    return await this.performSearch(conversationPrompt);
  }

  private async handleGetDocumentation(args: {query: string, context?: string}): Promise<string> {
    const { query, context = '' } = args;
    const prompt = `Provide comprehensive documentation and usage examples for ${query}. ${
      context ? 'Focus on: ' + context : ''
    } Include:
1. Basic overview and purpose
2. Key features and capabilities
3. Installation/setup if applicable
4. Common usage examples with code snippets
5. Best practices and performance considerations  
6. Common pitfalls to avoid
7. Version compatibility information
8. Links to official documentation
9. Community resources (forums, chat channels)
10. Related tools/libraries that work well with it

Crucially, also provide the main official URL(s) for this documentation on separate lines, prefixed with 'Official URL(s):'.`;
    return await this.performSearch(prompt);
  }

  private async handleFindApis(args: {requirement: string, context?: string}): Promise<string> {
    const { requirement, context = '' } = args;
    const prompt = `Find and evaluate APIs that could be used for: ${requirement}. ${
      context ? 'Context: ' + context : ''
    } For each API, provide:
1. Name and brief description
2. Key features and capabilities  
3. Pricing model and rate limits
4. Authentication methods
5. Integration complexity
6. Documentation quality and examples
7. Community support and popularity
8. Any potential limitations or concerns
9. Code examples for basic usage
10. Comparison with similar APIs
11. SDK availability and language support`;
    return await this.performSearch(prompt);
  }

  private async handleCheckDeprecatedCode(args: {code: string, technology?: string}): Promise<string> {
    const { code, technology = '' } = args;
    
    // Break down large code into smaller chunks if needed
    const codeChunks = this.splitCodeIntoChunks(code, 200);
    
    try {
      // First try with detailed analysis
      const prompt = `Analyze this code for deprecated features or patterns${
        technology ? ' in ' + technology : ''
      }:

${codeChunks[0]}

Please provide:
1. Identification of deprecated features/methods
2. Current recommended alternatives  
3. Step-by-step migration guide
4. Impact assessment of the changes
5. Deprecation timeline if available
6. Code examples before/after updating
7. Performance implications
8. Backward compatibility considerations
9. Testing recommendations for the changes`;
      
      const result = await this.performSearch(prompt);
      return result;
    } catch (error) {
      console.warn('Detailed analysis failed, trying simplified version:', error);
      
      // Fallback to simpler analysis
      const simplePrompt = `List deprecated patterns in this code${
        technology ? ' for ' + technology : ''
      } and suggest replacements:

${codeChunks[0]}`;
      
      return await this.performSearch(simplePrompt);
    }
  }

  private splitCodeIntoChunks(code: string, maxLength: number): string[] {
    if (code.length <= maxLength) return [code];
    
    // Try to split at logical points (newlines, semicolons)
    const chunks: string[] = [];
    let currentChunk = '';
    
    const lines = code.split('\n');
    for (const line of lines) {
      if (currentChunk.length + line.length > maxLength) {
        chunks.push(currentChunk);
        currentChunk = line + '\n';
      } else {
        currentChunk += line + '\n';
      }
    }
    
    if (currentChunk) chunks.push(currentChunk);
    return chunks;
  }

  private async handleSearch(args: {query: string, detail_level?: 'brief'|'normal'|'detailed'}): Promise<string> {
    const { query, detail_level = 'normal' } = args;
    let prompt = query;
    switch (detail_level) {
      case 'brief':
        prompt = `Provide a brief, concise answer to: ${query}`;
        break;
      case 'detailed':
        prompt = `Provide a comprehensive, detailed analysis of: ${query}. Include relevant examples, context, and supporting information where applicable.`;
        break;
      default:
        prompt = `Provide a clear, balanced answer to: ${query}. Include key points and relevant context.`;
    }
    return await this.performSearch(prompt);
  }

  // --- Single Page Extraction Helper ---
  private async _fetchSinglePageContent(url: string): Promise<string> {
    // This function encapsulates the original logic of handleExtractUrlContent
    let originalUrl = url; // Keep original for potential Gitingest rewrite
    let pageTitle = '';
    let isGitHubRepo = false;

    // --- GitHub URL Detection & Rewriting ---
    try {
      const parsedUrl = new URL(originalUrl);
      if (parsedUrl.hostname === 'github.com') {
        const pathParts = parsedUrl.pathname.split('/').filter(part => part.length > 0);
        if (pathParts.length === 2) {
          isGitHubRepo = true;
          const gitingestUrl = `https://gitingest.com${parsedUrl.pathname}`;
          console.log(`Detected GitHub repo URL. Rewriting to: ${gitingestUrl}`);
          url = gitingestUrl; // Use the gitingest URL for extraction
        }
      }
    } catch (urlParseError) {
      console.warn(`Failed to parse URL for GitHub check: ${urlParseError}`);
      // Proceed with the potentially rewritten URL if parsing fails
    }

    // --- Content-Type Pre-Check (Skip for GitHub/Gitingest) ---
    if (!isGitHubRepo) {
      try {
        console.log(`Performing HEAD request for ${url}...`);
        const headResponse = await axios.head(url, {
          timeout: 10000,
          headers: { 'User-Agent': CONFIG.USER_AGENT }
        });
        const contentType = headResponse.headers['content-type'];
        console.log(`Content-Type: ${contentType}`);
        if (contentType && !contentType.includes('html') && !contentType.includes('text/plain')) {
          const errorMsg = `Unsupported content type: ${contentType}`;
          console.error(errorMsg);
          return JSON.stringify({ status: "Error", message: errorMsg });
        }
      } catch (headError) {
        console.warn(`HEAD request failed for ${url}: ${headError instanceof Error ? headError.message : String(headError)}. Proceeding with Puppeteer.`);
      }
    } else {
      console.log("Skipping HEAD request for GitHub/Gitingest URL.");
    }

    // --- Puppeteer Navigation, Readability Extraction & Fallback ---
    // Ensure browser/page is initialized
    if (!this.page || this.page.isClosed()) {
      console.log('Page not available for extraction, initializing...');
      try {
        await this.initializeBrowser();
      } catch (initError) {
        const errorMsg = `Failed to initialize browser: ${initError instanceof Error ? initError.message : String(initError)}`;
        console.error(errorMsg);
        return JSON.stringify({ status: "Error", message: errorMsg });
      }
      if (!this.page) {
        const errorMsg = 'Failed to initialize browser page for extraction.';
        console.error(errorMsg);
        return JSON.stringify({ status: "Error", message: errorMsg });
      }
    }

    this.resetIdleTimeout();

    try {
      console.log(`Navigating to ${url} for single page extraction...`);
      const response = await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT_PROFILES.navigation });
      pageTitle = await this.page.title();

      if (response && !response.ok()) {
        const statusCode = response.status();
        const errorMsg = `HTTP error ${statusCode} received when accessing URL: ${url}`;
        console.error(errorMsg);
        return JSON.stringify({ status: "Error", message: errorMsg });
      }

      if (isGitHubRepo) {
        console.log('Waiting for gitingest content selector (.result-text)...');
        try {
          await this.page.waitForSelector('.result-text', { timeout: CONFIG.TIMEOUT_PROFILES.content });
          console.log('Gitingest content selector found.');
        } catch (waitError) {
          console.warn(`Timeout waiting for gitingest selector: ${waitError}. Proceeding anyway.`);
        }
      }

      const html = await this.page.content();
      const dom = new JSDOM(html, { url: url });

      // Gitingest Specific Extraction
      if (isGitHubRepo) {
        const gitingestContent = await this.page.evaluate(() => {
          const resultTextArea = document.querySelector('.result-text') as HTMLTextAreaElement | null;
          return resultTextArea ? resultTextArea.value : null;
        });
        if (gitingestContent && gitingestContent.trim().length > 0) {
          console.log(`Gitingest specific extraction successful (${gitingestContent.length} chars)`);
          return JSON.stringify({
            status: "Success", title: pageTitle, textContent: gitingestContent.trim(),
            excerpt: null, siteName: "gitingest.com", byline: null,
          }, null, 2);
        } else {
          console.warn('Gitingest specific extraction failed. Falling back.');
        }
      }

      // General Readability Extraction
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      if (article && article.textContent && article.textContent.trim().length > (article.title?.length || 0)) {
        console.log(`Readability extracted content (${article.textContent.length} chars)`);
        return JSON.stringify({
          status: "Success", title: article.title || pageTitle, textContent: article.textContent.trim(),
          excerpt: article.excerpt, siteName: article.siteName, byline: article.byline,
        }, null, 2);
      }

      // Sophisticated Fallback
      console.warn('Readability failed. Attempting fallback selectors...');
      const fallbackText = await this.page.evaluate(() => {
        const selectors = [
          'article', 'main', '[role="main"]', '#content', '.content', '#main', '.main',
          '#article-body', '.article-body', '.post-content', '.entry-content'
        ];
        for (const selector of selectors) {
          const element = document.querySelector(selector) as HTMLElement | null;
          if (element && element.innerText && element.innerText.trim().length > 100) {
            console.log(`Fallback using selector: ${selector}`);
            return { text: element.innerText.trim(), selector: selector };
          }
        }
        const bodyClone = document.body.cloneNode(true) as HTMLElement;
        bodyClone.querySelectorAll('nav, header, footer, aside, script, style, noscript, button, form, [role="navigation"], [role="banner"], [role="contentinfo"], [aria-hidden="true"]').forEach(el => el.remove());
        const bodyText = bodyClone.innerText.trim();
        if (bodyText.length > 200) {
          console.log('Fallback using filtered body text.');
          return { text: bodyText, selector: 'body (filtered)' };
        }
        return null;
      });

      if (fallbackText) {
        console.log(`Fallback extracted content (${fallbackText.text.length} chars) using selector: ${fallbackText.selector}`);
        return JSON.stringify({
          status: "SuccessWithFallback", title: pageTitle, textContent: fallbackText.text,
          excerpt: null, siteName: null, byline: null, fallbackSelector: fallbackText.selector
        }, null, 2);
      }

      console.error('Readability and fallback selectors failed.');
      throw new Error('Readability and fallback selectors failed to extract meaningful content.');

    } catch (error) {
      console.error(`Error during single page extraction from ${url}:`, error);
      let errorMessage = `Failed to extract content from ${url}.`;
      let errorReason = "Unknown error";
      if (error instanceof Error) {
        if (error.message.includes('timeout')) errorReason = 'Navigation or content loading timed out.';
        else if (error.message.includes('net::') || error.message.includes('Failed to load')) errorReason = 'Could not resolve or load the URL.';
        else if (error.message.includes('extract meaningful content')) errorReason = 'Readability and fallback selectors failed.';
        else errorReason = error.message;
      }
      errorMessage += ` Reason: ${errorReason}`;
      console.error(errorMessage);
      // Return error in the standard single-page format
      return JSON.stringify({ status: "Error", message: errorMessage });
    }
  }

  // --- Recursive Fetching Logic ---

  private async _extractSameDomainLinks(page: Page, baseUrl: string): Promise<{ url: string, text: string }[]> {
    if (!page || page.isClosed()) return [];
    try {
      const baseHostname = new URL(baseUrl).hostname;
      const links = await page.evaluate((base) => {
        return Array.from(document.querySelectorAll('a[href]'))
          .map(link => {
            const href = link.getAttribute('href');
            const text = (link as HTMLElement).innerText || link.textContent || '';
            if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
              return null;
            }
            return { url: href, text: text.trim() };
          })
          .filter(Boolean);
      }, baseUrl); // Pass baseUrl to evaluate

      const resolvedLinks: { url: string, text: string }[] = [];
      for (const link of links) {
        if (!link) continue;
        try {
          const absoluteUrl = new URL(link.url, baseUrl).href; // Resolve relative URLs
          if (new URL(absoluteUrl).hostname === baseHostname) {
            resolvedLinks.push({ url: absoluteUrl, text: link.text || absoluteUrl });
          }
        } catch (e) {
          // Ignore invalid URLs
        }
      }
      // Simple relevance filter: prioritize links with longer text, limit count
      return resolvedLinks
        .sort((a, b) => b.text.length - a.text.length) // Prioritize longer text
        .slice(0, 10); // Limit to 10 links initially
    } catch (error) {
      console.error(`Error extracting links from ${baseUrl}:`, error);
      return [];
    }
  }

  private async _fetchSimpleContent(url: string): Promise<{ title: string | null, textContent: string | null, error?: string }> {
    // Simplified fetch using axios, focused on getting basic text
    try {
      const response = await axios.get(url, {
        timeout: 15000, // Shorter timeout for subsequent fetches
        headers: { 'User-Agent': CONFIG.USER_AGENT }
      });

      if (response.status === 200 && response.data && typeof response.data === 'string') {
        const contentType = response.headers['content-type'];
        if (contentType && (contentType.includes('html') || contentType.includes('text/plain'))) {
          // Basic HTML to text conversion
          const dom = new JSDOM(response.data, { url: url });
          const title = dom.window.document.title || null;
          let text = dom.window.document.body?.textContent || '';
          text = text.replace(/\s+/g, ' ').trim();
          // Truncate if very long
          if (text.length > 15000) {
            text = text.substring(0, 15000) + '... (content truncated)';
          }
          return { title, textContent: text };
        } else {
           return { title: null, textContent: null, error: `Unsupported content type: ${contentType}` };
        }
      } else {
        return { title: null, textContent: null, error: `HTTP status ${response.status}` };
      }
    } catch (error: unknown) { // Explicitly type error as unknown
      let errorMsg = 'Failed to fetch simple content';
      // Simplified error check focusing on Error instance and optional response property
      if (error instanceof Error) {
          errorMsg = error.message; // Base message from Error object
          // Attempt to access response status if available (duck typing for Axios-like error)
          if (typeof error === 'object' && error !== null && 'response' in error && typeof (error as any).response === 'object' && (error as any).response !== null && 'status' in (error as any).response) {
             errorMsg += ` (status: ${(error as any).response.status})`;
          }
      } else {
          // Handle cases where the thrown value is not an Error object
          errorMsg = String(error);
      }
      console.warn(`Simple fetch failed for ${url}: ${errorMsg}`);
      return { title: null, textContent: null, error: errorMsg };
    }
  }

  private async _recursiveFetch(
    startUrl: string,
    maxDepth: number,
    currentDepth: number,
    visitedUrls: Set<string>,
    results: PageContentResult[],
    globalTimeoutSignal: { timedOut: boolean }
  ): Promise<void> {

    if (currentDepth > maxDepth || visitedUrls.has(startUrl) || globalTimeoutSignal.timedOut) {
      return;
    }

    console.log(`[Depth ${currentDepth}] Fetching: ${startUrl}`);
    visitedUrls.add(startUrl);

    let pageResult: PageContentResult = { url: startUrl, title: null, textContent: null, error: null };
    let linksToExplore: { url: string, text: string }[] = [];

    try {
      // Use the robust single-page fetch for the first level, simple fetch for deeper levels
      if (currentDepth === 1) {
        // Use Puppeteer/Readability for the initial page
        if (!this.page || this.page.isClosed()) throw new Error("Main page instance is not valid for initial fetch.");

        // Navigate and extract using existing robust logic (needs adaptation)
        // For now, simulate fetching and link extraction
        await this.page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT_PROFILES.navigation });
        pageResult.title = await this.page.title();
        const html = await this.page.content();
        const dom = new JSDOM(html, { url: startUrl });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        pageResult.textContent = article?.textContent?.trim() || dom.window.document.body?.textContent?.trim() || null;
        if (pageResult.textContent && pageResult.textContent.length > 20000) {
           pageResult.textContent = pageResult.textContent.substring(0, 20000) + '... (truncated)';
        }
        linksToExplore = await this._extractSameDomainLinks(this.page, startUrl);

      } else {
        // Use the simpler axios fetch for subsequent levels
        const simpleResult = await this._fetchSimpleContent(startUrl);
        pageResult.title = simpleResult.title;
        pageResult.textContent = simpleResult.textContent;
        pageResult.error = simpleResult.error || null;
        // Don't extract links from simple fetches to limit scope/time
      }

      if (pageResult.textContent === null && pageResult.error === null) {
         pageResult.error = "Failed to extract content";
      }

    } catch (error) {
      console.error(`[Depth ${currentDepth}] Error fetching ${startUrl}:`, error);
      pageResult.error = error instanceof Error ? error.message : String(error);
    }

    results.push(pageResult);

    // Explore links only if depth allows and initial fetch was successful (or partially successful)
    if (currentDepth < maxDepth && !pageResult.error && linksToExplore.length > 0) {
      // Limit the number of links to explore per page to avoid excessive time/requests
      const linksToFollow = linksToExplore.slice(0, 3); // Explore max 3 links per page

      const promises = linksToFollow.map(link => {
        if (globalTimeoutSignal.timedOut) return Promise.resolve(); // Stop if global timeout hit
        return this._recursiveFetch(link.url, maxDepth, currentDepth + 1, visitedUrls, results, globalTimeoutSignal);
      });

      await Promise.all(promises);
    }
  }

  // --- Main Tool Handler ---
  private async handleExtractUrlContent(args: { url: string, depth?: number }): Promise<string> {
    const { url, depth = 1 } = args;
    const validatedDepth = Math.max(1, Math.min(depth, 5)); // Clamp depth between 1 and 5

    if (validatedDepth === 1) {
      // Use the existing single-page extraction logic
      return this._fetchSinglePageContent(url);
    } else {
      // --- Recursive Fetch Logic ---
      console.log(`Starting recursive fetch for ${url} up to depth ${validatedDepth}`);
      const visitedUrls = new Set<string>();
      const results: PageContentResult[] = [];
      const startTime = Date.now();
      const globalTimeoutDuration = CONFIG.PAGE_TIMEOUT - CONFIG.MCP_TIMEOUT_BUFFER - 5000; // 5s buffer
      let globalTimeoutHandle: NodeJS.Timeout | null = null;
      const globalTimeoutSignal = { timedOut: false };

      const timeoutPromise = new Promise<never>((_, reject) => { // Changed to Promise<never>
        globalTimeoutHandle = setTimeout(() => {
          console.warn(`Global recursive fetch timeout (${globalTimeoutDuration}ms) reached for ${url}`);
          globalTimeoutSignal.timedOut = true;
          reject(new Error(`Recursive fetch timed out after ${globalTimeoutDuration}ms`));
        }, globalTimeoutDuration);
      });

      try {
        // Ensure browser/page is ready for the initial fetch
        if (!this.page || this.page.isClosed()) {
          console.log('Page not available for initial recursive fetch, initializing...');
          await this.initializeBrowser(); // Re-initialize if needed
          if (!this.page) throw new Error('Failed to initialize page for recursive fetch.');
        }

        const fetchPromise = this._recursiveFetch(url, validatedDepth, 1, visitedUrls, results, globalTimeoutSignal);

        await Promise.race([fetchPromise, timeoutPromise]);

        if (globalTimeoutHandle) clearTimeout(globalTimeoutHandle);

        const successfulPages = results.filter(r => !r.error && r.textContent);
        const status: RecursiveFetchResult['status'] = successfulPages.length === results.length ? 'Success' : (successfulPages.length > 0 ? 'SuccessWithPartial' : 'Error');
        let message: string | undefined = undefined;
        if (status === 'SuccessWithPartial') message = `Fetched ${successfulPages.length}/${results.length} pages successfully. Some pages failed or timed out.`;
        if (status === 'Error' && results.length > 0) message = `Failed to fetch all content. Initial page fetch might have failed or timed out.`;
        else if (status === 'Error') message = `Failed to fetch any content. Initial page fetch might have failed or timed out.`;


        const output: RecursiveFetchResult = {
          status: status,
          message: message,
          rootUrl: url,
          explorationDepth: validatedDepth,
          pagesExplored: results.length, // Total attempted/visited
          content: results,
        };
        return JSON.stringify(output, null, 2);

      } catch (error) {
        if (globalTimeoutHandle) clearTimeout(globalTimeoutHandle);
        console.error(`Recursive fetch failed catastrophically for ${url}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Attempt to return partial results even on catastrophic failure if some were collected
        if (results.length > 0) {
           const output: RecursiveFetchResult = {
             status: 'SuccessWithPartial', // Indicate partial success despite error
             message: `Operation failed: ${errorMessage}. Returning partial results collected before failure.`,
             rootUrl: url,
             explorationDepth: validatedDepth,
             pagesExplored: results.length,
             content: results,
           };
           return JSON.stringify(output, null, 2);
        } else {
           // No results collected, return a clear error
           return JSON.stringify({
             status: "Error",
             message: `Recursive fetch failed: ${errorMessage}`,
             rootUrl: url,
             explorationDepth: validatedDepth,
             pagesExplored: 0,
             content: [],
           }, null, 2);
        }
      }
    }
  }


  // ─── TOOL HANDLER SETUP ──────────────────────────────────────────────

  // ─── TOOL HANDLER TYPES ──────────────────────────────────────────────
  private toolHandlers: {
    [key: string]: (args: any) => Promise<string>;
  } = {
    chat_perplexity: this.handleChatPerplexity.bind(this),
    get_documentation: this.handleGetDocumentation.bind(this),
    find_apis: this.handleFindApis.bind(this),
    check_deprecated_code: this.handleCheckDeprecatedCode.bind(this),
    search: this.handleSearch.bind(this),
    extract_url_content: this.handleExtractUrlContent.bind(this)
  };

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'chat_perplexity',
          description: 'Automatically call this tool for interactive, conversational queries. This tool leverages Perplexitys web search capabilities to provide real-time information and maintains conversation history using an optional chat ID for contextual follow-ups.',
          category: 'Conversation',
          keywords: ['chat', 'conversation', 'dialog', 'discussion', 'advice', 'brainstorm', 'debug'],
          use_cases: [
            'Continuing multi-turn conversations',
            'Context-aware question answering',
            'Follow-up questions'
          ],
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'The message to send to Perplexity AI for web search',
                examples: ['Explain quantum computing', 'Continue our previous discussion about AI safety']
              },
              chat_id: {
                type: 'string',
                description: 'Optional: ID of an existing chat to continue. If not provided, a new chat will be created.',
                examples: ['123e4567-e89b-12d3-a456-426614174000']
              }
            },
            required: ['message']
          },
          outputSchema: {
            type: 'object',
            description: 'Describes the structure of the JSON object returned within the response text field.',
            properties: {
              chat_id: {
                type: 'string',
                description: 'ID of the chat session (new or existing)'
              },
              response: {
                type: 'string',
                description: 'Perplexity AI response to the message'
              }
            }
          },
          examples: [
            {
              description: 'Simple question',
              input: { message: 'Explain quantum computing basics' },
              output: { 
                chat_id: 'new-chat-id',
                response: 'Quantum computing uses qubits that can exist in superposition...'
              }
            },
            {
              description: 'Continuing conversation',
              input: { 
                message: 'How does that compare to classical computing?',
                chat_id: 'existing-chat-id' 
              },
              output: {
                chat_id: 'existing-chat-id',
                response: 'Classical computers use bits that are either 0 or 1, while quantum...'
              }
            }
          ],
          related_tools: ['search', 'get_documentation']
        },
        {
          name: 'extract_url_content',
          description: "Uses browser automation (Puppeteer) and Mozilla's Readability library to extract the main article text content from a given URL. Handles dynamic JavaScript rendering and includes fallback logic. For GitHub repository URLs, it attempts to fetch structured content via gitingest.com. Performs a pre-check for non-HTML content types and checks HTTP status after navigation. Ideal for getting clean text from articles/blog posts. **Note: May struggle to isolate only core content on complex homepages or dashboards, potentially including UI elements.**",
          category: 'Information Extraction',
          keywords: ['extract', 'url', 'website', 'content', 'scrape', 'summarize', 'webpage', 'fetch', 'readability', 'article', 'dom', 'puppeteer', 'github', 'gitingest', 'repository'],
          use_cases: [
            'Getting the main text of a news article or blog post.',
            'Summarizing web page content.',
            'Extracting documentation text.',
            'Providing website context to other models.'
          ],
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'The URL of the website to extract content from.',
                examples: ['https://www.example.com/article']
              },
              depth: {
                type: 'number',
                description: 'Optional: Maximum depth for recursive link exploration (1-5). Default is 1 (no recursion).',
                minimum: 1,
                maximum: 5,
                default: 1,
                examples: [1, 3]
              }
            },
            required: ['url']
          },
          outputSchema: {
            type: 'object',
            description: 'Returns a JSON object. For depth=1, contains extraction status and content for the single URL. For depth>1, contains status, root URL, depth, pages explored, and an array of content objects for each explored page.',
            properties: {
              // Properties for depth=1 (existing)
              status: {
                type: 'string',
                enum: ['Success', 'SuccessWithFallback', 'SuccessWithPartial', 'Error'], // Added SuccessWithPartial
                description: 'Indicates the outcome of the extraction attempt.'
              },
              message: {
                type: 'string',
                description: 'Error message if status is "Error" or context for "SuccessWithPartial".'
              },
              title: {
                type: 'string',
                description: 'The extracted title of the page/article (only for depth=1).'
              },
              textContent: {
                type: 'string',
                description: 'The main extracted plain text content (only for depth=1).'
              },
              excerpt: {
                type: 'string',
                description: 'A short summary or excerpt, if available from Readability (only for depth=1).'
              },
              siteName: {
                type: 'string',
                description: 'The name of the website, if available from Readability (only for depth=1).'
              },
              byline: {
                type: 'string',
                description: 'The author or byline, if available from Readability (only for depth=1).'
              },
              fallbackSelector: {
                 type: 'string',
                 description: 'The CSS selector used if fallback logic was triggered (only for depth=1).'
              },
              // Properties for depth > 1
              rootUrl: {
                type: 'string',
                description: 'The initial URL provided for exploration (only for depth>1).'
              },
              explorationDepth: {
                type: 'number',
                description: 'The maximum depth requested for exploration (only for depth>1).'
              },
              pagesExplored: {
                type: 'number',
                description: 'The number of pages successfully fetched during exploration (only for depth>1).'
              },
              content: {
                type: 'array',
                description: 'Array containing results for each explored page (only for depth>1).',
                items: {
                  type: 'object',
                  properties: {
                    url: { type: 'string', description: 'URL of the explored page.' },
                    title: { type: 'string', description: 'Title of the explored page (if available).' },
                    textContent: { type: 'string', description: 'Extracted text content of the page (if successful).' },
                    error: { type: 'string', description: 'Error message if fetching this specific page failed.' }
                  },
                  required: ['url']
                }
              }
            }
            // required: ['status'] // Status is always required
          },
          examples: [
            {
              description: 'Successful extraction from an article',
              input: { url: 'https://example-article-url.com' },
              output: '{\n  "status": "Success",\n  "title": "Example Article Title",\n  "textContent": "The main body text of the article...",\n  "excerpt": "A short summary...",\n  "siteName": "Example News",\n  "byline": "Author Name"\n}'
            },
            {
              description: 'Extraction fails due to unsupported type',
              input: { url: 'https://example.com/document.pdf' },
              output: '{\n  "status": "Error",\n  "message": "Failed to extract content from https://example.com/document.pdf. Reason: Unsupported content type: application/pdf"\n}' // Depth=1 example
            },
            {
               description: 'Extraction using fallback logic (depth=1)',
               input: { url: 'https://example-non-article-url.com' }, // Depth defaults to 1
               output: '{\n  "status": "SuccessWithFallback",\n  "title": "Example Page Title",\n  "textContent": "Text extracted using fallback selector...",\n  "fallbackSelector": ".main-content"\n}'
            },
            {
              description: 'Recursive extraction (depth=2)',
              input: { url: 'https://example-docs-url.com/start', depth: 2 },
              output: '{\n  "status": "Success",\n  "rootUrl": "https://example-docs-url.com/start",\n  "explorationDepth": 2,\n  "pagesExplored": 3,\n  "content": [\n    {\n      "url": "https://example-docs-url.com/start",\n      "title": "Start Page",\n      "textContent": "Content of the starting page...",\n      "error": null\n    },\n    {\n      "url": "https://example-docs-url.com/topic1",\n      "title": "Topic 1 Details",\n      "textContent": "Details about topic 1...",\n      "error": null\n    },\n    {\n      "url": "https://example-docs-url.com/topic2",\n      "title": "Topic 2 Details",\n      "textContent": null,\n      "error": "Timeout fetching page"\n    }\n  ]\n}'
            }
          ],
          related_tools: ['search', 'get_documentation']
        },
        {
          name: 'get_documentation',
          description: 'Automatically call this tool when working with unfamiliar APIs/libraries, needing usage examples, or checking version specifics as this can access web. Example: When adding a payment gateway, ask "Get Stripe API documentation for creating charges".',
          category: 'Technical Reference',
          keywords: ['docs', 'documentation', 'api', 'reference', 'examples', 'usage', 'version'],
          use_cases: [
            'Learning new technologies',
            'API integration',
            'Troubleshooting code'
          ],
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The technology, library, or API to get documentation for',
                examples: ['React hooks', 'Python pandas', 'REST API best practices']
              },
              context: {
                type: 'string',
                description: 'Additional context or specific aspects to focus on',
                examples: ['focus on performance optimization', 'include TypeScript examples']
              }
            },
            required: ['query']
          },
          outputSchema: {
            type: 'object',
            properties: {
              response: {
                type: 'string',
                description: 'The raw text response from Perplexity containing documentation, examples, and potentially source URLs prefixed with "Official URL(s):". The calling agent should parse this text to extract URLs if needed for further processing.'
              }
            }
          },
          examples: [
            {
              description: 'Basic documentation request',
              input: { 
                query: 'React useEffect hook'
              },
              output: {
                documentation: 'The useEffect hook lets you perform side effects in function components...',
                examples: [
                  'useEffect(() => {\n  // Side effect code\n  return () => {\n    // Cleanup\n  };\n}, [dependency]);'
                ],
                references: [
                  'https://reactjs.org/docs/hooks-effect.html'
                ]
              }
            },
            {
              description: 'Context-specific request',
              input: {
                query: 'Python list comprehensions',
                context: 'show advanced nested examples'
              },
              output: {
                documentation: 'List comprehensions provide a concise way to create lists...',
                examples: [
                  '# Nested list comprehension\nmatrix = [[1, 2], [3, 4]]\nflattened = [num for row in matrix for num in row]'
                ],
                references: [
                  'https://docs.python.org/3/tutorial/datastructures.html#list-comprehensions'
                ]
              }
            }
          ],
          related_tools: ['search', 'check_deprecated_code']
        },
        {
          name: 'find_apis',
          description: 'Automatically call this tool when needing external services or real time current data (like API info, latest versions, etc.) from web. Compares options based on requirements. Example: When building a shopping site, ask "Find product image APIs with free tiers".',
          category: 'API Discovery',
          keywords: ['api', 'integration', 'services', 'endpoints', 'sdk', 'data', 'external'],
          use_cases: [
            'Finding APIs for specific functionality',
            'Comparing API alternatives',
            'Evaluating API suitability'
          ],
          inputSchema: {
            type: 'object',
            properties: {
              requirement: {
                type: 'string',
                description: 'The functionality or requirement you are looking to fulfill',
                examples: ['image recognition', 'payment processing', 'geolocation services']
              },
              context: {
                type: 'string',
                description: 'Additional context about the project or specific needs',
                examples: ['prefer free tier options', 'must support Python SDK']
              }
            },
            required: ['requirement']
          },
          outputSchema: {
            type: 'object',
            properties: {
              response: {
                type: 'string',
                description: 'The raw text response from Perplexity containing API suggestions and evaluations.'
              }
            }
          },
          examples: [
            {
              description: 'Finding payment APIs',
              input: {
                requirement: 'payment processing',
                context: 'needs Stripe alternative'
              },
              output: {
                apis: [
                  {
                    name: 'PayPal',
                    description: 'Global payment processing platform',
                    features: ['Credit cards', 'Bank transfers', 'Recurring payments'],
                    pricing: '2.9% + $0.30 per transaction',
                    documentation: 'https://developer.paypal.com'
                  },
                  {
                    name: 'Square',
                    description: 'Payment solutions for businesses',
                    features: ['In-person payments', 'Online payments', 'Inventory management'],
                    pricing: '2.6% + $0.10 per online transaction',
                    documentation: 'https://developer.squareup.com'
                  }
                ],
                comparison: 'PayPal has broader global support while Square offers more business tools...'
              }
            },
            {
              description: 'Finding geolocation APIs',
              input: {
                requirement: 'geolocation services',
                context: 'high accuracy required'
              },
              output: {
                apis: [
                  {
                    name: 'Google Maps Platform',
                    description: 'Comprehensive mapping and location services',
                    features: ['Geocoding', 'Reverse geocoding', 'Places API'],
                    pricing: 'Pay-as-you-go, $5 per 1000 requests',
                    documentation: 'https://developers.google.com/maps'
                  },
                  {
                    name: 'Mapbox',
                    description: 'Custom mapping and location services',
                    features: ['Directions API', 'Geocoding', 'Static maps'],
                    pricing: 'Free tier available, then $0.50 per 1000 requests',
                    documentation: 'https://docs.mapbox.com/api'
                  }
                ],
                comparison: 'Google offers higher accuracy but Mapbox is more cost-effective...'
              }
            }
          ],
          related_tools: ['get_documentation', 'search']
        },
        {
          name: 'check_deprecated_code',
          description: 'Automatically call this tool when reviewing legacy code, planning upgrades, or encountering warnings with real time web access. Helps identify technical debt. Example: During code reviews or before upgrading dependencies.',
          category: 'Code Analysis',
          keywords: ['deprecation', 'migration', 'upgrade', 'compatibility', 'linting', 'legacy', 'debt'],
          use_cases: [
            'Preparing for technology upgrades',
            'Maintaining backward compatibility',
            'Identifying technical debt'
          ],
          inputSchema: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                description: 'The code snippet or dependency to check',
                examples: ['componentWillMount()', 'var instead of let/const']
              },
              technology: {
                type: 'string',
                description: 'The technology or framework context (e.g., "React", "Node.js")',
                examples: ['React 16', 'Python 2.7', 'Node.js 12']
              }
            },
            required: ['code']
          },
          outputSchema: {
            type: 'object',
            properties: {
              response: {
                type: 'string',
                description: 'The raw text response from Perplexity analyzing the code for deprecated features.'
              }
            }
          },
          examples: [
            {
              description: 'React lifecycle method deprecation',
              input: {
                code: 'componentWillMount() {\n  // initialization code\n}',
                technology: 'React'
              },
              output: {
                deprecated_items: [
                  {
                    item: 'componentWillMount',
                    reason: 'Legacy lifecycle method, unsafe for async rendering',
                    recommended_replacement: 'Use constructor or componentDidMount instead',
                    severity: 'high'
                  }
                ],
                migration_guide: '1. Move initialization code to constructor\n2. For side effects, use componentDidMount\n3. Consider using useEffect for functional components',
                compatibility_notes: 'This change is required for React 17+ and concurrent mode features'
              }
            },
            {
              description: 'Python 2 to 3 migration',
              input: {
                code: 'print "Hello World"',
                technology: 'Python'
              },
              output: {
                deprecated_items: [
                  {
                    item: 'print statement',
                    reason: 'Python 2 syntax not supported in Python 3',
                    recommended_replacement: 'print("Hello World")',
                    severity: 'high'
                  }
                ],
                migration_guide: '1. Add parentheses around print arguments\n2. Run 2to3 tool for bulk conversion\n3. Test thoroughly for behavioral differences',
                compatibility_notes: 'Python 2 reached end-of-life in 2020, upgrade is strongly recommended'
              }
            }
          ],
          related_tools: ['get_documentation', 'search']
        },
        {
          name: 'search',
          description: 'Performs a web search using Perplexity AI based on the provided query and desired detail level. Useful for general knowledge questions, finding information, or getting different perspectives.',
          category: 'Web Search',
          keywords: ['search', 'web', 'internet', 'query', 'find', 'information', 'lookup', 'perplexity'],
          use_cases: [
            'Answering general knowledge questions.',
            'Finding specific information online.',
            'Getting quick summaries or detailed explanations.',
            'Researching topics.'
          ],
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query or question to ask Perplexity.',
                examples: ['What is the capital of France?', 'Explain black holes']
              },
              detail_level: {
                type: 'string',
                enum: ['brief', 'normal', 'detailed'],
                description: 'Optional: Controls the level of detail in the response (default: normal).',
                examples: ['brief', 'detailed']
              }
            },
            required: ['query']
          },
          outputSchema: {
            type: 'object',
            properties: {
              response: {
                type: 'string',
                description: 'The search result text provided by Perplexity AI.'
              }
            }
          },
          examples: [
            {
              description: 'Simple search query',
              input: { query: 'What is the weather in London?' },
              output: { response: 'The weather in London is currently...' }
            },
            {
              description: 'Detailed search query',
              input: { query: 'Explain the theory of relativity', detail_level: 'detailed' },
              output: { response: 'Albert Einstein\'s theory of relativity includes Special Relativity and General Relativity...' }
            }
          ],
          related_tools: ['chat_perplexity', 'get_documentation', 'find_apis']
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      // Set a timeout for the entire MCP request
      const requestTimeout = setTimeout(() => {
        console.error('MCP request is taking too long, this might lead to a timeout');
      }, 60000); // 60 seconds warning
      
      try {
        const toolName = request.params.name;
        const handler = this.toolHandlers[toolName];
        
        if (!handler) {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
        }

        const responseContent = await handler(request.params.arguments);
        
        // Special case for chat to return chat_id
        if (toolName === 'chat_perplexity') {
          const chatId = request.params.arguments.chat_id || crypto.randomUUID();
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ chat_id: chatId, response: responseContent }, null, 2)
            }]
          };
        }

        return {
          content: [{ type: 'text', text: responseContent }]
        };
      } catch (error) {
        console.error('Error in tool handler:', error);
        
        if (error instanceof Error) {
          const errorMsg = error.message;
          
          if (errorMsg.includes('timeout') || errorMsg.includes('Timed out')) {
            console.error('Timeout detected in MCP request');
            return {
              content: [{ 
                type: 'text', 
                text: 'The operation timed out. This might be due to high server load or network issues. Please try again with a more specific query.' 
              }]
            };
          }
          
          return {
            content: [{ 
              type: 'text', 
              text: `The operation encountered an error: ${errorMsg}. Please try again.` 
            }]
          };
        }
        
        throw new McpError(ErrorCode.InternalError, 'An unexpected error occurred');
      } finally {
        clearTimeout(requestTimeout);
      }
    });
  }

  // ─── RUN THE SERVER ────────────────────────────────────────────────

  async run() {
    try {
      await this.initializeBrowser();
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('Perplexity MCP server running');
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

const server = new PerplexityMCPServer();
server.run().catch(console.error);
