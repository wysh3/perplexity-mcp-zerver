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

// ─── LOGGING FUNCTIONS ─────────────────────────────────────────────────
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
  
  // Use console.error to prevent JSON communication issues
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

// Define server configuration constants
const CONFIG = {
  USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  TIMEOUT_PROFILES: {
    navigation: 30000,
    operation: 60000,
    search: 120000,
    chat: 120000,
  },
  RECOVERY_WAIT_TIME: 3000, // 3 seconds
  DB_SCHEMA: `
    CREATE TABLE IF NOT EXISTS chat_history (
      id TEXT PRIMARY KEY,
      messages TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `,
  DEFAULT_CHAT_TIMEOUT: 5 * 60 * 1000, // 5 minutes
};

class PerplexityMCPServer {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private db: Database.Database;
  private mcpServer: Server;
  private operationCount = 0;

  constructor() {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const dbDir = join(__dirname, '..');
    
    // Ensure the directory exists
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }
    
    // Initialize database
    this.db = new Database(join(dbDir, 'chat_history.db'));
    this.db.exec(CONFIG.DB_SCHEMA);
    
    // Initialize MCP server
    this.mcpServer = new Server(
      new StdioServerTransport(),
      {
        tools: [
          {
            name: 'search',
            description: 'Search for information on the web using Perplexity.ai',
            parameters: {
              type: 'object',
              required: ['query'],
              properties: {
                query: {
                  type: 'string',
                  description: 'The search query to submit to Perplexity',
                },
                focus: {
                  type: 'string',
                  description: 'Optional focus area for the search',
                  enum: ['brief', 'normal', 'detailed'],
                  default: 'normal',
                },
              },
            },
          },
          {
            name: 'get_documentation',
            description: 'Get documentation for a technology, library, or tool',
            parameters: {
              type: 'object',
              required: ['technology'],
              properties: {
                technology: {
                  type: 'string',
                  description: 'The technology, library, or tool to get documentation for',
                },
                context: {
                  type: 'string',
                  description: 'Optional context or specific functionality to focus on',
                },
              },
            },
          },
          {
            name: 'find_apis',
            description: 'Find APIs that match specific requirements',
            parameters: {
              type: 'object',
              required: ['requirements'],
              properties: {
                requirements: {
                  type: 'string',
                  description: 'Description of what you need the API to do',
                },
                context: {
                  type: 'string',
                  description: 'Optional additional context or constraints',
                },
              },
            },
          },
          {
            name: 'check_deprecated_code',
            description: 'Check if code contains deprecated features',
            parameters: {
              type: 'object',
              required: ['code', 'context'],
              properties: {
                code: {
                  type: 'string',
                  description: 'The code snippet to analyze',
                },
                context: {
                  type: 'string',
                  description: 'The technology context (e.g., "React 18", "Node.js 20")',
                },
              },
            },
          },
          {
            name: 'chat_perplexity',
            description: 'Chat with Perplexity AI',
            parameters: {
              type: 'object',
              required: ['message'],
              properties: {
                message: {
                  type: 'string',
                  description: 'The message to send to Perplexity',
                },
                chat_id: {
                  type: 'string',
                  description: 'Optional chat ID to continue an existing conversation',
                },
              },
            },
          },
        ],
      }
    );

