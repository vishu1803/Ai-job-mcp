/**
 * @file Unit Test Suite for MCP Registry Metadata & Validation (P13.5-005).
 *
 * Verifies:
 * 1. Root server.json and src/mcp/registry/server.json pass schema validation.
 * 2. Mandatory metadata fields conform to official MCP Registry specification.
 * 3. Namespace format, semantic versioning, and HTTPS transport URLs.
 * 4. Zero secret leakage across all metadata fields.
 * 5. Rejection of invalid manifests, malformed versions, and credential injections.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  validateRegistryManifest,
  loadAndValidateRegistryManifest,
} from '../../src/mcp/registry/registry-validator.js';

describe('MCP Registry Metadata & Validator (P13.5-005)', () => {
  it('should validate root server.json successfully', () => {
    const rootPath = path.resolve(process.cwd(), 'server.json');
    const result = loadAndValidateRegistryManifest(rootPath);

    assert.equal(result.valid, true, `Validation errors: ${result.errors?.join(', ')}`);
    assert.ok(result.manifest);
    assert.equal(result.manifest.name, 'ai.careerhub/mcp-server');
    assert.equal(result.manifest.title, 'Antigravity Career Hub');
    assert.equal(result.manifest.version, '0.1.0');
    assert.equal(result.manifest.transport.type, 'http');
    assert.equal(result.manifest.transport.protocolVersion, '2026-07-28');
    assert.equal(result.manifest.authentication.type, 'oauth2');
    assert.equal(result.manifest.status, 'PLANNED / NOT PUBLISHED');
  });

  it('should validate src/mcp/registry/server.json successfully', () => {
    const pkgPath = path.resolve(process.cwd(), 'src/mcp/registry/server.json');
    const result = loadAndValidateRegistryManifest(pkgPath);

    assert.equal(result.valid, true, `Validation errors: ${result.errors?.join(', ')}`);
    assert.ok(result.manifest);
    assert.equal(result.manifest.name, 'ai.careerhub/mcp-server');
  });

  it('should declare io.modelcontextprotocol/ui extension in capabilities', () => {
    const rootPath = path.resolve(process.cwd(), 'server.json');
    const result = loadAndValidateRegistryManifest(rootPath);

    assert.equal(result.valid, true);
    const uiExtension = result.manifest.capabilities.extensions?.['io.modelcontextprotocol/ui'];
    assert.ok(uiExtension, 'Must declare io.modelcontextprotocol/ui extension');
    assert.equal(uiExtension.version, '1.0.0');
    assert.deepEqual(uiExtension.resources, ['ui://career-hub/job-fit-radar/v1']);
  });

  it('should reject manifest with malformed namespace format', () => {
    const invalidManifest = {
      $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
      name: 'Invalid_Namespace', // Missing slash namespace
      title: 'Test Server',
      description: 'A test server description that is long enough.',
      version: '1.0.0',
      homepage: 'https://example.com',
      documentation: 'https://example.com/docs',
      repository: { type: 'git', url: 'https://github.com/example/repo' },
      license: 'MIT',
      categories: ['developer-tools'],
      transport: { type: 'http', url: 'https://example.com/mcp', protocolVersion: '2026-07-28' },
      authentication: { type: 'oauth2', authorizationUrl: 'https://example.com/oauth' },
      capabilities: { tools: true, resources: true, prompts: true },
      status: 'PLANNED / NOT PUBLISHED',
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
      description: 'A test server description that is long enough.',
      version: 'v1-beta', // Not valid semver
      homepage: 'https://example.com',
      documentation: 'https://example.com/docs',
      repository: { type: 'git', url: 'https://github.com/example/repo' },
      license: 'MIT',
      categories: ['developer-tools'],
      transport: { type: 'http', url: 'https://example.com/mcp', protocolVersion: '2026-07-28' },
      authentication: { type: 'oauth2', authorizationUrl: 'https://example.com/oauth' },
      capabilities: { tools: true, resources: true, prompts: true },
      status: 'PLANNED / NOT PUBLISHED',
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
      homepage: 'https://example.com',
      documentation: 'https://example.com/docs',
      repository: { type: 'git', url: 'https://github.com/example/repo' },
      license: 'MIT',
      categories: ['developer-tools'],
      transport: { type: 'http', url: 'https://example.com/mcp', protocolVersion: '2026-07-28' },
      authentication: { type: 'oauth2', authorizationUrl: 'https://example.com/oauth' },
      capabilities: { tools: true, resources: true, prompts: true },
      status: 'PLANNED / NOT PUBLISHED',
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
      description: 'A test server description that is long enough.',
      version: '1.0.0',
      homepage: 'https://example.com',
      documentation: 'https://example.com/docs',
      repository: { type: 'git', url: 'https://github.com/example/repo' },
      license: 'MIT',
      categories: ['developer-tools'],
      transport: {
        type: 'http',
        url: 'http://insecure-remote-site.com/mcp',
        protocolVersion: '2026-07-28',
      },
      authentication: { type: 'oauth2', authorizationUrl: 'https://example.com/oauth' },
      capabilities: { tools: true, resources: true, prompts: true },
      status: 'PLANNED / NOT PUBLISHED',
    };

    const result = validateRegistryManifest(insecureTransportManifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('HTTPS for non-localhost')));
  });
});
