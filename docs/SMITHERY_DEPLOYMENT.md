# Deploying to Smithery

This guide will help you deploy your Perplexity MCP Server to Smithery.

## Prerequisites

- A Smithery account (sign up at [smithery.ai](https://smithery.ai) if you don't have one)
- Git installed on your machine
- Node.js 18 or higher

## Deployment Steps

### 1. Prepare Your Project

The `smithery.json` file has already been created in the root of your project. This file contains all the necessary configuration for Smithery to understand your MCP server.

### 2. Install Smithery CLI

```bash
npm install -g @smithery/cli
```

### 3. Login to Smithery

```bash
smithery login
```

Follow the prompts to authenticate with your Smithery account.

### 4. Initialize Smithery in Your Project (if not already done)

```bash
smithery init
```

This will connect your local project with Smithery. If you've already created the smithery.json file, it will use that configuration.

### 5. Deploy Your MCP Server

```bash
smithery deploy
```

This command will:
1. Build your project using the command specified in smithery.json
2. Package your MCP server
3. Upload it to the Smithery registry

### 6. Verify Deployment

After deployment completes, you can verify your MCP server in the Smithery dashboard:

```bash
smithery open
```

Or visit [https://smithery.ai/dashboard](https://smithery.ai/dashboard) in your browser.

## Using Your Deployed MCP Server

Once deployed, your MCP server will be available in the Smithery registry. You can use it in compatible AI applications by referencing it with:

```
smithery://perplexity-mcp-server@1.0.0
```

Or the latest version with:

```
smithery://perplexity-mcp-server@latest
```

## Updating Your MCP Server

To update your MCP server:

1. Make your changes to the code
2. Update the version in smithery.json
3. Run `smithery deploy` again
## Additional Resources

For more information, refer to the Smithery documentation:

- [Smithery Docs](https://smithery.ai/docs)
- [Registry Guide](https://smithery.ai/docs/registry)
- [Deployments Guide](https://smithery.ai/docs/deployments)
- [Configuration Reference](https://smithery.ai/docs/config)
- [Git Integration](https://smithery.ai/docs/git)
- [FAQ for Users](https://smithery.ai/docs/faq/users)
- [FAQ for Developers](https://smithery.ai/docs/faq/developers)