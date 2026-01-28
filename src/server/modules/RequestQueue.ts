/**
 * RequestQueue - Manages incoming requests with rate limiting
 * Implements token bucket algorithm for rate limiting
 */
import { EventEmitter } from "events";
import { logError, logInfo, logWarn } from "../../utils/logging.js";

export interface RequestTask<T = unknown> {
  id: string;
  execute: () => Promise<T>;
  priority: number;
  timestamp: number;
}

export interface QueueConfig {
  rateLimit: number;
  burstSize: number;
  maxQueueSize: number;
  intervalMs: number;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  rateLimitHits: number;
}

export class RequestQueue extends EventEmitter {
  private queue: RequestTask[] = [];
  private processingCount = 0;
  private tokens = 0;
  private config: QueueConfig;
  private intervalTimer: NodeJS.Timeout | null = null;
  private completedCount = 0;
  private failedCount = 0;
  private rateLimitHits = 0;
  private taskIdCounter = 0;
  public isRunning = false;

  constructor(config: Partial<QueueConfig> = {}) {
    super();
    this.config = {
      rateLimit: config.rateLimit ?? 5,
      burstSize: config.burstSize ?? 10,
      maxQueueSize: config.maxQueueSize ?? 100,
      intervalMs: config.intervalMs ?? 1000,
    };
    this.tokens = this.config.burstSize;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logInfo("RequestQueue is already running");
      return;
    }

    this.isRunning = true;
    this.tokens = this.config.burstSize;
    this.intervalTimer = setInterval(() => this.refillTokens(), this.config.intervalMs);
    logInfo(
      `RequestQueue started with rate limit ${this.config.rateLimit}/s and burst size ${this.config.burstSize}`,
    );
    this.processQueue();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    logInfo("RequestQueue stopped");
  }

  private refillTokens(): void {
    if (!this.isRunning) return;

    this.tokens = Math.min(this.tokens + this.config.rateLimit, this.config.burstSize);
  }

  async enqueue<T>(
    execute: () => Promise<T>,
    priority = 0,
  ): Promise<{ task: RequestTask<T>; promise: Promise<T> }> {
    return new Promise((resolve, reject) => {
      if (this.queue.length >= this.config.maxQueueSize) {
        reject(new Error("Queue is full"));
        return;
      }

      const taskId = `task-${this.taskIdCounter++}`;
      const task: RequestTask<T> = {
        id: taskId,
        execute: async () => {
          try {
            const result = await execute();
            this.completedCount++;
            return result;
          } catch (error) {
            this.failedCount++;
            throw error;
          }
        },
        priority,
        timestamp: Date.now(),
      };

      this.queue.push(task);
      this.queue.sort((a, b) => b.priority - a.priority || a.timestamp - b.timestamp);

      logInfo(`Task ${taskId} enqueued (priority: ${priority}, queue size: ${this.queue.length})`);
      this.emit("taskAdded", task);

      resolve({
        task,
        promise: new Promise((innerResolve, innerReject) => {
          this.once(`taskComplete:${taskId}`, innerResolve as (value: unknown) => void);
          this.once(`taskError:${taskId}`, innerReject);
        }),
      });
    });
  }

  private async processQueue(): Promise<void> {
    while (this.isRunning) {
      if (this.queue.length > 0 && this.tokens > 0) {
        const task = this.queue.shift();
        if (task) {
          this.processingCount++;
          this.tokens--;
          this.executeTask(task)
            .catch((error) => {
              logError(`Task ${task.id} execution failed:`, {
                error: error instanceof Error ? error.message : String(error),
              });
            })
            .finally(() => {
              this.processingCount--;
            });
        }
      } else if (this.tokens <= 0 && this.queue.length > 0) {
        const nextTask = this.queue[0];
        logWarn(`Rate limit hit, ${this.queue.length} tasks waiting`);
        this.rateLimitHits++;
        this.emit("rateLimit", { pending: this.queue.length, nextTask });
      }

      await this.sleep(10);
    }
  }

  private async executeTask<T>(task: RequestTask<T>): Promise<void> {
    try {
      logInfo(`Executing task ${task.id} (priority: ${task.priority})`);
      this.emit("taskStarted", task);

      const result = await task.execute();

      logInfo(`Task ${task.id} completed successfully`);
      this.emit(`taskComplete:${task.id}`, result);
      this.emit("taskComplete", task);
    } catch (error) {
      logError(`Task ${task.id} failed:`, {
        error: error instanceof Error ? error.message : String(error),
      });
      this.emit(`taskError:${task.id}`, error);
      this.emit("taskError", task, error);
    }
  }

  getStats(): QueueStats {
    return {
      pending: this.queue.length,
      processing: this.processingCount,
      completed: this.completedCount,
      failed: this.failedCount,
      rateLimitHits: this.rateLimitHits,
    };
  }

  clearQueue(): void {
    const clearedTasks = [...this.queue];
    this.queue = [];

    for (const task of clearedTasks) {
      this.emit(`taskError:${task.id}`, new Error("Queue cleared"));
    }

    logInfo(`Cleared ${clearedTasks.length} tasks from queue`);
    this.emit("queueCleared", clearedTasks);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getConfig(): QueueConfig {
    return { ...this.config };
  }
}
