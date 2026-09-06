/**
 * @file Shared handoff-kit artifact enrichment for MCP application inspection tools.
 *
 * ChatGPT and other AI clients inspect tracked applications through BOTH
 * `get_application_submission_status` (job workflow) and `get_job_application`
 * (career tracking). Both tools must surface the encrypted TAILORED_RESUME /
 * TAILORED_COVER_LETTER PDF artifacts recorded in the application's
 * `metadata.handoffKit`, otherwise clients that choose the tracking tool see
 * `tailoredDocuments: []` and the handoff acceptance fails.
 *
 * Guarantees (P14 security invariants):
 * - Only artifacts whose decrypted bytes match the recorded SHA-256 content hash
 *   and byte size are exposed (fail-closed against stale or corrupted objects).
 * - Encrypted storage keys, ciphertext, and raw markdown payloads are NEVER exposed.
 * - Verification failures are logged with structured context, never fully silent.
 */

import crypto from 'node:crypto';
import { logger } from '../../utils/logger.js';

/**
 * Enriches tailored document snapshots with verified handoff-kit PDF artifacts.
 *
 * Behavior (P14-005BA package-consistency invariants):
 * 1. Refuses to expose artifacts when the handoff kit belongs to a different
 *    application (stale kit copy protection).
 * 2. Resolves the CURRENT package version (metadata.currentPackageHash or the
 *    handoff kit's own packageHash) and only exposes artifacts that belong to
 *    that package — a freshly prepared package is never shadowed by stale
 *    kit metadata or historical document snapshots.
 * 3. Prefers an existing tailored_documents row matching the CURRENT package
 *    (its `metadata.artifact` reference), falling back to the current kit
 *    entry and then to any package-matching snapshot.
 * 4. Decrypts each artifact via DocumentStorageService and verifies size +
 *    SHA-256 content hash before exposure (fail-closed).
 * 5. Emits `artifactReference` / `viewUrl` / `downloadUrl` / `filename` /
 *    `mimeType` / `fileSizeBytes` / `availabilityStatus` / `packageHash` for
 *    every verified artifact.
 * 6. **Hash Consistency (P14-005BC)**: The `contentHash` field MUST match the
 *    authoritative Markdown content hash from `prepare_job_application`, NOT
 *    the PDF byte hash. The PDF byte hash is exposed separately as
 *    `pdfContentHash` for artifact integrity verification.
 *
 * @param {object} application Tracked application row (with optional metadata.handoffKit)
 * @param {Array<object>} documents Existing tailored document snapshots from the database
 * @param {object} artifactStorage DocumentStorageService instance (injected for tests)
 * @param {object} [options={}]
 * @param {string|null} [options.currentPackageHash] Authoritative CURRENT package hash (preferred over metadata)
 * @param {number|null} [options.packageVersion] Authoritative CURRENT package version
 * @param {string|null} [options.resumeContentHash] Authoritative Markdown hash for resume from currentPackage
 * @param {string|null} [options.coverLetterContentHash] Authoritative Markdown hash for cover letter from currentPackage
 * @returns {Promise<Array<object>>} Verified artifact-aware tailored documents
 */
