# Perplexity MCP Server without API Key

A Model Context Protocol server that provides Perplexity.ai search capabilities.

## Installation
```bash
git clone https://github.com/wysh3/perplexity-server.git
cd perplexity-server
npm install
npm run build
```

## Configuration
Add to your Cline/RooCode settings.json:
```json
{
  "mcpServers": {
    "perplexity-server": {
      "command": "node",
      "args": [
        "/path/to/perplexity-server/build/index.js"
      ],
      "env": {},
      "disabled": false,
      "alwaysAllow": ["search"]
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