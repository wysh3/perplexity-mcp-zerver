/**
 * HealthCheck - System health monitoring for all modules
 * Provides comprehensive health status and recovery mechanisms
 */
import { EventEmitter } from "events";
import { logError, logInfo, logWarn } from "../../utils/logging.js";

export interface HealthCheckResult {
  module: string;
  status: "healthy" | "degraded" | "unhealthy";
  message: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

export interface HealthCheckConfig {
  checkInterval: number;
  timeout: number;
  failureThreshold: number;
  recoveryThreshold: number;
}

export interface HealthCheck {
  module: string;
  check: () => Promise<boolean>;
  recover?: () => Promise<void>;
  config?: Partial<HealthCheckConfig>;
}

export class HealthCheckManager extends EventEmitter {
  private checks: Map<string, HealthCheck> = new Map();
  private checkTimers: Map<string, NodeJS.Timeout> = new Map();
  private failureCount: Map<string, number> = new Map();
  private recoveryCount: Map<string, number> = new Map();
  private lastStatus: Map<string, "healthy" | "degraded" | "unhealthy"> = new Map();
  private defaultConfig: HealthCheckConfig;
  private isRunning = false;

  constructor(config: Partial<HealthCheckConfig> = {}) {
    super();
    this.defaultConfig = {
      checkInterval: config.checkInterval ?? 30000,
      timeout: config.timeout ?? 5000,
      failureThreshold: config.failureThreshold ?? 3,
      recoveryThreshold: config.recoveryThreshold ?? 2,
    };
  }

  register(healthCheck: HealthCheck): void {
    this.checks.set(healthCheck.module, healthCheck);
    this.failureCount.set(healthCheck.module, 0);
    this.recoveryCount.set(healthCheck.module, 0);
    this.lastStatus.set(healthCheck.module, "healthy");

    logInfo(`Registered health check for module: ${healthCheck.module}`);

    if (this.isRunning) {
      this.scheduleCheck(healthCheck.module);
    }
  }

  unregister(module: string): void {
    const timer = this.checkTimers.get(module);
    if (timer) {
      clearTimeout(timer);
      this.checkTimers.delete(module);
    }

    this.checks.delete(module);
    this.failureCount.delete(module);
    this.recoveryCount.delete(module);
    this.lastStatus.delete(module);

    logInfo(`Unregistered health check for module: ${module}`);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logInfo("HealthCheckManager is already running");
      return;
    }

    this.isRunning = true;
    logInfo("Starting HealthCheckManager...");

    for (const module of this.checks.keys()) {
      this.scheduleCheck(module);
    }

    logInfo("HealthCheckManager started");
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    for (const timer of this.checkTimers.values()) {
      clearTimeout(timer);
    }

    this.checkTimers.clear();
    logInfo("HealthCheckManager stopped");
  }

  private scheduleCheck(module: string): void {
    const check = this.checks.get(module);
    if (!check) {
      return;
    }

    const config = { ...this.defaultConfig, ...check.config };

    const timer = setTimeout(async () => {
      if (!this.isRunning) {
        return;
      }

      await this.performCheck(module);

      if (this.isRunning) {
        this.scheduleCheck(module);
      }
    }, config.checkInterval);

    this.checkTimers.set(module, timer);
  }

