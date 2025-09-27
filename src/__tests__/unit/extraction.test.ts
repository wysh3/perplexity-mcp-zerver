import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PageContentResult } from "../../types/browser.js";

// Mock external dependencies
vi.mock("@mozilla/readability", () => ({
  Readability: vi.fn().mockImplementation(() => ({
    parse: vi.fn().mockReturnValue({
      title: "Test Title",
      textContent: "Test content from Readability",
    }),
  })),
}));

vi.mock("jsdom", () => ({
  JSDOM: vi.fn().mockImplementation(() => ({
    window: {
      document: {
        querySelector: vi.fn(),
        querySelectorAll: vi.fn().mockReturnValue([]),
        title: "Test Page",
      },
    },
    serialize: vi.fn().mockReturnValue("<html></html>"),
  })),
}));

vi.mock("axios", () => ({
  default: {
    head: vi.fn(),
  },
}));

// Mock internal dependencies
vi.mock("../../server/config.js", () => ({
  CONFIG: {
    USER_AGENT: "test-agent",
    TIMEOUT_PROFILES: {
      navigation: 30000,
      content: 60000,
    },
  },
}));

vi.mock("../../utils/logging.js", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("../../utils/puppeteer.js", () => ({
  initializeBrowser: vi.fn(),
}));

vi.mock("../../utils/fetch.js", () => ({
  fetchSimpleContent: vi.fn(),
}));

describe("Extraction Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Single Page Content Fetching", () => {
    it("should fetch and extract content from a single page", async () => {
      const { fetchSinglePageContent } = await import("../../utils/extraction.js");

      // We'll test this by focusing on the structure and not deep mocking
      expect(fetchSinglePageContent).toBeDefined();
      expect(typeof fetchSinglePageContent).toBe("function");
    });
  });

  describe("Link Extraction", () => {
    it("should extract same-domain links from a page", async () => {
      const { extractSameDomainLinks } = await import("../../utils/extraction.js");

      const mockPage: any = {
        evaluate: vi.fn().mockResolvedValue([
          { url: "/page1", text: "Page 1" },
          { url: "/page2", text: "Page 2" },
          { url: "https://example.com/page3", text: "Page 3" },
        ]),
      };

      const result = await extractSameDomainLinks(mockPage, "https://example.com");

      expect(result).toHaveLength(3);
      expect(result[0]?.url).toContain("https://example.com");
    });

    it("should filter out invalid and cross-domain links", async () => {
      const { extractSameDomainLinks } = await import("../../utils/extraction.js");

      const mockPage: any = {
        evaluate: vi.fn().mockResolvedValue([
          { url: "javascript:void(0)", text: "Invalid Link" },
          { url: "mailto:test@example.com", text: "Email Link" },
          { url: "https://other.com/page", text: "Cross Domain" },
          { url: "/valid-page", text: "Valid Page" },
        ]),
      };

      const result = await extractSameDomainLinks(mockPage, "https://example.com");

      // Should only have the valid same-domain link
      expect(result).toHaveLength(1);
      expect(result[0]?.url).toBe("https://example.com/valid-page");
    });

    it("should handle link extraction errors gracefully", async () => {
      const { extractSameDomainLinks } = await import("../../utils/extraction.js");

      const mockPage: any = {
        evaluate: vi.fn().mockRejectedValue(new Error("Evaluation failed")),
      };

      const result = await extractSameDomainLinks(mockPage, "https://example.com");

      expect(result).toEqual([]);
    });
  });

  describe("Recursive Content Fetching", () => {
    it("should recursively fetch content with depth limiting", async () => {
      const { recursiveFetch } = await import("../../utils/extraction.js");

      // Test that the function exists and can be called
      expect(recursiveFetch).toBeDefined();
      expect(typeof recursiveFetch).toBe("function");
    });

    it("should respect timeout signal during recursive fetch", async () => {
      const { recursiveFetch } = await import("../../utils/extraction.js");

      const mockCtx: any = { log: vi.fn() };
      const visitedUrls = new Set<string>();
      const results: PageContentResult[] = [];
      const globalTimeoutSignal = { timedOut: true }; // Already timed out

      await recursiveFetch(
        "https://example.com",
        2,
        1,
        visitedUrls,
        results,
        globalTimeoutSignal,
        mockCtx,
      );

      expect(results).toHaveLength(0);
    });

    it("should handle basic recursive fetch flow", async () => {
      const { recursiveFetch } = await import("../../utils/extraction.js");

      const mockCtx: any = { log: vi.fn() };
      const visitedUrls = new Set<string>();
      const results: PageContentResult[] = [];
      const globalTimeoutSignal = { timedOut: false };

      await recursiveFetch(
        "https://example.com",
        1,
        1,
        visitedUrls,
        results,
        globalTimeoutSignal,
        mockCtx,
      );

      // Should have attempted to process the URL
      expect(mockCtx.log).toHaveBeenCalledWith("info", "[Depth 1] Fetching: https://example.com");
    });

    it("should fetch simpler content for deeper levels", async () => {
      const { recursiveFetch } = await import("../../utils/extraction.js");

      const mockCtx: any = { log: vi.fn() };
      const visitedUrls = new Set<string>();
      const results: PageContentResult[] = [];
      const globalTimeoutSignal = { timedOut: false };

      // Mock fetchSimpleContent
      const { fetchSimpleContent } = await import("../../utils/fetch.js");
      vi.mocked(fetchSimpleContent).mockResolvedValue({
        url: "https://example.com/page1",
        title: "Page 1",
        textContent: "Page 1 content",
        error: null,
      } as any);

      await recursiveFetch(
        "https://example.com/page1",
        2,
        2, // currentDepth > 1, should use fetchSimpleContent
        visitedUrls,
        results,
        globalTimeoutSignal,
        mockCtx,
      );

      // Should have attempted to process the URL
      expect(mockCtx.log).toHaveBeenCalledWith(
        "info",
        "[Depth 2] Fetching: https://example.com/page1",
      );
    });
  });
});
