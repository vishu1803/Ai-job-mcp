/**
 * @file Gemini Schema & Tool Definition Converter (ARCH-026 / ADR-047)
 *
 * Converts Zod schemas and JSON Schema 7 definitions to Gemini responseSchema
 * and maps MCP Tool definitions to Gemini FunctionDeclarations.
 */

import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Cleans standard JSON Schema for strict Gemini responseSchema compatibility.
 * Removes unsupported metadata keywords ($schema, default, description on root if invalid).
 *
 * @param {any} schema Raw JSON schema
 * @returns {any} Cleaned schema object for Gemini
 */
export function cleanSchemaForGemini(schema) {
  if (!schema || typeof schema !== 'object') return schema;

  const cleaned = { ...schema };
  delete cleaned.$schema;
  delete cleaned.$ref;

  // Ensure type is uppercase or standard string compatible
  if (cleaned.type) {
    if (typeof cleaned.type === 'string') {
      cleaned.type = cleaned.type.toLowerCase();
    }
  }

  // Recurse into properties
  if (cleaned.properties && typeof cleaned.properties === 'object') {
    const cleanedProps = {};
    for (const [k, v] of Object.entries(cleaned.properties)) {
      cleanedProps[k] = cleanSchemaForGemini(v);
    }
    cleaned.properties = cleanedProps;
  }

  // Recurse into array items
  if (cleaned.items) {
    if (Array.isArray(cleaned.items)) {
      cleaned.items = cleaned.items.map(cleanSchemaForGemini);
    } else {
      cleaned.items = cleanSchemaForGemini(cleaned.items);
    }
  }

  return cleaned;
}

/**
 * Converts a Zod schema or raw JSON Schema to a Gemini responseSchema configuration.
 *
 * @param {any} schema Zod schema instance or raw JSON schema
 * @returns {object} Cleaned responseSchema
 */
export function toGeminiResponseSchema(schema) {
  if (!schema) {
    return { type: 'object', properties: {} };
  }

  // If Zod schema
  if (
    schema._def ||
    (typeof schema.parse === 'function' && typeof schema.safeParse === 'function')
  ) {
    const jsonSchema = zodToJsonSchema(schema, {
      $refStrategy: 'none',
      target: 'jsonSchema7',
    });
    return cleanSchemaForGemini(jsonSchema);
  }

  // If already JSON Schema object
  if (schema.type && typeof schema.type === 'string') {
    return cleanSchemaForGemini(schema);
  }

  return { type: 'object', properties: {} };
}

/**
 * Converts an MCP Tool Definition to a Gemini FunctionDeclaration.
 *
 * @param {object} mcpToolDef Validated McpToolDefinition
 * @returns {object} Gemini FunctionDeclaration object
 */
export function toGeminiFunctionDeclaration(mcpToolDef) {
  const parameters = toGeminiResponseSchema(mcpToolDef.inputSchema);
  return {
    name: mcpToolDef.name,
    description: mcpToolDef.description || `Tool ${mcpToolDef.name}`,
    parameters,
  };
}

/**
 * Converts an array of MCP Tool Definitions to a Gemini Tools array.
 *
 * @param {Array<object>} mcpToolDefs Array of McpToolDefinitions
 * @returns {Array<object>} Array of Gemini tool configurations
 */
export function toGeminiTools(mcpToolDefs = []) {
  if (!Array.isArray(mcpToolDefs) || mcpToolDefs.length === 0) {
    return [];
  }

  const declarations = mcpToolDefs.map(toGeminiFunctionDeclaration);
  return [
    {
      functionDeclarations: declarations,
    },
  ];
}
