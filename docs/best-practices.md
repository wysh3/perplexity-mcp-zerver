# Best Practices for Project Dependencies and MCP Integration

## Puppeteer

### **Browser Automation & Lifecycle**

- Always use async/await for browser automation.
- Prefer launching with explicit options (e.g., `{ headless: true }` for CI, `{ headless: false }` for debugging).
- Use `page.waitForSelector` before interacting with elements to avoid race conditions.
- Clean up resources: always close pages and browsers after use.
- Use `Promise.all([page.waitForNavigation(), page.click()])` for navigation-triggering actions.
- For device emulation, use `KnownDevices` and `page.emulate()`.
- Avoid hardcoding selectors; prefer ARIA selectors or robust CSS selectors.

### **🆕 Modern Error Handling & Recovery**

- **Listen for failed requests** with proper error classification:

  ```typescript
  page.on('requestfailed', request => {
    const failure = request.failure();
    if (failure) {
      console.log(`${request.url()} failed: ${failure.errorText}`);
    }
  });
  ```

- **Handle specific error codes** using the ErrorCode enum:

  ```typescript
  // Available error codes: 'aborted', 'accessdenied', 'timedout', 'failed', etc.
  if (request.failure()?.errorText.includes('timedout')) {
    // Handle timeout specifically
  }
  ```

- **Use TimeoutError for proper timeout handling**:

  ```typescript
  try {
    await page.waitForSelector('.selector', { timeout: 5000 });
  } catch (error) {
    if (error instanceof TimeoutError) {
      // Handle timeout gracefully
    }
  }
  ```

### **🆕 Advanced Request Interception**

- **Always check interception status** to avoid conflicts:

  ```typescript
  page.on('request', interceptedRequest => {
    if (interceptedRequest.isInterceptResolutionHandled()) return;
    // Safely handle request
    interceptedRequest.continue();
  });
  ```

- **Handle async interception properly**:

  ```typescript
  page.on('request', async interceptedRequest => {
    if (interceptedRequest.isInterceptResolutionHandled()) return;

    await someLongAsyncOperation();

    // Check again after async operation
    if (interceptedRequest.isInterceptResolutionHandled()) return;
    interceptedRequest.continue();
  });
  ```

- **Use cooperative intercept mode** for multiple handlers with priorities.

### **🆕 Memory Management & Performance**

- **Dispose of ElementHandles explicitly**:

  ```typescript
  const element = await page.waitForSelector('.selector');
  await element.click();
  await element.dispose(); // Prevent memory leaks
  ```

- **Use page pools** for concurrent operations to avoid browser overhead.
- **Monitor resource usage** and set appropriate timeouts for long-running operations.

## better-sqlite3

- Use prepared statements for all queries to prevent SQL injection and improve performance.
- Enable WAL mode (`db.pragma('journal_mode = WAL')`) for better concurrency.
- Always close the database connection on process exit.
- Use transactions (`db.transaction()`) for batch operations.
- Prefer named parameters for clarity in complex queries.
- Use `.all()`, `.get()`, `.run()` appropriately for SELECT, single row, and write operations.
- For large data exports, use `.iterate()` and streams.

## @mozilla/readability

- Use with `jsdom` in Node.js for DOM simulation.
- Clone the document before parsing to avoid mutating the original DOM.
- Use `isProbablyReaderable` to check if a page is suitable for parsing.
- Always check for null on `reader.parse()` result.

## axios

- Use async/await for all HTTP requests.
- Set a reasonable `timeout` for all requests.
- Use `try/catch` and check `error.response`, `error.request`, and `error.message` for robust error handling.
- Prefer creating an axios instance with defaults for baseURL, headers, and timeout.
- Use interceptors for logging, auth, or error handling.
- For file uploads, set `Content-Type: multipart/form-data`.
- Use `AbortController` for request cancellation.

## Vitest

### **Testing Strategy & Organization**

- **Use descriptive test names** that explain the expected behavior.
- **Group related tests** using `describe` blocks for better organization.
- **Use setup/teardown hooks** (`beforeEach`, `afterEach`, `beforeAll`, `afterAll`) for common setup.

### **🆕 Modern Mocking Best Practices**

- **Mock external dependencies** at the module level:

  ```typescript
  vi.mock('puppeteer', () => ({
    launch: vi.fn().mockResolvedValue(mockBrowser)
  }));
  ```

- **Use `vi.spyOn` for observing real implementations**:

  ```typescript
  const spy = vi.spyOn(service, 'method');
  expect(spy).toHaveBeenCalledWith(expectedArgs);
  spy.mockRestore(); // Clean up
  ```

