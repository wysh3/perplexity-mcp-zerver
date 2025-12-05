import { describe, expect, it } from "vitest";
import { TOOL_SCHEMAS } from "../../schema/toolSchemas.js";

describe("Tool Schemas", () => {
  describe("Schema Structure Validation", () => {
    it("should have all required tools", () => {
      expect(TOOL_SCHEMAS).toHaveLength(6);

      const toolNames = TOOL_SCHEMAS.map((schema) => schema.name);
      expect(toolNames).toContain("chat_perplexity");
      expect(toolNames).toContain("search");
      expect(toolNames).toContain("extract_url_content");
      expect(toolNames).toContain("get_documentation");
      expect(toolNames).toContain("find_apis");
      expect(toolNames).toContain("check_deprecated_code");
    });

    it("should have valid schema structure for each tool", () => {
      TOOL_SCHEMAS.forEach((schema) => {
        // Basic required fields
        expect(schema.name).toBeDefined();
        expect(typeof schema.name).toBe("string");
        expect(schema.description).toBeDefined();
        expect(typeof schema.description).toBe("string");
        expect(schema.category).toBeDefined();
        expect(typeof schema.category).toBe("string");

        // Input schema
        expect(schema.inputSchema).toBeDefined();

        // Keywords and use cases
        expect(Array.isArray(schema.keywords)).toBe(true);
        expect(Array.isArray(schema.use_cases)).toBe(true);

        // Examples
        expect(Array.isArray(schema.examples)).toBe(true);
        expect(schema.examples.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Required Field Definitions", () => {
    it("should have proper required field definitions in input schemas", () => {
      TOOL_SCHEMAS.forEach((schema) => {
        if (schema.inputSchema.required) {
          expect(Array.isArray(schema.inputSchema.required)).toBe(true);

          // Check that required fields are defined in properties
          schema.inputSchema.required.forEach((field: any) => {
            expect((schema.inputSchema.properties as any)[field]).toBeDefined();
          });
        }
      });
    });

    it("should have descriptive field definitions", () => {
      TOOL_SCHEMAS.forEach((schema) => {
        Object.keys(schema.inputSchema.properties).forEach((fieldName) => {
          const field: any = (schema.inputSchema.properties as any)[fieldName];
          expect(field.description).toBeDefined();
          expect(typeof field.description).toBe("string");
          expect(field.description.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe("Example Data Validity", () => {
    it("should have valid example data for all tools", () => {
      TOOL_SCHEMAS.forEach((schema) => {
        expect(schema.examples.length).toBeGreaterThan(0);

        schema.examples.forEach((example) => {
          expect(example.description).toBeDefined();
          expect(typeof example.description).toBe("string");
          expect(example.input).toBeDefined();
          expect(example.output).toBeDefined();

          // Check that required input fields are present in examples
          if (schema.inputSchema.required) {
            schema.inputSchema.required.forEach((requiredField: any) => {
              expect((example.input as any)[requiredField]).toBeDefined();
            });
          }
        });
      });
    });
  });

  describe("Schema Completeness", () => {
    it("should have comprehensive categories for all tools", () => {
      const categories = TOOL_SCHEMAS.map((schema) => schema.category);
      expect(categories).toContain("Conversation");
      expect(categories).toContain("Information Extraction");
      expect(categories).toContain("Technical Reference");
      expect(categories).toContain("API Discovery");
      expect(categories).toContain("Code Analysis");
      expect(categories).toContain("Web Search");
    });

    it("should have related tools references", () => {
      TOOL_SCHEMAS.forEach((schema) => {
        expect(Array.isArray(schema.related_tools)).toBe(true);
      });
    });

    it("should have proper schema structure", () => {
      TOOL_SCHEMAS.forEach((schema) => {
        // Check input schema only
        expect(schema.inputSchema.type).toBe("object");
        expect(schema.inputSchema.properties).toBeDefined();
      });
    });
  });
});
