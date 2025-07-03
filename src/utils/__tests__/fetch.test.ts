import { Readability } from "@mozilla/readability";
import axios from "axios";
import { JSDOM } from "jsdom";
/**
 * Tests for fetch utility functions
 * Focus on edge cases and error handling logic
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PuppeteerContext } from "../../types/index.js";
import { fetchSimpleContent } from "../fetch.js";

// Type definitions for mocks to avoid 'any' usage
interface MockDocument {
  title: string;
  body: { textContent: string };
}

interface MockJSDOMWindow {
  document: MockDocument;
}

interface MockJSDOMInstance {
  window: MockJSDOMWindow;
}

interface MockReader {
  parse: ReturnType<typeof vi.fn>;
}

interface MockAxiosResponse {
  status: number;
  data: string | Record<string, unknown>;
  headers: Record<string, string>;
}

interface MockAxiosError extends Error {
  name: string;
  code?: string;
  response?: {
    status: number;
    statusText: string;
  };
}

// Mock external dependencies
vi.mock("axios");
vi.mock("jsdom");
vi.mock("@mozilla/readability");

const mockAxios = vi.mocked(axios);
const mockJSDOM = vi.mocked(JSDOM);
const mockReadability = vi.mocked(Readability);

describe("fetchSimpleContent", () => {
  let mockContext: PuppeteerContext;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock context
    mockContext = {
      log: vi.fn(),
      browser: null,
      page: null,
      isInitializing: false,
      searchInputSelector: "",
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

    // Default axios mock
    const mockAxiosResponse: MockAxiosResponse = {
      status: 200,
      data: "<html><head><title>Test</title></head><body>Test content</body></html>",
      headers: { "content-type": "text/html" },
    };
    (mockAxios.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockAxiosResponse);

    // Default JSDOM mock
    const mockDoc: MockDocument = {
      title: "Test Title",
      body: {
        textContent:
          "Test content from body that is long enough to pass the minimum length check of 50 characters",
      },
    };
    mockJSDOM.mockImplementation(
      () =>
        ({
          window: { document: mockDoc as unknown as Document },
        }) as unknown as JSDOM,
    );

    // Default Readability mock
    const mockReader: MockReader = {
      parse: vi.fn().mockReturnValue({
        title: "Readability Title",
        textContent:
          "This is extracted content from Readability that is longer than 100 characters to pass the length check",
      }),
    };
    mockReadability.mockImplementation(() => mockReader);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("successful content extraction", () => {
    it("should extract content using Readability when available", async () => {
      const result = await fetchSimpleContent("https://example.com", mockContext);

      expect(result.title).toBe("Readability Title");
      expect(result.textContent).toContain("This is extracted content");
      expect(result.error).toBeUndefined();
      expect(mockContext.log).toHaveBeenCalledWith("info", expect.stringContaining("successful"));
    });

    it("should fall back to body text when Readability fails", async () => {
      // Make Readability return insufficient content
      const mockReader: MockReader = {
        parse: vi.fn().mockReturnValue({
          title: "Short",
          textContent: "Too short",
        }),
      };
      mockReadability.mockImplementation(() => mockReader);

      const result = await fetchSimpleContent("https://example.com", mockContext);

      expect(result.title).toBe("Test Title");
      expect(result.textContent).toBe(
        "Test content from body that is long enough to pass the minimum length check of 50 characters",
      );
      expect(result.error).toBeUndefined();
    });

    it("should handle non-HTML content types", async () => {
      const plainTextResponse: MockAxiosResponse = {
        status: 200,
        data: "Plain text content that is long enough to be meaningful for our test",
        headers: { "content-type": "text/plain" },
      };
      (mockAxios.get as ReturnType<typeof vi.fn>).mockResolvedValue(plainTextResponse);

      const result = await fetchSimpleContent("https://example.com/text", mockContext);

      expect(result.textContent).toBe(
        "Plain text content that is long enough to be meaningful for our test",
      );
      expect(result.error).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("should handle unsupported content types", async () => {
      const binaryResponse: MockAxiosResponse = {
        status: 200,
        data: "binary data",
        headers: { "content-type": "application/octet-stream" },
      };
      (mockAxios.get as ReturnType<typeof vi.fn>).mockResolvedValue(binaryResponse);

      const result = await fetchSimpleContent("https://example.com/binary", mockContext);

      expect(result.title).toBeNull();
      expect(result.textContent).toBeNull();
      expect(result.error).toContain("Unsupported content type");
    });

    it("should handle non-string response data", async () => {
      const objectResponse: MockAxiosResponse = {
        status: 200,
        data: { not: "a string" },
        headers: { "content-type": "text/html" },
      };
      (mockAxios.get as ReturnType<typeof vi.fn>).mockResolvedValue(objectResponse);

      const result = await fetchSimpleContent("https://example.com", mockContext);

      expect(result.title).toBeNull();
      expect(result.textContent).toBeNull();
      expect(result.error).toBe("Response data is not a string");
    });

    it("should handle content that is too short", async () => {
      const shortMockDoc: MockDocument = {
        title: "Short",
        body: { textContent: "Short" },
      };
      mockJSDOM.mockImplementation(
        () =>
          ({
            window: { document: shortMockDoc as unknown as Document },
          }) as unknown as JSDOM,
      );

      const shortMockReader: MockReader = {
        parse: vi.fn().mockReturnValue({
          title: "Short",
          textContent: "Short",
        }),
      };
      mockReadability.mockImplementation(() => shortMockReader);

      const result = await fetchSimpleContent("https://example.com", mockContext);

      expect(result.title).toBe("Short");
      expect(result.textContent).toBeNull();
      expect(result.error).toContain("too short to be meaningful");
    });

    it("should handle Readability exceptions", async () => {
      const throwingMockReader: MockReader = {
        parse: vi.fn().mockImplementation(() => {
          throw new Error("Readability parsing failed");
        }),
      };
      mockReadability.mockImplementation(() => throwingMockReader);

      const result = await fetchSimpleContent("https://example.com", mockContext);

      expect(result.title).toBe("Test Title");
      expect(result.textContent).toBe(
        "Test content from body that is long enough to pass the minimum length check of 50 characters",
      );
      expect(mockContext.log).toHaveBeenCalledWith(
        "warn",
        expect.stringContaining("Readability failed"),
      );
    });
  });

  describe("HTTP error handling", () => {
    it("should handle 404 errors", async () => {
      const error: MockAxiosError = Object.assign(
        new Error("Request failed with status code 404"),
        {
          name: "AxiosError",
          response: { status: 404, statusText: "Not Found" },
        },
      );
      (mockAxios.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const result = await fetchSimpleContent("https://example.com/notfound", mockContext);

      expect(result.title).toBeNull();
      expect(result.textContent).toBeNull();
      expect(result.error).toContain("Client error (404)");
    });

    it("should handle 500 errors", async () => {
      const error: MockAxiosError = Object.assign(
        new Error("Request failed with status code 500"),
        {
          name: "AxiosError",
          response: { status: 500, statusText: "Internal Server Error" },
        },
      );
      (mockAxios.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const result = await fetchSimpleContent("https://example.com", mockContext);

      expect(result.error).toContain("Server error (500)");
    });

    it("should handle timeout errors", async () => {
      const error: MockAxiosError = Object.assign(new Error("timeout of 15000ms exceeded"), {
        name: "AxiosError",
        code: "ECONNABORTED",
      });
      (mockAxios.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const result = await fetchSimpleContent("https://example.com", mockContext);

      expect(result.error).toContain("Request timeout");
    });

    it("should handle DNS resolution errors", async () => {
      const error: MockAxiosError = Object.assign(new Error("getaddrinfo ENOTFOUND"), {
        name: "AxiosError",
        code: "ENOTFOUND",
      });
      (mockAxios.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const result = await fetchSimpleContent("https://nonexistent.domain", mockContext);

      expect(result.error).toContain("DNS resolution failed");
    });

    it("should handle connection refused errors", async () => {
      const error: MockAxiosError = Object.assign(new Error("connect ECONNREFUSED"), {
        name: "AxiosError",
        code: "ECONNREFUSED",
      });
      (mockAxios.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const result = await fetchSimpleContent("https://example.com", mockContext);

      expect(result.error).toContain("Connection refused");
    });

    it("should handle unknown errors", async () => {
      const error = "String error";
      (mockAxios.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const result = await fetchSimpleContent("https://example.com", mockContext);

      expect(result.error).toContain("Unexpected error");
    });
  });

  describe("content processing", () => {
    it("should truncate very long content", async () => {
      const longContent = "x".repeat(20000);
      const longMockDoc: MockDocument = {
        title: "Long Content",
        body: { textContent: longContent },
      };
      mockJSDOM.mockImplementation(
        () =>
          ({
            window: { document: longMockDoc as unknown as Document },
          }) as unknown as JSDOM,
      );

      const longMockReader: MockReader = {
        parse: vi.fn().mockReturnValue({
          title: "Long Content",
          textContent: longContent,
        }),
      };
      mockReadability.mockImplementation(() => longMockReader);

      const result = await fetchSimpleContent("https://example.com", mockContext);

      expect(result.textContent).toContain("(content truncated)");
      expect(result.textContent?.length).toBeLessThan(20000);
      expect(mockContext.log).toHaveBeenCalledWith("info", expect.stringContaining("truncated"));
    });

    it("should clean up whitespace in content", async () => {
      const messyContent =
        "  Content    with\n\n\nmultiple\t\twhitespace   issues  that needs to be much longer to pass the minimum length requirements for content extraction";
      const messyMockDoc: MockDocument = {
        title: "Messy Content",
        body: { textContent: messyContent },
      };
      mockJSDOM.mockImplementation(
        () =>
          ({
            window: { document: messyMockDoc as unknown as Document },
          }) as unknown as JSDOM,
      );

      const messyMockReader: MockReader = {
        parse: vi.fn().mockReturnValue({
          title: "Messy Content",
          textContent: messyContent,
        }),
      };
      mockReadability.mockImplementation(() => messyMockReader);

      const result = await fetchSimpleContent("https://example.com", mockContext);

      expect(result.textContent).toBe(
        "Content with multiple whitespace issues that needs to be much longer to pass the minimum length requirements for content extraction",
      );
    });
  });

  describe("logging", () => {
    it("should log all major steps", async () => {
      await fetchSimpleContent("https://example.com", mockContext);

      expect(mockContext.log).toHaveBeenCalledWith(
        "info",
        expect.stringContaining("Simple fetch starting"),
      );
      expect(mockContext.log).toHaveBeenCalledWith("info", expect.stringContaining("Content-Type"));
      expect(mockContext.log).toHaveBeenCalledWith("info", expect.stringContaining("successful"));
    });

    it("should work without context", async () => {
      // Test with null context - using type assertion for null test case
      const result = await fetchSimpleContent(
        "https://example.com",
        null as unknown as PuppeteerContext,
      );

      expect(result.title).toBe("Readability Title");
      expect(result.error).toBeUndefined();
    });
  });
});