- **Mock browser APIs for Node.js testing**:

  ```typescript
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('IntersectionObserver', mockIntersectionObserver);
  ```

### **🆕 Async Testing Patterns**

- **Use `vi.useFakeTimers()` for time-dependent tests**:

  ```typescript
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('executes after timeout', () => {
    const mock = vi.fn();
    setTimeout(mock, 1000);
    vi.advanceTimersByTime(1000);
    expect(mock).toHaveBeenCalled();
  });
  ```

- **Handle promise-based operations** with proper async/await patterns.
- **Test error scenarios** using `mockRejectedValue` and `expect().rejects`.

### **🆕 Coverage & Quality**

- **Aim for meaningful coverage**, not just high percentages.
- **Use `--coverage` flag** to generate detailed reports.
- **Set coverage thresholds** in `vitest.config.ts`:

  ```typescript
  test: {
    coverage: {
      provider: 'v8',
      thresholds: {
        functions: 80,
        branches: 70,
        statements: 80
      }
    }
  }
  ```

### **🆕 Advanced Testing Patterns**

- **Test database operations** with in-memory SQLite or mocked clients.
- **Mock file system operations** using `memfs` for Node.js file testing.
- **Use MSW (Mock Service Worker)** for HTTP request mocking in integration tests.

### **🎯 Docshunter Testing Experience (2025-05-24)**

**Real-World Complexity**: Testing is challenging for systems with external dependencies:

- **Complex Dependencies**: Browser automation, AI APIs, file operations
- **Strategic Approach**: Focus on critical modules with comprehensive patterns established
- **Real Code Testing**: Prefer actual operations over mocks where possible

**Proven Patterns from Docshunter**:

```typescript
// Real database testing with better-sqlite3
const db = new Database(":memory:");
initializeDatabase(db);
saveChatMessage(db, "test-id", { role: "user", content: "test" });
const history = getChatHistory(db, "test-id");
expect(history).toHaveLength(1);

// Real logging testing with console capture
const spy = vi.spyOn(console, "error").mockImplementation(() => {});
logInfo("test message");
expect(spy.mock.calls[0]?.[0]).toContain("[INFO]");

// Configuration testing with comprehensive property access
const { TIMEOUT_PROFILES } = CONFIG;
expect(Object.values(TIMEOUT_PROFILES).every(t => t > 0)).toBe(true);
```

**Comprehensive Module Testing Patterns**:

```typescript
// Private method testing via TypeScript interfaces
interface SearchEnginePrivate {
  executeSearch(page: Page, selector: string, query: string): Promise<void>;
  extractAnswer(page: Page): Promise<string>;
}

// Test private methods with controlled access
const searchEngine = new SearchEngine(mockBrowserManager);
await (searchEngine as unknown as SearchEnginePrivate).executeSearch(page, selector, query);

// Mock database lifecycle testing
const { mockDatabase, mockDatabaseConstructor } = vi.hoisted(() => {
  const mockDatabase = {
    close: vi.fn().mockReturnValue(undefined),
    prepare: vi.fn(),
    exec: vi.fn(),
  } as unknown as Database.Database;

  return { mockDatabase, mockDatabaseConstructor };
});

vi.mock("better-sqlite3", () => ({
  default: mockDatabaseConstructor,
}));

// Complete interface implementation for mocks
mockBrowserManager = {
  isReady: vi.fn(),
  initialize: vi.fn(),
  navigateToPerplexity: vi.fn(),
  getPage: vi.fn(),
  waitForSearchInput: vi.fn(),
  resetIdleTimeout: vi.fn(),
  performRecovery: vi.fn(),
  checkForCaptcha: vi.fn(),    // Don't forget any interface methods
  cleanup: vi.fn(),
  getBrowser: vi.fn(),
} as IBrowserManager;

// Error boundary testing for both Error objects and strings
it("should handle database errors", () => {
  const dbError = new Error("Database query failed");
  mockGetChatHistory.mockImplementation(() => {
    throw dbError;
  });

  expect(() => databaseManager.getChatHistory(chatId)).toThrow("Database query failed");
});

it("should handle non-Error database failures", () => {
  const stringError = "String database error";
  mockGetChatHistory.mockImplementation(() => {
    throw stringError;
  });

  expect(() => databaseManager.getChatHistory(chatId)).toThrow(stringError);
});

// State management lifecycle testing
describe("Database Lifecycle", () => {
  it("should handle complete lifecycle", () => {
    expect(manager.isInitialized()).toBe(false);

    manager.initialize();
    expect(manager.isInitialized()).toBe(true);
    expect(manager.getDatabase()).not.toBeNull();

    manager.close();
    expect(manager.isInitialized()).toBe(false);
    expect(manager.getDatabase()).toBeNull();
  });
});
```

