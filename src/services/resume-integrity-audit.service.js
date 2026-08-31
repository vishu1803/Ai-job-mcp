/**
 * @file Resume Integrity Audit Tool Service (P6-005)
 *
 * Implements an independent, provider-neutral, post-generation verification firewall:
 * - Multi-Format Ingestion: STRUCTURED_RESUME, JSON_RESUME, MARKDOWN, PLAIN_TEXT (PDF/DOCX rejected)
 * - Deterministic Typed Claim Extraction: SKILL, METRIC, EXPERIENCE, TENURE, EMPLOYER, EDUCATION, ACHIEVEMENT
 * - Domain Verification: Skill normalization via SkillTaxonomyEngine, quantitative metric safety, work history authority
 * - Cryptographic Evidence Pinning: Existence, tenant, candidate, resource, commit SHA (40-hex), filePath, lineRange
 * - Status Inflation & Contradiction Detection
 * - Omission-is-not-penalty tolerance
 * - Content Drift & ATS Keyword Stuffing Defense
 * - Three-Tier Status Gate (PASS, WARN, BLOCK) with actionable remediation
 * - Multi-tenant sovereign default-deny (404) & zero database mutations
 */

import { randomUUID } from 'node:crypto';
import { ValidationError, NotFoundError } from '../errors/index.js';
import { SkillTaxonomyEngine } from '../domain/career/skill-taxonomy.js';
import { ResumeIntegrityAuditSchema } from '../domain/career/resume-integrity-audit.schemas.js';

/**
 * Metric detection regex patterns.
 */
const METRIC_PATTERNS = [
  /\b\d+(?:\.\d+)?%\b/g, // 40%, 99.9%
  /\$\d+(?:,\d{3})*(?:\.\d+)?[kKmMbB]?\b/g, // $10M, $500k
  /\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:users|active users|daily users|concurrent users|qps|rps|tps|reqs|requests|events|queries|msg\/sec)\b/gi,
  /\b(?:reduced|decreased|cut)\s+(?:latency|load|memory|cost|cpu)\s+by\s+\d+/gi,
  /\b(?:increased|scaled|boosted|grew)\s+(?:throughput|revenue|scale|traffic|concurrency)\s+by\s+\d+/gi,
  /\b\d+\s*ms\b/gi, // 12ms
  /\b99\.\d+%\s*uptime\b/gi, // 99.9% uptime
  /\bteam of \d+\s*(?:engineers|developers|members)\b/gi,
];

/**
 * Common action verbs indicating concrete achievements.
 */
const ACHIEVEMENT_VERB_REGEX =
  /\b(designed|architected|built|developed|implemented|optimized|scaled|reduced|increased|led|spearheaded|deployed|automated|refactored|migrated)\b/i;

export class ResumeIntegrityAuditService {
  /**
   * @param {Object} [dependencies]
   * @param {SkillTaxonomyEngine} [dependencies.taxonomyEngine]
   */
  constructor(dependencies = {}) {
    this.taxonomyEngine = dependencies.taxonomyEngine || new SkillTaxonomyEngine();
  }

  // ===========================================================================
  // 1. Primary Audit Operation
  // ===========================================================================

  /**
   * Independently audits a resume artifact against authoritative career intelligence.
   *
   * @param {Object} context - Multi-tenant security context { tenantId, userId }
   * @param {Object|string} resumeArtifact - Resume object (structured/JSON) or raw text (Markdown/Plain Text)
   * @param {Array<Object>} [integrityCheckedAssertions] - Approved assertions from P5-006
   * @param {Object} [candidateProfile] - Authoritative candidate profile
   * @param {Object} [options] - Additional audit options
   * @returns {Object} Validated ResumeIntegrityAudit envelope
   */
  auditResume(
    context,
    resumeArtifact,
    integrityCheckedAssertions = [],
    candidateProfile = null,
    options = {}
  ) {
    // 1. Assert Security Context & Multi-Tenant Sovereign Isolation
    this._assertValidContext(context);
    this._assertTenantIsolation(
      context,
      resumeArtifact,
      integrityCheckedAssertions,
      candidateProfile
    );

    // 2. Detect & Validate Input Format
    const inputFormat = this._detectInputFormat(resumeArtifact, options);

    // 3. Build Ground-Truth Verification Indexes
    const candidateId =
      candidateProfile?.id ||
      (typeof resumeArtifact === 'object' && resumeArtifact !== null
        ? resumeArtifact.candidateId
        : null) ||
      context.userId ||
      randomUUID();

    const indexes = this._buildVerificationIndexes(
      integrityCheckedAssertions,
      candidateProfile,
      resumeArtifact
    );

    // 4. Deterministic Claim Extraction
    const rawClaims = this._extractClaims(resumeArtifact, inputFormat, options);

    // 5. Audit Claims against Ground-Truth Indexes
    const findings = [];
    const auditedClaims = [];
    let metricClaimsCount = 0;

    for (const rawClaim of rawClaims) {
      const { finding, ...cleanClaimAudit } = this._auditClaim(
        rawClaim,
        indexes,
        context,
        candidateId
      );
      auditedClaims.push(cleanClaimAudit);

      if (cleanClaimAudit.claimType === 'METRIC') {
        metricClaimsCount++;
      }

      if (finding) {
        findings.push(finding);
      }
    }

    // 6. Check for EvidenceId & Provenance Tampering on Structured Citations
    const citationFindings = this._auditStructuredCitations(
      resumeArtifact,
      inputFormat,
      indexes,
      context,
      candidateId
    );
    findings.push(...citationFindings);

    // 7. Check for Contradictions & ATS Keyword Stuffing
    const contradictionFindings = this._auditContradictionsAndStuffing(
      rawClaims,
      indexes,
      candidateProfile
    );
    findings.push(...contradictionFindings);

    // 8. Classify Content Drift
    const contentDrift = this._classifyContentDrift(rawClaims, indexes, inputFormat);

    // 9. Calculate Statistics & Coverage
    const statistics = this._calculateStatistics(auditedClaims, findings, metricClaimsCount);
    const evidenceCoverage = this._calculateEvidenceCoverage(auditedClaims);

    // 10. Compute Overall Status
    const hasBlock = findings.some((f) => f.severity === 'BLOCK');
    const hasWarn = findings.some((f) => f.severity === 'WARN');
    const overallStatus = hasBlock ? 'BLOCK' : hasWarn ? 'WARN' : 'PASS';

    // 11. Deduplicate & Deterministically Sort Findings
    const sortedFindings = this._deduplicateAndSortFindings(findings);
    const sortedClaims = this._sortClaims(auditedClaims);

    // 12. Build & Validate Audit Result Envelope
    const auditResult = {
      auditId: randomUUID(),
      tenantId: context.tenantId,
      candidateId,
      artifactType: 'RESUME',
      inputFormat,
      overallStatus,
      contentDrift,
      evidenceCoverage,
      statistics,
      findings: sortedFindings,
      claims: sortedClaims,
      integrityVersion: 'v1.0.0',
      auditedAt: new Date().toISOString(),
    };

    return ResumeIntegrityAuditSchema.parse(auditResult);
  }

