import { describe, expect, it } from "vitest";
import { TOOL_SCHEMAS } from "../toolSchemas.js";

describe("Tool Schemas", () => {
  describe("Schema structure validation", () => {
    it("should export TOOL_SCHEMAS as an array", () => {
      expect(Array.isArray(TOOL_SCHEMAS)).toBe(true);
      expect(TOOL_SCHEMAS.length).toBeGreaterThan(0);
    });

    it("should contain all expected tools", () => {
      const expectedTools = [
        "chat_perplexity",
        "extract_url_content",
        "get_documentation",
        "find_apis",
        "check_deprecated_code",
        "search",
      ];

      const toolNames = TOOL_SCHEMAS.map((schema) => schema.name);

      for (const expectedTool of expectedTools) {
        expect(toolNames).toContain(expectedTool);
      }
    });

    it("should have consistent structure for each tool schema", () => {
      const requiredFields = ["name", "description", "category", "inputSchema"];
      const optionalFields = ["keywords", "use_cases", "outputSchema", "examples", "related_tools"];

      for (const schema of TOOL_SCHEMAS) {
        // Check required fields
        for (const field of requiredFields) {
          expect(schema).toHaveProperty(field);
          expect(schema[field as keyof typeof schema]).toBeDefined();
        }

        // Check field types
        expect(typeof schema.name).toBe("string");
        expect(typeof schema.description).toBe("string");
        expect(typeof schema.category).toBe("string");
        expect(typeof schema.inputSchema).toBe("object");

        if (schema.keywords) {
          expect(Array.isArray(schema.keywords)).toBe(true);
        }

        if (schema.use_cases) {
          expect(Array.isArray(schema.use_cases)).toBe(true);
        }

        if (schema.examples) {
          expect(Array.isArray(schema.examples)).toBe(true);
        }

        if (schema.related_tools) {
          expect(Array.isArray(schema.related_tools)).toBe(true);
        }
      }
    });

    it("should have valid input schemas with required properties", () => {
      for (const schema of TOOL_SCHEMAS) {
        const inputSchema = schema.inputSchema;

        expect(inputSchema).toHaveProperty("type");
        expect(inputSchema.type).toBe("object");
        expect(inputSchema).toHaveProperty("properties");
        expect(typeof inputSchema.properties).toBe("object");

        if (inputSchema.required) {
          expect(Array.isArray(inputSchema.required)).toBe(true);
          expect(inputSchema.required.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("Individual tool validations", () => {
    it("should validate search tool schema", () => {
      const searchTool = TOOL_SCHEMAS.find((s) => s.name === "search");
      expect(searchTool).toBeDefined();

      if (searchTool) {
        expect(searchTool.inputSchema.properties).toHaveProperty("query");
        expect(searchTool.inputSchema.properties.query.type).toBe("string");
        expect(searchTool.inputSchema.required).toContain("query");
      }
    });

    it("should validate chat_perplexity tool schema", () => {
      const chatTool = TOOL_SCHEMAS.find((s) => s.name === "chat_perplexity");
      expect(chatTool).toBeDefined();

      if (chatTool) {
        expect(chatTool.inputSchema.properties).toHaveProperty("message");
        expect(chatTool.inputSchema.properties.message.type).toBe("string");
        expect(chatTool.inputSchema.required).toContain("message");
      }
    });

    it("should validate extract_url_content tool schema", () => {
      const extractTool = TOOL_SCHEMAS.find((s) => s.name === "extract_url_content");
      expect(extractTool).toBeDefined();

      if (extractTool) {
        expect(extractTool.inputSchema.properties).toHaveProperty("url");
        expect(extractTool.inputSchema.properties.url.type).toBe("string");
        expect(extractTool.inputSchema.required).toContain("url");
      }
    });

    it("should validate get_documentation tool schema", () => {
      const docsTool = TOOL_SCHEMAS.find((s) => s.name === "get_documentation");
      expect(docsTool).toBeDefined();

      if (docsTool) {
        expect(docsTool.inputSchema.properties).toHaveProperty("query");
        expect(docsTool.inputSchema.properties.query.type).toBe("string");
        expect(docsTool.inputSchema.required).toContain("query");
      }
    });

    it("should validate find_apis tool schema", () => {
      const apisTool = TOOL_SCHEMAS.find((s) => s.name === "find_apis");
      expect(apisTool).toBeDefined();

      if (apisTool) {
        expect(apisTool.inputSchema.properties).toHaveProperty("requirement");
        expect(apisTool.inputSchema.properties.requirement.type).toBe("string");
        expect(apisTool.inputSchema.required).toContain("requirement");
      }
    });

    it("should validate check_deprecated_code tool schema", () => {
      const deprecatedTool = TOOL_SCHEMAS.find((s) => s.name === "check_deprecated_code");
      expect(deprecatedTool).toBeDefined();

      if (deprecatedTool) {
        expect(deprecatedTool.inputSchema.properties).toHaveProperty("code");
        expect(deprecatedTool.inputSchema.properties.code.type).toBe("string");
        expect(deprecatedTool.inputSchema.required).toContain("code");
      }
    });
  });

  describe("Schema completeness", () => {
    it("should have descriptions for all tools", () => {
      for (const schema of TOOL_SCHEMAS) {
        expect(schema.description).toBeDefined();
        expect(schema.description.length).toBeGreaterThan(10);
      }
    });

    it("should have categories for all tools", () => {
      const validCategories = [
        "Conversation",
        "Information Extraction",
        "Technical Reference",
        "API Discovery",
        "Code Analysis",
        "Web Search",
      ];

      for (const schema of TOOL_SCHEMAS) {
        expect(validCategories).toContain(schema.category);
      }
    });

    it("should have examples for major tools", () => {
      const toolsWithExamples = TOOL_SCHEMAS.filter((s) => s.examples);
      expect(toolsWithExamples.length).toBeGreaterThan(3);

      for (const schema of toolsWithExamples) {
        expect(schema.examples?.length || 0).toBeGreaterThan(0);

        for (const example of schema.examples || []) {
          expect(example).toHaveProperty("description");
          expect(example).toHaveProperty("input");
          expect(example).toHaveProperty("output");
        }
      }
    });
  });
});
