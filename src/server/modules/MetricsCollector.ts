/**
 * MetricsCollector - Collects and aggregates system metrics
 * Provides real-time monitoring capabilities
 */
import { logError, logInfo } from "../../utils/logging.js";

export interface MetricData {
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

export interface MetricSummary {
  count: number;
  min: number;
  max: number;
  avg: number;
  sum: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface MetricsConfig {
  retentionMs: number;
  maxDataPoints: number;
  aggregationInterval: number;
}

export class MetricsCollector {
  private metrics: Map<string, MetricData[]> = new Map();
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private config: MetricsConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<MetricsConfig> = {}) {
    this.config = {
      retentionMs: config.retentionMs ?? 300000,
      maxDataPoints: config.maxDataPoints ?? 1000,
      aggregationInterval: config.aggregationInterval ?? 60000,
    };

    this.startCleanup();
  }

  recordMetric(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metricData: MetricData = {
      value,
      timestamp: Date.now(),
      labels,
    };

    const metrics = this.metrics.get(name)!;
    metrics.push(metricData);

    if (metrics.length > this.config.maxDataPoints) {
      metrics.shift();
    }
  }

  incrementCounter(name: string, value = 1): void {
    const current = this.counters.get(name) ?? 0;
    this.counters.set(name, current + value);
  }

  decrementCounter(name: string, value = 1): void {
    const current = this.counters.get(name) ?? 0;
    this.counters.set(name, Math.max(0, current - value));
  }

  setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  recordHistogram(name: string, value: number): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }

    const histogram = this.histograms.get(name)!;
    histogram.push(value);

    if (histogram.length > this.config.maxDataPoints) {
      histogram.shift();
    }
  }

  getMetric(name: string): MetricData[] {
    const metrics = this.metrics.get(name);
    if (!metrics) {
      return [];
    }

    this.cleanupMetrics(metrics, name);
    return [...metrics];
  }

  getCounter(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  getGauge(name: string): number {
    return this.gauges.get(name) ?? 0;
  }

  getHistogram(name: string): MetricSummary | null {
    const values = this.histograms.get(name);
    if (!values || values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const count = sorted.length;

    return {
      count,
      min: sorted[0]!,
      max: sorted[sorted.length - 1]!,
      avg: sum / count,
      sum,
      p50: sorted[Math.floor(count * 0.5)]!,
      p95: sorted[Math.floor(count * 0.95)]!,
      p99: sorted[Math.floor(count * 0.99)]!,
    };
  }

  getMetricSummary(name: string): MetricSummary | null {
    const metrics = this.getMetric(name);
    if (metrics.length === 0) {
      return null;
    }

    const values = metrics.map((m) => m.value).sort((a, b) => a - b);
    const sum = values.reduce((acc, val) => acc + val, 0);
    const count = values.length;

    return {
      count,
      min: values[0]!,
      max: values[values.length - 1]!,
      avg: sum / count,
      sum,
      p50: values[Math.floor(count * 0.5)]!,
      p95: values[Math.floor(count * 0.95)]!,
      p99: values[Math.floor(count * 0.99)]!,
    };
  }

  getAllMetrics(): {
    metrics: Record<string, MetricData[]>;
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, number[]>;
  } {
    const result: {
      metrics: Record<string, MetricData[]>;
      counters: Record<string, number>;
      gauges: Record<string, number>;
      histograms: Record<string, number[]>;
    } = {
      metrics: {},
      counters: {},
      gauges: {},
      histograms: {},
    };

    for (const [name, metrics] of this.metrics.entries()) {
      result.metrics[name] = this.getMetric(name);
    }

    for (const [name, value] of this.counters.entries()) {
      result.counters[name] = value;
    }

    for (const [name, value] of this.gauges.entries()) {
      result.gauges[name] = value;
    }

    for (const [name, values] of this.histograms.entries()) {
      result.histograms[name] = [...values];
    }

    return result;
  }

  reset(name: string): void {
    this.metrics.delete(name);
    this.counters.delete(name);
    this.gauges.delete(name);
    this.histograms.delete(name);
    logInfo(`Reset metrics for: ${name}`);
  }

  resetAll(): void {
    this.metrics.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    logInfo("Reset all metrics");
  }

  private cleanupMetrics(metrics: MetricData[], name: string): void {
    const cutoffTime = Date.now() - this.config.retentionMs;

    for (let i = metrics.length - 1; i >= 0; i--) {
      if (metrics[i]!.timestamp < cutoffTime) {
        metrics.splice(0, i + 1);
        break;
      }
    }
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const cutoffTime = now - this.config.retentionMs;
      let cleanedCount = 0;

      for (const [name, metrics] of this.metrics.entries()) {
        const originalLength = metrics.length;
        this.cleanupMetrics(metrics, name);
        cleanedCount += originalLength - metrics.length;
      }

      for (const [name, values] of this.histograms.entries()) {
        const originalLength = values.length;
        const cutoffIndex = values.findIndex((_, index) => {
          return Math.random() < (index / originalLength) * 0.5;
        });

        if (cutoffIndex > 0) {
          values.splice(0, cutoffIndex);
        }
      }

      if (cleanedCount > 0) {
        logInfo(`Cleaned up ${cleanedCount} expired metric data points`);
      }
    }, this.config.aggregationInterval);
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    logInfo("MetricsCollector stopped");
  }

  getConfig(): MetricsConfig {
    return { ...this.config };
  }

  exportMetrics(): string {
    const allMetrics = this.getAllMetrics();
    const lines: string[] = ["# Metrics Export"];

    for (const [name, values] of Object.entries(allMetrics.counters)) {
      lines.push(`counter.${name} ${values}`);
    }

    for (const [name, value] of Object.entries(allMetrics.gauges)) {
      lines.push(`gauge.${name} ${value}`);
    }

    for (const [name, summary] of Object.entries(allMetrics.histograms)) {
      const data = this.getHistogram(name);
      if (data) {
        lines.push(
          `histogram.${name} count=${data.count},sum=${data.sum},avg=${data.avg},p95=${data.p95},p99=${data.p99}`,
        );
      }
    }

    return lines.join("\n");
  }
}
