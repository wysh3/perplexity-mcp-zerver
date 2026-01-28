# API Documentation

## Overview

Perplexity MCP Server provides Perplexity AI search capabilities through browser automation. This server implements the Model Context Protocol (MCP) for seamless integration with AI assistants.

**Server Version:** 0.4.0  
**Protocol:** MCP (Model Context Protocol)  
**TypeScript:** Full type safety with strict mode  

---

## Quick Start

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd perplexity-mcp-zerver

# Install dependencies
bun install

# Build the project
bun run build

# Run the server
bun run start
```

### Basic Usage

The server provides the following tools:

1. **search** - General web search via Perplexity
2. **chat_perplexity** - AI-powered chat with search integration
3. **extract_url_content** - Extract and clean content from URLs
4. **get_documentation** - Get documentation for technologies
5. **find_apis** - Find APIs for specific requirements
6. **check_deprecated_code** - Check if code is deprecated

---

## Tools

### 1. `search`

Perform a general web search using Perplexity AI.

**Arguments:**

```typescript
{
  query: string;  // The search query (required, max 1000 chars)
}
```

**Returns:** `string` - Search results as formatted text

**Example:**

```json
{
  "name": "search",
  "arguments": {
    "query": "TypeScript best practices 2024"
  }
}
```

**Response Format:**

```
Search Results for: TypeScript best practices 2024

1. [Article Title](url)
   Summary of the article... 
  
  [... more results]
