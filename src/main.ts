#!/usr/bin/env node

import { PerplexityServer } from "./server/PerplexityServer.js";

// Create and start the server
const server = new PerplexityServer();
await server.run();
