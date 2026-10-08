/**
 * @file Cryptographic Action Approval Signer & Verifier (P9-002 / ARCH-032 / ADR-053)
 *
 * Implements HMAC-SHA256 signature generation and constant-time verification over
 * canonical action approval payloads with per-tenant HKDF key isolation.
 *
 * Invariants:
 * 1. Master Secret: Validated ACTION_APPROVAL_HMAC_SECRET; no fallback.
 * 2. Per-Tenant Subkey Derivation: HKDF-SHA256 with salt=tenantId and a domain-specific v2 info.
 * 3. Timing-Safe Comparison: Uses crypto.timingSafeEqual to prevent side-channel timing attacks.
 * 4. Versioned Canonical Payload: v2 invalidates all pre-remediation signatures.
 */

import crypto from 'node:crypto';
import { CryptoError } from '../errors/index.js';
import { config } from '../config/env.js';
import { getApprovalSecret } from '../config/approval-secrets.js';

export const ACTION_APPROVAL_SIGNING_DOMAIN = 'antigravity:action-approval:v2';

/**
 * Retrieves and validates the master HMAC secret.
 *
 * @returns {Buffer}
 */
export function getMasterApprovalSecret(secretKey) {
  return getApprovalSecret(config, 'ACTION_APPROVAL_HMAC_SECRET', secretKey);
}

/**
 * Derives a tenant-isolated 32-byte signing subkey using HKDF-SHA256.
 *
 * @param {string} tenantId Sovereign tenant UUID
 * @returns {Buffer} Derived 32-byte key
 */
export function deriveTenantSigningKey(tenantId, secretKey) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new CryptoError(
      'Valid tenantId is required for approval signing key derivation',
      'INVALID_TENANT_ID'
    );
  }

  const masterSecret = getMasterApprovalSecret(secretKey);
  const salt = Buffer.from(tenantId, 'utf8');
  const info = Buffer.from('antigravity:action_approval:v2', 'utf8');

  return Buffer.from(crypto.hkdfSync('sha256', masterSecret, salt, info, 32));
}

/**
 * Constructs the canonical pipe-delimited string representation of a ticket.
 *
 * Format:
 * antigravity:action-approval:v2|tenantId|userId|candidateId|resourceId|proposalId|repoLower|baseBranch|targetBranch|expectedHeadSha|patchFingerprint|expiresAtIso
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
    ACTION_APPROVAL_SIGNING_DOMAIN,
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
export function signTicketPayload(ticket, secretKey) {
  const canonicalPayload = buildCanonicalTicketPayload(ticket);
  const signingKey = deriveTenantSigningKey(ticket.tenantId, secretKey);

  return crypto.createHmac('sha256', signingKey).update(canonicalPayload, 'utf8').digest('hex');
}

/**
 * Verifies an approval ticket HMAC signature using timing-safe comparison.
 *
 * @param {object} ticket Ticket object containing hmacSignature
 * @returns {boolean} True if signature is valid, false otherwise
 */
export function verifyTicketSignature(ticket, secretKey) {
  if (
    !ticket ||
    typeof ticket.hmacSignature !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(ticket.hmacSignature)
  ) {
    return false;
  }

  try {
    const expectedSignature = signTicketPayload(ticket, secretKey);
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
