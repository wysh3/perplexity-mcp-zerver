#!/usr/bin/env node

// Global declarations to augment the Window interface with chrome properties
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
import http from 'http';
import puppeteer, { Browser, Page } from 'puppeteer';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import crypto from 'crypto';

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const CONFIG = {
  SEARCH_COOLDOWN: 5000, // Reduced from 10000 to 5000
  PAGE_TIMEOUT: 180000, // Increased from 120000 to 180000
  SELECTOR_TIMEOUT: 90000, // Increased from 60000 to 90000
  MAX_RETRIES: 10, // Increased from 7 to 10
  MCP_TIMEOUT_BUFFER: 60000, // Increased from 30000 to 60000
  ANSWER_WAIT_TIMEOUT: 120000, // New timeout specifically for waiting for answers
  RECOVERY_WAIT_TIME: 15000, // Increased from 10000 to 15000
  USER_AGENT:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
} as const;

class PerplexityMCPServer {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private httpServer: http.Server | null = null;
  private port: number = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  private lastSearchTime = 0;
  private searchInputSelector: string = 'textarea[placeholder*="Ask"]';
  private server: Server;
  private isInitializing = false;
  private db: Database.Database;
  private idleTimeout: NodeJS.Timeout | null = null;
  private readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  
  constructor() {
    // Redirect console.log and console.error to stderr
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    console.log = (...args) => process.stderr.write(args.join(' ') + '\n');
    console.error = (...args) => process.stderr.write('[ERROR] ' + args.join(' ') + '\n');
  
    this.server = new Server(
      { name: 'perplexity-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
  
    // Initialize SQLite database (chat history)
    const dbPath = join(homedir(), '.perplexity-mcp', 'chat_history.db');
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
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
      this.page = await this.browser.newPage();
      await this.setupBrowserEvasion();
      await this.page.setViewport({ width: 1920, height: 1080 });
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
      
      // Try multiple waitUntil strategies in case one fails
      const waitUntilOptions = ['networkidle2', 'domcontentloaded', 'load'] as const;
      let navigationSuccessful = false;
      
      for (const waitUntil of waitUntilOptions) {
        if (navigationSuccessful) break;
        
        try {
          console.log(`Attempting navigation with waitUntil: ${waitUntil}`);
          await this.page.goto('https://www.perplexity.ai/', {
            waitUntil,
            timeout: CONFIG.PAGE_TIMEOUT
          });
          navigationSuccessful = true;
          console.log(`Navigation successful with waitUntil: ${waitUntil}`);
        } catch (navError) {
          console.warn(`Navigation with waitUntil: ${waitUntil} failed:`, navError);
          // If this is the last option, we'll let the error propagate to the outer catch
          if (waitUntil !== waitUntilOptions[waitUntilOptions.length - 1]) {
            console.log('Trying next navigation strategy...');
          }
        }
      }
      
      if (!navigationSuccessful) {
        throw new Error('All navigation strategies failed');
      }
      
      // Allow extra time for the page to settle and JavaScript to initialize
      console.log('Waiting for page to settle...');
      await new Promise((resolve) => setTimeout(resolve, 7000)); // Increased from 5000 to 7000
      
      // Check if page loaded correctly
      const pageTitle = await this.page.title().catch(() => '');
      const pageUrl = this.page.url();
      console.log(`Page loaded: ${pageUrl} (${pageTitle})`);
      
      // Verify we're on the correct domain
      if (!pageUrl.includes('perplexity.ai')) {
        console.error(`Unexpected URL: ${pageUrl}`);
        throw new Error(`Navigation redirected to unexpected URL: ${pageUrl}`);
      }
      
      console.log('Waiting for search input...');
      const searchInput = await this.waitForSearchInput();
      if (!searchInput) {
        console.error('Search input not found, taking screenshot for debugging');
        await this.page.screenshot({ path: 'debug_no_search_input.png', fullPage: true });
        throw new Error('Search input not found after navigation');
      }
      
      console.log('Navigation to Perplexity.ai completed successfully');
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
  
  private async recoveryProcedure() {
    console.log('Starting recovery procedure...');
    try {
      if (this.page) {
        await this.page.close().catch(err => console.error('Error closing page:', err));
      }
      if (this.browser) {
        await this.browser.close().catch(err => console.error('Error closing browser:', err));
      }
      this.page = null;
      this.browser = null;
      // Wait before retrying - use the configured recovery wait time
      console.log(`Waiting ${CONFIG.RECOVERY_WAIT_TIME/1000} seconds before reinitializing browser...`);
      await new Promise((resolve) => setTimeout(resolve, CONFIG.RECOVERY_WAIT_TIME));
      await this.initializeBrowser();
      console.log('Recovery procedure completed successfully');
    } catch (error) {
      console.error('Recovery failed:', error);
      // Wait a bit longer if recovery failed
      await new Promise((resolve) => setTimeout(resolve, CONFIG.RECOVERY_WAIT_TIME * 1.5));
      // Try one more time with minimal setup
      try {
        console.log('Attempting simplified browser initialization...');
        this.browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        this.page = await this.browser.newPage();
        await this.page.setUserAgent(CONFIG.USER_AGENT);
        console.log('Simplified browser initialization succeeded');
      } catch (secondError) {
        console.error('Secondary recovery attempt failed:', secondError);
        throw error; // Throw the original error
      }
    }
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
        const isProtocolError = errorMsg.includes('Protocol error');
        
        // If CAPTCHA is detected, try to recover immediately
        if (await this.checkForCaptcha()) {
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
        return elements.map((el) => (el as HTMLElement).innerText.trim()).join('\n\n');
      };
      let lastAnswer = '';
      let lastLength = 0;
      let stabilityCounter = 0;
      let noChangeCounter = 0;
      const maxAttempts = 60; // Increased from 40 to 60 for longer wait time
      const checkInterval = 600; // Decreased from 800 to 600 to check more frequently
      
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
        const currentAnswer = getAnswer();
        const currentLength = currentAnswer.length;
        
        // If we have content and it hasn't changed for a while, consider it complete
        if (currentLength > 0) {
          if (currentLength > lastLength) {
            // Content is still growing
            lastLength = currentLength;
            stabilityCounter = 0;
            noChangeCounter = 0;
          } else if (currentAnswer === lastAnswer) {
            // Content is stable
            stabilityCounter++;
            noChangeCounter++;
            
            // Different exit conditions based on content length
            if (currentLength > 1000 && stabilityCounter >= 3) {
              // For long answers, exit faster
              console.log('Long answer stabilized, exiting early');
              break;
            } else if (currentLength > 500 && stabilityCounter >= 4) {
              // For medium answers
              console.log('Medium answer stabilized, exiting');
              break;
            } else if (stabilityCounter >= 5) {
              // For short answers, wait longer
              console.log('Short answer stabilized, exiting');
              break;
            }
          } else {
            // Content changed but length didn't increase
            noChangeCounter++;
            stabilityCounter = 0;
          }
          lastAnswer = currentAnswer;
          
          // If content hasn't grown for a long time but has changed
          if (noChangeCounter >= 10 && currentLength > 200) {
            console.log('Content stopped growing but has sufficient information');
            break;
          }
        }
        
        // Check for completion indicators
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
      this.recoveryProcedure().catch(err => {
        console.error('Recovery after timeout failed:', err);
      });
    }, CONFIG.PAGE_TIMEOUT - CONFIG.MCP_TIMEOUT_BUFFER);
  
    try {
      // If browser/page is not initialized, initialize it
      if (!this.browser || !this.page) {
        console.log('Browser or page not initialized, initializing now...');
        await this.initializeBrowser();
      }
  
      if (!this.page) {
        throw new Error('Page initialization failed');
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
  
  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'chat_perplexity',
          description:
            'Maintains ongoing conversations with Perplexity AI using a persistent chat history. Starts new chats or continues existing ones with full context.',
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'The message to send to Perplexity AI'
              },
              chat_id: {
                type: 'string',
                description:
                  'Optional: ID of an existing chat to continue. If not provided, a new chat will be created.'
              }
            },
            required: ['message']
          }
        },
        {
          name: 'search',
          description:
            'Perform a search query on Perplexity.ai with an optional detail level.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query'
              },
              detail_level: {
                type: 'string',
                description:
                  'Optional: Desired level of detail (brief, normal, detailed)',
                enum: ['brief', 'normal', 'detailed']
              }
            },
            required: ['query']
          }
        },
        {
          name: 'get_documentation',
          description:
            'Get documentation and usage examples for a specific technology, library, or API.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description:
                  'The technology, library, or API to get documentation for'
              },
              context: {
                type: 'string',
                description: 'Additional context or specific aspects to focus on'
              }
            },
            required: ['query']
          }
        },
        {
          name: 'find_apis',
          description:
            'Find and evaluate APIs that could be integrated into a project.',
          inputSchema: {
            type: 'object',
            properties: {
              requirement: {
                type: 'string',
                description:
                  'The functionality or requirement you are looking to fulfill'
              },
              context: {
                type: 'string',
                description:
                  'Additional context about the project or specific needs'
              }
            },
            required: ['requirement']
          }
        },
        {
          name: 'check_deprecated_code',
          description:
            'Check if code or dependencies might be using deprecated features.',
          inputSchema: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                description: 'The code snippet or dependency to check'
              },
              technology: {
                type: 'string',
                description:
                  'The technology or framework context (e.g., "React", "Node.js")'
              }
            },
            required: ['code']
          }
        }
      ]
    }));
  
    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      // Set a timeout for the entire MCP request to ensure we respond before the MCP client times out
      const requestTimeout = setTimeout(() => {
        console.error('MCP request is taking too long, this might lead to a timeout');
      }, 60000); // 60 seconds warning
      
      try {
        switch (request.params.name) {
          // ── CHAT WITH HISTORY ──
          case 'chat_perplexity': {
            const { message, chat_id = crypto.randomUUID() } =
              request.params.arguments as { message: string; chat_id?: string };
            const history = this.getChatHistory(chat_id);
            const userMessage: ChatMessage = { role: 'user', content: message };
            this.saveChatMessage(chat_id, userMessage);
            // Build a conversation prompt from history
            let conversationPrompt = '';
            history.forEach((msg) => {
              conversationPrompt +=
                msg.role === 'user'
                  ? `User: ${msg.content}\n`
                  : `Assistant: ${msg.content}\n`;
            });
            conversationPrompt += `User: ${message}\n`;
            const responseContent = await this.performSearch(conversationPrompt);
            const assistantMessage: ChatMessage = {
              role: 'assistant',
              content: responseContent
            };
            this.saveChatMessage(chat_id, assistantMessage);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    { chat_id, response: responseContent },
                    null,
                    2
                  )
                }
              ]
            };
          }
          // ── GET DOCUMENTATION ──
          case 'get_documentation': {
            const { query, context = '' } =
              request.params.arguments as { query: string; context?: string };
            const prompt = `Provide comprehensive documentation and usage examples for ${query}. ${
              context ? 'Focus on: ' + context : ''
            } Include:
1. Basic overview and purpose
2. Key features and capabilities
3. Installation/setup if applicable
4. Common usage examples
5. Best practices
6. Common pitfalls to avoid
7. Links to official documentation if available.`;
            const responseContent = await this.performSearch(prompt);
            return {
              content: [{ type: 'text', text: responseContent }]
            };
          }
          // ── FIND APIS ──
          case 'find_apis': {
            const { requirement, context = '' } =
              request.params.arguments as { requirement: string; context?: string };
            const prompt = `Find and evaluate APIs that could be used for: ${requirement}. ${
              context ? 'Context: ' + context : ''
            } For each API, provide:
1. Name and brief description
2. Key features and capabilities
3. Pricing model (if available)
4. Integration complexity
5. Documentation quality
6. Community support and popularity
7. Any potential limitations or concerns
8. Code example of basic usage.`;
            const responseContent = await this.performSearch(prompt);
            return {
              content: [{ type: 'text', text: responseContent }]
            };
          }
          // ── CHECK DEPRECATED CODE ──
          case 'check_deprecated_code': {
            const { code, technology = '' } =
              request.params.arguments as { code: string; technology?: string };
            const prompt = `Analyze this code for deprecated features or patterns${
              technology ? ' in ' + technology : ''
            }:

${code}

Please provide:
1. Identification of any deprecated features, methods, or patterns
2. Current recommended alternatives
3. Migration steps if applicable
4. Impact of the deprecation
5. Timeline of deprecation if known
6. Code examples showing how to update to current best practices.`;
            const responseContent = await this.performSearch(prompt);
            return {
              content: [{ type: 'text', text: responseContent }]
            };
          }
          // ── GENERAL SEARCH ──
          case 'search': {
            const { query, detail_level = 'normal' } =
              request.params.arguments as {
                query: string;
                detail_level?: 'brief' | 'normal' | 'detailed';
              };
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
            const responseContent = await this.performSearch(prompt);
            return {
              content: [{ type: 'text', text: responseContent }]
            };
          }
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        console.error('Error in tool handler:', error);
        
        // Handle different types of errors with appropriate MCP error codes
        if (error instanceof Error) {
          const errorMsg = error.message;
          
          // Handle timeout errors specifically
          if (errorMsg.includes('timeout') || errorMsg.includes('Timed out')) {
            console.error('Timeout detected in MCP request');
            return {
              content: [{ 
                type: 'text', 
                text: 'The operation timed out. This might be due to high server load or network issues. Please try again with a more specific query.' 
              }]
            };
          }
          
          // For other errors, return a user-friendly message
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
  
  private listTools() {
    return [
      {
        name: 'search',
        description: 'Perform comprehensive web searches with adjustable detail levels.'
      },
      {
        name: 'get_documentation',
        description: 'Retrieve up-to-date documentation and code examples with contextual guidance.'
      },
      {
        name: 'find_apis',
        description: 'Discover and evaluate APIs based on technical requirements and compliance needs.'
      },
      {
        name: 'check_deprecated_code',
        description: 'Analyze code for outdated patterns and provide migration guidance.'
      },
      {
        name: 'chat_perplexity',
        description: 'Maintains ongoing conversations with Perplexity AI using a persistent chat history.'
      }
    ];
  }
  
  private async startHttpServer() {
    this.httpServer = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else if (req.url === '/tools') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.listTools()));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  
    return new Promise<void>((resolve, reject) => {
      this.httpServer?.listen(this.port, () => {
        console.log(`HTTP server listening on port ${this.port}`);
        resolve();
      }).on('error', (err) => {
        console.error('Failed to start HTTP server:', err);
        reject(err);
      });
    });
  }

  async run() {
    try {
      // Start HTTP server for health checks and endpoint access
      await this.startHttpServer();
      await this.initializeBrowser();
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('Perplexity MCP server running');
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  public async stop() {
    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer?.close(() => resolve()));
    }
    if (this.browser) {
      await this.browser.close();
    }
    if (this.db) {
      this.db.close();
    }
    await this.server.close();
  }
}

const server = new PerplexityMCPServer();
server.run().catch(console.error);
