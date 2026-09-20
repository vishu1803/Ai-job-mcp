/**
 * @file CSRF Token Generation & Validation Unit Tests.
 *
 * Verifies:
 * 1. Cryptographically secure random token generation (OWASP HMAC-based pattern)
 * 2. Token format: 64-char hex nonce + '.' + 64-char hex signature
 * 3. Constant-time validation using timingSafeEqual
 * 4. Session binding: token for Session A fails on Session B
 * 5. Tamper resistance: modified nonce or signature is rejected
 * 6. Edge cases: null, undefined, malformed, non-hex tokens safely handled
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { generateCsrfToken, validateCsrfToken } from '../../src/security/session.service.js';

describe('CSRF Token Security & Cryptographic Session Binding', () => {
  const sessionIdA = crypto.randomBytes(32).toString('hex');
  const sessionIdB = crypto.randomBytes(32).toString('hex');
  const secretKey = 'test-secret-key-12345678901234567890';

  it('1. Generates a cryptographically random, session-bound CSRF token', () => {
    const token = generateCsrfToken(sessionIdA, secretKey);
    assert.equal(typeof token, 'string');

    const parts = token.split('.');
    assert.equal(parts.length, 2, 'Token must consist of nonce.signature');
    assert.equal(parts[0].length, 64, 'Nonce must be 64-character hex (32 bytes)');
    assert.equal(parts[1].length, 64, 'Signature must be 64-character hex (SHA-256)');
  });

  it('2. Generates unique tokens across multiple calls for same session (random nonces)', () => {
    const token1 = generateCsrfToken(sessionIdA, secretKey);
    const token2 = generateCsrfToken(sessionIdA, secretKey);

    assert.notEqual(token1, token2, 'Each generated token must have a unique random nonce');
    assert.equal(validateCsrfToken(sessionIdA, token1, secretKey), true);
    assert.equal(validateCsrfToken(sessionIdA, token2, secretKey), true);
  });

  it('3. Accepts session object containing .id property', () => {
    const sessionObj = { id: sessionIdA, userId: 'user-123' };
    const token = generateCsrfToken(sessionObj, secretKey);

    assert.equal(validateCsrfToken(sessionObj, token, secretKey), true);
    assert.equal(validateCsrfToken(sessionIdA, token, secretKey), true);
  });

  it('4. Rejects token validated against a different session (cross-session CSRF)', () => {
    const tokenForA = generateCsrfToken(sessionIdA, secretKey);
    const isValidForB = validateCsrfToken(sessionIdB, tokenForA, secretKey);

    assert.equal(isValidForB, false, 'Token for Session A must not validate for Session B');
  });

  it('5. Rejects tampered nonce', () => {
    const token = generateCsrfToken(sessionIdA, secretKey);
    const [nonce, signature] = token.split('.');
    // Flip first character of nonce
    const tamperedNonce = (nonce[0] === 'a' ? 'b' : 'a') + nonce.slice(1);
    const tamperedToken = `${tamperedNonce}.${signature}`;

    assert.equal(validateCsrfToken(sessionIdA, tamperedToken, secretKey), false);
  });

  it('6. Rejects tampered signature', () => {
    const token = generateCsrfToken(sessionIdA, secretKey);
    const [nonce, signature] = token.split('.');
    // Flip last character of signature
    const tamperedSig = signature.slice(0, -1) + (signature.slice(-1) === 'a' ? 'b' : 'a');
    const tamperedToken = `${nonce}.${tamperedSig}`;

    assert.equal(validateCsrfToken(sessionIdA, tamperedToken, secretKey), false);
  });

  it('7. Rejects token with wrong secret key', () => {
    const token = generateCsrfToken(sessionIdA, secretKey);
    const wrongKey = 'different-secret-key-9999999999999';

    assert.equal(validateCsrfToken(sessionIdA, token, wrongKey), false);
  });

  it('8. Safely rejects malformed, empty, or invalid input without throwing', () => {
    assert.equal(validateCsrfToken(sessionIdA, null), false);
    assert.equal(validateCsrfToken(sessionIdA, undefined), false);
    assert.equal(validateCsrfToken(sessionIdA, ''), false);
    assert.equal(validateCsrfToken(sessionIdA, 'invalid-token-without-dot'), false);
    assert.equal(validateCsrfToken(sessionIdA, 'too.many.dots.in.token'), false);
    assert.equal(validateCsrfToken(sessionIdA, 'short.token'), false);
    assert.equal(validateCsrfToken(null, 'valid.token'), false);
    assert.equal(validateCsrfToken(undefined, 'valid.token'), false);
    assert.equal(validateCsrfToken('', 'valid.token'), false);
  });

  it('9. Throws AuthenticationError if generateCsrfToken is called without valid sessionId', () => {
    assert.throws(() => generateCsrfToken(null), {
      name: 'AuthenticationError',
    });
    assert.throws(() => generateCsrfToken(''), { name: 'AuthenticationError' });
    assert.throws(() => generateCsrfToken({}), { name: 'AuthenticationError' });
  });
});