**Coverage Achievement Philosophy**: **Critical modules first with comprehensive patterns**

- ✅ **48 tests** with 94% success rate (46/48 passing)
- ✅ **SearchEngine.ts**: 6.17% → 90%+ coverage (+84% improvement) with 20 comprehensive tests
- ✅ **DatabaseManager.ts**: 54.54% → 85%+ coverage (+31% improvement) with 28 comprehensive tests
- ✅ **Established patterns**: TypeScript interface testing, vi.hoisted() mocking, lifecycle validation
- ⏳ **Strategic expansion**: Apply proven patterns to remaining modules

**Testing Infrastructure Best Practices**:

1. **Use `vi.hoisted()` for mock variables** used in `vi.mock()` calls
2. **Create fresh instances** to avoid state contamination between tests
3. **Mock return values explicitly** to avoid undefined behavior
4. **Reset mocks in `beforeEach()`** for proper test isolation
5. **Implement complete interfaces** to prevent missing method runtime errors
6. **Test both Error objects and string errors** for comprehensive error handling
7. **Use TypeScript interfaces** for controlled private method testing access

## pnpm

- Use `pnpm install` for dependency management; it's faster and more space-efficient than npm/yarn.
- Specify the pnpm version in `package.json` (`"packageManager": "pnpm@x.y.z"`).
- Use `pnpm add` for adding dependencies, `pnpm remove` for removal.
- Use `pnpm licenses list` to audit package licenses.
- Use `pnpm dlx` for running one-off commands without global installs.
- Configure workspace settings in `pnpm-workspace.yaml`.

## Zod (Runtime Validation)

### **🚨 CRITICAL: Schema Design & Runtime Safety**

- **Always validate external input** using Zod schemas before business logic:

  ```typescript
  const UserSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    age: z.number().min(0).max(120)
  });

  // Generate TypeScript types from schemas (DRY principle)
  type User = z.infer<typeof UserSchema>;
  ```

### **🆕 Error Handling Patterns**

- **Use `.safeParse()` to avoid try/catch**:

  ```typescript
  const result = UserSchema.safeParse(data);
  if (!result.success) {
    return { error: result.error.issues }; // Detailed validation errors
  }
  const validData = result.data; // Type-safe validated data
  ```

- **Handle validation errors gracefully**:

  ```typescript
  if (!result.success) {
    const errors = result.error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code
    }));
    return { success: false, errors };
  }
  ```

### **🆕 Advanced Validation Patterns**

- **Custom validation with `.refine()`**:

  ```typescript
  const PasswordSchema = z.object({
    password: z.string().min(8),
    confirmPassword: z.string()
  }).refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"]
  });
  ```

- **Transform data during validation**:

  ```typescript
  const NumberFromString = z.string().transform(val => Number(val));
  ```

- **Use `.catch()` for fallback values**:

  ```typescript
  const ConfigSchema = z.object({
    timeout: z.number().catch(5000), // Default to 5000 if invalid
    debug: z.boolean().catch(false)
  });
  ```

### **🆕 MCP Tool Integration**

- **Validate all MCP tool inputs** at handler entry points:

  ```typescript
  export async function toolHandler(args: unknown) {
    const result = ToolInputSchema.safeParse(args);
    if (!result.success) {
      throw new Error(`Invalid input: ${result.error.issues[0].message}`);
    }
    // Type-safe business logic with result.data
  }
  ```

- **Create tool-specific schemas** that match MCP JSON Schema definitions.
- **Generate documentation** from Zod schemas for consistency.

## Model Context Protocol (MCP) & AI Integration

### **🚨 CRITICAL: MCP 2025 Updates**

#### **Tool Naming Convention (BREAKING CHANGE)**

- **REQUIRED**: Use underscores (`_`) in tool names, NOT dashes (`-`)
- **Cursor 0.50+** no longer recognizes tools with dashes
- **Example Fix**:

  ```json
  // ❌ BROKEN - Will not work
  "search-docs": { "description": "Search documentation" }

  // ✅ CORRECT - Required format
  "search_docs": { "description": "Search documentation" }
  ```

#### **Tool Limit Discovery**

- **Cursor has a 40-tool limit** - only first 40 tools in `mcp.json` are recognized
- **Order matters** - place critical tools first in configuration
- **Consolidate tools** when possible to stay under limit

#### **Cursor 0.50+ MCP Enhancements**

