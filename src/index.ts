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
 * Safe logging function to handle all types of inputs and prevent JSON parsing errors
 * @param message Primary message or object to log
 * @param data Optional additional data to include in the log
 */
function safeLog(message: unknown, data?: unknown): void {
  let formattedMessage = '[LOG:INFO] ';
  
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
 * Safe error logging function with error prefix
 * @param message Primary message or object to log
 * @param data Optional additional data to include in the log
 */
function logError(message: unknown, data?: unknown): void {
  let formattedMessage = '[LOG:ERROR] ';
  
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
 * Safe warning logging function with warning prefix
 * @param message Primary message or object to log
 * @param data Optional additional data to include in the log
 */
function logWarn(message: unknown, data?: unknown): void {
  let formattedMessage = '[LOG:WARN] ';
  
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

// ... rest of the file remains the same ...
// Only the problematic methods have been included below with their fixes

class PerplexityMCPServer {
  // ... rest of the class methods remain the same ...

  private async recoveryProcedure(error?: Error) {
    const recoveryLevel = this.determineRecoveryLevel(error);
    const opId = ++this.operationCount;

    this.log('info', 'Starting recovery procedure');

    try {
      switch(recoveryLevel) {
        case 1: // Page refresh
          this.log('info', 'Attempting page refresh');
          if (this.page) {
            await this.page.reload({timeout: CONFIG.TIMEOUT_PROFILES.navigation});
          }
          break;

        case 2: // New page
          this.log('info', 'Creating new page instance');
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
          this.log('info', 'Performing full browser restart');
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

      // Use logError instead of log for completion message to ensure it uses stderr
      logError('Recovery completed');
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
    if (level === 'error') {
      logError(message);
    } else if (level === 'warn') {
      logWarn(message);
    } else {
      // Use console.error for info messages too to prevent JSON communication issues
      safeLog(message);
    }
  }

  // ... rest of the class methods remain the same ...
}