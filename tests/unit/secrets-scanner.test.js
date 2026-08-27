/**
 * @file Unit Tests for High-Performance Secrets Scanner.
 *
 * Verifies that the secrets scanner accurately detects synthetic secret patterns,
 * enforces strict output redaction, and correctly handles synthetic fixture allowlists.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scanContent, redactSecret } from '../../scripts/scan-secrets.js';

describe('Security: Secrets Scanner Core Unit Tests', () => {
  it('should redact secrets without exposing full plaintext', () => {
    const rawSecret = 'ghp_super_secret_token_1234567890abcdef1234';
    const redacted = redactSecret(rawSecret);

    assert.ok(!redacted.includes('super_secret_token'));
    assert.ok(redacted.startsWith('ghp_'));
    assert.ok(redacted.includes('[REDACTED_LENGTH_'));
  });

  it('should detect synthetic GitHub Personal Access Token pattern', () => {
    // Construct synthetic non-whitelisted token
    const syntheticToken = ['ghp', '999999999999999999999999999999999999'].join('_');
    const content = `const token = "${syntheticToken}";`;
    const findings = scanContent(content, 'src/api.js', true);

    assert.equal(findings.length, 1);
    assert.equal(findings[0].id, 'GITHUB_PAT');
    assert.equal(findings[0].severity, 'CRITICAL');
    assert.ok(!findings[0].redacted.includes(syntheticToken));
  });

  it('should detect synthetic Google API Key pattern', () => {
    const syntheticKey = 'AIzaSy' + '9'.repeat(33);
    const content = `const apiKey = "${syntheticKey}";`;
    const findings = scanContent(content, 'src/config.js', true);

    assert.equal(findings.length, 1);
    assert.equal(findings[0].id, 'GOOGLE_API_KEY');
    assert.equal(findings[0].severity, 'HIGH');
    assert.ok(!findings[0].redacted.includes(syntheticKey));
  });

  it('should detect synthetic Personal MCP API Token pattern', () => {
    const syntheticMcpToken = 'mcp_live_' + '9'.repeat(48);
    const content = `const header = "Bearer ${syntheticMcpToken}";`;
    const findings = scanContent(content, 'src/mcp.js', true);

    assert.equal(findings.length, 1);
    assert.equal(findings[0].id, 'MCP_TOKEN');
    assert.equal(findings[0].severity, 'HIGH');
  });

  it('should detect synthetic Private RSA Key PEM header', () => {
    const syntheticPem = '-----BEGIN RSA PRIVATE KEY-----\n' + 'MIIEowIBAAKCAQEA' + '9'.repeat(64);
    const findings = scanContent(syntheticPem, 'src/auth.js', true);

    assert.equal(findings.length, 1);
    assert.equal(findings[0].id, 'PRIVATE_KEY_PEM');
    assert.equal(findings[0].severity, 'CRITICAL');
  });

  it('should detect database connection strings containing non-standard passwords', () => {
    const syntheticDbUri =
      'postgres://prod_user:secret_prod_pass_99999@db.production.internal:5432/career_hub';
    const content = `DATABASE_URL="${syntheticDbUri}"`;
    const findings = scanContent(content, 'src/db.js', true);

    assert.equal(findings.length, 1);
    assert.equal(findings[0].id, 'DATABASE_PASSWORD_URI');
    assert.equal(findings[0].severity, 'CRITICAL');
  });

  it('should detect synthetic AWS Access Key IDs', () => {
    const syntheticAwsKey = 'AKIA' + '9'.repeat(16);
    const content = `AWS_ACCESS_KEY_ID="${syntheticAwsKey}"`;
    const findings = scanContent(content, 'src/aws.js', true);

    assert.equal(findings.length, 1);
    assert.equal(findings[0].id, 'AWS_ACCESS_KEY');
    assert.equal(findings[0].severity, 'HIGH');
  });

  it('should ignore safe universal placeholders in standard mode', () => {
    const safeContent = `
      GITHUB_CLIENT_ID=placeholder_github_oauth_client_id
      DATABASE_URL=postgres://postgres:postgres@localhost:5432/career_hub_dev
      ENCRYPTION_MASTER_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
      AUTH_SECRET=super_secret_session_signing_key_change_me_in_production_32chars
    `;
    const findings = scanContent(safeContent, '.env.example', false);
    assert.equal(findings.length, 0);
  });
});
