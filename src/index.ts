#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';

// Chrome interface definitions for TypeScript
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

const CONFIG = {
  SEARCH_COOLDOWN: 10000,
  PAGE_TIMEOUT: 60000,
  SELECTOR_TIMEOUT: 30000,
  MAX_RETRIES: 5,
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
} as const;

class PerplexityMCPServer {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private lastSearchTime = 0;
  private searchInputSelector: string = 'textarea[placeholder*="Ask"]';
  private server: Server;
  private isInitializing = false;

  constructor() {
    this.server = new Server(
      { name: 'perplexity-search', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    this.setupToolHandlers();
  }

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

      // Set default navigation timeout
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
      await this.page.goto('https://www.perplexity.ai/', {
        waitUntil: 'networkidle2',
        timeout: CONFIG.PAGE_TIMEOUT
      });

      // Wait for initial page load
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Try to find the search input
      const searchInput = await this.waitForSearchInput();
      if (!searchInput) {
        throw new Error('Search input not found after navigation');
      }
    } catch (error) {
      console.error('Navigation failed:', error);
      throw error;
    }
  }

  private async setupBrowserEvasion() {
    if (!this.page) return;

    await this.page.evaluateOnNewDocument(() => {
      // Override properties that could reveal automation
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

      // Add Chrome-specific properties
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
          getDetails: function() {},
          getIsInstalled: function() {},
          installState: function() {},
          isInstalled: false,
          runningState: function() {}
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

  private async waitForSearchInput(timeout = CONFIG.SELECTOR_TIMEOUT): Promise<string | null> {
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
          // Verify the element is truly interactive
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

    // Take a screenshot for debugging
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
      return selectors.some(selector => !!document.querySelector(selector));
    }, captchaIndicators);
  }

  private async recoveryProcedure() {
    console.log('Starting recovery procedure...');
    
    try {
      if (this.page) {
        await this.page.close();
      }
      if (this.browser) {
        await this.browser.close();
      }

      this.page = null;
      this.browser = null;

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Reinitialize
      await this.initializeBrowser();
    } catch (error) {
      console.error('Recovery failed:', error);
      throw error;
    }
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries = CONFIG.MAX_RETRIES
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await operation();
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Attempt ${i + 1} failed:`, error);

        if (i === maxRetries - 1) break;

        // Check for CAPTCHA before retrying
        if (await this.checkForCaptcha()) {
          console.error('CAPTCHA detected! Initiating recovery...');
          await this.recoveryProcedure();
          continue;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, i), 30000);
        await new Promise(resolve => setTimeout(resolve, delay));

        // Reload page if needed
        try {
          await this.navigateToPerplexity();
        } catch (navError) {
          console.error('Navigation failed during retry:', navError);
        }
      }
    }

    throw lastError || new Error('Operation failed after max retries');
  }

  private async waitForCompleteAnswer(page: Page): Promise<string> {
    return await page.evaluate(async () => {
      const getAnswer = () => {
        const elements = Array.from(document.querySelectorAll('.prose'));
        return elements.map(el => (el as HTMLElement).innerText.trim()).join('\n\n');
      };

      let lastAnswer = '';
      let lastLength = 0;
      let stabilityCounter = 0;
      const maxAttempts = 30;
      const checkInterval = 1000;

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        const currentAnswer = getAnswer();
        const currentLength = currentAnswer.length;

        if (currentLength > lastLength) {
          lastLength = currentLength;
          stabilityCounter = 0;
        } else if (currentAnswer === lastAnswer) {
          stabilityCounter++;
          if (stabilityCounter >= 5) {
            break;
          }
        }

        lastAnswer = currentAnswer;

        const isComplete = document.querySelector('.prose:last-child')?.textContent?.includes('.');
        if (isComplete && stabilityCounter >= 3) {
          break;
        }
      }

      return lastAnswer;
    });
  }

  private async performSearch(query: string): Promise<string> {
    if (!this.page) throw new Error('Page not initialized');
    await this.navigateToPerplexity();

    const selector = await this.waitForSearchInput();
    if (!selector) throw new Error('Search input not found');

    await this.page.evaluate((sel) => {
      const input = document.querySelector(sel) as HTMLTextAreaElement;
      if (input) input.value = '';
    }, selector);

    await this.page.type(selector, query, { delay: 50 });
    await this.page.keyboard.press('Enter');

    await this.page.waitForSelector('.prose', {
      timeout: CONFIG.SELECTOR_TIMEOUT,
      visible: true
    });

    const answer = await this.waitForCompleteAnswer(this.page);
    if (!answer) throw new Error('No answer content found');
    
    return answer;
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [{
        name: 'search',
        description: 'Search Perplexity.ai',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query'
            }
          },
          required: ['query']
        }
      }]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      try {
        if (!this.browser || !this.page) {
          await this.initializeBrowser();
        }

        const now = Date.now();
        if (now - this.lastSearchTime < CONFIG.SEARCH_COOLDOWN) {
          const waitTime = Math.ceil((CONFIG.SEARCH_COOLDOWN - (now - this.lastSearchTime)) / 1000);
          return {
            content: [{ type: 'text', text: `Please wait ${waitTime} seconds before next search` }],
            isError: true
          };
        }

        const result = await this.retryOperation(async () => {
          return await this.performSearch(request.params.arguments.query);
        });

        this.lastSearchTime = Date.now();
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        console.error('Search failed:', error);
        return {
          content: [{
            type: 'text',
            text: error instanceof Error ? `Search failed: ${error.message}` : 'Search failed: Unknown error'
          }],
          isError: true
        };
      }
    });
  }

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