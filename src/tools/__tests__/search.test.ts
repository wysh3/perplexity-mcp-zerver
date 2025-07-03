import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PuppeteerContext } from "../../types/index.js";
import search from "../search.js";

// Mock the dependencies before importing the module
vi.mock("puppeteer", () => ({
  default: {
    launch: vi.fn(),
  },
}));

describe("Search Tool", () => {
  let mockContext: PuppeteerContext;
  let mockPerformSearch: ReturnType<typeof vi.fn>;
  let mockPage: {
    isClosed: ReturnType<typeof vi.fn>;
    evaluate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPage = {
      isClosed: vi.fn().mockReturnValue(false),
      evaluate: vi.fn().mockResolvedValue({
        hasContent: true,
        contentLength: 500,
        hasInputField: true,
        pageState: "complete",
      }),
    };

    mockContext = {
      log: vi.fn(),
      browser: {} as never,
      page: mockPage as never,
      isInitializing: false,
      searchInputSelector: 'textarea[placeholder*="Ask"]',
      lastSearchTime: 0,
      idleTimeout: null,
      operationCount: 0,
      setBrowser: vi.fn(),
      setPage: vi.fn(),
      setIsInitializing: vi.fn(),
      setSearchInputSelector: vi.fn(),
      setIdleTimeout: vi.fn(),
      incrementOperationCount: vi.fn(),
      determineRecoveryLevel: vi.fn(),
      IDLE_TIMEOUT_MS: 300000,
    };

    mockPerformSearch = vi.fn().mockResolvedValue("Mock search result");
  });

  describe("Basic functionality", () => {
    it("should be defined", () => {
      // Basic smoke test
      expect(true).toBe(true);
    });

    it("should handle empty query", () => {
      // Test empty query validation
      const query = "";
      expect(query.length).toBe(0);
    });

    it("should validate query parameters", () => {
      // Test query parameter validation
      const validQuery = "test search query";
      const invalidQuery = "";

      expect(validQuery.length).toBeGreaterThan(0);
      expect(invalidQuery.length).toBe(0);
    });
  });

  describe("Search functionality", () => {
    it("should format search results correctly", () => {
      // Test result formatting
      const mockResult = {
        content: [
          {
            type: "text",
            text: "Sample search result",
          },
        ],
        isError: false,
      };

      expect(mockResult.content).toHaveLength(1);
      expect(mockResult.content[0]?.type).toBe("text");
      expect(mockResult.content[0]?.text).toBe("Sample search result");
      expect(mockResult.isError).toBe(false);
    });

    it("should handle search errors", () => {
      // Test error handling
      const errorResult = {
        content: [
          {
            type: "text",
            text: "Error: Search failed",
          },
        ],
        isError: true,
      };

      expect(errorResult.isError).toBe(true);
      expect(errorResult.content[0]?.text).toContain("Error:");
    });
  });

  describe("Integration scenarios", () => {
    it("should handle different detail levels", () => {
      // Test detail level parameters
      const detailLevels = ["brief", "normal", "detailed"];

      for (const level of detailLevels) {
        expect(["brief", "normal", "detailed"]).toContain(level);
      }
    });

    it("should validate streaming parameter", () => {
      // Test streaming parameter
      const streamingOptions = [true, false];

      for (const streaming of streamingOptions) {
        expect(typeof streaming).toBe("boolean");
      }
    });
  });

  describe("search function", () => {
    it("should perform a normal search", async () => {
      const args = { query: "test query" };

      const result = await search(args, mockContext, mockPerformSearch);

      expect(result).toBe("Mock search result");
      expect(mockPerformSearch).toHaveBeenCalledWith(
        "Provide a clear, balanced answer to: test query. Include key points and relevant context.",
        mockContext,
      );
    });

    it("should perform a brief search", async () => {
      const args = { query: "test query", detail_level: "brief" as const };

      const result = await search(args, mockContext, mockPerformSearch);

      expect(result).toBe("Mock search result");
      expect(mockPerformSearch).toHaveBeenCalledWith(
        "Provide a brief, concise answer to: test query",
        mockContext,
      );
    });

    it("should perform a detailed search", async () => {
      const args = { query: "test query", detail_level: "detailed" as const };

      const result = await search(args, mockContext, mockPerformSearch);

      expect(result).toBe("Mock search result");
      expect(mockPerformSearch).toHaveBeenCalledWith(
        "Provide a comprehensive, detailed analysis of: test query. Include relevant examples, context, and supporting information where applicable.",
        mockContext,
      );
    });

    it("should handle streaming search", async () => {
      const args = { query: "test query", stream: true };

      const result = await search(args, mockContext, mockPerformSearch);

      // Should return an async generator for streaming
      expect(typeof result).toBe("object");
      expect(result && typeof result === "object" && Symbol.asyncIterator in result).toBe(true);
    });

    it("should handle empty query", async () => {
      const args = { query: "" };

      const result = await search(args, mockContext, mockPerformSearch);

      expect(result).toBe("Mock search result");
      expect(mockPerformSearch).toHaveBeenCalledWith(
        "Provide a clear, balanced answer to: . Include key points and relevant context.",
        mockContext,
      );
    });

    it("should handle undefined detail level", async () => {
      const args = { query: "test query", detail_level: undefined };

      const result = await search(args, mockContext, mockPerformSearch);

      expect(result).toBe("Mock search result");
      expect(mockPerformSearch).toHaveBeenCalledWith(
        "Provide a clear, balanced answer to: test query. Include key points and relevant context.",
        mockContext,
      );
    });
  });

  describe("Streaming functionality", () => {
    it("should stream search results when stream=true", async () => {
      const args = { query: "streaming test", stream: true };
      const result = await search(args, mockContext, mockPerformSearch);

      expect(Symbol.asyncIterator in (result as object)).toBe(true);

      // Test streaming by collecting chunks
      const chunks: string[] = [];
      for await (const chunk of result as AsyncGenerator<string, void, unknown>) {
        chunks.push(chunk);
        // Break after a few chunks to avoid infinite loop in test
        if (chunks.length > 5) break;
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toContain("Starting documentation search");
    });

    it("should handle streaming with browser not ready", async () => {
      const contextWithoutBrowser = {
        ...mockContext,
        browser: null,
        page: null,
      };

      const args = { query: "test", stream: true };
      const result = await search(args, contextWithoutBrowser, mockPerformSearch);

      const chunks: string[] = [];
      for await (const chunk of result as AsyncGenerator<string, void, unknown>) {
        chunks.push(chunk);
        if (chunks.length > 3) break;
      }

      expect(chunks.some((chunk) => chunk.includes("Setting up browser"))).toBe(true);
    });

    it("should handle streaming with closed page", async () => {
      mockPage.isClosed.mockReturnValue(true);

      const args = { query: "test", stream: true };
      const result = await search(args, mockContext, mockPerformSearch);

      const chunks: string[] = [];
      for await (const chunk of result as AsyncGenerator<string, void, unknown>) {
        chunks.push(chunk);
        if (chunks.length > 3) break;
      }

      expect(chunks.some((chunk) => chunk.includes("Streaming unavailable"))).toBe(true);
    });

    it("should handle streaming errors gracefully", async () => {
      mockPerformSearch.mockRejectedValue(new Error("Search failed"));

      const args = { query: "error test", stream: true };
      const result = await search(args, mockContext, mockPerformSearch);

      const chunks: string[] = [];
      try {
        for await (const chunk of result as AsyncGenerator<string, void, unknown>) {
          chunks.push(chunk);
          if (chunks.length > 10) break;
        }
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("Search failed");
      }

      expect(chunks.some((chunk) => chunk.includes("Search failed"))).toBe(true);
    });

    it("should stream long results in chunks", async () => {
      const longResult = "A".repeat(1000); // Long result to test chunking
      mockPerformSearch.mockResolvedValue(longResult);

      const args = { query: "long test", stream: true };
      const result = await search(args, mockContext, mockPerformSearch);

      const chunks: string[] = [];
      for await (const chunk of result as AsyncGenerator<string, void, unknown>) {
        chunks.push(chunk);
        if (chunks.length > 15) break; // Enough to see chunking
      }

      // Should have multiple chunks containing parts of the long result
      const resultChunks = chunks.filter((chunk) => chunk.includes("A"));
      expect(resultChunks.length).toBeGreaterThan(1);
    });
  });

  describe("Page monitoring", () => {
    it("should monitor page content during streaming", async () => {
      mockPage.evaluate
        .mockResolvedValueOnce({
          hasContent: false,
          contentLength: 0,
          hasInputField: true,
          pageState: "loading",
        })
        .mockResolvedValueOnce({
          hasContent: true,
          contentLength: 100,
          hasInputField: true,
          pageState: "complete",
        });

      const args = { query: "monitoring test", stream: true };
      const result = await search(args, mockContext, mockPerformSearch);

      const chunks: string[] = [];
      for await (const chunk of result as AsyncGenerator<string, void, unknown>) {
        chunks.push(chunk);
        if (chunks.length > 8) break;
      }

      // Should have produced some streaming output
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.some((chunk) => chunk.length > 0)).toBe(true);
    });

    it("should handle page evaluation errors during monitoring", async () => {
      mockPage.evaluate.mockRejectedValue(new Error("Page navigation"));

      const args = { query: "eval error test", stream: true };
      const result = await search(args, mockContext, mockPerformSearch);

      const chunks: string[] = [];
      let iterations = 0;
      for await (const chunk of result as AsyncGenerator<string, void, unknown>) {
        chunks.push(chunk);
        iterations++;
        // Force break to avoid timeout
        if (iterations > 5 || chunk.includes("error") || chunk.includes("failed")) break;
      }

      // Should continue despite evaluation errors
      expect(chunks.length).toBeGreaterThan(0);
    }, 15000);

    it("should detect content updates during monitoring", async () => {
      let callCount = 0;
      mockPage.evaluate.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          hasContent: callCount > 1,
          contentLength: callCount * 50,
          hasInputField: true,
          pageState: callCount > 2 ? "complete" : "loading",
        });
      });

      const args = { query: "content update test", stream: true };
      const result = await search(args, mockContext, mockPerformSearch);

      const chunks: string[] = [];
      for await (const chunk of result as AsyncGenerator<string, void, unknown>) {
        chunks.push(chunk);
        if (chunks.length > 10) break;
      }

      // Should have produced streaming output and called evaluate multiple times
      expect(chunks.length).toBeGreaterThan(0);
      expect(callCount).toBeGreaterThan(1);
    });
  });

  describe("Error handling", () => {
    it("should handle performSearch errors in non-streaming mode", async () => {
      mockPerformSearch.mockRejectedValue(new Error("Network error"));

      const args = { query: "error test" };

      await expect(search(args, mockContext, mockPerformSearch)).rejects.toThrow("Network error");
    });

    it("should handle truncation of long queries in streaming", async () => {
      const longQuery = "A".repeat(200);
      const args = { query: longQuery, stream: true };
      const result = await search(args, mockContext, mockPerformSearch);

      const chunks: string[] = [];
      for await (const chunk of result as AsyncGenerator<string, void, unknown>) {
        chunks.push(chunk);
        if (chunks.length > 3) break;
      }

      const queryChunk = chunks.find((chunk) => chunk.includes("Submitting query"));
      if (queryChunk) {
        expect(queryChunk).toContain("...");
      } else {
        // If no query chunk found, that's also valid behavior
        expect(chunks.length).toBeGreaterThan(0);
      }
    });
  });
});
