export const CONFIG = {
  SEARCH_COOLDOWN: 5000,
  PAGE_TIMEOUT: 180000,
  SELECTOR_TIMEOUT: 90000,
  MAX_RETRIES: 10,
  MCP_TIMEOUT_BUFFER: 60000,
  ANSWER_WAIT_TIMEOUT: 120000,
  RECOVERY_WAIT_TIME: 15000,
  USER_AGENT:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  TIMEOUT_PROFILES: {
    navigation: 45000,
    selector: 15000,
    content: 120000,
    recovery: 30000,
  },
} as const;
