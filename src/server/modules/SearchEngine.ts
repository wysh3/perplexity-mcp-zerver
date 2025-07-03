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

    // Type the query with human-like delay
    // Note: Math.random() is safe here - only used for anti-detection timing, not security
    const typeDelay = Math.floor(Math.random() * 20) + 20; // 20-40ms delay
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
      // These schemes are blocked to prevent XSS and code execution vulnerabilities
      const BLOCKED_URL_SCHEMES = [
        "java" + "script:", // Prevents eval-like code execution
        "data:", // Prevents data URI attacks
        "vbs" + "cript:", // Prevents VBScript execution
        "#", // Prevents anchor-only URLs
      ];

      const isSafeUrl = (href: string): boolean => {
        if (!href) return false;

        // Security check: Block URLs that start with dangerous schemes
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

        // Extract all URLs from the answer
        const links = Array.from(document.querySelectorAll(".prose a[href]"));

        const urls = links
          .map((link) => (link as HTMLAnchorElement).href)
          .filter(isSafeUrl)
          .map((href) => href.trim());

        // Combine text and URLs
        if (urls.length > 0) {
          const formattedUrls = urls.map((url) => `- ${url}`).join("\n");
          return `${answerText}\n\nURLs:\n${formattedUrls}`;
        }
        return answerText;
      };

      const checkStabilityBreakCondition = (
        currentLength: number,
        stabilityCounter: number,
      ): boolean => {
        if (currentLength > 1000 && stabilityCounter >= 3) {
          console.error("Long answer stabilized, exiting early");
          return true;
        }
        if (currentLength > 500 && stabilityCounter >= 4) {
          console.error("Medium answer stabilized, exiting");
          return true;
        }
        if (stabilityCounter >= 5) {
          console.error("Short answer stabilized, exiting");
          return true;
        }
        return false;
      };

      const updateCounters = (
        currentAnswer: string,
        currentLength: number,
        lastAnswer: string,
        lastLength: number,
        stabilityCounter: number,
        noChangeCounter: number,
      ) => {
        if (currentLength > lastLength) {
          return {
            newLastLength: currentLength,
            newStabilityCounter: 0,
            newNoChangeCounter: 0,
          };
        }

        if (currentAnswer === lastAnswer) {
          return {
            newLastLength: lastLength,
            newStabilityCounter: stabilityCounter + 1,
            newNoChangeCounter: noChangeCounter + 1,
          };
        }

        return {
          newLastLength: lastLength,
          newStabilityCounter: 0,
          newNoChangeCounter: noChangeCounter + 1,
        };
      };

      const checkCompletionIndicators = (): boolean => {
        const lastProse = document.querySelector(".prose:last-child");
        return (
          (lastProse?.textContent?.includes(".") ||
            lastProse?.textContent?.includes("?") ||
            lastProse?.textContent?.includes("!")) ??
          false
        );
      };

      const shouldExitEarly = (noChangeCounter: number, currentLength: number): boolean => {
        if (noChangeCounter >= 10 && currentLength > 200) {
          console.error("Content stopped growing but has sufficient information");
          return true;
        }
        return false;
      };

      const shouldExitOnCompletion = (
        isComplete: boolean,
        stabilityCounter: number,
        currentLength: number,
      ): boolean => {
        if (isComplete && stabilityCounter >= 2 && currentLength > 100) {
          console.error("Completion indicators found, exiting");
          return true;
        }
        return false;
      };

      let lastAnswer = "";
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
          const counters = updateCounters(
            currentAnswer,
            currentLength,
            lastAnswer,
            lastLength,
            stabilityCounter,
            noChangeCounter,
          );

          lastLength = counters.newLastLength;
          stabilityCounter = counters.newStabilityCounter;
          noChangeCounter = counters.newNoChangeCounter;
          lastAnswer = currentAnswer;

          // Check various exit conditions
          if (checkStabilityBreakCondition(currentLength, stabilityCounter)) {
            break;
          }

          if (shouldExitEarly(noChangeCounter, currentLength)) {
            break;
          }
        }

        const isComplete = checkCompletionIndicators();
        if (shouldExitOnCompletion(isComplete, stabilityCounter, currentLength)) {
          break;
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
