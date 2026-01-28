/**
 * ResourceManager - Monitors and manages system resources
 * Provides memory and CPU monitoring with alerting
 */
import { EventEmitter } from "events";
import { logError, logInfo, logWarn } from "../../utils/logging.js";

export interface ResourceConfig {
  memoryWarningThreshold: number;
  memoryCriticalThreshold: number;
  cpuWarningThreshold: number;
  cpuCriticalThreshold: number;
  monitorInterval: number;
}

export interface SystemStats {
  memoryUsed: number;
  memoryTotal: number;
  memoryPercent: number;
  cpuUsage: number;
  uptime: number;
  timestamp: number;
}

export class ResourceManager extends EventEmitter {
  private config: ResourceConfig;
  private monitorInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  private lastCpuUsage = { user: 0, system: 0 };
  private lastCpuTime = Date.now();

  constructor(config: Partial<ResourceConfig> = {}) {
    super();
    this.config = {
      memoryWarningThreshold: config.memoryWarningThreshold ?? 80,
      memoryCriticalThreshold: config.memoryCriticalThreshold ?? 90,
      cpuWarningThreshold: config.cpuWarningThreshold ?? 80,
      cpuCriticalThreshold: config.cpuCriticalThreshold ?? 90,
      monitorInterval: config.monitorInterval ?? 5000,
    };
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      logInfo("Resource monitoring is already running");
      return;
    }

    this.isMonitoring = true;
    this.monitorInterval = setInterval(() => this.checkResources(), this.config.monitorInterval);
    logInfo("Resource monitoring started");
  }

  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    this.isMonitoring = false;
    logInfo("Resource monitoring stopped");
  }

  private async checkResources(): Promise<void> {
    const stats = this.getSystemStats();

    this.emit("stats", stats);

    if (stats.memoryPercent >= this.config.memoryCriticalThreshold) {
      logWarn(`CRITICAL: Memory usage at ${stats.memoryPercent.toFixed(1)}%`);
      this.emit("memoryCritical", stats);
    } else if (stats.memoryPercent >= this.config.memoryWarningThreshold) {
      logWarn(`WARNING: Memory usage at ${stats.memoryPercent.toFixed(1)}%`);
      this.emit("memoryWarning", stats);
    }

    if (stats.cpuUsage >= this.config.cpuCriticalThreshold) {
      logWarn(`CRITICAL: CPU usage at ${stats.cpuUsage.toFixed(1)}%`);
      this.emit("cpuCritical", stats);
    } else if (stats.cpuUsage >= this.config.cpuWarningThreshold) {
      logWarn(`WARNING: CPU usage at ${stats.cpuUsage.toFixed(1)}%`);
      this.emit("cpuWarning", stats);
    }
  }

  getSystemStats(): SystemStats {
    const memoryUsage = process.memoryUsage();
    const memoryTotal = memoryUsage.heapTotal;
    const memoryUsed = memoryUsage.heapUsed;
    const memoryPercent = (memoryUsed / memoryTotal) * 100;

    const cpuUsage = this.calculateCpuUsage();

    return {
      memoryUsed,
      memoryTotal,
      memoryPercent,
      cpuUsage,
      uptime: process.uptime(),
      timestamp: Date.now(),
    };
  }

  private calculateCpuUsage(): number {
    const elapsed = Date.now() - this.lastCpuTime;

    if (elapsed === 0) {
      return 0;
    }

    const currentUsage = process.cpuUsage();
    const userDelta = currentUsage.user - this.lastCpuUsage.user;
    const systemDelta = currentUsage.system - this.lastCpuUsage.system;

    const totalDelta = userDelta + systemDelta;
    const cpuPercent = (totalDelta / (elapsed * 1000)) * 100;

    this.lastCpuUsage = currentUsage;
    this.lastCpuTime = Date.now();

    return Math.min(cpuPercent, 100);
  }

  async forceGarbageCollection(): Promise<void> {
    if (global.gc) {
      const before = this.getSystemStats();

      global.gc();

      const after = this.getSystemStats();
      const freed = before.memoryUsed - after.memoryUsed;

      logInfo(`Garbage collection freed ${(freed / 1024 / 1024).toFixed(2)} MB`);
      this.emit("gcComplete", { before, after, freed });
    } else {
      logWarn("Garbage collection not available (run with --gc flag)");
    }
  }

  checkMemoryHealth(): {
    healthy: boolean;
    status: "OK" | "WARNING" | "CRITICAL";
    usage: number;
  } {
    const stats = this.getSystemStats();

    if (stats.memoryPercent >= this.config.memoryCriticalThreshold) {
      return {
        healthy: false,
        status: "CRITICAL",
        usage: stats.memoryPercent,
      };
    }

    if (stats.memoryPercent >= this.config.memoryWarningThreshold) {
      return {
        healthy: false,
        status: "WARNING",
        usage: stats.memoryPercent,
      };
    }

    return {
      healthy: true,
      status: "OK",
      usage: stats.memoryPercent,
    };
  }

  checkCpuHealth(): {
    healthy: boolean;
    status: "OK" | "WARNING" | "CRITICAL";
    usage: number;
  } {
    const stats = this.getSystemStats();

    if (stats.cpuUsage >= this.config.cpuCriticalThreshold) {
      return {
        healthy: false,
        status: "CRITICAL",
        usage: stats.cpuUsage,
      };
    }

    if (stats.cpuUsage >= this.config.cpuWarningThreshold) {
      return {
        healthy: false,
        status: "WARNING",
        usage: stats.cpuUsage,
      };
    }

    return {
      healthy: true,
      status: "OK",
      usage: stats.cpuUsage,
    };
  }

  getConfig(): ResourceConfig {
    return { ...this.config };
  }
}