  // ===========================================================================
  // 2. Multi-Tenant Sovereign Isolation & Security Checks
  // ===========================================================================

  _assertValidContext(context) {
    if (!context || typeof context !== 'object') {
      throw new ValidationError('Security context is required');
    }
    if (!context.tenantId || typeof context.tenantId !== 'string') {
      throw new ValidationError('Trusted tenantId is required in context');
    }
  }

  _assertTenantIsolation(context, resumeArtifact, assertions, candidateProfile) {
    const trustedTenantId = context.tenantId;

    // Check resume artifact tenant
    if (typeof resumeArtifact === 'object' && resumeArtifact !== null) {
      if (resumeArtifact.tenantId && resumeArtifact.tenantId !== trustedTenantId) {
        throw new NotFoundError(`Resume artifact not found in tenant '${trustedTenantId}'`, {
          trustedTenantId,
          artifactTenantId: resumeArtifact.tenantId,
        });
      }
    }

    // Check candidate profile tenant
    if (
      candidateProfile &&
      candidateProfile.tenantId &&
      candidateProfile.tenantId !== trustedTenantId
    ) {
      throw new NotFoundError(`Candidate profile not found in tenant '${trustedTenantId}'`, {
        trustedTenantId,
        candidateTenantId: candidateProfile.tenantId,
      });
    }

    // Check assertions tenant
    if (Array.isArray(assertions)) {
      for (const ass of assertions) {
        if (ass.tenantId && ass.tenantId !== trustedTenantId) {
          throw new NotFoundError(`Assertion belongs to a different tenant`, {
            trustedTenantId,
            assertionTenantId: ass.tenantId,
          });
        }
        if (Array.isArray(ass.evidenceRefs)) {
          for (const ev of ass.evidenceRefs) {
            if (ev.tenantId && ev.tenantId !== trustedTenantId) {
              throw new NotFoundError(`Evidence reference belongs to a different tenant`, {
                trustedTenantId,
                evidenceTenantId: ev.tenantId,
              });
            }
          }
        }
      }
    }
  }

  // ===========================================================================
  // 3. Input Format Detection & Normalization
  // ===========================================================================

  _detectInputFormat(artifact, options) {
    const fmtOpt = options.format?.toUpperCase();
    if (fmtOpt === 'PDF' || fmtOpt === 'DOCX') {
      throw new ValidationError(`UNSUPPORTED_FORMAT: ${fmtOpt} format is not supported in Phase 6`);
    }

    if (typeof artifact === 'string') {
      const trimmed = artifact.trim();
      if (trimmed.startsWith('#') || trimmed.includes('\n## ') || trimmed.includes('\n# ')) {
        return 'MARKDOWN';
      }
      return 'PLAIN_TEXT';
    }

    if (typeof artifact === 'object' && artifact !== null) {
      if (artifact.basics && (artifact.work || artifact.skills || artifact.education)) {
        return 'JSON_RESUME';
      }
      if (
        artifact.resumeId ||
        (Array.isArray(artifact.skills) && Array.isArray(artifact.experience))
      ) {
        return 'STRUCTURED_RESUME';
      }
    }

    return 'PLAIN_TEXT';
  }

  // ===========================================================================
  // 4. Ground-Truth Index Construction
  // ===========================================================================

