import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PuppeteerContext } from "../../types/index.js";
import chatPerplexity from "../chatPerplexity.js";

describe("chatPerplexity tool", () => {
  let mockContext: PuppeteerContext;
  let mockPerformSearch: ReturnType<typeof vi.fn>;
  let mockGetChatHistory: ReturnType<typeof vi.fn>;
  let mockSaveChatMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      log: vi.fn(),
      browser: null,
      page: null,
      isInitializing: false,
      searchInputSelector: 'textarea[placeholder*="Ask"]',
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

    mockPerformSearch = vi.fn().mockResolvedValue("Mock chat response");
    mockGetChatHistory = vi.fn().mockReturnValue([]);
    mockSaveChatMessage = vi.fn();
  });

  describe("chatPerplexity function", () => {
    it("should handle a basic chat message", async () => {
      const args = { message: "Hello, how are you?" };

      const result = await chatPerplexity(
        args,
        mockContext,
        mockPerformSearch,
        mockGetChatHistory,
        mockSaveChatMessage,
      );

      expect(result).toBe("Mock chat response");
      expect(mockPerformSearch).toHaveBeenCalledWith("User: Hello, how are you?\n", mockContext);
    });

    it("should handle empty message", async () => {
      const args = { message: "" };

      const result = await chatPerplexity(
        args,
        mockContext,
        mockPerformSearch,
        mockGetChatHistory,
        mockSaveChatMessage,
      );

      expect(result).toBe("Mock chat response");
      expect(mockPerformSearch).toHaveBeenCalledWith("User: \n", mockContext);
    });

    it("should handle long message", async () => {
      const longMessage =
        "This is a very long message that contains a lot of text and should be handled properly by the chat function without any issues.";
      const args = { message: longMessage };

      const result = await chatPerplexity(
        args,
        mockContext,
        mockPerformSearch,
        mockGetChatHistory,
        mockSaveChatMessage,
      );

      expect(result).toBe("Mock chat response");
      expect(mockPerformSearch).toHaveBeenCalledWith(`User: ${longMessage}\n`, mockContext);
    });

    it("should handle special characters in message", async () => {
      const specialMessage = "What about symbols like @#$%^&*()? Can you handle them?";
      const args = { message: specialMessage };

      const result = await chatPerplexity(
        args,
        mockContext,
        mockPerformSearch,
        mockGetChatHistory,
        mockSaveChatMessage,
      );

      expect(result).toBe("Mock chat response");
      expect(mockPerformSearch).toHaveBeenCalledWith(`User: ${specialMessage}\n`, mockContext);
    });
  });
});
