/**
 * Tool Handler Setup Module
 * Manages MCP tool registration and request handling logic
 */

import crypto from "node:crypto";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

import { TOOL_SCHEMAS } from "../schema/toolSchemas.js";
import type { ChatPerplexityArgs, ToolHandlersRegistry } from "../types/index.js";
import { logError, logWarn } from "../utils/logging.js";
import type { AuthenticationManager } from "./auth.js";

/**
 * Sets up MCP tool handlers for the server
 * @param server - The MCP Server instance
 * @param toolHandlers - Registry of tool handler functions
 * @param authManager - Authentication manager for API key validation (optional)
 */
export function setupToolHandlers(
  server: Server,
  toolHandlers: ToolHandlersRegistry,
  authManager?: AuthenticationManager,
): void {
  // Register ListTools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TOOL_SCHEMAS,
    };
  });

  // Register CallTool handler with comprehensive error handling and timeout management
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Check authentication if enabled
    if (authManager && authManager.isEnabled()) {
      const apiKey = (request as any).headers?.authorization?.replace("Bearer ", "");
      if (!authManager.authenticate(apiKey)) {
        logError(`Authentication failed for tool ${name}`);
        throw new McpError(
          ErrorCode.InvalidRequest,
          "Unauthorized: Invalid or missing API key. Set MCP_AUTH_ENABLED=true and MCP_API_KEY=your-key to use authentication.",
        );
      }
    }

    // Set a timeout for the entire MCP request
    const requestTimeout = setTimeout(() => {
      logWarn("MCP request is taking too long, this might lead to a timeout");
    }, 60000); // 60 seconds warning

    try {
      if (toolHandlers[name]) {
        const result = await toolHandlers[name](args || {});

        // Special case for chat to return chat_id
        if (name === "chat_perplexity") {
          const chatArgs = (args || {}) as unknown as ChatPerplexityArgs;
          const chatId = chatArgs.chat_id || crypto.randomUUID();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ chat_id: chatId, response: result }, null, 2),
              },
            ],
          };
        }

        return { content: [{ type: "text", text: result }] };
      }
      throw new McpError(ErrorCode.MethodNotFound, `Tool ${name} not found`);
    } catch (error) {
      logError(`Error executing tool ${name}:`, {
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof Error) {
        const errorMsg = error.message;

        if (errorMsg.includes("timeout") || errorMsg.includes("Timed out")) {
          logError("Timeout detected in MCP request");
          return {
            content: [
              {
                type: "text",
                text: "The operation timed out. This might be due to high server load or network issues. Please try again with a more specific query.",
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `The operation encountered an error: ${errorMsg}. Please try again.`,
            },
          ],
        };
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(requestTimeout);
    }
  });
}

/**
 * Creates a tool handlers registry with the provided handlers
 * @param handlers - Object mapping tool names to handler functions
 * @returns ToolHandlersRegistry
 */
export function createToolHandlersRegistry(handlers: ToolHandlersRegistry): ToolHandlersRegistry {
  return handlers;
}
