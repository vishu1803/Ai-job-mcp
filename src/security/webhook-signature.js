/**
 * @file GitHub Webhook Signature Verification (HMAC-SHA256)
 *
 * Implements cryptographic validation of incoming GitHub Webhook signatures (X-Hub-Signature-256)
 * against raw request body bytes using timing-safe comparisons according to ADR-023.
 */

import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { AuthenticationError, InternalServerError } from '../errors/index.js';

/**
 * Validates the HMAC-SHA256 signature provided in the X-Hub-Signature-256 header
 * against the unparsed raw request body bytes.
 *
 * @param {Buffer | string} rawBody - Raw unparsed request body
 * @param {string} signatureHeader - Value of X-Hub-Signature-256 header
 * @param {string} secret - Configured GITHUB_WEBHOOK_SECRET
 * @returns {boolean} True if signature is cryptographically valid
 * @throws {InternalServerError} If webhook secret is not configured on the server
 * @throws {AuthenticationError} If signature is missing, malformed, or invalid
 */
export function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!secret || typeof secret !== 'string') {
    throw new InternalServerError(
      'GitHub webhook secret is not configured on the server',
      'MISSING_WEBHOOK_SECRET'
    );
  }

  if (!signatureHeader || typeof signatureHeader !== 'string') {
    throw new AuthenticationError(
      'Missing X-Hub-Signature-256 webhook signature header',
      'MISSING_WEBHOOK_SIGNATURE'
    );
  }

  if (!signatureHeader.startsWith('sha256=')) {
    throw new AuthenticationError(
      'Malformed webhook signature: expected "sha256=" prefix',
      'INVALID_WEBHOOK_SIGNATURE'
    );
  }

  const providedHex = signatureHeader.slice(7).trim();
  if (!/^[0-9a-fA-F]{64}$/.test(providedHex)) {
    throw new AuthenticationError(
      'Malformed webhook signature: invalid hex digest length',
      'INVALID_WEBHOOK_SIGNATURE'
    );
  }

  if (rawBody === null || rawBody === undefined) {
    throw new AuthenticationError(
      'Missing raw request body for signature verification',
      'MISSING_WEBHOOK_SIGNATURE'
    );
  }

  const rawBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');

  const expectedHex = crypto.createHmac('sha256', secret).update(rawBuffer).digest('hex');

  const expectedBuf = Buffer.from(expectedHex, 'utf8');
  const providedBuf = Buffer.from(providedHex.toLowerCase(), 'utf8');

  if (
    expectedBuf.length !== providedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, providedBuf)
  ) {
    throw new AuthenticationError(
      'Invalid webhook signature: HMAC-SHA256 mismatch',
      'INVALID_WEBHOOK_SIGNATURE'
    );
  }

  return true;
}

/**
 * Deterministically generates a valid X-Hub-Signature-256 header value for a payload and secret.
 * Used for testing and signature synthesis.
 *
 * @param {Buffer | string | object} payload - Payload to sign
 * @param {string} secret - Secret key for HMAC
 * @returns {string} Signature header string: "sha256=<hex>"
 */
export function generateWebhookSignature(payload, secret) {
  if (!secret) {
    throw new Error('Secret is required to generate webhook signature');
  }

  let rawBuffer;
  if (Buffer.isBuffer(payload)) {
    rawBuffer = payload;
  } else if (typeof payload === 'string') {
    rawBuffer = Buffer.from(payload, 'utf8');
  } else {
    rawBuffer = Buffer.from(JSON.stringify(payload), 'utf8');
  }

  const hex = crypto.createHmac('sha256', secret).update(rawBuffer).digest('hex');
  return `sha256=${hex}`;
}
