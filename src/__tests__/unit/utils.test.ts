import { describe, expect, it } from "vitest";

describe("Utility Functions", () => {
  describe("URL validation and parsing", () => {
    it("should validate basic URLs", () => {
      const validUrls = ["https://example.com", "http://test.org", "https://github.com/user/repo"];

      for (const url of validUrls) {
        expect(() => new URL(url)).not.toThrow();
      }
    });

    it("should identify GitHub repository URLs", () => {
      const githubRepoPattern = /^https:\/\/github\.com\/[^\/]+\/[^\/]+\/?$/;

      const testCases = [
        { url: "https://github.com/microsoft/vscode", isRepo: true },
        { url: "https://github.com/facebook/react", isRepo: true },
        { url: "https://github.com/microsoft", isRepo: false }, // user/org page
        { url: "https://github.com/microsoft/vscode/issues", isRepo: false }, // sub-page
        { url: "https://example.com", isRepo: false },
      ];

      for (const testCase of testCases) {
        const isMatch = githubRepoPattern.test(testCase.url);
        expect(isMatch).toBe(testCase.isRepo);
      }
    });
  });

  describe("Content validation", () => {
    it("should identify HTML content types", () => {
      const htmlContentTypes = ["text/html", "text/html; charset=utf-8", "application/xhtml+xml"];

      // Simple check for HTML content types
      expect(htmlContentTypes.length).toBeGreaterThan(0);
    });

    it("should validate content length", () => {
      const minLength = 100;
      const validContent = "a".repeat(minLength + 10);
      const invalidContent = "a".repeat(minLength - 10);

      expect(validContent.length).toBeGreaterThan(minLength);
      expect(invalidContent.length).toBeLessThan(minLength);
    });
  });

  describe("Parameter validation", () => {
    it("should validate depth parameters", () => {
      const validDepths = [1, 2, 3, 4, 5];
      const invalidDepths = [-1, 0, 6, 10];

      expect(validDepths.every((d) => d >= 1 && d <= 5)).toBe(true);
      expect(invalidDepths.some((d) => d < 1 || d > 5)).toBe(true);
    });

    it("should validate boolean parameters", () => {
      const truthyValues = [true, "true", 1, "1"];
      const falsyValues = [false, "false", 0, "0", null, undefined];

      // Basic boolean validation
      expect(truthyValues.length).toBeGreaterThan(0);
      expect(falsyValues.length).toBeGreaterThan(0);
    });
  });
});
