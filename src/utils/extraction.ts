import { Readability } from "@mozilla/readability";
import axios from "axios";
/**
 * Content extraction utilities for Puppeteer-based scraping and recursive exploration.
 */
import { JSDOM } from "jsdom";
import type { Page } from "puppeteer";
import { CONFIG } from "../server/config.js";
import type { PageContentResult, PuppeteerContext } from "../types/index.js";
import { fetchSimpleContent } from "./fetch.js";
import { initializeBrowser } from "./puppeteer.js";

// Helper functions for content extraction
function detectAndRewriteGitHubUrl(
  originalUrl: string,
  ctx: PuppeteerContext,
): { extractionUrl: string; isGitHubRepo: boolean } {
  try {
    const parsedUrl = new URL(originalUrl);
    if (parsedUrl.hostname === "github.com") {
      const pathParts = parsedUrl.pathname.split("/").filter((part) => part.length > 0);
      if (pathParts.length === 2) {
        const gitingestUrl = `https://gitingest.com${parsedUrl.pathname}`;
        ctx.log("info", `Detected GitHub repo URL. Rewriting to: ${gitingestUrl}`);
        return { extractionUrl: gitingestUrl, isGitHubRepo: true };
      }
    }
  } catch (urlParseError) {
    ctx.log("warn", `Failed to parse URL for GitHub check: ${urlParseError}`);
  }
  return { extractionUrl: originalUrl, isGitHubRepo: false };
}

async function performContentTypeCheck(
  extractionUrl: string,
  isGitHubRepo: boolean,
  originalUrl: string,
  ctx: PuppeteerContext,
): Promise<PageContentResult | null> {
  if (isGitHubRepo) {
    return null; // Skip content type check for GitHub repos
  }

  try {
    ctx.log("info", `Performing HEAD request for ${extractionUrl}...`);
    const headResponse = await axios.head(extractionUrl, {
      timeout: 5000, // Reduced from 10000
      headers: { "User-Agent": CONFIG.USER_AGENT },
    });
    const contentType = headResponse.headers["content-type"];
    ctx.log("info", `Content-Type: ${contentType}`);

    if (contentType && !contentType.includes("html") && !contentType.includes("text/plain")) {
      const errorMsg = `Unsupported content type: ${contentType}`;
      ctx.log("error", errorMsg);
      return { url: originalUrl, error: errorMsg };
    }
  } catch (headError) {
    ctx.log(
      "warn",
      `HEAD request failed for ${extractionUrl}: ${headError instanceof Error ? headError.message : String(headError)}. Proceeding with Puppeteer.`,
    );
  }

  return null;
}

async function initializePageIfNeeded(ctx: PuppeteerContext): Promise<Page> {
  let page = ctx.page;
  if (!page || page?.isClosed()) {
    ctx.log("info", "No active page, initializing browser...");
    ctx.setPage(null);
    ctx.setBrowser(null);
    ctx.setIsInitializing(false);
    await initializeBrowser(ctx);
    page = ctx.page;
    if (!page) {
      throw new Error("Failed to initialize Puppeteer page");
    }
  }
  return page;
}

async function navigateToUrl(
  page: Page,
  extractionUrl: string,
  originalUrl: string,
  ctx: PuppeteerContext,
): Promise<{ pageTitle: string; error?: PageContentResult }> {
  ctx.log("info", `Navigating to ${extractionUrl} for extraction...`);
  const response = await page.goto(extractionUrl, {
    waitUntil: "domcontentloaded",
    timeout: CONFIG.TIMEOUT_PROFILES.navigation,
  });
  const pageTitle = await page.title();

  if (response && !response.ok()) {
    const statusCode = response.status();
    const errorMsg = `HTTP error ${statusCode} received when accessing URL: ${extractionUrl}`;
    ctx.log("error", errorMsg);
    return { pageTitle, error: { url: originalUrl, error: errorMsg } };
  }

  return { pageTitle };
}

