/**
 * CircuitBreaker - Implements circuit breaker pattern for fault tolerance
 * Prevents cascading failures by failing fast when a service is unhealthy
 */
import { EventEmitter } from "events";
import { logError, logInfo, logWarn } from "../../utils/logging.js";

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  halfOpenMaxCalls: number;
  resetTimeout: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalCalls: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  nextRetryTime?: number;
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private totalCalls = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private nextRetryTime: number | null = null;
  private halfOpenCalls = 0;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    super();
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      successThreshold: config.successThreshold ?? 3,
      timeout: config.timeout ?? 60000,
      halfOpenMaxCalls: config.halfOpenMaxCalls ?? 3,
      resetTimeout: config.resetTimeout ?? 60000,
    };
  }

  async execute<T>(fn: () => Promise<T>, context?: string): Promise<T> {
    this.totalCalls++;

    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        logWarn(`Circuit breaker OPEN for ${context ?? "unknown"}, rejecting call`);
        this.emit("rejected", { context, state: this.state });
        throw new Error("Circuit breaker is OPEN, service unavailable");
      }
    }

    try {
      logInfo(`Executing protected function for ${context ?? "unknown"}`);
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      logError(`Protected function failed for ${context ?? "unknown"}:`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private onSuccess(): void {
    this.successCount++;
    this.lastSuccessTime = Date.now();

    this.emit("success", { state: this.state });

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenCalls++;

      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        this.transitionToClosed();
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    this.emit("failure", { state: this.state, failureCount: this.failureCount });

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionToOpen();
    } else if (
      this.state === CircuitState.CLOSED &&
      this.failureCount >= this.config.failureThreshold
    ) {
      this.transitionToOpen();
    }
  }

  private transitionToOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextRetryTime = Date.now() + this.config.resetTimeout;
    this.halfOpenCalls = 0;

    logWarn(`Circuit breaker transitioned to OPEN (reset in ${this.config.resetTimeout}ms)`);
    this.emit("stateChange", { previous: null, current: this.state });
  }

  private transitionToHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.halfOpenCalls = 0;
    this.nextRetryTime = null;

    logInfo("Circuit breaker transitioned to HALF_OPEN");
    this.emit("stateChange", { previous: CircuitState.OPEN, current: this.state });
  }

  private transitionToClosed(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextRetryTime = null;

    logInfo("Circuit breaker transitioned to CLOSED");
    this.emit("stateChange", { previous: CircuitState.HALF_OPEN, current: this.state });
  }

  private shouldAttemptReset(): boolean {
    return this.nextRetryTime !== null && Date.now() >= this.nextRetryTime;
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalCalls: this.totalCalls,
      lastFailureTime: this.lastFailureTime ?? undefined,
      lastSuccessTime: this.lastSuccessTime ?? undefined,
      nextRetryTime: this.nextRetryTime ?? undefined,
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.totalCalls = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.nextRetryTime = null;
    this.halfOpenCalls = 0;

    logInfo("Circuit breaker reset to CLOSED state");
    this.emit("reset");
  }

  getState(): CircuitState {
    return this.state;
  }

  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }
}
