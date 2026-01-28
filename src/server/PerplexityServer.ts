/**
 * PerplexityServer - Modular, testable architecture
 * Uses dependency injection and focused modules for better testability
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";
import type {
  IBrowserManager,
  IBrowserPool,
  IDatabaseManager,
  ISearchEngine,
  ServerDependencies,
} from "../types/index.js";
import { ErrorHandler } from "../utils/errorHandler.js";
import { logError, logInfo, logWarn } from "../utils/logging.js";
import {
  CONTINUE_CHAT_SCHEMA,
  CREATE_CHAT_SCHEMA,
  DELETE_CHAT_SCHEMA,
  EXTRACT_URL_SCHEMA,
  GET_CHAT_HISTORY_SCHEMA,
  LIST_CHATS_SCHEMA,
  SEARCH_SCHEMA,
} from "../validation/tool-schemas.js";
import { AuthenticationManager } from "./auth.js";
import { BrowserManager } from "./modules/BrowserManager.js";
import { BrowserPool } from "./modules/BrowserPool.js";
import { CircuitBreaker, type CircuitState } from "./modules/CircuitBreaker.js";
import { DatabaseManager } from "./modules/DatabaseManager.js";
import { DebugUtilities } from "./modules/DebugUtilities.js";
import { GracefulShutdown } from "./modules/GracefulShutdown.js";
import { HealthCheckManager } from "./modules/HealthCheckManager.js";
import { MetricsCollector } from "./modules/MetricsCollector.js";
import { RequestLogger } from "./modules/RequestLogger.js";
import { RequestQueue } from "./modules/RequestQueue.js";
import { ResourceManager } from "./modules/ResourceManager.js";
import { RetryManager } from "./modules/RetryManager.js";
import { SearchEngine } from "./modules/SearchEngine.js";
import { createToolHandlersRegistry, setupToolHandlers } from "./toolHandlerSetup.js";

// Import modular tool implementations
import chatPerplexity from "../tools/chatPerplexity.js";
import extractUrlContent from "../tools/extractUrlContent.js";

export class PerplexityServer {
  private readonly server: Server;
  private readonly browserManager: IBrowserManager;
  private readonly browserPool: IBrowserPool | null;
  private readonly searchEngine: ISearchEngine;
  private readonly databaseManager: IDatabaseManager;
  private readonly authManager: AuthenticationManager;
  private readonly requestQueue: RequestQueue;
  private readonly searchCircuitBreaker: CircuitBreaker;
  private readonly resourceManager: ResourceManager;
  private readonly retryManager: RetryManager;
  private readonly healthCheckManager: HealthCheckManager;
  private readonly metricsCollector: MetricsCollector;
  private readonly gracefulShutdown: GracefulShutdown;
  private readonly requestLogger: RequestLogger;
  private readonly useBrowserPool: boolean;

  constructor(dependencies?: ServerDependencies, useBrowserPool = false) {
    try {
      // Initialize MCP Server
      this.server = new Server(
        { name: "perplexity-server", version: "0.4.0" },
        {
          capabilities: {
            tools: {
              listChanged: true,
            },
          },
        },
      );

      this.useBrowserPool = useBrowserPool;

      // Initialize modules with dependency injection
      this.databaseManager = dependencies?.databaseManager ?? new DatabaseManager();
      this.authManager = new AuthenticationManager();
      this.resourceManager = new ResourceManager();
      this.requestQueue = new RequestQueue();
      this.searchCircuitBreaker = new CircuitBreaker();
      this.retryManager = new RetryManager();
      this.healthCheckManager = new HealthCheckManager();
      this.metricsCollector = new MetricsCollector();
      this.gracefulShutdown = new GracefulShutdown();
      this.requestLogger = new RequestLogger();

      // Initialize error handler
      ErrorHandler.initialize();

      // Development mode features
      const isDevMode = !process.env["NODE_ENV"] || process.env["NODE_ENV"] === "development";
      if (isDevMode) {
        // Dev mode initialization if needed
      }

      if (this.useBrowserPool && dependencies?.browserPool) {
        this.browserPool = dependencies.browserPool;
        this.browserManager = new BrowserManager();
      } else if (dependencies?.browserManager) {
        this.browserManager = dependencies.browserManager;
        this.browserPool = null;
      } else {
        this.browserManager = new BrowserManager();
        this.browserPool = null;
      }

      this.searchEngine = dependencies?.searchEngine ?? new SearchEngine(this.browserManager);

      // Initialize database
      this.databaseManager.initialize();

      // Setup tool handlers
      this.setupToolHandlers();

      // Setup graceful shutdown (only if not in MCP mode and not in test mode)
      // biome-ignore lint/complexity/useLiteralKeys: Environment variable access
      if (!process.env["MCP_MODE"] && !process.env["VITEST"]) {
        this.setupShutdownHandler();
      }

      logInfo("PerplexityServer initialized successfully");

      // Log authentication status
      const authStatus = this.authManager.getAuthStatus();
      if (authStatus.enabled) {
        logInfo("Authentication enabled", { hasApiKey: authStatus.hasApiKey });
      } else {
        logInfo("Authentication disabled (development mode)");
      }
    } catch (error) {
      logError("Error in PerplexityServer constructor:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  private setupShutdownHandler(): void {
    this.gracefulShutdown.registerHandler({
      name: "server-transport",
      priority: 1000,
      shutdown: async () => {
        try {
          await this.server.close();
        } catch (error) {
          logError("Error closing server:", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    });

    this.gracefulShutdown.registerHandler({
      name: "cleanup",
      priority: 1,
      shutdown: async () => {
        await this.cleanup();
      },
    });
  }

  private async cleanup(): Promise<void> {
    try {
      this.resourceManager.stopMonitoring();
      this.databaseManager.close();
      logInfo("Server cleanup completed");
    } catch (error) {
      logError("Error during cleanup:", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Tool handler implementations
  private async handleChatPerplexity(args: Record<string, unknown>): Promise<string> {
    const requestId = this.requestLogger.startRequest("chat_perplexity", args);
    const startTime = Date.now();

    try {
      // Create chat or continue chat based on whether chat_id is provided
      const schema = args["chat_id"] ? CONTINUE_CHAT_SCHEMA : CREATE_CHAT_SCHEMA;
      const validated = schema.parse(args);

      const searchResult = await this.searchCircuitBreaker.execute(
        () => this.searchEngine.performSearch(validated.message),
        "chat_perplexity_search",
      );

      const getChatHistoryFn = (chatId: string) => this.databaseManager.getChatHistory(chatId);
      const saveChatMessageFn = (
        chatId: string,
        message: { role: "user" | "assistant"; content: string },
      ) => this.databaseManager.saveChatMessage(chatId, message.role, message.content);

      const result = await chatPerplexity(
        validated,
        {} as never,
        () => Promise.resolve(searchResult),
        getChatHistoryFn,
        saveChatMessageFn,
      );

      this.metricsCollector.recordMetric("chat_perplexity_duration_ms", Date.now() - startTime);
      this.metricsCollector.incrementCounter("chat_perplexity_success");
      this.requestLogger.endRequest(requestId, "success");

      return result;
    } catch (error) {
      this.metricsCollector.incrementCounter("chat_perplexity_error");
      this.requestLogger.endRequest(
        requestId,
        "error",
        error instanceof Error ? error.message : String(error),
      );

      if (error instanceof ZodError) {
        throw new Error(`Invalid arguments: ${error.errors.map((e) => `${e.message}`).join(", ")}`);
      }
      throw error;
    }
  }

  private async handleGetDocumentation(args: Record<string, unknown>): Promise<string> {
    const requestId = this.requestLogger.startRequest("get_documentation", args);
    const startTime = Date.now();

    try {
      const typedArgs = args as { query: string; context?: string };

      const result = await this.searchCircuitBreaker.execute(
        () =>
          this.searchEngine.performSearch(
            `Documentation for ${typedArgs.query}: ${typedArgs.context || ""}`,
          ),
        "get_documentation",
      );

      this.metricsCollector.recordMetric("get_documentation_duration_ms", Date.now() - startTime);
      this.metricsCollector.incrementCounter("get_documentation_success");
      this.requestLogger.endRequest(requestId, "success");

      return result;
    } catch (error) {
      this.metricsCollector.incrementCounter("get_documentation_error");
      this.requestLogger.endRequest(
        requestId,
        "error",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private async handleFindApis(args: Record<string, unknown>): Promise<string> {
    const requestId = this.requestLogger.startRequest("find_apis", args);
    const startTime = Date.now();

    try {
      const typedArgs = args as { requirement: string; context?: string };

      const result = await this.searchCircuitBreaker.execute(
        () =>
          this.searchEngine.performSearch(
            `Find APIs for ${typedArgs.requirement}: ${typedArgs.context || ""}`,
          ),
        "find_apis",
      );

      this.metricsCollector.recordMetric("find_apis_duration_ms", Date.now() - startTime);
      this.metricsCollector.incrementCounter("find_apis_success");
      this.requestLogger.endRequest(requestId, "success");

      return result;
    } catch (error) {
      this.metricsCollector.incrementCounter("find_apis_error");
      this.requestLogger.endRequest(
        requestId,
        "error",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private async handleCheckDeprecatedCode(args: Record<string, unknown>): Promise<string> {
    const requestId = this.requestLogger.startRequest("check_deprecated_code", args);
    const startTime = Date.now();

    try {
      const typedArgs = args as { code: string; technology?: string };

      const result = await this.searchCircuitBreaker.execute(
        () =>
          this.searchEngine.performSearch(
            `Check if this ${typedArgs.technology || "code"} is deprecated: ${typedArgs.code}`,
          ),
        "check_deprecated_code",
      );

      this.metricsCollector.recordMetric(
        "check_deprecated_code_duration_ms",
        Date.now() - startTime,
      );
      this.metricsCollector.incrementCounter("check_deprecated_code_success");
      this.requestLogger.endRequest(requestId, "success");

      return result;
    } catch (error) {
      this.metricsCollector.incrementCounter("check_deprecated_code_error");
      this.requestLogger.endRequest(
        requestId,
        "error",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private async handleSearch(args: Record<string, unknown>): Promise<string> {
    const requestId = this.requestLogger.startRequest("search", args);
    const startTime = Date.now();

    try {
      const validated = SEARCH_SCHEMA.parse(args);

      const result = await this.searchCircuitBreaker.execute(
        () => this.searchEngine.performSearch(validated.query),
        "search",
      );

      this.metricsCollector.recordMetric("search_duration_ms", Date.now() - startTime);
      this.metricsCollector.incrementCounter("search_success");
      this.metricsCollector.recordHistogram("search_duration_ms", Date.now() - startTime);
      this.requestLogger.endRequest(requestId, "success");

      return result;
    } catch (error) {
      this.metricsCollector.incrementCounter("search_error");
      this.requestLogger.endRequest(
        requestId,
        "error",
        error instanceof Error ? error.message : String(error),
      );

      if (error instanceof ZodError) {
        throw new Error(`Invalid arguments: ${error.errors.map((e) => `${e.message}`).join(", ")}`);
      }
      throw error;
    }
  }

  private async handleExtractUrlContent(args: Record<string, unknown>): Promise<string> {
    const requestId = this.requestLogger.startRequest("extract_url_content", args);
    const startTime = Date.now();

    try {
      const validated = EXTRACT_URL_SCHEMA.parse(args);

      if (!this.browserManager.isReady()) {
        await this.browserManager.initialize();
      }

      const ctx = this.createPuppeteerContext();

      const result = await extractUrlContent(validated, ctx);

      this.metricsCollector.recordMetric("extract_url_content_duration_ms", Date.now() - startTime);
      this.metricsCollector.incrementCounter("extract_url_content_success");
      this.requestLogger.endRequest(requestId, "success");

      return result;
    } catch (error) {
      this.metricsCollector.incrementCounter("extract_url_content_error");
      this.requestLogger.endRequest(
        requestId,
        "error",
        error instanceof Error ? error.message : String(error),
      );

      if (error instanceof ZodError) {
        throw new Error(`Invalid arguments: ${error.errors.map((e) => `${e.message}`).join(", ")}`);
      }
      throw error;
    }
  }

  private createPuppeteerContext() {
    const browserManager = this.browserManager as any; // Access the getPuppeteerContext method
    return browserManager.getPuppeteerContext();
  }

  private setupToolHandlers(): void {
    const toolHandlers = createToolHandlersRegistry({
      chat_perplexity: this.handleChatPerplexity.bind(this),
      get_documentation: this.handleGetDocumentation.bind(this),
      find_apis: this.handleFindApis.bind(this),
      check_deprecated_code: this.handleCheckDeprecatedCode.bind(this),
      search: this.handleSearch.bind(this),
      extract_url_content: this.handleExtractUrlContent.bind(this),
    });

    setupToolHandlers(this.server, toolHandlers, this.authManager);
  }

  async initializeAdditional(): Promise<void> {
    try {
      // Start resource monitoring
      await this.resourceManager.startMonitoring();

      // Start request queue
      await this.requestQueue.start();

      // Initialize browser pool if enabled
      if (this.useBrowserPool && this.browserPool) {
        await this.browserPool.initialize();
      }

      // Initialize Phase 2 subsystems
      await this.initializePhase2Subsystems();

      logInfo(
        "Additional subsystems initialized (resource manager, request queue, browser pool, phase 2 modules)",
      );
    } catch (error) {
      logError("Failed to initialize additional subsystems:", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async initializePhase2Subsystems(): Promise<void> {
    try {
      // Start health check manager
      await this.healthCheckManager.start();

      // Register health checks for all modules
      this.healthCheckManager.register({
        module: "database",
        check: async () => this.databaseManager.isInitialized(),
        recover: async () => {
          try {
            await this.databaseManager.initialize();
          } catch {}
        },
      });

      this.healthCheckManager.register({
        module: "request-queue",
        check: async () => this.requestQueue.isRunning,
        recover: async () => {
          try {
            await this.requestQueue.start();
          } catch {}
        },
      });

      this.healthCheckManager.register({
        module: "circuit-breaker",
        check: async () => this.searchCircuitBreaker.getState() !== "OPEN",
        recover: async () => {
          try {
            this.searchCircuitBreaker.reset();
          } catch {}
        },
      });

      if (this.useBrowserPool && this.browserPool) {
        this.healthCheckManager.register({
          module: "browser-pool",
          check: async () => {
            try {
              const status = this.browserPool!.getPoolStatus();
              return status.inUse < status.total;
            } catch {
              return false;
            }
          },
          recover: async () => {
            try {
              await this.browserPool!.healthCheck();
            } catch {}
          },
        });
      }

      // Start request logger
      this.requestLogger;

      // Register shutdown handlers in priority order
      this.gracefulShutdown.registerHandler({
        name: "request-queue",
        priority: 100,
        shutdown: async () => {
          try {
            await this.requestQueue.stop();
          } catch {}
        },
      });

      if (this.useBrowserPool && this.browserPool) {
        this.gracefulShutdown.registerHandler({
          name: "browser-pool",
          priority: 90,
          shutdown: async () => {
            try {
              await this.browserPool?.cleanup();
            } catch {}
          },
        });
      }

      this.gracefulShutdown.registerHandler({
        name: "browser-manager",
        priority: 85,
        shutdown: async () => {
          try {
            await this.browserManager.cleanup();
          } catch {}
        },
      });

      this.gracefulShutdown.registerHandler({
        name: "resource-manager",
        priority: 60,
        shutdown: async () => this.resourceManager.stopMonitoring(),
      });

      this.gracefulShutdown.registerHandler({
        name: "database",
        priority: 50,
        shutdown: async () => this.databaseManager.close(),
      });

      this.gracefulShutdown.registerHandler({
        name: "health-check-manager",
        priority: 10,
        shutdown: async () => this.healthCheckManager.stop(),
      });

      this.gracefulShutdown.registerHandler({
        name: "metrics-collector",
        priority: 5,
        shutdown: async () => this.metricsCollector.stop(),
      });

      this.gracefulShutdown.registerHandler({
        name: "request-logger",
        priority: 5,
        shutdown: async () => this.requestLogger.stop(),
      });

      logInfo(
        "Phase 2 subsystems initialized (retry manager, health checks, metrics, graceful shutdown, request logger)",
      );
    } catch (error) {
      logError("Failed to initialize Phase 2 subsystems:", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async run(): Promise<void> {
    try {
      logInfo("Creating StdioServerTransport...");
      const transport = new StdioServerTransport();

      logInfo("Starting PerplexityServer...");
      logInfo(`Tools registered: ${Object.keys(this.getToolHandlersRegistry()).join(", ")}`);

      logInfo("Attempting to connect server to transport...");
      await this.server.connect(transport);
      logInfo("PerplexityServer connected and ready");
      logInfo("Server is listening for requests...");

      // Keep the process alive
      process.stdin.resume();
    } catch (error) {
      logError("Failed to start server:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      process.exit(1);
    }
  }

  private getToolHandlersRegistry() {
    return {
      chat_perplexity: this.handleChatPerplexity.bind(this),
      get_documentation: this.handleGetDocumentation.bind(this),
      find_apis: this.handleFindApis.bind(this),
      check_deprecated_code: this.handleCheckDeprecatedCode.bind(this),
      search: this.handleSearch.bind(this),
      extract_url_content: this.handleExtractUrlContent.bind(this),
    };
  }

  // Getters for testing
  public getBrowserManager(): IBrowserManager {
    return this.browserManager;
  }

  public getBrowserPool(): IBrowserPool | null {
    return this.browserPool;
  }

  public getSearchEngine(): ISearchEngine {
    return this.searchEngine;
  }

  public getDatabaseManager(): IDatabaseManager {
    return this.databaseManager;
  }

  public getRequestQueue(): RequestQueue {
    return this.requestQueue;
  }

  public getSearchCircuitBreaker(): CircuitBreaker {
    return this.searchCircuitBreaker;
  }

  public getResourceManager(): ResourceManager {
    return this.resourceManager;
  }

  public getRetryManager(): RetryManager {
    return this.retryManager;
  }

  public getHealthCheckManager(): HealthCheckManager {
    return this.healthCheckManager;
  }

  public getMetricsCollector(): MetricsCollector {
    return this.metricsCollector;
  }

  public getGracefulShutdown(): GracefulShutdown {
    return this.gracefulShutdown;
  }

  public getRequestLogger(): RequestLogger {
    return this.requestLogger;
  }

  public getServerStats(): {
    circuitBreaker: { state: CircuitState; stats: unknown };
    queue: unknown;
    pool: unknown;
    resources: unknown;
    healthChecks: unknown;
    metrics: unknown;
    shutdown: unknown;
  } {
    return {
      circuitBreaker: {
        state: this.searchCircuitBreaker.getState(),
        stats: this.searchCircuitBreaker.getStats(),
      },
      queue: this.requestQueue.getStats(),
      pool: this.browserPool
        ? this.browserPool.getPoolStatus()
        : { total: 0, inUse: 0, available: 0 },
      resources: this.resourceManager.getSystemStats(),
      healthChecks: this.healthCheckManager.getAllStatuses(),
      metrics: this.metricsCollector.getAllMetrics(),
      shutdown: this.gracefulShutdown.getStats(),
    };
  }
}
