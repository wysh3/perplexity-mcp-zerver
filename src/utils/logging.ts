export type LogLevel = "info" | "warn" | "error";

/**
 * Modular logging utility for MCP servers.
 * - All logs (info, warn, error) are written to stderr (console.error) to avoid corrupting MCP JSON protocol on stdout.
 * - Supports log levels, timestamps, and optional metadata.
 * - Used everywhere in the codebase for consistency.
 * - Easily extensible for future needs (e.g., file/remote logging).
 */
export function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  // Always use console.error for all log levels to keep stdout clean for MCP protocol
  if (meta && Object.keys(meta).length > 0) {
    // eslint-disable-next-line no-console
    console.error(`[${timestamp}] [${level.toUpperCase()}] ${message}`, meta);
  } else {
    // eslint-disable-next-line no-console
    console.error(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
  }
}

export const logInfo = (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta);
export const logWarn = (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta);
export const logError = (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta);
