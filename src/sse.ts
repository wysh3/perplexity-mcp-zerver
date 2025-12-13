import express from "express";
import cors from "cors";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { PerplexityServer } from "./server/PerplexityServer.js";
import { BrowserManager } from "./server/modules/BrowserManager.js";
import { DatabaseManager } from "./server/modules/DatabaseManager.js";
import { SearchEngine } from "./server/modules/SearchEngine.js";
import { logInfo, logError } from "./utils/logging.js";

const app = express();
const PORT = process.env["PORT"] || 3000;

// Initialize shared resources to save RAM (especially for the browser)
logInfo("Initializing shared resources...");
const browserManager = new BrowserManager();
const databaseManager = new DatabaseManager();

// Initialize the database immediately
databaseManager.initialize();

// Create the search engine with the shared browser manager
const searchEngine = new SearchEngine(browserManager);

// Enable CORS for all origins to allow OpenAI Connectors to reach this
app.use(cors());

// Parse JSON bodies (needed for the POST /messages endpoint)
app.use(express.json());

// Store active transports
const transports = new Map<string, SSEServerTransport>();

// SSE Endpoint: Establishes the connection
app.get("/sse", async (req, res) => {
    try {
        logInfo("New SSE connection request");

        // Create a new transport for this session
        const transport = new SSEServerTransport("/messages", res);
        const sessionId = transport.sessionId;

        // Create a PerplexityServer instance for this session
        // We inject the shared managers to avoid spawning multiple browsers
        const server = new PerplexityServer({
            browserManager,
            databaseManager,
            searchEngine
        });

        logInfo(`Created session ${sessionId}`);
        transports.set(sessionId, transport);

        // Clean up when the connection closes
        transport.onclose = () => {
            logInfo(`SSE connection closed for session ${sessionId}`);
            transports.delete(sessionId);
        };

        // Connect the server to the transport
        await server.connect(transport);

    } catch (error) {
        logError("Error in /sse endpoint:", {
            error: error instanceof Error ? error.message : String(error)
        });
        if (!res.headersSent) {
            res.status(500).end();
        }
    }
});

// Messages Endpoint: Handles client responses and requests
app.post("/messages", async (req, res) => {
    const sessionId = req.query["sessionId"] as string;

    if (!sessionId) {
        res.status(400).send("Missing sessionId parameter");
        return;
    }

    const transport = transports.get(sessionId);
    if (!transport) {
        res.status(404).send("Session not found");
        return;
    }

    try {
        // Delegate to the transport to handle the message
        await transport.handlePostMessage(req, res, req.body);
    } catch (error) {
        logError("Error in /messages endpoint:", {
            error: error instanceof Error ? error.message : String(error)
        });
        if (!res.headersSent) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
});

// Start the server
const server = app.listen(PORT, () => {
    logInfo(`SSE Server listening on port ${PORT}`);
    logInfo(`SSE Endpoint: http://localhost:${PORT}/sse`);
    logInfo(`Messages Endpoint: http://localhost:${PORT}/messages`);
    logInfo(`Shared BrowserManager and DatabaseManager are ready.`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
    logInfo("SIGINT received, shutting down...");

    // Close all transports
    for (const [id, transport] of transports) {
        // @ts-ignore - accessing private or protected close if necessary, 
        // but SSEServerTransport doesn't specify a public close() in all versions. 
        // However, we should at least close the express server.
    }

    server.close();

    // Cleanup shared resources
    await browserManager.cleanup();
    databaseManager.close();

    process.exit(0);
});
