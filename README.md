# Perplexity MCP Zerver <a href="https://raw.githubusercontent.com/wysh3/perplexity-mcp-zerver/main/README.md" title="Copy Full README Content (opens raw file view)">📋</a>

[![MCP](https://img.shields.io/badge/MCP-Compatible-purple)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Clean-blue)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)]()

A production-ready, research-level Model Context Protocol (MCP) server providing AI-powered research capabilities. It interacts directly with the Perplexity website, offering intelligent search, persistent chat, and developer-focused tools without requiring an API key.

## ✨ Features

- 🔍 **Web Research**: Intelligent search and summarization via Perplexity's web interface without API limits.
- 💬 **Persistent Conversations**: Maintain conversational context with a local SQLite chat history.
- 📄 **Smart Content Extraction**: Extracts clean article content from URLs using Mozilla Readability and supports GitHub repository analysis.
- 🛠️ **Developer Tools**: Specialized tools for documentation retrieval, API discovery, and code deprecation analysis.
- 🚫 **No API Keys Required**: Relies on robust web automation with Puppeteer, bypassing the need for paid API keys.
- 🛠️ **TypeScript-First**: A modern, type-safe, and maintainable codebase.
- 🌐 **Browser Automation**: Uses Puppeteer to interact with websites like a human, ensuring high-quality results.

## 🛠️ Tools Available

### 1. Search (`search`)
Performs a search query on Perplexity.ai. Supports `brief`, `normal`, or `detailed` response modes.
*   **Returns**: Raw text output of the search results.

### 2. Get Documentation (`get_documentation`)
Asks Perplexity to provide documentation and code examples for a technology, library, or framework, optionally focusing on a specific context.
*   **Returns**: Raw text output with documentation.

### 3. Find APIs (`find_apis`)
Asks Perplexity to find and evaluate APIs based on your specified requirements and context.
*   **Returns**: Raw text output listing and describing relevant APIs.

### 4. Check Deprecated Code (`check_deprecated_code`)
Asks Perplexity to analyze a code snippet for deprecated features within a specific technology (e.g., "React 18", "Node.js v20").
*   **Returns**: Raw text analysis of the code.

### 5. Extract URL Content (`extract_url_content`)
Extracts the main article text from any URL. It can also ingest entire GitHub repositories and recursively explore links up to a specified depth.
*   **Returns**: Structured JSON with content, title, and other metadata.

### 6. Chat (`chat_perplexity`)
Initiates or continues an ongoing conversation with Perplexity AI. Chat history is stored locally in `chat_history.db` for context.
*   **Returns**: A *stringified JSON object* containing the `chat_id` and the `response`.

## 🚀 Quick Start

### 1. Installation
> **Prerequisites**: Ensure you have [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/installation) installed.

```bash
# Clone the repository
git clone https://github.com/wysh3/perplexity-mcp-zerver.git
cd perplexity-mcp-zerver

# Install dependencies (this will also download a browser for Puppeteer)
pnpm install

# Build the server
pnpm run build
```
> **Important**: After building, it's recommended to restart your IDE (VS Code) or AI client application to ensure it picks up the new server.

### 2. Configuration

Add the server to your MCP configuration file. This file may be named `cline_mcp_settings.json`, `.cursor/mcp.json`, or `claude_desktop_config.json` depending on your client.

⚠️ **You must replace `/full/path/to/your/perplexity-mcp-zerver` with the absolute path on your system.**

```json
{
  "mcpServers": {
    "perplexity-server": {
      "command": "node",
      "args": [
        "/full/path/to/your/perplexity-mcp-zerver/build/main.js"
      ],
      "env": {},
      "disabled": false,
      "alwaysAllow": [],
      "autoApprove": [],
      "timeout": 300
    }
  }
}
```
*   **Windows Path Example**: `"C:\\Users\\YourUser\\Projects\\perplexity-mcp-zerver\\build\\index.js"`

### 3. Usage

Once the server is installed and configured, restart your AI client. You can then invoke the tools by name.

*   "Use `perplexity-server` to search for the latest news on large language models."
*   "Ask `perplexity-server` `get_documentation` about using async/await in TypeScript."
*   "Start a chat with `perplexity-server` about the pros and cons of server-side rendering."

## 🤔 Why Use This Approach?

| Feature | Perplexity MCP Zerver | Traditional API Methods |
| :--- | :--- | :--- |
| **API Keys** | ✅ **None required** | ❌ Requires keys, costs, and rate limits |
| **Chat Persistence** | ✅ Local & private SQLite DB | ❌ Often session-only or stored remotely |
| **GitHub Ingestion**| ✅ Automatic repo analysis | ❌ Manual file handling required |
| **Privacy** | ✅ **Everything runs locally** | ❌ Data is sent to third-party cloud services |

## 🔧 Troubleshooting

*   **Connection Issues**:
    1.  Double-check that the `args` path in your MCP JSON file is the **correct absolute path** to `build/index.js`.
    2.  Ensure the server is not `disabled` in the configuration.
    3.  Restart your IDE or AI client application completely.

*   **Useful Commands**:
    ```bash
    # Verify your Node.js installation path
    which node

    # Check that the build output file exists
    ls build/index.js

    # Rebuild the project if something seems broken
    pnpm run build
    ```

## Credits
*   It builds upon the foundational work of [**DaInfernalCoder/perplexity-researcher-mcp**](https://github.com/DaInfernalCoder/perplexity-researcher-mcp).
*   Refactored from the [**sm-moshi/docshunter**](https://github.com/sm-moshi/docshunter) fork

## License

This project is licensed under the **GNU General Public License v3.0**. See the [LICENSE.md](LICENSE) file for details.

## Disclaimer

This project is intended for educational and research purposes only. It interacts with the Perplexity website via web automation (Puppeteer). Web scraping and automation may be against the terms of service of the target website. The author does not endorse or encourage any unauthorized automation or violation of terms of service. **Use responsibly and ethically.** The stability of this server depends on the Perplexity website's structure remaining consistent.