  private async performCheck(module: string): Promise<void> {
    const check = this.checks.get(module);
    if (!check) {
      return;
    }

    const config = { ...this.defaultConfig, ...check.config };

    try {
      const startTime = Date.now();
      const isHealthy = await this.withTimeout(check.check(), config.timeout);
      const elapsedTime = Date.now() - startTime;

      const previousStatus = this.lastStatus.get(module) ?? "healthy";
      let currentStatus: "healthy" | "degraded" | "unhealthy";

      const failures = this.failureCount.get(module) ?? 0;
      const recoveries = this.recoveryCount.get(module) ?? 0;

      if (isHealthy) {
        if (previousStatus === "unhealthy" || previousStatus === "degraded") {
          const newRecoveryCount = recoveries + 1;
          this.recoveryCount.set(module, newRecoveryCount);

          if (newRecoveryCount >= config.recoveryThreshold) {
            currentStatus = "healthy";
            this.failureCount.set(module, 0);
            this.recoveryCount.set(module, 0);

            logInfo(`Module ${module} recovered to healthy state`);
            this.emit("recovered", { module, status: currentStatus });
          } else {
            currentStatus = "degraded";
            logInfo(
              `Module ${module} is recovering (${newRecoveryCount}/${config.recoveryThreshold})`,
            );
          }
        } else {
          currentStatus = "healthy";
        }
      } else {
        const newFailureCount = failures + 1;
        this.failureCount.set(module, newFailureCount);
        this.recoveryCount.set(module, 0);

        if (newFailureCount >= config.failureThreshold) {
          currentStatus = "unhealthy";
          logError(`Module ${module} is unhealthy (${newFailureCount} consecutive failures)`);
          this.emit("unhealthy", { module, status: currentStatus });

          if (check.recover && previousStatus !== "unhealthy") {
            logInfo(`Attempting recovery for module ${module}...`);
            try {
              await check.recover();
              logInfo(`Recovery attempt completed for module ${module}`);
            } catch (error) {
              logError(`Recovery failed for module ${module}:`, {
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        } else {
          currentStatus = "degraded";
          logWarn(
            `Module ${module} is degraded (${newFailureCount}/${config.failureThreshold} failures)`,
          );
        }

        this.emit("degraded", { module, status: currentStatus });
      }

      this.lastStatus.set(module, currentStatus);

      const result: HealthCheckResult = {
        module,
        status: currentStatus,
        message: isHealthy ? "Health check passed" : "Health check failed",
        timestamp: Date.now(),
        details: {
          elapsedTime,
          failures: this.failureCount.get(module) ?? 0,
          recoveries: this.recoveryCount.get(module) ?? 0,
        },
      };

      this.emit("checkComplete", result);
    } catch (error) {
      logError(`Health check error for module ${module}:`, {
        error: error instanceof Error ? error.message : String(error),
      });

      const result: HealthCheckResult = {
        module,
        status: "unhealthy",
        message: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };

      this.emit("checkComplete", result);
      this.emit("unhealthy", { module, status: "unhealthy", error: result.message });
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Health check timeout after ${timeoutMs}ms`)), timeoutMs),
    );

    return Promise.race([promise, timeoutPromise]);
  }

  async checkNow(module: string): Promise<HealthCheckResult> {
    const check = this.checks.get(module);
    if (!check) {
      throw new Error(`Health check not found for module: ${module}`);
    }

    const startTime = Date.now();
    const isHealthy = await check.check();
    const elapsedTime = Date.now() - startTime;

    const status = isHealthy ? "healthy" : "unhealthy";

    return {
      module,
      status,
      message: isHealthy ? "Health check passed" : "Health check failed",
      timestamp: Date.now(),
      details: {
        elapsedTime,
      },
    };
  }

  async checkAll(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    for (const module of this.checks.keys()) {
      try {
        const result = await this.checkNow(module);
        results.push(result);
      } catch (error) {
        results.push({
          module,
          status: "unhealthy",
          message: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        });
      }
    }

    return results;
  }

  getStatus(module: string): "healthy" | "degraded" | "unhealthy" {
    return this.lastStatus.get(module) ?? "healthy";
  }

  getAllStatuses(): Record<string, "healthy" | "degraded" | "unhealthy"> {
    const statuses: Record<string, "healthy" | "degraded" | "unhealthy"> = {};

    for (const [module, status] of this.lastStatus.entries()) {
      statuses[module] = status;
    }

    return statuses;
  }

  getRegisteredModules(): string[] {
    return Array.from(this.checks.keys());
  }
}
