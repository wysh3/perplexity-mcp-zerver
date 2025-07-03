/**
 * MCP Tool Schema Definitions
 * Comprehensive schemas for all available tools including descriptions, input/output schemas, examples, and metadata
 */

export const TOOL_SCHEMAS = [
  {
    name: "chat_perplexity",
    description:
      "Automatically call this tool for interactive, conversational queries. This tool leverages Perplexitys web search capabilities to provide real-time information and maintains conversation history using an optional chat ID for contextual follow-ups.",
    category: "Conversation",
    keywords: ["chat", "conversation", "dialog", "discussion", "advice", "brainstorm", "debug"],
    use_cases: [
      "Continuing multi-turn conversations",
      "Context-aware question answering",
      "Follow-up questions",
    ],
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The message to send to Perplexity AI for web search",
          examples: [
            "Explain quantum computing",
            "Continue our previous discussion about AI safety",
          ],
        },
        chat_id: {
          type: "string",
          description:
            "Optional: ID of an existing chat to continue. If not provided, a new chat will be created.",
          examples: ["123e4567-e89b-12d3-a456-426614174000"],
        },
      },
      required: ["message"],
    },
    outputSchema: {
      type: "object",
      description:
        "Describes the structure of the JSON object returned within the response text field.",
      properties: {
        chat_id: {
          type: "string",
          description: "ID of the chat session (new or existing)",
        },
        response: {
          type: "string",
          description: "Perplexity AI response to the message",
        },
      },
    },
    examples: [
      {
        description: "Simple question",
        input: { message: "Explain quantum computing basics" },
        output: {
          chat_id: "new-chat-id",
          response: "Quantum computing uses qubits that can exist in superposition...",
        },
      },
      {
        description: "Continuing conversation",
        input: {
          message: "How does that compare to classical computing?",
          chat_id: "existing-chat-id",
        },
        output: {
          chat_id: "existing-chat-id",
          response: "Classical computers use bits that are either 0 or 1, while quantum...",
        },
      },
    ],
    related_tools: ["search", "get_documentation"],
  },
  {
    name: "extract_url_content",
    description:
      "Uses browser automation (Puppeteer) and Mozilla's Readability library to extract the main article text content from a given URL. Handles dynamic JavaScript rendering and includes fallback logic. For GitHub repository URLs, it attempts to fetch structured content via gitingest.com. Performs a pre-check for non-HTML content types and checks HTTP status after navigation. Ideal for getting clean text from articles/blog posts. **Note: May struggle to isolate only core content on complex homepages or dashboards, potentially including UI elements.**",
    category: "Information Extraction",
    keywords: [
      "extract",
      "url",
      "website",
      "content",
      "scrape",
      "summarize",
      "webpage",
      "fetch",
      "readability",
      "article",
      "dom",
      "puppeteer",
      "github",
      "gitingest",
      "repository",
    ],
    use_cases: [
      "Getting the main text of a news article or blog post.",
      "Summarizing web page content.",
      "Extracting documentation text.",
      "Providing website context to other models.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL of the website to extract content from.",
          examples: ["https://www.example.com/article"],
        },
        depth: {
          type: "number",
          description:
            "Optional: Maximum depth for recursive link exploration (1-5). Default is 1 (no recursion).",
          minimum: 1,
          maximum: 5,
          default: 1,
          examples: [1, 3],
        },
      },
      required: ["url"],
    },
    outputSchema: {
      type: "object",
      description:
        "Returns a JSON object with extraction status and content for the URL(s) explored.",
      properties: {
        status: {
          type: "string",
          enum: ["Success", "SuccessWithFallback", "SuccessWithPartial", "Error"],
          description: "Indicates the outcome of the extraction attempt.",
        },
        message: {
          type: "string",
          description: 'Error message or context for "SuccessWithPartial" status.',
        },
        rootUrl: {
          type: "string",
          description: "The initial URL provided for exploration.",
        },
        explorationDepth: {
          type: "number",
          description: "The maximum depth requested for exploration.",
        },
        pagesExplored: {
          type: "number",
          description: "The number of pages successfully fetched during exploration.",
        },
        content: {
          type: "array",
          description: "Array containing results for each explored page.",
          items: {
            type: "object",
            properties: {
              url: { type: "string", description: "URL of the explored page." },
              title: {
                type: "string",
                description: "Title of the explored page (if available).",
              },
              textContent: {
                type: "string",
                description: "Extracted text content of the page (if successful).",
              },
              error: {
                type: "string",
                description: "Error message if fetching this specific page failed.",
              },
            },
            required: ["url"],
          },
        },
      },
    },
    examples: [
      {
        description: "Successful extraction from an article",
        input: { url: "https://example-article-url.com" },
        output: {
          status: "Success",
          rootUrl: "https://example-article-url.com",
          explorationDepth: 1,
          pagesExplored: 1,
          content: [
            {
              url: "https://example-article-url.com",
              title: "Example Article Title",
              textContent: "The main body text of the article...",
            },
          ],
        },
      },
    ],
    related_tools: ["search", "get_documentation"],
  },
  {
    name: "get_documentation",
    description:
      'Automatically call this tool when working with unfamiliar APIs/libraries, needing usage examples, or checking version specifics as this can access web. Example: When adding a payment gateway, ask "Get Stripe API documentation for creating charges".',
    category: "Technical Reference",
    keywords: ["docs", "documentation", "api", "reference", "examples", "usage", "version"],
    use_cases: ["Learning new technologies", "API integration", "Troubleshooting code"],
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The technology, library, or API to get documentation for",
          examples: ["React hooks", "Python pandas", "REST API best practices"],
        },
        context: {
          type: "string",
          description: "Additional context or specific aspects to focus on",
          examples: ["focus on performance optimization", "include TypeScript examples"],
        },
      },
      required: ["query"],
    },
    outputSchema: {
      type: "object",
      properties: {
        response: {
          type: "string",
          description:
            'The raw text response from Perplexity containing documentation, examples, and potentially source URLs prefixed with "Official URL(s):". The calling agent should parse this text to extract URLs if needed for further processing.',
        },
      },
    },
    examples: [
      {
        description: "Basic documentation request",
        input: { query: "React useEffect hook" },
        output: {
          response: "The useEffect hook lets you perform side effects in function components...",
        },
      },
    ],
    related_tools: ["search", "check_deprecated_code"],
  },
  {
    name: "find_apis",
    description:
      'Automatically call this tool when needing external services or real time current data (like API info, latest versions, etc.) from web. Compares options based on requirements. Example: When building a shopping site, ask "Find product image APIs with free tiers".',
    category: "API Discovery",
    keywords: ["api", "integration", "services", "endpoints", "sdk", "data", "external"],
    use_cases: [
      "Finding APIs for specific functionality",
      "Comparing API alternatives",
      "Evaluating API suitability",
    ],
    inputSchema: {
      type: "object",
      properties: {
        requirement: {
          type: "string",
          description: "The functionality or requirement you are looking to fulfill",
          examples: ["image recognition", "payment processing", "geolocation services"],
        },
        context: {
          type: "string",
          description: "Additional context about the project or specific needs",
          examples: ["prefer free tier options", "must support Python SDK"],
        },
      },
      required: ["requirement"],
    },
    outputSchema: {
      type: "object",
      properties: {
        response: {
          type: "string",
          description:
            "The raw text response from Perplexity containing API suggestions and evaluations.",
        },
      },
    },
    examples: [
      {
        description: "Finding payment APIs",
        input: {
          requirement: "payment processing",
          context: "needs Stripe alternative",
        },
        output: {
          response: "PayPal offers global payment processing with 2.9% + $0.30 per transaction...",
        },
      },
    ],
    related_tools: ["get_documentation", "search"],
  },
  {
    name: "check_deprecated_code",
    description:
      "Automatically call this tool when reviewing legacy code, planning upgrades, or encountering warnings with real time web access. Helps identify technical debt. Example: During code reviews or before upgrading dependencies.",
    category: "Code Analysis",
    keywords: ["deprecation", "migration", "upgrade", "compatibility", "linting", "legacy", "debt"],
    use_cases: [
      "Preparing for technology upgrades",
      "Maintaining backward compatibility",
      "Identifying technical debt",
    ],
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "The code snippet or dependency to check",
          examples: ["componentWillMount()", "var instead of let/const"],
        },
        technology: {
          type: "string",
          description: 'The technology or framework context (e.g., "React", "Node.js")',
          examples: ["React 16", "Python 2.7", "Node.js 12"],
        },
      },
      required: ["code"],
    },
    outputSchema: {
      type: "object",
      properties: {
        response: {
          type: "string",
          description:
            "The raw text response from Perplexity analyzing the code for deprecated features.",
        },
      },
    },
    examples: [
      {
        description: "React lifecycle method deprecation",
        input: {
          code: "componentWillMount() {\n  // initialization code\n}",
          technology: "React",
        },
        output: {
          response:
            "componentWillMount is deprecated in React 17+. Use constructor or componentDidMount instead...",
        },
      },
    ],
    related_tools: ["get_documentation", "search"],
  },
  {
    name: "search",
    description:
      "Performs a web search using Perplexity AI based on the provided query and desired detail level. Useful for general knowledge questions, finding information, or getting different perspectives.",
    category: "Web Search",
    keywords: ["search", "web", "internet", "query", "find", "information", "lookup", "perplexity"],
    use_cases: [
      "Answering general knowledge questions.",
      "Finding specific information online.",
      "Getting quick summaries or detailed explanations.",
      "Researching topics.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query or question to ask Perplexity.",
          examples: ["What is the capital of France?", "Explain black holes"],
        },
        detail_level: {
          type: "string",
          enum: ["brief", "normal", "detailed"],
          description: "Optional: Controls the level of detail in the response (default: normal).",
          examples: ["brief", "detailed"],
        },
        stream: {
          type: "boolean",
          description:
            "Optional: Enable streaming response for large documentation queries (default: false).",
          examples: [true, false],
        },
      },
      required: ["query"],
    },
    outputSchema: {
      type: "object",
      properties: {
        response: {
          type: "string",
          description: "The search result text provided by Perplexity AI.",
        },
      },
    },
    examples: [
      {
        description: "Simple search query",
        input: { query: "What is the weather in London?" },
        output: { response: "The weather in London is currently..." },
      },
      {
        description: "Detailed search query",
        input: { query: "Explain the theory of relativity", detail_level: "detailed" },
        output: {
          response:
            "Albert Einstein's theory of relativity includes Special Relativity and General Relativity...",
        },
      },
    ],
    related_tools: ["chat_perplexity", "get_documentation", "find_apis"],
  },
] as const;
