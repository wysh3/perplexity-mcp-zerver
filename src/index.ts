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
  SEARCH_COOLDOWN: 10000,
  PAGE_TIMEOUT: 60000,
  SELECTOR_TIMEOUT: 30000,
  MAX_RETRIES: 5,
  USER_AGENT:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
} as const;

class PerplexityMCPServer {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private lastSearchTime = 0;
  private searchInputSelector: string = 'textarea[placeholder*="Ask"]';
  private server: Server;
  private isInitializing = false;
  private db: Database.Database;
  private idleTimeout: NodeJS.Timeout | null = null;
  private readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
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
      await this.page.goto('https://www.perplexity.ai/', {
        waitUntil: 'networkidle2',
        timeout: CONFIG.PAGE_TIMEOUT
      });
      // Allow extra time for the page to settle
      await new Promise((resolve) => setTimeout(resolve, 5000));
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
        await this.page.close();
      }
      if (this.browser) {
        await this.browser.close();
      }
      this.page = null;
      this.browser = null;
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 10000));
      await this.initializeBrowser();
    } catch (error) {
      console.error('Recovery failed:', error);
      throw error;
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
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await operation();
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Attempt ${i + 1} failed:`, error);
        if (i === maxRetries - 1) break;
        // If CAPTCHA is detected, try to recover
        if (await this.checkForCaptcha()) {
          console.error('CAPTCHA detected! Initiating recovery...');
          await this.recoveryProcedure();
          continue;
        }
        // Exponential backoff delay
        const delay = Math.min(1000 * Math.pow(2, i), 30000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        // Try re-navigating
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
        return elements.map((el) => (el as HTMLElement).innerText.trim()).join('\n\n');
      };
      let lastAnswer = '';
      let lastLength = 0;
      let stabilityCounter = 0;
      const maxAttempts = 30;
      const checkInterval = 1000;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
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
    // If browser/page is not initialized, initialize it
    if (!this.browser || !this.page) {
      await this.initializeBrowser();
    }

    if (!this.page) {
      throw new Error('Page initialization failed');
    }

    // Reset idle timeout
    this.resetIdleTimeout();

    await this.navigateToPerplexity();
    const selector = await this.waitForSearchInput();
    if (!selector) throw new Error('Search input not found');

    // Clear any existing text
    await this.page.evaluate((sel) => {
      const input = document.querySelector(sel) as HTMLTextAreaElement;
      if (input) input.value = '';
    }, selector);

    // Type the query slowly to simulate human input
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
        if (error instanceof Error) {
          throw new McpError(ErrorCode.InternalError, error.message);
        }
        throw error;
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
