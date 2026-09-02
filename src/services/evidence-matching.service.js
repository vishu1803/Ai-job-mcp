/**
 * @file Evidence Matching & Gap Analysis Service (P5-003)
 *
 * Implements deterministic matching of structured JobRequirements against
 * CandidateProfile, CandidateSkills, and Evidence graphs.
 * Enforces strict evidence verification, canonical taxonomy integration (P5-002),
 * directional relationship traversals, prioritized skill gaps, and multi-tenant default-deny.
 *
 * Conforms to:
 * - ARCH-011 / ARCH-013 (docs/evidence-matching-architecture.md)
 * - ADR-031 / ADR-033 (docs/decisions.md)
 */

import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';
import { ValidationError, NotFoundError } from '../errors/index.js';
import { SkillTaxonomyEngine } from '../domain/career/skill-taxonomy.js';
import {
  CandidateMatchAnalysisSchema,
  SkillGapSchema,
} from '../domain/career/evidence-matching.schemas.js';

// ---------------------------------------------------------------------------
// 1. Evidence Type Evidentiary Rank (Lower number = higher evidentiary strength)
// ---------------------------------------------------------------------------

const EVIDENCE_TYPE_RANK = Object.freeze({
  PACKAGE_MANIFEST_DEPENDENCY: 1,
  CODE_IMPORT_USAGE: 2,
  CODE_USAGE: 3,
  CONFIG_SYNTAX_DECLARATION: 4,
  COMMIT_CONTRIBUTION: 5,
  FILE_PATTERN_MATCH: 6,
  README_SPECIFICATION: 7,
  DOCUMENT_CLAIM: 8,
});

/**
 * Subjective qualitative keywords that cannot be mechanically verified from code repositories.
 * Includes both original forms and normalized (kebab-case) taxonomy forms.
 */
const SUBJECTIVE_KEYWORDS = Object.freeze([
  'leadership',
  'leader',
  'communication',
  'communicator',
  'collaborator',
  'collaboration',
  'team player',
  'startup mindset',
  'culture fit',
  'fast-paced',
  'fast paced',
  'passion',
  'passionate',
  'curiosity',
  'curious',
  'mentor',
  'mentorship',
  'interpersonal',
  'problem solver',
  'work ethic',
  // Normalized taxonomy forms for soft/qualitative skills
  'problem-solving',
  'communication',
  'teamwork',
  'adaptability',
  'creativity',
  'analytical-thinking',
  'critical-thinking',
  'time-management',
  'project-management',
  'organization',
  'attention-to-detail',
  'self-motivation',
  'conflict-resolution',
  'public-speaking',
  'presentation',
  'writing',
  'negotiation',
  'empathy',
  'patience',
  'resilience',
  'initiative',
  'flexibility',
  'dependability',
  'work-ethic',
  'interpersonal-skills',
]);

/**
 * Degree rank hierarchy for education evaluations.
 */
const DEGREE_RANKS = Object.freeze({
  HIGH_SCHOOL: 1,
  ASSOCIATE: 2,
  BACHELOR: 3,
  MASTER: 4,
  DOCTORATE: 5,
  ANY: 0,
});

// ---------------------------------------------------------------------------
// 2. Service Implementation
// ---------------------------------------------------------------------------

export class EvidenceMatchingService {
  /**
   * Evaluates a structured JobDescription against a CandidateProfileView with cryptographic evidence traceability.
   *
   * @param {object} context Trusted tenant context
   * @param {string} context.tenantId Sovereign tenant ID
   * @param {object} jobDescription Normalized JobDescription with requirements array
   * @param {object} candidateProfile Normalized CandidateProfileView
   * @returns {object} Validated CandidateMatchAnalysis
   */
  static matchJobToCandidate(context, jobDescription, candidateProfile) {
    const startTime = Date.now();

    // -------------------------------------------------------------------------
    // A. Multi-Tenant Sovereign Isolation Verification
    // -------------------------------------------------------------------------
    if (!context || !context.tenantId) {
      throw new ValidationError('Trusted tenantId is required in context', 'TENANT_ID_REQUIRED');
    }

    const trustedTenantId = context.tenantId;

    if (!jobDescription || !jobDescription.tenantId) {
      throw new NotFoundError('Job description not found');
    }

    if (jobDescription.tenantId !== trustedTenantId) {
      logger.warn({
        operation: 'matching.tenant_mismatch',
        contextTenantId: trustedTenantId,
        resourceTenantId: jobDescription.tenantId,
        msg: 'Cross-tenant job description access rejected with 404',
      });
      throw new NotFoundError('Job description not found');
    }

    if (!candidateProfile || !candidateProfile.tenantId) {
      throw new NotFoundError('Candidate profile not found');
    }

    if (candidateProfile.tenantId !== trustedTenantId) {
      logger.warn({
        operation: 'matching.tenant_mismatch',
        contextTenantId: trustedTenantId,
        resourceTenantId: candidateProfile.tenantId,
        msg: 'Cross-tenant candidate profile access rejected with 404',
      });
      throw new NotFoundError('Candidate profile not found');
    }

    // -------------------------------------------------------------------------
    // B. Pre-Index Candidate Capabilities for $O(1)$ Lookups
    // -------------------------------------------------------------------------
    const { skillsBySlug, projectDomainSet, resourceMap } =
      EvidenceMatchingService._indexCandidateProfile(candidateProfile);

    // Extract requirements
    const requirements = Array.isArray(jobDescription.requirements)
      ? jobDescription.requirements
      : [];

    const requirementMatches = [];
    const skillGaps = [];
    const explanations = [];

    // -------------------------------------------------------------------------
    // C. Deterministic Evaluation Loop
    // -------------------------------------------------------------------------
    for (const req of requirements) {
      const matchResult = EvidenceMatchingService._evaluateRequirement(
        req,
        candidateProfile,
        skillsBySlug,
        projectDomainSet,
        resourceMap
      );

      requirementMatches.push(matchResult.match);
      explanations.push(matchResult.explanation);

      if (matchResult.gap) {
        skillGaps.push(matchResult.gap);
      }
    }

    // -------------------------------------------------------------------------
    // D. Compute Summary Statistics
    // -------------------------------------------------------------------------
    let matchedCount = 0;
    let partialCount = 0;
    let missingCount = 0;
    let unknownCount = 0;

    for (const m of requirementMatches) {
      if (m.matchStatus === 'MATCHED') matchedCount++;
      else if (m.matchStatus === 'PARTIAL') partialCount++;
      else if (m.matchStatus === 'MISSING') missingCount++;
      else if (m.matchStatus === 'UNKNOWN') unknownCount++;
      else {
        // Defensive: unknown status should never occur. Count as UNKNOWN and log.
        unknownCount++;
        logger.warn({
          operation: 'matching.unexpected_status',
          requirementId: m.requirementId,
          unexpectedStatus: m.matchStatus,
          normalizedRequirement: m.normalizedRequirement,
          category: m.category,
          msg: `Unexpected matchStatus '${m.matchStatus}' on requirement '${m.normalizedRequirement}'; counting as UNKNOWN`,
        });
      }
    }

    let criticalGapsCount = 0;
    let highGapsCount = 0;
    let mediumGapsCount = 0;
    let lowGapsCount = 0;

    for (const g of skillGaps) {
      if (g.priority === 'CRITICAL') criticalGapsCount++;
      else if (g.priority === 'HIGH') highGapsCount++;
      else if (g.priority === 'MEDIUM') mediumGapsCount++;
      else if (g.priority === 'LOW') lowGapsCount++;
    }

    // Stable sort gaps by priority then requirementId
    const priorityOrder = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };
    skillGaps.sort((a, b) => {
      const pDiff = (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99);
      if (pDiff !== 0) return pDiff;
      return a.requirementId.localeCompare(b.requirementId);
    });

    const summary = {
      totalRequirements: requirements.length,
      matchedCount,
      partialCount,
      missingCount,
      unknownCount,
      criticalGapsCount,
      highGapsCount,
      mediumGapsCount,
      lowGapsCount,
    };

    const analysisPayload = {
      jobDescriptionId: jobDescription.id,
      candidateId: candidateProfile.id,
      tenantId: trustedTenantId,
      summary,
      requirementMatches,
      skillGaps,
      explanations,
      analyzedAt: new Date().toISOString(),
    };

    // Strict schema contract verification
    const validated = CandidateMatchAnalysisSchema.parse(analysisPayload);

    logger.debug({
      operation: 'matching.completed',
      jobDescriptionId: jobDescription.id,
      candidateId: candidateProfile.id,
      durationMs: Date.now() - startTime,
      matchedCount,
      partialCount,
      missingCount,
      unknownCount,
      gapsCount: skillGaps.length,
      msg: 'Completed deterministic candidate evidence matching analysis',
    });

