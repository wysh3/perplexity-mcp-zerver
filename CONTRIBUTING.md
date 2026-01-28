# Contributing

Thank you for your interest in contributing to perplexity-mcp-zerver! This document provides guidelines and instructions for contributing to the project.

## Prerequisites

- **Bun**: Latest version (install from [bun.sh](https://bun.sh))
- **Git**: For version control
- **Node.js**: Not required (Bun replaces Node.js)

## Setup

1. **Fork and clone the repository**:

```bash
git clone https://github.com/YOUR_USERNAME/perplexity-mcp-zerver.git
cd perplexity-mcp-zerver
```

2. **Install dependencies**:

```bash
bun install
```

3. **Set up environment variables**:

```bash
cp .env.example .env
# Edit .env with your settings
```

4. **Login to Perplexity (optional but recommended)**:

```bash
bun run login
```

This opens a browser window for you to log into your Perplexity Pro account. Your session will be saved for use by the MCP server.

## Development

### Running the Server

```bash
bun run dev
```

This starts the MCP server in development mode with hot reloading.

### Running Tests

```bash
# Run all tests once
bun run test:run

# Run tests in watch mode
bun run test:watch

# Generate coverage report
bun run test:coverage
```

Coverage reports are generated in the `coverage/` directory.

### Linting and Formatting

```bash
# Fix linting issues
bun run lint

# Format code with Biome
bun run format

# Check formatting without fixing
bun run format --check
```

## Build

```bash
bun run build
```

Build artifacts are output to the `build/` directory.

## Testing Requirements

### Coverage Thresholds

This project enforces code coverage thresholds:

- **Statements**: 80%
- **Functions**: 80%
- **Branches**: 80%
- **Lines**: 80%

Pull requests that fall below these thresholds will fail CI checks.

### Test Structure

- **Unit tests**: `src/__tests__/unit/` - Test individual functions and classes
- **Integration tests**: `src/__tests__/integration/` - Test module interactions

### Writing Tests

Use Vitest for testing. Example test file:

```typescript
import { describe, it, expect } from "vitest";

describe("MyModule", () => {
  it("should do something", () => {
    expect(true).toBe(true);
  });
});
```

## Code Style

This project follows strict code quality standards:

### TypeScript

- **Strict mode**: Enabled
- **No `any` types**: Use proper TypeScript typing
- **No `as any` assertions**: Cast to specific types instead
- **Imports**: Use ES modules (`.js` extension in imports)
- **Exports**: Use named exports for modules, default exports is fine for single-function modules

### Formatting (Biome)

- **Indentation**: 2 spaces
- **Quotes**: Double quotes
- **Line width**: 100 characters
- **Semicolons**: Required

### Logging

- **NO `console.log` statements**: Use `logInfo()`, `logWarn()`, `logError()` from `src/utils/logging.ts`
- **Structured logging**: Use the `meta` parameter for context

```typescript
import { logInfo, logWarn, logError } from "../utils/logging.js";

// Good
logInfo("Search completed", { query: "test", results: 5 });
logWarn("Rate limit approaching", { remaining: 10 });
logError("Failed to fetch", { error: err, url });

// Bad
console.log("Search completed 5 results");
console.warn("Rate limit");
console.error("Failed to fetch");
```

### Validation

All tool inputs must be validated using Zod schemas from `src/validation/tool-schemas.ts`:

```typescript
import { SEARCH_SCHEMA } from "../validation/tool-schemas.js";

const validated = SEARCH_SCHEMA.parse(args);
```

### Error Handling

- **Throw custom errors**: Use `McpError` from SDK for user-visible errors
- **Log before throwing**: Always log errors with context
- **No silent failures**: All errors must be handled or logged

## Submitting Pull Requests

1. **Create a feature branch**:

```bash
git checkout -b feature/my-feature-name
# or
git checkout -b fix/my-bug-fix
```

2. **Make your changes**:
   - Follow the code style guidelines above
   - Run `bun run lint` and `bun run format` before committing
   - Add tests for new functionality
   - Update the README if needed

3. **Test your changes**:

```bash
bun run test:run
bun run lint
bun run build
```

4. **Commit your changes**:

```bash
git add .
git commit -m "feat: add my new feature"
# or
git commit -m "fix: resolve bug in xyz"
```

Use [Conventional Commits](https://www.conventionalcommits.org/) format:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Test changes
- `chore:` Build process or auxiliary tool changes

5. **Push and create PR**:

```bash
git push origin feature/my-feature-name
```

Then go to GitHub and create a pull request.

### Pull Request Checklist

- [ ] Code follows the project's style guidelines
- [ ] Tests pass locally (`bun run test:run`)
- [ ] Linting passes (`bun run lint`)
- [ ] Build succeeds (`bun run build`)
- [ ] Coverage meets thresholds (80%)
- [ ] Documentation is updated (if applicable)
- [ ] Commit messages follow Conventional Commits

### Pull Request Process

1. **CI/CD Checks**: Your PR will automatically run:
   - Linter
   - Typecheck
   - Tests with coverage
   - Security audit
   - Build

2. **Code Review**: Maintainers will review your code and provide feedback.

3. **Changes**: Make requested changes and push them to the same branch.

4. **Approval and Merge**: Once approved, your PR will be merged into `main`.

## Issue Reporting

### Bug Reports

When reporting a bug, include:

- **Description**: Clear description of the bug
- **Steps to reproduce**: Detailed steps to reproduce the issue
- **Expected behavior**: What you expected to happen
- **Actual behavior**: What actually happened
- **Environment**:
  - OS and version
  - Bun version
  - Project version
- **Logs/Errors**: Relevant log output or error messages

### Feature Requests

When requesting a feature:

- **Use case**: Why do you want this feature?
- **Proposed solution**: How do you think it should work?
- **Alternatives**: What alternatives have you considered?
- **Additional context**: Any other relevant information

## Project Structure

```
perplexity-mcp-zerver/
├── src/
│   ├── __tests__/          # Test files
│   │   ├── unit/          # Unit tests
│   │   └── integration/   # Integration tests
│   ├── schema/            # Tool schemas
│   ├── server/            # Core server logic
│   │   ├── modules/       # Server modules (browser, database, search)
│   │   └── config.ts      # Configuration
│   ├── tools/             # MCP tool implementations
│   ├── types/             # TypeScript type definitions
│   ├── utils/             # Utility functions
│   ├── validation/        # Input validation schemas
│   └── main.ts            # Entry point
├── build/                 # Compiled output (generated)
├── coverage/              # Coverage reports (generated)
├── .env.example          # Environment variables template
├── package.json          # Project configuration
├── tsconfig.json         # TypeScript configuration
├── vitest.config.ts      # Test configuration
└── README.md             # Project documentation
```

## Getting Help

- **GitHub Issues**: For bugs and feature requests
- **Discussions**: For questions and discussions (if enabled)
- **Documentation**: Read the README.md and inline code comments

## License

By contributing to this project, you agree that your contributions will be licensed under the same license as the project.

Thank you for contributing! 🚀
