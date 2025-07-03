# Troubleshooting Guide

Common issues and solutions for perplexity-mcp-zerver installation and operation.

## MCP Connection Issues

### Connection Failed / Server Not Found

**Symptoms**: Cursor/Claude Desktop can't connect to perplexity MCP server

**Solutions**:

```bash
# 1. Check Node.js path accessibility
which node
# Should return: ~/.local/share/mise/installs/node/22.15.1/bin/node (or similar)

# 2. Verify build completed successfully
ls build/main.js
# Should exist and be recent

# 3. Check MCP configuration syntax
cat .cursor/mcp.json | jq '.'
# Should parse without errors

# 4. Test server startup manually
node build/main.js
# Should not exit immediately with errors
```

**Common Fixes**:

- Use **absolute paths** in mcp.json configuration
- Ensure Node.js version 18+ is installed
- Verify build directory exists and is populated

### Protocol Errors (-32000, -32601)

**Symptoms**: JSON-RPC protocol errors in logs

**Causes & Fixes**:

- **stdout contamination**: Remove any `console.log` statements from server code
- **Invalid tool names**: Use underscores (`_`) not dashes (`-`) in tool names
- **Malformed JSON**: Check all JSON-RPC message formatting

## Testing Issues

### Vitest Mock Failures

**Symptoms**: Tests failing with undefined mock functions or missing methods

**Solutions**:

```typescript
// Use vi.hoisted() for mock variables in vi.mock()
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
```

**Common Mock Issues**:

- **Incomplete interface mocking**: Ensure all interface methods are mocked
- **Mock hoisting**: Use `vi.hoisted()` for variables used in `vi.mock()`
- **State contamination**: Reset mocks in `beforeEach()` hooks
- **Return value consistency**: Mock return values explicitly

### Private Method Testing Errors

**Symptoms**: TypeScript errors when testing private methods

**Solution**:

```typescript
// Create interface for private method access
interface SearchEnginePrivate {
  executeSearch(page: Page, selector: string, query: string): Promise<void>;
  extractAnswer(page: Page): Promise<string>;
}

// Use controlled type assertion
const searchEngine = new SearchEngine(mockBrowserManager);
await (searchEngine as unknown as SearchEnginePrivate).executeSearch(page, selector, query);
```

### Database Mock Issues

**Symptoms**: better-sqlite3 mock errors or state management failures

**Common Fixes**:

```typescript
// Proper database mock setup
const mockDb = {
  close: vi.fn().mockImplementation(() => {
    // Simulate database close behavior
    mockDb.prepare = vi.fn().mockImplementation(() => {
      throw new Error("Database is closed");
    });
  }),
  prepare: vi.fn(),
  exec: vi.fn(),
} as unknown as Database.Database;

// Test both Error objects and string errors
it("should handle Error objects", () => {
  const error = new Error("Database error");
  mockMethod.mockImplementation(() => { throw error; });
  expect(() => method()).toThrow("Database error");
});

it("should handle string errors", () => {
  const stringError = "String error";
  mockMethod.mockImplementation(() => { throw stringError; });
  expect(() => method()).toThrow(stringError);
});
```

### Coverage Reporting Issues

**Symptoms**: Coverage reports not generating or incorrect percentages

**Solutions**:

```bash
# Verify coverage configuration in vitest.config.ts
# Ensure v8 provider is configured
pnpm test:coverage

# Check for excluded files affecting coverage
# Review coverage thresholds if set
```

## Tool Execution Failures

### Browser Automation Issues

**Puppeteer Launch Failed**:

```bash
# Install Chrome/Chromium
# macOS:
brew install chromium

# Linux:
sudo apt-get install chromium-browser

# Verify Puppeteer can find browser
npx puppeteer browsers install chrome
```

**Navigation Timeouts**:

- Increase timeout values in `src/server/config.ts`
- Check network connectivity and firewall settings
- Verify target websites are accessible

### Database Errors

**SQLite Permission Denied**:

```bash
# Check file permissions
ls -la chat-history.db

# Fix permissions if needed
chmod 644 chat-history.db
```