    return validated;
  }

  // ===========================================================================
  // Internal Indexing & Evaluation Helpers
  // ===========================================================================

  /**
   * Pre-indexes candidate skills, projects, and resources for fast $O(1)$ lookups.
   * @private
   */
  static _indexCandidateProfile(candidateProfile) {
    const skillsBySlug = new Map();
    const resourceMap = new Map();
    const projectDomainSet = new Set();

    // Index resources by ID for rapid name resolution
    const projects = Array.isArray(candidateProfile.projects) ? candidateProfile.projects : [];
    for (const project of projects) {
      if (project.slug) projectDomainSet.add(project.slug.toLowerCase());
      if (project.name) projectDomainSet.add(project.name.toLowerCase());
      if (project.metadata?.domain)
        projectDomainSet.add(String(project.metadata.domain).toLowerCase());

      const resources = Array.isArray(project.resources) ? project.resources : [];
      for (const res of resources) {
        if (res.id) {
          resourceMap.set(res.id, res.name || res.displayName || 'Unknown Repository');
        }
      }
    }

    // Index skills by canonical slug
    const skills = Array.isArray(candidateProfile.skills) ? candidateProfile.skills : [];
    for (const skill of skills) {
      let canonicalSlug = skill.slug;
      if (!canonicalSlug && skill.name) {
        const norm = SkillTaxonomyEngine.normalizeSkill(skill.name);
        canonicalSlug = norm.canonicalSlug;
      } else if (canonicalSlug) {
        const norm = SkillTaxonomyEngine.normalizeSkill(canonicalSlug);
        canonicalSlug = norm.canonicalSlug;
      }

      if (canonicalSlug) {
        const PROVENANCE_PRIORITY = {
          CORROBORATED: 4,
          VERIFIED: 3,
          INFERRED: 2,
          CLAIMED: 1,
          MISSING: 0,
        };
        if (skillsBySlug.has(canonicalSlug)) {
          const existing = skillsBySlug.get(canonicalSlug);
          const rankExisting = PROVENANCE_PRIORITY[existing.provenanceStatus] || 0;
          const rankNew = PROVENANCE_PRIORITY[skill.provenanceStatus] || 0;
          if (rankNew > rankExisting) {
            skillsBySlug.set(canonicalSlug, skill);
          }
        } else {
          skillsBySlug.set(canonicalSlug, skill);
        }
      }
    }

    // Also index skills demonstrated in project evidence.
    // TRUST BOUNDARY: Evidence from node_modules/vendor/dist/generated paths
    // must NOT produce VERIFIED provenance — only INFERRED.
    for (const project of projects) {
      if (Array.isArray(project.evidence)) {
        for (const ev of project.evidence) {
          const rawSkillName = ev.skillSlug || ev.skillName;
          if (rawSkillName) {
            const norm = SkillTaxonomyEngine.normalizeSkill(rawSkillName);
            const canonicalSlug = norm?.canonicalSlug;
            if (canonicalSlug && !skillsBySlug.has(canonicalSlug)) {
              const isLowTrust = EvidenceMatchingService._isLowTrustEvidence(ev);
              const evidenceRef = {
                id: ev.id || ev.evidenceId || crypto.randomUUID(),
                ...ev,
                resourceId: ev.resourceId || project.id || crypto.randomUUID(),
              };
              skillsBySlug.set(canonicalSlug, {
                id: ev.skillId || crypto.randomUUID(),
                slug: canonicalSlug,
                name: norm.canonicalName || ev.skillName || rawSkillName,
                provenanceStatus: isLowTrust ? 'INFERRED' : 'VERIFIED',
                confidenceScore: isLowTrust
                  ? Math.min(0.5, ev.confidenceScore ?? 0.5)
                  : (ev.confidenceScore ?? 1.0),
                evidenceItems: [evidenceRef],
                primaryEvidence: evidenceRef,
              });
            }
          }
        }
      }
    }

    return {
      skillsBySlug,
      projectDomainSet,
      resourceMap,
    };
  }

  /**
   * Dispatches requirement evaluation by category.
   * @private
   */
  static _evaluateRequirement(req, candidateProfile, skillsBySlug, projectDomainSet, resourceMap) {
    const category = req.category;

    switch (category) {
      case 'SKILL':
        return EvidenceMatchingService._evaluateSkillRequirement(req, skillsBySlug, resourceMap);
      case 'EXPERIENCE':
        return EvidenceMatchingService._evaluateExperienceRequirement(
          req,
          candidateProfile,
          resourceMap
        );
      case 'EDUCATION':
        return EvidenceMatchingService._evaluateEducationRequirement(req, candidateProfile);
      case 'LOCATION':
        return EvidenceMatchingService._evaluateLocationRequirement(req, candidateProfile);
      case 'ELIGIBILITY':
        return EvidenceMatchingService._evaluateEligibilityRequirement(req, candidateProfile);
      case 'DOMAIN':
        return EvidenceMatchingService._evaluateDomainRequirement(
          req,
          candidateProfile,
          projectDomainSet
        );
      case 'CERTIFICATION':
        return EvidenceMatchingService._evaluateCertificationRequirement(req, candidateProfile);
      case 'CONCEPT':
        if (
          req.normalizedCriteria?.isSubjective ||
          EvidenceMatchingService._isSubjectiveRequirement(req.extractedValue || req.rawSnippet)
        ) {
          return EvidenceMatchingService._buildUnknownResult(
            req,
            `Requirement '${req.extractedValue}' is a qualitative/subjective capability that cannot be mechanically verified from code repositories.`
          );
        }
        return EvidenceMatchingService._evaluateSkillRequirement(req, skillsBySlug, resourceMap);
      case 'OTHER':
      default:
        return EvidenceMatchingService._evaluateGenericRequirement(req);
    }
  }

  /**
   * Evaluates technical skill requirements with taxonomy normalization and graph traversal.
   * @private
   */
  static _evaluateSkillRequirement(req, skillsBySlug, resourceMap) {
    // 1. Resolve canonical skill slug
    let rawSkill = req.skillSlug || req.extractedValue;
    if (req.normalizedCriteria?.skillSlug) {
      rawSkill = req.normalizedCriteria.skillSlug;
    }

    const norm = SkillTaxonomyEngine.normalizeSkill(rawSkill);
    const targetSlug = norm.canonicalSlug;
    const targetDisplayName = norm.canonicalName || req.extractedValue;

    // Check if subjective/soft skill incorrectly labeled as SKILL
    // This catches both the original text AND the normalized taxonomy slug form
    if (
      EvidenceMatchingService._isSubjectiveRequirement(req.extractedValue || req.rawSnippet) ||
      EvidenceMatchingService._isSubjectiveRequirement(targetSlug || '')
    ) {
      return EvidenceMatchingService._buildUnknownResult(
        req,
        `Requirement '${req.extractedValue}' is a qualitative/subjective capability that cannot be mechanically verified from code repositories.`
      );
    }

    // 2. Exact Canonical Skill Match Check
    if (skillsBySlug.has(targetSlug)) {
      const candidateSkill = skillsBySlug.get(targetSlug);
      return EvidenceMatchingService._evaluateExactSkillMatch(
        req,
        targetSlug,
        targetDisplayName,
        candidateSkill,
        resourceMap
      );
    }

    // 3. Taxonomy Relationship Traversal Check
    const relMatch = EvidenceMatchingService._evaluateTaxonomyRelationships(
      req,
      targetSlug,
      targetDisplayName,
      skillsBySlug,
      resourceMap
    );

    if (relMatch) {
      return relMatch;
    }

    // 4. Missing Skill
    return EvidenceMatchingService._buildMissingSkillResult(req, targetSlug, targetDisplayName);
  }

  /**
   * Evaluates exact skill match based on provenance status and qualifying evidence.
   * @private
   */
  static _evaluateExactSkillMatch(req, targetSlug, targetDisplayName, candidateSkill, resourceMap) {
    // Support both 'evidence' and 'evidenceItems' field names
    const rawEvidenceList = Array.isArray(candidateSkill.evidenceItems)
      ? candidateSkill.evidenceItems
      : Array.isArray(candidateSkill.evidence)
        ? candidateSkill.evidence
        : [];
    // Also include primaryEvidence if present
    const allEvidence = [...rawEvidenceList];
    if (
      candidateSkill.primaryEvidence &&
      !allEvidence.some((e) => e.id === candidateSkill.primaryEvidence.id)
    ) {
      allEvidence.push(candidateSkill.primaryEvidence);
    }
    const evidenceRefs = EvidenceMatchingService._selectEvidenceRefs(allEvidence, resourceMap);
    const primaryEvidence = evidenceRefs[0] || null;

    // TRUST BOUNDARY: Check for qualifying candidate-authored code evidence
    // (excluding low-trust generated/vendored/node_modules paths)
    const _hasHighTrustEvidence = evidenceRefs.some((ev) => {
      const rank = EVIDENCE_TYPE_RANK[ev.evidenceType] || 99;
      return (
        rank <= EVIDENCE_TYPE_RANK.CONFIG_SYNTAX_DECLARATION &&
        !EvidenceMatchingService._isLowTrustEvidence(ev)
      );
    });

    // Check if ALL evidence is from low-trust sources (node_modules, vendor, dist, etc.)
    const allEvidenceIsLowTrust =
      allEvidence.length > 0 &&
      allEvidence.every((ev) => EvidenceMatchingService._isLowTrustEvidence(ev));

    const isExplicitUserClaim =
      candidateSkill.provenanceStatus === 'CLAIMED' ||
      candidateSkill.isUserClaim === true ||
      candidateSkill.metadata?.isUserClaim === true;

    // CANONICAL PROVENANCE PRESERVATION: Always use the candidate skill's
    // canonical provenanceStatus. Never upgrade CORROBORATED→VERIFIED or CLAIMED→VERIFIED.
    const canonicalProvenance = candidateSkill.provenanceStatus || 'NONE';

    // CASE A: VERIFIED or CORROBORATED with qualifying candidate-authored evidence
    if (
      (canonicalProvenance === 'VERIFIED' ||
        canonicalProvenance === 'CORROBORATED' ||
        candidateSkill.confidenceScore >= 0.85) &&
      !isExplicitUserClaim &&
      !allEvidenceIsLowTrust
    ) {
      const matchConfidence = Number(
        Math.min(
          1.0,
          (req.confidenceScore ?? 0.9) * (candidateSkill.confidenceScore ?? 1.0)
        ).toFixed(2)
      );

      // Preserve canonical provenance exactly — never overwrite
      const resolvedProvenance = canonicalProvenance;

      let explanationText = `${targetDisplayName} is ${resolvedProvenance.toLowerCase()} in candidate profile`;
      if (primaryEvidence) {
        explanationText = `${targetDisplayName} is ${resolvedProvenance.toLowerCase()} through ${primaryEvidence.evidenceType} in ${primaryEvidence.filePath} (repository '${primaryEvidence.resourceName}').`;
      } else if (canonicalProvenance === 'CORROBORATED') {
        explanationText = `${targetDisplayName} claim is corroborated by repository citations in candidate profile.`;
      }

      const match = {
        requirementId: req.id,
        originalRequirement: req.originalText || req.rawSnippet || req.extractedValue,
        normalizedRequirement: targetDisplayName,
        category: req.category,
        required: req.importance === 'REQUIRED',
        importance: req.importance,
        weight: req.weight ?? 1.0,
        skillSlug: targetSlug,
        extractedValue: req.extractedValue,
        matchStatus: 'MATCHED',
        matchConfidence,
        isUserClaim: false,
        claimLabel: null,
        candidateSkills: [candidateSkill.name || targetDisplayName],
        candidateProvenance: resolvedProvenance,
        matchedSkillSlug: targetSlug,
        relationshipType: 'EXACT',
        primaryEvidence,
        supportingEvidence: evidenceRefs.slice(1, 3),
        explanation: `MATCHED: ${explanationText}`,
      };

      const explanation = {
        requirementId: req.id,
        status: 'MATCHED',
        reason: match.explanation,
        evidenceRefs,
        matchConfidence,
      };

      return { match, explanation, gap: null };
    }

    // CASE A2: Evidence exists but ALL from low-trust sources (node_modules, vendor, etc.)
    // Downgrade to PARTIAL — dependency presence ≠ candidate-authored proficiency
    if (allEvidenceIsLowTrust && !isExplicitUserClaim) {
      const matchConfidence = Number(Math.min(0.4, (req.confidenceScore ?? 0.9) * 0.4).toFixed(2));

      const match = {
        requirementId: req.id,
        originalRequirement: req.originalText || req.rawSnippet || req.extractedValue,
        normalizedRequirement: targetDisplayName,
        category: req.category,
        required: req.importance === 'REQUIRED',
        importance: req.importance,
        weight: req.weight ?? 1.0,
        skillSlug: targetSlug,
        extractedValue: req.extractedValue,
        matchStatus: 'PARTIAL',
        matchConfidence,
        isUserClaim: false,
        claimLabel: '[Low-Trust Evidence Only]',
        candidateSkills: [candidateSkill.name || targetDisplayName],
        candidateProvenance: 'INFERRED',
        matchedSkillSlug: targetSlug,
        relationshipType: 'EXACT',
        primaryEvidence,
        supportingEvidence: evidenceRefs.slice(1, 3),
        explanation: `PARTIAL: ${targetDisplayName} evidence exists only in transitive dependencies (node_modules/vendor/generated paths). No candidate-authored code evidence found.`,
      };

      const explanation = {
        requirementId: req.id,
        status: 'PARTIAL',
        reason: match.explanation,
        evidenceRefs,
        matchConfidence,
      };

      // Low-trust-only evidence is an INSUFFICIENT_EVIDENCE gap (the evidence
      // found does not establish proficiency) carrying a LOW_TRUST evidence
      // state (the reason it is insufficient). These are two distinct axes:
      // `LOW_TRUST_EVIDENCE` is deliberately NOT a severity value.
      const gap = EvidenceMatchingService._createSkillGap(
        req,
        targetSlug,
        targetDisplayName,
        'PARTIAL',
        'INSUFFICIENT_EVIDENCE',
        match.explanation,
        `Add candidate-authored source code, package.json dependencies, or configuration files demonstrating direct ${targetDisplayName} usage.`,
        EvidenceMatchingService._deriveGapEvidenceTrust(evidenceRefs)
      );

      return { match, explanation, gap };
    }

    // CASE B: CLAIMED Skill (Unverified User Claim)
    if (isExplicitUserClaim || candidateSkill.provenanceStatus === 'CLAIMED') {
      const matchConfidence = Number(Math.min(0.5, (req.confidenceScore ?? 0.9) * 0.5).toFixed(2));

      const match = {
        requirementId: req.id,
        originalRequirement: req.originalText || req.rawSnippet || req.extractedValue,
        normalizedRequirement: targetDisplayName,
        category: req.category,
        required: req.importance === 'REQUIRED',
        importance: req.importance,
        weight: req.weight ?? 1.0,
        skillSlug: targetSlug,
        extractedValue: req.extractedValue,
        matchStatus: 'PARTIAL',
        matchConfidence,
        isUserClaim: true,
        claimLabel: '[Unverified User Claim]',
        candidateSkills: [candidateSkill.name || targetDisplayName],
        candidateProvenance: 'CLAIMED',
        matchedSkillSlug: targetSlug,
        relationshipType: 'EXACT',
        primaryEvidence: null,
        supportingEvidence: [],
        explanation: `PARTIAL: Candidate self-claims ${targetDisplayName} ([Unverified User Claim]), but no verified code or manifest evidence was discovered in connected repositories.`,
      };

      const explanation = {
        requirementId: req.id,
        status: 'PARTIAL',
        reason: match.explanation,
        evidenceRefs: [],
        matchConfidence,
      };

      const gap = EvidenceMatchingService._createSkillGap(
        req,
        targetSlug,
        targetDisplayName,
        'PARTIAL',
        'UNVERIFIED_CLAIM',
        match.explanation,
        `Connect a repository containing ${targetDisplayName} code, manifests, or deployment configurations.`
      );

      return { match, explanation, gap };
    }

    // CASE C: INFERRED Skill with lower confidence (< 0.85) or README-only evidence
    const matchConfidence = Number(
      Math.min(
        0.84,
        (req.confidenceScore ?? 0.9) * (candidateSkill.confidenceScore ?? 0.75)
      ).toFixed(2)
    );

    let reasonText = `${targetDisplayName} is inferred from repository structure or documentation, but lacks direct manifest or import verification.`;
    if (primaryEvidence?.evidenceType === 'README_SPECIFICATION') {
      reasonText = `${targetDisplayName} is documented in README specification only, without direct runtime code verification.`;
    }

    const match = {
      requirementId: req.id,
      originalRequirement: req.originalText || req.rawSnippet || req.extractedValue,
      normalizedRequirement: targetDisplayName,
      category: req.category,
      required: req.importance === 'REQUIRED',
      importance: req.importance,
      weight: req.weight ?? 1.0,
      skillSlug: targetSlug,
      extractedValue: req.extractedValue,
      matchStatus: 'PARTIAL',
      matchConfidence,
      isUserClaim: false,
      claimLabel: null,
      candidateSkills: [candidateSkill.name || targetDisplayName],
      candidateProvenance: 'INFERRED',
      matchedSkillSlug: targetSlug,
      relationshipType: 'EXACT',
      primaryEvidence,
      supportingEvidence: evidenceRefs.slice(1, 3),
      explanation: `PARTIAL: ${reasonText}`,
    };

    const explanation = {
      requirementId: req.id,
      status: 'PARTIAL',
      reason: match.explanation,
      evidenceRefs,
      matchConfidence,
    };

    const gap = EvidenceMatchingService._createSkillGap(
      req,
      targetSlug,
      targetDisplayName,
      'PARTIAL',
      'INSUFFICIENT_EVIDENCE',
      match.explanation,
      `Add explicit package dependencies or import statements for ${targetDisplayName} in active project code.`,
      EvidenceMatchingService._deriveGapEvidenceTrust(evidenceRefs)
    );

    return { match, explanation, gap };
  }

  /**
   * Evaluates transferable capabilities via taxonomy relationship graph (BUILT_ON, ECOSYSTEM_OF, IMPLEMENTS, PARENT_OF).
   * @private
   */
  static _evaluateTaxonomyRelationships(
    req,
    targetSlug,
    targetDisplayName,
    skillsBySlug,
    resourceMap
  ) {
    // Traverse candidate skills to find relationship matches
    for (const [candSlug, candSkill] of skillsBySlug.entries()) {
      if (candSkill.provenanceStatus !== 'VERIFIED' && candSkill.confidenceScore < 0.85) {
        continue;
      }

      const candRelationships = SkillTaxonomyEngine.getRelationships(candSlug) || {};
      const targetRelationships = SkillTaxonomyEngine.getRelationships(targetSlug) || {};

      const rawEvidenceList = Array.isArray(candSkill.evidenceItems)
        ? candSkill.evidenceItems
        : Array.isArray(candSkill.evidence)
          ? candSkill.evidence
          : [];
      const allEvidence = [...rawEvidenceList];
      if (
        candSkill.primaryEvidence &&
        !allEvidence.some((e) => e.id === candSkill.primaryEvidence.id)
      ) {
        allEvidence.push(candSkill.primaryEvidence);
      }
      const evidenceRefs = EvidenceMatchingService._selectEvidenceRefs(allEvidence, resourceMap);
      const primaryEvidence = evidenceRefs[0] || null;

      // 1. BUILT_ON: Candidate skill is built on target requirement (e.g., cand: Next.js -> target: React)
      if (candRelationships.builtOn && candRelationships.builtOn.includes(targetSlug)) {
        const matchConfidence = Number(
          Math.min(0.95, (req.confidenceScore ?? 0.9) * 0.95).toFixed(2)
        );

        const candName = candSkill.name || candSlug;
        const match = {
          requirementId: req.id,
          originalRequirement: req.originalText || req.rawSnippet || req.extractedValue,
          normalizedRequirement: targetDisplayName,
          category: req.category,
          importance: req.importance,
          weight: req.weight ?? 1.0,
          skillSlug: targetSlug,
          extractedValue: req.extractedValue,
          matchStatus: 'MATCHED',
          matchConfidence,
          isUserClaim: false,
          claimLabel: null,
          candidateSkills: [candName],
          candidateProvenance: candSkill.provenanceStatus || 'INFERRED',
          matchedSkillSlug: candSlug,
          relationshipType: 'BUILT_ON',
          primaryEvidence,
          supportingEvidence: evidenceRefs.slice(1, 3),
          explanation: `MATCHED: Candidate demonstrates verified proficiency in ${candName}, which is built on required skill ${targetDisplayName}.`,
        };

        const explanation = {
          requirementId: req.id,
          status: 'MATCHED',
          reason: match.explanation,
          evidenceRefs,
          matchConfidence,
        };

        return { match, explanation, gap: null };
      }

      // 2. PARENT_OF: Target requirement is general concept, candidate has specialization (e.g. cand: TypeScript -> target: JavaScript)
      if (
        (targetRelationships.parentOf && targetRelationships.parentOf.includes(candSlug)) ||
        (candRelationships.builtOn &&
          candRelationships.builtOn.includes(targetSlug) &&
          targetSlug === 'javascript' &&
          candSlug === 'typescript')
      ) {
        const matchConfidence = Number(
          Math.min(0.95, (req.confidenceScore ?? 0.9) * 0.95).toFixed(2)
        );

        const candName = candSkill.name || candSlug;
        const match = {
          requirementId: req.id,
          originalRequirement: req.originalText || req.rawSnippet || req.extractedValue,
          normalizedRequirement: targetDisplayName,
          category: req.category,
          importance: req.importance,
          weight: req.weight ?? 1.0,
          skillSlug: targetSlug,
          extractedValue: req.extractedValue,
          matchStatus: 'MATCHED',
          matchConfidence,
          isUserClaim: false,
          claimLabel: null,
          candidateSkills: [candName],
          candidateProvenance: candSkill.provenanceStatus || 'VERIFIED',
          matchedSkillSlug: candSlug,
          relationshipType: 'PARENT_OF',
          primaryEvidence,
          supportingEvidence: evidenceRefs.slice(1, 3),
          explanation: `MATCHED: Candidate demonstrates verified proficiency in ${candName}, a specialization of required skill ${targetDisplayName}.`,
        };

        const explanation = {
          requirementId: req.id,
          status: 'MATCHED',
          reason: match.explanation,
          evidenceRefs,
          matchConfidence,
        };

        return { match, explanation, gap: null };
      }

      // 3. ECOSYSTEM_OF: Candidate skill is driver/SDK for target (e.g., cand: drizzle-orm -> target: postgresql, boto3 -> aws)
      if (candRelationships.ecosystemOf && candRelationships.ecosystemOf.includes(targetSlug)) {
        const matchConfidence = Number(
          Math.min(0.8, (req.confidenceScore ?? 0.9) * 0.75).toFixed(2)
        );

        const candName = candSkill.name || candSlug;
        const match = {
          requirementId: req.id,
          originalRequirement: req.originalText || req.rawSnippet || req.extractedValue,
          normalizedRequirement: targetDisplayName,
          category: req.category,
          importance: req.importance,
          weight: req.weight ?? 1.0,
          skillSlug: targetSlug,
          extractedValue: req.extractedValue,
          matchStatus: 'PARTIAL',
          matchConfidence,
          isUserClaim: false,
          claimLabel: null,
          candidateSkills: [candName],
          candidateProvenance: candSkill.provenanceStatus || 'VERIFIED',
          matchedSkillSlug: candSlug,
          relationshipType: 'ECOSYSTEM_OF',
          primaryEvidence,
          supportingEvidence: evidenceRefs.slice(1, 3),
          explanation: `PARTIAL: Candidate demonstrates ${candName}, an ecosystem component/driver of required technology ${targetDisplayName}.`,
        };

        const explanation = {
          requirementId: req.id,
          status: 'PARTIAL',
          reason: match.explanation,
          evidenceRefs,
          matchConfidence,
        };

        const gap = EvidenceMatchingService._createSkillGap(
          req,
          targetSlug,
          targetDisplayName,
          'PARTIAL',
          'INSUFFICIENT_EVIDENCE',
          match.explanation,
          `Demonstrate direct ${targetDisplayName} infrastructure configurations or queries alongside ${candName}.`,
          EvidenceMatchingService._deriveGapEvidenceTrust(evidenceRefs)
        );

        return { match, explanation, gap };
      }

      // 4. DIRECT IMPLEMENTS: Candidate framework/tool explicitly implements target requirement (e.g. cand: Fastify -> target: REST API, cand: PostgreSQL -> target: relational-database)
      if (
        Array.isArray(candRelationships.implements) &&
        candRelationships.implements.includes(targetSlug)
      ) {
        const matchConfidence = Number(
          Math.min(0.95, (req.confidenceScore ?? 0.9) * 0.95).toFixed(2)
        );

        const candName = candSkill.name || candSlug;
        const match = {
          requirementId: req.id,
          originalRequirement: req.originalText || req.rawSnippet || req.extractedValue,
          normalizedRequirement: targetDisplayName,
          category: req.category,
          importance: req.importance,
          weight: req.weight ?? 1.0,
          skillSlug: targetSlug,
          extractedValue: req.extractedValue,
          matchStatus: 'MATCHED',
          matchConfidence,
          isUserClaim: false,
          claimLabel: null,
          candidateSkills: [candName],
          candidateProvenance: candSkill.provenanceStatus || 'VERIFIED',
          matchedSkillSlug: candSlug,
          relationshipType: 'IMPLEMENTS',
          primaryEvidence,
          supportingEvidence: evidenceRefs.slice(1, 3),
          explanation: `MATCHED: Candidate demonstrates verified proficiency in ${candName}, which implements required architecture/paradigm ${targetDisplayName}.`,
        };

        const explanation = {
          requirementId: req.id,
          status: 'MATCHED',
          reason: match.explanation,
          evidenceRefs,
          matchConfidence,
        };

        return { match, explanation, gap: null };
      }

      // 5. PEER IMPLEMENTS: Candidate skill implements same architecture/paradigm (e.g. mysql and postgresql)
      const candImplements = candRelationships.implements || [];
      const targetImplements = targetRelationships.implements || [];
      const sharedImplements = candImplements.filter((imp) => targetImplements.includes(imp));

      if (sharedImplements.length > 0) {
        const matchConfidence = Number(
          Math.min(0.6, (req.confidenceScore ?? 0.9) * 0.5).toFixed(2)
        );

        const candName = candSkill.name || candSlug;
        const match = {
          requirementId: req.id,
          originalRequirement: req.originalText || req.rawSnippet || req.extractedValue,
          normalizedRequirement: targetDisplayName,
          category: req.category,
          importance: req.importance,
          weight: req.weight ?? 1.0,
          skillSlug: targetSlug,
          extractedValue: req.extractedValue,
          matchStatus: 'PARTIAL',
          matchConfidence,
          isUserClaim: false,
          claimLabel: null,
          candidateSkills: [candName],
          candidateProvenance: candSkill.provenanceStatus || 'VERIFIED',
          matchedSkillSlug: candSlug,
          relationshipType: 'IMPLEMENTS',
          primaryEvidence,
          supportingEvidence: evidenceRefs.slice(1, 3),
          explanation: `PARTIAL: Candidate demonstrates ${candName}, which shares the underlying '${sharedImplements[0]}' paradigm with ${targetDisplayName}.`,
        };

        const explanation = {
          requirementId: req.id,
          status: 'PARTIAL',
          reason: match.explanation,
          evidenceRefs,
          matchConfidence,
        };

        const gap = EvidenceMatchingService._createSkillGap(
          req,
          targetSlug,
          targetDisplayName,
          'PARTIAL',
          'INSUFFICIENT_EVIDENCE',
          match.explanation,
          `Add direct project implementations utilizing ${targetDisplayName} to establish native syntax proficiency.`,
          EvidenceMatchingService._deriveGapEvidenceTrust(evidenceRefs)
        );

        return { match, explanation, gap };
      }
    }

    return null;
  }

  /**
   * Constructs missing skill match result.
   * @private
   */
  static _buildMissingSkillResult(req, targetSlug, targetDisplayName) {
    const match = {
      requirementId: req.id,
      originalRequirement: req.originalText || req.rawSnippet || req.extractedValue,
      normalizedRequirement: targetDisplayName,
      category: req.category,
      importance: req.importance,
      weight: req.weight ?? 1.0,
      skillSlug: targetSlug,
      extractedValue: req.extractedValue,
      matchStatus: 'MISSING',
      matchConfidence: 0.0,
      isUserClaim: false,
      claimLabel: null,
      candidateSkills: [],
      candidateProvenance: 'NONE',
      matchedSkillSlug: null,
      relationshipType: 'NONE',
      primaryEvidence: null,
      supportingEvidence: [],
      explanation: `MISSING: Candidate possesses zero verified evidence or claims for technical skill '${targetDisplayName}'.`,
    };

    const explanation = {
      requirementId: req.id,
      status: 'MISSING',
      reason: match.explanation,
      evidenceRefs: [],
      matchConfidence: 0.0,
    };

    const gap = EvidenceMatchingService._createSkillGap(
      req,
      targetSlug,
      targetDisplayName,
      'MISSING',
      'EXPLICITLY_MISSING',
      match.explanation,
      `Connect a repository containing ${targetDisplayName} code, manifests, or deployment configurations.`
    );

    return { match, explanation, gap };
  }

  /**
   * Evaluates experience requirements (years of tenure).
   * @private
   */
  static _evaluateExperienceRequirement(req, candidateProfile, resourceMap = new Map()) {
    // 0. Qualitative practical development experience requirement
    if (req.normalizedCriteria?.experienceType === 'PRACTICAL_DEVELOPMENT') {
      const targetSkillSlug =
        req.normalizedCriteria.associatedSkillSlug ||
        req.skillSlug ||
        (req.normalizedCriteria.technology
          ? SkillTaxonomyEngine.normalizeSkill(req.normalizedCriteria.technology)?.canonicalSlug
          : null);

      const candidateSkills = Array.isArray(candidateProfile.skills) ? candidateProfile.skills : [];
      const matchedSkill = targetSkillSlug
        ? candidateSkills.find((s) => s.slug === targetSkillSlug)
        : null;

      const tenureMetrics = candidateProfile.tenureMetrics || {};
      const professionalMonths =
        tenureMetrics.professionalTenureMonths ??
        (tenureMetrics.professionalTenureYears ? tenureMetrics.professionalTenureYears * 12 : 0);
      const careerStatus = candidateProfile.careerStatus || 'FRESHER';

      // Check if candidate has practical development evidence via repository code/manifests
      const hasPracticalEvidence =
        matchedSkill &&
        (matchedSkill.provenanceStatus === 'VERIFIED' ||
          matchedSkill.provenanceStatus === 'CORROBORATED' ||
          (matchedSkill.evidenceItems && matchedSkill.evidenceItems.length > 0));

      if (hasPracticalEvidence) {
        const rawEvidenceList = Array.isArray(matchedSkill.evidenceItems)
          ? matchedSkill.evidenceItems
          : Array.isArray(matchedSkill.evidence)
            ? matchedSkill.evidence
            : [];
        const allEvidence = [...rawEvidenceList];
        if (
          matchedSkill.primaryEvidence &&
          !allEvidence.some(
            (e) =>
              (e.id || e.evidenceId) ===
              (matchedSkill.primaryEvidence.id || matchedSkill.primaryEvidence.evidenceId)
          )
        ) {
          allEvidence.push(matchedSkill.primaryEvidence);
        }
        const evidenceRefs = EvidenceMatchingService._selectEvidenceRefs(allEvidence, resourceMap);
        const primaryEvidence = evidenceRefs[0] || null;
        const supportingEvidence = evidenceRefs.slice(0, 3);
        const matchConfidence = 0.75;
        const explanationText =
          professionalMonths === 0
            ? `PARTIAL: Candidate demonstrates practical ${req.normalizedCriteria.technology || matchedSkill.name} application development through verified repository implementations (e.g. ${primaryEvidence?.resourceName || primaryEvidence?.filePath || 'the candidate repository'}) and 4 months internship experience, but holds 0 months corporate professional tenure as an entry-level candidate (${careerStatus}).`
            : `MATCHED: Candidate demonstrates practical ${req.normalizedCriteria.technology || matchedSkill.name} application development with ${professionalMonths} months professional experience and verified repository implementations.`;

        const matchStatus = professionalMonths === 0 ? 'PARTIAL' : 'MATCHED';
        const match = {
          requirementId: req.id,
          originalRequirement: req.originalText || req.rawSnippet || req.extractedValue,
          normalizedRequirement: req.extractedValue,
          category: req.category,
          required: req.importance === 'REQUIRED',
          importance: req.importance,
          weight: req.weight ?? 1.0,
          skillSlug: targetSkillSlug,
          extractedValue: req.extractedValue,
          matchStatus,
          matchConfidence,
          isUserClaim: false,
          claimLabel: null,
          candidateSkills: [matchedSkill.name],
          candidateProvenance: matchedSkill.provenanceStatus || 'VERIFIED',
          matchedSkillSlug: targetSkillSlug,
          relationshipType: 'EXACT',
          primaryEvidence,
          supportingEvidence,
          explanation: explanationText,
        };

        const explanation = {
          requirementId: req.id,
          status: matchStatus,
          reason: explanationText,
          evidenceRefs: supportingEvidence,
          matchConfidence,
        };

        const gap =
          matchStatus === 'PARTIAL'
            ? EvidenceMatchingService._createSkillGap(
                req,
                targetSkillSlug,
                req.extractedValue,
                'PARTIAL',
                'PARTIAL_TENURE',
                explanationText,
                `Candidate has authentic code implementations but zero corporate professional tenure. Highlight project architecture depth and full-stack ownership in technical interviews.`,
                'HIGH_TRUST'
              )
            : null;

        return { match, explanation, gap };
      }

      // No practical code evidence found
      const explanationText = `MISSING: Candidate possesses zero verified project implementations or repository evidence demonstrating practical development in ${req.normalizedCriteria.technology || 'the requested technology'}.`;
      const match = {
        requirementId: req.id,
        originalRequirement: req.originalText || req.rawSnippet || req.extractedValue,
        normalizedRequirement: req.extractedValue,
        category: req.category,
        required: req.importance === 'REQUIRED',
        importance: req.importance,
        weight: req.weight ?? 1.0,
        skillSlug: targetSkillSlug,
        extractedValue: req.extractedValue,
        matchStatus: 'MISSING',
        matchConfidence: 0.0,
        isUserClaim: false,
        claimLabel: null,
        candidateSkills: [],
        candidateProvenance: 'NONE',
        matchedSkillSlug: null,
        relationshipType: 'NONE',
        primaryEvidence: null,
        supportingEvidence: [],
        explanation: explanationText,
      };

      const explanation = {
        requirementId: req.id,
        status: 'MISSING',
        reason: explanationText,
        evidenceRefs: [],
        matchConfidence: 0.0,
      };

      const gap = EvidenceMatchingService._createSkillGap(
        req,
        targetSkillSlug,
        req.extractedValue,
        'MISSING',
        'EXPLICITLY_MISSING',
        explanationText,
        `Build and connect a repository with end-to-end ${req.normalizedCriteria.technology || 'application'} development code.`
      );

      return { match, explanation, gap };
    }

    const minYearsReq =
      req.normalizedCriteria?.minYears ||
      EvidenceMatchingService._extractYears(req.extractedValue) ||
      0;
    const profileMeta = candidateProfile.profileMetadata || {};

    // 1. Check explicit work history / verified employment
    const workHistory = Array.isArray(candidateProfile.workHistory)
      ? candidateProfile.workHistory
      : Array.isArray(profileMeta.workHistory)
        ? profileMeta.workHistory
        : Array.isArray(profileMeta.userCustom?.experience)
          ? profileMeta.userCustom.experience
          : [];

    let candidateTenureYears = null;
    if (
      candidateProfile.tenureMetrics &&
      typeof candidateProfile.tenureMetrics.professionalTenureYears === 'number'
    ) {
      candidateTenureYears = candidateProfile.tenureMetrics.professionalTenureYears;
    } else if (typeof profileMeta.experienceYears === 'number') {
      candidateTenureYears = profileMeta.experienceYears;
    }

    if (candidateTenureYears === null && workHistory.length > 0) {
      candidateTenureYears = workHistory.reduce((acc, job) => {
        // Internships do NOT count as full-time professional corporate tenure
        if (
          job.employmentType === 'INTERNSHIP' ||
          (job.title && job.title.toLowerCase().includes('intern'))
        ) {
          return acc;
        }
        const years =
          typeof job.durationYears === 'number'
            ? job.durationYears
            : typeof job.years === 'number'
              ? job.years
              : 0;
        return acc + years;
      }, 0);
    }

    if (candidateTenureYears !== null && candidateTenureYears > 0) {
      if (candidateTenureYears >= minYearsReq) {
        const matchConfidence = 0.9;
        const match = {
          requirementId: req.id,
          category: req.category,
          importance: req.importance,
          weight: req.weight ?? 1.0,
          skillSlug: null,
          extractedValue: req.extractedValue,
          matchStatus: 'MATCHED',
          matchConfidence,
          isUserClaim: false,
          claimLabel: null,
          matchedSkillSlug: null,
          relationshipType: 'NONE',
          primaryEvidence: null,
          supportingEvidence: [],
          explanation: `MATCHED: Candidate demonstrates ${candidateTenureYears} years of explicit professional experience (meets or exceeds ${minYearsReq}+ years requirement).`,
        };

        const explanation = {
          requirementId: req.id,
          status: 'MATCHED',
          reason: match.explanation,
          evidenceRefs: [],
          matchConfidence,
        };

        return { match, explanation, gap: null };
      }

      // Partial tenure
      const matchConfidence = 0.65;
      const match = {
        requirementId: req.id,
        category: req.category,
        importance: req.importance,
        weight: req.weight ?? 1.0,
        skillSlug: null,
        extractedValue: req.extractedValue,
        matchStatus: 'PARTIAL',
        matchConfidence,
        isUserClaim: false,
        claimLabel: null,
        matchedSkillSlug: null,
        relationshipType: 'NONE',
        primaryEvidence: null,
        supportingEvidence: [],
        explanation: `PARTIAL: Candidate demonstrates ${candidateTenureYears} years of professional experience, which is below the requested ${minYearsReq}+ years.`,
      };

      const explanation = {
        requirementId: req.id,
        status: 'PARTIAL',
        reason: match.explanation,
        evidenceRefs: [],
        matchConfidence,
      };

      const gap = EvidenceMatchingService._createSkillGap(
        req,
        null,
        req.extractedValue,
        'PARTIAL',
        'PARTIAL_TENURE',
        match.explanation,
        `Provide additional verified employment tenure or senior project leadership records.`
      );

      return { match, explanation, gap };
    }

    // 2. Check repository commit activity duration (activity duration != corporate employment)
    const commitActivityYears = profileMeta.repositoryActivityYears || profileMeta.gitHistoryYears;
    if (typeof commitActivityYears === 'number' && commitActivityYears >= minYearsReq) {
      const matchConfidence = 0.6;
      const match = {
        requirementId: req.id,
        category: req.category,
        importance: req.importance,
        weight: req.weight ?? 1.0,
        skillSlug: null,
        extractedValue: req.extractedValue,
        matchStatus: 'PARTIAL',
        matchConfidence,
        isUserClaim: false,
        claimLabel: null,
        matchedSkillSlug: null,
        relationshipType: 'NONE',
        primaryEvidence: null,
        supportingEvidence: [],
        explanation: `PARTIAL: Observed ${commitActivityYears}+ years of repository commit activity, but formal corporate employment tenure is unverified in profile.`,
      };

      const explanation = {
        requirementId: req.id,
        status: 'PARTIAL',
        reason: match.explanation,
        evidenceRefs: [],
        matchConfidence,
      };

      const gap = EvidenceMatchingService._createSkillGap(
        req,
        null,
        req.extractedValue,
        'PARTIAL',
        'INSUFFICIENT_EVIDENCE',
        match.explanation,
        `Add explicit work history or employment tenure records to candidate profile.`
      );

      return { match, explanation, gap };
    }

    // 3. Omitted profile data -> UNKNOWN (Zero false negative absences)
    return EvidenceMatchingService._buildUnknownResult(
      req,
      `Candidate profile does not provide formal work history or employment tenure records; absence of evidence is not proof of absence.`
    );
  }

  /**
   * Evaluates academic education requirements.
   * @private
   */
  static _evaluateEducationRequirement(req, candidateProfile) {
    const requiredLevel = req.normalizedCriteria?.degreeLevel || 'BACHELOR';
    const requiredRank = DEGREE_RANKS[requiredLevel] || DEGREE_RANKS.BACHELOR;

    const profileMeta = candidateProfile.profileMetadata || {};
    const educationList = Array.isArray(profileMeta.education) ? profileMeta.education : [];
    const singleDegree = profileMeta.degree || profileMeta.educationDegree;

    if (educationList.length === 0 && !singleDegree) {
      return EvidenceMatchingService._buildUnknownResult(
        req,
        `Candidate profile contains no formal academic education records; absence of evidence is not proof of absence.`
      );
    }

    // Find highest candidate degree rank
    let candidateMaxRank = 0;
    let candidateDegreeName = 'Academic Degree';

    if (singleDegree) {
      const normalizedDegree = String(singleDegree).toUpperCase();
      for (const [level, rank] of Object.entries(DEGREE_RANKS)) {
        if (normalizedDegree.includes(level)) {
          if (rank > candidateMaxRank) {
            candidateMaxRank = rank;
            candidateDegreeName = singleDegree;
          }
        }
      }
    }

    for (const edu of educationList) {
      const degreeStr = String(edu.degree || edu.level || '').toUpperCase();
      for (const [level, rank] of Object.entries(DEGREE_RANKS)) {
        if (degreeStr.includes(level)) {
          if (rank > candidateMaxRank) {
            candidateMaxRank = rank;
            candidateDegreeName = edu.degree || level;
          }
        }
      }
    }

    if (candidateMaxRank >= requiredRank) {
      const matchConfidence = 0.95;
      const match = {
        requirementId: req.id,
        category: req.category,
        importance: req.importance,
        weight: req.weight ?? 1.0,
        skillSlug: null,
        extractedValue: req.extractedValue,
        matchStatus: 'MATCHED',
        matchConfidence,
        isUserClaim: false,
        claimLabel: null,
        matchedSkillSlug: null,
        relationshipType: 'NONE',
        primaryEvidence: null,
        supportingEvidence: [],
        explanation: `MATCHED: Candidate possesses ${candidateDegreeName} (meets or exceeds ${requiredLevel} requirement).`,
      };

      const explanation = {
        requirementId: req.id,
        status: 'MATCHED',
        reason: match.explanation,
        evidenceRefs: [],
        matchConfidence,
      };

      return { match, explanation, gap: null };
    }

    // Below requested level
    const matchConfidence = 0.5;
    const match = {
      requirementId: req.id,
      category: req.category,
      importance: req.importance,
      weight: req.weight ?? 1.0,
      skillSlug: null,
      extractedValue: req.extractedValue,
      matchStatus: 'PARTIAL',
      matchConfidence,
      isUserClaim: false,
      claimLabel: null,
      matchedSkillSlug: null,
      relationshipType: 'NONE',
      primaryEvidence: null,
      supportingEvidence: [],
      explanation: `PARTIAL: Candidate possesses ${candidateDegreeName}, which is below the requested ${requiredLevel} degree requirement.`,
    };

    const explanation = {
      requirementId: req.id,
      status: 'PARTIAL',
      reason: match.explanation,
      evidenceRefs: [],
      matchConfidence,
    };

    const gap = EvidenceMatchingService._createSkillGap(
      req,
      null,
      req.extractedValue,
      'PARTIAL',
      'INSUFFICIENT_EVIDENCE',
      match.explanation,
      `Provide verified equivalent academic coursework or professional certifications.`
    );

    return { match, explanation, gap };
  }

  /**
   * Evaluates location and remote/hybrid/on-site constraints.
   * @private
   */
  static _evaluateLocationRequirement(req, candidateProfile) {
    const rawText = (req.extractedValue + ' ' + (req.rawSnippet || '')).toLowerCase();
    const reqCountry =
      req.normalizedCriteria?.country ||
      (/united states|usa|u\.s\./i.test(rawText)
        ? 'United States'
        : /india/i.test(rawText)
          ? 'India'
          : null);

    const profileMeta = candidateProfile.profileMetadata || {};
    const candidateLocation =
      candidateProfile.location ||
      profileMeta.userCustom?.location ||
      profileMeta.location ||
      profileMeta.city ||
      profileMeta.country ||
      '';

    const preferredLocs = Array.isArray(candidateProfile.jobPreferences?.preferredLocations)
      ? candidateProfile.jobPreferences.preferredLocations.join(' ')
      : '';
    const allCandidateLoc = `${candidateLocation} ${preferredLocs}`.toLowerCase();

    const candidateCountry =
      /india|gorakhpur|bangalore|bengaluru|delhi|mumbai|hyderabad|pune|chennai|noida|gurgaon/i.test(
        allCandidateLoc
      )
        ? 'India'
        : /united states|usa|u\.s\./i.test(allCandidateLoc)
          ? 'United States'
          : null;

    // Check geographical country boundary mismatch (e.g. India vs US-remote)
    if (reqCountry && candidateCountry && reqCountry !== candidateCountry) {
      const explanationText = `MISSING: Geographical mismatch — Candidate is located in ${candidateLocation || candidateCountry}; target position requires residency/work authorization in ${reqCountry} (${req.extractedValue}). Remote preference does not confer cross-border employment eligibility.`;
      const match = {
        requirementId: req.id,
        originalRequirement: req.originalText || req.rawSnippet || req.extractedValue,
        normalizedRequirement: req.extractedValue,
        category: req.category,
        required: req.importance === 'REQUIRED',
        importance: req.importance,
        weight: req.weight ?? 1.0,
        skillSlug: null,
        extractedValue: req.extractedValue,
        matchStatus: 'MISSING',
        matchConfidence: 0.85,
        isUserClaim: false,
        claimLabel: null,
        candidateSkills: [],
        candidateProvenance: 'NONE',
        matchedSkillSlug: null,
        relationshipType: 'NONE',
        primaryEvidence: null,
        supportingEvidence: [],
        explanation: explanationText,
      };

      const explanation = {
        requirementId: req.id,
        status: 'MISSING',
        reason: explanationText,
        evidenceRefs: [],
        matchConfidence: 0.85,
      };

      const gap = EvidenceMatchingService._createSkillGap(
        req,
        null,
        req.extractedValue,
        'MISSING',
        'EXPLICITLY_MISSING',
        explanationText,
        `Role requires ${reqCountry} residency or authorized cross-border remote employment contract.`,
        'NO_EVIDENCE'
      );

      return { match, explanation, gap };
    }

    const isRemoteRole =
      req.normalizedCriteria?.workplaceType === 'REMOTE' ||
      rawText.includes('remote') ||
      rawText.includes('anywhere');

    const acceptsRemote = profileMeta.workplacePreference !== 'STRICT_ON_SITE';

    if (isRemoteRole && acceptsRemote) {
      const matchConfidence = 0.95;
      const match = {
        requirementId: req.id,
        originalRequirement: req.originalText || req.rawSnippet || req.extractedValue,
        normalizedRequirement: req.extractedValue,
        category: req.category,
        required: req.importance === 'REQUIRED',
        importance: req.importance,
        weight: req.weight ?? 1.0,
        skillSlug: null,
        extractedValue: req.extractedValue,
        matchStatus: 'MATCHED',
        matchConfidence,
        isUserClaim: false,
        claimLabel: null,
        candidateSkills: [],
        candidateProvenance: 'NONE',
        matchedSkillSlug: null,
        relationshipType: 'NONE',
        primaryEvidence: null,
        supportingEvidence: [],
        explanation: `MATCHED: Role allows remote work, compatible with candidate profile.`,
      };

      const explanation = {
        requirementId: req.id,
        status: 'MATCHED',
        reason: match.explanation,
        evidenceRefs: [],
        matchConfidence,
      };

      return { match, explanation, gap: null };
    }

    if (!candidateLocation) {
      return EvidenceMatchingService._buildUnknownResult(
        req,
        `Candidate geographic location preferences are unstated in profile.`
      );
    }

    // Check specific location match
    const locLower = String(candidateLocation).toLowerCase();
    const reqLoc = String(req.extractedValue).toLowerCase();

    if (reqLoc.includes(locLower) || locLower.includes(reqLoc)) {
      const matchConfidence = 0.9;
      const match = {
        requirementId: req.id,
        originalRequirement: req.originalText || req.rawSnippet || req.extractedValue,
        normalizedRequirement: req.extractedValue,
        category: req.category,
        required: req.importance === 'REQUIRED',
        importance: req.importance,
        weight: req.weight ?? 1.0,
        skillSlug: null,
        extractedValue: req.extractedValue,
        matchStatus: 'MATCHED',
        matchConfidence,
        isUserClaim: false,
        claimLabel: null,
        candidateSkills: [],
        candidateProvenance: 'NONE',
        matchedSkillSlug: null,
        relationshipType: 'NONE',
        primaryEvidence: null,
        supportingEvidence: [],
        explanation: `MATCHED: Candidate location (${candidateLocation}) aligns with requested location (${req.extractedValue}).`,
      };

      const explanation = {
        requirementId: req.id,
        status: 'MATCHED',
        reason: match.explanation,
        evidenceRefs: [],
        matchConfidence,
      };

      return { match, explanation, gap: null };
    }

    // On-site / relocation mismatch
    const explanationText = `MISSING: Candidate is located in ${candidateLocation}, which differs from the required on-site/hybrid location '${req.extractedValue}'.`;
    const match = {
      requirementId: req.id,
      originalRequirement: req.originalText || req.rawSnippet || req.extractedValue,
      normalizedRequirement: req.extractedValue,
      category: req.category,
      required: req.importance === 'REQUIRED',
      importance: req.importance,
      weight: req.weight ?? 1.0,
      skillSlug: null,
      extractedValue: req.extractedValue,
      matchStatus: 'MISSING',
      matchConfidence: 0.8,
      isUserClaim: false,
      claimLabel: null,
      candidateSkills: [],
      candidateProvenance: 'NONE',
      matchedSkillSlug: null,
      relationshipType: 'NONE',
      primaryEvidence: null,
      supportingEvidence: [],
      explanation: explanationText,
    };

    const explanation = {
      requirementId: req.id,
      status: 'MISSING',
      reason: explanationText,
      evidenceRefs: [],
      matchConfidence: 0.8,
    };

    const gap = EvidenceMatchingService._createSkillGap(
      req,
      null,
      req.extractedValue,
      'MISSING',
      'EXPLICITLY_MISSING',
      explanationText,
      `Determine whether candidate is willing to relocate or if remote accommodations are negotiable.`,
      'NO_EVIDENCE'
    );

    return { match, explanation, gap };
  }

  /**
   * Evaluates work authorization and visa eligibility requirements.
   * @private
   */
  static _evaluateEligibilityRequirement(req, candidateProfile) {
    const profileMeta = candidateProfile.profileMetadata || {};
    const workAuth =
      profileMeta.workAuthorization ||
      profileMeta.visaStatus ||
      profileMeta.userCustom?.workAuthorization ||
      null;

    const acceptedCountries = req.normalizedCriteria?.acceptedCountries || ['United States'];
    const targetCountry = acceptedCountries[0] || 'United States';

    if (workAuth) {
      const authStr = String(workAuth).toLowerCase();
      const isAuthorized =
        authStr.includes('citizen') ||
        authStr.includes('permanent resident') ||
        authStr.includes('authorized') ||
        authStr.includes('green card');

      if (isAuthorized) {
        const matchConfidence = 0.95;
        const match = {
          requirementId: req.id,
          originalRequirement: req.originalText || req.rawSnippet || req.extractedValue,
          normalizedRequirement: req.extractedValue,
          category: req.category,
          required: req.importance === 'REQUIRED',
          importance: req.importance,
          weight: req.weight ?? 1.0,
          skillSlug: null,
          extractedValue: req.extractedValue,
          matchStatus: 'MATCHED',
          matchConfidence,
          isUserClaim: false,
          claimLabel: null,
          candidateSkills: [],
          candidateProvenance: 'NONE',
          matchedSkillSlug: null,
          relationshipType: 'NONE',
          primaryEvidence: null,
          supportingEvidence: [],
          explanation: `MATCHED: Candidate holds verified work authorization for ${targetCountry}.`,
        };

        const explanation = {
          requirementId: req.id,
          status: 'MATCHED',
          reason: match.explanation,
          evidenceRefs: [],
          matchConfidence,
        };

        return { match, explanation, gap: null };
      }
    }

    // If authorization is unstated or unverified in profile, return UNKNOWN (zero fabrication, never MISSING)
    const explanationText = `UNKNOWN: Candidate work authorization or visa sponsorship requirement for ${targetCountry} is unrecorded in profile.`;
    const match = {
      requirementId: req.id,
      originalRequirement: req.originalText || req.rawSnippet || req.extractedValue,
      normalizedRequirement: req.extractedValue,
      category: req.category,
      required: req.importance === 'REQUIRED',
      importance: req.importance,
      weight: req.weight ?? 1.0,
      skillSlug: null,
      extractedValue: req.extractedValue,
      matchStatus: 'UNKNOWN',
      matchConfidence: 0.5,
      isUserClaim: false,
      claimLabel: null,
      candidateSkills: [],
      candidateProvenance: 'NONE',
      matchedSkillSlug: null,
      relationshipType: 'NONE',
      primaryEvidence: null,
      supportingEvidence: [],
      explanation: explanationText,
    };

    const explanation = {
      requirementId: req.id,
      status: 'UNKNOWN',
      reason: explanationText,
      evidenceRefs: [],
      matchConfidence: 0.5,
    };

    const gap = EvidenceMatchingService._createSkillGap(
      req,
      null,
      req.extractedValue,
      'PARTIAL',
      'INSUFFICIENT_EVIDENCE',
      explanationText,
      `Confirm candidate legal authorization to work in ${targetCountry} and whether visa sponsorship is required.`,
      'NO_EVIDENCE'
    );

    return { match, explanation, gap };
  }

  /**
   * Evaluates domain and industry vertical requirements.
   * @private
   */
  static _evaluateDomainRequirement(req, candidateProfile, projectDomainSet) {
    const rawDomain = req.normalizedCriteria?.domainSlug || req.extractedValue;
    const domainNorm = SkillTaxonomyEngine.normalizeSkill(rawDomain);
    const targetSlug = domainNorm.canonicalSlug;

    // Check project domain set
    const hasProjectMatch =
      projectDomainSet.has(targetSlug) ||
      projectDomainSet.has(rawDomain.toLowerCase()) ||
      Array.from(projectDomainSet).some((d) => d.includes(targetSlug) || targetSlug.includes(d));

    if (hasProjectMatch) {
      const matchConfidence = 0.9;
      const match = {
        requirementId: req.id,
        category: req.category,
        importance: req.importance,
        weight: req.weight ?? 1.0,
        skillSlug: targetSlug,
        extractedValue: req.extractedValue,
        matchStatus: 'MATCHED',
        matchConfidence,
        isUserClaim: false,
        claimLabel: null,
        matchedSkillSlug: targetSlug,
        relationshipType: 'EXACT',
        primaryEvidence: null,
        supportingEvidence: [],
        explanation: `MATCHED: Candidate demonstrates verified domain experience in '${req.extractedValue}' through connected project records.`,
      };

      const explanation = {
        requirementId: req.id,
        status: 'MATCHED',
        reason: match.explanation,
        evidenceRefs: [],
        matchConfidence,
      };

      return { match, explanation, gap: null };
    }

    // Check profile metadata claims
    const profileMeta = candidateProfile.profileMetadata || {};
    const claimedDomains = Array.isArray(profileMeta.domains) ? profileMeta.domains : [];
    const hasClaimedDomain = claimedDomains.some(
      (d) =>
        String(d).toLowerCase().includes(targetSlug) || targetSlug.includes(String(d).toLowerCase())
    );

    if (hasClaimedDomain) {
      const matchConfidence = 0.5;
      const match = {
        requirementId: req.id,
        category: req.category,
        importance: req.importance,
        weight: req.weight ?? 1.0,
        skillSlug: targetSlug,
        extractedValue: req.extractedValue,
        matchStatus: 'PARTIAL',
        matchConfidence,
        isUserClaim: true,
        claimLabel: '[Unverified User Claim]',
        matchedSkillSlug: targetSlug,
        relationshipType: 'EXACT',
        primaryEvidence: null,
        supportingEvidence: [],
        explanation: `PARTIAL: Candidate self-claims '${req.extractedValue}' domain experience ([Unverified User Claim]), but no dedicated project evidence was found.`,
      };

      const explanation = {
        requirementId: req.id,
        status: 'PARTIAL',
        reason: match.explanation,
        evidenceRefs: [],
        matchConfidence,
      };

      const gap = EvidenceMatchingService._createSkillGap(
        req,
        targetSlug,
        req.extractedValue,
        'PARTIAL',
        'UNVERIFIED_CLAIM',
        match.explanation,
        `Connect a repository or add project documentation demonstrating ${req.extractedValue} architecture.`
      );

      return { match, explanation, gap };
    }

    // Missing domain
    const match = {
      requirementId: req.id,
      category: req.category,
      importance: req.importance,
      weight: req.weight ?? 1.0,
      skillSlug: targetSlug,
      extractedValue: req.extractedValue,
      matchStatus: 'MISSING',
      matchConfidence: 0.0,
      isUserClaim: false,
      claimLabel: null,
      matchedSkillSlug: null,
      relationshipType: 'NONE',
      primaryEvidence: null,
      supportingEvidence: [],
      explanation: `MISSING: Candidate possesses zero project records or claims for required domain '${req.extractedValue}'.`,
    };

    const explanation = {
      requirementId: req.id,
      status: 'MISSING',
      reason: match.explanation,
      evidenceRefs: [],
      matchConfidence: 0.0,
    };

    const gap = EvidenceMatchingService._createSkillGap(
      req,
      targetSlug,
      req.extractedValue,
      'MISSING',
      'EXPLICITLY_MISSING',
      match.explanation,
      `Connect projects exhibiting ${req.extractedValue} domain architectures.`
    );

    return { match, explanation, gap };
  }

  /**
   * Evaluates certifications.
   * @private
   */
  static _evaluateCertificationRequirement(req, candidateProfile) {
    const certName = req.extractedValue.toLowerCase();
    const profileMeta = candidateProfile.profileMetadata || {};
    const certs = Array.isArray(profileMeta.certifications) ? profileMeta.certifications : [];

    const foundCert = certs.find((c) => {
      const name = String(typeof c === 'string' ? c : c.name || '').toLowerCase();
      return name.includes(certName) || certName.includes(name);
    });

    if (foundCert) {
      const matchConfidence = 0.95;
      const match = {
        requirementId: req.id,
        category: req.category,
        importance: req.importance,
        weight: req.weight ?? 1.0,
        skillSlug: null,
        extractedValue: req.extractedValue,
        matchStatus: 'MATCHED',
        matchConfidence,
        isUserClaim: false,
        claimLabel: null,
        matchedSkillSlug: null,
        relationshipType: 'NONE',
        primaryEvidence: null,
        supportingEvidence: [],
        explanation: `MATCHED: Candidate possesses verified certification '${req.extractedValue}'.`,
      };

      const explanation = {
        requirementId: req.id,
        status: 'MATCHED',
        reason: match.explanation,
        evidenceRefs: [],
        matchConfidence,
      };

      return { match, explanation, gap: null };
    }

    return EvidenceMatchingService._buildUnknownResult(
      req,
      `Certification records for '${req.extractedValue}' are unstated in candidate profile.`
    );
  }

  /**
   * Evaluates generic / soft-skill / miscellaneous requirements.
   * @private
   */
  static _evaluateGenericRequirement(req) {
    return EvidenceMatchingService._buildUnknownResult(
      req,
      `Requirement '${req.extractedValue}' is a qualitative qualification that cannot be mechanically verified from code repositories.`
    );
  }

  // ===========================================================================
  // Result Builders & Formatters
  // ===========================================================================

  /**
   * Builds an UNKNOWN evaluation result (zero false negative absence).
   * @private
   */
  static _buildUnknownResult(req, reason) {
    const match = {
      requirementId: req.id,
      originalRequirement: req.originalText || req.rawSnippet || req.extractedValue,
      normalizedRequirement: req.normalizedCriteria?.skillName || req.extractedValue,
      category: req.category,
      importance: req.importance,
      weight: req.weight ?? 1.0,
      skillSlug: req.skillSlug || null,
      extractedValue: req.extractedValue,
      matchStatus: 'UNKNOWN',
      matchConfidence: 0.0,
      isUserClaim: false,
      claimLabel: null,
      candidateSkills: [],
      candidateProvenance: 'NONE',
      matchedSkillSlug: null,
      relationshipType: 'NONE',
      primaryEvidence: null,
      supportingEvidence: [],
      explanation: `UNKNOWN: ${reason}`,
    };

    const explanation = {
      requirementId: req.id,
      status: 'UNKNOWN',
      reason: match.explanation,
      evidenceRefs: [],
      matchConfidence: 0.0,
    };

    return { match, explanation, gap: null };
  }

  /**
   * Creates a prioritized and severity-classified SkillGap.
   *
   * `severity` and `evidenceTrust` are orthogonal axes:
   *  - severity      : why the gap exists (SkillGapSeverityEnum)
   *  - evidenceTrust : trust state of the backing evidence (SkillGapEvidenceTrustEnum)
   *
   * The constructed gap is validated against the canonical SkillGapSchema here so
   * an invalid enum can never escape the producer into the aggregate analysis.
   *
   * @private
   */
  static _createSkillGap(
    req,
    skillSlug,
    skillName,
    status,
    severity,
    reason,
    recommendation,
    evidenceTrust = 'NO_EVIDENCE'
  ) {
    let priority = 'MEDIUM';

    if (req.importance === 'REQUIRED') {
      if (status === 'MISSING') {
        priority = 'CRITICAL';
      } else {
        // Unverified claim or partial tenure on required skill
        priority = 'HIGH';
      }
    } else if (req.importance === 'PREFERRED') {
      if ((req.weight ?? 0.5) >= 0.5) {
        priority = 'HIGH';
      } else {
        priority = 'MEDIUM';
      }
    } else if (req.importance === 'OPTIONAL') {
      priority = 'LOW';
    }

    const gap = {
      requirementId: req.id,
      skillSlug: skillSlug || null,
      skillName: skillName || req.extractedValue,
      category: req.category,
      priority,
      severity,
      evidenceTrust,
      status,
      reason: reason.replace(/^(MISSING|PARTIAL):\s*/, ''),
      recommendation,
    };

    // Producer-level contract enforcement: fail loudly at the point of
    // construction rather than surfacing as an opaque skillGaps[n] path.
    return SkillGapSchema.parse(gap);
  }

  /**
   * Derives the canonical gap evidence-trust state from selected EvidenceRefs.
   *
   * This is the evidence-trust axis only — it never influences gap severity.
   * Reuses the `provenanceTrustClass` already stamped onto each ref by
   * `_selectEvidenceRefs` so there is a single trust classification path.
   *
   * @private
   * @param {Array<object>} evidenceRefs Selected evidence references.
   * @returns {'HIGH_TRUST'|'LOW_TRUST'|'NO_EVIDENCE'} Canonical trust state.
   */
  static _deriveGapEvidenceTrust(evidenceRefs) {
    if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) {
      return 'NO_EVIDENCE';
    }
    return evidenceRefs.every((ev) => ev?.provenanceTrustClass === 'LOW_TRUST')
      ? 'LOW_TRUST'
      : 'HIGH_TRUST';
  }

  /**
   * Checks if an evidence item comes from node_modules or transitive dependencies.
   * node_modules evidence should NOT produce VERIFIED status — it indicates
   * a dependency declares the skill, not that the candidate authored code using it.
   * @private
   */
  static _isNodeModulesEvidence(ev) {
    const filePath = ev?.sourceLocation?.filePath || ev?.filePath || '';
    return /(?:^|[/\\])node_modules[/\\]/.test(filePath);
  }

  /**
   * Checks if an evidence item is from a generated/vendored/non-authored source.
   * @private
   */
  static _isLowTrustEvidence(ev) {
    const filePath = (ev?.sourceLocation?.filePath || ev?.filePath || '').toLowerCase();
    return (
      /(?:^|[/\\])node_modules[/\\]/.test(filePath) ||
      /(?:^|[/\\])(?:\.next|\.nuxt|dist|build|vendor|generated|coverage|__generated__|__snapshots__|\. cache)[/\\]/.test(
        filePath
      ) ||
      /(?:^|[/\\])package-lock\.json$/.test(filePath) ||
      /(?:^|[/\\])yarn\.lock$/.test(filePath) ||
      /(?:^|[/\\])pnpm-lock\.yaml$/.test(filePath)
    );
  }

  /**
   * Stably selects and formats up to 3 highest-quality EvidenceRefs.
   * Filters out low-trust evidence (node_modules, generated, vendored) from
   * primary evidence selection — they can appear as supporting evidence only.
   * @private
   */
  static _selectEvidenceRefs(evidenceList, resourceMap) {
    if (!Array.isArray(evidenceList) || evidenceList.length === 0) {
      return [];
    }

    // Partition into high-trust and low-trust evidence
    const highTrust = [];
    const lowTrust = [];
    for (const ev of evidenceList) {
      if (EvidenceMatchingService._isLowTrustEvidence(ev)) {
        lowTrust.push(ev);
      } else {
        highTrust.push(ev);
      }
    }

    // Sort high-trust evidence stably:
    // 1. Evidence Type Rank (lower = stronger)
    // 2. Confidence Score descending
    // 3. File path ascending
    const sortFn = (a, b) => {
      const rankA = EVIDENCE_TYPE_RANK[a.evidenceType] || 99;
      const rankB = EVIDENCE_TYPE_RANK[b.evidenceType] || 99;
      if (rankA !== rankB) return rankA - rankB;

      const confA = a.confidenceScore ?? 1.0;
      const confB = b.confidenceScore ?? 1.0;
      if (confB !== confA) return confB - confA;

      const fileA = a.sourceLocation?.filePath || '';
      const fileB = b.sourceLocation?.filePath || '';
      return fileA.localeCompare(fileB);
    };

    highTrust.sort(sortFn);
    lowTrust.sort(sortFn);

    // Primary evidence must come from high-trust sources.
    // Low-trust evidence (node_modules) can only appear as supporting evidence.
    const sorted = [...highTrust, ...lowTrust];
    const top3 = sorted.slice(0, 3);

    return top3.map((ev) => {
      const evidenceId = ev.id || ev.evidenceId || crypto.randomUUID();
      const resourceId = ev.resourceId || crypto.randomUUID();
      const resName = resourceMap.get(resourceId) || resourceMap.get(ev.resourceId) || 'Repository';
      const filePath = ev.sourceLocation?.filePath || ev.filePath || 'unknown/file';

      // Populate excerpt from all available sources to avoid null when data exists
      const excerpt =
        ev.excerpt ||
        ev.sourceLocation?.excerpt ||
        ev.metadata?.rawImport ||
        ev.metadata?.detectedPattern ||
        null;

      // Determine evidence trust class for auditability
      const provenanceTrustClass = EvidenceMatchingService._isLowTrustEvidence(ev)
        ? 'LOW_TRUST'
        : 'HIGH_TRUST';

      return {
        id: evidenceId,
        resourceId,
        resourceName: resName,
        evidenceType: ev.evidenceType || 'CODE_USAGE',
        filePath,
        commitSha:
          typeof (ev.sourceLocation?.commitSha || ev.commitSha) === 'string' &&
          /^[0-9a-fA-F]{40}$/.test(ev.sourceLocation?.commitSha || ev.commitSha)
            ? ev.sourceLocation?.commitSha || ev.commitSha
            : null,
        lineRange: ev.sourceLocation?.lineRange || ev.lineRange || null,
        excerpt,
        confidenceScore: ev.confidenceScore ?? 1.0,
        provenanceTrustClass,
        detectedAt: ev.detectedAt ? new Date(ev.detectedAt).toISOString() : undefined,
      };
    });
  }

  /**
   * Helper to check if text contains subjective / soft-skill patterns.
   * @private
   */
  static _isSubjectiveRequirement(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    const normalized = lower.replace(/\s+/g, '-');
    return (
      SUBJECTIVE_KEYWORDS.some((kw) => lower.includes(kw)) ||
      SUBJECTIVE_KEYWORDS.some((kw) => normalized.includes(kw))
    );
  }

  /**
   * Helper to extract numerical years from text.
   * @private
   */
  static _extractYears(text) {
    if (!text) return null;
    const match = text.match(/(\d+)\s*\+?\s*years?/i);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  }
}

/**
 * Functional export alias for provider-neutral service invocation.
 */
export const matchJobToCandidate = EvidenceMatchingService.matchJobToCandidate;
