import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeAuditDetails,
  MAX_AUDIT_PAYLOAD_BYTES,
  PROHIBITED_KEYS,
} from '../../src/utils/audit-sanitizer.js';

describe('Audit Persistence Sanitizer (P1-004)', () => {
  test('1. Sanitizes safe audit details without modifying non-sensitive properties', () => {
    const input = {
      toolName: 'read_repository_tree',
      repoOwner: 'octocat',
      repoName: 'hello-world',
      branch: 'main',
      filesCount: 14,
      latencyMs: 124.5,
      status: 'SUCCESS',
    };

    const sanitized = sanitizeAuditDetails(input);
    assert.deepEqual(sanitized, input);
  });

  test('2. Strips prohibited credentials and secret keys from metadata', () => {
    const input = {
      action: 'MCP_TOOL_INVOCATION',
      toolName: 'confirm_and_create_pr',
      token: 'ghp_secret_access_token_12345',
      accessToken: 'mcp_live_0123456789abcdef',
      apiKey: 'sk-ant-api-03-secret',
      secret: 'super_secret_webhook_secret',
      clientSecret: 'github_oauth_client_secret',
      password: 'db_password_123',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...',
      authorization: 'Bearer secret_bearer_token',
      cookie: 'session_id=abcdef123456',
      safeParam: 'public-value',
    };

    const sanitized = sanitizeAuditDetails(input);

    assert.equal(sanitized.token, undefined);
    assert.equal(sanitized.accessToken, undefined);
    assert.equal(sanitized.apiKey, undefined);
    assert.equal(sanitized.secret, undefined);
    assert.equal(sanitized.clientSecret, undefined);
    assert.equal(sanitized.password, undefined);
    assert.equal(sanitized.privateKey, undefined);
    assert.equal(sanitized.authorization, undefined);
    assert.equal(sanitized.cookie, undefined);
    assert.equal(sanitized.safeParam, 'public-value');
    assert.equal(sanitized.action, 'MCP_TOOL_INVOCATION');
  });

  test('3. Strips nested sensitive tokens, code excerpts, and resumes', () => {
    const input = {
      operation: 'PARSE_RESUME',
      candidate: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        resume: 'Complete raw resume text with sensitive personal info...',
        sourceCode: 'def execute_secret(): pass',
        ssn: '000-12-3456',
        nestedData: {
          sessionSecret: 'my_session_secret',
          encryptionKey: '256_bit_aes_key',
          validTag: 'frontend-lead',
        },
      },
    };

    const sanitized = sanitizeAuditDetails(input);

    assert.equal(sanitized.candidate.id, '123e4567-e89b-12d3-a456-426614174000');
    assert.equal(sanitized.candidate.resume, undefined);
    assert.equal(sanitized.candidate.sourceCode, undefined);
    assert.equal(sanitized.candidate.ssn, undefined);
    assert.equal(sanitized.candidate.nestedData.sessionSecret, undefined);
    assert.equal(sanitized.candidate.nestedData.encryptionKey, undefined);
    assert.equal(sanitized.candidate.nestedData.validTag, 'frontend-lead');
  });

  test('4. Enforces maximum audit payload size limit (16 KB) and rejects oversized payloads', () => {
    const hugeString = 'a'.repeat(MAX_AUDIT_PAYLOAD_BYTES + 100);
    const oversizedInput = {
      data: hugeString,
    };

    assert.throws(
      () => sanitizeAuditDetails(oversizedInput),
      /Audit payload exceeds maximum permitted size of 16 KB/
    );
  });

  test('5. Rejects invalid non-object inputs', () => {
    assert.throws(() => sanitizeAuditDetails(/** @type {any} */ ('invalid-string')), TypeError);
    assert.throws(() => sanitizeAuditDetails(/** @type {any} */ ([1, 2, 3])), TypeError);
    assert.throws(() => sanitizeAuditDetails(/** @type {any} */ (null)), TypeError);
  });

  test('6. PROHIBITED_KEYS set contains all mandatory security and credential terms', () => {
    const mandatoryKeys = [
      'token',
      'accesstoken',
      'refreshtoken',
      'apikey',
      'secret',
      'clientsecret',
      'password',
      'privatekey',
      'authorization',
      'cookie',
      'resume',
      'sourcecode',
      'ssn',
    ];

    for (const key of mandatoryKeys) {
      assert.ok(PROHIBITED_KEYS.has(key), `PROHIBITED_KEYS must contain ${key}`);
    }
  });
});