**Database Locked**:

- Ensure no other processes are using the database
- Check for proper connection cleanup in code
- Consider WAL mode for better concurrency

### Content Extraction Issues

**Empty or Garbled Content**:

- Website may be JavaScript-heavy (requires browser rendering)
- Check for anti-bot measures or rate limiting
- Verify selectors for gitingest.com parsing

**GitHub URL Processing**:

- Ensure URL is a valid GitHub repository
- Check gitingest.com availability
- Verify fallback mechanisms are working

## Performance Issues

### Slow Response Times

**Browser Automation Bottlenecks**:

```typescript
// Increase timeouts in config.ts
export const CONFIG = {
  PAGE_TIMEOUT: 45000,        // Increase from 30000
  SELECTOR_TIMEOUT: 15000,    // Increase from 10000
  MAX_RETRIES: 5,            // Increase from 3
};
```

**Memory Usage**:

- Monitor browser process memory with Activity Monitor/htop
- Ensure proper browser cleanup after operations
- Consider browser instance pooling for high usage

### High Resource Usage

**Browser Memory Leaks**:

- Check for unclosed browser instances: `ps aux | grep chrome`
- Verify proper cleanup in error scenarios
- Monitor disk space for SQLite growth

### Test Performance Issues

**Slow Test Execution**:

```typescript
// Optimize test performance
beforeEach(() => {
  // Reset only necessary mocks
  vi.clearAllMocks();
});

// Use describe.concurrent for parallel execution where safe
describe.concurrent("Database operations", () => {
  // Independent tests can run in parallel
});

// Mock external dependencies to avoid real network calls
vi.mock("axios");
vi.mock("puppeteer");
```

## Development Issues

### TypeScript Compilation Errors

**Common Fixes**:

```bash
# Clean build and rebuild
rm -rf build/
pnpm build

# Check TypeScript configuration
npx tsc --noEmit

# Verify all dependencies are installed
pnpm install
```

### Test Failures

**Environment Issues**:

- Ensure test database is writable
- Check for port conflicts
- Verify mock configurations are correct

### Linting Errors

**Process.env Access**:

```typescript
// Wrong:
process.env.NODE_ENV = "test";

// Correct:
process.env["NODE_ENV"] = "test";
```

## Network and Security

### Firewall / Proxy Issues

**Corporate Networks**:

- Configure proxy settings for HTTP requests
- Whitelist chromium/puppeteer domains
- Check for SSL certificate validation issues

### Anti-Bot Detection

**Website Blocking**:

- Sites may detect automation and block requests
- Consider adding delays between requests
- Rotate user agents if necessary
- Use residential IP if possible

## Getting Help

### Log Analysis

**Enable Debug Logging**:

```bash
# Set debug mode in environment
NODE_ENV=development node build/main.js
```

**Check Browser Console**:

- Enable Puppeteer debug mode
- Capture network tab for failed requests
- Look for JavaScript errors on target pages

### Test Debugging

**Vitest Debug Mode**:

```bash
# Run tests with debug output
pnpm test --reporter=verbose

# Run specific test file
pnpm test SearchEngine.test.ts

# Debug specific test case
pnpm test --t "should handle browser timeout"
```

### Reporting Issues

When reporting bugs, include:

1. **Environment**: Node.js version, OS, Cursor/Claude Desktop version
2. **Configuration**: Sanitized mcp.json (remove sensitive paths)
3. **Logs**: Error messages and stack traces
4. **Test Output**: If testing related, include test results and coverage
5. **Reproduction**: Minimal steps to reproduce the issue
6. **Expected vs Actual**: What should happen vs what actually happens

### Community Support

- **GitHub Issues**: [Create an issue](https://github.com/wysh3/perplexity-mcp-zerver/issues)
- **Documentation**: Check other files in `docs/` directory
- **Best Practices**: Review `docs/best-practices.md`
- **Testing Guide**: See `docs/testing.md` for comprehensive patterns

---
*Last updated: Sat May 24 04:05:03 CEST 2025*
