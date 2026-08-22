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

import { logger } from '../utils/logger.js';
import { ValidationError, NotFoundError } from '../errors/index.js';
import { SkillTaxonomyEngine } from '../domain/career/skill-taxonomy.js';
import { CandidateMatchAnalysisSchema } from '../domain/career/evidence-matching.schemas.js';

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
        // If skill with same canonical slug already exists, prefer VERIFIED over CLAIMED
        if (skillsBySlug.has(canonicalSlug)) {
          const existing = skillsBySlug.get(canonicalSlug);
          if (existing.provenanceStatus !== 'VERIFIED' && skill.provenanceStatus === 'VERIFIED') {
            skillsBySlug.set(canonicalSlug, skill);
          }
        } else {
          skillsBySlug.set(canonicalSlug, skill);
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
        return EvidenceMatchingService._evaluateExperienceRequirement(req, candidateProfile);
      case 'EDUCATION':
        return EvidenceMatchingService._evaluateEducationRequirement(req, candidateProfile);
      case 'LOCATION':
        return EvidenceMatchingService._evaluateLocationRequirement(req, candidateProfile);
      case 'DOMAIN':
        return EvidenceMatchingService._evaluateDomainRequirement(
          req,
          candidateProfile,
          projectDomainSet
        );
      case 'CERTIFICATION':
        return EvidenceMatchingService._evaluateCertificationRequirement(req, candidateProfile);
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
    if (EvidenceMatchingService._isSubjectiveRequirement(req.extractedValue || req.rawSnippet)) {
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
    const rawEvidenceList = Array.isArray(candidateSkill.evidence) ? candidateSkill.evidence : [];
    const evidenceRefs = EvidenceMatchingService._selectEvidenceRefs(rawEvidenceList, resourceMap);
    const primaryEvidence = evidenceRefs[0] || null;

    // Check for qualifying technical code evidence
    const hasQualifyingCodeEvidence = evidenceRefs.some((ev) => {
      const rank = EVIDENCE_TYPE_RANK[ev.evidenceType] || 99;
      return rank <= EVIDENCE_TYPE_RANK.CONFIG_SYNTAX_DECLARATION;
    });

    const isExplicitUserClaim =
      candidateSkill.provenanceStatus === 'CLAIMED' ||
      candidateSkill.isUserClaim === true ||
      candidateSkill.metadata?.isUserClaim === true;

    // CASE A: VERIFIED with qualifying code evidence
    if (
      (candidateSkill.provenanceStatus === 'VERIFIED' || candidateSkill.confidenceScore >= 0.85) &&
      (hasQualifyingCodeEvidence || candidateSkill.provenanceStatus === 'VERIFIED') &&
      !isExplicitUserClaim
    ) {
      const matchConfidence = Number(
        Math.min(
          1.0,
          (req.confidenceScore ?? 0.9) * (candidateSkill.confidenceScore ?? 1.0)
        ).toFixed(2)
      );

      let explanationText = `${targetDisplayName} is verified in candidate profile`;
      if (primaryEvidence) {
        explanationText = `${targetDisplayName} is verified through ${primaryEvidence.evidenceType} in ${primaryEvidence.filePath} (repository '${primaryEvidence.resourceName}').`;
      }

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

    // CASE B: CLAIMED Skill (Unverified User Claim)
    if (isExplicitUserClaim || candidateSkill.provenanceStatus === 'CLAIMED') {
      const matchConfidence = Number(Math.min(0.5, (req.confidenceScore ?? 0.9) * 0.5).toFixed(2));

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
      category: req.category,
      importance: req.importance,
      weight: req.weight ?? 1.0,
      skillSlug: targetSlug,
      extractedValue: req.extractedValue,
      matchStatus: 'PARTIAL',
      matchConfidence,
      isUserClaim: false,
      claimLabel: null,
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
      `Add explicit package dependencies or import statements for ${targetDisplayName} in active project code.`
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

      const candRelationships = SkillTaxonomyEngine.getRelationships(candSlug);
      const targetRelationships = SkillTaxonomyEngine.getRelationships(targetSlug);

      const rawEvidenceList = Array.isArray(candSkill.evidence) ? candSkill.evidence : [];
      const evidenceRefs = EvidenceMatchingService._selectEvidenceRefs(
        rawEvidenceList,
        resourceMap
      );
      const primaryEvidence = evidenceRefs[0] || null;

      // 1. BUILT_ON: Candidate skill is built on target requirement (e.g., cand: Next.js -> target: React)
      if (candRelationships.builtOn && candRelationships.builtOn.includes(targetSlug)) {
        const matchConfidence = Number(
          Math.min(0.95, (req.confidenceScore ?? 0.9) * 0.95).toFixed(2)
        );

        const candName = candSkill.name || candSlug;
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
          category: req.category,
          importance: req.importance,
          weight: req.weight ?? 1.0,
          skillSlug: targetSlug,
          extractedValue: req.extractedValue,
          matchStatus: 'MATCHED',
          matchConfidence,
          isUserClaim: false,
          claimLabel: null,
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
          category: req.category,
          importance: req.importance,
          weight: req.weight ?? 1.0,
          skillSlug: targetSlug,
          extractedValue: req.extractedValue,
          matchStatus: 'PARTIAL',
          matchConfidence,
          isUserClaim: false,
          claimLabel: null,
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
          `Demonstrate direct ${targetDisplayName} infrastructure configurations or queries alongside ${candName}.`
        );

        return { match, explanation, gap };
      }

      // 4. IMPLEMENTS: Candidate skill implements same architecture/paradigm (e.g. mysql and postgresql)
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
          category: req.category,
          importance: req.importance,
          weight: req.weight ?? 1.0,
          skillSlug: targetSlug,
          extractedValue: req.extractedValue,
          matchStatus: 'PARTIAL',
          matchConfidence,
          isUserClaim: false,
          claimLabel: null,
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
          `Add direct project implementations utilizing ${targetDisplayName} to establish native syntax proficiency.`
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
  static _evaluateExperienceRequirement(req, candidateProfile) {
    const minYearsReq =
      req.normalizedCriteria?.minYears ||
      EvidenceMatchingService._extractYears(req.extractedValue) ||
      0;
    const profileMeta = candidateProfile.profileMetadata || {};

    // 1. Check explicit work history / verified employment
    const workHistory = Array.isArray(profileMeta.workHistory) ? profileMeta.workHistory : [];
    let candidateTenureYears =
      typeof profileMeta.experienceYears === 'number' ? profileMeta.experienceYears : null;

    if (candidateTenureYears === null && workHistory.length > 0) {
      candidateTenureYears = workHistory.reduce((acc, job) => {
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
    const isRemoteRole =
      req.normalizedCriteria?.workplaceType === 'REMOTE' ||
      rawText.includes('remote') ||
      rawText.includes('anywhere');

    const profileMeta = candidateProfile.profileMetadata || {};
    const candidateLocation = profileMeta.location || profileMeta.city || profileMeta.country;
    const acceptsRemote = profileMeta.workplacePreference !== 'STRICT_ON_SITE';

    if (isRemoteRole && acceptsRemote) {
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

    // Location mismatch
    const match = {
      requirementId: req.id,
      category: req.category,
      importance: req.importance,
      weight: req.weight ?? 1.0,
      skillSlug: null,
      extractedValue: req.extractedValue,
      matchStatus: 'MISSING',
      matchConfidence: 0.0,
      isUserClaim: false,
      claimLabel: null,
      matchedSkillSlug: null,
      relationshipType: 'NONE',
      primaryEvidence: null,
      supportingEvidence: [],
      explanation: `MISSING: Candidate location (${candidateLocation}) does not match requested on-site location (${req.extractedValue}).`,
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
      null,
      req.extractedValue,
      'MISSING',
      'EXPLICITLY_MISSING',
      match.explanation,
      `Confirm relocation willingness or remote work authorization.`
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
      category: req.category,
      importance: req.importance,
      weight: req.weight ?? 1.0,
      skillSlug: req.skillSlug || null,
      extractedValue: req.extractedValue,
      matchStatus: 'UNKNOWN',
      matchConfidence: 0.0,
      isUserClaim: false,
      claimLabel: null,
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
   * @private
   */
  static _createSkillGap(req, skillSlug, skillName, status, severity, reason, recommendation) {
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

    return {
      requirementId: req.id,
      skillSlug: skillSlug || null,
      skillName: skillName || req.extractedValue,
      category: req.category,
      priority,
      severity,
      status,
      reason: reason.replace(/^(MISSING|PARTIAL):\s*/, ''),
      recommendation,
    };
  }

  /**
   * Stably selects and formats up to 3 highest-quality EvidenceRefs.
   * @private
   */
  static _selectEvidenceRefs(evidenceList, resourceMap) {
    if (!Array.isArray(evidenceList) || evidenceList.length === 0) {
      return [];
    }

    // Sort stably:
    // 1. Evidence Type Rank
    // 2. Confidence Score descending
    // 3. File path ascending
    const sorted = [...evidenceList].sort((a, b) => {
      const rankA = EVIDENCE_TYPE_RANK[a.evidenceType] || 99;
      const rankB = EVIDENCE_TYPE_RANK[b.evidenceType] || 99;
      if (rankA !== rankB) return rankA - rankB;

      const confA = a.confidenceScore ?? 1.0;
      const confB = b.confidenceScore ?? 1.0;
      if (confB !== confA) return confB - confA;

      const fileA = a.sourceLocation?.filePath || '';
      const fileB = b.sourceLocation?.filePath || '';
      return fileA.localeCompare(fileB);
    });

    const top3 = sorted.slice(0, 3);

    return top3.map((ev) => {
      const resName = resourceMap.get(ev.resourceId) || 'Repository';
      return {
        id: ev.id,
        resourceId: ev.resourceId,
        resourceName: resName,
        evidenceType: ev.evidenceType,
        filePath: ev.sourceLocation?.filePath || 'unknown/file',
        commitSha: ev.sourceLocation?.commitSha || null,
        lineRange: ev.sourceLocation?.lineRange || null,
        excerpt: ev.excerpt || null,
        confidenceScore: ev.confidenceScore ?? 1.0,
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
    return SUBJECTIVE_KEYWORDS.some((kw) => lower.includes(kw));
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
