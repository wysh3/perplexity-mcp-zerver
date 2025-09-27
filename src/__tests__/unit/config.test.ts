import { describe, expect, it } from "vitest";
import { CONFIG } from "../../server/config.js";

describe("Configuration", () => {
  describe("Timeout Values", () => {
    it("should have consistent timeout values", () => {
      expect(CONFIG.PAGE_TIMEOUT).toBeGreaterThan(0);
      expect(CONFIG.SELECTOR_TIMEOUT).toBeGreaterThan(0);
      expect(CONFIG.ANSWER_WAIT_TIMEOUT).toBeGreaterThan(0);
      expect(CONFIG.MCP_TIMEOUT_BUFFER).toBeGreaterThan(0);
    });

    it("should have reasonable timeout relationships", () => {
      // Page timeout should be greater than selector timeout
      expect(CONFIG.PAGE_TIMEOUT).toBeGreaterThan(CONFIG.SELECTOR_TIMEOUT);

      // Answer wait timeout should be substantial for content loading
      expect(CONFIG.ANSWER_WAIT_TIMEOUT).toBeGreaterThan(30000);
    });
  });

  describe("User Agent", () => {
    it("should have valid user agent string", () => {
      expect(typeof CONFIG.USER_AGENT).toBe("string");
      expect(CONFIG.USER_AGENT.length).toBeGreaterThan(0);
      expect(CONFIG.USER_AGENT).toContain("Mozilla");
      expect(CONFIG.USER_AGENT).toContain("Chrome");
    });
  });

  describe("Retry Configuration", () => {
    it("should have reasonable retry limits", () => {
      expect(CONFIG.MAX_RETRIES).toBeGreaterThan(0);
      expect(CONFIG.MAX_RETRIES).toBeLessThan(20);
    });
  });

  describe("Timeout Profiles", () => {
    it("should have valid timeout profiles", () => {
      expect(CONFIG.TIMEOUT_PROFILES).toBeDefined();
      expect(CONFIG.TIMEOUT_PROFILES.navigation).toBeGreaterThan(0);
      expect(CONFIG.TIMEOUT_PROFILES.selector).toBeGreaterThan(0);
      expect(CONFIG.TIMEOUT_PROFILES.content).toBeGreaterThan(0);
      expect(CONFIG.TIMEOUT_PROFILES.recovery).toBeGreaterThan(0);
    });

    it("should have consistent timeout profile relationships", () => {
      // Navigation timeout should be substantial
      expect(CONFIG.TIMEOUT_PROFILES.navigation).toBeGreaterThan(30000);

      // Content timeout should be the longest
      expect(CONFIG.TIMEOUT_PROFILES.content).toBeGreaterThan(CONFIG.TIMEOUT_PROFILES.navigation);
    });
  });

  describe("Debug Configuration", () => {
    it("should have valid debug settings", () => {
      expect(typeof CONFIG.DEBUG.CAPTURE_SCREENSHOTS).toBe("boolean");
      expect(typeof CONFIG.DEBUG.SCREENSHOT_ON_RECOVERY_SUCCESS).toBe("boolean");
      expect(CONFIG.DEBUG.MAX_SCREENSHOTS).toBeGreaterThan(0);
    });
  });
});
