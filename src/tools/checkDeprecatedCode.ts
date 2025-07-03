/**
 * Tool handler for 'check_deprecated_code'.
 * Analyzes code for deprecated features or patterns and suggests replacements, using the Perplexity search logic.
 * @param args - { code: string; technology?: string }
 * @param ctx - PuppeteerContext for browser operations
 * @param performSearch - Function to perform the search (prompt: string, ctx: PuppeteerContext) => Promise<string>
 * @returns The deprecation analysis string result
 */
import type { PuppeteerContext } from "../types/index.js";

export default async function checkDeprecatedCode(
  args: { code: string; technology?: string },
  ctx: PuppeteerContext,
  performSearch: (prompt: string, ctx: PuppeteerContext) => Promise<string>,
): Promise<string> {
  const { code, technology = "" } = args;
  const prompt = `Analyze this code for deprecated features or patterns${
    technology ? ` in ${technology}` : ""
  }:

${code}

Please provide:
1. Identification of deprecated features/methods
2. Current recommended alternatives
3. Step-by-step migration guide
4. Impact assessment of the changes
5. Deprecation timeline if available
6. Code examples before/after updating
7. Performance implications
8. Backward compatibility considerations
9. Testing recommendations for the changes`;
  return await performSearch(prompt, ctx);
}