```

---

### 2. `chat_perplexity`

AI-powered chat with search integration. Supports both creating new chats and continuing existing conversations.

**Arguments for New Chat:**

```typescript
{
  message: string;  // User message (required, max 5000 chars)
}
```

**Arguments for Continuing Chat:**

```typescript
{
  chat_id: string;  // Existing chat ID (required)
  message: string;  // User message (required, max 5000 chars)
}
```

**Returns:** `string` - AI response with search citations

**Example (New Chat):**

```json
{
  "name": "chat_perplexity",
  "arguments": {
    "message": "What are the benefits of using Server-Sent Events?"
  }
}
```

**Example (Continue Chat):**

```json
{
  "name": "chat_perplexity",
  "arguments": {
    "chat_id": "chat-1234567890",
    "message": "Can you show me a code example?"
  }
}
```

---

### 3. `extract_url_content`

Extract and clean content from a URL using browser automation and Readability algorithm.

**Arguments:**

```typescript
{
  url: string;        // URL to extract content from (required)
  maxLength?: number; // Maximum length of extracted content (optional, default: 10000)
}
```

**Returns:** `string` - Cleaned and formatted content

**Example:**

```json
{
  "name": "extract_url_content",
  "arguments": {
    "url": "https://example.com/article",
    "maxLength": 5000
  }
}
```

**Validation:**
- URL must be valid HTTP/HTTPS
- URL cannot be localhost or private IP ranges (SSRF protection)
- Content must be HTML or plain text
- Content must meet minimum length threshold

---

### 4. `get_documentation`

Search for documentation about specific technologies or APIs.

**Arguments:**

```typescript
{
  query: string;   // Technology or concept to search (required)
  context?: string;  // Additional context (optional)
}
```

**Returns:** `string` - Documentation search results

**Example:**

```json
{
  "name": "get_documentation",
  "arguments": {
    "query": "React useCallback hook",
    "context": "performance optimization"
  }
}
```

---

### 5. `find_apis`

Find APIs that fulfill specific requirements.

**Arguments:**

```typescript
{
  requirement: string;  // API requirement (required)
  context?: string;     // Additional context (optional)
}
```

**Returns:** `string` - API recommendations

**Example:**

```json
{
  "name": "find_apis",
  "arguments": {
    "requirement": "file upload with drag and drop",
    "context": "React frontend"
  }
}
```

---

### 6. `check_deprecated_code`

Check if code or technology is deprecated.

**Arguments:**

```typescript
{
  code: string;          // Code or technology name to check (required)
  technology?: string;   // Technology stack (optional)
}
```

**Returns:** `string` - Deprecation status and recommendations

**Example:**

```json
{
  "name": "check_deprecated_code",
  "arguments": {
    "code": "ReactDOM.render",
    "technology": "React 18"
  }
}
```

---

### 7. `list_chats`

List all saved chat sessions.

**Arguments:** None

**Returns:** `string` - Formatted list of chats

**Example:**

```json
{
  "name": "list_chats",
  "arguments": {}
}
```

---

### 8. `get_chat_history`

Get the message history for a specific chat.

**Arguments:**

```typescript
{
  chat_id: string;  // Chat ID (required)
}
```

**Returns:** `string` - Chat history as formatted text

**Example:**

```json
{
  "name": "get_chat_history",
  "arguments": {
    "chat_id": "chat-1234567890"
  }
}
```

---

### 9. `delete_chat`

Delete a chat session.

**Arguments:**

```typescript
{
  chat_id: string;  // Chat ID to delete (required)
}
```

**Returns:** `string` - Confirmation message

**Example:**

```json
{
  "name": "delete_chat",
  "arguments": {
    "chat_id": "chat-1234567890"
  }
}
```

---

## Modules

### BrowserManager

Manages Puppeteer browser instances with automatic recovery.

**Methods:**
- `initialize()` - Initialize browser
- `isReady()` - Check if browser is ready
- `cleanup()` - Clean up browser resources
- `performSearch(query)` - Perform search on Perplexity

### SearchEngine

Handles search operations using Perplexity website.

**Methods:**
- `performSearch(query)` - Execute search query
- `extractContent()` - Extract search results

### DatabaseManager

SQLite database for chat history persistence.

**Methods:**
- `initialize()` - Initialize database
- `saveChatMessage(chatId, role, content)` - Save a message
- `getChatHistory(chatId)` - Get chat history
- `isInitialized()` - Check initialization status
- `close()` - Close database connection

### BrowserPool (v0.3.0+)

Manages multiple browser instances for parallel processing.

**Methods:**
- `initialize()` - Initialize browser pool
- `acquireBrowser(timeout)` - Acquire available browser
- `releaseBrowser(browser)` - Release browser to pool
- `getPoolStatus()` - Get pool statistics
- `healthCheck()` - Run health check on all browsers

### RequestQueue (v0.3.0+)

Token bucket rate limiting for request management.

**Methods:**
- `start()` - Start queue processing
- `stop()` - Stop queue processing
- `enqueue(task, priority)` - Add task to queue
- `getStats()` - Get queue statistics

### CircuitBreaker (v0.3.0+)

Implements circuit breaker pattern for fault tolerance.

**Methods:**
- `execute(operation, name)` - Execute with circuit breaker
- `onSuccess()` - Record success
- `onFailure()` - Record failure
- `getStats()` - Get circuit breaker statistics
- `reset()` - Reset circuit breaker state

### RetryManager (v0.4.0+)

Exponential backoff retry logic with jitter.

**Methods:**
- `execute(operation, context)` - Execute with retry
- `executeWithCircuitBreaker(operation, circuitBreaker, context)` - Execute with retry and circuit breaker
- `getConfig()` - Get retry configuration
- `updateConfig(config)` - Update retry configuration

### HealthCheckManager (v0.4.0+)

Periodic health monitoring for all modules.

**Methods:**
- `register(check)` - Register health check
- `unregister(module)` - Unregister health check
- `start()` - Start periodic checks
- `stop()` - Stop periodic checks
- `checkAll()` - Run all checks immediately
- `getAllStatuses()` - Get all module statuses

### MetricsCollector (v0.4.0+)

Collects and aggregates system metrics.

**Methods:**
- `recordMetric(name, value, labels)` - Record metric
- `incrementCounter(name, value)` - Increment counter
- `setGauge(name, value)` - Set gauge value
- `recordHistogram(name, value)` - Record histogram value
- `getAllMetrics()` - Get all metrics
- `exportMetrics()` - Export metrics as string

### GracefulShutdown (v0.4.0+)

Priority-based graceful shutdown handler.

**Methods:**
- `registerHandler(handler)` - Register shutdown handler
- `unregisterHandler(name)` - Unregister handler
- `shutdown(signal)` - Initiate shutdown
- `getStats()` - Get shutdown statistics
- `isShutting()` - Check if shutdown is in progress

### RequestLogger (v0.4.0+)

Request/response logging with filtering and export.

**Methods:**
- `startRequest(method, params, metadata)` - Start request logging
- `endRequest(id, status, error)` - End request logging
- `getLogs(filter)` - Get logs with optional filtering
- `getStats()` - Get logger statistics
- `exportLogs()` - Export logs as CSV

---

## Configuration

### Environment Variables

```bash
# Authentication
MCP_AUTH_ENABLED=true              # Enable API key authentication
MCP_API_KEY=your-api-key-here     # API key for authentication

# Security
PERPLEXITY_SECURITY_DISABLED=false # Set to true to disable security features (NOT RECOMMENDED)

# Browser Configuration
BROWSER_HEADLESS=true              # Run browser in headless mode

