/**
 * Utility for simple HTTP content fetching and basic HTML/text extraction.
 * @param url - The URL to fetch
 * @param ctx - PuppeteerContext for logging and config
 * @returns { title, textContent, error }
 */
import { Readability } from "@mozilla/readability";
import axios from "axios";
import { JSDOM } from "jsdom";
import { CONFIG } from "../server/config.js";
import type { PuppeteerContext } from "../types/index.js";

// Helper functions for fetch content
async function performHttpRequest(url: string, ctx: PuppeteerContext) {
  ctx?.log?.("info", `Simple fetch starting for: ${url}`);

  const response = await axios.get(url, {
    timeout: 15000,
    headers: {
      "User-Agent": CONFIG.USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    },
    validateStatus: (status) => status >= 200 && status < 400, // Accept 2xx and 3xx
  });

  return response;
}

function validateContentType(contentType: string, ctx: PuppeteerContext): string | null {
  if (
    !contentType.includes("html") &&
    !contentType.includes("text/plain") &&
    !contentType.includes("text/")
  ) {
    const errorMsg = `Unsupported content type: ${contentType}`;
    ctx?.log?.("warn", errorMsg);
    return errorMsg;
  }
  return null;
}

function validateResponseData(data: unknown, ctx: PuppeteerContext): string | null {
  if (typeof data !== "string") {
    const errorMsg = "Response data is not a string";
    ctx?.log?.("warn", errorMsg);
    return errorMsg;
  }
  return null;
}

function extractHtmlContent(
  dom: JSDOM,
  ctx: PuppeteerContext,
): { title: string | null; textContent: string } {
  let title = dom.window.document.title ?? null;
  let textContent = "";

  // Try Readability first for better content extraction
  try {
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article?.textContent && article.textContent.trim().length > 100) {
      title = article.title ?? title;
      textContent = article.textContent.trim();
      ctx?.log?.("info", `Readability extraction successful (${textContent.length} chars)`);
    } else {
      // Fallback to body text extraction
      textContent = dom.window.document.body?.textContent ?? "";
      ctx?.log?.("info", "Readability failed, using body text extraction");
    }
  } catch (readabilityError) {
    ctx?.log?.("warn", `Readability failed: ${readabilityError}, falling back to body text`);
    textContent = dom.window.document.body?.textContent ?? "";
  }

  return { title, textContent };
}

function extractContent(
  contentType: string,
  responseData: string,
  url: string,
  ctx: PuppeteerContext,
): { title: string | null; textContent: string } {
  const dom = new JSDOM(responseData, { url });

  if (contentType.includes("html")) {
    return extractHtmlContent(dom, ctx);
  }

  // For non-HTML content, just get the text
  return { title: dom.window.document.title ?? null, textContent: responseData };
}

function processTextContent(
  textContent: string,
  ctx: PuppeteerContext,
): { processedContent: string | null; error?: string } {
  // Clean up the text content
  let processed = textContent.replace(/\s+/g, " ").trim();

  if (processed.length > 15000) {
    // Truncate if too long
    processed = `${processed.substring(0, 15000)}... (content truncated)`;
    ctx?.log?.("info", "Content truncated due to length");
  }

  if (processed.length < 50) {
    const errorMsg = "Extracted content is too short to be meaningful";
    ctx?.log?.("warn", errorMsg);
    return { processedContent: null, error: errorMsg };
  }

  return { processedContent: processed };
}

function formatAxiosError(
  axiosError: Error & { response?: { status?: number; statusText?: string }; code?: string },
): string {
  if (axiosError.response?.status) {
    const status = axiosError.response.status;
    if (status >= 400 && status < 500) {
      return `Client error (${status}): ${axiosError.response.statusText ?? "Unknown error"}`;
    }
    if (status >= 500) {
      return `Server error (${status}): ${axiosError.response.statusText ?? "Unknown error"}`;
    }
    return `HTTP error (${status}): ${axiosError.response.statusText ?? "Unknown error"}`;
  }

  if (axiosError.code) {
    // Network errors
    switch (axiosError.code) {
      case "ECONNABORTED":
        return "Request timeout - server took too long to respond";
      case "ENOTFOUND":
        return "DNS resolution failed - domain not found";
      case "ECONNREFUSED":
        return "Connection refused - server is not accepting connections";
      case "ECONNRESET":
        return "Connection reset - network connection was interrupted";
      case "ETIMEDOUT":
        return "Connection timeout - failed to establish connection";
      default:
        return `Network error (${axiosError.code}): ${axiosError.message}`;
    }
  }

  return `Request failed: ${axiosError.message}`;
}

function formatErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return `Unexpected error: ${String(error)}`;
  }

  const errorDetails = error.message;

  if (error.name === "AxiosError" && "response" in error) {
    const axiosError = error as Error & {
      response?: { status?: number; statusText?: string };
      code?: string;
    };
    return formatAxiosError(axiosError);
  }

  if (errorDetails.includes("timeout")) {
    return "Request timeout - server took too long to respond";
  }
  if (errorDetails.includes("ENOTFOUND")) {
    return "DNS resolution failed - domain not found";
  }
  if (errorDetails.includes("ECONNREFUSED")) {
    return "Connection refused - server is not accepting connections";
  }

  return `Request failed: ${errorDetails}`;
}

export async function fetchSimpleContent(
  url: string,
  ctx: PuppeteerContext,
): Promise<{ title: string | null; textContent: string | null; error?: string }> {
  try {
    const response = await performHttpRequest(url, ctx);

    const contentType = response.headers["content-type"] ?? "";
    ctx?.log?.("info", `Content-Type: ${contentType}, Status: ${response.status}`);

    const contentTypeError = validateContentType(contentType, ctx);
    if (contentTypeError) {
      return { title: null, textContent: null, error: contentTypeError };
    }

    const dataError = validateResponseData(response.data, ctx);
    if (dataError) {
      return { title: null, textContent: null, error: dataError };
    }

    const { title, textContent } = extractContent(contentType, response.data, url, ctx);
    const { processedContent, error: processingError } = processTextContent(textContent, ctx);

    if (processingError ?? !processedContent) {
      return { title, textContent: null, error: processingError };
    }

    ctx?.log?.("info", `Simple fetch successful (${processedContent.length} chars)`);
    return { title, textContent: processedContent };
  } catch (error: unknown) {
    const errorMsg = formatErrorMessage(error);
    ctx?.log?.("error", `Simple fetch failed for ${url}: ${errorMsg}`);
    return { title: null, textContent: null, error: errorMsg };
  }
}
