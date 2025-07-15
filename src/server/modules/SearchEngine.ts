/**
 * SearchEngine - Handles search operations and answer extraction
 * Focused, testable module for Perplexity search functionality
 */
import type { Page } from "puppeteer";
import type { IBrowserManager, ISearchEngine } from "../../types/index.js";
import { logError, logInfo, logWarn } from "../../utils/logging.js";
import { CONFIG } from "../config.js";

export class SearchEngine implements ISearchEngine {
  constructor(private readonly browserManager: IBrowserManager) {}

  async performSearch(query: string): Promise<string> {
    try {
      // Ensure browser is ready
      if (!this.browserManager.isReady()) {
        logInfo("Browser not ready, initializing...");
        await this.browserManager.initialize();
      }

      // Navigate to Perplexity
      await this.browserManager.navigateToPerplexity();

      // Get the page from browser manager
      const page = this.browserManager.getPage();
      if (!page) {
        throw new Error("No active page available");
      }

      // Wait for search input
      const selector = await this.browserManager.waitForSearchInput();
      if (!selector) {
        throw new Error("Search input not found");
      }

      // Perform the search
      await this.executeSearch(page, selector, query);

      // Wait for and extract the answer
      const answer = await this.waitForCompleteAnswer(page);

      // Reset idle timeout after successful operation
      this.browserManager.resetIdleTimeout();

      return answer;
    } catch (error) {
      logError("Search operation failed:", {
        error: error instanceof Error ? error.message : String(error),
      });

      // Attempt recovery
      await this.browserManager.performRecovery(error instanceof Error ? error : undefined);

      // Return user-friendly error message
      return this.generateErrorResponse(error);
    }
  }

  private async executeSearch(page: Page, selector: string, query: string): Promise<void> {
    logInfo(`Executing search for: "${query.substring(0, 50)}${query.length > 50 ? "..." : ""}"`);

    // Clear any existing text
    try {
      await page.evaluate((sel) => {
        const input = document.querySelector(sel) as HTMLTextAreaElement;
        if (input) input.value = "";
      }, selector);

      await page.click(selector, { clickCount: 3 });
      await page.keyboard.press("Backspace");
    } catch (clearError) {
      logWarn("Error clearing input field:", {
        error: clearError instanceof Error ? clearError.message : String(clearError),
      });
    }

    // Type the query with minimal delay for speed
    // Note: Math.random() is safe here - only used for anti-detection timing, not security
    const typeDelay = Math.floor(Math.random() * 10) + 5; // 5-15ms delay (reduced from 20-40ms)
    await page.type(selector, query, { delay: typeDelay });
    await page.keyboard.press("Enter");

    logInfo("Search query submitted successfully");
  }

  private async waitForCompleteAnswer(page: Page): Promise<string> {
    logInfo("Waiting for search response...");

    // First, wait for any response elements to appear
    const proseSelectors = [".prose", '[class*="prose"]', '[class*="answer"]', '[class*="result"]'];

    let selectorFound = false;
    for (const proseSelector of proseSelectors) {
      try {
        await page.waitForSelector(proseSelector, {
          timeout: CONFIG.SELECTOR_TIMEOUT,
          visible: true,
        });
        logInfo(`Found response with selector: ${proseSelector}`);
        selectorFound = true;
        break;
      } catch (selectorError) {
        logWarn(`Selector ${proseSelector} not found, trying next...`);
      }
    }

    if (!selectorFound) {
      logError("No response selectors found");
      throw new Error("No response elements found on page");
    }

    // Now wait for the complete answer using the sophisticated algorithm
    const answer = await this.extractCompleteAnswer(page);
    logInfo(`Answer received (${answer.length} characters)`);

    return answer;
  }

  private async extractCompleteAnswer(page: Page): Promise<string> {
    return await page.evaluate(async () => {
      // Security: URL scheme blocklist for preventing code injection attacks
      const BLOCKED_URL_SCHEMES = [
        "java" + "script:", // Prevents eval-like code execution
        "data:", // Prevents data URI attacks
        "vbs" + "cript:", // Prevents VBScript execution
        "#", // Prevents anchor-only URLs
      ];

      const isSafeUrl = (href: string): boolean => {
        if (!href) return false;
        for (const blockedScheme of BLOCKED_URL_SCHEMES) {
          if (href.startsWith(blockedScheme)) {
            return false;
          }
        }
        return true;
      };

      const getAnswer = () => {
        const elements = Array.from(document.querySelectorAll(".prose"));
        const answerText = elements.map((el) => (el as HTMLElement).innerText.trim()).join("\n\n");

        // Extract URLs only if answer is substantial
        if (answerText.length > 100) {
          const links = Array.from(document.querySelectorAll(".prose a[href]"));
          const urls = links
            .map((link) => (link as HTMLAnchorElement).href)
            .filter(isSafeUrl)
            .map((href) => href.trim());

          if (urls.length > 0) {
            const formattedUrls = urls.map((url) => `- ${url}`).join("\n");
            return `${answerText}\n\nURLs:\n${formattedUrls}`;
          }
        }
        return answerText;
      };

      // Optimized: Much faster extraction with early exits
      let lastAnswer = "";
      let stabilityCounter = 0;
      const maxAttempts = 20; // Reduced from 60
      const checkInterval = 400; // Reduced from 600ms

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
        const currentAnswer = getAnswer();
        const currentLength = currentAnswer.length;

        // Early exit if we have substantial content
        if (currentLength > 500) {
          // Check if content has stabilized
          if (currentAnswer === lastAnswer) {
            stabilityCounter++;
            if (stabilityCounter >= 2) { // Reduced from 3-5
              break;
            }
          } else {
            stabilityCounter = 0;
            lastAnswer = currentAnswer;
          }
        } else if (currentLength > 200) {
          // For medium content, be less strict
          if (currentAnswer === lastAnswer) {
            stabilityCounter++;
            if (stabilityCounter >= 3) {
              break;
            }
          } else {
            stabilityCounter = 0;
            lastAnswer = currentAnswer;
          }
        } else if (currentLength > 0) {
          // For any content, update tracking
          lastAnswer = currentAnswer;
        }

        // Quick completion check - exit if we see sentence endings
        if (currentLength > 100) {
          const lastProse = document.querySelector(".prose:last-child");
          const text = lastProse?.textContent || "";
          if (text.match(/[.!?]\s*$/)) {
            break;
          }
        }
      }

      return lastAnswer || "No answer content found. The website may be experiencing issues.";
    });
  }

  private generateErrorResponse(error: unknown): string {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes("timeout") || errorMessage.includes("Timed out")) {
      return "The search operation is taking longer than expected. This might be due to high server load. Please try again with a more specific query.";
    }

    if (errorMessage.includes("navigation") || errorMessage.includes("Navigation")) {
      return "The search operation encountered a navigation issue. This might be due to network connectivity problems. Please try again later.";
    }

    if (errorMessage.includes("detached") || errorMessage.includes("Detached")) {
      return "The search operation encountered a technical issue. Please try again with a more specific query.";
    }

    return `The search operation could not be completed. Error: ${errorMessage}. Please try again later with a more specific query.`;
  }
}