    // Log server initialization
    logInfo('PerplexityMCPServer initialized');
  }

  /**
   * Start the server and handle incoming requests
   */
  public async start(): Promise<void> {
    try {
      // Initialize browser
      startPerformanceMarker('browserInit');
      await this.initializeBrowser();
      endPerformanceMarker('browserInit', 'Browser initialization');
      
      // Start listening for requests
      logInfo('Starting MCP server');
      this.mcpServer.handleListTools(ListToolsRequestSchema, async () => {
        logDebug('List tools request received');
        return {};
      });
      
      this.mcpServer.handleCallTool(CallToolRequestSchema, async (request) => {
        const { tool, parameters } = request;
        const opId = ++this.operationCount;
        
        logInfo(`Tool call #${opId}: ${tool}`, parameters);
        startPerformanceMarker(`op-${opId}`);
        
        try {
          let result: unknown;
          
          switch (tool) {
            case 'search':
              result = await this.handleSearch(parameters, opId);
              break;
            case 'get_documentation':
              result = await this.handleGetDocumentation(parameters, opId);
              break;
            case 'find_apis':
              result = await this.handleFindAPIs(parameters, opId);
              break;
            case 'check_deprecated_code':
              result = await this.handleCheckDeprecatedCode(parameters, opId);
              break;
            case 'chat_perplexity':
              result = await this.handleChat(parameters, opId);
              break;
            default:
              throw new McpError(
                ErrorCode.InvalidArgument,
                `Unknown tool: ${tool}`
              );
          }
          
          const duration = endPerformanceMarker(`op-${opId}`, `Operation #${opId}`);
          logInfo(`Tool call #${opId} completed in ${duration.toFixed(2)}ms`);
          
          return { result };
        } catch (error) {
          // End performance marker even on error
          endPerformanceMarker(`op-${opId}`);
          
          logError(`Tool call #${opId} failed: ${tool}`, error);
          
          // Attempt recovery if this looks like a browser/page issue
          if (this.shouldAttemptRecovery(error)) {
            logInfo(`Attempting recovery for operation #${opId}`);
            await this.recoveryProcedure(error instanceof Error ? error : new Error(String(error)));
          }
          
          // Re-throw the error to be handled by MCP server
          throw error;
        }
      });
      
      // Start listening
      this.mcpServer.listen();
      logInfo('MCP server started and listening for requests');
      
    } catch (error) {
      logError('Failed to start server', error);
      // Attempt to clean up
      await this.cleanup();
      // Re-throw to let the process exit with an error
      throw error;
    }
  }

  /**
   * Initialize the browser instance
   */
  private async initializeBrowser(): Promise<void> {
    logInfo('Initializing browser');
    
    try {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
        ],
      });
      
      this.page = await this.browser.newPage();
      await this.setupBrowserEvasion();
      await this.page.setViewport({ width: 1920, height: 1080 });
      await this.page.setUserAgent(CONFIG.USER_AGENT);
      
      logInfo('Browser initialized successfully');
    } catch (error) {
      logError('Browser initialization failed', error);
      throw error;
    }
  }

  /**
   * Set up browser evasion techniques to avoid detection
   */
  private async setupBrowserEvasion(): Promise<void> {
    if (!this.page) {
      logError('Cannot set up browser evasion: page is null');
      return;
    }
    
    try {
      logDebug('Setting up browser evasion');
      
      // Override navigator properties to avoid detection
      await this.page.evaluateOnNewDocument(() => {
        // Overwrite the languages property to make it look more natural
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en', 'es'],
        });
        
        // Override plugins and mimeTypes
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            const plugins = { length: 0 };
            return plugins;
          },
        });
        
        // Override webdriver property
        delete (navigator as any).__proto__.webdriver;
        
        // Override chrome property
        // We need to add this property because some sites check for it
        (window as any).chrome = {
          runtime: {},
          app: {
            InstallState: {
              DISABLED: 'disabled',
              INSTALLED: 'installed',
              NOT_INSTALLED: 'not_installed',
            },
            RunningState: {
              CANNOT_RUN: 'cannot_run',
              READY_TO_RUN: 'ready_to_run',
              RUNNING: 'running',
            },
            getDetails: function() {},
            getIsInstalled: function() {},
            installState: function() {},
            isInstalled: true,
            runningState: function() {},
          },
        };
        
        // Override permissions API
        if ((navigator as any).permissions) {
          const originalQuery = (navigator as any).permissions.query;
          (navigator as any).permissions.query = (parameters: any) => {
            return parameters.name === 'notifications'
              ? Promise.resolve({ state: Notification.permission })
              : originalQuery(parameters);
          };
        }
      });
      
      logDebug('Browser evasion setup complete');
    } catch (error) {
      logWarn('Failed to set up browser evasion', error);
      // Continue even if browser evasion setup fails
    }
  }

  /**
   * Clean up resources when shutting down
   */
  private async cleanup(): Promise<void> {
    logInfo('Cleaning up resources');
    
    try {
      // Close the page if it exists
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      
      // Close the browser if it exists
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      
      // Close the database connection
      if (this.db) {
        this.db.close();
      }
      
      logInfo('Cleanup completed successfully');
    } catch (error) {
      logError('Cleanup failed', error);
    }
  }

  /**
   * Determine if we should attempt recovery for a given error
   */
  private shouldAttemptRecovery(error: unknown): boolean {
    const errorStr = String(error);
    
    // Check for common browser/page errors that can be recovered from
    return (
      errorStr.includes('Protocol error') ||
      errorStr.includes('Target closed') ||
      errorStr.includes('Session closed') ||
      errorStr.includes('Navigation timeout') ||
      errorStr.includes('timeout') ||
      errorStr.includes('Execution context was destroyed') ||
      errorStr.includes('Cannot find context with specified id') ||
      errorStr.includes('CAPTCHA')
    );
  }

  /**
   * Determine the level of recovery needed based on the error
   */
  private determineRecoveryLevel(error?: Error): number {
    if (!error) return 1; // Default to page refresh
    
    const errorStr = error.toString().toLowerCase();
    
    // Level 3 (full restart) for severe issues
    if (
      errorStr.includes('session closed') ||
      errorStr.includes('target closed') ||
      errorStr.includes('browser disconnected')
    ) {
      return 3;
    }
    
    // Level 2 (new page) for page-specific issues
    if (
      errorStr.includes('execution context') ||
      errorStr.includes('cannot find context') ||
      errorStr.includes('frame detached')
    ) {
      return 2;
    }
    
    // Level 1 (page refresh) for mild issues or captcha
    return 1;
  }

  /**
   * Recovery procedure to handle browser/page issues
   */
  private async recoveryProcedure(error?: Error): Promise<void> {
    const recoveryLevel = this.determineRecoveryLevel(error);
    const opId = ++this.operationCount;
    const markerId = `recovery-${opId}`;
    
    logInfo(`Starting recovery procedure (level ${recoveryLevel})`);
    startPerformanceMarker(markerId);

    try {
      switch(recoveryLevel) {
        case 1: // Page refresh
          logInfo('Recovery: Attempting page refresh');
          if (this.page) {
            await this.page.reload({timeout: CONFIG.TIMEOUT_PROFILES.navigation});
          }
          break;

        case 2: // New page
          logInfo('Recovery: Creating new page instance');
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
          logInfo('Recovery: Performing full browser restart');
          if (this.page) {
            await this.page.close();
          }
          if (this.browser) {
            await this.browser.close();
          }
          this.page = null;
          this.browser = null;
          await new Promise(resolve => setTimeout(resolve, CONFIG.RECOVERY_WAIT_TIME));
          await this.initializeBrowser();
          break;
      }

      const duration = endPerformanceMarker(markerId);
      logInfo(`Recovery completed in ${duration.toFixed(2)}ms`);
    } catch (recoveryError) {
      endPerformanceMarker(markerId);
      logError('Recovery failed', recoveryError);

      // Fall back to more aggressive recovery if initial attempt fails
      if (recoveryLevel < 3) {
        logInfo('Attempting higher level recovery');
        await this.recoveryProcedure(new Error('Fallback recovery'));
      } else {
        throw recoveryError;
      }
    }
  }

  /**
   * Handle search requests
   */
  private async handleSearch(parameters: any, opId: number): Promise<string> {
    const { query, focus = 'normal' } = parameters;
    
    if (!query) {
      throw new McpError(
        ErrorCode.InvalidArgument,
        'Search query is required'
      );
    }
    
    logInfo(`Search #${opId} query: ${query}, focus: ${focus}`);
    // Implementation would go here
    
    // This is a placeholder for actual implementation
    return `Search results for "${query}" with focus "${focus}"`;
  }

  /**
   * Handle documentation requests
   */
  private async handleGetDocumentation(parameters: any, opId: number): Promise<string> {
    const { technology, context } = parameters;
    
    if (!technology) {
      throw new McpError(
        ErrorCode.InvalidArgument,
        'Technology is required'
      );
    }
    
    logInfo(`Documentation #${opId} for: ${technology}${context ? `, context: ${context}` : ''}`);
    // Implementation would go here
    
    // This is a placeholder for actual implementation
    return `Documentation for "${technology}"${context ? ` with context "${context}"` : ''}`;
  }

  /**
   * Handle API finding requests
   */
  private async handleFindAPIs(parameters: any, opId: number): Promise<string> {
    const { requirements, context } = parameters;
    
    if (!requirements) {
      throw new McpError(
        ErrorCode.InvalidArgument,
        'Requirements are needed to find APIs'
      );
    }
    
    logInfo(`Find APIs #${opId}: ${requirements}${context ? `, context: ${context}` : ''}`);
    // Implementation would go here
    
    // This is a placeholder for actual implementation
    return `APIs matching "${requirements}"${context ? ` with context "${context}"` : ''}`;
  }

  /**
   * Handle code deprecation check requests
   */
  private async handleCheckDeprecatedCode(parameters: any, opId: number): Promise<string> {
    const { code, context } = parameters;
    
    if (!code || !context) {
      throw new McpError(
        ErrorCode.InvalidArgument,
        'Both code and context are required'
      );
    }
    
    logInfo(`Check deprecated code #${opId} for context: ${context}`);
    logDebug(`Code length: ${code.length} characters`);
    // Implementation would go here
    
    // This is a placeholder for actual implementation
    return `Deprecation analysis for code in context "${context}"`;
  }

  /**
   * Handle chat requests
   */
  private async handleChat(parameters: any, opId: number): Promise<string> {
    const { message, chat_id } = parameters;
    
    if (!message) {
      throw new McpError(
        ErrorCode.InvalidArgument,
        'Message is required for chat'
      );
    }
    
    logInfo(`Chat #${opId}${chat_id ? ` (ID: ${chat_id})` : ' (new chat)'}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
    // Implementation would go here
    
    // Generate a new chat ID if none was provided
    const chatId = chat_id || crypto.randomUUID();
    
    // This is a placeholder for actual implementation
    const response = {
      chat_id: chatId,
      response: `Response to: "${message.substring(0, 30)}${message.length > 30 ? '...' : ''}"`,
    };
    
    return JSON.stringify(response);
  }

  /**
   * Unified logging method that directs to the appropriate log function
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    switch (level) {
      case 'debug':
        logDebug(message, data);
        break;
      case 'info':
        logInfo(message, data);
        break;
      case 'warn':
        logWarn(message, data);
        break;
      case 'error':
        logError(message, data);
        break;
    }
  }
}

// Run the server
const server = new PerplexityMCPServer();
server.start().catch((error) => {
  logError('Fatal error starting server', error);
  process.exit(1);
});