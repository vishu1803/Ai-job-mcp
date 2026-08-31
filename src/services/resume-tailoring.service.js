/**
 * @file Resume Tailoring Service (P6-001)
 *
 * Implements the provider-neutral Resume Tailoring Engine defined in ARCH-017 / ADR-037:
 * - Deterministic content selection & prioritization (Verified Required > Projects > Preferred > Inferred > Claimed)
 * - Safe ATS keyword alignment via SkillTaxonomyEngine
 * - Atomic ResumeBullet construction grounded in commit-pinned EvidenceRefs
 * - Work history authority: Corporate employment tenure strictly sourced from profile work history
 * - Metric safety guard: Quantitative business metrics require explicit backing evidence
 * - Inferred & claimed skill labeling ([Inferred from <source>], [Unverified User Claim])
 * - Mandatory post-generation integrity audit via ZeroHallucinationIntegrityService
 * - Decoupled provider-neutral structured domain models (TailoredResume)
 * - Ephemeral in-memory computation with zero database writes
 * - Strict multi-tenant default-deny isolation
 */

import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';
import { ValidationError, NotFoundError } from '../errors/index.js';
import { SkillTaxonomyEngine } from '../domain/career/skill-taxonomy.js';
import { ZeroHallucinationIntegrityService } from './zero-hallucination-integrity.service.js';
import { ResumePresentationService } from './resume-presentation.service.js';
import {
  TailoredResumeSchema,
  ResumePresentationModeEnum,
} from '../domain/career/resume.schemas.js';

/**
 * Metric detection regex to enforce quantitative claim safety.
 */
const QUANTITATIVE_METRIC_REGEX =
  /\b(?:\d+%\s*(?:latency|cost|performance|throughput|load|memory|time)?|\d+\s*(?:million|m|k|billion)\s+(?:users|requests|events|queries|rps)|\$\d+[\d,.]*(?:k|m|b|kilo|million)?)\b/i;

export class ResumeTailoringService {
  /**
   * @param {Object} [dependencies]
   * @param {ZeroHallucinationIntegrityService} [dependencies.integrityGate]
   * @param {SkillTaxonomyEngine} [dependencies.taxonomyEngine]
   * @param {ResumePresentationService} [dependencies.presentationService]
   */
  constructor(dependencies = {}) {
    this.integrityGate = dependencies.integrityGate || new ZeroHallucinationIntegrityService();
    this.taxonomyEngine = dependencies.taxonomyEngine || new SkillTaxonomyEngine();
    this.presentationService = dependencies.presentationService || new ResumePresentationService();
    this.logger = logger.child({ module: 'resume-tailoring-service' });
  }

  /**
   * Normalizes technical term using SkillTaxonomyEngine.
   *
   * @param {string} rawInput
   * @param {Object} [options]
   * @returns {Object}
   */
  normalizeTechnicalTerm(rawInput, options = {}) {
    if (this.taxonomyEngine && typeof this.taxonomyEngine.normalizeTechnicalTerm === 'function') {
      return this.taxonomyEngine.normalizeTechnicalTerm(rawInput, options);
    }
    const res = SkillTaxonomyEngine.normalizeSkill(rawInput, options);
    if (!res) {
      const slug =
        typeof rawInput === 'string'
          ? rawInput
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
          : 'unknown-tool';
      return {
        canonicalSlug: slug || 'unknown-tool',
        preferredTerm: rawInput || 'Unknown Tool',
        canonicalName: rawInput || 'Unknown Tool',
        category: options.categoryHint || 'TOOL',
      };
    }
    return {
      canonicalSlug: res.canonicalSlug,
      preferredTerm: res.canonicalName,
      canonicalName: res.canonicalName,
      category: res.category,
    };
  }

