/**
 * @file Unit Test Suite for MCP Registry Metadata & Validation (P13.5-005).
 *
 * Verifies:
 * 1. Root server.json and src/mcp/registry/server.json pass official ServerDetail schema validation.
 * 2. Mandatory metadata fields conform strictly to registry.modelcontextprotocol.io.
 * 3. Remote transport structure uses remotes: [{ type: "streamable-http", url: "..." }].
 * 4. Namespace format, semantic versioning, and HTTPS transport URLs.
 * 5. Extension metadata is properly placed under _meta.
 * 6. Public staging prerequisite (BLOCKED UNTIL PUBLIC STAGING) is documented.
 * 7. Zero secret leakage across all metadata fields.
 * 8. Rejection of invalid manifests, malformed versions, and credential injections.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  validateRegistryManifest,
  loadAndValidateRegistryManifest,
} from '../../src/mcp/registry/registry-validator.js';

describe('MCP Registry Metadata & Validator (Official Schema 2025-12-11 / P13.5-005)', () => {
  it('should validate root server.json successfully against official schema', () => {
    const rootPath = path.resolve(process.cwd(), 'server.json');
    const result = loadAndValidateRegistryManifest(rootPath);

    assert.equal(result.valid, true, `Validation errors: ${result.errors?.join(', ')}`);
    assert.ok(result.manifest);
    assert.equal(result.manifest.name, 'ai.careerhub/mcp-server');
    assert.equal(result.manifest.title, 'AI Careers Hub');
    assert.equal(result.manifest.version, '0.1.0');
    assert.ok(result.manifest.description.length <= 100, 'Description must be <= 100 chars');
    assert.equal(result.manifest.websiteUrl, 'https://staging.careerhub.ai');
    assert.equal(result.manifest.repository?.source, 'github');
    assert.equal(result.manifest.repository?.url, 'https://github.com/vishu1803/ai-career-agent');

    assert.ok(Array.isArray(result.manifest.remotes));
    assert.equal(result.manifest.remotes[0].type, 'streamable-http');
    assert.equal(result.manifest.remotes[0].url, 'https://staging.careerhub.ai/mcp');

    // Extension & publication metadata in _meta
    assert.equal(
      result.manifest._meta?.['io.modelcontextprotocol/ui']?.resources[0],
      'ui://career-hub/job-fit-radar/v1'
    );
    assert.equal(
      result.manifest._meta?.['ai.careerhub/publication']?.status,
      'BLOCKED UNTIL PUBLIC STAGING'
    );
  });

  it('should validate src/mcp/registry/server.json successfully', () => {
    const pkgPath = path.resolve(process.cwd(), 'src/mcp/registry/server.json');
    const result = loadAndValidateRegistryManifest(pkgPath);

    assert.equal(result.valid, true, `Validation errors: ${result.errors?.join(', ')}`);
    assert.ok(result.manifest);
    assert.equal(result.manifest.name, 'ai.careerhub/mcp-server');
  });

  it('should declare io.modelcontextprotocol/ui extension in _meta', () => {
    const rootPath = path.resolve(process.cwd(), 'server.json');
    const result = loadAndValidateRegistryManifest(rootPath);

    assert.equal(result.valid, true);
    const uiExtension = result.manifest._meta?.['io.modelcontextprotocol/ui'];
    assert.ok(uiExtension, 'Must declare io.modelcontextprotocol/ui extension in _meta');
    assert.equal(uiExtension.version, '1.0.0');
    assert.deepEqual(uiExtension.resources, ['ui://career-hub/job-fit-radar/v1']);
  });

  it('should reject manifest with malformed namespace format', () => {
    const invalidManifest = {
      $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
      name: 'Invalid_Namespace', // Missing slash namespace
      title: 'Test Server',
      description: 'A test server description.',
      version: '1.0.0',
      websiteUrl: 'https://example.com',
      repository: { source: 'github', url: 'https://github.com/example/repo' },
      remotes: [{ type: 'streamable-http', url: 'https://example.com/mcp' }],
    };

    const result = validateRegistryManifest(invalidManifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Name must follow reverse-DNS')));
  });

  it('should reject manifest with non-semver version', () => {
    const invalidManifest = {
      $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
      name: 'test/server',
      title: 'Test Server',
      description: 'A test server description.',
      version: 'v1-beta', // Not valid semver
      websiteUrl: 'https://example.com',
      repository: { source: 'github', url: 'https://github.com/example/repo' },
      remotes: [{ type: 'streamable-http', url: 'https://example.com/mcp' }],
    };

    const result = validateRegistryManifest(invalidManifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('semantic versioning')));
  });

  it('should reject manifest containing leaked API key or secret token', () => {
    const secretLeakingManifest = {
      $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
      name: 'test/server',
      title: 'Test Server',
      description: 'Secret token: sk-live-123456789012345678901234', // Leaked OpenAI key pattern
      version: '1.0.0',
      websiteUrl: 'https://example.com',
      repository: { source: 'github', url: 'https://github.com/example/repo' },
      remotes: [{ type: 'streamable-http', url: 'https://example.com/mcp' }],
    };

    const result = validateRegistryManifest(secretLeakingManifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Security violation')));
  });

  it('should reject manifest with non-https remote transport URL', () => {
    const insecureTransportManifest = {
      $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
      name: 'test/server',
      title: 'Test Server',
      description: 'A test server description.',
      version: '1.0.0',
      websiteUrl: 'https://example.com',
      repository: { source: 'github', url: 'https://github.com/example/repo' },
      remotes: [{ type: 'streamable-http', url: 'http://insecure-remote-site.com/mcp' }],
    };

    const result = validateRegistryManifest(insecureTransportManifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('HTTPS for non-localhost')));
  });

  it('should reject manifest when description exceeds 100 characters', () => {
    const longDescManifest = {
      $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
      name: 'test/server',
      title: 'Test Server',
      description:
        'This is an excessively long description that exceeds the maximum length of one hundred characters allowed by the schema.',
      version: '1.0.0',
      websiteUrl: 'https://example.com',
      repository: { source: 'github', url: 'https://github.com/example/repo' },
      remotes: [{ type: 'streamable-http', url: 'https://example.com/mcp' }],
    };

    const result = validateRegistryManifest(longDescManifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('description')));
  });

  it('should reject manifest with unrecognized root properties', () => {
    const invalidRootPropManifest = {
      $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
      name: 'test/server',
      title: 'Test Server',
      description: 'A test server description.',
      version: '1.0.0',
      websiteUrl: 'https://example.com',
      repository: { source: 'github', url: 'https://github.com/example/repo' },
      remotes: [{ type: 'streamable-http', url: 'https://example.com/mcp' }],
      unrecognizedField: 'invalid', // Not allowed at root
    };

    const result = validateRegistryManifest(invalidRootPropManifest);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes('unrecognizedField') || e.includes('unrecognized'))
    );
  });
});
