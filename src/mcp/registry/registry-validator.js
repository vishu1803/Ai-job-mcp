/**
 * @file MCP Registry Metadata Validator.
 *
 * Implements strict schema validation and security assertion for server.json
 * conforming strictly to the official Model Context Protocol Registry ServerDetail schema
 * (https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json).
 */

import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Zod schema defining the official RemoteTransport object.
 */
export const RemoteTransportSchema = z
  .object({
    type: z.enum(['streamable-http', 'sse']),
    url: z
      .string()
      .regex(
        /^(https?:\/\/[^\s]+|\{[a-zA-Z_][a-zA-Z0-9_]*\}[^\s]*)$/,
        'Must be a valid HTTP/HTTPS URL'
      ),
    headers: z
      .array(
        z.object({
          name: z.string(),
          value: z.string().optional(),
        })
      )
      .optional(),
    variables: z.record(z.any()).optional(),
  })
  .strict();

/**
 * Zod schema defining the official Repository metadata object.
 */
export const RepositorySchema = z
  .object({
    url: z.string().url(),
    source: z.string().min(1),
    id: z.string().optional(),
    subfolder: z.string().optional(),
  })
  .strict();

/**
 * Zod schema defining the official MCP Registry ServerDetail manifest format.
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
      .max(200)
      .regex(
        /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/,
        'Name must follow reverse-DNS or scoped namespace format (e.g. "namespace/server-name")'
      ),
    title: z.string().min(1).max(100).optional(),
    description: z.string().min(1).max(100),
    version: z
      .string()
      .regex(
        /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/,
        'Version must follow semantic versioning (SemVer 2.0.0)'
      ),
    websiteUrl: z.string().url().optional(),
    repository: RepositorySchema.optional(),
    remotes: z.array(RemoteTransportSchema).min(1).optional(),
    packages: z.array(z.record(z.any())).optional(),
    icons: z
      .array(
        z.object({
          src: z.string().url(),
          mimeType: z
            .enum(['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'])
            .optional(),
          sizes: z.array(z.string()).optional(),
          theme: z.enum(['light', 'dark']).optional(),
        })
      )
      .optional(),
    _meta: z.record(z.any()).optional(),
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

  // 1. Zod schema validation against official ServerDetail schema
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
  if (manifest.remotes) {
    for (const remote of manifest.remotes) {
      if (remote.url && !remote.url.startsWith('{')) {
        try {
          const parsed = new URL(remote.url);
          if (
            parsed.protocol !== 'https:' &&
            parsed.hostname !== 'localhost' &&
            parsed.hostname !== '127.0.0.1'
          ) {
            errors.push(
              `Remote transport URL "${remote.url}" must use HTTPS for non-localhost endpoints.`
            );
          }
        } catch {
          errors.push(`Invalid URL format: "${remote.url}"`);
        }
      }
    }
  }

  // 4. Extensions check inside _meta
  const uiExt = manifest._meta?.['io.modelcontextprotocol/ui'];
  if (uiExt && Array.isArray(uiExt.resources)) {
    for (const uri of uiExt.resources) {
      if (typeof uri !== 'string' || !uri.startsWith('ui://')) {
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