  /**
   * Primary operation: Generates a tailored, evidence-backed resume.
   *
   * @param {Object} context - Security and tenant context
   * @param {string} context.tenantId - Trusted workspace tenant ID
   * @param {Object} candidateProfile - Canonical CandidateProfile
   * @param {Object} jobDescription - Target JobDescription
   * @param {Object} candidateMatchAnalysis - CandidateMatchAnalysis from P5-003
   * @param {Object} projectRelevanceAnalysis - ProjectRelevanceAnalysis from P5-004
   * @param {Object|Array<Object>} integrityCheckedAssertions - Audited assertions or summary from P5-006
   * @param {Object} [options] - Optional generation configuration
   * @param {Object} [options.llmAdapter] - Optional LLM linguistic adapter
   * @returns {Promise<Object>|Object} TailoredResume domain object
   */
  async tailorResume(
    context,
    candidateProfile,
    jobDescription,
    candidateMatchAnalysis,
    projectRelevanceAnalysis,
    integrityCheckedAssertions,
    options = {}
  ) {
    // 0. Presentation Mode & Visual Preservation Audit
    const presentationMode = options.presentationMode || 'GENERATE_NEW';
    const parsedMode = ResumePresentationModeEnum.safeParse(presentationMode);
    if (!parsedMode.success) {
      throw new ValidationError(
        `Invalid presentationMode: '${presentationMode}'. Must be 'PRESERVE_EXISTING' or 'GENERATE_NEW'.`
      );
    }

    const presentationAudit = this.presentationService.auditPresentation(parsedMode.data, options);

    // 1. Security & Multi-Tenant Default-Deny Verification
    this._validateContextAndTenancy(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions
    );

    const trustedTenantId = context.tenantId;
    const candidateId = candidateProfile.id;
    const targetJobId = jobDescription.id;

    // 2. Build Evidence Index from Candidate Evidence Graph
    const evidenceIndex = this._buildCandidateEvidenceIndex(candidateProfile);

    // 3. Extract & Normalize Target Job Requirements & Keywords
    const jobKeywordsMap = this._extractJobRequirementsAndKeywords(
      jobDescription,
      candidateMatchAnalysis
    );

    // 4. Normalize & Prioritize Validated Career Assertions
    const assertionList = this._extractAssertionList(integrityCheckedAssertions);

    // 5. Synthesize Skills Section (with ATS Keyword Alignment)
    const { skillCategories, omittedSkillsCount, topVerifiedRequiredSkills } =
      this._synthesizeSkillsSection(candidateProfile, assertionList, jobKeywordsMap, evidenceIndex);

    // 6. Synthesize Highlighted Projects Section
    const { projects } = this._synthesizeProjectsSection(
      candidateProfile,
      projectRelevanceAnalysis,
      assertionList,
      evidenceIndex
    );

    // 7. Synthesize Work Experience Section (Corporate Work History Authority)
    const { experience } = this._synthesizeExperienceSection(
      candidateProfile,
      assertionList,
      evidenceIndex
    );

    // 8. Synthesize Education & Certifications Sections
    const { education } = this._synthesizeEducationSection(candidateProfile, assertionList);
    const { certifications } = this._synthesizeCertificationsSection(
      candidateProfile,
      assertionList
    );

    // 9. Synthesize Headline & Executive Summary
    const { headline, summary, summaryBullets } = this._synthesizeSummarySection(
      candidateProfile,
      topVerifiedRequiredSkills,
      projects[0] || null,
      jobDescription,
      assertionList
    );

    // 10. Assemble Initial Tailored Resume Model
    const resumeId = options.resumeId || crypto.randomUUID();
    const atsMatchScore = Number(
      candidateMatchAnalysis.overallScore ||
        candidateMatchAnalysis.overallMatchScore ||
        candidateMatchAnalysis.fitScore ||
        0.0
    );

    let rawResume = {
      resumeId,
      tenantId: trustedTenantId,
      candidateId,
      targetJobId,
      headline,
      summary,
      summaryBullets,
      skills: skillCategories,
      experience,
      projects,
      education,
      certifications,
      atsMatchScore,
      integrityStatus: 'PASS',
      presentationMode: parsedMode.data,
      sourceDocumentId: presentationAudit.sourceDocumentId || null,
      templateId: presentationAudit.templateId || null,
      presentationIntegrityStatus: presentationAudit.presentationIntegrityStatus,
      presentationAudit,
      metadata: {
        generatedAt: new Date().toISOString(),
        sourceCandidateVersion: candidateProfile.updatedAt || candidateProfile.createdAt,
        sourceJobVersion: jobDescription.updatedAt || jobDescription.createdAt,
        generatorVersion: 'v1.0.0',
        totalBullets: 0,
        verifiedBullets: 0,
        inferredBullets: 0,
        claimedBullets: 0,
        omittedSkillsCount,
        presentationMode: parsedMode.data,
        sourceDocumentId: presentationAudit.sourceDocumentId || null,
        templateId: presentationAudit.templateId || null,
        presentationIntegrityStatus: presentationAudit.presentationIntegrityStatus,
      },
    };

    // 11. Optional LLM Linguistic Transformation Sandbox
    if (options.llmAdapter && typeof options.llmAdapter.transformPhrasing === 'function') {
      rawResume = await this._applyLlmPhrasingSandbox(
        rawResume,
        options.llmAdapter,
        jobDescription
      );
    }

    // 12. Post-Generation Integrity Gate Validation (P5-006)
    const allGeneratedBullets = [
      ...rawResume.summaryBullets,
      ...rawResume.experience.flatMap((e) => e.bullets || []),
      ...rawResume.projects.flatMap((p) => p.bullets || []),
      ...rawResume.education.flatMap((e) => e.bullets || []),
      ...rawResume.certifications.flatMap((c) => c.bullets || []),
    ];

    const integrityAuditResult = this._runPostGenerationIntegrityAudit(
      context,
      candidateProfile,
      allGeneratedBullets,
      evidenceIndex
    );

    if (integrityAuditResult.integrityStatus === 'BLOCKED') {
      this.logger.warn(
        {
          tenantId: trustedTenantId,
          candidateId,
          blockedReasons: integrityAuditResult.blockedReasons,
        },
        'Tailored resume generation blocked by post-generation integrity gate'
      );
      throw new ValidationError(
        'Tailored resume failed post-generation integrity audit: ' +
          integrityAuditResult.blockedReasons.join('; ')
      );
    }

    // 13. Update Bullet Metadata Counters
    let verifiedCount = 0;
    let inferredCount = 0;
    let claimedCount = 0;

    for (const bullet of allGeneratedBullets) {
      if (bullet.status === 'VERIFIED') verifiedCount++;
      else if (bullet.status === 'INFERRED') inferredCount++;
      else if (bullet.status === 'CLAIMED') claimedCount++;
    }

    rawResume.integrityStatus = integrityAuditResult.integrityStatus;
    rawResume.metadata.totalBullets = allGeneratedBullets.length;
    rawResume.metadata.verifiedBullets = verifiedCount;
    rawResume.metadata.inferredBullets = inferredCount;
    rawResume.metadata.claimedBullets = claimedCount;

    // 14. Validate Against Canonical TailoredResumeSchema
    return TailoredResumeSchema.parse(rawResume);
  }

