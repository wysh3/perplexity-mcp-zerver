# Perplexity MCP Server
[![smithery badge](https://smithery.ai/badge/@wysh3/perplexity-mcp-server)](https://smithery.ai/server/@wysh3/perplexity-mcp-server)

A research level Model Context Protocol (MCP) server implementation providing AI-powered research capabilities through Perplexity's infrastructure without using any API key.

<a href="https://glama.ai/mcp/servers/jmwpwn6uqh"><img width="380" height="200" src="https://glama.ai/mcp/servers/jmwpwn6uqh/badge" alt="advance perplexity mcp server" /></a>

## Table of Contents
- [Features](#features)
- [Available Tools](#available-tools)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Credits](#credits)

## Features
- 🔍 Web search integration via Perplexity
- 🔑 Zero-configuration API access
- 🛠️ TypeScript-first implementation
- 📦 Modular tool architecture

## Available Tools

### 1. Search (`search`)
Perform comprehensive web searches with adjustable detail levels.

**Parameters:**
- `query`: string (required) - Search query
- `detail_level`: "brief" | "normal" | "detailed" (optional, default="normal")

### 2. Get Documentation (`get_documentation`)
Retrieve up-to-date documentation and code examples with contextual guidance.

**Parameters:**
- `query`: string (required) - Technology/library name
- `context`: string (optional) - Specific use case or scenario

### 3. Find APIs (`find_apis`)
Discover and evaluate APIs based on technical requirements and compliance needs.

**Parameters:**
- `requirement`: string (required) - Core functionality needed
- `context`: string (optional) - Constraints or special requirements

**Note:** Evaluates both technical and compliance aspects

### 4. Check Deprecated Code (`check_deprecated_code`)
Analyze code for outdated patterns and provide migration guidance.

**Parameters:**
- `code`: string (required) - Code snippet to analyze
- `technology`: string (required) - Framework/library context

**Note:** Provides version-specific migration paths

## Installation

### Installing via Smithery

To install Perplexity Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@wysh3/perplexity-mcp-server):

```bash
npx -y @smithery/cli install @wysh3/perplexity-mcp-server --client claude
```

### Manual Installation
1. Clone or download this repository:
```bash
git clone https://github.com/wysh3/perplexity-mcp-server.git
cd perplexity-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Build the server:
```bash
npm run build
```

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
```bash
# Start the server
npm start
```

## Credits

Thanks DaInfernalCoder:
- [DaInfernalCoder/perplexity-researcher-mcp](https://github.com/DaInfernalCoder/perplexity-researcher-mcp)

## Disclaimer
This project is intended for educational and research purposes only. The author does not endorse or encourage any unauthorized automation of web services. Use responsibly!
