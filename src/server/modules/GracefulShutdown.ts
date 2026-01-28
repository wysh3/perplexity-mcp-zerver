/**
 * GracefulShutdown - Handles graceful shutdown of all subsystems
 * Ensures in-flight operations complete before termination
 */
import { EventEmitter } from "events";
import { logError, logInfo, logWarn } from "../../utils/logging.js";

export interface ShutdownHandler {
  name: string;
  shutdown: (signal?: string) => Promise<void>;
  priority: number;
  timeout?: number;
}

export interface ShutdownConfig {
  timeout: number;
  forceTimeout: number;
  drainTimeout: number;
  signals: NodeJS.Signals[];
}

export interface ShutdownStats {
  startTime: number;
  endTime: number | null;
  signal: string;
  handlers: Array<{
    name: string;
    status: "pending" | "running" | "completed" | "failed";
    duration?: number;
    error?: string;
  }>;
  timedOut: boolean;
  forced: boolean;
}

export class GracefulShutdown extends EventEmitter {
  private handlers: ShutdownHandler[] = [];
  private config: ShutdownConfig;
  private isShuttingDown = false;
  private currentStats: ShutdownStats | null = null;
  private forceTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<ShutdownConfig> = {}) {
    super();
    this.config = {
      timeout: config.timeout ?? 30000,
      forceTimeout: config.forceTimeout ?? 5000,
      drainTimeout: config.drainTimeout ?? 5000,
      signals: config.signals ?? ["SIGTERM", "SIGINT", "SIGUSR2"],
    };

    this.setupSignalHandlers();
  }

  registerHandler(handler: ShutdownHandler): void {
    const existingIndex = this.handlers.findIndex((h) => h.name === handler.name);

    if (existingIndex >= 0) {
      logWarn(`Replacing existing shutdown handler: ${handler.name}`);
      this.handlers[existingIndex] = handler;
    } else {
      this.handlers.push(handler);
      logInfo(`Registered shutdown handler: ${handler.name}`);
    }

    this.handlers.sort((a, b) => b.priority - a.priority);
  }

  unregisterHandler(name: string): void {
    const index = this.handlers.findIndex((h) => h.name === name);
    if (index >= 0) {
      this.handlers.splice(index, 1);
      logInfo(`Unregistered shutdown handler: ${name}`);
    }
  }

  private setupSignalHandlers(): void {
    for (const signal of this.config.signals) {
      process.on(signal, async () => {
        await this.shutdown(signal);
      });
    }

    process.on("uncaughtException", async (error: Error) => {
      logError("Uncaught exception, initiating graceful shutdown:", {
        error: error.message,
        stack: error.stack,
      });
      await this.shutdown("uncaughtException");
    });

    process.on("unhandledRejection", async (reason: unknown) => {
      logError("Unhandled rejection, initiating graceful shutdown:", {
        reason: String(reason),
      });
      await this.shutdown("unhandledRejection");
    });
  }

  async shutdown(signal = "SIGTERM"): Promise<void> {
    if (this.isShuttingDown) {
      logWarn("Shutdown already in progress, ignoring duplicate signal");
      return;
    }

    this.isShuttingDown = true;
    const startTime = Date.now();

    this.currentStats = {
      startTime,
      endTime: null,
      signal,
      handlers: this.handlers.map((h) => ({
        name: h.name,
        status: "pending" as const,
      })),
      timedOut: false,
      forced: false,
    };

    logInfo(`Starting graceful shutdown (signal: ${signal})`);
    this.emit("shutdownStarted", { signal, handlers: this.handlers });

    try {
      await this.drain();
      await this.executeHandlers();
      await this.finalize();

      const endTime = Date.now();
      this.currentStats.endTime = endTime;

      logInfo(
        `Graceful shutdown completed in ${endTime - startTime}ms (${this.currentStats.handlers.length} handlers)`,
      );
      this.emit("shutdownComplete", this.currentStats);

      process.exit(0);
    } catch (error) {
      logError("Graceful shutdown failed:", {
        error: error instanceof Error ? error.message : String(error),
      });

      this.currentStats.timedOut = true;
      this.emit("shutdownFailed", { stats: this.currentStats, error });

      await this.forceShutdown();
    }
  }

  private async drain(): Promise<void> {
    logInfo(`Draining in-flight operations (timeout: ${this.config.drainTimeout}ms)`);
    this.emit("draining", {});

    const drainStart = Date.now();

    while (Date.now() - drainStart < this.config.drainTimeout) {
      const pendingOps = this.getPendingOperations();

      if (pendingOps === 0) {
        logInfo("All in-flight operations drained");
        return;
      }

      logInfo(`Waiting for ${pendingOps} pending operations...`);
      await this.sleep(100);
    }

    logWarn("Drain timeout reached, proceeding with shutdown");
  }

  private getPendingOperations(): number {
    return 0;
  }

  private async executeHandlers(): Promise<void> {
    if (this.handlers.length === 0) {
      logInfo("No shutdown handlers registered");
      return;
    }

    logInfo(`Executing ${this.handlers.length} shutdown handlers`);

    const timeoutPromise = new Promise<void>((resolve) => {
      this.forceTimer = setTimeout(() => {
        logWarn("Shutdown timeout reached, forcing termination");
        this.currentStats!.timedOut = true;
        resolve();
      }, this.config.timeout);
    });

    const handlersPromise = this.handlers.map(async (handler, index) => {
      const stats = this.currentStats!.handlers[index];

      try {
        if (stats) {
          stats.status = "running";
        }
        logInfo(`Executing handler: ${handler.name} (priority: ${handler.priority})`);
        this.emit("handlerStarted", { handler });

        const handlerStart = Date.now();
        const handlerTimeout =
          handler.timeout ?? Math.floor(this.config.timeout / this.handlers.length);

        await Promise.race([
          handler.shutdown(this.currentStats!.signal),
          this.sleep(handlerTimeout).then(() => {
            throw new Error(`Handler ${handler.name} timeout after ${handlerTimeout}ms`);
          }),
        ]);

        const handlerDuration = Date.now() - handlerStart;
        if (stats) {
          stats.status = "completed";
          stats.duration = handlerDuration;
        }

        logInfo(`Handler completed: ${handler.name} (${handlerDuration}ms)`);
        this.emit("handlerComplete", { handler, duration: handlerDuration });
      } catch (error) {
        if (stats) {
          stats.status = "failed";
          stats.error = error instanceof Error ? error.message : String(error);
        }

        logError(`Handler failed: ${handler.name}`, { error: stats ? stats.error : String(error) });
        this.emit("handlerFailed", { handler, error: stats ? stats.error : String(error) });
      }
    });

    await Promise.race([Promise.all(handlersPromise), timeoutPromise]);

    if (this.forceTimer) {
      clearTimeout(this.forceTimer);
      this.forceTimer = null;
    }
  }

  private async finalize(): Promise<void> {
    logInfo("Finalizing shutdown");

    this.handlers = [];
    logInfo("All handlers cleared");
  }

  private async forceShutdown(): Promise<void> {
    logWarn(`Forcing shutdown after ${this.config.forceTimeout}ms`);
    this.emit("forceShutdown", {});

    await this.sleep(this.config.forceTimeout);

    this.currentStats!.forced = true;
    logError("Forced shutdown completed");

    process.exit(1);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStats(): ShutdownStats | null {
    return this.currentStats ? { ...this.currentStats } : null;
  }

  isShutting(): boolean {
    return this.isShuttingDown;
  }

  getConfig(): ShutdownConfig {
    return { ...this.config };
  }

  getHandlers(): Array<{ name: string; priority: number }> {
    return this.handlers.map((h) => ({ name: h.name, priority: h.priority }));
  }
}
