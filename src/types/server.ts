/**
 * Server module and dependency injection type definitions
 */
import type { IBrowserManager, IBrowserPool } from "./browser.js";
import type { IDatabaseManager } from "./database.js";
import type { ISearchEngine } from "./tools.js";

// ─── SERVER DEPENDENCY INJECTION ──────────────────────────────────────
export interface ServerDependencies {
  browserManager?: IBrowserManager;
  browserPool?: IBrowserPool;
  searchEngine?: ISearchEngine;
  databaseManager?: IDatabaseManager;
}
