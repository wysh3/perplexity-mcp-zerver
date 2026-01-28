/**
 * RetryManager - Handles retry logic with exponential backoff and jitter
 * Prevents thundering herd problem with distributed systems
 */
import { logError, logInfo, logWarn } from "../../utils/logging.js";

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
  retryableErrors: string[];
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalDelay: number;
}

export class RetryManager {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxAttempts: config.maxAttempts ?? 3,
      baseDelay: config.baseDelay ?? 1000,
      maxDelay: config.maxDelay ?? 30000,
      jitter: config.jitter ?? true,
      retryableErrors: config.retryableErrors ?? [
        "ETIMEDOUT",
        "ECONNRESET",
        "ECONNREFUSED",
        "ENOTFOUND",
        "EPIPE",
        "TimeoutError",
        "NetworkError",
      ],
    };
  }

  async execute<T>(operation: () => Promise<T>, context?: string): Promise<RetryResult<T>> {
    let lastError: Error | null = null;
    let totalDelay = 0;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        logInfo(
          `Retry attempt ${attempt}/${this.config.maxAttempts}` +
            (context ? ` for ${context}` : ""),
        );

        const data = await operation();
        const elapsed = Date.now() - startTime;

        logInfo(
          `Operation succeeded after ${attempt} attempt(s)` + (context ? ` for ${context}` : ""),
        );

        return {
          success: true,
          data,
          attempts: attempt,
          totalDelay,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const isRetryable = this.isRetryableError(lastError);

        if (!isRetryable || attempt === this.config.maxAttempts) {
          logError(
            `Operation failed after ${attempt} attempt(s)` + (context ? ` for ${context}` : ""),
            { error: lastError.message },
          );

          return {
            success: false,
            error: lastError,
            attempts: attempt,
            totalDelay,
          };
        }

        const delay = this.calculateDelay(attempt);
        totalDelay += delay;

        logWarn(
          `Retry ${attempt}/${this.config.maxAttempts} failed with "${lastError.message}". Retrying in ${delay}ms...` +
            (context ? ` (${context})` : ""),
        );

        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: lastError ?? new Error("Operation failed"),
      attempts: this.config.maxAttempts,
      totalDelay,
    };
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.config.baseDelay * Math.pow(2, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelay);

    if (this.config.jitter) {
      const jitterFactor = 0.5 + Math.random() * 0.5;
      return Math.floor(cappedDelay * jitterFactor);
    }

    return cappedDelay;
  }

  private isRetryableError(error: Error): boolean {
    const errorMessage = error.message;

    for (const retryableError of this.config.retryableErrors) {
      if (errorMessage.includes(retryableError)) {
        return true;
      }
    }

    return false;
  }

  async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    circuitBreaker: { open: boolean; execute: (fn: () => Promise<T>) => Promise<T> },
    context?: string,
  ): Promise<RetryResult<T>> {
    const wrappedOperation = async () => {
      if (circuitBreaker.open) {
        throw new Error("Circuit breaker is open");
      }
      return await circuitBreaker.execute(operation);
    };

    return await this.execute(wrappedOperation, context);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getConfig(): RetryConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
