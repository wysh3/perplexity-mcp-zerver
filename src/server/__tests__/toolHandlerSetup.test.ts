import { beforeEach, describe, expect, it, vi } from "vitest";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { setupToolHandlers, createToolHandlersRegistry } from "../toolHandlerSetup.js";
import type { ToolHandlersRegistry } from "../../types/index.js";

describe("Tool Handler Setup", () => {
  let mockServer: any;
  let mockToolHandlers: ToolHandlersRegistry;

  beforeEach(() => {
    // Mock Server
    mockServer = {
      setRequestHandler: vi.fn(),
    };

    // Mock Tool Handlers
    mockToolHandlers = {
      chatPerplexity: vi.fn().mockResolvedValue("chat response"),
      search: vi.fn().mockResolvedValue("search response"),
      extractUrlContent: vi.fn().mockResolvedValue("extract response"),
      getDocumentation: vi.fn().mockResolvedValue("doc response"),
      findApis: vi.fn().mockResolvedValue("api response"),
      checkDeprecatedCode: vi.fn().mockResolvedValue("deprecated response"),
    } as ToolHandlersRegistry;
  });

  describe("setupToolHandlers", () => {
    it("should register ListTools handler", () => {
      setupToolHandlers(mockServer, mockToolHandlers);

      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        ListToolsRequestSchema,
        expect.any(Function),
      );
    });

    it("should register CallTool handler", () => {
      setupToolHandlers(mockServer, mockToolHandlers);

      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        CallToolRequestSchema,
        expect.any(Function),
      );
    });

    it("should call the appropriate tool handler for known tools", async () => {
      setupToolHandlers(mockServer, mockToolHandlers);

      // Get the CallTool handler function (second call)
      const callToolHandler = mockServer.setRequestHandler.mock.calls[1][1];

      const mockRequest = {
        params: {
          name: "chatPerplexity",
          arguments: { message: "test" },
        },
      };

      const response = await callToolHandler(mockRequest);
      expect(mockToolHandlers["chatPerplexity"]).toHaveBeenCalledWith({ message: "test" });
      expect(response).toHaveProperty("content");
    });
  });

  describe("createToolHandlersRegistry", () => {
    it("should create a tool handlers registry with provided handlers", () => {
      const registry = createToolHandlersRegistry(mockToolHandlers);

      expect(registry).toBeDefined();
      expect(registry["chatPerplexity"]).toBe(mockToolHandlers["chatPerplexity"]);
      expect(registry["search"]).toBe(mockToolHandlers["search"]);
      expect(registry["extractUrlContent"]).toBe(mockToolHandlers["extractUrlContent"]);
      expect(registry["getDocumentation"]).toBe(mockToolHandlers["getDocumentation"]);
      expect(registry["findApis"]).toBe(mockToolHandlers["findApis"]);
      expect(registry["checkDeprecatedCode"]).toBe(mockToolHandlers["checkDeprecatedCode"]);
    });
  });
});
