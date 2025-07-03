# Development Guide

Guide for contributors and developers working on Docshunter.

## Prerequisites

- **Node.js** 18+ (tested with 22.15.1)
- **pnpm** for package management
- **Chrome/Chromium** (auto-installed by Puppeteer)

## Development Setup

```bash
# Clone and setup
git clone https://github.com/sm-moshi/docshunter.git
cd docshunter

# Install dependencies
pnpm install

# Build the project
pnpm build

# Run tests to verify setup
pnpm test:run
```

## Development Workflow

### Local Development

```bash
# Start development with tests
pnpm test:watch

# Build and verify
pnpm build
pnpm test:coverage

# Lint and format
pnpm lint
```

### Testing Strategy

```bash
# Full test suite
pnpm test:coverage

# Watch mode during development
pnpm test

# Specific test types
pnpm test:integration
pnpm test:unit

# Single run without coverage
pnpm test:run
```

## Code Quality Standards

### TypeScript

- **Strict mode** with comprehensive type coverage
- **No any types** unless absolutely necessary
- **Proper error handling** with typed exceptions
- **Consistent naming conventions** (camelCase, PascalCase, UPPER_SNAKE_CASE)

### Linting & Formatting

- **Biome**: Linting and formatting for consistent code style
- **Automatic fixing**: Use `pnpm lint --fix` for auto-corrections
- **Pre-commit checks**: Planned for future versions

### Testing Requirements

- **Unit tests** for all new utility functions
- **Integration tests** for tool handlers
- **Real code testing** preferred over mocks where possible
- **Edge cases** must be covered
- **Comprehensive coverage** for critical modules using established patterns

### **Testing Patterns & Best Practices**

Based on our comprehensive testing implementation for SearchEngine.ts and DatabaseManager.ts:

#### **1. Private Method Testing via TypeScript Interfaces**

```typescript
// Create interface for testing private methods
interface ModulePrivate {
  privateMethod(param: Type): Promise<ReturnType>;
}

// Access private methods with controlled type assertions
const instance = new Module(dependencies);
await (instance as unknown as ModulePrivate).privateMethod(param);
```

#### **2. Vitest Mock Management**

```typescript
// Use vi.hoisted() for proper mock variable declaration
const { mockObject, mockConstructor } = vi.hoisted(() => {
  const mockObject = {
    method: vi.fn().mockReturnValue(expectedValue),
  } as unknown as InterfaceType;

  return { mockObject, mockConstructor };
});

vi.mock("module-name", () => ({
  default: mockConstructor,
}));
```

#### **3. Complete Interface Mocking**

```typescript
// Ensure mocks implement ALL interface methods
mockInterface = {
  method1: vi.fn(),
  method2: vi.fn(),
  method3: vi.fn(), // Don't forget any methods to avoid runtime errors
} as InterfaceType;
```

#### **4. Error Boundary Testing**

```typescript
// Test both Error objects and string errors
it("should handle Error objects", () => {
  const error = new Error("Operation failed");
  mockMethod.mockImplementation(() => { throw error; });
  expect(() => instance.method()).toThrow("Operation failed");
});

it("should handle string errors", () => {
  const stringError = "String error message";
  mockMethod.mockImplementation(() => { throw stringError; });
  expect(() => instance.method()).toThrow(stringError);
});
```

#### **5. State Management & Lifecycle Testing**

```typescript
// Test complete lifecycle scenarios
describe("Module Lifecycle", () => {
  it("should handle initialize → operate → cleanup", () => {
    expect(manager.isInitialized()).toBe(false);

    manager.initialize();
    expect(manager.isInitialized()).toBe(true);
    expect(manager.getState()).toBeTruthy();

    manager.close();
    expect(manager.isInitialized()).toBe(false);
    expect(manager.getState()).toBeNull();
  });
});
```

## Adding New Features

### Adding New Tools

1. **Create tool handler** in `src/tools/yourTool.ts`:

```typescript
import { toolSchemas } from "../schema/toolSchemas.js";
import type { YourToolArgs } from "../types/index.js";

export async function yourTool(args: YourToolArgs) {
  // Validate input (TODO: Add Zod validation)

  // Implement business logic

  // Return MCP-compliant response
  return {
    content: [
      {
        type: "text",
        text: "Your tool result",
      },
    ],
    isError: false,
  };
}
```

2. **Add schema** to `src/schema/toolSchemas.ts`:

