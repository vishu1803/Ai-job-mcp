/** ISSUE-06: verification is a scoped source fact, never a confidence threshold.
 * Repository facts do not independently verify candidate competence or authorship.
 */
export const EVIDENCE_POLICY_VERSION = 'github-source-fact-v1';
// Capability over a database read, NOT a client-serializable verification flag.
// PostgreSQL/ingestion remain authoritative; this registry only preserves origin
// inside one request. It is not a lock, cache, or multi-instance state authority.
const databaseOrigins = new WeakMap();

function sourceIdentity(item) {
  const source = item?.sourceLocation || item || {};
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])])
    );
  };
  return JSON.stringify(
    canonical([
      item.id || item.evidenceId,
      item.tenantId,
      item.candidateId,
      item.resourceId,
      item.evidenceType,
      item.sourceProvider,
      source.filePath,
      source.commitSha,
      source.lineRange,
      item.metadata?.rawImport,
      item.metadata?.verification,
    ])
  );
}

/** Internal DB-read boundary. Call ONLY with evidence_items query results,
 * never with request/profile/model metadata. Call sites are explicitly audited.
 * Tests may supply explicit mock DB rows at this same dependency boundary.
 */
export function trustDatabaseEvidence(rows, context) {
  for (const row of rows) {
    if (
      !context?.tenantId ||
      !context?.candidateId ||
      row.tenantId !== context.tenantId ||
      row.candidateId !== context.candidateId
    )
      continue;
    databaseOrigins.set(row, sourceIdentity(row));
  }
  return rows;
}

/** Preserve authority across server-owned projections, never from JSON alone. */
export function copyEvidenceAuthority(source, target) {
  if (
    source &&
    databaseOrigins.get(source) === sourceIdentity(source) &&
    sourceIdentity(source) === sourceIdentity(target)
  ) {
    databaseOrigins.set(target, sourceIdentity(target));
  }
  return target;
}
const SHA = /^(?!0{40}$)[a-f0-9]{40}$/;
const UNTRUSTED_PATH =
  /(?:^|\/)(?:node_modules|vendor|third_party|dist|build|out|coverage|generated|__generated__|fixtures?|__fixtures__|tests?|__tests__|examples?|docs?)(?:\/|$)|(?:\.min\.|\.bundle\.|\.generated\.|\.(?:test|spec)\.)/i;

export function isObservationOnlyPath(path) {
  return typeof path !== 'string' || UNTRUSTED_PATH.test(path);
}

export function verifiedSourceFact(item) {
  if (!item || databaseOrigins.get(item) !== sourceIdentity(item)) return false;
  const proof = item?.metadata?.verification;
  const source = item?.sourceLocation || item || {};
  if (!proof || proof.version !== EVIDENCE_POLICY_VERSION || proof.status !== 'VERIFIED')
    return false;
  return (
    item.sourceProvider === 'GITHUB_APP' &&
    item.evidenceType === 'CODE_IMPORT_USAGE' &&
    proof.scope === 'REPOSITORY_STATIC_REFERENCE' &&
    proof.method === 'ACORN_AST' &&
    proof.validation === 'PINNED_TREE_AND_GIT_BLOB' &&
    proof.attribution?.status === 'UNATTRIBUTED' &&
    proof.tenantId === item.tenantId &&
    proof.candidateId === item.candidateId &&
    proof.resourceId === item.resourceId &&
    typeof proof.epoch === 'string' &&
    proof.epoch.length === 36 &&
    /^[1-9]\d*$/.test(proof.repositoryId || '') &&
    /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(proof.repository || '') &&
    proof.repositoryUrl === `https://github.com/${proof.repository}` &&
    SHA.test(source.commitSha || '') &&
    SHA.test(proof.blobSha || '') &&
    source.commitSha === proof.commitSha &&
    source.filePath === proof.filePath &&
    !isObservationOnlyPath(source.filePath) &&
    !source.filePath.split('/').includes('..') &&
    source.lineRange?.start === proof.lineRange?.start &&
    source.lineRange?.end === proof.lineRange?.end &&
    Number.isInteger(source.lineRange?.start) &&
    Number.isInteger(source.lineRange?.end) &&
    source.lineRange.start > 0 &&
    source.lineRange.end >= source.lineRange.start &&
    typeof proof.fact === 'string' &&
    typeof item.metadata.rawImport === 'string' &&
    proof.fact ===
      `Repository ${proof.repository} contains a static module reference to "${item.metadata.rawImport}" in ${source.filePath}:${source.lineRange.start} at ${source.commitSha}.` &&
    Number.isFinite(Date.parse(proof.observedAt)) &&
    Date.parse(proof.observedAt) <= Date.now() &&
    Date.now() - Date.parse(proof.observedAt) < 86400000
  );
}

