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
import { performance } from 'perf_hooks'; // Added for performance monitoring

// ─── LOGGING & PERFORMANCE FUNCTIONS (Integrated from PR) ───────────────────
/**
 * Log levels used by the application
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Performance tracking metrics
 */
const performanceMarkers: Record<string, number> = {};

/**
 * Format a timestamp for logging
 * @returns Formatted timestamp [YYYY-MM-DD HH:MM:SS.mmm]
 */
function getTimestamp(): string {
  const now = new Date();
  return `[${now.toISOString().replace('T', ' ').replace('Z', '').substring(0, 23)}]`;
}

/**
 * Safe logging function to handle all types of inputs and prevent JSON parsing errors
 * @param level Log level (debug, info, warn, error)
 * @param message Primary message or object to log
 * @param data Optional additional data to include in the log
 */
function logMessage(level: LogLevel, message: unknown, data?: unknown): void {
  let logPrefix = '';

  switch(level) {
    case 'debug': logPrefix = '[DEBUG]'; break;
    case 'info': logPrefix = '[INFO] '; break;
    case 'warn': logPrefix = '[WARN] '; break;
    case 'error': logPrefix = '[ERROR]'; break;
  }

  let formattedMessage = `${getTimestamp()} ${logPrefix} `;

  // Format the primary message
  if (message instanceof Error) {
    formattedMessage += `${message.name}: ${message.message}`;
    if (message.stack) {
      formattedMessage += `\n${message.stack}`;
    }
  } else if (typeof message === 'object' && message !== null) {
    try {
      formattedMessage += JSON.stringify(message);
    } catch (e) {
      formattedMessage += `[Unstringifiable Object: ${Object.prototype.toString.call(message)}]`;
    }
  } else {
    formattedMessage += String(message);
  }

  // Add additional data if provided
  if (data !== undefined) {
    formattedMessage += ' ';
    if (data instanceof Error) {
      formattedMessage += `${data.name}: ${data.message}`;
      if (data.stack) {
        formattedMessage += `\n${data.stack}`;
      }
    } else if (typeof data === 'object' && data !== null) {
      try {
        formattedMessage += JSON.stringify(data);
      } catch (e) {
        formattedMessage += `[Unstringifiable Object: ${Object.prototype.toString.call(data)}]`;
      }
    } else {
      formattedMessage += String(data);
    }
  }

  // Use console.error to prevent JSON communication issues with MCP
  // All logs go to stderr as per PR's safer approach for MCP
  console.error(formattedMessage);
}

/**
 * Log debug information - only shows when DEBUG environment variable is set
 * @param message Primary message or object to log
 * @param data Optional additional data to include in the log
 */
function logDebug(message: unknown, data?: unknown): void {
  // Only log debug messages if DEBUG env variable is set
  if (process.env.DEBUG) {
    logMessage('debug', message, data);
  }
}

/**
 * Log info level messages
 * @param message Primary message or object to log
 * @param data Optional additional data to include in the log
 */
function logInfo(message: unknown, data?: unknown): void {
  logMessage('info', message, data);
}

/**
 * Log warning messages
 * @param message Primary message or object to log
 * @param data Optional additional data to include in the log
 */
function logWarn(message: unknown, data?: unknown): void {
  logMessage('warn', message, data);
}

/**
 * Log error messages
 * @param message Primary message or object to log
 * @param data Optional additional data to include in the log
 */
function logError(message: unknown, data?: unknown): void {
  logMessage('error', message, data);
}

/**
 * Start a performance measurement
 * @param markerId Unique identifier for the performance marker
 */
function startPerformanceMarker(markerId: string): void {
  performanceMarkers[markerId] = performance.now();
  logDebug(`Performance marker started: ${markerId}`);
}

/**
 * End a performance measurement and log the duration
 * @param markerId Unique identifier for the performance marker
 * @param description Description of the operation being measured
 * @returns Duration in milliseconds
 */
function endPerformanceMarker(markerId: string, description?: string): number {
  if (!performanceMarkers[markerId]) {
    logWarn(`Performance marker not found: ${markerId}`);
    return 0;
  }

  const duration = performance.now() - performanceMarkers[markerId];
  const desc = description || markerId;

  logDebug(`${desc} completed in ${duration.toFixed(2)}ms`);

  delete performanceMarkers[markerId];
  return duration;
}

