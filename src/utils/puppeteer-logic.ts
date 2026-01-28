/**
 * Pure business logic extracted from puppeteer utilities
 * These functions can be tested without mocking Puppeteer
 */

import type { ErrorAnalysis, RecoveryContext } from "../types/index.js";
import { logWarn } from "./logging.js";

const SECURITY_DISABLED = process.env["PERPLEXITY_SECURITY_DISABLED"] === "true";

if (SECURITY_DISABLED) {
  logWarn("⚠️ Security features disabled. SSRF and RCE risks present.");
}

/**
 * Determine recovery level based on error and context
 */
export function determineRecoveryLevel(error?: Error, context?: RecoveryContext): number {
  if (!error) return 1;

  const errorMsg = error.message.toLowerCase();

  // Critical errors require full restart
  if (
    errorMsg.includes("frame") ||
    errorMsg.includes("detached") ||
    errorMsg.includes("session closed") ||
    errorMsg.includes("target closed") ||
    errorMsg.includes("protocol error")
  ) {
    return 3; // Full restart
  }

  // Browser connectivity issues
  if (!context?.hasBrowser || !context?.isBrowserConnected) {
    return 3; // Full restart
  }

  // Page issues
  if (!context?.hasValidPage) {
    return 2; // New page
  }

  // Default to page refresh
  return 1;
}

/**
 * Analyze error characteristics
 */
export function analyzeError(error: Error | string): ErrorAnalysis {
  const errorMsg = typeof error === "string" ? error : error.message;
  const lowerMsg = errorMsg.toLowerCase();

  return {
    isTimeout: lowerMsg.includes("timeout") || lowerMsg.includes("timed out"),
    isNavigation: lowerMsg.includes("navigation") || lowerMsg.includes("Navigation"),
    isConnection:
      lowerMsg.includes("net::") || lowerMsg.includes("connection") || lowerMsg.includes("network"),
    isDetachedFrame:
      lowerMsg.includes("frame") ||
      lowerMsg.includes("detached") ||
      lowerMsg.includes("session closed"),
    isCaptcha: lowerMsg.includes("captcha") || lowerMsg.includes("challenge"),
    consecutiveTimeouts: 0, // This would be tracked externally
    consecutiveNavigationErrors: 0, // This would be tracked externally
  };
}

/**
 * Generate non-cryptographic jitter for retry delays
 * Note: Math.random() is safe here - only used for timing distribution, not security
 */
function generateRetryJitter(maxJitter: number): number {
  return Math.random() * maxJitter;
}

/**
 * Generate variable delay for connection errors to distribute load
 * Note: Math.random() is safe here - only used for timing distribution, not security
 */
function generateConnectionDelay(): number {
  return 15000 + Math.random() * 10000; // 15-25 seconds
}

/**
 * Generate variable delay for detached frame errors
 * Note: Math.random() is safe here - only used for timing distribution, not security
 */
function generateDetachedFrameDelay(): number {
  return 10000 + Math.random() * 5000; // 10-15 seconds
}

/**
 * Calculate retry delay with exponential backoff and jitter
 */
export function calculateRetryDelay(
  attemptNumber: number,
  errorAnalysis: ErrorAnalysis,
  maxDelay = 30000,
): number {
  let baseDelay: number;

  if (errorAnalysis.isTimeout) {
    baseDelay = Math.min(5000 * (errorAnalysis.consecutiveTimeouts + 1), maxDelay);
  } else if (errorAnalysis.isNavigation) {
    baseDelay = Math.min(8000 * (errorAnalysis.consecutiveNavigationErrors + 1), 40000);
  } else if (errorAnalysis.isConnection) {
    baseDelay = generateConnectionDelay();
  } else if (errorAnalysis.isDetachedFrame) {
    baseDelay = generateDetachedFrameDelay();
  } else {
    // Standard exponential backoff
    baseDelay = Math.min(1000 * 2 ** attemptNumber, maxDelay);
  }

  // Add jitter to prevent thundering herd problems
  const maxJitter = Math.min(1000 * (attemptNumber + 1), 10000);
  const jitter = generateRetryJitter(maxJitter);

  return baseDelay + jitter;
}

