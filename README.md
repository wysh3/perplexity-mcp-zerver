# Perplexity MCP Zerver

A minimalist research server implementing the Model Context Protocol (MCP) to deliver AI-powered research capabilities through Perplexity's web interface.

<a href="https://glama.ai/mcp/servers/@wysh3/perplexity-mcp-zerver">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@wysh3/perplexity-mcp-zerver/badge" alt="Perplexity Server MCP server" />
</a>

[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-333)]() 
[![TypeScript Codebase](https://img.shields.io/badge/TypeScript-Codebase-333)]()
[![Tests Passing](https://img.shields.io/badge/Tests-Passing-333)]()

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
- Node.js 18+
- pnpm package manager

### Installation
```bash
git clone https://github.com/wysh3/perplexity-mcp-zerver.git
cd perplexity-mcp-zerver
pnpm install
pnpm run build
```

### Configuration
Add to your MCP configuration file:
```json
{
  "mcpServers": {
    "perplexity-server": {
      "command": "node",
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