async function waitForGitHubContent(
  page: Page,
  isGitHubRepo: boolean,
  ctx: PuppeteerContext,
): Promise<void> {
  if (!isGitHubRepo) return;

  ctx.log("info", "Waiting for gitingest content selector (.result-text)...");
  try {
    await page.waitForSelector(".result-text", {
      timeout: CONFIG.TIMEOUT_PROFILES.content,
    });
    ctx.log("info", "Gitingest content selector found.");
  } catch (waitError) {
    ctx.log("warn", `Timeout waiting for gitingest selector: ${waitError}. Proceeding anyway.`);
  }
}

async function extractGitHubContent(
  page: Page,
  isGitHubRepo: boolean,
  originalUrl: string,
  pageTitle: string,
  ctx: PuppeteerContext,
): Promise<PageContentResult | null> {
  if (!isGitHubRepo) return null;

  const gitingestContent = await page.evaluate(() => {
    const resultTextArea = document.querySelector(".result-text") as HTMLTextAreaElement | null;
    return resultTextArea ? resultTextArea.value : null;
  });

  if (gitingestContent && gitingestContent.trim().length > 0) {
    ctx.log("info", `Gitingest specific extraction successful (${gitingestContent.length} chars)`);
    return {
      url: originalUrl,
      title: pageTitle,
      textContent: gitingestContent.trim(),
      error: null,
    };
  }

  ctx.log("warn", "Gitingest specific extraction failed. Falling back to Readability.");
  return null;
}

function extractGeneralContent(
  dom: JSDOM,
  originalUrl: string,
  pageTitle: string,
  ctx: PuppeteerContext,
): PageContentResult | null {
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (article?.textContent && article.textContent.trim().length > (article.title?.length || 0)) {
    ctx.log("info", `Readability extracted content (${article.textContent.length} chars)`);
    return {
      url: originalUrl,
      title: article.title || pageTitle,
      textContent: article.textContent.trim(),
      error: null,
    };
  }

  return null;
}

async function extractFallbackContent(
  page: Page,
  originalUrl: string,
  pageTitle: string,
  ctx: PuppeteerContext,
): Promise<PageContentResult | null> {
  ctx.log("warn", "Readability failed. Attempting sophisticated fallback selectors...");

  const fallbackResult = await page.evaluate(() => {
    const selectors = [
      "article",
      "main",
      '[role="main"]',
      "#content",
      ".content",
      "#main",
      ".main",
      "#article-body",
      ".article-body",
      ".post-content",
      ".entry-content",
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector) as HTMLElement | null;
      if (element?.innerText && element.innerText.trim().length > 100) {
        console.error(`Fallback using selector: ${selector}`);
        return { text: element.innerText.trim(), selector: selector };
      }
    }

    // Advanced body text cleanup
    const bodyClone = document.body.cloneNode(true) as HTMLElement;
    const elementsToRemove = bodyClone.querySelectorAll(
      'nav, header, footer, aside, script, style, noscript, button, form, [role="navigation"], [role="banner"], [role="contentinfo"], [aria-hidden="true"]',
    );

    for (const el of elementsToRemove) {
      el.remove();
    }

    const bodyText = bodyClone.innerText.trim();
    if (bodyText.length > 200) {
      console.error("Fallback using filtered body text.");
      return { text: bodyText, selector: "body (filtered)" };
    }

    return null;
  });

  if (fallbackResult) {
    ctx.log(
      "info",
      `Fallback extracted content (${fallbackResult.text.length} chars) using selector: ${fallbackResult.selector}`,
    );
    return {
      url: originalUrl,
      title: pageTitle,
      textContent: fallbackResult.text,
      error: null,
    };
  }

  return null;
}

