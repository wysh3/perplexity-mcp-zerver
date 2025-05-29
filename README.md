# Perplexity MCP Zerver <a href="https://raw.githubusercontent.com/wysh3/perplexity-mcp-zerver/main/README.md" title="Copy Full README Content (opens raw file view)">📋</a>

A research level Model Context Protocol (MCP) server implementation providing AI-powered research capabilities by interacting with the Perplexity website without requiring an API key.

## Features
- 🔍 Web search integration via Perplexity's web interface.
- 💬 Persistent chat history for conversational context.
- 📄 Tools for documentation retrieval, API finding, and code analysis.
- 🚫 No API Key required (relies on web interaction).
- 🛠️ TypeScript-first implementation.
- 🌐 Uses Puppeteer for browser automation.

## Tools

### 1. Search (`search`)
Performs a search query on Perplexity.ai. Supports `brief`, `normal`, or `detailed` responses. Returns raw text output.

### 2. Get Documentation (`get_documentation`)
Asks Perplexity to provide documentation and examples for a technology/library, optionally focusing on specific context. Returns raw text output.

### 3. Find APIs (`find_apis`)
Asks Perplexity to find and evaluate APIs based on requirements and context. Returns raw text output.

### 4. Check Deprecated Code (`check_deprecated_code`)
Asks Perplexity to analyze a code snippet for deprecated features within a specific technology context. Returns raw text output.

### 5. Extract URL Content (`extract_url_content`)
Extracts main article text content from URLs using browser automation and Mozilla's Readability. Handles GitHub repositories via gitingest.com. Supports recursive link exploration up to depth. Returns structured JSON with content and metadata.

### 6. Chat (`chat_perplexity`)
Maintains ongoing conversations with Perplexity AI. Stores chat history locally in `chat_history.db` within the project directory. Returns a *stringified JSON object* containing `chat_id` and `response`.

## Installation
> just copy <a href="https://raw.githubusercontent.com/wysh3/perplexity-mcp-zerver/main/README.md" title="Copy Full README Content (opens raw file view)">📋</a> and paste the readme and let the AI take care of the rest
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

> **Important**: Ensure you have Node.js installed. Puppeteer will download a compatible browser version if needed during installation. Restart your IDE/Application after building and configuring the project for changes to take effect.

## Running Globally (Optional)

After installation and building, you can make the server runnable as a global command from any directory.

1.  **Link the package**: In the project directory (`perplexity-mcp-zerver`), run:
    ```bash
    npm link
    ```
    This will create a global command `perplexity-mcp-server-cli`.

2.  **Run the server globally**: You can now start the server from any terminal window:
    *   Without a proxy:
        ```bash
        perplexity-mcp-server-cli
        ```
    *   With a proxy (e.g., a SOCKS5 proxy):
        ```bash
        perplexity-mcp-server-cli --proxy-server=socks5://YOUR_PROXY_IP:PORT
        ```
        Replace `YOUR_PROXY_IP:PORT` with your actual proxy details. The server currently supports HTTP/HTTPS and SOCKS4/SOCKS5 proxy formats for this argument when using `puppeteer-real-browser`.
        A good source for free, frequently updated SOCKS and HTTP proxies is Proxifly: [https://github.com/proxifly/free-proxy-list](https://github.com/proxifly/free-proxy-list).

    Using the global command means you don't need to specify the full path to `build/index.js` in your MCP configuration. Instead, you can use `perplexity-mcp-server-cli` as the command.

## Configuration

Add the server to your MCP configuration file (e.g., `cline_mcp_settings.json` for the VS Code extension or `claude_desktop_config.json` for the desktop app).

**If running directly with `node` (not globally linked):**
Replace `/path/to/perplexity-mcp-zerver/build/index.js` with the **absolute path** to the built `index.js` file on your system.
You can also add the `--proxy-server` argument here if needed.

Example for Cline/RooCode Extension (direct node execution):
```json
{
  "mcpServers": {
    "perplexity-server": {
      "command": "node",
      "args": [
        "/full/path/to/your/perplexity-mcp-zerver/build/index.js" // <-- Replace this path!
        // To use a proxy:
        // "/full/path/to/your/perplexity-mcp-zerver/build/index.js",
        // "--proxy-server=socks5://YOUR_PROXY_IP:PORT" 
      ],
      "env": {},
      "disabled": false,
      "alwaysAllow": ["search", "extract_url_content"],
      "autoApprove": ["search", "get_documentation"],
      "timeout": 300
    }
  }
}
```

**If running with the globally linked `perplexity-mcp-server-cli` command:**
The `command` field should be `perplexity-mcp-server-cli` and `args` can include the proxy.

Example for Cline/RooCode Extension (global command):
```json
{
  "mcpServers": {
    "perplexity-server": {
      "command": "perplexity-mcp-server-cli", // Use the global command
      "args": [
        // To use a proxy:
        // "--proxy-server=socks5://YOUR_PROXY_IP:PORT" 
      ],
      "env": {},
      "disabled": false,
      "alwaysAllow": ["search", "extract_url_content"],
      "autoApprove": ["search", "get_documentation"],
      "timeout": 300
    }
  }
}
```

Example for Claude Desktop (direct node execution):
```json
{
  "mcpServers": {
    "perplexity-server": {
      "command": "node",
      "args": [
        "/full/path/to/your/perplexity-mcp-zerver/build/index.js" // <-- Replace this path!
      ],
      "env": {},
      "disabled": false,
      "alwaysAllow": []
    }
  }
}
```

## Usage

1.  Ensure the server is configured correctly in your MCP settings file.
2.  Start the server (either directly via `node build/index.js` in the project directory, or globally using `perplexity-mcp-server-cli` if linked).
3.  Restart your IDE (like VS Code with the Cline/RooCode extension) or the Claude Desktop application if it was already running when you started the server.
4.  The MCP client should automatically connect to the server.
5.  You can now ask the connected AI assistant (like Claude) to use the tools, e.g.:
    *   "Use perplexity-server search to find the latest news on AI."
    *   "Ask perplexity-server get_documentation about React hooks."
    *   "Start a chat with perplexity-server about quantum computing."

## Credits

Thanks DaInfernalCoder:
- [DaInfernalCoder/perplexity-researcher-mcp](https://github.com/DaInfernalCoder/perplexity-researcher-mcp)


## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE.md](LICENSE) file for details.

## Disclaimer

This project interacts with the Perplexity website via web automation (Puppeteer). It is intended for educational and research purposes only. Web scraping and automation may be against the terms of service of the target website. The author does not endorse or encourage any unauthorized automation or violation of terms of service. Use responsibly and ethically. The stability of this server depends on the Perplexity website's structure remaining consistent.
