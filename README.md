# Perplexity MCP Server

A Model Context Protocol server that provides web search capabilities using Perplexity.ai without API keys.

## Features
- Search the web using Perplexity
- No API keys or authentication required

## Installation

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

## Contributing
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/fooBar`)
3. Commit your changes (`git commit -am 'Add some fooBar'`)
4. Push to the branch (`git push origin feature/fooBar`)
5. Create a new Pull Request