// ─── INTERFACES ────────────────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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

    logInfo('PerplexityMCPServer initialized'); // Added initial log
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
    const markerId = `browserInit-${++this.operationCount}`;
    startPerformanceMarker(markerId);
    logInfo('Initializing browser...'); // Changed log level

    if (this.isInitializing) {
      logInfo('Browser initialization already in progress...'); // Changed log level
      endPerformanceMarker(markerId, 'Browser initialization (skipped, already in progress)');
      return;
    }
    this.isInitializing = true;
    try {
      if (this.browser) {
        logInfo('Closing existing browser instance...'); // Changed log level
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
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
      this.page = await this.browser.newPage();
      await this.setupBrowserEvasion();
      await this.page.setViewport({ width: 1920, height: 1080 });
      await this.page.setUserAgent(CONFIG.USER_AGENT);
      this.page.setDefaultNavigationTimeout(CONFIG.PAGE_TIMEOUT);
      await this.navigateToPerplexity();
      logInfo('Browser initialized successfully'); // Added success log
    } catch (error) {
      logError('Browser initialization failed:', error); // Changed log level
      throw error;
    } finally {
      this.isInitializing = false;
      endPerformanceMarker(markerId, 'Browser initialization');
    }
  }

  private async navigateToPerplexity() {
    const markerId = `nav-${++this.operationCount}`;
    startPerformanceMarker(markerId);
    if (!this.page) {
        endPerformanceMarker(markerId, 'Navigation (failed, page null)');
        throw new Error('Page not initialized');
    }
    try {
      logInfo('Navigating to Perplexity.ai...'); // Changed log level

      // Try multiple waitUntil strategies in case one fails
      const waitUntilOptions = ['networkidle2', 'domcontentloaded', 'load'] as const;
      let navigationSuccessful = false;
      
      for (const waitUntil of waitUntilOptions) {
        if (navigationSuccessful) break;
        
        try {
          logDebug(`Attempting navigation with waitUntil: ${waitUntil}`); // Changed log level
          await this.page.goto('https://www.perplexity.ai/', {
            waitUntil,
            timeout: CONFIG.PAGE_TIMEOUT
          });
          navigationSuccessful = true;
          logInfo(`Navigation successful with waitUntil: ${waitUntil}`); // Changed log level
        } catch (navError) {
          logWarn(`Navigation with waitUntil: ${waitUntil} failed:`, navError); // Changed log level
          // If this is the last option, we'll let the error propagate to the outer catch
          if (waitUntil !== waitUntilOptions[waitUntilOptions.length - 1]) {
            logInfo('Trying next navigation strategy...'); // Changed log level
          }
        }
      }
      
      if (!navigationSuccessful) {
        throw new Error('All navigation strategies failed');
      }

      // Allow extra time for the page to settle and JavaScript to initialize
      logInfo('Waiting for page to settle...'); // Changed log level
      await new Promise((resolve) => setTimeout(resolve, 7000)); // Increased from 5000 to 7000

      // Check if page loaded correctly
      const pageTitle = await this.page.title().catch(() => '');
      const pageUrl = this.page.url();
      logInfo(`Page loaded: ${pageUrl} (${pageTitle})`); // Changed log level

      // Verify we're on the correct domain
      if (!pageUrl.includes('perplexity.ai')) {
        logError(`Unexpected URL: ${pageUrl}`); // Changed log level
        throw new Error(`Navigation redirected to unexpected URL: ${pageUrl}`);
      }

      logInfo('Waiting for search input...'); // Changed log level
      const searchInput = await this.waitForSearchInput();
      if (!searchInput) {
        logError('Search input not found, taking screenshot for debugging'); // Changed log level
        await this.page.screenshot({ path: 'debug_no_search_input.png', fullPage: true });
        throw new Error('Search input not found after navigation');
      }

      logInfo('Navigation to Perplexity.ai completed successfully'); // Changed log level
      endPerformanceMarker(markerId, 'Navigation');
    } catch (error) {
      logError('Navigation failed:', error); // Changed log level
      endPerformanceMarker(markerId, 'Navigation (failed)');

      // Try to take a screenshot of the failed state if possible
      try {
        if (this.page) {
          await this.page.screenshot({ path: 'debug_navigation_failed.png', fullPage: true });
          logInfo('Captured screenshot of failed navigation state'); // Changed log level
        }
      } catch (screenshotError) {
        logError('Failed to capture screenshot:', screenshotError); // Changed log level
      }

      throw error; // Re-throw the original navigation error
    }
  }

  private async setupBrowserEvasion() {
    if (!this.page) {
        logWarn('Cannot setup browser evasion, page is null');
        return;
    }
    logDebug('Setting up browser evasion...');
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
      // Inject Chrome-specific properties
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
          }
        }
      };
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
            logInfo(`Found working search input: ${selector}`); // Changed log level
            this.searchInputSelector = selector;
            return selector;
          } else {
            logDebug(`Selector '${selector}' found but not interactive`);
          }
        }
      } catch (error) {
        // Don't log error here, it's expected if selector not found
        logDebug(`Selector '${selector}' not found or timed out`);
      }
    }
    // Take a screenshot for debugging if none is found
    logError('No working search input found after checking all selectors'); // Changed log level
    await this.page.screenshot({ path: 'debug_search_not_found.png', fullPage: true });
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
    if (errorMsg.includes('frame') || errorMsg.includes('detached')) {
      return 2; // New page for frame issues
    }
    if (errorMsg.includes('timeout') || errorMsg.includes('navigation')) {
      return 1; // Refresh for timeouts/navigation
    }
    return 3; // Full restart for other errors
  }

  private async recoveryProcedure(error?: Error) {
    const recoveryLevel = this.determineRecoveryLevel(error);
    const opId = ++this.operationCount;
    const markerId = `recovery-${opId}`;
    startPerformanceMarker(markerId);

    logError(`Starting recovery procedure (Level ${recoveryLevel})`, error); // Use logError for visibility

    try {
      switch(recoveryLevel) {
        case 1: // Page refresh
          logError('Recovery: Attempting page refresh'); // Use logError
          if (this.page) {
            await this.page.reload({timeout: CONFIG.TIMEOUT_PROFILES.navigation});
          }
          break;

        case 2: // New page
          logError('Recovery: Creating new page instance'); // Use logError
          if (this.page) {
            await this.page.close();
          }
          if (this.browser) {
            this.page = await this.browser.newPage();
            await this.setupBrowserEvasion();
            await this.page.setViewport({ width: 1920, height: 1080 });
            await this.page.setUserAgent(CONFIG.USER_AGENT);
          }
          break;

        case 3: // Full restart
        default:
          logError('Recovery: Performing full browser restart'); // Use logError
          if (this.page) {
            await this.page.close();
          }
          if (this.browser) {
            await this.browser.close();
          }
          this.page = null;
          this.browser = null;
          await new Promise(resolve => setTimeout(resolve, CONFIG.RECOVERY_WAIT_TIME));
          await this.initializeBrowser(); // This already has logging and perf markers
          break;
      }

      logError('Recovery completed'); // Use logError
      endPerformanceMarker(markerId, `Recovery Level ${recoveryLevel}`);
    } catch (recoveryError) {
      logError('Recovery failed', recoveryError); // Use logError
      endPerformanceMarker(markerId, `Recovery Level ${recoveryLevel} (failed)`);

      // Fall back to more aggressive recovery if initial attempt fails
      if (recoveryLevel < 3) {
        logError('Attempting higher level recovery'); // Use logError
        await this.recoveryProcedure(new Error('Fallback recovery'));
      } else {
        throw recoveryError; // Re-throw if highest level recovery failed
      }
    }
  }

  // Removed the old log method as we now use logInfo/Warn/Error/Debug

  private resetIdleTimeout() {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
    }

    this.idleTimeout = setTimeout(async () => {
      logInfo('Browser idle timeout reached, closing browser...'); // Changed log level
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
        logInfo('Browser cleanup completed successfully'); // Changed log level
      } catch (error) {
        logError('Error during browser cleanup:', error); // Changed log level
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
    const markerId = `retryOp-${++this.operationCount}`;
    startPerformanceMarker(markerId);
    let lastError: Error | null = null;
    let consecutiveTimeouts = 0;
    let consecutiveNavigationErrors = 0;

    for (let i = 0; i < maxRetries; i++) {
      try {
        logInfo(`Attempt ${i + 1}/${maxRetries}...`); // Changed log level
        const result = await operation();
        // Reset counters on success
        consecutiveTimeouts = 0;
        consecutiveNavigationErrors = 0;
        endPerformanceMarker(markerId, `Retry Operation (Success on attempt ${i + 1})`);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logError(`Attempt ${i + 1} failed:`, error); // Changed log level

        // Exit early if we've reached the max retries
        if (i === maxRetries - 1) {
          logError(`Maximum retry attempts (${maxRetries}) reached. Giving up.`); // Changed log level
          break;
        }

        // Check for specific error conditions
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isTimeoutError = errorMsg.includes('timeout') || errorMsg.includes('Timed out');
        const isNavigationError = errorMsg.includes('navigation') || errorMsg.includes('Navigation');
        const isConnectionError = errorMsg.includes('net::') || errorMsg.includes('connection') || errorMsg.includes('network');
        const isProtocolError = errorMsg.includes('Protocol error');
        
        // If CAPTCHA is detected, try to recover immediately
        if (await this.checkForCaptcha()) {
          logError('CAPTCHA detected! Initiating recovery...'); // Changed log level
          await this.recoveryProcedure();
          // Add a small delay after recovery
          await new Promise((resolve) => setTimeout(resolve, 3000));
          continue;
        }

        // Handle timeout errors with progressive backoff
        if (isTimeoutError) {
          logError(`Timeout detected during operation (${++consecutiveTimeouts} consecutive), attempting recovery...`); // Changed log level
          await this.recoveryProcedure();

          // If we have multiple consecutive timeouts, wait longer between attempts
          const timeoutWaitTime = Math.min(5000 * consecutiveTimeouts, 30000);
          logInfo(`Waiting ${timeoutWaitTime/1000} seconds after timeout...`); // Changed log level
          await new Promise((resolve) => setTimeout(resolve, timeoutWaitTime));
          continue;
        }

        // Handle navigation errors with progressive backoff
        if (isNavigationError) {
          logError(`Navigation error detected (${++consecutiveNavigationErrors} consecutive), attempting recovery...`); // Changed log level
          await this.recoveryProcedure();

          // If we have multiple consecutive navigation errors, wait longer
          const navWaitTime = Math.min(8000 * consecutiveNavigationErrors, 40000);
          logInfo(`Waiting ${navWaitTime/1000} seconds after navigation error...`); // Changed log level
          await new Promise((resolve) => setTimeout(resolve, navWaitTime));
          continue;
        }

        // Handle connection errors
        if (isConnectionError || isProtocolError) {
          logError('Connection or protocol error detected, attempting recovery with longer wait...'); // Changed log level
          await this.recoveryProcedure();
          // Wait longer for connection issues
          const connectionWaitTime = 15000 + (Math.random() * 10000);
          logInfo(`Waiting ${Math.round(connectionWaitTime/1000)} seconds after connection error...`); // Changed log level
          await new Promise((resolve) => setTimeout(resolve, connectionWaitTime));
          continue;
        }

        // Exponential backoff delay with progressive jitter to avoid thundering herd
        // More retries = more jitter to spread out retry attempts
        const baseDelay = Math.min(1000 * Math.pow(2, i), 30000);
        const maxJitter = Math.min(1000 * (i + 1), 10000); // Jitter increases with retry count
        const jitter = Math.random() * maxJitter;
        const delay = baseDelay + jitter;
        logInfo(`Retrying in ${Math.round(delay/1000)} seconds (base: ${Math.round(baseDelay/1000)}s, jitter: ${Math.round(jitter/1000)}s)...`); // Changed log level
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Try re-navigating with error handling
        try {
          logInfo('Attempting to re-navigate to Perplexity...'); // Changed log level
          await this.navigateToPerplexity(); // This has its own logging/perf
          logInfo('Re-navigation successful'); // Changed log level
        } catch (navError) {
          logError('Navigation failed during retry:', navError); // Changed log level
          // If navigation fails, wait a bit longer before next retry
          const navFailWaitTime = 10000 + (Math.random() * 5000);
          logInfo(`Navigation failed, waiting ${Math.round(navFailWaitTime/1000)} seconds before next attempt...`); // Changed log level
          await new Promise((resolve) => setTimeout(resolve, navFailWaitTime));

          // If this is a later retry attempt and navigation keeps failing, try a full recovery
          if (i > 1) {
            logInfo('Multiple navigation failures, attempting full recovery...'); // Changed log level
            await this.recoveryProcedure();
          }
        }
      }
    }

    // If we've exhausted all retries, provide a detailed error message
    const errorMessage = lastError ? 
      `Operation failed after ${maxRetries} retries. Last error: ${lastError.message}` : 
      `Operation failed after ${maxRetries} retries with unknown error`;

    logError(errorMessage); // Changed log level
    endPerformanceMarker(markerId, `Retry Operation (Failed after ${maxRetries} attempts)`);
    throw new Error(errorMessage);
  }

  private async waitForCompleteAnswer(page: Page): Promise<string> {
    const markerId = `waitForAnswer-${++this.operationCount}`;
    startPerformanceMarker(markerId);
    logInfo('Waiting for complete answer...'); // Added log

    // Set a timeout to ensure we don't wait indefinitely, but make it much longer
    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Waiting for complete answer timed out'));
      }, CONFIG.ANSWER_WAIT_TIMEOUT); // Use the dedicated answer wait timeout
    });

    const answerPromise = page.evaluate(async () => {
      // Note: console.log inside evaluate won't show in server logs directly
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
            // Content grew
            lastLength = currentLength;
            stabilityCounter = 0;
            noChangeCounter = 0;
          } else if (currentAnswer === lastAnswer) {
            // Content stable
            stabilityCounter++;
            noChangeCounter++;

            // Exit conditions based on stability and length
            if (currentLength > 1000 && stabilityCounter >= 3) break; // Long answer stable
            if (currentLength > 500 && stabilityCounter >= 4) break; // Medium answer stable
            if (stabilityCounter >= 5) break; // Short answer stable
          } else {
            // Content changed but didn't grow (e.g., formatting)
            noChangeCounter++;
            stabilityCounter = 0; // Reset stability if content changes
          }
          lastAnswer = currentAnswer;

          // Exit if content hasn't changed for a while but is substantial
          if (noChangeCounter >= 10 && currentLength > 200) break;
        }

        // Check for completion indicators (e.g., punctuation at the end)
        const lastProse = document.querySelector('.prose:last-child');
        const isComplete = lastProse?.textContent?.trim().match(/[.?!]$/); // Check for ending punctuation

        if (isComplete && stabilityCounter >= 2 && currentLength > 100) {
          break; // Exit if likely complete and stable
        }
      }
      return lastAnswer || 'No answer content found. The website may be experiencing issues.';
    });

    try {
      // Race between the answer generation and the timeout
      const result = await Promise.race([answerPromise, timeoutPromise]);
      endPerformanceMarker(markerId, 'Wait for Complete Answer');
      return result;
    } catch (error) {
      logError('Error waiting for complete answer:', error); // Changed log level
      endPerformanceMarker(markerId, 'Wait for Complete Answer (failed/timeout)');
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
            logError(`Attempt ${attempt + 1} to get partial answer failed:`, evalError); // Changed log level
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        return 'Answer retrieval timed out. The service might be experiencing high load. Please try again with a more specific query.';
      } catch (e) {
        logError('Failed to retrieve partial answer:', e); // Changed log level
        return 'Answer retrieval timed out. Please try again later.';
      }
    }
  }

  private async performSearch(query: string): Promise<string> {
    const markerId = `performSearch-${++this.operationCount}`;
    startPerformanceMarker(markerId);
    logInfo(`Performing search for query: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`); // Added log

    // Set a global timeout for the entire operation with a much longer duration
    const operationTimeout = setTimeout(() => {
      logError('Global operation timeout reached, initiating recovery...'); // Changed log level
      this.recoveryProcedure().catch(err => {
        logError('Recovery after timeout failed:', err); // Changed log level
      });
    }, CONFIG.PAGE_TIMEOUT - CONFIG.MCP_TIMEOUT_BUFFER);

    try {
      // If browser/page is not initialized or page is closed, initialize it
      if (!this.browser || !this.page || (this.page && this.page.isClosed())) {
        logInfo('Browser/page not initialized or page closed, initializing now...'); // Changed log level
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
      const result = await this.retryOperation(async () => {
        logDebug(`Navigating to Perplexity for query: "${query.substring(0, 30)}${query.length > 30 ? '...' : ''}"`); // Changed log level
        await this.navigateToPerplexity(); // Has own logging/perf

        // Validate main frame is attached
        if (!this.page || this.page.mainFrame().isDetached()) {
          logError('Main frame is detached, will retry with new browser instance'); // Changed log level
          throw new Error('Main frame is detached');
        }

        logDebug('Waiting for search input...'); // Changed log level
        const selector = await this.waitForSearchInput(); // Has own logging
        if (!selector) {
          // Error already logged in waitForSearchInput
          throw new Error('Search input not found');
        }

        logDebug(`Found search input with selector: ${selector}`); // Changed log level

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
          logWarn('Error clearing input field:', clearError); // Changed log level
          // Continue anyway, as the typing might still work
        }

        // Type the query with variable delay to appear more human-like
        logDebug('Typing search query...'); // Changed log level
        const typeDelay = Math.floor(Math.random() * 20) + 20; // Random delay between 20-40ms
        await this.page.type(selector, query, { delay: typeDelay });
        await this.page.keyboard.press('Enter');

        // Wait for response with multiple selector options and extended timeout
        logDebug('Waiting for response content selectors...'); // Changed log level
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
            logDebug(`Found response with selector: ${proseSelector}`); // Changed log level
            selectorFound = true;
            break;
          } catch (selectorError) {
            logDebug(`Selector ${proseSelector} not found, trying next...`); // Changed log level
          }
        }

        if (!selectorFound) {
          logError('No response selectors found, checking page state...'); // Changed log level
          // Check if page is still valid before throwing
          if (!this.page || this.page.mainFrame().isDetached()) {
            throw new Error('Page became invalid while waiting for response');
          }
          // Take a screenshot for debugging
          await this.page.screenshot({ path: 'debug_prose_not_found.png', fullPage: true });

          // Check if there's any visible text content that might contain an answer
          const pageText = await this.page.evaluate(() => document.body.innerText);
          if (pageText && pageText.length > 200) {
            logInfo('Found text content on page, attempting to extract answer via fallback...'); // Changed log level
            // Try to extract meaningful content
            return await this.extractFallbackAnswer(this.page);
          }

          throw new Error('Timed out waiting for response from Perplexity');
        }

        // waitForCompleteAnswer has its own logging/perf
        const answer = await this.waitForCompleteAnswer(this.page);
        logInfo(`Answer received (${answer.length} characters)`); // Changed log level
        return answer;
      }, CONFIG.MAX_RETRIES); // retryOperation has its own logging/perf

      endPerformanceMarker(markerId, 'Perform Search');
      return result;
    } catch (error) {
      logError('Search operation failed:', error); // Changed log level
      endPerformanceMarker(markerId, 'Perform Search (failed)');

      // Handle specific error cases
      if (error instanceof Error) {
        if (error.message.includes('detached') || error.message.includes('Detached')) {
          logError('Frame detachment detected, attempting recovery...'); // Changed log level
          await this.recoveryProcedure();
          // Return a helpful message instead of retrying to avoid potential infinite loops
          return 'The search operation encountered a technical issue. Please try again with a more specific query.';
        }

        if (error.message.includes('timeout') || error.message.includes('Timed out')) {
          logError('Timeout detected, attempting recovery...'); // Changed log level
          await this.recoveryProcedure();
          return 'The search operation is taking longer than expected. This might be due to high server load. Your query has been submitted and we\'re waiting for results. Please try again with a more specific query if needed.';
        }

        if (error.message.includes('navigation') || error.message.includes('Navigation')) {
          logError('Navigation error detected, attempting recovery...'); // Changed log level
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
      logError('Error in fallback answer extraction:', error); // Changed log level
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
10. Related tools/libraries that work well with it`;
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
      logWarn('Detailed analysis failed, trying simplified version:', error); // Changed log level

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

  // ─── TOOL HANDLER SETUP ──────────────────────────────────────────────

  // ─── TOOL HANDLER TYPES ──────────────────────────────────────────────
  private toolHandlers: {
    [key: string]: (args: any) => Promise<string>;
  } = {
    chat_perplexity: this.handleChatPerplexity.bind(this),
    get_documentation: this.handleGetDocumentation.bind(this),
    find_apis: this.handleFindApis.bind(this),
    check_deprecated_code: this.handleCheckDeprecatedCode.bind(this),
    search: this.handleSearch.bind(this)
  };

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'chat_perplexity',
          description: 'Maintains ongoing conversations with Perplexity AI using a persistent chat history. Starts new chats or continues existing ones with full context. Returns a stringified JSON object containing chat_id and response.',
          category: 'Conversation',
          keywords: ['chat', 'conversation', 'dialog', 'discussion'],
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
                description: 'The message to send to Perplexity AI',
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
          name: 'search',
          description: 'Perform a search query on Perplexity.ai with an optional detail level.',
          category: 'Information Retrieval',
          keywords: ['search', 'query', 'information', 'lookup'],
          use_cases: [
            'General knowledge questions',
            'Fact-finding missions',
            'Research assistance'
          ],
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query',
                examples: ['What is quantum computing?', 'Latest developments in AI safety']
              },
              detail_level: {
                type: 'string',
                description: 'Optional: Desired level of detail (brief, normal, detailed)',
                enum: ['brief', 'normal', 'detailed'],
                examples: ['detailed']
              }
            },
            required: ['query']
          },
          outputSchema: {
            type: 'object',
            properties: {
              response: {
                type: 'string',
                description: 'The search results from Perplexity'
              }
            }
          },
          examples: [
            {
              description: 'Brief fact check',
              input: { 
                query: 'Capital of France',
                detail_level: 'brief'
              },
              output: {
                response: 'The capital of France is Paris.'
              }
            },
            {
              description: 'Detailed research query',
              input: {
                query: 'Explain quantum computing principles',
                detail_level: 'detailed'
              },
              output: {
                response: 'Quantum computing uses quantum bits or qubits...'
              }
            }
          ],
          related_tools: ['chat_perplexity', 'get_documentation']
        },
        {
          name: 'get_documentation',
          description: 'Get documentation and usage examples for a specific technology, library, or API.',
          category: 'Technical Reference',
          keywords: ['docs', 'documentation', 'api', 'reference', 'examples'],
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
                description: 'The raw text response from Perplexity containing documentation and examples.'
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
          description: 'Find and evaluate APIs that could be integrated into a project.',
          category: 'API Discovery',
          keywords: ['api', 'integration', 'services', 'endpoints', 'sdk'],
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
          description: 'Check if code or dependencies might be using deprecated features.',
          category: 'Code Analysis',
          keywords: ['deprecation', 'migration', 'upgrade', 'compatibility', 'linting'],
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
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      const opId = ++this.operationCount;
      const markerId = `mcpCall-${opId}-${request.params.name}`;
      startPerformanceMarker(markerId);
      logInfo(`MCP Tool Call #${opId}: ${request.params.name}`, request.params.arguments); // Added log

      // Set a timeout for the entire MCP request
      const requestTimeout = setTimeout(() => {
        logError(`MCP request #${opId} (${request.params.name}) is taking too long, this might lead to a timeout`); // Changed log level
      }, 60000); // 60 seconds warning

      try {
        const toolName = request.params.name;
        const handler = this.toolHandlers[toolName];
        
        if (!handler) {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
        }

        // Handlers now contain their own logging/perf markers where appropriate
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

        endPerformanceMarker(markerId, `MCP Tool Call #${opId} ${toolName}`);
        return {
          content: [{ type: 'text', text: responseContent }]
        };
      } catch (error) {
        logError(`Error in tool handler #${opId} (${request.params.name}):`, error); // Changed log level
        endPerformanceMarker(markerId, `MCP Tool Call #${opId} ${request.params.name} (failed)`);

        if (error instanceof Error) {
          const errorMsg = error.message;

          if (errorMsg.includes('timeout') || errorMsg.includes('Timed out')) {
            logError(`Timeout detected in MCP request #${opId}`); // Changed log level
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
      await this.initializeBrowser(); // Has own logging/perf
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      logInfo('Perplexity MCP server connected and running'); // Changed log level
    } catch (error) {
      logError('Failed to start server:', error); // Changed log level
      process.exit(1);
    }
  }
}

const server = new PerplexityMCPServer();
// Add top-level catch for run() errors
server.run().catch(err => {
    logError('Unhandled error during server execution:', err);
    process.exit(1);
});
