import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PuppeteerContext } from "../../types/browser.js";
import type { PageContentResult } from "../../types/browser.js";
import type { ChatMessage } from "../../types/database.js";

// Mock Puppeteer
vi.mock("puppeteer", () => ({
  default: {
    launch: vi.fn(),
  },
}));

// Mock Mozilla Readability
vi.mock("@mozilla/readability", () => ({
  Readability: vi.fn(),
}));

// Mock JSDOM
vi.mock("jsdom", () => ({
  JSDOM: vi.fn(),
}));

// Mock logging
vi.mock("../../utils/logging.js", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

// Mock database utilities
const mockGetChatHistory = vi.fn();
const mockSaveChatMessage = vi.fn();
vi.mock("../../utils/db.js", () => ({
  initializeDatabase: vi.fn(),
  getChatHistory: () => mockGetChatHistory(),
  saveChatMessage: () => mockSaveChatMessage(),
}));

// Mock extraction utilities
vi.mock("../../utils/extraction.js", () => ({
  fetchSinglePageContent: vi.fn(),
  recursiveFetch: vi.fn(),
  extractSameDomainLinks: vi.fn(),
}));

// Mock fetch utilities
vi.mock("../../utils/fetch.js", () => ({
  fetchWithTimeout: vi.fn(),
  fetchSimpleContent: vi.fn(),
}));

// Mock puppeteer-logic utilities
vi.mock("../../utils/puppeteer-logic.js", () => ({
  isValidUrlForBrowser: vi.fn(),
}));

// Create a proper mock context with all required properties
const mockCtx: PuppeteerContext = {
  browser: null,
  page: null,
  isInitializing: false,
  searchInputSelector: 'textarea[placeholder*="Ask"]',
  lastSearchTime: 0,
  idleTimeout: null,
  operationCount: 0,
  log: vi.fn(),
  setBrowser: vi.fn(),
  setPage: vi.fn(),
  setIsInitializing: vi.fn(),
  setSearchInputSelector: vi.fn(),
  setIdleTimeout: vi.fn(),
  incrementOperationCount: vi.fn(),
  determineRecoveryLevel: vi.fn(),
  IDLE_TIMEOUT_MS: 300000,
};

describe("Tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("chatPerplexity", () => {
    it("should handle basic chat functionality with new chat_id", async () => {
      const { default: chatPerplexity } = await import("../../tools/chatPerplexity.js");

      mockGetChatHistory.mockReturnValue([]);
      const mockPerformSearch = vi.fn().mockResolvedValue("Mock response");

      const args = { message: "Hello, world!" };
      const result = await chatPerplexity(
        args,
        mockCtx,
        mockPerformSearch,
        mockGetChatHistory,
        mockSaveChatMessage,
      );

      expect(mockGetChatHistory).toHaveBeenCalled();
      expect(mockSaveChatMessage).toHaveBeenCalled();
      expect(mockPerformSearch).toHaveBeenCalledWith(
        expect.stringContaining("Hello, world!"),
        mockCtx,
      );
      expect(result).toBe("Mock response");
    });

    it("should handle chat with existing chat_id and history", async () => {
      const { default: chatPerplexity } = await import("../../tools/chatPerplexity.js");

      mockGetChatHistory.mockReturnValue([
        { role: "user", content: "Previous message" } as ChatMessage,
        { role: "assistant", content: "Previous response" } as ChatMessage,
      ]);
      const mockPerformSearch = vi.fn().mockResolvedValue("New response");

      const args = { message: "New message", chat_id: "test-chat-id" };
      const result = await chatPerplexity(
        args,
        mockCtx,
        mockPerformSearch,
        mockGetChatHistory,
        mockSaveChatMessage,
      );

      expect(mockGetChatHistory).toHaveBeenCalledWith("test-chat-id");
      expect(mockPerformSearch).toHaveBeenCalledWith(
        expect.stringContaining("Previous message"),
        mockCtx,
      );
      expect(result).toBe("New response");
    });

    it("should handle empty message gracefully", async () => {
      const { default: chatPerplexity } = await import("../../tools/chatPerplexity.js");

      mockGetChatHistory.mockReturnValue([]);
      const mockPerformSearch = vi.fn().mockResolvedValue("Response to empty message");

      const args = { message: "" };
      const result = await chatPerplexity(
        args,
        mockCtx,
        mockPerformSearch,
        mockGetChatHistory,
        mockSaveChatMessage,
      );

      expect(mockPerformSearch).toHaveBeenCalled();
      expect(result).toBe("Response to empty message");
    });
  });

  describe("search", () => {
    it("should handle normal detail level search", async () => {
      const { default: search } = await import("../../tools/search.js");

      const mockPerformSearch = vi.fn().mockResolvedValue("Normal search result");

      const args = { query: "test query", detail_level: "normal" as const };
      const result = await search(args, mockCtx, mockPerformSearch);

      expect(mockPerformSearch).toHaveBeenCalledWith(
        expect.stringContaining("Provide a clear, balanced answer to: test query"),
        mockCtx,
      );
      expect(result).toBe("Normal search result");
    });

    it("should handle brief detail level search", async () => {
      const { default: search } = await import("../../tools/search.js");

      const mockPerformSearch = vi.fn().mockResolvedValue("Brief search result");

      const args = { query: "test query", detail_level: "brief" as const };
      const result = await search(args, mockCtx, mockPerformSearch);

      expect(mockPerformSearch).toHaveBeenCalledWith(
        expect.stringContaining("Provide a brief, concise answer to: test query"),
        mockCtx,
      );
      expect(result).toBe("Brief search result");
    });

    it("should handle detailed detail level search", async () => {
      const { default: search } = await import("../../tools/search.js");

      const mockPerformSearch = vi.fn().mockResolvedValue("Detailed search result");

      const args = { query: "test query", detail_level: "detailed" as const };
      const result = await search(args, mockCtx, mockPerformSearch);

      expect(mockPerformSearch).toHaveBeenCalledWith(
        expect.stringContaining("Provide a comprehensive, detailed analysis of: test query"),
        mockCtx,
      );
      expect(result).toBe("Detailed search result");
    });

    it("should handle streaming search", async () => {
      const { default: search } = await import("../../tools/search.js");

      const mockPerformSearch = vi.fn().mockResolvedValue("Streaming search result");

      const args = { query: "test query", stream: true };
      const result = await search(args, mockCtx, mockPerformSearch);

      // Should return a generator for streaming
      expect(typeof result).toBe("object");
      expect(result).toHaveProperty("next");
    });

    it("should handle search with default parameters", async () => {
      const { default: search } = await import("../../tools/search.js");

      const mockPerformSearch = vi.fn().mockResolvedValue("Default search result");

      const args = { query: "test query" };
      const result = await search(args, mockCtx, mockPerformSearch);

      expect(mockPerformSearch).toHaveBeenCalledWith(
        expect.stringContaining("Provide a clear, balanced answer to: test query"),
        mockCtx,
      );
      expect(result).toBe("Default search result");
    });
  });

  describe("extractUrlContent", () => {
    it("should handle single page extraction", async () => {
      const { default: extractUrlContent } = await import("../../tools/extractUrlContent.js");

      const mockResult: PageContentResult = {
        url: "https://example.com",
        title: "Example Page",
        textContent: "Example content",
        error: null,
      };

      const { fetchSinglePageContent } = await import("../../utils/extraction.js");
      vi.mocked(fetchSinglePageContent).mockResolvedValue(mockResult);

      const args = { url: "https://example.com", depth: 1 };
      const result = await extractUrlContent(args, mockCtx);

      // For depth=1, it should return the result directly as JSON
      const parsedResult = JSON.parse(result);
      expect(parsedResult.url).toBe("https://example.com");
      expect(parsedResult.textContent).toBe("Example content");
    });

    it("should handle recursive extraction with depth > 1", async () => {
      const { default: extractUrlContent } = await import("../../tools/extractUrlContent.js");

      const mockResults: PageContentResult[] = [
        {
          url: "https://example.com",
          title: "Example Page",
          textContent: "Example content",
          error: null,
        },
      ];

      const { recursiveFetch } = await import("../../utils/extraction.js");
      vi.mocked(recursiveFetch).mockImplementation(async (_, __, ___, ____, results) => {
        results.push(...mockResults);
      });

      const args = { url: "https://example.com", depth: 2 };
      const result = await extractUrlContent(args, mockCtx);

      const parsedResult = JSON.parse(result);
      expect(parsedResult.explorationDepth).toBe(2);
      expect(parsedResult.pagesExplored).toBe(1);
      expect(parsedResult.rootUrl).toBe("https://example.com");
    });

    it("should handle GitHub URL rewriting", async () => {
      const { default: extractUrlContent } = await import("../../tools/extractUrlContent.js");

      const mockResult: PageContentResult = {
        url: "https://github.com/user/repo",
        title: "GitHub Repository",
        textContent: "Repository content",
        error: null,
      };

      const { fetchSinglePageContent } = await import("../../utils/extraction.js");
      vi.mocked(fetchSinglePageContent).mockResolvedValue(mockResult);

      const args = { url: "https://github.com/user/repo", depth: 1 };
      const result = await extractUrlContent(args, mockCtx);

      // For GitHub URLs with depth=1, it should still return the result directly
      const parsedResult = JSON.parse(result);
      expect(parsedResult.url).toBe("https://github.com/user/repo");
      expect(parsedResult.textContent).toBe("Repository content");
    });

    it("should handle extraction errors gracefully", async () => {
      const { default: extractUrlContent } = await import("../../tools/extractUrlContent.js");

      const { fetchSinglePageContent } = await import("../../utils/extraction.js");
      // Mock fetchSinglePageContent to return an error result, not throw
      vi.mocked(fetchSinglePageContent).mockResolvedValue({
        url: "https://invalid-url.com",
        error: "Network error",
      });

      const args = { url: "https://invalid-url.com", depth: 1 };

      // The function should catch the error and return it in the result, not throw
      const result = await extractUrlContent(args, mockCtx);

      // For depth=1, errors should be returned in the result object
      const parsedResult = JSON.parse(result);
      expect(parsedResult.error).toContain("Network error");
    });

    it("should validate depth parameter boundaries", async () => {
      const { default: extractUrlContent } = await import("../../tools/extractUrlContent.js");

      const mockResult: PageContentResult = {
        url: "https://example.com",
        title: "Example Page",
        textContent: "Example content",
        error: null,
      };

      const { fetchSinglePageContent } = await import("../../utils/extraction.js");
      vi.mocked(fetchSinglePageContent).mockResolvedValue(mockResult);

      // Test depth clamping - should be max 5
      const args = { url: "https://example.com", depth: 10 };
      const result = await extractUrlContent(args, mockCtx);

      // For depth > 1, it should return the formatted result object
      const parsedResult = JSON.parse(result);
      expect(parsedResult.explorationDepth).toBe(5); // Max depth should be 5
    });
  });

  describe("getDocumentation", () => {
    it("should handle basic documentation query", async () => {
      const { default: getDocumentation } = await import("../../tools/getDocumentation.js");

      const mockPerformSearch = vi.fn().mockResolvedValue("Documentation result");

      const args = { query: "React hooks" };
      const result = await getDocumentation(args, mockCtx, mockPerformSearch);

      expect(mockPerformSearch).toHaveBeenCalledWith(
        expect.stringContaining(
          "Provide comprehensive documentation and usage examples for React hooks",
        ),
        mockCtx,
      );
      expect(result).toBe("Documentation result");
    });

    it("should handle documentation query with context", async () => {
      const { default: getDocumentation } = await import("../../tools/getDocumentation.js");

      const mockPerformSearch = vi.fn().mockResolvedValue("Documentation with context result");

      const args = { query: "React hooks", context: "focus on performance optimization" };
      const result = await getDocumentation(args, mockCtx, mockPerformSearch);

      expect(mockPerformSearch).toHaveBeenCalledWith(
        expect.stringContaining("Focus on: focus on performance optimization"),
        mockCtx,
      );
      expect(result).toBe("Documentation with context result");
    });
  });

  describe("findApis", () => {
    it("should handle API discovery query", async () => {
      const { default: findApis } = await import("../../tools/findApis.js");

      const mockPerformSearch = vi.fn().mockResolvedValue("API discovery result");

      const args = { requirement: "image recognition" };
      const result = await findApis(args, mockCtx, mockPerformSearch);

      expect(mockPerformSearch).toHaveBeenCalledWith(
        expect.stringContaining("Find and evaluate APIs that could be used for: image recognition"),
        mockCtx,
      );
      expect(result).toBe("API discovery result");
    });

    it("should handle API discovery with context", async () => {
      const { default: findApis } = await import("../../tools/findApis.js");

      const mockPerformSearch = vi.fn().mockResolvedValue("API discovery with context result");

      const args = { requirement: "payment processing", context: "prefer free tier options" };
      const result = await findApis(args, mockCtx, mockPerformSearch);

      expect(mockPerformSearch).toHaveBeenCalledWith(
        expect.stringContaining("Context: prefer free tier options"),
        mockCtx,
      );
      expect(result).toBe("API discovery with context result");
    });
  });

  describe("checkDeprecatedCode", () => {
    it("should handle deprecated code checking", async () => {
      const { default: checkDeprecatedCode } = await import("../../tools/checkDeprecatedCode.js");

      const mockPerformSearch = vi.fn().mockResolvedValue("Deprecation check result");

      const args = { code: "componentWillMount()" };
      const result = await checkDeprecatedCode(args, mockCtx, mockPerformSearch);

      expect(mockPerformSearch).toHaveBeenCalledWith(
        expect.stringContaining("componentWillMount()"),
        mockCtx,
      );
      expect(result).toBe("Deprecation check result");
    });

    it("should handle deprecated code checking with technology context", async () => {
      const { default: checkDeprecatedCode } = await import("../../tools/checkDeprecatedCode.js");

      const mockPerformSearch = vi
        .fn()
        .mockResolvedValue("Deprecation check with tech context result");

      const args = { code: "var instead of let/const", technology: "React 16" };
      const result = await checkDeprecatedCode(args, mockCtx, mockPerformSearch);

      expect(mockPerformSearch).toHaveBeenCalledWith(
        expect.stringContaining("var instead of let/const"),
        mockCtx,
      );
      expect(mockPerformSearch).toHaveBeenCalledWith(expect.stringContaining("React 16"), mockCtx);
      expect(result).toBe("Deprecation check with tech context result");
    });
  });
});
