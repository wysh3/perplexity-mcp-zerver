import { describe, expect, it } from "vitest";
import type {
  BrowserConfig,
  RecoveryContext,
  ErrorAnalysis,
  PuppeteerContext,
  IBrowserManager,
  ChatMessage,
  ChatResult,
  IDatabaseManager,
  ISearchEngine,
  ToolHandler,
  ToolHandlersRegistry,
  ChatPerplexityArgs,
  ExtractUrlContentArgs,
  SearchArgs,
  ServerDependencies,
} from "../../types/index.js";

describe("Type Definitions", () => {
  describe("Browser Types", () => {
    it("should define BrowserConfig structure", () => {
      const config: BrowserConfig = {
        USER_AGENT: "test-agent",
        PAGE_TIMEOUT: 30000,
        SELECTOR_TIMEOUT: 5000,
        MAX_RETRIES: 3,
        RECOVERY_WAIT_TIME: 5000,
        TIMEOUT_PROFILES: {
          navigation: 30000,
        },
      };

      expect(config.USER_AGENT).toBeTypeOf("string");
      expect(config.PAGE_TIMEOUT).toBeTypeOf("number");
    });

    it("should define RecoveryContext structure", () => {
      const context: RecoveryContext = {
        hasValidPage: true,
        hasBrowser: true,
        isBrowserConnected: true,
        operationCount: 5,
      };

      expect(context.hasValidPage).toBeTypeOf("boolean");
      expect(context.operationCount).toBeTypeOf("number");
    });

    it("should define ErrorAnalysis structure", () => {
      const errorAnalysis: ErrorAnalysis = {
        isTimeout: true,
        isNavigation: false,
        isConnection: false,
        isDetachedFrame: false,
        isCaptcha: false,
        consecutiveTimeouts: 0,
        consecutiveNavigationErrors: 0,
      };

      expect(errorAnalysis.isTimeout).toBeTypeOf("boolean");
      expect(errorAnalysis.consecutiveTimeouts).toBeTypeOf("number");
    });

    it("should define IBrowserManager interface", () => {
      // This is an interface, so we just verify it compiles
      const manager: IBrowserManager = {
        initialize: async () => {},
        navigateToPerplexity: async () => {},
        waitForSearchInput: async () => null,
        checkForCaptcha: async () => false,
        performRecovery: async () => {},
        isReady: () => true,
        cleanup: async () => {},
        getPage: () => null,
        getBrowser: () => null,
        resetIdleTimeout: () => {},
        getPuppeteerContext: () => ({}) as PuppeteerContext,
      };

      expect(manager).toBeDefined();
    });
  });

  describe("Database Types", () => {
    it("should define ChatMessage structure", () => {
      const message: ChatMessage = {
        role: "user",
        content: "Hello",
      };

      expect(message.role).toMatch(/^(user|assistant)$/);
      expect(message.content).toBeTypeOf("string");
    });

    it("should define ChatResult structure", () => {
      const result: ChatResult = {
        chat_id: "test-chat-id",
        response: "Test response",
      };

      expect(result.chat_id).toBeTypeOf("string");
      expect(result.response).toBeTypeOf("string");
    });

    it("should define IDatabaseManager interface", () => {
      const dbManager: IDatabaseManager = {
        initialize: () => {},
        getChatHistory: () => [],
        saveChatMessage: () => {},
        close: () => {},
        isInitialized: () => true,
      };

      expect(dbManager).toBeDefined();
    });
  });

  describe("Tool Types", () => {
    it("should define ISearchEngine interface", () => {
      const searchEngine: ISearchEngine = {
        performSearch: async () => "result",
      };

      expect(searchEngine.performSearch).toBeTypeOf("function");
    });

    it("should define ToolHandler type", () => {
      const handler: ToolHandler = async () => "result";
      expect(handler).toBeTypeOf("function");
    });

    it("should define ToolHandlersRegistry structure", () => {
      const registry: ToolHandlersRegistry = {
        chat_perplexity: async () => "result",
        search: async () => "result",
      };

      expect(registry).toBeDefined();
    });

    it("should define argument types", () => {
      const chatArgs: ChatPerplexityArgs = {
        message: "test message",
      };

      const extractArgs: ExtractUrlContentArgs = {
        url: "https://example.com",
      };

      const searchArgs: SearchArgs = {
        query: "test query",
        detail_level: "normal",
      };

      expect(chatArgs.message).toBeTypeOf("string");
      expect(extractArgs.url).toBeTypeOf("string");
      expect(searchArgs.query).toBeTypeOf("string");
    });
  });

  describe("Server Types", () => {
    it("should define ServerDependencies structure", () => {
      const dependencies: ServerDependencies = {
        browserManager: undefined,
        searchEngine: undefined,
        databaseManager: undefined,
      };

      expect(dependencies).toBeDefined();
    });
  });
});
