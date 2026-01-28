import { describe, expect, it, vi } from "vitest";
import type { PuppeteerContext } from "../../types/index.js";

// Mock external dependencies
const mockAxiosGet = vi.fn();
vi.mock("axios", () => ({
  default: {
    get: mockAxiosGet,
  },
}));

vi.mock("../../server/config.js", () => ({
  CONFIG: {
    USER_AGENT: "test-agent",
    TIMEOUT_PROFILES: {
      content: 60000,
    },
  },
}));

vi.mock("../../utils/logging.js", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

// Mock JSDOM and Readability
const mockReadabilityParse = vi.fn();
vi.mock("@mozilla/readability", () => {
  return {
    Readability: class {
      parse = mockReadabilityParse;
    },
  };
});

// Create a configurable JSDOM mock
let mockJSDOMDocument: any = {
  title: "",
  body: {
    textContent: "",
  },
};

class MockJSDOM {
  window: any = {
    document: mockJSDOMDocument,
  };

  constructor(html: string) {
    this.window.document = mockJSDOMDocument;
  }
}

vi.mock("jsdom", () => ({
  JSDOM: MockJSDOM,
}));

describe("Fetch Utilities", () => {
  // Create a mock PuppeteerContext
  const createMockContext = (): PuppeteerContext => ({
    browser: null,
    page: null,
    isInitializing: false,
    searchInputSelector: "",
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
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockJSDOMDocument = {
      title: "",
      body: {
        textContent: "",
      },
    };
  });

  describe("Successful Content Fetching", () => {
    it("should fetch and extract HTML content successfully", async () => {
      const { fetchSimpleContent } = await import("../../utils/fetch.js");

      // Mock successful HTTP response with sufficient content
      const mockResponse = {
        data: "<html><head><title>Test Page</title></head><body><p>This is test content with enough characters to pass validation requirements for meaningful content extraction.</p></body></html>",
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      };
      mockAxiosGet.mockResolvedValue(mockResponse);

      // Mock JSDOM
      mockJSDOMDocument = {
        title: "Test Page",
        body: {
          textContent:
            "This is test content with enough characters to pass validation requirements for meaningful content extraction.",
        },
      };

      // Mock Readability to return parsed content
      mockReadabilityParse.mockReturnValue({
        title: "Test Page",
        textContent:
          "This is test content with enough characters to pass validation requirements for meaningful content extraction.",
      });

      const result = await fetchSimpleContent("https://example.com", createMockContext());

      expect(result.title).toBe("Test Page");
      expect(result.textContent).toBe(
        "This is test content with enough characters to pass validation requirements for meaningful content extraction.",
      );
      expect(result.error).toBeUndefined();
      expect(mockAxiosGet).toHaveBeenCalledWith(
        "https://example.com",
        expect.objectContaining({
          timeout: 8000,
          headers: expect.objectContaining({
            "User-Agent": "test-agent",
          }),
        }),
      );
    });

    it("should handle plain text content", async () => {
      const { fetchSimpleContent } = await import("../../utils/fetch.js");

      // Mock successful HTTP response with plain text
      const mockResponse = {
        data: "This is plain text content with enough characters to pass the minimum length requirement for meaningful content.",
        status: 200,
        headers: {
          "content-type": "text/plain",
        },
      };
      mockAxiosGet.mockResolvedValue(mockResponse);

      // Mock JSDOM
      mockJSDOMDocument = {
        title: null,
        body: {
          textContent:
            "This is plain text content with enough characters to pass the minimum length requirement for meaningful content.",
        },
      };

      const result = await fetchSimpleContent("https://example.com/text", createMockContext());

      expect(result.title).toBeNull();
      expect(result.textContent).toBe(
        "This is plain text content with enough characters to pass the minimum length requirement for meaningful content.",
      );
      expect(result.error).toBeUndefined();
    });

    it("should use Readability for better content extraction when available", async () => {
      const { fetchSimpleContent } = await import("../../utils/fetch.js");

      // Mock successful HTTP response
      const mockResponse = {
        data: "<html><head><title>Article Title</title></head><body><article><p>This is a long article content that is meaningful and has enough characters to pass validation requirements.</p></article></body></html>",
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      };
      mockAxiosGet.mockResolvedValue(mockResponse);

      // Mock JSDOM
      mockJSDOMDocument = {
        title: "Article Title",
        body: {
          textContent: "Short content",
        },
      };

      // Mock Readability to return better content
      mockReadabilityParse.mockReturnValue({
        title: "Parsed Article Title",
        textContent:
          "This is a long article content that is meaningful and has enough characters to pass validation requirements.",
      });

      const result = await fetchSimpleContent("https://example.com/article", createMockContext());

      expect(result.title).toBe("Parsed Article Title");
      expect(result.textContent).toBe(
        "This is a long article content that is meaningful and has enough characters to pass validation requirements.",
      );
      expect(result.error).toBeUndefined();
    });
  });

  describe("Content Type Validation", () => {
    it("should reject unsupported content types", async () => {
      const { fetchSimpleContent } = await import("../../utils/fetch.js");

      // Mock HTTP response with unsupported content type
      const mockResponse = {
        data: "{}",
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      };
      mockAxiosGet.mockResolvedValue(mockResponse);

      const result = await fetchSimpleContent("https://example.com/api", createMockContext());

      expect(result.title).toBeNull();
      expect(result.textContent).toBeNull();
      expect(result.error).toContain("Unsupported content type: application/json");
    });

    it("should accept HTML content types", async () => {
      const { fetchSimpleContent } = await import("../../utils/fetch.js");

      // Mock successful HTTP response with HTML
      const mockResponse = {
        data: "<html><body><p>This is HTML content with sufficient length to pass validation requirements.</p></body></html>",
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      };
      mockAxiosGet.mockResolvedValue(mockResponse);

      // Mock JSDOM
      mockJSDOMDocument = {
        title: null,
        body: {
          textContent:
            "This is HTML content with sufficient length to pass validation requirements.",
        },
      };

      mockReadabilityParse.mockReturnValue(null);

      const result = await fetchSimpleContent("https://example.com/page", createMockContext());

      expect(result.error).toBeUndefined();
      expect(result.textContent).toBe(
        "This is HTML content with sufficient length to pass validation requirements.",
      );
    });

    it("should accept plain text content types", async () => {
      const { fetchSimpleContent } = await import("../../utils/fetch.js");

      // Mock successful HTTP response with plain text
      const mockResponse = {
        data: "Plain text content with sufficient length to pass validation requirements for meaningful content.",
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      };
      mockAxiosGet.mockResolvedValue(mockResponse);

      // Mock JSDOM
      mockJSDOMDocument = {
        title: null,
        body: {
          textContent:
            "Plain text content with sufficient length to pass validation requirements for meaningful content.",
        },
      };

      const result = await fetchSimpleContent("https://example.com/text", createMockContext());

      expect(result.error).toBeUndefined();
      expect(result.textContent).toBe(
        "Plain text content with sufficient length to pass validation requirements for meaningful content.",
      );
    });
  });

  describe("Content Processing", () => {
    it("should truncate very long content", async () => {
      const { fetchSimpleContent } = await import("../../utils/fetch.js");

      // Create very long content
      const longContent = "A".repeat(20000);

      // Mock successful HTTP response
      const mockResponse = {
        data: `<html><body><p>${longContent}</p></body></html>`,
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      };
      mockAxiosGet.mockResolvedValue(mockResponse);

      // Mock JSDOM
      mockJSDOMDocument = {
        title: null,
        body: {
          textContent: longContent,
        },
      };

      mockReadabilityParse.mockReturnValue(null);

      const result = await fetchSimpleContent("https://example.com/long", createMockContext());

      expect(result.error).toBeUndefined();
      expect(result.textContent).toContain("... (content truncated)");
      expect(result.textContent).toHaveLength(15000 + "... (content truncated)".length);
    });

    it("should reject content that is too short", async () => {
      const { fetchSimpleContent } = await import("../../utils/fetch.js");

      // Mock successful HTTP response with very short content
      const mockResponse = {
        data: "<html><body><p>Hi</p></body></html>",
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      };
      mockAxiosGet.mockResolvedValue(mockResponse);

      // Mock JSDOM
      mockJSDOMDocument = {
        title: null,
        body: {
          textContent: "Hi",
        },
      };

      mockReadabilityParse.mockReturnValue(null);

      const result = await fetchSimpleContent("https://example.com/short", createMockContext());

      expect(result.title).toBeNull();
      expect(result.textContent).toBeNull();
      expect(result.error).toContain("too short to be meaningful");
    });
  });

  describe("Error Handling", () => {
    it("should handle network timeouts", async () => {
      const { fetchSimpleContent } = await import("../../utils/fetch.js");

      // Mock timeout error
      const timeoutError: any = new Error("timeout");
      timeoutError.name = "AxiosError";
      timeoutError.code = "ECONNABORTED";
      mockAxiosGet.mockRejectedValue(timeoutError);

      const result = await fetchSimpleContent("https://example.com/timeout", createMockContext());

      expect(result.title).toBeNull();
      expect(result.textContent).toBeNull();
      expect(result.error).toContain("Request timeout");
    });

    it("should handle DNS resolution failures", async () => {
      const { fetchSimpleContent } = await import("../../utils/fetch.js");

      // Mock DNS error
      const dnsError: any = new Error("getaddrinfo ENOTFOUND");
      dnsError.name = "AxiosError";
      dnsError.code = "ENOTFOUND";
      mockAxiosGet.mockRejectedValue(dnsError);

      const result = await fetchSimpleContent(
        "https://invalid-domain-12345.com",
        createMockContext(),
      );

      expect(result.title).toBeNull();
      expect(result.textContent).toBeNull();
      expect(result.error).toContain("DNS resolution failed");
    });

    it("should handle HTTP client errors (4xx)", async () => {
      const { fetchSimpleContent } = await import("../../utils/fetch.js");

      // Mock 404 error
      const clientError: any = new Error("Not Found");
      clientError.name = "AxiosError";
      clientError.response = {
        status: 404,
        statusText: "Not Found",
      };
      mockAxiosGet.mockRejectedValue(clientError);

      const result = await fetchSimpleContent("https://example.com/notfound", createMockContext());

      expect(result.title).toBeNull();
      expect(result.textContent).toBeNull();
      expect(result.error).toContain("Client error (404)");
    });

    it("should handle HTTP server errors (5xx)", async () => {
      const { fetchSimpleContent } = await import("../../utils/fetch.js");

      // Mock 500 error
      const serverError: any = new Error("Internal Server Error");
      serverError.name = "AxiosError";
      serverError.response = {
        status: 500,
        statusText: "Internal Server Error",
      };
      mockAxiosGet.mockRejectedValue(serverError);

      const result = await fetchSimpleContent("https://example.com/error", createMockContext());

      expect(result.title).toBeNull();
      expect(result.textContent).toBeNull();
      expect(result.error).toContain("Server error (500)");
    });

    it("should handle non-string response data", async () => {
      const { fetchSimpleContent } = await import("../../utils/fetch.js");

      // Mock response with non-string data
      const mockResponse = {
        data: { not: "a string" },
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      };
      mockAxiosGet.mockResolvedValue(mockResponse);

      const result = await fetchSimpleContent("https://example.com/invalid", createMockContext());

      expect(result.title).toBeNull();
      expect(result.textContent).toBeNull();
      expect(result.error).toContain("Response data is not a string");
    });

    it("should handle Readability parsing failures gracefully", async () => {
      const { fetchSimpleContent } = await import("../../utils/fetch.js");

      // Mock successful HTTP response
      const mockResponse = {
        data: "<html><head><title>Fallback Test</title></head><body><p>This content has sufficient length to pass validation requirements.</p></body></html>",
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      };
      mockAxiosGet.mockResolvedValue(mockResponse);

      // Mock JSDOM
      mockJSDOMDocument = {
        title: "Fallback Test",
        body: {
          textContent: "This content has sufficient length to pass validation requirements.",
        },
      };

      // Mock Readability to throw an error
      mockReadabilityParse.mockImplementation(() => {
        throw new Error("Readability parsing failed");
      });

      const result = await fetchSimpleContent(
        "https://example.com/readability-fail",
        createMockContext(),
      );

      // Should fall back to body text extraction
      expect(result.error).toBeUndefined();
      expect(result.title).toBe("Fallback Test");
      expect(result.textContent).toBe(
        "This content has sufficient length to pass validation requirements.",
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty response data", async () => {
      const { fetchSimpleContent } = await import("../../utils/fetch.js");

      // Mock successful HTTP response with empty data
      const mockResponse = {
        data: "",
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      };
      mockAxiosGet.mockResolvedValue(mockResponse);

      // Mock JSDOM
      mockJSDOMDocument = {
        title: null,
        body: {
          textContent: "",
        },
      };

      mockReadabilityParse.mockReturnValue(null);

      const result = await fetchSimpleContent("https://example.com/empty", createMockContext());

      expect(result.title).toBeNull();
      expect(result.textContent).toBeNull();
      expect(result.error).toContain("too short to be meaningful");
    });

    it("should handle malformed HTML", async () => {
      const { fetchSimpleContent } = await import("../../utils/fetch.js");

      // Mock successful HTTP response with malformed HTML
      const mockResponse = {
        data: "<html><body><p>This content has sufficient length to pass validation requirements.</p>", // Missing closing tags
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      };
      mockAxiosGet.mockResolvedValue(mockResponse);

      // Mock JSDOM (it should handle malformed HTML gracefully)
      mockJSDOMDocument = {
        title: null,
        body: {
          textContent: "This content has sufficient length to pass validation requirements.",
        },
      };

      mockReadabilityParse.mockReturnValue(null);

      const result = await fetchSimpleContent("https://example.com/malformed", createMockContext());

      expect(result.error).toBeUndefined();
      expect(result.textContent).toBe(
        "This content has sufficient length to pass validation requirements.",
      );
    });
  });
});