/**
 * Generate comprehensive browser launch arguments optimized for Cloudflare bypass
 */
export function generateBrowserArgs(userAgent: string): string[] {
  const flags: string[] = [];

  if (SECURITY_DISABLED) {
    flags.push("--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security");
  } else {
    flags.push(
      "--disable-dev-shm-usage",
      "--disable-sync",
      "--metrics-recording-only",
      "--safebrowsing-disable-auto-update",
      "--disable-extensions",
      "--disable-plugins-discovery",
    );
  }

  flags.push(
    "--disable-blink-features=AutomationControlled",
    "--disable-features=IsolateOrigins,site-per-process",
    "--disable-infobars",
    "--disable-notifications",
    "--disable-popup-blocking",
    "--disable-default-apps",
    "--disable-translate",
    "--disable-background-networking",
    "--disable-client-side-phishing-detection",
    "--disable-component-update",
    "--disable-hang-monitor",
    "--disable-prompt-on-repost",
    "--disable-domain-reliability",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-breakpad",
    "--disable-component-extensions-with-background-pages",
    "--disable-ipc-flooding-protection",
    "--disable-back-forward-cache",
    "--disable-partial-raster",
    "--disable-skia-runtime-opts",
    "--disable-smooth-scrolling",
    "--disable-features=site-per-process,TranslateUI,BlinkGenPropertyTrees",
    "--enable-features=NetworkService,NetworkServiceInProcess",
    "--disable-accelerated-2d-canvas",
    "--disable-gpu",
    "--force-color-profile=srgb",
    "--mute-audio",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    "--use-mock-keychain",
    "--window-size=1280,720",
    `--user-agent=${userAgent}`,
  );

  return flags;
}

/**
 * List of possible search input selectors in priority order
 */
export function getSearchInputSelectors(): string[] {
  return [
    'textarea[placeholder*="Ask"]',
    'textarea[placeholder*="Search"]',
    "textarea.w-full",
    'textarea[rows="1"]',
    '[role="textbox"]',
    "textarea",
  ];
}

/**
 * Comprehensive CAPTCHA and Cloudflare challenge detection selectors
 */
export function getCaptchaSelectors(): string[] {
  return [
    // Generic CAPTCHA selectors
    '[class*="captcha"]',
    '[id*="captcha"]',
    'iframe[src*="captcha"]',
    'iframe[src*="recaptcha"]',

    // Cloudflare Turnstile specific
    'iframe[src*="turnstile"]',
    '[class*="turnstile"]',
    '[id*="turnstile"]',

    // Cloudflare challenge page selectors
    "#challenge-running",
    "#challenge-form",
    ".challenge-running",
    ".challenge-form",
    '[class*="challenge"]',
    '[id*="challenge"]',

    // Cloudflare specific elements
    ".cf-browser-verification",
    ".cf-checking-browser",
    ".cf-under-attack",
    "#cf-wrapper",
    ".cf-im-under-attack",

    // Additional Cloudflare patterns
    "[data-ray]", // Cloudflare Ray ID indicator
    ".ray-id",
    "#cf-error-details",
    ".cf-error-overview",

    // Bot detection indicators
    '[class*="bot-detection"]',
    '[class*="security-check"]',
    '[class*="verification"]',

    // Generic challenge indicators
    'body[class*="challenge"]',
    'html[class*="challenge"]',
  ];
}

/**
 * Validate URL for navigation
 */
export function validateNavigationUrl(url: string, expectedDomain?: string): boolean {
  try {
    const parsedUrl = new URL(url);

    if (expectedDomain && !parsedUrl.hostname.includes(expectedDomain)) {
      return false;
    }

    return parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Check if error indicates a page navigation failure
 */
export function isNavigationFailure(url: string, expectedUrl?: string): boolean {
  if (!url || url === "N/A") return true;

  if (expectedUrl) {
    try {
      const actual = new URL(url);
      const expected = new URL(expectedUrl);
      return actual.hostname !== expected.hostname;
    } catch {
      return true;
    }
  }

  return false;
}
