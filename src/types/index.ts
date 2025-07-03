/**
 * Main type definitions export file
 * Centralized exports from focused type modules
 */

// ─── BROWSER & PUPPETEER TYPES ────────────────────────────────────────
export type {
  BrowserConfig,
  RecoveryContext,
  ErrorAnalysis,
  PuppeteerContext,
  IBrowserManager,
  PageContentResult,
  RecursiveFetchResult,
} from "./browser.js";

// ─── DATABASE & CHAT TYPES ────────────────────────────────────────────
export type {
  ChatMessage,
  ChatResult,
  IDatabaseManager,
} from "./database.js";

// ─── TOOL & SEARCH TYPES ──────────────────────────────────────────────
export type {
  ISearchEngine,
  ToolHandler,
  ToolHandlersRegistry,
  ChatPerplexityArgs,
  ExtractUrlContentArgs,
  GetDocumentationArgs,
  FindApisArgs,
  CheckDeprecatedCodeArgs,
  SearchArgs,
  ToolArgs,
} from "./tools.js";

// ─── SERVER TYPES ─────────────────────────────────────────────────────
export type { ServerDependencies } from "./server.js";