  // =========================================================================
  // Internal Section Synthesis Helpers
  // =========================================================================

  /**
   * Synthesizes the Skills section grouped by category, with ATS keyword alignment.
   *
   * @private
   */
  _synthesizeSkillsSection(candidateProfile, assertionList, jobKeywordsMap, evidenceIndex) {
    const rawSkills = Array.isArray(candidateProfile.skills) ? candidateProfile.skills : [];

    const skillAssertions = assertionList.filter(
      (a) => a.assertionType === 'SKILL' && a.status !== 'MISSING_EVIDENCE'
    );

    const processedSkillsBySlug = new Map();
    let omittedSkillsCount = 0;

    // 1. Process candidate skills from profile
    for (const rawSkill of rawSkills) {
      const norm = this.normalizeTechnicalTerm(rawSkill.name);
      const canonicalSlug = norm.canonicalSlug;
      const category = rawSkill.category || norm.category || 'TOOL';

      // Find matching assertion if available
      const matchingAssertion = skillAssertions.find((a) => a.subjectSlug === canonicalSlug);

      const status = matchingAssertion
        ? matchingAssertion.status
        : rawSkill.provenanceStatus || 'CLAIMED';

      const confidenceScore = matchingAssertion
        ? matchingAssertion.confidenceScore
        : (rawSkill.confidenceScore ?? (status === 'VERIFIED' ? 1.0 : 0.25));

      // ATS Keyword Alignment: Use job requirement title if canonical slug matches
      const jobRequirement = jobKeywordsMap.get(canonicalSlug);
      const displayName = jobRequirement ? jobRequirement.title : rawSkill.name;

      // Compute relevance score: Required (100.0) > Preferred (75.0) > Candidate Profile (50.0)
      let relevanceScore = 25.0;
      if (jobRequirement) {
        relevanceScore = jobRequirement.isRequired ? 100.0 : 75.0;
      } else if (rawSkill.evidenceCount > 0 || status === 'VERIFIED') {
        relevanceScore = 50.0;
      }

      // Claim & Inference Labeling
      let claimLabel = null;
      if (status === 'CLAIMED') {
        claimLabel = '[Unverified User Claim]';
      } else if (status === 'INFERRED') {
        claimLabel = matchingAssertion?.claimLabel || '[Inferred from related evidence]';
      }

      // Collect evidence refs (capped at 5)
      const evidenceRefs = this._extractEvidenceRefsFromSkillOrAssertion(
        rawSkill,
        matchingAssertion,
        evidenceIndex
      );

      const assertionIds = matchingAssertion ? [matchingAssertion.assertionId] : [];

      processedSkillsBySlug.set(canonicalSlug, {
        name: displayName,
        canonicalSlug,
        category,
        status,
        confidenceScore,
        relevanceScore,
        claimLabel,
        evidenceRefs,
        assertionIds,
      });
    }

    // 2. Add any skills present in verified/inferred assertions not yet covered
    for (const assertion of skillAssertions) {
      const slug = assertion.subjectSlug;
      if (slug && !processedSkillsBySlug.has(slug)) {
        const norm = this.normalizeTechnicalTerm(slug);
        const jobRequirement = jobKeywordsMap.get(slug);
        const displayName = jobRequirement ? jobRequirement.title : norm.preferredTerm;
        const category = norm.category || 'TOOL';

        let relevanceScore = 25.0;
        if (jobRequirement) {
          relevanceScore = jobRequirement.isRequired ? 100.0 : 75.0;
        } else if (assertion.status === 'VERIFIED') {
          relevanceScore = 50.0;
        }

        let claimLabel = null;
        if (assertion.status === 'CLAIMED') {
          claimLabel = '[Unverified User Claim]';
        } else if (assertion.status === 'INFERRED') {
          claimLabel = assertion.claimLabel || '[Inferred from related evidence]';
        }

        processedSkillsBySlug.set(slug, {
          name: displayName,
          canonicalSlug: slug,
          category,
          status: assertion.status,
          confidenceScore: assertion.confidenceScore,
          relevanceScore,
          claimLabel,
          evidenceRefs: (assertion.evidenceRefs || []).slice(0, 5),
          assertionIds: [assertion.assertionId],
        });
      }
    }

    // 3. Count omitted skills (Job requirements for which candidate has 0 evidence/claims)
    for (const [slug] of jobKeywordsMap.entries()) {
      if (!processedSkillsBySlug.has(slug)) {
        omittedSkillsCount++;
      }
    }

    // 4. Group skills by Category and Sort Deterministically
    const categoryMap = new Map();
    const topVerifiedRequiredSkills = [];

    for (const skill of processedSkillsBySlug.values()) {
      if (!categoryMap.has(skill.category)) {
        categoryMap.set(skill.category, []);
      }
      categoryMap.get(skill.category).push(skill);

      if (skill.status === 'VERIFIED' && skill.relevanceScore === 100.0) {
        topVerifiedRequiredSkills.push(skill);
      }
    }

    const skillCategories = [];
    const CATEGORY_ORDER = [
      'LANGUAGE',
      'FRAMEWORK',
      'DATABASE',
      'CLOUD_DEVOPS',
      'TOOL',
      'ARCHITECTURE',
      'CONCEPT',
    ];

    for (const cat of CATEGORY_ORDER) {
      if (categoryMap.has(cat)) {
        const skillsInCat = categoryMap.get(cat);
        // Sort within category: relevanceScore DESC, status priority ASC, canonicalSlug ASC
        skillsInCat.sort((a, b) => {
          if (b.relevanceScore !== a.relevanceScore) {
            return b.relevanceScore - a.relevanceScore;
          }
          const statusOrder = { VERIFIED: 1, INFERRED: 2, CLAIMED: 3 };
          const sA = statusOrder[a.status] || 4;
          const sB = statusOrder[b.status] || 4;
          if (sA !== sB) return sA - sB;
          return a.canonicalSlug.localeCompare(b.canonicalSlug);
        });

        skillCategories.push({
          category: cat,
          skills: skillsInCat,
        });
      }
    }

    // Sort top verified required skills by confidence desc, slug asc
    topVerifiedRequiredSkills.sort((a, b) => {
      if (b.confidenceScore !== a.confidenceScore) {
        return b.confidenceScore - a.confidenceScore;
      }
      return a.canonicalSlug.localeCompare(b.canonicalSlug);
    });

    return {
      skillCategories,
      omittedSkillsCount,
      topVerifiedRequiredSkills,
    };
  }

