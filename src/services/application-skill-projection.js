import { normalizeTruthCategory } from '../domain/career/truth-category.js';
import { skillTrustStatus } from './evidence/verification-policy.js';

/** Candidate rollups are not independent proficiency verification (ISSUE-06).
 * Missing/unknown inventory stays auditable but never becomes an affirmative claim.
 */
export function projectApplicationSkills(rows) {
  const claimedSkills = [],
    skillGaps = [];
  for (const row of rows) {
    const status =
      !row.provenanceStatus && !row.metadata?.isUserClaim ? 'UNKNOWN' : skillTrustStatus(row);
    const normalized = normalizeTruthCategory(status);
    if (normalized === 'MISSING_EVIDENCE' || normalized === 'UNKNOWN') {
      skillGaps.push({
        name: row.skillName,
        availability: normalized,
        ...(row.candidateSkillId ? { candidateSkillId: row.candidateSkillId } : {}),
      });
      continue;
    }
    const truthCategory = status === 'USER_PROVIDED' ? 'USER_PROVIDED' : normalized;
    claimedSkills.push({
      name: row.skillName,
      truthCategory,
      notes:
        truthCategory === 'INFERRED'
          ? 'Inferred signal; candidate proficiency is not independently verified'
          : 'Candidate-provided claim; not independently verified',
    });
  }
  return { verifiedSkills: [], claimedSkills, skillGaps };
}
