/**
 * @file Unit Tests for GitHub Webhook Signature Verification (Task P3-003)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import {
  verifyWebhookSignature,
  generateWebhookSignature,
} from '../../src/security/webhook-signature.js';

describe('GitHub Webhook Signature Verification Unit Tests (P3-003)', () => {
  const testSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const testPayload = JSON.stringify({
    action: 'deleted',
    installation: { id: 12345678 },
  });

  test('1. Valid signature verifies successfully with Buffer and string payloads', () => {
    const rawBuffer = Buffer.from(testPayload, 'utf8');
    const validSignature = generateWebhookSignature(rawBuffer, testSecret);

    assert.equal(
      verifyWebhookSignature(rawBuffer, validSignature, testSecret),
      true,
      'Buffer payload with valid signature must return true'
    );

    assert.equal(
      verifyWebhookSignature(testPayload, validSignature, testSecret),
      true,
      'String payload with valid signature must return true'
    );
  });

  test('2. Rejects missing or empty X-Hub-Signature-256 header with 401', () => {
    assert.throws(
      () => verifyWebhookSignature(testPayload, null, testSecret),
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, 'MISSING_WEBHOOK_SIGNATURE');
        return true;
      }
    );

    assert.throws(
      () => verifyWebhookSignature(testPayload, '', testSecret),
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, 'MISSING_WEBHOOK_SIGNATURE');
        return true;
      }
    );
  });

  test('3. Rejects malformed signature header formats with 401', () => {
    // Missing sha256= prefix
    assert.throws(
      () =>
        verifyWebhookSignature(
          testPayload,
          'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
          testSecret
        ),
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, 'INVALID_WEBHOOK_SIGNATURE');
        return true;
      }
    );

    // Invalid hex length (< 64 chars)
    assert.throws(
      () => verifyWebhookSignature(testPayload, 'sha256=shorthex', testSecret),
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, 'INVALID_WEBHOOK_SIGNATURE');
        return true;
      }
    );

    // Non-hex characters
    assert.throws(
      () =>
        verifyWebhookSignature(
          testPayload,
          'sha256=zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
          testSecret
        ),
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, 'INVALID_WEBHOOK_SIGNATURE');
        return true;
      }
    );
  });

  test('4. Rejects tampered payload body with 401', () => {
    const validSignature = generateWebhookSignature(testPayload, testSecret);
    const tamperedPayload = JSON.stringify({
      action: 'deleted',
      installation: { id: 99999999 }, // Tampered ID
    });

    assert.throws(
      () => verifyWebhookSignature(tamperedPayload, validSignature, testSecret),
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, 'INVALID_WEBHOOK_SIGNATURE');
        return true;
      }
    );
  });

  test('5. Rejects signature generated with incorrect secret with 401', () => {
    const wrongSecret = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
    const signatureFromWrongSecret = generateWebhookSignature(testPayload, wrongSecret);

    assert.throws(
      () => verifyWebhookSignature(testPayload, signatureFromWrongSecret, testSecret),
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, 'INVALID_WEBHOOK_SIGNATURE');
        return true;
      }
    );
  });

  test('6. Throws 500 when server webhook secret is missing or unconfigured', () => {
    const validSignature = generateWebhookSignature(testPayload, testSecret);

    assert.throws(
      () => verifyWebhookSignature(testPayload, validSignature, null),
      (err) => {
        assert.equal(err.statusCode, 500);
        assert.equal(err.code, 'MISSING_WEBHOOK_SECRET');
        return true;
      }
    );

    assert.throws(
      () => verifyWebhookSignature(testPayload, validSignature, ''),
      (err) => {
        assert.equal(err.statusCode, 500);
        assert.equal(err.code, 'MISSING_WEBHOOK_SECRET');
        return true;
      }
    );
  });

  test('7. Handles Unicode characters and whitespace deterministically', () => {
    const unicodePayload = JSON.stringify({
      repository: 'octocat/🚀-app',
      commit_msg: 'Fix bug 🐛 with emoji',
    });

    const signature = generateWebhookSignature(unicodePayload, testSecret);
    assert.equal(
      verifyWebhookSignature(unicodePayload, signature, testSecret),
      true,
      'Unicode payload signature must verify successfully'
    );
  });
});
