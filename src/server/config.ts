export const CONFIG = {
  SEARCH_COOLDOWN: 5000, // Restored from backup.ts for better Cloudflare handling
  PAGE_TIMEOUT: 180000, // Restored from backup.ts (3 minutes) for Cloudflare challenges
  SELECTOR_TIMEOUT: 90000, // Restored from backup.ts (1.5 minutes) for slow loading
  MAX_RETRIES: 10, // Restored from backup.ts for better resilience
  MCP_TIMEOUT_BUFFER: 60000, // Restored from backup.ts
  ANSWER_WAIT_TIMEOUT: 120000, // Restored from backup.ts (2 minutes)
  RECOVERY_WAIT_TIME: 15000, // Restored from backup.ts
  USER_AGENT:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  TIMEOUT_PROFILES: {
    navigation: 45000, // Restored from backup.ts for Cloudflare navigation
    selector: 15000, // Restored from backup.ts
    content: 120000, // Restored from backup.ts (2 minutes)
    recovery: 30000, // Restored from backup.ts
  },
  DEBUG: {
    CAPTURE_SCREENSHOTS: true, // Enable/disable debug screenshots
    MAX_SCREENSHOTS: 5, // Maximum number of screenshots to keep
    SCREENSHOT_ON_RECOVERY_SUCCESS: false, // Don't screenshot successful recoveries
  },
} as const;