export function evidenceStatus(item) {
  if (item?.metadata?.verification?.status === 'INVALID') return 'INVALID';
  if (item?.evidenceType === 'DOCUMENT_CLAIM') return 'CLAIMED';
  return verifiedSourceFact(item) ? 'VERIFIED' : 'OBSERVED';
}

// No implemented repository extractor independently assesses candidate proficiency.
// Keep the existing skill vocabulary: OBSERVED repository signals imply INFERRED skills.
export function skillTrustStatus(skill = {}) {
  const status = skill.provenanceStatus || skill.truthStatus || skill.truthCategory;
  if (['SELF_DECLARED', 'USER_PROVIDED', 'LEARNING'].includes(status)) return status;
  if (
    skill.isUserClaim ||
    skill.resumeClaim ||
    skill.metadata?.isUserClaim ||
    ['CLAIMED', 'SELF_DECLARED', 'USER_PROVIDED', 'LEARNING'].includes(status)
  )
    return 'CLAIMED';
  if (['VERIFIED', 'CORROBORATED', 'OBSERVED', 'INFERRED'].includes(status)) return 'INFERRED';
  return status || 'CLAIMED';
}

/** Output defense: a copied evidence ID is not a license to verify arbitrary prose.
 * Only the exact fact on the authoritative evidence row can retain VERIFIED.
 * This is deliberately not an LLM semantic-equivalence check.
 */
export function enforceEvidenceTrust(value) {
  if (value instanceof Map)
    return new Map([...value].map(([k, v]) => [k, enforceEvidenceTrust(v)]));
  if (value instanceof Set) return new Set([...value].map(enforceEvidenceTrust));
  if (Array.isArray(value)) return value.map(enforceEvidenceTrust);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  const result = Object.fromEntries(
    Object.entries(value).map(([k, v]) => {
      if (k === 'metadata' && v?.verification) {
        const { verification, ...rest } = v;
        return [
          k,
          {
            ...enforceEvidenceTrust(rest),
            verification: { ...verification, status: evidenceStatus(value) },
          },
        ];
      }
      if (
        ['education', 'experience', 'recentExperience', 'certifications'].includes(k) &&
        Array.isArray(v)
      ) {
        return [
          k,
          v.map((entry) => {
            const normalized = enforceEvidenceTrust(entry);
            if (['VERIFIED', 'CORROBORATED'].includes(entry?.provenanceStatus))
              normalized.provenanceStatus = 'CLAIMED';
            return normalized;
          }),
        ];
      }
      if (k === 'verifiedSkillsUsed' && Array.isArray(v)) return [k, []];
      if (['verifiedSkillsSummary', 'verifiedSkills'].includes(k) && Array.isArray(v))
        return [k, []];
      return [k, enforceEvidenceTrust(v)];
    })
  );
  const exactFact =
    verifiedSourceFact(value) &&
    (value.statement === undefined || value.statement === value.metadata.verification.fact);
  if ('verificationStatus' in result) result.verificationStatus = evidenceStatus(value);
  if (result.verified === true && !exactFact) result.verified = false;
  if (Array.isArray(value.verifiedSkillsUsed))
    result.reportedSkillsUsed = value.reportedSkillsUsed || [...value.verifiedSkillsUsed];
  if (Array.isArray(value.verifiedSkillsSummary))
    result.reportedSkillsSummary = value.reportedSkillsSummary || [...value.verifiedSkillsSummary];
  if (Array.isArray(value.verifiedSkills))
    result.reportedSkills = value.reportedSkills || enforceEvidenceTrust(value.verifiedSkills);
  if ('verifiedSignalCount' in result) {
    result.observedSignalCount = value.observedSignalCount ?? value.verifiedSignalCount;
    result.verifiedSignalCount = 0;
  }
  for (const key of [
    'provenanceStatus',
    'candidateProvenance',
    'provenance',
    'truthStatus',
    'truthCategory',
    'sourceType',
    'status',
  ]) {
    if (['VERIFIED', 'CORROBORATED'].includes(result[key]) && !exactFact) {
      result[key] =
        value.isUserClaim || value.resumeClaim || value.metadata?.isUserClaim
          ? 'CLAIMED'
          : 'INFERRED';
    }
  }
  return copyEvidenceAuthority(value, result);
}
