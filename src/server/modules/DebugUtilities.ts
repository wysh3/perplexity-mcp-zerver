/**
 * DebugUtilities - Helper utilities for debugging and development
 * Provides utilities for inspecting server state, testing, and troubleshooting
 */
import os from "node:os";
import v8 from "node:v8";
import type { Worker } from "node:worker_threads";
import { logError, logInfo, logWarn } from "../../utils/logging.js";

export interface DebugStats {
  timestamp: number;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  heapStatistics: v8.HeapInfo;
  eventLoopDelay: number;
  activeHandles: number;
  activeRequests: number;
}

export interface DebugConfig {
  enabled: boolean;
  logLevel: "error" | "warn" | "info" | "debug";
  collectHeapStats: boolean;
  collectEventLoopStats: boolean;
  samplingInterval: number;
}

export class DebugUtilities {
  private config: DebugConfig;
  private samplingTimer: NodeJS.Timeout | null = null;
  private startTime: number;

  constructor(config: Partial<DebugConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      logLevel: config.logLevel ?? "info",
      collectHeapStats: config.collectHeapStats ?? true,
      collectEventLoopStats: config.collectEventLoopStats ?? true,
      samplingInterval: config.samplingInterval ?? 60000,
    };
    this.startTime = Date.now();
  }

  getStats(): DebugStats {
    const memoryUsage = process.memoryUsage();
    const heapStatistics = v8.getHeapStatistics();

    let eventLoopDelay = 0;
    if (this.config.collectEventLoopStats) {
      eventLoopDelay = this.getEventLoopDelay();
    }

    return {
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      memoryUsage,
      heapStatistics,
      eventLoopDelay,
      activeHandles: (process as any)._getActiveHandles().length,
      activeRequests: (process as any)._getActiveRequests().length,
    };
  }

  formatStats(stats: DebugStats): string {
    const lines: string[] = [];
    lines.push("=== DEBUG STATS ===");
    lines.push(`Timestamp: ${new Date(stats.timestamp).toISOString()}`);
    lines.push(`Uptime: ${Math.floor(stats.uptime / 1000)}s`);
    lines.push("\n--- Memory Usage ---");
    lines.push(`RSS: ${this.formatBytes(stats.memoryUsage.rss)}`);
    lines.push(`Heap Total: ${this.formatBytes(stats.memoryUsage.heapTotal)}`);
    lines.push(`Heap Used: ${this.formatBytes(stats.memoryUsage.heapUsed)}`);
    lines.push(`External: ${this.formatBytes(stats.memoryUsage.external)}`);
    lines.push(`Array Buffers: ${this.formatBytes(stats.memoryUsage.arrayBuffers)}`);

    if (this.config.collectHeapStats) {
      lines.push("\n--- Heap Statistics ---");
      lines.push(`Total Heap Size: ${this.formatBytes(stats.heapStatistics.total_heap_size)}`);
      lines.push(
        `Total Heap Size Executable: ${this.formatBytes(stats.heapStatistics.total_heap_size_executable)}`,
      );
      lines.push(
        `Total Physical Size: ${this.formatBytes(stats.heapStatistics.total_physical_size)}`,
      );
      lines.push(
        `Total Available Size: ${this.formatBytes(stats.heapStatistics.total_available_size)}`,
      );
      lines.push(`Used Heap Size: ${this.formatBytes(stats.heapStatistics.used_heap_size)}`);
      lines.push(`Heap Size Limit: ${this.formatBytes(stats.heapStatistics.heap_size_limit)}`);
    }

    if (this.config.collectEventLoopStats) {
      lines.push("\n--- Event Loop ---");
      lines.push(`Delay: ${stats.eventLoopDelay.toFixed(2)}ms`);
    }

    lines.push("\n--- Handles & Requests ---");
    lines.push(`Active Handles: ${stats.activeHandles}`);
    lines.push(`Active Requests: ${stats.activeRequests}`);

    return lines.join("\n");
  }

  printStats(): void {
    if (!this.config.enabled) {
      logWarn("Debug statistics are disabled");
      return;
    }

    const stats = this.getStats();
    const formatted = this.formatStats(stats);
    logInfo(formatted);
  }

  checkMemoryUsage(thresholdPercent = 0.9): {
    warning: boolean;
    critical: boolean;
    usagePercent: number;
  } {
    const memoryUsage = process.memoryUsage();
    const heapSizeLimit = v8.getHeapStatistics().heap_size_limit;
    const usagePercent = memoryUsage.heapUsed / heapSizeLimit;

    const warning = usagePercent > 0.8;
    const critical = usagePercent > thresholdPercent;

    if (critical) {
      logError(`CRITICAL: Memory usage at ${(usagePercent * 100).toFixed(1)}%`);
    } else if (warning) {
      logWarn(`WARNING: Memory usage at ${(usagePercent * 100).toFixed(1)}%`);
    }

    return { warning, critical, usagePercent };
  }

  forceGarbageCollection(): boolean {
    try {
      if (typeof global.gc === "function") {
        const before = process.memoryUsage().heapUsed;
        global.gc();
        const after = process.memoryUsage().heapUsed;
        const freed = before - after;
        logInfo(`Garbage collection freed ${this.formatBytes(freed)}`);
        return true;
      } else {
        logWarn("Garbage collection not exposed. Run with --expose-gc flag.");
        return false;
      }
    } catch (error) {
      logError("Error during garbage collection:", {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  startSampling(): void {
    if (this.samplingTimer) {
      logWarn("Debug sampling is already running");
      return;
    }

    logInfo(`Starting debug sampling (interval: ${this.config.samplingInterval}ms)`);
    this.samplingTimer = setInterval(() => {
      const stats = this.getStats();
      this.checkMemoryUsage();
    }, this.config.samplingInterval);
  }

  stopSampling(): void {
    if (this.samplingTimer) {
      clearInterval(this.samplingTimer);
      this.samplingTimer = null;
      logInfo("Debug sampling stopped");
    }
  }

  isSampling(): boolean {
    return this.samplingTimer !== null;
  }

  private getEventLoopDelay(): number {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const delay = Number(process.hrtime.bigint() - start) / 1e6;
    });
    return 0;
  }

  private formatBytes(bytes: number): string {
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    if (bytes === 0) return "0 B";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / 1024 ** i).toFixed(2)} ${sizes[i]}`;
  }

  getConfig(): DebugConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<DebugConfig>): void {
    this.config = { ...this.config, ...config };

    if (this.samplingTimer) {
      this.stopSampling();
      this.startSampling();
    }
  }

  inspectVariable<T>(variable: T, label = "variable"): string {
    const lines: string[] = [];
    lines.push(`=== INSPECT: ${label} ===`);

    if (variable === null) {
      lines.push("null");
    } else if (variable === undefined) {
      lines.push("undefined");
    } else if (typeof variable === "object") {
      const formatted = JSON.stringify(variable, null, 2);
      const maxLength = 5000;
      if (formatted.length > maxLength) {
        lines.push(formatted.substring(0, maxLength));
        lines.push(`... (${formatted.length - maxLength} more characters)`);
      } else {
        lines.push(formatted);
      }
    } else if (typeof variable === "function") {
      lines.push(`Function: ${variable.name}()`);
      lines.push(`${variable.toString().substring(0, 200)}`);
    } else {
      lines.push(`Type: ${typeof variable}`);
      lines.push(`Value: ${String(variable)}`);
    }

    return lines.join("\n");
  }

  printVariable<T>(variable: T, label = "variable"): void {
    const inspection = this.inspectVariable(variable, label);
    logInfo(inspection);
  }

  tracePerformance(name: string): () => void {
    const start = process.hrtime.bigint();
    logInfo(`[TRACE] ${name} started`);

    return () => {
      const duration = Number(process.hrtime.bigint() - start) / 1e6;
      logInfo(`[TRACE] ${name} completed in ${duration.toFixed(2)}ms`);
    };
  }

  async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const endTrace = this.tracePerformance(name);
    try {
      const result = await fn();
      endTrace();
      return result;
    } catch (error) {
      endTrace();
      throw error;
    }
  }

  measureSync<T>(name: string, fn: () => T): T {
    const endTrace = this.tracePerformance(name);
    try {
      const result = fn();
      endTrace();
      return result;
    } catch (error) {
      endTrace();
      throw error;
    }
  }

  printEnvironment(): void {
    const lines: string[] = [];
    lines.push("=== ENVIRONMENT ===");
    lines.push(`Node Version: ${process.version}`);
    lines.push(`Platform: ${process.platform}`);
    lines.push(`Architecture: ${process.arch}`);
    lines.push(`CPU Count: ${process.env["UV_THREADPOOL_SIZE"] || os.cpus().length}`);
    lines.push(`TZ: ${process.env["TZ"] || Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    lines.push(`Language: ${process.env["LANG"] || "Not set"}`);
    lines.push(`Working Directory: ${process.cwd()}`);

    logInfo(lines.join("\n"));
  }

  printLoadedModules(): string[] {
    const lines: string[] = [];
    lines.push("=== LOADED MODULES ===");

    for (const [key, value] of Object.entries(require.cache)) {
      lines.push(key);
    }

    logInfo(lines.join("\n"));
    return Object.keys(require.cache);
  }

  static create(config?: Partial<DebugConfig>): DebugUtilities {
    return new DebugUtilities(config);
  }
}
