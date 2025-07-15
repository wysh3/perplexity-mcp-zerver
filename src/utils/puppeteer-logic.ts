/**
 * Pure business logic extracted from puppeteer utilities
 * These functions can be tested without mocking Puppeteer
 */

import type { BrowserConfig, ErrorAnalysis, RecoveryContext } from "../types/index.js";

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
 * Generate optimized browser launch arguments for speed
 */
export function generateBrowserArgs(userAgent: string): string[] {
  return [
    // Essential security flags
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    
    // Performance optimizations
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=TranslateUI,BlinkGenPropertyTrees",
    
    // Reduce resource usage
    "--disable-extensions",
    "--disable-plugins",
    "--disable-images", // Skip loading images for faster page loads
    "--disable-default-apps",
    "--disable-sync",
    
    // Network optimizations
    "--aggressive-cache-discard",
    "--disable-background-networking",
    "--disable-component-update",
    
    // UI optimizations
    "--window-size=1280,720", // Smaller window for faster rendering
    "--disable-infobars",
    "--disable-notifications",
    "--no-first-run",
    "--no-default-browser-check",
    
    // Anti-detection (minimal set)
    "--disable-blink-features=AutomationControlled",
    `--user-agent=${userAgent}`,
  ];
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
 * CAPTCHA detection selectors
 */
export function getCaptchaSelectors(): string[] {
  return [
    '[class*="captcha"]',
    '[id*="captcha"]',
    'iframe[src*="captcha"]',
    'iframe[src*="recaptcha"]',
    'iframe[src*="turnstile"]',
    "#challenge-running",
    "#challenge-form",
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