  _buildVerificationIndexes(assertions = [], candidateProfile = null, _resumeArtifact = null) {
    const assertionsById = new Map();
    const assertionsBySlug = new Map();
    const evidenceById = new Map();
    const verifiedSkills = new Set();
    const inferredSkills = new Set();
    const claimedSkills = new Set();
    const experienceRecords = [];
    const educationRecords = [];
    const projectRecords = [];

    // 1. Index Assertions
    if (Array.isArray(assertions)) {
      for (const ass of assertions) {
        if (ass.assertionId) {
          assertionsById.set(ass.assertionId, ass);
        }
        if (ass.subjectSlug) {
          const slug = SkillTaxonomyEngine.generateSafeSlug(ass.subjectSlug);
          if (!assertionsBySlug.has(slug)) {
            assertionsBySlug.set(slug, []);
          }
          assertionsBySlug.get(slug).push(ass);

          // Categorize by status
          if (ass.status === 'VERIFIED') {
            verifiedSkills.add(slug);
          } else if (ass.status === 'INFERRED') {
            inferredSkills.add(slug);
          } else if (ass.status === 'CLAIMED') {
            claimedSkills.add(slug);
          }
        }

        // Index EvidenceRefs
        if (Array.isArray(ass.evidenceRefs)) {
          for (const ev of ass.evidenceRefs) {
            const evId = ev.id || ev.evidenceId;
            if (evId) {
              evidenceById.set(evId, ev);
            }
          }
        }
      }
    }

    // 2. Index Candidate Profile
    if (candidateProfile) {
      if (Array.isArray(candidateProfile.skills)) {
        for (const s of candidateProfile.skills) {
          const slug = SkillTaxonomyEngine.generateSafeSlug(
            s.slug || s.canonicalSlug || s.skillSlug || s.name || ''
          );
          if (slug && slug !== 'unknown-tool') {
            if (s.provenanceStatus === 'VERIFIED' || s.status === 'VERIFIED') {
              verifiedSkills.add(slug);
            } else if (s.provenanceStatus === 'INFERRED' || s.status === 'INFERRED') {
              inferredSkills.add(slug);
            } else {
              claimedSkills.add(slug);
            }
          }
          if (Array.isArray(s.evidence)) {
            for (const ev of s.evidence) {
              const evId = ev.id || ev.evidenceId;
              if (evId) evidenceById.set(evId, ev);
            }
          }
        }
      }

      if (Array.isArray(candidateProfile.experience)) {
        for (const exp of candidateProfile.experience) {
          experienceRecords.push({
            company: exp.company?.toLowerCase().trim(),
            title: exp.title?.toLowerCase().trim(),
            startDate: exp.startDate,
            endDate: exp.endDate,
            isCurrent: Boolean(exp.isCurrent),
          });
        }
      }

      if (Array.isArray(candidateProfile.education)) {
        for (const edu of candidateProfile.education) {
          educationRecords.push({
            institution: edu.institution?.toLowerCase().trim(),
            degree: edu.degree?.toLowerCase().trim(),
            fieldOfStudy: edu.fieldOfStudy?.toLowerCase().trim(),
          });
        }
      }

      if (Array.isArray(candidateProfile.projects)) {
        for (const p of candidateProfile.projects) {
          projectRecords.push({
            id: p.id || p.projectId,
            name: p.name?.toLowerCase().trim(),
            slug: p.slug?.toLowerCase().trim(),
          });
        }
      }
    }

    return {
      assertionsById,
      assertionsBySlug,
      evidenceById,
      verifiedSkills,
      inferredSkills,
      claimedSkills,
      experienceRecords,
      educationRecords,
      projectRecords,
    };
  }

  // ===========================================================================
  // 5. Deterministic Claim Extraction
  // ===========================================================================

  _extractClaims(artifact, format, _options) {
    switch (format) {
      case 'STRUCTURED_RESUME':
        return this._extractFromStructuredResume(artifact);
      case 'JSON_RESUME':
        return this._extractFromJsonResume(artifact);
      case 'MARKDOWN':
        return this._extractFromMarkdown(artifact);
      case 'PLAIN_TEXT':
      default:
        return this._extractFromPlainText(artifact);
    }
  }

  _extractFromStructuredResume(resume) {
    const claims = [];

    const sanitizeEvidenceRefs = (refs) => {
      if (!Array.isArray(refs)) return [];
      return refs
        .filter(
          (er) =>
            er &&
            typeof er === 'object' &&
            er.id &&
            er.resourceId &&
            er.resourceName &&
            er.filePath &&
            er.evidenceType &&
            (!er.commitSha || /^[0-9a-f]{40}$/i.test(er.commitSha))
        )
        .map((er) => ({
          id: er.id,
          resourceId: er.resourceId,
          resourceName: er.resourceName,
          filePath: er.filePath,
          evidenceType: er.evidenceType,
          commitSha: er.commitSha || null,
          lineRange: er.lineRange || null,
          excerpt: er.excerpt || null,
          confidenceScore: er.confidenceScore || 1.0,
        }));
    };

    // Headline & Summary
    if (resume.headline) {
      claims.push(
        ...this._parseProseClaims(resume.headline, { section: 'HEADLINE', field: 'headline' })
      );
    }
    if (resume.summary) {
      claims.push(
        ...this._parseProseClaims(resume.summary, { section: 'SUMMARY', field: 'summary' })
      );
    }

    // Skills
    if (Array.isArray(resume.skills)) {
      resume.skills.forEach((cat, _catIdx) => {
        if (Array.isArray(cat.skills)) {
          cat.skills.forEach((s, sIdx) => {
            const canonical = SkillTaxonomyEngine.resolveCanonicalSkill(s.name);
            claims.push({
              claimId: randomUUID(),
              claimText: s.name,
              claimType: 'SKILL',
              status: s.status || 'VERIFIED',
              canonicalSlug: canonical ? canonical.slug : s.canonicalSlug || s.name.toLowerCase(),
              location: { section: 'SKILLS', itemIndex: sIdx, field: cat.name },
              assertionId: s.assertionId || null,
              evidenceRefs: sanitizeEvidenceRefs(s.evidenceRefs),
            });
          });
        }
      });
    }

    // Experience
    if (Array.isArray(resume.experience)) {
      resume.experience.forEach((exp, expIdx) => {
        // Employer claim
        if (exp.company) {
          claims.push({
            claimId: randomUUID(),
            claimText: exp.company,
            claimType: 'EMPLOYER',
            status: 'VERIFIED',
            location: { section: 'EXPERIENCE', itemIndex: expIdx, field: 'company' },
          });
        }
        // Bullets
        if (Array.isArray(exp.bullets)) {
          exp.bullets.forEach((b, bIdx) => {
            const parsed = this._parseProseClaims(b.text, {
              section: 'EXPERIENCE',
              itemIndex: expIdx,
              lineNumber: bIdx + 1,
            });
            parsed.forEach((pc) => {
              pc.assertionId = b.assertionIds?.[0] || b.assertionId || null;
              pc.evidenceRefs = sanitizeEvidenceRefs(b.evidenceRefs);
              if (b.status) pc.status = b.status;
            });
            claims.push(...parsed);
          });
        }
      });
    }

    // Projects
    if (Array.isArray(resume.projects)) {
      resume.projects.forEach((proj, projIdx) => {
        if (proj.name) {
          claims.push({
            claimId: randomUUID(),
            claimText: proj.name,
            claimType: 'PROJECT',
            status: 'VERIFIED',
            location: { section: 'PROJECTS', itemIndex: projIdx, field: 'name' },
          });
        }
        if (Array.isArray(proj.bullets)) {
          proj.bullets.forEach((b, bIdx) => {
            const parsed = this._parseProseClaims(b.text, {
              section: 'PROJECTS',
              itemIndex: projIdx,
              lineNumber: bIdx + 1,
            });
            parsed.forEach((pc) => {
              pc.assertionId = b.assertionIds?.[0] || b.assertionId || null;
              pc.evidenceRefs = sanitizeEvidenceRefs(b.evidenceRefs);
              if (b.status) pc.status = b.status;
            });
            claims.push(...parsed);
          });
        }
      });
    }

    // Education
    if (Array.isArray(resume.education)) {
      resume.education.forEach((edu, eduIdx) => {
        if (edu.degree) {
          claims.push({
            claimId: randomUUID(),
            claimText: edu.degree,
            claimType: 'EDUCATION',
            status: 'VERIFIED',
            location: { section: 'EDUCATION', itemIndex: eduIdx, field: 'degree' },
          });
        }
        if (edu.institution) {
          claims.push({
            claimId: randomUUID(),
            claimText: edu.institution,
            claimType: 'EDUCATION',
            status: 'VERIFIED',
            location: { section: 'EDUCATION', itemIndex: eduIdx, field: 'institution' },
          });
        }
      });
    }

    return claims;
  }

