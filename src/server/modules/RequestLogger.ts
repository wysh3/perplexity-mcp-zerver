/**
 * RequestLogger - Logs all incoming requests and outgoing responses
 * Provides detailed request/response tracking for debugging
 */
import { logInfo } from "../../utils/logging.js";

export interface RequestLogEntry {
  id: string;
  timestamp: number;
  method: string;
  params: Record<string, unknown>;
  duration?: number;
  status: "pending" | "success" | "error";
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface LoggerConfig {
  enabled: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
  includeParams: boolean;
  maxEntries: number;
  retentionMs: number;
}

export class RequestLogger {
  private logs: RequestLogEntry[] = [];
  private pendingRequests: Map<string, RequestLogEntry> = new Map();
  private config: LoggerConfig;
  private entryIdCounter = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      logLevel: config.logLevel ?? "info",
      includeParams: config.includeParams ?? true,
      maxEntries: config.maxEntries ?? 10000,
      retentionMs: config.retentionMs ?? 3600000,
    };

    this.startCleanup();
  }

  startRequest(
    method: string,
    params: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): string {
    if (!this.config.enabled) {
      return "";
    }

    const id = `req-${Date.now()}-${this.entryIdCounter++}`;
    const entry: RequestLogEntry = {
      id,
      timestamp: Date.now(),
      method,
      params: this.config.includeParams ? params : {},
      status: "pending",
      metadata,
    };

    this.pendingRequests.set(id, entry);

    if (this.shouldLog("debug")) {
      logInfo(`[${id}] ${method} started`, this.config.includeParams ? { params } : undefined);
    }

    return id;
  }

  endRequest(id: string, status: "success" | "error", error?: string): void {
    if (!this.config.enabled || !id) {
      return;
    }

    const entry = this.pendingRequests.get(id);
    if (!entry) {
      return;
    }

    entry.status = status;
    entry.duration = Date.now() - entry.timestamp;

    if (error) {
      entry.error = error;
    }

    this.pendingRequests.delete(id);
    this.addLog(entry);

    const logLevel = status === "error" ? "error" : "info";
    if (this.shouldLog(logLevel)) {
      const message = `[${id}] ${entry.method} ${status} (${entry.duration}ms)`;

      if (status === "error" && error) {
        logInfo(message, { error });
      } else {
        logInfo(message);
      }
    }
  }

  addLog(entry: RequestLogEntry): void {
    this.logs.push(entry);

    if (this.logs.length > this.config.maxEntries) {
      this.logs.shift();
    }
  }

  getLogs(filter?: {
    method?: string;
    status?: "pending" | "success" | "error";
    since?: number;
    until?: number;
  }): RequestLogEntry[] {
    let filtered = [...this.logs];

    if (filter) {
      if (filter.method) {
        filtered = filtered.filter((log) => log.method === filter.method);
      }

      if (filter.status) {
        filtered = filtered.filter((log) => log.status === filter.status);
      }

      if (filter.since) {
        filtered = filtered.filter((log) => log.timestamp >= filter.since!);
      }

      if (filter.until) {
        filtered = filtered.filter((log) => log.timestamp <= filter.until!);
      }
    }

    return filtered;
  }

  getLog(id: string): RequestLogEntry | undefined {
    return this.logs.find((log) => log.id === id);
  }

  getPendingRequests(): RequestLogEntry[] {
    return Array.from(this.pendingRequests.values());
  }

  getStats(): {
    total: number;
    pending: number;
    success: number;
    error: number;
    avgDuration: number;
    byMethod: Record<
      string,
      { count: number; success: number; error: number; avgDuration: number }
    >;
  } {
    const successLogs = this.logs.filter((log) => log.status === "success");
    const errorLogs = this.logs.filter((log) => log.status === "error");
    const totalDuration = successLogs.reduce((sum, log) => sum + (log.duration ?? 0), 0);
    const avgDuration = successLogs.length > 0 ? totalDuration / successLogs.length : 0;

    const byMethod: Record<
      string,
      { count: number; success: number; error: number; avgDuration: number }
    > = {};

    for (const log of this.logs) {
      if (!byMethod[log.method]) {
        byMethod[log.method] = { count: 0, success: 0, error: 0, avgDuration: 0 };
      }

      const methodStats = byMethod[log.method]!;
      methodStats.count++;

      if (log.status === "success") {
        methodStats.success++;
        methodStats.avgDuration =
          (methodStats.avgDuration * (methodStats.success - 1) + (log.duration ?? 0)) /
          methodStats.success;
      } else if (log.status === "error") {
        methodStats.error++;
      }
    }

    return {
      total: this.logs.length,
      pending: this.pendingRequests.size,
      success: successLogs.length,
      error: errorLogs.length,
      avgDuration,
      byMethod,
    };
  }

  clear(): void {
    this.logs = [];
    this.pendingRequests.clear();
    logInfo("Request logger cleared");
  }

  exportLogs(): string {
    const lines: string[] = ["# Request Logs Export"];
    lines.push(`ID,Timestamp,Method,Status,Duration,Error`);

    for (const log of this.logs) {
      const timestamp = new Date(log.timestamp).toISOString();
      const error = log.error ? `"${log.error.replace(/"/g, '""')}"` : "";
      lines.push(
        `${log.id},${timestamp},${log.method},${log.status},${log.duration ?? 0},${error}`,
      );
    }

    return lines.join("\n");
  }

  private shouldLog(level: string): boolean {
    const levels = ["debug", "info", "warn", "error"];
    const currentLevelIndex = levels.indexOf(this.config.logLevel);
    const requestedLevelIndex = levels.indexOf(level);

    return requestedLevelIndex >= currentLevelIndex;
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const cutoffTime = Date.now() - this.config.retentionMs;
      const originalLength = this.logs.length;

      this.logs = this.logs.filter((log) => log.timestamp >= cutoffTime);

      const cleanedCount = originalLength - this.logs.length;
      if (cleanedCount > 0) {
        logInfo(`Cleaned up ${cleanedCount} old log entries`);
      }
    }, this.config.retentionMs / 2);
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    logInfo("Request logger stopped");
  }

  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
