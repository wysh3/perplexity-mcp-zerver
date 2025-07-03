/**
 * Tool implementation for finding APIs
 */

import type { PuppeteerContext } from "../types/index.js";

/**
 * Handles API discovery and comparison
 */
export default async function findApis(
  args: { requirement: string; context?: string },
  ctx: PuppeteerContext,
  performSearch: (prompt: string, ctx: PuppeteerContext) => Promise<string>,
): Promise<string> {
  const { requirement, context = "" } = args;
  const prompt = `Find and evaluate APIs that could be used for: ${requirement}. ${
    context ? `Context: ${context}` : ""
  } For each API, provide:
1. Name and brief description
2. Key features and capabilities
3. Pricing model and rate limits
4. Authentication methods
5. Integration complexity
6. Documentation quality and examples
7. Community support and popularity
8. Any potential limitations or concerns
9. Code examples for basic usage
10. Comparison with similar APIs
11. SDK availability and language support`;
  return await performSearch(prompt, ctx);
}
