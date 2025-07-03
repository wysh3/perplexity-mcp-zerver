import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
/**
 * Tests for tool handler setup functionality
 * Tests the MCP tool registration and handler management
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createToolHandlersRegistry, setupToolHandlers } from "../toolHandlerSetup.js";
import type { ToolHandler, ToolHandlersRegistry } from "../../types/index.js";

// Create a properly typed mock server that matches the MCP Server interface
const createMockServer = (): Server => {
  return {
    setRequestHandler: vi.fn(),
    // Add minimal required properties for the Server type
    connect: vi.fn(),
    close: vi.fn(),
    // Use type assertion to satisfy the complex Server type
  } as unknown as Server;
};

// Mock tool schemas
vi.mock("../../schema/toolSchemas.js", () => ({
  TOOL_SCHEMAS: [
    {
      name: "test_tool",
      description: "A test tool",
      category: "Testing",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
        required: ["message"],
      },
    },
    {
      name: "another_tool",
      description: "Another test tool",
      category: "Testing",
      inputSchema: {
        type: "object",
        properties: {
          data: { type: "string" },
        },
        required: ["data"],
      },
    },
  ],
}));

describe("setupToolHandlers", () => {
  let mockServer: Server;
  let handlers: ToolHandlersRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = createMockServer();
    handlers = createToolHandlersRegistry({});
  });

  describe("createToolHandlersRegistry", () => {
    it("should create an empty registry", () => {
      const registry = createToolHandlersRegistry({});
      expect(registry).toEqual({});
    });
  });

  describe("Basic setup", () => {
    it("should register ListTools handler", () => {
      const testHandler: ToolHandler = vi.fn().mockResolvedValue("success");
      handlers.test_tool = testHandler;

      setupToolHandlers(mockServer, handlers);

      // Verify that setRequestHandler was called (testing functionality, not SDK internals)
      expect(mockServer.setRequestHandler).toHaveBeenCalled();
      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(2); // ListTools + CallTool
    });

    it("should register CallTool handler", () => {
      const testHandler: ToolHandler = vi.fn().mockResolvedValue("success");
      handlers.test_tool = testHandler;

      setupToolHandlers(mockServer, handlers);

      // Verify both handlers were registered
      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(2);
      // We don't need to test the SDK's internal Zod schemas, just that handlers are registered
    });
  });

  describe("ListTools handler", () => {
    it("should handle ListTools request correctly", async () => {
      const testHandler: ToolHandler = vi.fn().mockResolvedValue("success");
      handlers.test_tool = testHandler;

      setupToolHandlers(mockServer, handlers);

      // Get the first handler call (ListTools) - it should be at index 0
      const listToolsCall = (mockServer.setRequestHandler as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(listToolsCall).toBeDefined();

      const listToolsHandler = listToolsCall?.[1];
      const request = { method: "tools/list", params: {} };

      const result = await listToolsHandler(request);
      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools.length).toBeGreaterThan(0);
    });
  });

  describe("CallTool handler", () => {
    it("should execute tool handler for valid tool", async () => {
      const testHandler: ToolHandler = vi.fn().mockResolvedValue("Test response");
      handlers.existing_tool = testHandler;

      setupToolHandlers(mockServer, handlers);

      // Get the second handler call (CallTool) - it should be at index 1
      const callToolCall = (mockServer.setRequestHandler as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(callToolCall).toBeDefined();
      const callToolHandler = callToolCall?.[1];

      const request = {
        method: "tools/call",
        params: {
          name: "existing_tool",
          arguments: { message: "test" },
        },
      };

      const result = await callToolHandler(request);
      expect(testHandler).toHaveBeenCalledWith({ message: "test" });
      expect(result.content).toEqual([{ type: "text", text: "Test response" }]);
    });

    it("should handle missing tool with error response", async () => {
      const testHandler: ToolHandler = vi.fn().mockResolvedValue("success");
      handlers.existing_tool = testHandler;

      setupToolHandlers(mockServer, handlers);

      // Get the second handler call (CallTool) - it should be at index 1
      const callToolCall = (mockServer.setRequestHandler as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(callToolCall).toBeDefined();
      const callToolHandler = callToolCall?.[1];

      const request = {
        method: "tools/call",
        params: {
          name: "nonexistent_tool",
          arguments: {},
        },
      };

      const result = await callToolHandler(request);
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("Tool nonexistent_tool not found");
    });

    it("should handle tool execution errors gracefully", async () => {
      const failingHandler: ToolHandler = vi.fn().mockRejectedValue(new Error("Tool failed"));
      handlers.failing_tool = failingHandler;

      setupToolHandlers(mockServer, handlers);

      // Get the second handler call (CallTool) - it should be at index 1
      const callToolCall = (mockServer.setRequestHandler as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(callToolCall).toBeDefined();
      const callToolHandler = callToolCall?.[1];

      const request = {
        method: "tools/call",
        params: {
          name: "failing_tool",
          arguments: {},
        },
      };

      const result = await callToolHandler(request);
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("The operation encountered an error: Tool failed");
    });

    it("should handle timeout errors specifically", async () => {
      const timeoutHandler: ToolHandler = vi
        .fn()
        .mockRejectedValue(new Error("Operation timed out"));
      handlers.timeout_tool = timeoutHandler;

      setupToolHandlers(mockServer, handlers);

      // Get the second handler call (CallTool) - it should be at index 1
      const callToolCall = (mockServer.setRequestHandler as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(callToolCall).toBeDefined();
      const callToolHandler = callToolCall?.[1];

      const request = {
        method: "tools/call",
        params: {
          name: "timeout_tool",
          arguments: {},
        },
      };

      const result = await callToolHandler(request);
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("Operation timed out");
    });

    it("should handle chat_perplexity tool specially", async () => {
      const chatHandler: ToolHandler = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Chat response" }],
      });
      handlers.chat_perplexity = chatHandler;

      setupToolHandlers(mockServer, handlers);

      // Get the second handler call (CallTool) - it should be at index 1
      const callToolCall = (mockServer.setRequestHandler as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(callToolCall).toBeDefined();
      const callToolHandler = callToolCall?.[1];

      const request = {
        method: "tools/call",
        params: {
          name: "chat_perplexity",
          arguments: { message: "test", chat_id: "test-123" },
        },
      };

      const result = await callToolHandler(request);
      expect(chatHandler).toHaveBeenCalledWith({ message: "test", chat_id: "test-123" });
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe("text");
      const responseText = result.content[0].text;
      expect(responseText).toContain("test-123");
      expect(responseText).toContain("Chat response");
    });

    it("should generate chat_id for chat_perplexity when not provided", async () => {
      const chatHandler: ToolHandler = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Chat response" }],
      });
      handlers.chat_perplexity = chatHandler;

      setupToolHandlers(mockServer, handlers);

      // Get the second handler call (CallTool) - it should be at index 1
      const callToolCall = (mockServer.setRequestHandler as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(callToolCall).toBeDefined();
      const callToolHandler = callToolCall?.[1];

      const request = {
        method: "tools/call",
        params: {
          name: "chat_perplexity",
          arguments: { message: "test" },
        },
      };

      const result = await callToolHandler(request);

      // Verify that a chat_id was generated in the response
      expect(result.content).toBeDefined();
      const responseText = result.content[0].text;
      const parsedResponse = JSON.parse(responseText);
      expect(parsedResponse.chat_id).toBeDefined();
      expect(typeof parsedResponse.chat_id).toBe("string");
      expect(parsedResponse.chat_id.length).toBeGreaterThan(0);
    });

    it("should handle empty arguments", async () => {
      const testHandler: ToolHandler = vi.fn().mockResolvedValue("Success");
      handlers.test_tool = testHandler;

      setupToolHandlers(mockServer, handlers);

      // Get the second handler call (CallTool) - it should be at index 1
      const callToolCall = (mockServer.setRequestHandler as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(callToolCall).toBeDefined();
      const callToolHandler = callToolCall?.[1];

      const request = {
        method: "tools/call",
        params: {
          name: "test_tool",
          arguments: {},
        },
      };

      const result = await callToolHandler(request);
      expect(testHandler).toHaveBeenCalledWith({});
      expect(result.content).toEqual([{ type: "text", text: "Success" }]);
    });

    it("should clear timeout on completion", async () => {
      const testHandler: ToolHandler = vi.fn().mockResolvedValue("Success");
      handlers.test_tool = testHandler;

      setupToolHandlers(mockServer, handlers);

      // Get the second handler call (CallTool) - it should be at index 1
      const callToolCall = (mockServer.setRequestHandler as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(callToolCall).toBeDefined();
      const callToolHandler = callToolCall?.[1];

      const request = {
        method: "tools/call",
        params: {
          name: "test_tool",
          arguments: {},
        },
      };

      // This should complete without timing out
      const result = await callToolHandler(request);
      expect(result.content).toEqual([{ type: "text", text: "Success" }]);
    });
  });
});
