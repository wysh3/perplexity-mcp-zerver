# Project Dependencies

## Core

- **Node.js**: JavaScript runtime for server-side code. [nodejs.org](https://nodejs.org/)
- **TypeScript**: Typed superset of JavaScript. [typescriptlang.org](https://www.typescriptlang.org/)

## Database

- **better-sqlite3**: Fast, simple SQLite3 library for Node.js. [GitHub](https://github.com/WiseLibs/better-sqlite3)

## Web Scraping & Automation

- **puppeteer**: Headless Chrome/Chromium automation. [GitHub](https://github.com/puppeteer/puppeteer)
- **@mozilla/readability**: Extracts main article content from HTML. [GitHub](https://github.com/mozilla/readability)
- **jsdom**: JavaScript implementation of the DOM and HTML standards. [GitHub](https://github.com/jsdom/jsdom)
- **axios**: Promise-based HTTP client for Node.js and browsers. [GitHub](https://github.com/axios/axios)

## AI / Model Context Protocol (MCP)

- **@modelcontextprotocol/sdk**: SDK for building MCP servers/clients. [GitHub](https://github.com/modelcontextprotocol/modelcontextprotocol)
- **MCP Protocol**: Standard for tool/resource/prompt integration with AI. [Docs](https://modelcontextprotocol.io/specification/2025-05-23)

### **🚨 Cursor 0.50+ Compatibility**

- **BREAKING**: Tool names with dashes (`-`) no longer work - use underscores (`_`)
- **Tool limit**: Maximum 40 tools recognized - prioritize essential tools first
- **New features**: Individual tool disabling, image context, remote workspace support
- **Performance**: Streamable HTTP support and fixed memory leaks

### **MCP Specification Updates (2025-05-23)**

- Enhanced security model with mandatory user consent patterns
- Standardized error codes for better debugging and reliability
- Improved context management for large-scale integrations

## Schema Validation

- **zod**: TypeScript-first schema validation with static type inference. [zod.dev](https://zod.dev/) ⚠️ **Currently unused - needs implementation**

## Testing Framework

- **vitest**: Vite-native unit test framework with comprehensive module testing capabilities. [vitest.dev](https://vitest.dev/)
- **@vitest/coverage-v8**: V8-based coverage provider for detailed test coverage analysis. [vitest.dev/guide/coverage](https://vitest.dev/guide/coverage.html)

### **Testing Infrastructure & Patterns**

Our testing setup includes advanced patterns for comprehensive module coverage:

- **Private Method Testing**: TypeScript interfaces for accessing private methods in tests
- **Mock Database Testing**: better-sqlite3 in-memory testing with vi.hoisted() patterns
- **Complete Interface Mocking**: Full interface implementation to prevent runtime errors
- **Error Boundary Testing**: Both Error objects and string error scenario coverage
- **State Management Testing**: Full lifecycle validation (initialize → operate → cleanup)

**Current Testing Achievements**:

- **SearchEngine.ts**: 20 tests, 90%+ coverage (+84% improvement)
- **DatabaseManager.ts**: 28 tests, 85%+ coverage (+31% improvement)
- **Overall**: 46/48 tests passing (94% success rate)

## Dev Tooling

- **pnpm**: Fast, disk space-efficient package manager. [pnpm.io](https://pnpm.io/)
- **@vitest/coverage-v8**: V8-based coverage provider for Vitest. [vitest.dev/guide/coverage](https://vitest.dev/guide/coverage.html)

---
_Last updated: Sat May 24 05:25:13 CEST 2025_
