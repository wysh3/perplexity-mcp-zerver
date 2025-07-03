import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
/**
 * Testable DocshunterServer tests using proper mocking
 * Focus on testing the constructor and setup logic
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock all the heavy dependencies
const mockServer = {
  setRequestHandler: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
};

const mockDatabase = {
  close: vi.fn(),
};

// Mock MCP SDK - move MockServerClass inside the factory
vi.mock("@modelcontextprotocol/sdk/server/index.js", () => {
  const MockServerClass = vi.fn().mockImplementation(() => mockServer);
  return {
    Server: MockServerClass,
  };
});

// Mock Database
vi.mock("better-sqlite3", () => ({
  default: vi.fn().mockImplementation(() => mockDatabase),
}));

// Mock file system operations - move functions into mock factory
vi.mock("node:fs", () => {
  const mockExistsSync = vi.fn();
  const mockMkdirSync = vi.fn();
  return {
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
  };
});

// Mock database utilities - move functions into mock factory
vi.mock("../../utils/db.js", () => {
  const mockInitializeDatabase = vi.fn();
  return {
    initializeDatabase: mockInitializeDatabase,
    getChatHistory: vi.fn(),
    saveChatMessage: vi.fn(),
  };
});

// Mock logging
vi.mock("../../utils/logging.js", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

// Mock tool setup - move functions into mock factory
vi.mock("../toolHandlerSetup.js", () => {
  const mockSetupToolHandlers = vi.fn();
  const mockCreateToolHandlersRegistry = vi.fn().mockReturnValue({});
  return {
    setupToolHandlers: mockSetupToolHandlers,
    createToolHandlersRegistry: mockCreateToolHandlersRegistry,
  };
});

// Mock all tool implementations
vi.mock("../../tools/chatPerplexity.js", () => ({ default: vi.fn() }));
vi.mock("../../tools/getDocumentation.js", () => ({ default: vi.fn() }));
vi.mock("../../tools/findApis.js", () => ({ default: vi.fn() }));
vi.mock("../../tools/checkDeprecatedCode.js", () => ({ default: vi.fn() }));
vi.mock("../../tools/search.js", () => ({ default: vi.fn() }));
vi.mock("../../tools/extractUrlContent.js", () => ({ default: vi.fn() }));

// Mock Puppeteer utilities
vi.mock("../../utils/puppeteer.js", () => ({
  initializeBrowser: vi.fn(),
  navigateToPerplexity: vi.fn(),
  waitForSearchInput: vi.fn(),
  checkForCaptcha: vi.fn(),
  recoveryProcedure: vi.fn(),
  resetIdleTimeout: vi.fn(),
  retryOperation: vi.fn(),
}));

// Mock extraction utilities
vi.mock("../../utils/extraction.js", () => ({
  extractSameDomainLinks: vi.fn(),
  recursiveFetch: vi.fn(),
}));

// Mock fetch utilities
vi.mock("../../utils/fetch.js", () => ({
  fetchSimpleContent: vi.fn(),
}));

// Now import the class under test
import { PerplexityServer } from "../PerplexityServer.js";

// Import mocked logging functions
import * as logging from "../../utils/logging.js";
const mockLogInfo = vi.mocked(logging.logInfo);
const mockLogWarn = vi.mocked(logging.logWarn);
const mockLogError = vi.mocked(logging.logError);

// Import mocked fs functions
import * as fs from "node:fs";
const mockExistsSync = vi.mocked(fs.existsSync);
const mockMkdirSync = vi.mocked(fs.mkdirSync);

// Import mocked database functions
import * as db from "../../utils/db.js";
const mockInitializeDatabase = vi.mocked(db.initializeDatabase);

// Import mocked tool setup functions
import * as toolSetup from "../toolHandlerSetup.js";
const mockSetupToolHandlers = vi.mocked(toolSetup.setupToolHandlers);
const mockCreateToolHandlersRegistry = vi.mocked(toolSetup.createToolHandlersRegistry);

// Type for mock server (better than 'any')
interface MockServer {
  setRequestHandler: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

describe("PerplexityServer", () => {
  let server: PerplexityServer;
  let originalEnv: NodeJS.ProcessEnv;
  const mcpModeKey = "MCP_MODE";

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Reset environment safely
    originalEnv = { ...process.env };
    // Remove MCP_MODE without using delete operator
    process.env = { ...process.env };
    process.env[mcpModeKey] = undefined;

    // Setup default mock behavior
    mockExistsSync.mockReturnValue(true);
    // Reset database initialization to not throw by default
    mockInitializeDatabase.mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  describe("Constructor", () => {
    it("should initialize successfully with all components", () => {
      expect(() => {
        server = new DocshunterServer();
      }).not.toThrow();

      // Verify MCP Server was created - we'll verify this by checking if the server was instantiated
      // The mock constructor should have been called with the expected parameters

      // Verify database initialization
      expect(mockInitializeDatabase).toHaveBeenCalledWith(mockDatabase);

      // Verify tool handlers setup
      expect(mockSetupToolHandlers).toHaveBeenCalledWith(mockServer as MockServer, {});

      // Verify logging
      expect(mockLogInfo).toHaveBeenCalledWith(
        expect.stringContaining("Initializing database at:"),
      );
      expect(mockLogInfo).toHaveBeenCalledWith("DatabaseManager initialized successfully");
      expect(mockLogInfo).toHaveBeenCalledWith("PerplexityServer initialized successfully");
    });

    it("should create database directory if it doesn't exist", () => {
      mockExistsSync.mockReturnValue(false);

      server = new PerplexityServer();

      expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining("src"), {
        recursive: true,
      });
      expect(mockLogInfo).toHaveBeenCalledWith(
        expect.stringContaining("Initializing database at:"),
      );
    });

    it("should skip directory creation if it exists", () => {
      mockExistsSync.mockReturnValue(true);

      server = new DocshunterServer();

      expect(mockMkdirSync).not.toHaveBeenCalled();
    });

    it("should setup SIGINT handler when not in MCP mode", () => {
      const processOnSpy = vi.spyOn(process, "on");

      server = new DocshunterServer();

      expect(processOnSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    });

    it("should skip SIGINT handler when in MCP mode", () => {
      process.env[mcpModeKey] = "true";
      const processOnSpy = vi.spyOn(process, "on");

      server = new DocshunterServer();

      expect(processOnSpy).not.toHaveBeenCalledWith("SIGINT", expect.any(Function));
    });

    it("should handle constructor errors gracefully", () => {
      // Make database initialization fail
      mockInitializeDatabase.mockImplementation(() => {
        throw new Error("Database setup failed");
      });

      expect(() => {
        server = new DocshunterServer();
      }).toThrow("Database setup failed");

      expect(mockLogError).toHaveBeenCalledWith(
        "Error in DocshunterServer constructor:",
        expect.objectContaining({
          error: "Database setup failed",
          stack: expect.any(String),
        }),
      );
    });
  });

  describe("SIGINT Handler", () => {
    it("should gracefully shutdown on SIGINT", async () => {
      const processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit called");
      });

      server = new DocshunterServer();

      // Get the SIGINT handler that was registered with proper typing
      const processOnCalls = vi.mocked(process.on).mock.calls;
      const sigintCall = processOnCalls.find((call) => call[0] === "SIGINT");
      expect(sigintCall).toBeDefined();

      const sigintHandler = sigintCall?.[1] as () => Promise<void>;
      expect(sigintHandler).toBeDefined();

      // Mock server close
      mockServer.close.mockResolvedValue(undefined);

      try {
        await sigintHandler();
      } catch (error) {
        // Expected because we mocked process.exit to throw
        expect((error as Error).message).toBe("process.exit called");
      }

      expect(mockLogInfo).toHaveBeenCalledWith("SIGINT received, shutting down gracefully...");
      expect(mockDatabase.close).toHaveBeenCalled();
      expect(mockServer.close).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe("Tool Registry", () => {
    it("should create tool handlers registry correctly", () => {
      server = new DocshunterServer();

      expect(mockCreateToolHandlersRegistry).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_perplexity: expect.any(Function),
          get_documentation: expect.any(Function),
          find_apis: expect.any(Function),
          check_deprecated_code: expect.any(Function),
          search: expect.any(Function),
          extract_url_content: expect.any(Function),
        }),
      );
    });
  });
});
