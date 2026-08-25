/**
 * @file Cryptographic Action Approval Signer & Verifier (P9-002 / ARCH-032 / ADR-053)
 *
 * Implements HMAC-SHA256 signature generation and constant-time verification over
 * canonical action approval payloads with per-tenant HKDF key isolation.
 *
 * Invariants:
 * 1. Master Secret: Sourced from ACTION_APPROVAL_HMAC_SECRET (min 32 bytes).
 * 2. Per-Tenant Subkey Derivation: HKDF-SHA256 with salt=tenantId, info='antigravity:action_approval:v1'.
 * 3. Timing-Safe Comparison: Uses crypto.timingSafeEqual to prevent side-channel timing attacks.
 * 4. Versioned Canonical Payload: V1 pipe-delimited format preventing parameter substitution.
 */

import crypto from 'node:crypto';
import { CryptoError } from '../errors/index.js';

// Default deterministic test fallback secret if not configured in environment
const DEFAULT_TEST_HMAC_SECRET =
  'antigravity_default_action_approval_hmac_secret_min_32_bytes_test_only';

/**
 * Retrieves and validates the master HMAC secret.
 *
 * @returns {Buffer}
 */
export function getMasterApprovalSecret() {
  const secret = process.env.ACTION_APPROVAL_HMAC_SECRET || DEFAULT_TEST_HMAC_SECRET;
  const secretBuffer = Buffer.from(secret, 'utf8');

  if (secretBuffer.length < 32) {
    throw new CryptoError(
      'ACTION_APPROVAL_HMAC_SECRET must provide at least 32 bytes of cryptographic entropy',
      'INSUFFICIENT_SECRET_ENTROPY'
    );
  }

  return secretBuffer;
}

/**
 * Derives a tenant-isolated 32-byte signing subkey using HKDF-SHA256.
 *
 * @param {string} tenantId Sovereign tenant UUID
 * @returns {Buffer} Derived 32-byte key
 */
export function deriveTenantSigningKey(tenantId) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new CryptoError(
      'Valid tenantId is required for approval signing key derivation',
      'INVALID_TENANT_ID'
    );
  }

  const masterSecret = getMasterApprovalSecret();
  const salt = Buffer.from(tenantId, 'utf8');
  const info = Buffer.from('antigravity:action_approval:v1', 'utf8');

  return Buffer.from(crypto.hkdfSync('sha256', masterSecret, salt, info, 32));
}

/**
 * Constructs the canonical pipe-delimited string representation of a ticket.
 *
 * Format:
 * V1|tenantId|userId|candidateId|resourceId|proposalId|repoLower|baseBranch|targetBranch|expectedHeadSha|patchFingerprint|expiresAtIso
 *
 * @param {object} ticket Ticket parameters
 * @returns {string} Canonical payload string
 */
export function buildCanonicalTicketPayload(ticket) {
  if (!ticket || typeof ticket !== 'object') {
    throw new CryptoError(
      'Ticket object is required for canonical payload construction',
      'INVALID_TICKET_OBJECT'
    );
  }

  const tenantId = String(ticket.tenantId || '').trim();
  const userId = String(ticket.userId || '').trim();
  const candidateId = String(ticket.candidateId || '').trim();
  const resourceId = String(ticket.resourceId || '').trim();
  const proposalId = String(ticket.proposalId || '').trim();
  const repoLower = String(ticket.repositoryName || '')
    .toLowerCase()
    .trim();
  const baseBranch = String(ticket.baseBranch || 'main').trim();
  const targetBranch = String(ticket.targetBranch || '').trim();
  const expectedHeadSha = String(ticket.expectedHeadSha || '')
    .toLowerCase()
    .trim();
  const patchFingerprint = String(ticket.patchFingerprint || '')
    .toLowerCase()
    .trim();
  const expiresAtIso = new Date(ticket.expiresAt).toISOString();

  return [
    'V1',
    tenantId,
    userId,
    candidateId,
    resourceId,
    proposalId,
    repoLower,
    baseBranch,
    targetBranch,
    expectedHeadSha,
    patchFingerprint,
    expiresAtIso,
  ].join('|');
}

/**
 * Signs an approval ticket payload and returns the HMAC-SHA256 hex string.
 *
 * @param {object} ticket Ticket object
 * @returns {string} 64-character hex signature
 */
export function signTicketPayload(ticket) {
  const canonicalPayload = buildCanonicalTicketPayload(ticket);
  const signingKey = deriveTenantSigningKey(ticket.tenantId);

  return crypto.createHmac('sha256', signingKey).update(canonicalPayload, 'utf8').digest('hex');
}

/**
 * Verifies an approval ticket HMAC signature using timing-safe comparison.
 *
 * @param {object} ticket Ticket object containing hmacSignature
 * @returns {boolean} True if signature is valid, false otherwise
 */
export function verifyTicketSignature(ticket) {
  if (!ticket || !ticket.hmacSignature || typeof ticket.hmacSignature !== 'string') {
    return false;
  }

  try {
    const expectedSignature = signTicketPayload(ticket);
    const providedBuffer = Buffer.from(ticket.hmacSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (providedBuffer.length !== expectedBuffer.length || providedBuffer.length !== 32) {
      return false;
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