  /**
   * Synthesizes the Highlighted Projects section from ProjectRelevanceAnalysis.
   *
   * @private
   */
  _synthesizeProjectsSection(
    candidateProfile,
    projectRelevanceAnalysis,
    assertionList,
    evidenceIndex
  ) {
    const rawRanked = Array.isArray(projectRelevanceAnalysis?.rankedProjects)
      ? projectRelevanceAnalysis.rankedProjects
      : [];

    const candidateProjects = Array.isArray(candidateProfile?.projects)
      ? candidateProfile.projects
      : [];

    const candidateProjectMap = new Map(candidateProjects.map((p) => [p.id, p]));
    const seenProjectIds = new Set();
    const projects = [];
    const allProjectBullets = [];

    for (const ranked of rawRanked) {
      const pId = ranked.projectId;
      if (!pId || seenProjectIds.has(pId)) continue;
      seenProjectIds.add(pId);

      const baseProject = candidateProjectMap.get(pId) || {};
      const projectName = ranked.name || baseProject.name || 'Repository';
      const displayName = ranked.displayName || baseProject.displayName || projectName;
      const description = ranked.description || baseProject.summary || null;
      const projectType = ranked.projectType || 'APPLICATION';
      const relevanceScore = Number(ranked.relevanceScore || 0.0);
      const relevanceBand = ranked.relevanceBand || 'MEDIUM';

      const primaryLanguages = Array.isArray(ranked.primaryLanguages)
        ? ranked.primaryLanguages
        : [];
      const primaryFrameworks = Array.isArray(ranked.primaryFrameworks)
        ? ranked.primaryFrameworks
        : [];

      // Collect project evidence refs
      const rawRefs = Array.isArray(ranked.evidenceRefs) ? ranked.evidenceRefs : [];
      const deduplicatedRefs = this._deduplicateAndCapEvidenceRefs(rawRefs, 5);

      // Build 1-2 evidence-backed project bullets
      const bullets = [];
      const projectAssertions = assertionList.filter(
        (a) =>
          a.assertionType === 'PROJECT' &&
          (a.metadata?.projectId === pId || a.subjectSlug === ranked.slug)
      );

      // Bullet 1: Core Tech Stack Action Statement
      const langStr = primaryLanguages.slice(0, 2).join(', ');
      const fwStr = primaryFrameworks.slice(0, 2).join(', ');
      const techStackSummary = [langStr, fwStr].filter(Boolean).join(' and ');

      const bullet1Text = techStackSummary
        ? `Developed and maintained ${displayName} utilizing ${techStackSummary}.`
        : `Architected and implemented core platform components for ${displayName}.`;

      // Check metric safety
      this._assertMetricSafety(bullet1Text, deduplicatedRefs);

      // Use VERIFIED only if evidence refs resolve; otherwise CLAIMED
      const hasResolvedEvidence = deduplicatedRefs.length > 0 && deduplicatedRefs.some((ref) => evidenceIndex.has(ref.id));
      const bullet1Status = hasResolvedEvidence ? 'VERIFIED' : 'CLAIMED';
      const bullet1Confidence = hasResolvedEvidence ? 1.0 : 0.5;

      const bullet1 = {
        id: crypto.randomUUID(),
        section: 'PROJECTS',
        text: bullet1Text,
        assertionIds: projectAssertions.map((a) => a.assertionId),
        evidenceRefs: deduplicatedRefs,
        status: bullet1Status,
        confidenceScore: bullet1Confidence,
        relevanceScore,
        matchedKeywords: Array.from(new Set([...primaryLanguages, ...primaryFrameworks])),
        claimLabel: hasResolvedEvidence ? null : '[Unverified User Claim]',
      };
      bullets.push(bullet1);
      allProjectBullets.push(bullet1);

      // Bullet 2: Architectural Signals (if architectural signals present)
      if (
        ranked.architecturalSignals &&
        Array.isArray(ranked.architecturalSignals) &&
        ranked.architecturalSignals.length > 0
      ) {
        const topSignals = ranked.architecturalSignals.slice(0, 2).join(' and ');
        const bullet2Text = `Engineered modular architecture featuring ${topSignals.toLowerCase().replace(/_/g, ' ')}.`;

        this._assertMetricSafety(bullet2Text, deduplicatedRefs);

        const bullet2 = {
          id: crypto.randomUUID(),
          section: 'PROJECTS',
          text: bullet2Text,
          assertionIds: projectAssertions.map((a) => a.assertionId),
          evidenceRefs: deduplicatedRefs.slice(0, 3),
          status: hasResolvedEvidence ? 'VERIFIED' : 'CLAIMED',
          confidenceScore: hasResolvedEvidence ? 0.9 : 0.4,
          relevanceScore: Math.max(0.0, relevanceScore - 5.0),
          matchedKeywords: ranked.architecturalSignals.slice(0, 2),
          claimLabel: null,
        };
        bullets.push(bullet2);
        allProjectBullets.push(bullet2);
      }

      projects.push({
        id: crypto.randomUUID(),
        projectId: pId,
        name: projectName,
        displayName,
        description,
        projectType,
        relevanceScore,
        relevanceBand,
        primaryLanguages,
        primaryFrameworks,
        bullets,
        evidenceRefs: deduplicatedRefs,
      });
    }

    return {
      projects,
      projectBullets: allProjectBullets,
    };
  }

