/**
 * @file Deterministic Evidence Fingerprint Generator (P4-003)
 *
 * Implements SHA-256 evidence deduplication fingerprinting to guarantee
 * idempotent evidence ingestion across incremental scans and repeated runs.
 */

import crypto from 'node:crypto';

/**
 * Computes a deterministic SHA-256 fingerprint for an evidence node.
 *
 * @param {object} params
 * @param {string} params.tenantId - Tenant UUID.
 * @param {string} params.candidateId - Candidate UUID.
 * @param {string} params.resourceId - Resource UUID.
 * @param {string} params.skillSlug - Canonical skill slug (or 'project-evidence').
 * @param {string} params.evidenceType - EvidenceTypeEnum value.
 * @param {string} [params.filePath=''] - Source file path.
 * @param {string} [params.commitSha='HEAD'] - Commit SHA or HEAD.
 * @returns {string} 64-character lowercase hexadecimal hash.
 */
export function computeEvidenceFingerprint({
  tenantId,
  candidateId,
  resourceId,
  skillSlug,
  evidenceType,
  filePath = '',
  commitSha = 'HEAD',
}) {
  if (!tenantId || !candidateId || !resourceId || !skillSlug || !evidenceType) {
    throw new Error(
      'computeEvidenceFingerprint: mandatory fields (tenantId, candidateId, resourceId, skillSlug, evidenceType) required'
    );
  }

  const normalizedPath = (filePath || '').trim().replace(/\\/g, '/');
  const normalizedSha = (commitSha || 'HEAD').trim();

  const canonicalString = `${tenantId}:${candidateId}:${resourceId}:${skillSlug}:${evidenceType}:${normalizedPath}:${normalizedSha}`;

  return crypto.createHash('sha256').update(canonicalString, 'utf8').digest('hex');
}