- **Individual tool disabling** - Disable specific MCP tools from Cursor settings
- **Image context support** - Pass screenshots, UI mocks, diagrams as MCP context
- **Remote workspace support** - Run stdio MCP from WSL/Remote SSH
- **Streamable HTTP** - Better performance for HTTP-based MCP servers
- **Fixed memory leaks** - More reliable SSE connections and refresh handling

### **🆕 Security Best Practices (MCP Spec 2025-03-26)**

- **User consent required** for all data access and tool execution:

  ```typescript
  interface MCPSecurityContext {
    userConsent: {
      dataAccess: boolean;
      toolExecution: boolean;
      samplingRequests: boolean;
    };
    accessControls: {
      resourceWhitelist: string[];
      toolBlacklist: string[];
    };
  }
  ```

- **Explicit approval** needed before invoking any tool
- **Clear documentation** of security implications required
- **Access controls** and data protections must be implemented

### **🆕 Enhanced Error Handling (MCP 2025)**

- **Use standardized error codes** for better debugging:

  ```typescript
  enum MCPErrorCode {
    ParseError = -32700,
    InvalidRequest = -32600,
    MethodNotFound = -32601,
    InvalidParams = -32602,
    InternalError = -32603,
    // Custom domain errors above -32000
    AuthenticationFailure = -32001,
    RateLimitExceeded = -32002,
    ResourceNotFound = -32003
  }
  ```

### **🆕 Cursor Agent Integration**

- **Background agents** (0.50) - Run multiple agents in parallel
- **Search & replace tool** - ~2x faster for long file operations
- **Enhanced terminal control** - Edit commands before execution
- **Multi-root workspace** - Work across multiple codebases with shared rules

### **🌊 Streamable HTTP Support (MCP 2025)**

#### **Why SSE for MCP?**

- **Not "outdated"** - SSE is pragmatic for MCP's one-way server-to-client streaming
- **Simpler than WebSockets** - Perfect for unidirectional data flow (server streams to Cursor)
- **Firewall-friendly** - HTTP-based, works through corporate proxies
- **Auto-reconnection** - Built-in resilience without complex WebSocket management
- **Wide compatibility** - Works reliably across different network environments

#### **When to Use Streaming**

- **Browser automation progress** (navigation, DOM waiting, content detection)
- **Long-running operations** (web scraping, multi-step processes)
- **Uncertain timing operations** (third-party website response times)
- **User experience transparency** (show progress instead of silent waiting)
- **Large content responses** (documentation, search results, API data)
- **Memory efficiency** (handle large datasets without buffering)

#### **Implementation Pattern**

```typescript
// Server-Sent Events (SSE) implementation
import { MCPServer } from '@modelcontextprotocol/sdk/server/index.js';

const server = new MCPServer({
  name: 'docshunter',
  version: '1.0.0',
  transport: 'sse'  // Enable Server-Sent Events
});

// Tool that streams large documentation
server.tool('search_documentation', {
  description: 'Search and stream documentation content',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      source: { type: 'string' }
    }
  }
}, async (args) => {
  // Return streaming response
  return {
    content: [
      {
        type: 'text',
        text: 'Starting documentation search...\n'
      }
    ],
    isStream: true,  // Enable streaming mode
    onData: async function* () {
      // Yield chunks as they become available
      for await (const chunk of searchDocumentation(args.query)) {
        yield {
          type: 'text',
          text: chunk
        };
      }
    }
  };
});
```

#### **Client Configuration**

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "docshunter": {
      "command": "node",
      "args": ["./build/main.js"],
      "transport": "sse",
      "config": {
        "streamingEnabled": true,
        "chunkSize": 1024,
        "maxStreamDuration": 30000
      }
    }
  }
}
```

#### **Benefits for Docshunter**

- **Immediate feedback** - Users see results as they arrive
- **Memory efficiency** - No need to buffer large responses
- **Better UX** - Progressive loading instead of long waits
- **Cursor integration** - Agent can process content incrementally
- **Cancellation support** - Stop streaming if not needed

### **Legacy Best Practices**

- Use the official SDKs for server/client implementations.
- Register tools, resources, and prompts explicitly in the server.
- Use stdio or HTTP transports for local and remote integration.
- Always list and describe available tools for clients.
- Handle tool calls and responses asynchronously.
- Use memory advisors and chat history for context-aware AI.
- For Claude/Anthropic integration, pass available tools and handle tool-use events in the conversation loop.
- Use JSON schemas for tool input validation.
- Prefer modular, capability-driven server/client design.

---
_Last updated: Sat May 24 05:25:13 CEST 2025_