  _extractFromJsonResume(jsonResume) {
    const claims = [];

    // Basics Summary
    if (jsonResume.basics?.summary) {
      claims.push(...this._parseProseClaims(jsonResume.basics.summary, { section: 'SUMMARY' }));
    }

    // Skills
    if (Array.isArray(jsonResume.skills)) {
      jsonResume.skills.forEach((skillCat, idx) => {
        if (Array.isArray(skillCat.keywords)) {
          skillCat.keywords.forEach((kw) => {
            const isUnverified = kw.includes('[Unverified User Claim]');
            const cleanName = kw.replace('[Unverified User Claim]', '').trim();
            const canonical = SkillTaxonomyEngine.resolveCanonicalSkill(cleanName);
            claims.push({
              claimId: randomUUID(),
              claimText: kw,
              claimType: 'SKILL',
              status: isUnverified
                ? 'CLAIMED'
                : skillCat.level === 'INFERRED'
                  ? 'INFERRED'
                  : 'VERIFIED',
              canonicalSlug: canonical ? canonical.slug : cleanName.toLowerCase(),
              location: { section: 'SKILLS', itemIndex: idx, field: skillCat.name || 'skills' },
            });
          });
        }
      });
    }

    // Work
    if (Array.isArray(jsonResume.work)) {
      jsonResume.work.forEach((w, wIdx) => {
        if (w.name) {
          claims.push({
            claimId: randomUUID(),
            claimText: w.name,
            claimType: 'EMPLOYER',
            status: 'VERIFIED',
            location: { section: 'EXPERIENCE', itemIndex: wIdx, field: 'name' },
          });
        }
        if (Array.isArray(w.highlights)) {
          w.highlights.forEach((h, hIdx) => {
            claims.push(
              ...this._parseProseClaims(h, {
                section: 'EXPERIENCE',
                itemIndex: wIdx,
                lineNumber: hIdx + 1,
              })
            );
          });
        }
      });
    }

    // Projects
    if (Array.isArray(jsonResume.projects)) {
      jsonResume.projects.forEach((p, pIdx) => {
        if (p.name) {
          claims.push({
            claimId: randomUUID(),
            claimText: p.name,
            claimType: 'PROJECT',
            status: 'VERIFIED',
            location: { section: 'PROJECTS', itemIndex: pIdx, field: 'name' },
          });
        }
        if (Array.isArray(p.highlights)) {
          p.highlights.forEach((h, hIdx) => {
            claims.push(
              ...this._parseProseClaims(h, {
                section: 'PROJECTS',
                itemIndex: pIdx,
                lineNumber: hIdx + 1,
              })
            );
          });
        }
      });
    }

    return claims;
  }

  _extractFromMarkdown(markdownText) {
    const lines = markdownText.split('\n');
    const claims = [];
    let currentSection = 'HEADER';

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('## ')) {
        currentSection = trimmed.replace('## ', '').trim().toUpperCase();
        return;
      }