# Development
MCP_MODE=test                      # Run in test mode
VITEST=true                        # Enable test mode
```

### Server Dependencies

The server uses dependency injection for better testability:

```typescript
interface ServerDependencies {
  databaseManager?: IDatabaseManager;
  browserManager?: IBrowserManager;
  browserPool?: IBrowserPool;
  searchEngine?: ISearchEngine;
}
```

---

## Error Handling

All tools provide detailed error messages:

### Validation Errors

```json
{
  "error": "Invalid arguments: query must be at most 1000 characters"
}
```

### Security Errors

```json
{
  "error": "URL blocked: Access to localhost is not allowed (SSRF protection)"
}
```

### Browser Errors

```json
{
  "error": "Browser initialization failed: Timeout after 30s"
}
```

### Network Errors

```json
{
  "error": "Network error: ECONNREFUSED"
}
```

---

## Rate Limiting

The server implements token bucket rate limiting:

- **Default Rate:** 5 requests per second
- **Burst Size:** 10 requests
- **Queue Size:** 100 requests

Circuit breaker prevents cascading failures:
- **Failure Threshold:** 5 consecutive failures
- **Success Threshold:** 2 successes to recover
- **Timeout:** 10 seconds before retry

---

## Metrics

Available metrics:

### Counters
- `search_success` - Successful searches
- `search_error` - Failed searches
- `chat_perplexity_success` - Successful chat requests
- `chat_perplexity_error` - Failed chat requests

### Gauges
- `memory_usage_mb` - Current memory usage
- `cpu_usage_percent` - Current CPU usage

### Histograms
- `search_duration_ms` - Search duration distribution

Access metrics via `server.getMetricsCollector().getAllMetrics()`

---

## Development

### Running Tests

```bash
# Run all tests
bun run test:run

# Run tests with coverage
bun run test:coverage

# Watch mode
bun run test:watch
```

### Type Checking

```bash
bun run tsc --noEmit
```

### Linting

```bash
bun run lint
```

### Formatting

```bash
bun run format
```

---

## Security

### SSRF Protection

The server blocks access to:
- Localhost addresses (127.0.0.1, ::1, localhost)
- Private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Reserved IP ranges (0.0.0.0/8, 169.254.0.0/16, etc.)

### Input Validation

All inputs are validated using Zod schemas:
- Maximum length checks
- URL format validation
- Content type validation

### Authentication (Optional)

API key authentication can be enabled via environment variables:
- Set `MCP_AUTH_ENABLED=true`
- Set `MCP_API_KEY=your-secret-key`

---

## Performance

### Browser Pool

Default pool size: 3 browsers
- Reduces browser startup overhead
- Enables parallel request processing
- Automatic health checks and recovery

### Database Optimizations

- WAL mode for concurrent access
- Precomputed page cache (64000 pages)
- Memory for temporary storage
- Synchronous mode: NORMAL

### Resource Monitoring

Automatic monitoring of:
- Memory usage (warn at 80%, critical at 90%)
- CPU percentage
- Optional garbage collection triggers

---

## Troubleshooting

### Browser Fails to Start

```bash
# Try disabling security features (development only)
export PERPLEXITY_SECURITY_DISABLED=true
bun run start
```

### Slow Performance

1. Check resource usage: `server.getResourceManager().getSystemStats()`
2. Review metrics: `server.getMetricsCollector().getAllMetrics()`
3. Check circuit breaker: `server.getSearchCircuitBreaker().getStats()`

### Test Failures

```bash
# Run tests with verbose output
bun run test:run --reporter=verbose

# Check for specific test
bun run test:run --grep "search"
```

---

## Changelog

### v0.4.0 (Current)
- Added RetryManager with exponential backoff
- Added HealthCheckManager for periodic monitoring
- Added MetricsCollector for system metrics
- Added GracefulShutdown for priority-based shutdown
- Added RequestLogger for request tracking
- Integrated request logging into all tools
- Added metrics collection for all operations

### v0.3.0
- Added BrowserPool for parallel browser management
- Added RequestQueue with token bucket rate limiting
- Added CircuitBreaker for fault tolerance
- Added ResourceManager for system monitoring
- Optimized DatabaseManager with PRAGMA settings

### v0.2.0
- Added comprehensive Zod input validation
- Added SSRF protection
- Added API key authentication
- Added CI/CD pipeline
- Updated test coverage to 80%

### v0.1.0
- Initial release
- Basic search functionality
- Chat support
- URL content extraction

---

## License

[Your License Here]

---

## Support

For issues and questions:
- GitHub Issues: [repository-url]/issues
- Documentation: [repository-url]/wiki
