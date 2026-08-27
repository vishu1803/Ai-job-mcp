/**
 * @file MCP Registry Metadata Validator.
 *
 * Implements strict schema validation and security assertion for server.json
 * conforming to the official Model Context Protocol Registry specification
 * (https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json).
 */

import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Zod schema defining the official MCP Registry manifest format.
 */
export const McpRegistryManifestSchema = z
  .object({
    $schema: z
      .string()
      .url()
      .refine(
        (url) => url.includes('modelcontextprotocol.io/schemas/'),
        'Must point to official modelcontextprotocol.io schema'
      ),
    name: z
      .string()
      .min(3)
      .max(128)
      .regex(
        /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/,
        'Name must follow reverse-DNS or scoped namespace format (e.g. "namespace/server-name")'
      ),
    title: z.string().min(2).max(128),
    description: z.string().min(10).max(2000),
    version: z
      .string()
      .regex(
        /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/,
        'Version must follow semantic versioning (SemVer 2.0.0)'
      ),
    homepage: z.string().url(),
    documentation: z.string().url(),
    repository: z
      .object({
        type: z.literal('git'),
        url: z.string().url(),
      })
      .strict(),
    license: z.string().min(1).max(64),
    categories: z.array(z.string()).min(1).default(['developer-tools']),
    icons: z
      .array(
        z.object({
          src: z.string().url(),
          mimeType: z.string(),
          sizes: z.string().optional(),
        })
      )
      .optional(),
    transport: z
      .object({
        type: z.enum(['http', 'stdio']),
        url: z.string().url().optional(),
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        protocolVersion: z.string().default('2026-07-28'),
      })
      .strict()
      .refine(
        (t) => (t.type === 'http' ? Boolean(t.url) : Boolean(t.command)),
        'HTTP transport requires url; stdio transport requires command'
      ),
    authentication: z
      .object({
        type: z.enum(['oauth2', 'bearer', 'none']),
        authorizationUrl: z.string().url().optional(),
        tokenUrl: z.string().url().optional(),
        discoveryUrl: z.string().url().optional(),
        scopes: z.record(z.string()).optional(),
      })
      .strict(),
    capabilities: z
      .object({
        tools: z.boolean().default(true),
        resources: z.boolean().default(true),
        prompts: z.boolean().default(true),
        extensions: z
          .object({
            'io.modelcontextprotocol/ui': z
              .object({
                version: z.string(),
                resources: z.array(z.string()).min(1),
              })
              .optional(),
          })
          .optional(),
      })
      .strict(),
    status: z.enum(['PLANNED / NOT PUBLISHED', 'PUBLISHED', 'DEPRECATED']),
    publicationPrerequisites: z.array(z.string()).optional(),
  })
  .strict();

/**
 * Secret patterns that MUST NEVER appear in public registry metadata.
 */
const FORBIDDEN_SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{20,}/i,
  /ghp_[a-zA-Z0-9]{20,}/i,
  /gho_[a-zA-Z0-9]{20,}/i,
  /ghs_[a-zA-Z0-9]{20,}/i,
  /mcp_[a-z]+_[a-f0-9]{32,}/i,
  /postgres(ql)?:\/\/[^:]+:[^@]+@/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /bearer\s+[a-zA-Z0-9._-]{20,}/i,
];

/**
 * Validates an MCP Registry manifest object against schema and security policies.
 *
 * @param {unknown} rawManifest Manifest object to validate
 * @returns {{ valid: boolean, manifest?: z.infer<typeof McpRegistryManifestSchema>, errors?: string[] }}
 */
export function validateRegistryManifest(rawManifest) {
  const errors = [];

  // 1. Zod schema validation
  const parseResult = McpRegistryManifestSchema.safeParse(rawManifest);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`);
    }
    return { valid: false, errors };
  }

  const manifest = parseResult.data;

  // 2. Secret leakage assertion across entire JSON string
  const serialized = JSON.stringify(manifest);
  for (const pattern of FORBIDDEN_SECRET_PATTERNS) {
    if (pattern.test(serialized)) {
      errors.push(`Security violation: Detected potential secret matching pattern ${pattern}`);
    }
  }

  // 3. Remote URL security: verify HTTPS in non-local domains
  if (manifest.transport.type === 'http' && manifest.transport.url) {
    const parsed = new URL(manifest.transport.url);
    if (
      parsed.protocol !== 'https:' &&
      parsed.hostname !== 'localhost' &&
      parsed.hostname !== '127.0.0.1'
    ) {
      errors.push('Remote transport URL must use HTTPS for non-localhost endpoints.');
    }
  }

  // 4. OAuth discovery validation
  if (manifest.authentication.type === 'oauth2') {
    if (!manifest.authentication.authorizationUrl && !manifest.authentication.discoveryUrl) {
      errors.push('OAuth2 authentication requires either authorizationUrl or discoveryUrl.');
    }
  }

  // 5. Extensions check
  if (manifest.capabilities.extensions?.['io.modelcontextprotocol/ui']) {
    const uiExt = manifest.capabilities.extensions['io.modelcontextprotocol/ui'];
    for (const uri of uiExt.resources) {
      if (!uri.startsWith('ui://')) {
        errors.push(`MCP App resource URI "${uri}" must begin with "ui://" scheme.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    manifest: errors.length === 0 ? manifest : undefined,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Loads a server.json file from disk and validates it.
 *
 * @param {string} [filePath] Absolute or relative file path (defaults to root server.json)
 * @returns {{ valid: boolean, manifest?: z.infer<typeof McpRegistryManifestSchema>, errors?: string[] }}
 */
export function loadAndValidateRegistryManifest(filePath) {
  const resolvedPath = filePath || path.resolve(process.cwd(), 'server.json');
  if (!fs.existsSync(resolvedPath)) {
    return {
      valid: false,
      errors: [`Registry manifest file not found at: ${resolvedPath}`],
    };
  }

  try {
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const parsed = JSON.parse(content);
    return validateRegistryManifest(parsed);
  } catch (err) {
    return {
      valid: false,
      errors: [`Failed to parse JSON from ${resolvedPath}: ${err.message}`],
    };
  }
}