      if (trimmed.startsWith('# ')) {
        currentSection = 'HEADER';
        return;
      }

      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const bulletText = trimmed.replace(/^[-*]\s+/, '').trim();
        claims.push(
          ...this._parseProseClaims(bulletText, { section: currentSection, lineNumber: idx + 1 })
        );
      } else if (!trimmed.startsWith('---') && !trimmed.startsWith('```')) {
        claims.push(
          ...this._parseProseClaims(trimmed, { section: currentSection, lineNumber: idx + 1 })
        );
      }
    });

    return claims;
  }

  _extractFromPlainText(plainText) {
    const lines = plainText.split('\n');
    const claims = [];
    let currentSection = 'HEADER';

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('=== ') && trimmed.endsWith(' ===')) {
        currentSection = trimmed.replace(/===/g, '').trim().toUpperCase();
        return;
      }

      if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        const bulletText = trimmed.replace(/^[* -]\s+/, '').trim();
        claims.push(
          ...this._parseProseClaims(bulletText, { section: currentSection, lineNumber: idx + 1 })
        );
      } else {
        claims.push(
          ...this._parseProseClaims(trimmed, { section: currentSection, lineNumber: idx + 1 })
        );
      }
    });

    return claims;
  }

  _parseProseClaims(text, location) {
    const claims = [];
    if (!text || typeof text !== 'string') return claims;

    const isUnverified = text.includes('[Unverified User Claim]');

    // 0. Tenure Date Range Extraction
    const tenureRegex = /\b(19\d\d|20\d\d)\s*[-–—]\s*(Present|19\d\d|20\d\d)\b/gi;
    let tenureMatch;
    while ((tenureMatch = tenureRegex.exec(text)) !== null) {
      claims.push({
        claimId: randomUUID(),
        claimText: tenureMatch[0],
        claimType: 'TENURE',
        status: isUnverified ? 'CLAIMED' : 'VERIFIED',
        location,
        fullProse: text,
      });
    }

    // 1. Metric Extraction
    for (const pattern of METRIC_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        claims.push({
          claimId: randomUUID(),
          claimText: match[0],
          claimType: 'METRIC',
          status: isUnverified ? 'CLAIMED' : 'VERIFIED',
          location,
          fullProse: text,
        });
      }
    }

    // 2. Skill & Technology Extraction via Taxonomy
    const tokens = text.split(/[\s,.;:()[\]{}|/\\`"']+/).filter((t) => t.length >= 2);

    for (const token of tokens) {
      const canonical = SkillTaxonomyEngine.resolveCanonicalSkill(token);
      if (canonical) {
        claims.push({
          claimId: randomUUID(),
          claimText: token,
          claimType: 'SKILL',
          status: isUnverified ? 'CLAIMED' : 'VERIFIED',
          canonicalSlug: canonical.slug,
          location,
          fullProse: text,
        });
      }
    }

    // 3. Achievement Outcome vs Capability Statement
    if (ACHIEVEMENT_VERB_REGEX.test(text)) {
      claims.push({
        claimId: randomUUID(),
        claimText: text.slice(0, 120),
        claimType: 'ACHIEVEMENT',
        status: isUnverified ? 'CLAIMED' : 'VERIFIED',
        location,
        fullProse: text,
      });
    }

    return claims;
  }

  // ===========================================================================
  // 6. Claim Grounding & Verification Logic
  // ===========================================================================

  _auditClaim(claim, indexes, _context, _candidateId) {
    const claimType = claim.claimType;
    let isGrounded = false;
    let finding = null;
    let status = claim.status || 'VERIFIED';
    let isStatusInflated = false;

    switch (claimType) {
      case 'SKILL': {
        const slug = claim.canonicalSlug || claim.claimText.toLowerCase();
        const hasVerified = indexes.verifiedSkills.has(slug);
        const hasInferred = indexes.inferredSkills.has(slug);
        const hasClaimed = indexes.claimedSkills.has(slug);

        if (hasVerified) {
          isGrounded = true;
          status = 'VERIFIED';
        } else if (hasInferred) {
          isGrounded = true;
          status = 'INFERRED';
          finding = {
            findingId: randomUUID(),
            code: 'VALID_INFERENCE',
            severity: 'WARN',
            message: `Skill '${claim.claimText}' is grounded as an inferred qualification via taxonomy.`,
            claimText: claim.claimText,
            claimType: 'SKILL',
            location: claim.location,
            remediation: 'No remediation required. Skill is supported via taxonomic inference.',
          };
        } else if (hasClaimed) {
          if (claim.status === 'VERIFIED' && !claim.claimText.includes('[Unverified User Claim]')) {
            isGrounded = false;
            isStatusInflated = true;
            status = 'MISSING_EVIDENCE';
            finding = {
              findingId: randomUUID(),
              code: 'STATUS_INFLATION',
              severity: 'BLOCK',
              message: `Status inflation detected: self-asserted user claim '${claim.claimText}' presented as authoritative VERIFIED fact without evidence.`,
              claimText: claim.claimText,
              claimType: 'SKILL',
              location: claim.location,
              remediation: `Restore [Unverified User Claim] label or attach verified repository evidence for '${claim.claimText}'.`,
            };
          } else {
            isGrounded = true;
            status = 'CLAIMED';
            finding = {
              findingId: randomUUID(),
              code: 'LABELED_USER_CLAIM',
              severity: 'WARN',
              message: `Skill '${claim.claimText}' is a self-asserted user claim without cryptographic proof.`,
              claimText: claim.claimText,
              claimType: 'SKILL',
              location: claim.location,
              remediation:
                'Retain [Unverified User Claim] tag or attach repository evidence demonstrating skill usage.',
            };
          }
        } else if (
          claim.status === 'CLAIMED' ||
          claim.claimText.includes('[Unverified User Claim]')
        ) {
          isGrounded = true;
          status = 'CLAIMED';
          finding = {
            findingId: randomUUID(),
            code: 'LABELED_USER_CLAIM',
            severity: 'WARN',
            message: `Skill '${claim.claimText}' is a self-asserted user claim without cryptographic proof.`,
            claimText: claim.claimText,
            claimType: 'SKILL',
            location: claim.location,
            remediation:
              'Retain [Unverified User Claim] tag or attach repository evidence demonstrating skill usage.',
          };
        } else {
          // Unsupported skill presented as fact
          isGrounded = false;
          status = 'MISSING_EVIDENCE';
          finding = {
            findingId: randomUUID(),
            code: 'UNSUPPORTED_SKILL',
            severity: 'BLOCK',
            message: `Unsupported technical skill '${claim.claimText}' has no supporting evidence in candidate records.`,
            claimText: claim.claimText,
            claimType: 'SKILL',
            location: claim.location,
            remediation: `Remove skill '${claim.claimText}' from resume or connect an authorized repository containing verified code for this technology.`,
          };
        }
        break;
      }

      case 'METRIC': {
        // Quantitative metrics must be backed by explicit evidence in candidate profile or assertions
        const hasEvidence =
          (Array.isArray(claim.evidenceRefs) && claim.evidenceRefs.length > 0) ||
          (indexes.evidenceById.size > 0 && this._checkMetricEvidence(claim.claimText, indexes));

        if (hasEvidence) {
          isGrounded = true;
          status = 'VERIFIED';
        } else {
          isGrounded = false;
          status = 'MISSING_EVIDENCE';
          finding = {
            findingId: randomUUID(),
            code: 'UNSUPPORTED_METRIC',
            severity: 'BLOCK',
            message: `Quantitative claim '${claim.claimText}' lacks explicit supporting evidence or benchmarks.`,
            claimText: claim.claimText,
            claimType: 'METRIC',
            location: claim.location,
            remediation: `Remove quantitative metric '${claim.claimText}' or attach benchmark / test evidence verifying the claim.`,
          };
        }
        break;
      }

      case 'EMPLOYER': {
        const empName = claim.claimText.toLowerCase().trim();
        const found = indexes.experienceRecords.some(
          (exp) => exp.company?.includes(empName) || empName.includes(exp.company)
        );
        if (found) {
          isGrounded = true;
          status = 'VERIFIED';
        } else {
          isGrounded = false;
          status = 'MISSING_EVIDENCE';
          finding = {
            findingId: randomUUID(),
            code: 'UNSUPPORTED_EMPLOYER',
            severity: 'BLOCK',
            message: `Employer '${claim.claimText}' is not listed in validated candidate work history.`,
            claimText: claim.claimText,
            claimType: 'EMPLOYER',
            location: claim.location,
            remediation: `Remove employer '${claim.claimText}' or update candidate work history with verified employment record.`,
          };
        }
        break;
      }

      case 'EDUCATION': {
        const eduText = claim.claimText.toLowerCase().trim();
        const found = indexes.educationRecords.some(
          (edu) =>
            edu.institution?.includes(eduText) ||
            eduText.includes(edu.institution) ||
            edu.degree?.includes(eduText) ||
            eduText.includes(edu.degree)
        );
        if (found || indexes.educationRecords.length === 0) {
          isGrounded = true;
          status = 'VERIFIED';
        } else {
          isGrounded = false;
          status = 'MISSING_EVIDENCE';
          finding = {
            findingId: randomUUID(),
            code: 'UNSUPPORTED_EDUCATION',
            severity: 'BLOCK',
            message: `Educational credential '${claim.claimText}' is not found in candidate records.`,
            claimText: claim.claimText,
            claimType: 'EDUCATION',
            location: claim.location,
            remediation: `Remove education entry '${claim.claimText}' or add verified credential to candidate profile.`,
          };
        }
        break;
      }

      case 'ACHIEVEMENT': {
        isGrounded = true;
        status = 'VERIFIED';
        break;
      }

      case 'PROJECT': {
        const projName = claim.claimText.toLowerCase().trim();
        const found = indexes.projectRecords.some((p) => {
          const pName = (p.name || '').toLowerCase().trim();
          const pSlug = (p.slug || '').toLowerCase().trim();
          return (
            pName === projName ||
            pSlug === projName ||
            projName.endsWith(`/${pName}`) ||
            projName.endsWith(`/${pSlug}`)
          );
        });
        if (found || indexes.projectRecords.length === 0) {
          isGrounded = true;
          status = 'VERIFIED';
        } else {
          isGrounded = false;
          status = 'MISSING_EVIDENCE';
          finding = {
            findingId: randomUUID(),
            code: 'PROJECT_MISMATCH',
            severity: 'BLOCK',
            message: `Project '${claim.claimText}' does not match any authorized candidate repositories.`,
            claimText: claim.claimText,
            claimType: 'PROJECT',
            location: claim.location,
            remediation: `Connect authorized repository for '${claim.claimText}' or remove from resume.`,
          };
        }
        break;
      }

      default:
        isGrounded = true;
        status = 'VERIFIED';
    }

    return {
      claimId: claim.claimId || randomUUID(),
      claimText: claim.claimText,
      claimType: claim.claimType,
      status,
      canonicalSlug: claim.canonicalSlug || null,
      location: claim.location,
      assertionId: claim.assertionId || null,
      evidenceRefs: claim.evidenceRefs || [],
      isGrounded,
      isContradiction: false,
      isStatusInflated,
      finding,
    };
  }

  _checkMetricEvidence(metricText, indexes) {
    // Check if any assertion or evidence item explicitly references the metric
    for (const ass of indexes.assertionsById.values()) {
      if (ass.statement && ass.statement.includes(metricText)) return true;
    }
    for (const ev of indexes.evidenceById.values()) {
      if (ev.excerpt && ev.excerpt.includes(metricText)) return true;
    }
    return false;
  }

  // ===========================================================================
  // 7. Structured Evidence Reference & Provenance Validation
  // ===========================================================================

  _auditStructuredCitations(artifact, format, indexes, context, candidateId) {
    const findings = [];
    if (format !== 'STRUCTURED_RESUME' || typeof artifact !== 'object' || artifact === null) {
      return findings;
    }

    const sanitizeEvidenceRefs = (refs) => {
      if (!Array.isArray(refs)) return [];
      return refs
        .filter(
          (er) =>
            er &&
            typeof er === 'object' &&
            er.id &&
            er.resourceId &&
            er.resourceName &&
            er.filePath &&
            er.evidenceType &&
            (!er.commitSha || /^[0-9a-f]{40}$/i.test(er.commitSha))
        )
        .map((er) => ({
          id: er.id,
          resourceId: er.resourceId,
          resourceName: er.resourceName,
          filePath: er.filePath,
          evidenceType: er.evidenceType,
          commitSha: er.commitSha || null,
          lineRange: er.lineRange || null,
          excerpt: er.excerpt || null,
          confidenceScore: er.confidenceScore || 1.0,
        }));
    };

    const checkEvidenceRefs = (evidenceRefs, location, bulletText) => {
      if (!Array.isArray(evidenceRefs)) return;

      for (const ev of evidenceRefs) {
        const evId = ev.id || ev.evidenceId;

        // 1. Check for invalid or non-existent EvidenceId
        if (!evId || !indexes.evidenceById.has(evId)) {
          findings.push({
            findingId: randomUUID(),
            code: 'INVALID_EVIDENCE_ID',
            severity: 'BLOCK',
            message: `Referenced EvidenceId '${evId || 'null'}' does not resolve to an active evidence item.`,
            claimText: bulletText || 'Evidence citation',
            claimType: 'OTHER',
            location,
            evidenceRefs: sanitizeEvidenceRefs([ev]),
            remediation: 'Replace with valid EvidenceId from active repository evidence index.',
          });
          continue;
        }

        const storedEvidence = indexes.evidenceById.get(evId);

        // 2. Tenant isolation check
        const evTenantId = ev.tenantId || storedEvidence.tenantId;
        if (evTenantId && evTenantId !== context.tenantId) {
          findings.push({
            findingId: randomUUID(),
            code: 'TENANT_MISMATCH',
            severity: 'BLOCK',
            message: `EvidenceId '${evId}' belongs to foreign tenant '${evTenantId}'.`,
            claimText: bulletText || 'Evidence citation',
            claimType: 'OTHER',
            location,
            evidenceRefs: sanitizeEvidenceRefs([ev]),
            remediation: 'Remove foreign tenant citation.',
          });
        }

        // 3. Candidate isolation check
        const evCandId = ev.candidateId || storedEvidence.candidateId;
        if (evCandId && evCandId !== candidateId) {
          findings.push({
            findingId: randomUUID(),
            code: 'CANDIDATE_MISMATCH',
            severity: 'BLOCK',
            message: `EvidenceId '${evId}' belongs to candidate '${evCandId}'.`,
            claimText: bulletText || 'Evidence citation',
            claimType: 'OTHER',
            location,
            evidenceRefs: sanitizeEvidenceRefs([ev]),
            remediation: 'Cite evidence belonging exclusively to the audited candidate.',
          });
        }

        // 4. Commit SHA Provenance (Must be 40-character hexadecimal)
        if (ev.commitSha && !/^[0-9a-f]{40}$/i.test(ev.commitSha)) {
          findings.push({
            findingId: randomUUID(),
            code: 'PROVENANCE_MISMATCH',
            severity: 'BLOCK',
            message: `Evidence citation contains malformed commitSha '${ev.commitSha}'.`,
            claimText: bulletText || 'Evidence citation',
            claimType: 'OTHER',
            location,
            evidenceRefs: sanitizeEvidenceRefs([ev]),
            remediation: 'Provide an immutable 40-character hexadecimal Git commit SHA.',
          });
        } else if (
          storedEvidence.commitSha &&
          ev.commitSha &&
          storedEvidence.commitSha !== ev.commitSha
        ) {
          findings.push({
            findingId: randomUUID(),
            code: 'PROVENANCE_MISMATCH',
            severity: 'BLOCK',
            message: `Evidence commitSha '${ev.commitSha}' does not match stored proof node SHA '${storedEvidence.commitSha}'.`,
            claimText: bulletText || 'Evidence citation',
            claimType: 'OTHER',
            location,
            evidenceRefs: sanitizeEvidenceRefs([ev]),
            remediation: 'Re-pin citation to original verified commit SHA.',
          });
        }
      }
    };

    // Traverse Experience
    if (Array.isArray(artifact.experience)) {
      artifact.experience.forEach((exp, expIdx) => {
        if (Array.isArray(exp.bullets)) {
          exp.bullets.forEach((b, bIdx) => {
            checkEvidenceRefs(
              b.evidenceRefs,
              { section: 'EXPERIENCE', itemIndex: expIdx, lineNumber: bIdx + 1 },
              b.text
            );
          });
        }
      });
    }

    // Traverse Projects
    if (Array.isArray(artifact.projects)) {
      artifact.projects.forEach((proj, projIdx) => {
        if (Array.isArray(proj.bullets)) {
          proj.bullets.forEach((b, bIdx) => {
            checkEvidenceRefs(
              b.evidenceRefs,
              { section: 'PROJECTS', itemIndex: projIdx, lineNumber: bIdx + 1 },
              b.text
            );
          });
        }
      });
    }

    return findings;
  }

  // ===========================================================================
  // 8. Contradiction & Keyword Stuffing Audits
  // ===========================================================================

  _auditContradictionsAndStuffing(rawClaims, indexes, candidateProfile) {
    const findings = [];
    const skillCounts = new Map();

    // 1. Keyword Stuffing Detection
    for (const claim of rawClaims) {
      if (claim.claimType === 'SKILL') {
        const slug = claim.canonicalSlug || claim.claimText.toLowerCase();
        skillCounts.set(slug, (skillCounts.get(slug) || 0) + 1);

        // If skill appears 3+ times without ANY verified evidence -> Keyword stuffing violation
        if (
          skillCounts.get(slug) >= 3 &&
          !indexes.verifiedSkills.has(slug) &&
          !indexes.inferredSkills.has(slug)
        ) {
          findings.push({
            findingId: randomUUID(),
            code: 'UNSUPPORTED_SKILL',
            severity: 'BLOCK',
            message: `Keyword stuffing detected: unsupported skill '${claim.claimText}' repeated ${skillCounts.get(slug)} times without evidence.`,
            claimText: claim.claimText,
            claimType: 'SKILL',
            location: claim.location,
            remediation: `Remove repeated mentions of ungrounded technology '${claim.claimText}'.`,
          });
        }
      }
    }

    // 2. Contradiction Detection (e.g. Work dates / titles)
    if (candidateProfile && Array.isArray(candidateProfile.experience)) {
      for (const exp of candidateProfile.experience) {
        if (exp.startDate) {
          const startYear = parseInt(exp.startDate.slice(0, 4), 10);
          const endYear = exp.endDate
            ? parseInt(exp.endDate.slice(0, 4), 10)
            : new Date().getFullYear();

          for (const claim of rawClaims) {
            if (claim.claimType === 'TENURE' && claim.claimText) {
              const match = /(\d{4})\s*[-–—]\s*(Present|\d{4})/i.exec(claim.claimText);
              if (match) {
                const claimStart = parseInt(match[1], 10);
                const claimEnd =
                  match[2].toLowerCase() === 'present'
                    ? new Date().getFullYear()
                    : parseInt(match[2], 10);
                if (claimStart < startYear - 2 || claimEnd > endYear + 2) {
                  findings.push({
                    findingId: randomUUID(),
                    code: 'CONTRADICTORY_FACT',
                    severity: 'BLOCK',
                    message: `Resume asserts tenure '${claim.claimText}' contradicting candidate profile dates '${exp.startDate} - ${exp.endDate || 'Present'}'.`,
                    claimText: claim.claimText,
                    claimType: 'TENURE',
                    location: claim.location,
                    remediation:
                      'Align resume employment tenure with verified candidate profile dates.',
                  });
                }
              }
            }
          }
        }
      }
    }

    return findings;
  }

  // ===========================================================================
  // 9. Content Drift & Statistics Calculations
  // ===========================================================================

  _classifyContentDrift(claims, indexes, _format) {
    if (claims.length === 0 || indexes.assertionsById.size === 0) {
      return 'NONE';
    }

    const unsupportedCount = claims.filter((c) => {
      if (c.claimType === 'SKILL') {
        const slug = c.canonicalSlug || c.claimText.toLowerCase();
        return (
          !indexes.verifiedSkills.has(slug) &&
          !indexes.inferredSkills.has(slug) &&
          !indexes.claimedSkills.has(slug)
        );
      }
      return false;
    }).length;

    if (unsupportedCount > 0) {
      return 'FACTUAL_CHANGE';
    }

    return 'NONE';
  }

  _calculateStatistics(auditedClaims, findings, metricClaimsCount) {
    let verifiedCount = 0;
    let inferredCount = 0;
    let claimedCount = 0;
    let unsupportedCount = 0;

    for (const c of auditedClaims) {
      if (c.status === 'VERIFIED') verifiedCount++;
      else if (c.status === 'INFERRED') inferredCount++;
      else if (c.status === 'CLAIMED') claimedCount++;
      else if (c.status === 'MISSING_EVIDENCE' || !c.isGrounded) unsupportedCount++;
    }

    const blockedFindingsCount = findings.filter((f) => f.severity === 'BLOCK').length;
    const warnFindingsCount = findings.filter((f) => f.severity === 'WARN').length;
    const infoFindingsCount = findings.filter((f) => f.severity === 'INFO').length;

    return {
      totalClaimsAudited: auditedClaims.length,
      verifiedCount,
      inferredCount,
      claimedCount,
      unsupportedCount,
      metricClaimsCount,
      blockedFindingsCount,
      warnFindingsCount,
      infoFindingsCount,
    };
  }

  _calculateEvidenceCoverage(auditedClaims) {
    const totalClaims = auditedClaims.length;
    if (totalClaims === 0) {
      return {
        totalClaims: 0,
        groundedClaims: 0,
        inferredClaims: 0,
        claimedClaims: 0,
        unsupportedClaims: 0,
        coveragePercentage: 100.0,
      };
    }

    const groundedClaims = auditedClaims.filter(
      (c) => c.status === 'VERIFIED' && c.isGrounded
    ).length;
    const inferredClaims = auditedClaims.filter((c) => c.status === 'INFERRED').length;
    const claimedClaims = auditedClaims.filter((c) => c.status === 'CLAIMED').length;
    const unsupportedClaims = auditedClaims.filter(
      (c) => !c.isGrounded || c.status === 'MISSING_EVIDENCE'
    ).length;

    const coveragePercentage = Math.round((groundedClaims / totalClaims) * 1000) / 10;

    return {
      totalClaims,
      groundedClaims,
      inferredClaims,
      claimedClaims,
      unsupportedClaims,
      coveragePercentage,
    };
  }

  _deduplicateAndSortFindings(findings) {
    const seen = new Set();
    const unique = [];

    for (const f of findings) {
      const key = `${f.code}:${f.message}:${f.claimText}:${f.location?.section}:${f.location?.lineNumber}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(f);
      }
    }

    const severityOrder = { BLOCK: 0, WARN: 1, INFO: 2 };
    return unique.sort((a, b) => {
      const sDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (sDiff !== 0) return sDiff;
      return a.code.localeCompare(b.code);
    });
  }

  _sortClaims(claims) {
    return claims.sort((a, b) => {
      const secDiff = (a.location?.section || '').localeCompare(b.location?.section || '');
      if (secDiff !== 0) return secDiff;
      return a.claimText.localeCompare(b.claimText);
    });
  }
}
