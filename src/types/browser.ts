/**
 * Browser and Puppeteer related type definitions
 */
import type { Browser, Page } from "puppeteer";

// ─── GLOBAL BROWSER DECLARATIONS ─────────────────────────────────────────────
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

// ─── BROWSER CONFIG TYPES ─────────────────────────────────────────────
export interface BrowserConfig {
  USER_AGENT: string;
  PAGE_TIMEOUT: number;
  SELECTOR_TIMEOUT: number;
  MAX_RETRIES: number;
  RECOVERY_WAIT_TIME: number;
  TIMEOUT_PROFILES: {
    navigation: number;
  };
}

export interface RecoveryContext {
  hasValidPage: boolean;
  hasBrowser: boolean;
  isBrowserConnected: boolean;
  operationCount: number;
}

export interface ErrorAnalysis {
  isTimeout: boolean;
  isNavigation: boolean;
  isConnection: boolean;
  isDetachedFrame: boolean;
  isCaptcha: boolean;
  consecutiveTimeouts: number;
  consecutiveNavigationErrors: number;
}

// ─── PUPPETEER CONTEXT TYPE ───────────────────────────────────────────
export interface PuppeteerContext {
  browser: Browser | null;
  page: Page | null;
  isInitializing: boolean;
  searchInputSelector: string;
  lastSearchTime: number;
  idleTimeout: NodeJS.Timeout | null;
  operationCount: number;
  log: (level: "info" | "error" | "warn", message: string) => void;
  setBrowser: (browser: Browser | null) => void;
  setPage: (page: Page | null) => void;
  setIsInitializing: (val: boolean) => void;
  setSearchInputSelector: (selector: string) => void;
  setIdleTimeout: (timeout: NodeJS.Timeout | null) => void;
  incrementOperationCount: () => number;
  determineRecoveryLevel: (error?: Error) => number;
  IDLE_TIMEOUT_MS: number;
}

// ─── BROWSER MANAGER INTERFACE ────────────────────────────────────────
export interface IBrowserManager {
  initialize(): Promise<void>;
  navigateToPerplexity(): Promise<void>;
  waitForSearchInput(): Promise<string | null>;
  checkForCaptcha(): Promise<boolean>;
  performRecovery(error?: Error): Promise<void>;
  isReady(): boolean;
  cleanup(): Promise<void>;
  getPage(): Page | null;
  getBrowser(): Browser | null;
  resetIdleTimeout(): void;
  getPuppeteerContext(): PuppeteerContext;
}

// ─── CONTENT EXTRACTION TYPES ─────────────────────────────────────────
export interface PageContentResult {
  url: string;
  title?: string | null;
  textContent?: string | null;
  error?: string | null;
}

export interface RecursiveFetchResult {
  status: "Success" | "SuccessWithPartial" | "Error";
  message?: string;
  rootUrl: string;
  explorationDepth: number;
  pagesExplored: number;
  content: PageContentResult[];
}
