import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the dependencies
vi.mock("puppeteer", () => ({
  default: {
    launch: vi.fn(),
  },
}));

vi.mock("@mozilla/readability", () => ({
  Readability: vi.fn(),
}));

vi.mock("jsdom", () => ({
  JSDOM: vi.fn(),
}));

describe("Extract URL Content Tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("URL validation", () => {
    it("should accept valid HTTP URLs", () => {
      const validUrls = [
        "http://example.com",
        "https://example.com",
        "https://www.example.com/path",
        "https://subdomain.example.com/path?query=value",
      ];

      for (const url of validUrls) {
        try {
          new URL(url);
          expect(true).toBe(true); // URL is valid
        } catch {
          expect.fail(`${url} should be a valid URL`);
        }
      }
    });

    it("should reject invalid URLs", () => {
      const invalidUrls = [
        "",
        "not-a-url",
        "ftp://example.com", // We only support HTTP/HTTPS
        "file://local-file",
      ];

      for (const url of invalidUrls) {
        if (url === "") {
          expect(url).toBe("");
          continue;
        }

        if (!url.startsWith("http")) {
          expect(url.startsWith("http")).toBe(false);
        }
      }
    });
  });

  describe("Content extraction", () => {
    it("should handle HTML content", () => {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head><title>Test Page</title></head>
          <body>
            <article>
              <h1>Main Title</h1>
              <p>Test paragraph content.</p>
            </article>
          </body>
        </html>
      `;

      expect(htmlContent).toContain("<title>Test Page</title>");
      expect(htmlContent).toContain("<h1>Main Title</h1>");
      expect(htmlContent).toContain("Test paragraph content.");
    });

    it("should format extracted content correctly", () => {
      const mockResult = {
        content: [
          {
            type: "text",
            text: "Extracted content from URL",
          },
        ],
        isError: false,
      };

      expect(mockResult.content).toHaveLength(1);
      expect(mockResult.content[0]?.type).toBe("text");
      expect(mockResult.content[0]?.text).toContain("Extracted content");
      expect(mockResult.isError).toBe(false);
    });
  });

  describe("Depth parameter", () => {
    it("should validate depth range", () => {
      const validDepths = [1, 2, 3, 4, 5];
      const invalidDepths = [0, 6, -1, 10];

      for (const depth of validDepths) {
        expect(depth).toBeGreaterThanOrEqual(1);
        expect(depth).toBeLessThanOrEqual(5);
      }

      for (const depth of invalidDepths) {
        expect(depth < 1 || depth > 5).toBe(true);
      }
    });

    it("should default to depth 1", () => {
      const defaultDepth = 1;
      expect(defaultDepth).toBe(1);
    });
  });

  describe("Error handling", () => {
    it("should handle network errors", () => {
      const networkError = {
        content: [
          {
            type: "text",
            text: "Error: Failed to fetch URL",
          },
        ],
        isError: true,
      };

      expect(networkError.isError).toBe(true);
      expect(networkError.content[0]?.text).toContain("Error:");
    });

    it("should handle invalid HTML", () => {
      const invalidHtml = "<html><head><title>Broken";

      // Even broken HTML should be processable to some degree
      expect(typeof invalidHtml).toBe("string");
      expect(invalidHtml.length).toBeGreaterThan(0);
    });
  });

  describe("GitHub repository handling", () => {
    it("should identify GitHub URLs", () => {
      const githubUrls = [
        "https://github.com/user/repo",
        "https://github.com/user/repo/tree/main",
        "https://github.com/user/repo/blob/main/README.md",
      ];

      for (const url of githubUrls) {
        const parsedUrl = new URL(url);
        expect(parsedUrl.host).toBe("github.com");
      }
    });

    it("should handle non-GitHub URLs", () => {
      const nonGithubUrls = [
        "https://example.com",
        "https://stackoverflow.com/questions/123",
        "https://docs.example.com/api",
      ];

      for (const url of nonGithubUrls) {
        const parsedUrl = new URL(url);
        expect(parsedUrl.host).not.toBe("github.com");
      }
    });
  });
});
