/**
 * Tool implementation for web search functionality with real streaming support
 */

import type { PuppeteerContext } from "../types/index.js";

/**
 * Handles web search with configurable detail levels and optional streaming
 */
export default async function search(
  args: {
    query: string;
    detail_level?: "brief" | "normal" | "detailed";
    stream?: boolean;
  },
  ctx: PuppeteerContext,
  performSearch: (prompt: string, ctx: PuppeteerContext) => Promise<string>,
): Promise<string | AsyncGenerator<string, void, unknown>> {
  const { query, detail_level = "normal", stream = false } = args;

  let prompt = query;
  switch (detail_level) {
    case "brief":
      prompt = `Provide a brief, concise answer to: ${query}`;
      break;
    case "detailed":
      prompt = `Provide a comprehensive, detailed analysis of: ${query}. Include relevant examples, context, and supporting information where applicable.`;
      break;
    default:
      prompt = `Provide a clear, balanced answer to: ${query}. Include key points and relevant context.`;
  }

  // If streaming is not requested, return traditional response
  if (!stream) {
    return await performSearch(prompt, ctx);
  }

  // Return real streaming generator that monitors browser automation
  return realTimeStreamingSearch(prompt, ctx, performSearch);
}

// Helper functions for streaming search
async function* streamBrowserSetup(ctx: PuppeteerContext): AsyncGenerator<string, void, unknown> {
  yield "🌐 Initializing browser connection...\n";

  if (!ctx.browser || !ctx.page || ctx.page?.isClosed()) {
    yield "🔧 Setting up browser instance...\n";
  } else {
    yield "✅ Browser ready, navigating to Perplexity...\n";
  }
}

async function* streamSearchInitiation(prompt: string): AsyncGenerator<string, void, unknown> {
  yield "📡 Connecting to Perplexity AI...\n";
  yield `⌨️  Submitting query: "${prompt.substring(0, 100)}${prompt.length > 100 ? "..." : ""}"\n\n`;
}

async function* streamSearchExecution(
  prompt: string,
  ctx: PuppeteerContext,
  performSearch: (prompt: string, ctx: PuppeteerContext) => Promise<string>,
): AsyncGenerator<string, void, unknown> {
  let searchCompleted = false;
  let finalResult = "";

  // Monitor content while search is running
  const monitoringTask = monitorPageContent(ctx);

  // Start both search and monitoring
  const searchTask = performSearch(prompt, ctx).then((result) => {
    searchCompleted = true;
    finalResult = result;
    return result;
  });

  // Stream monitoring updates while search runs
  for await (const contentUpdate of monitoringTask) {
    if (searchCompleted) break;
    yield contentUpdate;
  }

  // Ensure search is complete
  await searchTask;

  if (finalResult) {
    yield* streamSearchResults(finalResult);
  }
}

async function* streamSearchResults(result: string): AsyncGenerator<string, void, unknown> {
  yield "\n\n📋 **Search Results:**\n\n";

  // Stream the final result in chunks for better UX
  const chunkSize = 300;
  for (let i = 0; i < result.length; i += chunkSize) {
    const chunk = result.slice(i, i + chunkSize);
    yield chunk;
    // Small delay to maintain streaming feel
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
}

async function* streamFallbackSearch(
  prompt: string,
  ctx: PuppeteerContext,
  performSearch: (prompt: string, ctx: PuppeteerContext) => Promise<string>,
): AsyncGenerator<string, void, unknown> {
  yield "⚠️  Streaming unavailable, falling back to standard search...\n\n";
  const result = await performSearch(prompt, ctx);
  yield result;
}

function formatStreamingError(error: unknown): string {
  const errorMessage = error instanceof Error && error.message ? error.message : "Unknown error";
  return `\n\n❌ **Search failed:** ${errorMessage}\n💡 **Tip:** Try a more specific query or check your connection.\n`;
}

/**
 * Real-time streaming search implementation that monitors browser automation
 * and streams content as it arrives from Perplexity
 */
async function* realTimeStreamingSearch(
  prompt: string,
  ctx: PuppeteerContext,
  performSearch: (prompt: string, ctx: PuppeteerContext) => Promise<string>,
): AsyncGenerator<string, void, unknown> {
  yield "🔍 **Starting documentation search...**\n\n";

  try {
    // Stream browser setup status
    yield* streamBrowserSetup(ctx);

    // Check if page is available for streaming
    if (ctx.page && !ctx.page.isClosed()) {
      yield* streamSearchInitiation(prompt);
      yield* streamSearchExecution(prompt, ctx, performSearch);
    } else {
      yield* streamFallbackSearch(prompt, ctx, performSearch);
    }

    yield "\n\n✅ **Search completed successfully!**";
  } catch (error) {
    yield formatStreamingError(error);
    throw error;
  }
}

// Helper functions for content monitoring
interface ContentCheckResult {
  hasContent: boolean;
  contentLength: number;
  hasInputField: boolean;
  pageState: string;
}

function createContentCheck() {
  return `
    const proseElements = document.querySelectorAll(
      '.prose, [class*="prose"], [class*="answer"], [class*="result"]'
    );
    let totalLength = 0;

    for (const element of proseElements) {
      totalLength += (element.innerText?.length || 0);
    }

    return {
      hasContent: totalLength > 0,
      contentLength: totalLength,
      hasInputField: !!document.querySelector('textarea[placeholder*="Ask"]'),
      pageState: document.readyState,
    };
  `;
}

async function checkPageContent(ctx: PuppeteerContext): Promise<ContentCheckResult | null> {
  if (!ctx.page || ctx.page.isClosed()) return null;

  try {
    return (await ctx.page.evaluate(createContentCheck())) as ContentCheckResult;
  } catch {
    return null;
  }
}

function generateProgressUpdate(
  contentCheck: ContentCheckResult,
  lastContentLength: number,
  startTime: number,
): string | null {
  if (contentCheck.hasInputField && !contentCheck.hasContent) {
    if (Date.now() - startTime > 2000) {
      return "⏳ Waiting for AI response...\n";
    }
  } else if (contentCheck.hasContent && contentCheck.contentLength > lastContentLength) {
    const status = lastContentLength === 0 ? " (response started)" : " (updating)";
    return `📝 Content loading${status}...\n`;
  }
  return null;
}

function shouldBreakMonitoring(contentCheck: ContentCheckResult): boolean {
  return contentCheck.contentLength > 200 && contentCheck.pageState === "complete";
}

/**
 * Monitor page content for real-time updates during search
 */
async function* monitorPageContent(ctx: PuppeteerContext): AsyncGenerator<string, void, unknown> {
  if (!ctx.page || ctx.page.isClosed()) return;

  try {
    let lastContentLength = 0;
    const maxMonitoringTime = 10000; // 10 seconds max monitoring
    const startTime = Date.now();

    while (Date.now() - startTime < maxMonitoringTime) {
      const contentCheck = await checkPageContent(ctx);

      if (!contentCheck) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      // Generate progress update if needed
      const progressUpdate = generateProgressUpdate(contentCheck, lastContentLength, startTime);
      if (progressUpdate) {
        yield progressUpdate;
        lastContentLength = contentCheck.contentLength;
      }

      // Check if monitoring should break early
      if (shouldBreakMonitoring(contentCheck)) {
        yield "🎯 Response ready, finalizing...\n";
        break;
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 500)); // Check every 500ms
    }
  } catch (error) {
    // Monitoring failed, but don't break the main search
    yield "⚠️  Live monitoring unavailable, search continuing...\n";
  }
}
