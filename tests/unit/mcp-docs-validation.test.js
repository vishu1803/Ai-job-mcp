/**
 * @file Unit Test for Gemini MCP Integration Documentation Validation (P8-005)
 *
 * Verifies that:
 * 1. Documented tool names in `docs/gemini-enterprise-mcp-integration.md` match the real implementation.
 * 2. Documented scopes match the token service scope ceilings.
 * 3. Zero real credentials, tokens, or private keys exist in documentation files.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CAREER_READ_TOOL_DEFINITIONS } from '../../src/domain/mcp/career-read-tools.schemas.js';
import { CAREER_ARTIFACT_TOOL_DEFINITIONS } from '../../src/domain/mcp/career-artifact-tools.schemas.js';
import { ROLE_SCOPE_CEILINGS } from '../../src/services/mcp-api-token.service.js';

describe('Gemini MCP Integration Documentation Validation (P8-005)', () => {
  const docPath = path.resolve(process.cwd(), 'docs', 'gemini-enterprise-mcp-integration.md');
  const archDocPath = path.resolve(
    process.cwd(),
    'docs',
    'gemini-enterprise-mcp-integration-architecture.md'
  );

  it('1. documentation files exist and are non-empty', () => {
    assert.ok(fs.existsSync(docPath), 'Integration guide must exist');
    assert.ok(fs.existsSync(archDocPath), 'Architecture doc must exist');

    const content = fs.readFileSync(docPath, 'utf8');
    assert.ok(content.length > 2000, 'Documentation must contain comprehensive content');
  });

  it('2. all 7 active MCP tools are documented accurately', () => {
    const content = fs.readFileSync(docPath, 'utf8');

    const expectedTools = [
      ...Object.keys(CAREER_READ_TOOL_DEFINITIONS),
      ...Object.keys(CAREER_ARTIFACT_TOOL_DEFINITIONS),
    ];

    assert.strictEqual(expectedTools.length, 7);

    for (const toolName of expectedTools) {
      assert.ok(
        content.includes(toolName),
        `Document must reference implemented tool "${toolName}"`
      );
    }
  });

  it('3. documented token scopes match the implementation scope ceilings', () => {
    const content = fs.readFileSync(docPath, 'utf8');

    const allScopes = new Set();
    Object.values(ROLE_SCOPE_CEILINGS).forEach((scopes) => {
      scopes.forEach((s) => allScopes.add(s));
    });

    for (const scope of allScopes) {
      assert.ok(content.includes(scope), `Document must reference valid scope "${scope}"`);
    }
  });

  it('4. zero raw secrets, private keys, or real API tokens exist in documentation', () => {
    const docFiles = [docPath, archDocPath];

    for (const file of docFiles) {
      const content = fs.readFileSync(file, 'utf8');

      // Assert no unmasked private keys
      assert.ok(!content.includes('BEGIN PRIVATE KEY'), 'No real private keys allowed in docs');
      assert.ok(!content.includes('BEGIN RSA PRIVATE KEY'), 'No real RSA keys allowed in docs');

      // Assert no actual live tokens (should use <YOUR_TOKEN> or synthetic test hex)
      const matches = content.match(/mcp_live_[0-9a-fA-F]{64}/g);
      assert.strictEqual(matches, null, 'Documentation must not contain real 64-char live tokens');
    }
  });

  it('5. canonical MCP endpoint format is documented correctly', () => {
    const content = fs.readFileSync(docPath, 'utf8');
    assert.ok(content.includes('/mcp'), 'Document must specify /mcp endpoint');
    assert.ok(content.includes('POST'), 'Document must specify POST method for Streamable HTTP');
    assert.ok(
      content.includes('Authorization: Bearer'),
      'Document must specify Bearer authorization'
    );
  });
});