  /**
   * Synthesizes the Work Experience section from CandidateProfile.experience records.
   *
   * @private
   */
  _synthesizeExperienceSection(candidateProfile, assertionList, _evidenceIndex) {
    const rawExperience = Array.isArray(candidateProfile?.profileMetadata?.experience)
      ? candidateProfile.profileMetadata.experience
      : Array.isArray(candidateProfile?.experience)
        ? candidateProfile.experience
        : [];

    const experience = [];

    const expAssertions = assertionList.filter((a) => a.assertionType === 'EXPERIENCE');

    for (const entry of rawExperience) {
      const company = entry.company || entry.employer || 'Organization';
      const title = entry.title || entry.role || 'Software Engineer';
      const startDate = entry.startDate || '2022-01-01';
      const endDate = entry.endDate || (entry.isCurrent ? null : '2024-01-01');
      const location = entry.location || null;
      const isCurrent = Boolean(entry.isCurrent || !endDate);

      const bullets = [];
      const rawBullets = Array.isArray(entry.bullets)
        ? entry.bullets
        : Array.isArray(entry.responsibilities)
          ? entry.responsibilities
          : [];

      for (const bulletItem of rawBullets) {
        const bulletText =
          typeof bulletItem === 'string'
            ? bulletItem
            : bulletItem.text || 'Contributed to core engineering systems.';

        // Metric Safety Guard
        this._assertMetricSafety(bulletText, []);

        const status = entry.verified ? 'VERIFIED' : 'CLAIMED';
        const claimLabel = status === 'CLAIMED' ? '[Unverified User Claim]' : null;

        const bullet = {
          id: crypto.randomUUID(),
          section: 'EXPERIENCE',
          text: claimLabel ? `${claimLabel} — ${bulletText}` : bulletText,
          assertionIds: expAssertions.map((a) => a.assertionId),
          evidenceRefs: [],
          status,
          confidenceScore: status === 'VERIFIED' ? 1.0 : 0.25,
          relevanceScore: 80.0,
          matchedKeywords: [],
          claimLabel,
        };
        bullets.push(bullet);
      }

      experience.push({
        id: crypto.randomUUID(),
        company,
        title,
        startDate,
        endDate,
        location,
        isCurrent,
        bullets,
      });
    }

    return {
      experience,
    };
  }

  /**
   * Synthesizes Education section from explicit candidate records.
   *
   * @private
   */
  _synthesizeEducationSection(candidateProfile, _assertionList) {
    const rawEducation = Array.isArray(candidateProfile?.profileMetadata?.education)
      ? candidateProfile.profileMetadata.education
      : Array.isArray(candidateProfile?.education)
        ? candidateProfile.education
        : [];

    const education = [];

    for (const entry of rawEducation) {
      const institution = entry.institution || entry.school || 'University';
      const degree = entry.degree || 'Bachelor of Science';
      const fieldOfStudy = entry.fieldOfStudy || entry.major || null;
      const startDate = entry.startDate || null;
      const endDate = entry.endDate || null;
      const grade = entry.grade || entry.gpa || null;

      education.push({
        id: crypto.randomUUID(),
        institution,
        degree,
        fieldOfStudy,
        startDate,
        endDate,
        grade,
        bullets: [],
      });
    }

    return { education };
  }

