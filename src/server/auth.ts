/**
 * Authentication Manager for Perplexity MCP Server
 * Provides API key-based authentication to protect tool endpoints
 */

import crypto from "node:crypto";

interface AuthConfig {
  enabled: boolean;
  apiKeyHash?: string;
}

export class AuthenticationManager {
  private config: AuthConfig;

  constructor() {
    this.config = {
      enabled: process.env["MCP_AUTH_ENABLED"] === "true",
      apiKeyHash: process.env["MCP_API_KEY"]
        ? crypto.createHash("sha256").update(process.env["MCP_API_KEY"]).digest("hex")
        : undefined,
    };
  }

  authenticate(apiKey?: string): boolean {
    if (!this.config.enabled) {
      return true;
    }

    if (!apiKey || !this.config.apiKeyHash) {
      return false;
    }

    const hash = crypto.createHash("sha256").update(apiKey).digest("hex");
    return hash === this.config.apiKeyHash;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getAuthStatus(): { enabled: boolean; hasApiKey: boolean } {
    return {
      enabled: this.config.enabled,
      hasApiKey: !!this.config.apiKeyHash,
    };
  }
}
