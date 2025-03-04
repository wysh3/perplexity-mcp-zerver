# Perplexity MCP Zerver
[![smithery badge](https://smithery.ai/badge/@wysh3/perplexity-mcp-zerver)](https://smithery.ai/server/@wysh3/perplexity-mcp-zerver)

A research level Model Context Protocol (MCP) server implementation providing AI-powered research capabilities through Perplexity's infrastructure without using any API key.

<a href="https://glama.ai/mcp/servers/jmwpwn6uqh"><img width="380" height="200" src="https://glama.ai/mcp/servers/jmwpwn6uqh/badge" alt="advance perplexity mcp server" /></a>

## Features
- 🔍 Web search integration via Perplexity
- 🔑 Use without any API Key
- 🛠️ TypeScript-first implementation
- 📦 Modular tool architecture

## Tools

### 1. Search (`search`)
Perform comprehensive web searches with adjustable detail levels.

### 2. Get Documentation (`get_documentation`)
Retrieve up-to-date documentation and code examples with contextual guidance.

### 3. Find APIs (`find_apis`)
Discover and evaluate APIs based on technical requirements and compliance needs.

### 4. Check Deprecated Code (`check_deprecated_code`)
Analyze code for outdated patterns and provide migration guidance.

### 5. Chat (`chat_perplexity`)
Maintains ongoing conversations with Perplexity AI using a persistent chat history.

## Installation

### Installing via Smithery

To install Perplexity MCP Zerver for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@wysh3/perplexity-mcp-zerver):

```bash
npx -y @smithery/cli install @wysh3/perplexity-mcp-zerver --client claude
```

### Manual Installation
1. Clone or download this repository:
```bash
git clone https://github.com/wysh3/perplexity-mcp-zerver.git
cd perplexity-mcp-zerver
```

2. Install dependencies:
```bash
npm install
```

3. Build the server:
```bash
npm run build
```

> **Important**: Please restart your IDE after building the project for changes to take effect.

## Configuration

Add the server to your MCP configuration:

For Cline/RooCode Extension:
```json
{
  "mcpServers": {
    "perplexity-server": {
      "command": "node",
      "args": [
        "/path/to/perplexity-mcp-server/build/index.js"
      ],
      "env": {},
      "disabled": false,
      "alwaysAllow": ["search"]
    }
  }
}
```

For Claude Desktop:
```json
{
  "mcpServers": {
    "web-search": {
      "command": "node",
      "args": ["/path/to/web-search/build/index.js"],
      "env": {}
    }
  }
}
```

## Usage
Just restart the IDE and ask the llm

## Credits

Thanks DaInfernalCoder:
- [DaInfernalCoder/perplexity-researcher-mcp](https://github.com/DaInfernalCoder/perplexity-researcher-mcp)

## Disclaimer
This project is intended for educational and research purposes only. The author does not endorse or encourage any unauthorized automation of web services. Use responsibly!
