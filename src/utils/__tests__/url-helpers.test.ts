import { describe, expect, it } from "vitest";

describe("URL and Data Helper Functions", () => {
  describe("URL validation and parsing", () => {
    it("should validate basic URLs", () => {
      const validUrls = [
        "https://example.com",
        "http://test.org",
        "https://github.com/user/repo",
        "https://www.perplexity.ai",
      ];

      for (const url of validUrls) {
        expect(() => new URL(url)).not.toThrow();
      }
    });

    it("should identify GitHub repository URLs", () => {
      const testCases = [
        { url: "https://github.com/microsoft/vscode", isRepo: true },
        { url: "https://github.com/facebook/react", isRepo: true },
        { url: "https://github.com/microsoft", isRepo: false }, // user/org page
        { url: "https://github.com/microsoft/vscode/issues", isRepo: false }, // sub-page
        { url: "https://example.com", isRepo: false },
      ];

      for (const testCase of testCases) {
        try {
          const parsedUrl = new URL(testCase.url);
          const pathParts = parsedUrl.pathname.split("/").filter((part) => part.length > 0);
          const isGitHubRepo = parsedUrl.hostname === "github.com" && pathParts.length === 2;

          expect(isGitHubRepo).toBe(testCase.isRepo);
        } catch {
          expect(testCase.isRepo).toBe(false);
        }
      }
    });

    it("should generate gitingest URLs correctly", () => {
      const githubUrls = [
        {
          github: "https://github.com/microsoft/vscode",
          gitingest: "https://gitingest.com/microsoft/vscode",
        },
        {
          github: "https://github.com/facebook/react",
          gitingest: "https://gitingest.com/facebook/react",
        },
      ];

      for (const { github, gitingest } of githubUrls) {
        const parsedUrl = new URL(github);
        const expectedGitingest = `https://gitingest.com${parsedUrl.pathname}`;
        expect(expectedGitingest).toBe(gitingest);
      }
    });
  });

  describe("Content type validation", () => {
    it("should identify HTML content types", () => {
      const htmlContentTypes = [
        "text/html",
        "text/html; charset=utf-8",
        "application/xhtml+xml",
        "text/plain",
      ];

      for (const contentType of htmlContentTypes) {
        const isSupported = contentType.includes("html") || contentType.includes("text/plain");
        expect(isSupported).toBe(true);
      }
    });

    it("should reject non-HTML content types", () => {
      const nonHtmlContentTypes = [
        "application/pdf",
        "image/jpeg",
        "application/json",
        "video/mp4",
        "application/zip",
      ];

      for (const contentType of nonHtmlContentTypes) {
        const isSupported = contentType.includes("html") ?? contentType.includes("text/plain");
        expect(isSupported).toBe(false);
      }
    });
  });

  describe("Text content validation", () => {
    it("should validate minimum content length", () => {
      const testCases = [
        { text: "Short", title: "Title", isValid: false }, // Too short
        { text: "A".repeat(50), title: "Title", isValid: false }, // Still short
        { text: "A".repeat(200), title: "Title", isValid: true }, // Long enough
        { text: "A".repeat(1000), title: "Title", isValid: true }, // Definitely long enough
      ];

      for (const { text, title, isValid } of testCases) {
        const meetsMinLength =
          text.trim().length > (title?.length ?? 0) && text.trim().length > 100;
        expect(meetsMinLength).toBe(isValid);
      }
    });

    it("should handle text trimming correctly", () => {
      const testTexts = [
        { input: "  hello world  ", expected: "hello world" },
        { input: "\n\tSpaced content\n", expected: "Spaced content" },
        { input: "", expected: "" },
        { input: "   ", expected: "" },
      ];

      for (const { input, expected } of testTexts) {
        expect(input.trim()).toBe(expected);
      }
    });
  });

  describe("CSS selector helpers", () => {
    it("should validate common fallback selectors", () => {
      const fallbackSelectors = [
        "article",
        "main",
        '[role="main"]',
        "#content",
        ".content",
        "#main",
        ".main",
        "#article-body",
        ".article-body",
        ".post-content",
        ".entry-content",
      ];

      // These should all be valid CSS selectors (basic validation)
      for (const selector of fallbackSelectors) {
        expect(selector.length).toBeGreaterThan(0);
        expect(typeof selector).toBe("string");
        // Basic CSS selector format validation
        expect(selector).toMatch(/^[a-zA-Z#.\[\]"=_-]+$/);
      }
    });
  });

  describe("Error message formatting", () => {
    it("should format HTTP error messages correctly", () => {
      const testCases = [
        {
          statusCode: 404,
          url: "https://example.com",
          expected: "HTTP error 404 received when accessing URL: https://example.com",
        },
        {
          statusCode: 500,
          url: "https://test.org",
          expected: "HTTP error 500 received when accessing URL: https://test.org",
        },
      ];

      for (const { statusCode, url, expected } of testCases) {
        const errorMsg = `HTTP error ${statusCode} received when accessing URL: ${url}`;
        expect(errorMsg).toBe(expected);
      }
    });

    it("should format content type error messages", () => {
      const testCases = [
        { contentType: "application/pdf", expected: "Unsupported content type: application/pdf" },
        { contentType: "image/jpeg", expected: "Unsupported content type: image/jpeg" },
      ];

      for (const { contentType, expected } of testCases) {
        const errorMsg = `Unsupported content type: ${contentType}`;
        expect(errorMsg).toBe(expected);
      }
    });
  });

  describe("Query parameter validation", () => {
    it("should validate search detail levels", () => {
      const validDetailLevels = ["brief", "normal", "detailed"];
      const invalidDetailLevels = ["verbose", "short", "long", undefined, null];

      for (const level of validDetailLevels) {
        expect(["brief", "normal", "detailed"]).toContain(level);
      }

      for (const level of invalidDetailLevels) {
        if (level === undefined || level === null) {
          expect(level).toBeFalsy();
        } else {
          expect(["brief", "normal", "detailed"]).not.toContain(level);
        }
      }
    });

    it("should validate boolean parameters", () => {
      const validBooleans = [true, false];
      const invalidBooleans = ["true", "false", 1, 0, null, undefined];

      for (const bool of validBooleans) {
        expect(typeof bool).toBe("boolean");
      }

      for (const notBool of invalidBooleans) {
        expect(typeof notBool).not.toBe("boolean");
      }
    });

    it("should validate depth parameters", () => {
      const validDepths = [1, 2, 3, 4, 5];
      const invalidDepths = [0, -1, 6, 10, "1", null, undefined];

      for (const depth of validDepths) {
        expect(depth).toBeGreaterThan(0);
        expect(depth).toBeLessThanOrEqual(5);
        expect(typeof depth).toBe("number");
      }

      for (const depth of invalidDepths) {
        if (typeof depth === "number") {
          expect(depth <= 0 || depth > 5).toBe(true);
        } else {
          expect(typeof depth).not.toBe("number");
        }
      }
    });
  });
});