export async function getVerifiedHandoffDocuments(
  application,
  documents,
  artifactStorage,
  options = {}
) {
  const handoff = application?.metadata?.handoffKit;
  if (handoff && handoff.applicationId !== application.id) return documents ?? [];

  // The authoritative package for this application: explicit resolution wins,
  // then metadata.currentPackageHash, then the persisted kit's packageHash.
  const currentPackageHash =
    options.currentPackageHash ||
    application?.metadata?.currentPackageHash ||
    handoff?.packageHash ||
    null;

  // Authoritative Markdown content hashes from the CURRENT package (P14-005BC).
  // These MUST be returned as `contentHash` to maintain the invariant:
  // prepare_job_application().tailoredResume.contentHash === get_job_application().tailoredDocuments[RESUME].contentHash
  //
  // CRITICAL (P14-005BC fix): The `tailored_documents.contentHash` column stores
  // SHA256(JSON.stringify({markdownContent, packageHash})) — the hash of the entire
  // content object, NOT just the markdown. This is DIFFERENT from the Markdown-only
  // hash returned by prepare_job_application. We MUST use the authoritative hashes
  // from application_packages (which stores the correct Markdown-only hashes) and
  // NEVER fall back to existing?.contentHash when a currentPackage exists.
  const authoritativeHashes = {
    TAILORED_RESUME: options.resumeContentHash || null,
    TAILORED_COVER_LETTER: options.coverLetterContentHash || null,
  };

  // P14-005BC: Track whether we have a currentPackage with authoritative hashes.
  // When currentPackage exists, we MUST NOT fall back to existing?.contentHash
  // because it's a different hash type (object hash vs markdown hash).
  const hasAuthoritativePackage = Boolean(currentPackageHash);

  const allDocuments = documents ?? [];
  const snapshotFor = (documentType) => {
    const rows = allDocuments
      .filter((document) => document.documentType === documentType)
      .filter(
        (document) =>
          !currentPackageHash ||
          document.metadata?.packageHash === currentPackageHash ||
          document.metadata?.artifact?.packageHash === currentPackageHash
      );
    // Package-matching snapshot first. Legacy unscoped rows are only eligible
    // when there is no authoritative current package yet; once a current hash
    // exists, exposing an unscoped row could silently return a historical
    // artifact for the wrong package.
    return (
      rows[0] ||
      (!currentPackageHash
        ? allDocuments.find((document) => document.documentType === documentType) || null
        : null)
    );
  };

  const existingByType = new Map(
    ['TAILORED_RESUME', 'TAILORED_COVER_LETTER'].map((type) => [type, snapshotFor(type)])
  );
  const candidates = [
    [
      'TAILORED_RESUME',
      handoff && (!currentPackageHash || handoff.packageHash === currentPackageHash)
        ? handoff.resume
        : null,
    ],
    [
      'TAILORED_COVER_LETTER',
      handoff && (!currentPackageHash || handoff.packageHash === currentPackageHash)
        ? handoff.coverLetter
        : null,
    ],
  ];
  const verified = allDocuments.filter(
    (document) => !['TAILORED_RESUME', 'TAILORED_COVER_LETTER'].includes(document.documentType)
  );

  for (const [documentType, artifact] of candidates) {
    const existing = existingByType.get(documentType);
    const storedArtifact = existing?.metadata?.artifact || artifact;

    // P14-005BC: Resolve the authoritative Markdown content hash.
    // Priority: 1) Explicit option from currentPackage
    // CRITICAL: Do NOT fall back to existing?.contentHash when a currentPackage exists,
    // because tailored_documents.contentHash is SHA256({markdownContent, packageHash})
    // which is DIFFERENT from the Markdown-only hash in application_packages.
    // Only use existing?.contentHash for legacy applications without a package ledger.
    const authoritativeContentHash =
      authoritativeHashes[documentType] ||
      (hasAuthoritativePackage ? null : existing?.metadata?.markdownContentHash || null);

    if (!storedArtifact?.storageKey) {
      // Preserve pre-existing snapshot rows (e.g. attach_application_document
      // records without an encrypted PDF artifact) as a sanitized projection:
      // raw rows carry content payloads and metadata.storageKey that must never
      // be serialized into MCP tool responses.
      if (existing) {
        // P14-005BC: Resolve the best available Markdown content hash.
        // Priority: 1) authoritative from currentPackage, 2) metadata.markdownContentHash,
        // 3) ONLY for legacy rows without a package ledger: existing.contentHash
        const resolvedContentHash =
          authoritativeContentHash ||
          existing.metadata?.markdownContentHash ||
          (hasAuthoritativePackage ? null : existing.contentHash);
        verified.push({
          id: existing.id ?? null,
          applicationId: existing.applicationId ?? application.id,
          candidateId: existing.candidateId ?? application.candidateId,
          documentType: existing.documentType,
          version: existing.version,
          packageVersion: options.packageVersion || null,
          title: existing.title,
          // P14-005BC: Use authoritative Markdown hash, not row's JSON-serialized hash
          contentHash: resolvedContentHash,
          citationRefsCount: Array.isArray(existing.citationRefs)
            ? existing.citationRefs.length
            : 0,
          integrityScore: existing.integrityScore ?? null,
          atsFitScore: existing.atsFitScore ?? null,
          createdAt: existing.createdAt
            ? new Date(existing.createdAt).toISOString()
            : new Date().toISOString(),
          packageHash: existing.metadata?.packageHash || currentPackageHash || null,
          ...(typeof existing.metadata?.artifact?.qaScore === 'number'
            ? { qaScore: existing.metadata.artifact.qaScore }
            : typeof existing.metadata?.qaScore === 'number'
              ? { qaScore: existing.metadata.qaScore }
              : typeof existing.integrityScore === 'number'
                ? { qaScore: Math.round(existing.integrityScore * 100) }
                : {}),
          ...(typeof existing.metadata?.artifact?.qaPassed === 'boolean'
            ? { qaPassed: existing.metadata.artifact.qaPassed }
            : typeof existing.metadata?.qaPassed === 'boolean'
              ? { qaPassed: existing.metadata.qaPassed }
              : {}),
        });
      }
      continue;
    }
    const availabilityStatus =
      storedArtifact.status || (storedArtifact.qaAudit?.passed ? 'READY' : 'BLOCKED');
    try {
      const buffer = await artifactStorage.getDecryptedDocument({
        tenantId: application.tenantId,
        storageKey: storedArtifact.storageKey,
      });
      // This is the PDF byte hash — used for artifact integrity verification only
      const pdfContentHash = crypto.createHash('sha256').update(buffer).digest('hex');
      if (
        buffer.length !== storedArtifact.fileSizeBytes ||
        pdfContentHash !== storedArtifact.contentHash
      ) {
        logger.warn(
          {
            event: 'handoff.artifact_verification_failed',
            applicationId: application.id,
            documentType,
            reason: 'hash_or_size_mismatch',
          },
          'Handoff kit artifact failed integrity verification; not exposed via MCP.'
        );
        continue;
      }

      // P14-005BC: Resolve the best available Markdown content hash for the artifact case.
      // Priority: 1) authoritative from currentPackage, 2) metadata.markdownContentHash,
      // 3) ONLY for legacy rows without a package ledger: fall back to PDF hash (wrong but better than null)
      const resolvedArtifactContentHash =
        authoritativeContentHash ||
        existing?.metadata?.markdownContentHash ||
        storedArtifact.markdownContentHash ||
        (hasAuthoritativePackage ? null : storedArtifact.contentHash);

      // Resolve persisted QA score and pass/fail status without recalculation or fabrication
      const rawQaScore =
        storedArtifact?.qaScore ??
        storedArtifact?.qaAudit?.score ??
        artifact?.qaScore ??
        artifact?.qaAudit?.score ??
        existing?.metadata?.artifact?.qaScore ??
        existing?.metadata?.artifact?.qaAudit?.score ??
        (typeof existing?.integrityScore === 'number' && Number.isFinite(existing.integrityScore)
          ? Math.round(existing.integrityScore * 100)
          : undefined);

      const qaScore =
        typeof rawQaScore === 'number' && !Number.isNaN(rawQaScore) ? rawQaScore : undefined;

      const rawQaPassed =
        storedArtifact?.qaPassed ??
        storedArtifact?.qaAudit?.passed ??
        artifact?.qaPassed ??
        artifact?.qaAudit?.passed ??
        existing?.metadata?.artifact?.qaPassed ??
        existing?.metadata?.artifact?.qaAudit?.passed ??
        (availabilityStatus === 'READY'
          ? true
          : availabilityStatus === 'BLOCKED'
            ? false
            : undefined);

      const qaPassed = typeof rawQaPassed === 'boolean' ? rawQaPassed : undefined;

      verified.push({
        id: existing?.id ?? null,
        applicationId: application.id,
        candidateId: application.candidateId,
        documentType,
        version: existing?.version || 1,
        packageVersion: options.packageVersion || null,
        title: existing?.title || storedArtifact.filename,
        // P14-005BC: contentHash MUST be the authoritative Markdown hash from prepare_job_application
        // to maintain the invariant: prepare().contentHash === get().contentHash
        contentHash: resolvedArtifactContentHash,
        // P14-005BC: pdfContentHash is the PDF byte hash for artifact integrity verification
        pdfContentHash: storedArtifact.contentHash,
        citationRefsCount:
          existing && Array.isArray(existing.citationRefs) ? existing.citationRefs.length : 0,
        integrityScore: availabilityStatus === 'READY' ? (existing?.integrityScore ?? null) : null,
        atsFitScore: existing?.atsFitScore ?? null,
        createdAt: existing?.createdAt
          ? new Date(existing.createdAt).toISOString()
          : handoff?.generatedAt || new Date().toISOString(),
        artifactReference: storedArtifact.viewUrl,
        filename: storedArtifact.filename,
        mimeType: storedArtifact.mimeType,
        fileSizeBytes: storedArtifact.fileSizeBytes,
        availabilityStatus,
        viewUrl: storedArtifact.viewUrl,
        downloadUrl: storedArtifact.downloadUrl,
        packageHash: currentPackageHash || storedArtifact.packageHash || null,
        ...(qaScore !== undefined ? { qaScore } : {}),
        ...(qaPassed !== undefined ? { qaPassed } : {}),
      });
    } catch (err) {
      // Never expose stale metadata when the encrypted object cannot be read.
      logger.warn(
        {
          event: 'handoff.artifact_verification_failed',
          applicationId: application.id,
          documentType,
          reason: 'decryption_failed',
          errorMessage: err?.message,
        },
        'Handoff kit artifact could not be decrypted; not exposed via MCP.'
      );
    }
  }
  return verified;
}
