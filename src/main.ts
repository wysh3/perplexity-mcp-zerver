#!/usr/bin/env node

import { DocshunterServer } from "./server/DocshunterServer.js";

// Create and start the server
const server = new DocshunterServer();
await server.run();