function formatExtractionError(
  error: unknown,
  extractionUrl: string,
  originalUrl: string,
): PageContentResult {
  let errorMessage = `Failed to extract content from ${extractionUrl}.`;
  let errorReason = "Unknown error";

  if (error instanceof Error) {
    if (error.message.includes("timeout")) {
      errorReason = "Navigation or content loading timed out.";
    } else if (error.message.includes("net::") || error.message.includes("Failed to load")) {
      errorReason = "Could not resolve or load the URL.";
    } else if (error.message.includes("extract meaningful content")) {
      errorReason = "Readability and fallback selectors failed.";
    } else {
      errorReason = error.message;
    }
  }

  errorMessage += ` Reason: ${errorReason}`;
  return { url: originalUrl, error: errorMessage };
}

/**
 * Extracts content from a single page using Puppeteer and Readability.
 * Includes GitHub/Gitingest URL rewriting, content-type pre-checking, and sophisticated fallback extraction.
 */
export async function fetchSinglePageContent(
  url: string,
  ctx: PuppeteerContext,
): Promise<PageContentResult> {
  const originalUrl = url;

  // GitHub URL detection and rewriting
  const { extractionUrl, isGitHubRepo } = detectAndRewriteGitHubUrl(originalUrl, ctx);

  // Content-Type pre-check (skip for GitHub)
  const contentTypeError = await performContentTypeCheck(
    extractionUrl,
    isGitHubRepo,
    originalUrl,
    ctx,
  );
  if (contentTypeError) {
    return contentTypeError;
  }

  try {
    // Initialize page if needed
    const page = await initializePageIfNeeded(ctx);

    // Navigate to URL
    const navigationResult = await navigateToUrl(page, extractionUrl, originalUrl, ctx);
    if (navigationResult.error) {
      return navigationResult.error;
    }
    const { pageTitle } = navigationResult;

    // Wait for GitHub content if needed
    await waitForGitHubContent(page, isGitHubRepo, ctx);

    // Get page HTML and create DOM
    const html = await page.content();
    
    // Suppress JSDOM console output to prevent CSS/HTML dumps in logs
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    console.error = () => {}; // Suppress JSDOM errors
    console.warn = () => {};  // Suppress JSDOM warnings
    
    const dom = new JSDOM(html, { 
      url: extractionUrl,
      // Additional options to reduce JSDOM verbosity
      resources: "usable",
      runScripts: "outside-only"
    });
    
    // Restore console methods
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;

    // Try GitHub-specific extraction first
    const gitHubResult = await extractGitHubContent(
      page,
      isGitHubRepo,
      originalUrl,
      pageTitle,
      ctx,
    );
    if (gitHubResult) {
      return gitHubResult;
    }

    // Try general Readability extraction
    const generalResult = extractGeneralContent(dom, originalUrl, pageTitle, ctx);
    if (generalResult) {
      return generalResult;
    }

    // Try sophisticated fallback extraction
    const fallbackResult = await extractFallbackContent(page, originalUrl, pageTitle, ctx);
    if (fallbackResult) {
      return fallbackResult;
    }

    return { url: originalUrl, error: "No meaningful content extracted" };
  } catch (error) {
    ctx.log(
      "error",
      `Error extracting content from ${extractionUrl}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return formatExtractionError(error, extractionUrl, originalUrl);
  }
}

/**
 * Extracts all same-domain links from a Puppeteer page.
 * Filters out non-HTTP(S), anchor, mailto, and JavaScript links. Resolves relative URLs.
 * @param page - Puppeteer Page instance
 * @param baseUrl - The base URL for resolving relative links
 * @returns Array of { url, text } for same-domain links
 */
export async function extractSameDomainLinks(
  page: Page,
  baseUrl: string,
): Promise<{ url: string; text: string }[]> {
  try {
    const baseHostname = new URL(baseUrl).hostname;
    const links = await page.evaluate((base) => {
      return Array.from(document.querySelectorAll("a[href]"))
        .map((link) => {
          const href = link.getAttribute("href");
          const text = (link as HTMLElement).innerText || link.textContent || "";
          if (
            !href ||
            href.startsWith("#") ||
            href.startsWith("javascript:") ||
            href.startsWith("data:") ||
            href.startsWith("vbscript:") ||
            href.startsWith("mailto:") ||
            href.startsWith("tel:")
          ) {
            return null;
          }
          return { url: href, text: text.trim() };
        })
        .filter(Boolean);
    }, baseUrl);
    const resolvedLinks: { url: string; text: string }[] = [];
    for (const link of links) {
      if (!link) continue;
      try {
        const absoluteUrl = new URL(link.url, baseUrl).href;
        if (new URL(absoluteUrl).hostname === baseHostname) {
          resolvedLinks.push({ url: absoluteUrl, text: link.text || absoluteUrl });
        }
      } catch {
        // Ignore invalid URLs
      }
    }
    // Prioritize links with longer text, limit count
    resolvedLinks.sort((a, b) => b.text.length - a.text.length);
    return resolvedLinks.slice(0, 10);
  } catch (error) {
    // On error, return empty array
    return [];
  }
}

/**
 * Recursively fetches content from a root URL, exploring links up to maxDepth.
 * Uses fetchSinglePageContent and extractSameDomainLinks. Respects visitedUrls and globalTimeoutSignal.
 * @param startUrl - The root URL to start crawling
 * @param maxDepth - Maximum recursion depth
 * @param currentDepth - Current recursion depth
 * @param visitedUrls - Set of already visited URLs
 * @param results - Array to collect PageContentResult
 * @param globalTimeoutSignal - Object with .timedOut boolean to abort on timeout
 * @param ctx - PuppeteerContext
 */
export async function recursiveFetch(
  startUrl: string,
  maxDepth: number,
  currentDepth: number,
  visitedUrls: Set<string>,
  results: PageContentResult[],
  globalTimeoutSignal: { timedOut: boolean },
  ctx: PuppeteerContext,
): Promise<void> {
  if (currentDepth > maxDepth || visitedUrls.has(startUrl) || globalTimeoutSignal.timedOut) {
    return;
  }
  ctx.log("info", `[Depth ${currentDepth}] Fetching: ${startUrl}`);
  visitedUrls.add(startUrl);
  const pageResult: PageContentResult = {
    url: startUrl,
    title: null,
    textContent: null,
    error: null,
  };
  let linksToExplore: { url: string; text: string }[] = [];
  try {
    if (currentDepth === 1) {
      // Use Puppeteer/Readability for the initial page
      const result = await fetchSinglePageContent(startUrl, ctx);
      pageResult.title = result.title;
      pageResult.textContent = result.textContent;
      pageResult.error = result.error || null;
      if (ctx.page && !ctx.page.isClosed()) {
        linksToExplore = await extractSameDomainLinks(ctx.page, startUrl);
      }
    } else {
      // Use the simpler fetch for deeper levels
      const result = await fetchSimpleContent(startUrl, ctx);
      pageResult.title = result.title;
      pageResult.textContent = result.textContent;
      pageResult.error = result.error || null;
    }
    if (pageResult.textContent === null && pageResult.error === null) {
      pageResult.error = "Failed to extract content";
    }
  } catch (error) {
    ctx.log(
      "error",
      `[Depth ${currentDepth}] Error fetching ${startUrl}: ${error instanceof Error ? error.message : String(error)}`,
    );
    pageResult.error = error instanceof Error ? error.message : String(error);
  }
  results.push(pageResult);
  // Explore links only if depth allows and initial fetch was successful
  if (currentDepth < maxDepth && !pageResult.error && linksToExplore.length > 0) {
    const linksToFollow = linksToExplore.slice(0, 3); // Limit to 3 links per page
    const promises = linksToFollow.map((link) => {
      if (globalTimeoutSignal.timedOut) return Promise.resolve();
      return recursiveFetch(
        link.url,
        maxDepth,
        currentDepth + 1,
        visitedUrls,
        results,
        globalTimeoutSignal,
        ctx,
      );
    });
    await Promise.all(promises);
  }
}