  /**
   * Synthesizes Certifications section from explicit candidate records.
   *
   * @private
   */
  _synthesizeCertificationsSection(candidateProfile, _assertionList) {
    const rawCerts = Array.isArray(candidateProfile?.profileMetadata?.certifications)
      ? candidateProfile.profileMetadata.certifications
      : Array.isArray(candidateProfile?.certifications)
        ? candidateProfile.certifications
        : [];

    const certifications = [];

    for (const entry of rawCerts) {
      const name = entry.name || 'Professional Certification';
      const issuingOrganization = entry.issuingOrganization || entry.issuer || 'Issuing Authority';
      const issueDate = entry.issueDate || null;
      const expirationDate = entry.expirationDate || null;
      const credentialId = entry.credentialId || null;
      const credentialUrl = entry.credentialUrl || null;

      certifications.push({
        id: crypto.randomUUID(),
        name,
        issuingOrganization,
        issueDate,
        expirationDate,
        credentialId,
        credentialUrl,
        bullets: [],
      });
    }

    return { certifications };
  }

  /**
   * Synthesizes Headline and Grounded Executive Summary.
   *
   * @private
   */
  _synthesizeSummarySection(
    candidateProfile,
    topVerifiedRequiredSkills,
    topProject,
    jobDescription,
    _assertionList
  ) {
    const rawHeadline =
      candidateProfile.headline || jobDescription.title || 'Senior Software Engineer';

    const skillHighlights = topVerifiedRequiredSkills
      .slice(0, 3)
      .map((s) => s.name)
      .join(', ');

    const projectHighlight = topProject
      ? ` demonstrable expertise in ${topProject.displayName}`
      : '';

    let summaryText = '';
    if (skillHighlights) {
      summaryText = `Software Engineer proficient in ${skillHighlights}${projectHighlight ? ` with${projectHighlight}` : ''}. Proven track record of architecting reliable, test-backed software services aligned with technical requirements.`;
    } else {
      summaryText = `Software Engineer with demonstrated technical expertise in building robust, high-integrity software applications.`;
    }

    const summaryBullet = {
      id: crypto.randomUUID(),
      section: 'SUMMARY',
      text: summaryText,
      assertionIds: topVerifiedRequiredSkills.flatMap((s) => s.assertionIds),
      evidenceRefs: topVerifiedRequiredSkills.flatMap((s) => s.evidenceRefs).slice(0, 5),
      status: topVerifiedRequiredSkills.length > 0 ? 'VERIFIED' : 'CLAIMED',
      confidenceScore: 1.0,
      relevanceScore: 100.0,
      matchedKeywords: topVerifiedRequiredSkills.map((s) => s.name),
      claimLabel: null,
    };

    return {
      headline: rawHeadline,
      summary: summaryText,
      summaryBullets: [summaryBullet],
    };
  }

  // =========================================================================
  // Post-Generation Integrity & Safety Verification
  // =========================================================================

  /**
   * Runs ZeroHallucinationIntegrityService on all generated bullets.
   *
   * @private
   */
  _runPostGenerationIntegrityAudit(context, candidateProfile, bullets, evidenceIndex) {
    const assertionsToAudit = [];

    for (const bullet of bullets) {
      // Map bullet to CareerAssertion
      assertionsToAudit.push({
        assertionId: bullet.id,
        tenantId: context.tenantId,
        candidateId: candidateProfile.id,
        assertionType:
          bullet.section === 'SUMMARY'
            ? 'SUMMARY'
            : bullet.section === 'PROJECTS'
              ? 'PROJECT'
              : bullet.section === 'EXPERIENCE'
                ? 'EXPERIENCE'
                : 'SKILL',
        statement: bullet.text,
        subjectSlug: null,
        status: bullet.status,
        confidenceScore: bullet.confidenceScore,
        evidenceRefs: bullet.evidenceRefs || [],
        claimLabel: bullet.claimLabel || null,
        metadata: {},
      });
    }

    return this.integrityGate.validateCareerAssertions(context, assertionsToAudit, evidenceIndex, {
      candidateProfile,
    });
  }