```typescript
export const toolSchemas = {
  // ... existing tools
  your_tool: {
    name: "your_tool",
    description: "Description of what your tool does",
    inputSchema: {
      type: "object",
      properties: {
        param1: { type: "string", description: "First parameter" },
        param2: { type: "number", description: "Second parameter" },
      },
      required: ["param1"],
    },
  },
};
```

3. **Register tool** in `src/server/toolHandlerSetup.ts`:

```typescript
import { yourTool } from "../tools/yourTool.js";

export function toolHandlerSetup() {
  return {
    // ... existing tools
    your_tool: yourTool,
  };
}
```

4. **Add tests** in `src/tools/__tests__/yourTool.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { yourTool } from "../yourTool.js";

describe("yourTool", () => {
  it("should handle valid input", async () => {
    const result = await yourTool({ param1: "test" });
    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toContain("expected output");
  });

  it("should handle edge cases", async () => {
    // Test empty input, invalid input, etc.
  });
});
```

5. **Update types** in `src/types/index.ts`:

```typescript
export interface YourToolArgs {
  param1: string;
  param2?: number;
}
```

### Adding Utility Functions

1. **Create utility** in appropriate `src/utils/` file
2. **Add comprehensive tests** with real operations where possible
3. **Export from main types** if needed for external use
4. **Document complex functions** with JSDoc comments

## Project Structure Guidelines

### File Naming

- **kebab-case** for file names
- **PascalCase** for class names
- **camelCase** for function and variable names
- **UPPER_SNAKE_CASE** for constants

### Import Conventions

```typescript
// Node.js built-ins with node: prefix
import { readFile } from "node:fs/promises";

// External packages
import puppeteer from "puppeteer";

// Internal imports (relative paths)
import { logInfo } from "../utils/logging.js";
import type { ToolArgs } from "../types/index.js";
```

### Error Handling Patterns

```typescript
// Consistent error handling
try {
  const result = await someOperation();
  return { success: true, data: result };
} catch (error) {
  logError("Operation failed", { error: error.message, context });
  return {
    success: false,
    error: error instanceof Error ? error.message : "Unknown error",
  };
}
```

## Performance Guidelines

### Browser Automation

- **Reuse browser instances** when possible
- **Proper cleanup** in finally blocks
- **Timeout handling** for all operations
- **Memory monitoring** during development

### Database Operations

- **Prepared statements** for all queries
- **Transaction batching** for bulk operations
- **Connection pooling** (single connection with WAL mode)
- **Index optimization** for query performance

### Memory Management

- **Explicit disposal** of resources
- **Garbage collection hints** for large operations
- **Memory profiling** during testing
- **Resource limits** in configuration

## Debugging

### Local Debugging

```bash
# Enable debug mode
NODE_ENV=development node build/main.js

# Run with debugger
node --inspect build/main.js

# Browser debugging (Puppeteer)
# Set headless: false in config for visual debugging
```

### Common Debug Scenarios

- **MCP Protocol Issues**: Check stdout contamination
- **Browser Automation**: Use `{ headless: false }` for visual debugging
- **Network Issues**: Enable request/response logging
- **Database Issues**: Enable SQL query logging

## Contributing Guidelines

### Pull Request Process

1. **Fork** the repository
2. **Create feature branch** from `develop`
3. **Implement changes** with tests
4. **Run full test suite**: `pnpm test:coverage`
5. **Update documentation** if needed
6. **Submit pull request** to `develop` branch

### Code Review Checklist

- [ ] All tests passing
- [ ] TypeScript compilation clean
- [ ] Linting passes
- [ ] Documentation updated
- [ ] Performance considerations addressed
- [ ] Security implications reviewed

### Git Workflow

- **main**: Stable releases only
- **develop**: Integration branch for features
- **feature/***: Individual feature development
- **release/***: Release preparation
- **hotfix/***: Critical production fixes

### Commit Message Format

Follow Conventional Commits:

```
feat: add new search tool
fix: resolve browser timeout issue
docs: update installation guide
test: add integration tests for MCP server
chore: upgrade dependencies
```

## Release Process

### Version Management

- **SemVer**: `MAJOR.MINOR.PATCH`
- **Pre-releases**: `0.x.y` for beta versions
- **Stable releases**: `1.0.0+` when API is stable

### Release Checklist

- [ ] All tests passing
- [ ] Documentation updated
- [ ] Version bumped in package.json
- [ ] Changelog updated
- [ ] Tag created
- [ ] Release notes written

---
*Last updated: May 23, 2025*
