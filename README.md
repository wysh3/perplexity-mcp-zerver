# Perplexity MCP Zerver

A minimalist research server implementing the Model Context Protocol (MCP) to deliver AI-powered research capabilities through Perplexity's web interface.

[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-333)]()
[![TypeScript Codebase](https://img.shields.io/badge/TypeScript-Codebase-333)]()
[![Tests Passing](https://img.shields.io/badge/Tests-Passing-333)]()
[![Bun Runtime](https://img.shields.io/badge/Runtime-Bun-333)]()

## Research Capabilities

- **Intelligent Web Research**: Search and summarize content without API limits
- **Persistent Conversations**: Maintain context with local SQLite chat storage
- **Content Extraction**: Clean article extraction with GitHub repository parsing
- **Developer Tooling**: Documentation retrieval, API discovery, code analysis
- **Keyless Operation**: Browser automation replaces API key requirements

---

## Available Tools

### Search (`search`)
Perform research queries with configurable depth  
*Returns raw text results*

### Get Documentation (`get_documentation`)
Retrieve technical documentation with examples  
*Returns structured documentation*

### Find APIs (`find_apis`)
Discover relevant APIs for development needs  
*Returns API listings and descriptions*

### Check Deprecated Code (`check_deprecated_code`)
Analyze code snippets for outdated patterns  
*Returns analysis report*

### Extract URL Content (`extract_url_content`)
Parse web content with automatic GitHub handling  
*Returns structured content metadata*

### Chat (`chat_perplexity`)
Persistent conversations with context history  
*Returns conversation state in JSON format*

---

## Getting Started

### Prerequisites
- Bun runtime
- Node.js 18+ (for TypeScript compilation)

### Installation
```bash
git clone https://github.com/wysh3/perplexity-mcp-zerver.git
cd perplexity-mcp-zerver
bun install
bun run build
```

### Configuration
Add to your MCP configuration file:
```json
{
  "mcpServers": {
    "perplexity-server": {
      "command": "bun",
      "args": ["/absolute/path/to/build/main.js"],
      "timeout": 300
    }
  }
}
```

### Usage
Initiate commands through your MCP client:
- "Use perplexity to research quantum computing advancements"
- "Ask perplexity-server for React 18 documentation"
- "Begin conversation with perplexity about neural networks"

---

## 🔐 Pro Account Support (Optional)

Use your Perplexity Pro subscription for access to better models (GPT-5.1, Claude Sonnet 4.5) and higher limits.

### One-Time Setup
```bash
bun run build
bun run login
```

A browser window will open. **Log in using email** (recommended for best compatibility), then close the browser. Your session is now saved!

> **Note**: Google/SSO login may work but email login is more reliable with the browser automation.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PERPLEXITY_BROWSER_DATA_DIR` | `~/.perplexity-mcp` | Browser profile directory |
| `PERPLEXITY_PERSISTENT_PROFILE` | `true` | Set to `false` for anonymous mode |

---

## Technical Comparison

| Feature              | This Implementation | Traditional APIs |
|----------------------|---------------------|------------------|
| Authentication       | None required       | API keys         |
| Cost                 | Free                | Usage-based      |
| Data Privacy         | Local processing    | Remote servers   |
| GitHub Integration   | Native support      | Limited          |
| History Persistence  | SQLite storage      | Session-based    |

---

## Troubleshooting

**Server Connection Issues**
1. Verify absolute path in configuration
2. Confirm Node.js installation with `node -v`
3. Ensure build completed successfully

**Content Extraction**
- GitHub paths must use full repository URLs
- Adjust link recursion depth in source configuration

---

## Origins & License
 
based on - [DaInfernalCoder/perplexity-researcher-mcp](https://github.com/DaInfernalCoder/perplexity-researcher-mcp)  
refactored from - [sm-moshi/docshunter](https://github.com/sm-moshi/docshunter)  

Licensed under **GNU GPL v3.0** - [View License](LICENSE)

---

> This project interfaces with Perplexity via browser automation. Use responsibly and ethically. Stability depends on Perplexity's website consistency. Educational use only.