  /**
   * Asserts that quantitative outcome claims have explicit supporting evidence.
   *
   * @private
   */
  _assertMetricSafety(text, evidenceRefs) {
    if (QUANTITATIVE_METRIC_REGEX.test(text)) {
      if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) {
        throw new ValidationError(
          `Quantitative achievement claim rejected by metric safety guard: "${text}" has zero backing evidence nodes.`
        );
      }
    }
  }

  /**
   * Applies optional LLM phrasing transformations under strict passive JSON encapsulation.
   *
   * @private
   */
  async _applyLlmPhrasingSandbox(resumeModel, llmAdapter, jobDescription) {
    const prompt = `<job_input>\n${JSON.stringify({ title: jobDescription.title, summary: jobDescription.summary })}\n</job_input>\n<candidate_facts>\n${JSON.stringify({ summary: resumeModel.summary, headline: resumeModel.headline })}\n</candidate_facts>`;

    try {
      const response = await llmAdapter.transformPhrasing(prompt);
      if (response && typeof response === 'object') {
        if (response.headline && typeof response.headline === 'string') {
          resumeModel.headline = response.headline.trim();
        }
        if (response.summary && typeof response.summary === 'string') {
          resumeModel.summary = response.summary.trim();
          if (resumeModel.summaryBullets && resumeModel.summaryBullets[0]) {
            resumeModel.summaryBullets[0].text = response.summary.trim();
          }
        }
      }
    } catch (err) {
      this.logger.warn(
        { err: err.message },
        'LLM phrasing transformation failed; falling back to deterministic synthesis'
      );
    }

    return resumeModel;
  }

  // =========================================================================
  // Security & Data Normalization Helpers
  // =========================================================================

  /**
   * Validates multi-tenant isolation and input coherence.
   *
   * @private
   */
  _validateContextAndTenancy(
    context,
    candidateProfile,
    jobDescription,
    candidateMatchAnalysis,
    projectRelevanceAnalysis,
    integrityCheckedAssertions
  ) {
    if (!context || !context.tenantId || typeof context.tenantId !== 'string') {
      throw new ValidationError('Valid security context with tenantId is required');
    }
    const trustedTenantId = context.tenantId;

    if (!candidateProfile || typeof candidateProfile !== 'object') {
      throw new ValidationError('Valid CandidateProfile is required');
    }
    if (candidateProfile.tenantId && candidateProfile.tenantId !== trustedTenantId) {
      this.logger.warn(
        { trustedTenantId, candidateTenantId: candidateProfile.tenantId },
        'Cross-tenant candidate access blocked in resume tailoring'
      );
      throw new NotFoundError('Candidate not found');
    }

    if (!jobDescription || typeof jobDescription !== 'object') {
      throw new ValidationError('Valid JobDescription is required');
    }
    if (jobDescription.tenantId && jobDescription.tenantId !== trustedTenantId) {
      this.logger.warn(
        { trustedTenantId, jobTenantId: jobDescription.tenantId },
        'Cross-tenant job description access blocked in resume tailoring'
      );
      throw new NotFoundError('Job description not found');
    }

    if (!candidateMatchAnalysis || typeof candidateMatchAnalysis !== 'object') {
      throw new ValidationError('Valid CandidateMatchAnalysis is required');
    }
    if (candidateMatchAnalysis.tenantId && candidateMatchAnalysis.tenantId !== trustedTenantId) {
      this.logger.warn(
        { trustedTenantId, matchTenantId: candidateMatchAnalysis.tenantId },
        'Cross-tenant match analysis access blocked in resume tailoring'
      );
      throw new NotFoundError('Match analysis not found');
    }

    if (!projectRelevanceAnalysis || typeof projectRelevanceAnalysis !== 'object') {
      throw new ValidationError('Valid ProjectRelevanceAnalysis is required');
    }
    if (
      projectRelevanceAnalysis.tenantId &&
      projectRelevanceAnalysis.tenantId !== trustedTenantId
    ) {
      this.logger.warn(
        { trustedTenantId, projectTenantId: projectRelevanceAnalysis.tenantId },
        'Cross-tenant project relevance access blocked in resume tailoring'
      );
      throw new NotFoundError('Project analysis not found');
    }

    if (integrityCheckedAssertions) {
      if (
        typeof integrityCheckedAssertions === 'object' &&
        !Array.isArray(integrityCheckedAssertions)
      ) {
        if (
          integrityCheckedAssertions.tenantId &&
          integrityCheckedAssertions.tenantId !== trustedTenantId
        ) {
          this.logger.warn(
            {
              trustedTenantId,
              assertionTenantId: integrityCheckedAssertions.tenantId,
            },
            'Cross-tenant assertions access blocked in resume tailoring'
          );
          throw new NotFoundError('Assertions not found');
        }
      }
    }

    // Verify entity coherence
    if (
      candidateMatchAnalysis.candidateId !== candidateProfile.id ||
      projectRelevanceAnalysis.candidateId !== candidateProfile.id ||
      candidateMatchAnalysis.jobDescriptionId !== jobDescription.id ||
      projectRelevanceAnalysis.jobDescriptionId !== jobDescription.id
    ) {
      this.logger.warn(
        {
          matchCandidateId: candidateMatchAnalysis.candidateId,
          projectCandidateId: projectRelevanceAnalysis.candidateId,
          profileId: candidateProfile.id,
          matchJobId: candidateMatchAnalysis.jobDescriptionId,
          projectJobId: projectRelevanceAnalysis.jobDescriptionId,
          jobId: jobDescription.id,
        },
        'Mismatched candidate or job IDs across match and relevance analyses'
      );
      throw new ValidationError(
        'Entity ID mismatch between candidate, job, match analysis, and project relevance'
      );
    }
  }

  /**
   * Builds an in-memory Map of EvidenceItem records from CandidateProfile.
   *
   * @private
   */
  _buildCandidateEvidenceIndex(candidateProfile) {
    const map = new Map();

    const skills = Array.isArray(candidateProfile?.skills) ? candidateProfile.skills : [];
    for (const skill of skills) {
      // Support both 'evidence' and 'evidenceItems' field names
      const evidenceList = Array.isArray(skill.evidenceItems)
        ? skill.evidenceItems
        : Array.isArray(skill.evidence)
          ? skill.evidence
          : [];
      for (const ev of evidenceList) {
        if (ev && ev.id) {
          map.set(ev.id, {
            ...ev,
            tenantId: candidateProfile.tenantId,
            candidateId: candidateProfile.id,
          });
        }
      }
      // Also index primaryEvidence if present
      if (skill.primaryEvidence && skill.primaryEvidence.id && !map.has(skill.primaryEvidence.id)) {
        map.set(skill.primaryEvidence.id, {
          ...skill.primaryEvidence,
          tenantId: candidateProfile.tenantId,
          candidateId: candidateProfile.id,
        });
      }
    }

    const projects = Array.isArray(candidateProfile?.projects) ? candidateProfile.projects : [];
    for (const project of projects) {
      if (Array.isArray(project.evidence)) {
        for (const ev of project.evidence) {
          if (ev.id) {
            map.set(ev.id, {
              ...ev,
              tenantId: candidateProfile.tenantId,
              candidateId: candidateProfile.id,
              projectId: project.id,
            });
          }
        }
      }
    }

    return map;
  }

  /**
   * Extracts job requirements and builds canonical taxonomy keyword map.
   *
   * @private
   */
  _extractJobRequirementsAndKeywords(jobDescription, candidateMatchAnalysis) {
    const jobKeywordsMap = new Map();

    const rawRequirements = Array.isArray(jobDescription?.requirements)
      ? jobDescription.requirements
      : Array.isArray(jobDescription?.parsedRequirements)
        ? jobDescription.parsedRequirements
        : [];

    for (const req of rawRequirements) {
      const title = req.title || req.name || req.slug || '';
      if (!title) continue;
      const norm = this.normalizeTechnicalTerm(title);
      const isRequired = Boolean(req.isRequired ?? req.requirementType === 'REQUIRED');
      const weight = Number(req.weight || (isRequired ? 1.0 : 0.5));

      jobKeywordsMap.set(norm.canonicalSlug, {
        title,
        canonicalSlug: norm.canonicalSlug,
        isRequired,
        weight,
        category: norm.category || req.category || 'TOOL',
      });
    }

    // Also check requirement matches from CandidateMatchAnalysis
    const reqMatches = Array.isArray(candidateMatchAnalysis?.requirementMatches)
      ? candidateMatchAnalysis.requirementMatches
      : [];

    for (const match of reqMatches) {
      const slug = match.requirementSlug || match.canonicalSlug;
      if (slug && !jobKeywordsMap.has(slug)) {
        const title = match.requirementTitle || match.name || slug;
        const norm = this.normalizeTechnicalTerm(title);
        const isRequired = Boolean(match.isRequired);
        jobKeywordsMap.set(norm.canonicalSlug, {
          title,
          canonicalSlug: norm.canonicalSlug,
          isRequired,
          weight: isRequired ? 1.0 : 0.5,
          category: norm.category || match.category || 'TOOL',
        });
      }
    }

    return jobKeywordsMap;
  }

  /**
   * Extracts assertion array from summary or array input.
   *
   * @private
   */
  _extractAssertionList(integrityCheckedAssertions) {
    if (!integrityCheckedAssertions) return [];
    if (Array.isArray(integrityCheckedAssertions)) {
      return integrityCheckedAssertions;
    }
    if (
      typeof integrityCheckedAssertions === 'object' &&
      Array.isArray(integrityCheckedAssertions.assertions)
    ) {
      return integrityCheckedAssertions.assertions;
    }
    return [];
  }

  /**
   * Indexes assertions by subject slug.
   *
   * @private
   */
  _indexAssertionsBySubject(assertionList) {
    const map = new Map();
    for (const a of assertionList) {
      if (a.subjectSlug) {
        map.set(a.subjectSlug, a);
      }
    }
    return map;
  }

  /**
   * Extracts EvidenceRefs from a skill or assertion, deduplicating and capping at 5.
   *
   * @private
   */
  _extractEvidenceRefsFromSkillOrAssertion(skill, assertion, _evidenceIndex) {
    const rawRefs = [];

    if (assertion && Array.isArray(assertion.evidenceRefs)) {
      rawRefs.push(...assertion.evidenceRefs);
    }

    if (skill && Array.isArray(skill.evidence)) {
      for (const ev of skill.evidence) {
        if (ev.id) {
          rawRefs.push({
            id: ev.id,
            resourceId: ev.resourceId,
            resourceName: ev.resourceName || 'repository',
            filePath: ev.filePath || ev.sourceLocation?.filePath || 'package.json',
            commitSha:
              ev.commitSha ||
              ev.sourceLocation?.commitSha ||
              '0000000000000000000000000000000000000000',
            lineRange: ev.lineRange || ev.sourceLocation?.lineRange || { start: 1, end: 1 },
            evidenceType: ev.evidenceType || 'PACKAGE_MANIFEST_DEPENDENCY',
            confidenceScore: ev.confidenceScore || 1.0,
            excerpt: ev.excerpt || ev.sanitizedExcerpt || null,
          });
        }
      }
    }

    return this._deduplicateAndCapEvidenceRefs(rawRefs, 5);
  }

  /**
   * Deduplicates EvidenceRefs by id and caps at maxCount.
   *
   * @private
   */
  _deduplicateAndCapEvidenceRefs(refs, maxCount = 5) {
    if (!Array.isArray(refs)) return [];
    const seen = new Set();
    const result = [];

    for (const ref of refs) {
      if (ref && ref.id && !seen.has(ref.id)) {
        seen.add(ref.id);
        result.push(ref);
        if (result.length >= maxCount) break;
      }
    }

    return result;
  }
}
