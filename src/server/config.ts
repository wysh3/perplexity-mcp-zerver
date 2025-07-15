export const CONFIG = {
  SEARCH_COOLDOWN: 2000, // Reduced from 5000
  PAGE_TIMEOUT: 60000, // Reduced from 180000 (3min -> 1min)
  SELECTOR_TIMEOUT: 30000, // Reduced from 90000 (1.5min -> 30sec)
  MAX_RETRIES: 5, // Reduced from 10
  MCP_TIMEOUT_BUFFER: 30000, // Reduced from 60000
  ANSWER_WAIT_TIMEOUT: 45000, // Reduced from 120000 (2min -> 45sec)
  RECOVERY_WAIT_TIME: 8000, // Reduced from 15000
  USER_AGENT:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  TIMEOUT_PROFILES: {
    navigation: 20000, // Reduced from 45000
    selector: 8000, // Reduced from 15000
    content: 45000, // Reduced from 120000
    recovery: 15000, // Reduced from 30000
  },
} as const;
