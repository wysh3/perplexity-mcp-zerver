/**
 * Tool implementation for documentation retrieval
 */

import type { PuppeteerContext } from "../types/index.js";

/**
 * Handles documentation fetching and formatting
 */
export default async function getDocumentation(
  args: { query: string; context?: string },
  ctx: PuppeteerContext,
  performSearch: (prompt: string, ctx: PuppeteerContext) => Promise<string>,
): Promise<string> {
  const { query, context = "" } = args;
  const prompt = `Provide comprehensive documentation and usage examples for ${query}. ${
    context ? `Focus on: ${context}` : ""
  } Include:
1. Basic overview and purpose
2. Key features and capabilities
3. Installation/setup if applicable
4. Common usage examples with code snippets
5. Best practices and performance considerations
6. Common pitfalls to avoid
7. Version compatibility information
8. Links to official documentation
9. Community resources (forums, chat channels)
10. Related tools/libraries that work well with it

Crucially, also provide the main official URL(s) for this documentation on separate lines, prefixed with 'Official URL(s):'.`;
  return await performSearch(prompt, ctx);
}
