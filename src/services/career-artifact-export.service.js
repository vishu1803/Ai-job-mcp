/**
 * @file Canonical Career Artifact Export Engine Service (P6-004)
 *
 * Implements deterministic, standards-compliant export of tailored career artifacts:
 * - Formats: JSON_RESUME (v1.0.0), MARKDOWN (CommonMark/GFM), PLAIN_TEXT (ATS-Safe), CANONICAL_JSON
 * - Citation Styles: NONE, INLINE, FOOTNOTES, METADATA_ONLY
 * - Privacy: Anonymization (PII redaction), Unverified Claim Omission
 * - Sanitization: ATS typography normalization, HTML escaping, tab replacement
 * - Line Endings: LF, CRLF
 * - Encodings: UTF-8, ASCII (transliterated)
 * - Security: Multi-tenant sovereign default-deny (404), secret leakage defense, path traversal defense
 * - Zero database writes & 100% deterministic in-memory execution
 */

import crypto, { randomUUID } from 'node:crypto';
import { ValidationError, NotFoundError } from '../errors/index.js';
import { ZeroHallucinationIntegrityService } from './zero-hallucination-integrity.service.js';
import { enforceEvidenceTrust } from './evidence/verification-policy.js';
import { isCurrentNarrativeArtifact } from './evidence/narrative-policy.js';
import {
  resumeExportView,
  resumeDateRange,
  resumeLocation,
  educationDetails,
  extraResumeSections,
} from '../utils/resume-export-view.js';
import {
  ExportOptionsSchema,
  JsonResumeSchema,
  ExportedArtifactSchema,
} from '../domain/career/career-artifact-export.schemas.js';

/**
 * Secret key patterns forbidden in exported metadata.
 */
const FORBIDDEN_SECRET_PATTERNS = [
  /password/i,
  /secret/i,
  /apikey/i,
  /api_key/i,
  /token/i,
  /privatekey/i,
  /private_key/i,
  /webhook_secret/i,
  /session/i,
  /credentials/i,
];

export class CareerArtifactExportService {
  /**
   * @param {Object} [dependencies]
   * @param {ZeroHallucinationIntegrityService} [dependencies.integrityGate]
   */
  constructor(dependencies = {}) {
    this.integrityGate = dependencies.integrityGate || new ZeroHallucinationIntegrityService();
  }

  // ===========================================================================
  // 1. Primary Export Operation
  // ===========================================================================

  /**
   * Exports any tailored career artifact into a standardized interchange format.
   *
   * @param {Object} context - Multi-tenant security context { tenantId, userId }
   * @param {Object} artifact - Validated domain artifact (Resume, Cover Letter, Portfolio)
   * @param {Object} [options] - Export formatting and privacy options
   * @returns {Object} Validated ExportedArtifact envelope
   */
  exportCareerArtifact(context, artifact, options = {}) {
    // 1. Assert Security Context & Tenant Isolation
    this._assertValidContext(context);
    this._assertTenantIsolation(context, artifact, options);
    if (!isCurrentNarrativeArtifact(artifact)) {
      throw new ValidationError(
        'Historical/imported artifact quarantined; regenerate from current evidence',
        'ARTIFACT_REVALIDATION_REQUIRED'
      );
    }
    // Export is also an ingress boundary for historical/client-provided artifacts.
    // A citation or old VERIFIED label cannot establish candidate proficiency.
    artifact = enforceEvidenceTrust(artifact);
    options = enforceEvidenceTrust(options);

    // 2. Parse & Validate Export Options
    let opts = ExportOptionsSchema.parse(options);

    // 3. Detect Artifact Type
    const artifactType = this._detectArtifactType(artifact);

    // 4. Validate Integrity Boundary
    this._validateArtifactIntegrity(context, artifact, opts);
    const sourceArtifact = artifact;
    const view = resumeExportView(artifact);
    if (view) {
      artifact = view.resume;
      opts = { ...opts, candidateProfile: view.candidateProfile };
    }
    if (!opts.includeUnverifiedClaims && artifactType === 'RESUME') {
      artifact = { ...artifact };
      for (const key of ['experience', 'education', 'certifications'])
        artifact[key] = (artifact[key] || []).filter(
          (entry) => entry.provenanceStatus !== 'CLAIMED'
        );
      if (sourceArtifact.structuredResume?.summary?.provenanceStatus === 'CLAIMED')
        artifact.summary = '';
    }

    // 5. Generate Format Content via Canonical Adapters
    let rawContent = '';
    let mimeType = 'text/plain';
    let defaultFileName = 'career-artifact.txt';

    switch (opts.format) {
      case 'JSON_RESUME': {
        if (artifactType !== 'RESUME') {
          throw new ValidationError(
            `JSON_RESUME format is only supported for Resume artifacts, received '${artifactType}'`
          );
        }
        const jsonResumeObj = this._renderJsonResume(artifact, opts);
        // Validate against JSON Resume v1.0.0 contract
        JsonResumeSchema.parse(jsonResumeObj);
        rawContent = JSON.stringify(jsonResumeObj, null, 2);
        mimeType = 'application/json';
        defaultFileName = 'resume.json';
        break;
      }

      case 'MARKDOWN': {
        rawContent = this._renderMarkdown(artifact, artifactType, opts);
        mimeType = 'text/markdown';
        defaultFileName =
          artifactType === 'RESUME'
            ? 'resume.md'
            : artifactType === 'COVER_LETTER'
              ? 'cover-letter.md'
              : artifactType === 'PORTFOLIO'
                ? 'portfolio-recommendation.md'
                : 'career-artifact.md';
        break;
      }

      case 'PLAIN_TEXT': {
        rawContent = this._renderPlainText(artifact, artifactType, opts);
        mimeType = 'text/plain';
        defaultFileName =
          artifactType === 'RESUME'
            ? 'resume.txt'
            : artifactType === 'COVER_LETTER'
              ? 'cover-letter.txt'
              : artifactType === 'PORTFOLIO'
                ? 'portfolio-recommendation.txt'
                : 'career-artifact.txt';
        break;
      }

      case 'CANONICAL_JSON': {
        const canonicalObj = this._renderCanonicalJson(sourceArtifact, artifactType, opts);
        rawContent = JSON.stringify(canonicalObj, null, 2);
        mimeType = 'application/json';
        defaultFileName =
          artifactType === 'RESUME'
            ? 'tailored-resume.json'
            : artifactType === 'COVER_LETTER'
              ? 'tailored-cover-letter.json'
              : artifactType === 'PORTFOLIO'
                ? 'portfolio-recommendation.json'
                : 'canonical-career-artifact.json';
        break;
      }

      default:
        throw new ValidationError(`Unsupported export format '${opts.format}'`);
    }

    if (opts.format === 'MARKDOWN' || opts.format === 'PLAIN_TEXT') {
      rawContent = `Evidence notice: Qualifications in this document are candidate-provided or inferred, not independently verified proficiency. Source citations identify observations, not authorship or competence.\n\n${rawContent}`;
    }

    // 6. Normalize Line Endings (LF vs CRLF)
    const normalizedContent = this._normalizeLineEndings(rawContent, opts.lineEnding);

    // 7. Apply Encoding Transformation (UTF-8 vs ASCII)
    const encodedContent = this._applyEncoding(normalizedContent, opts.encoding);

    // 8. Compute Checksum over Exact Exported Bytes
    const contentBuffer = Buffer.from(encodedContent, opts.encoding === 'ASCII' ? 'ascii' : 'utf8');
    const sha256Checksum = crypto.createHash('sha256').update(contentBuffer).digest('hex');

    // 9. Resolve Safe Filename
    const fileName = this._resolveSafeFileName(opts.fileName, defaultFileName);

    // 10. Compute Metadata
    const lineCount =
      encodedContent.length === 0
        ? 0
        : encodedContent.split(opts.lineEnding === 'CRLF' ? '\r\n' : '\n').length;
    const metadata = {
      artifactType,
      format: opts.format,
      citationStyle: opts.citationStyle,
      anonymized: opts.anonymize,
      includeUnverifiedClaims: opts.includeUnverifiedClaims,
      encoding: opts.encoding,
      lineEnding: opts.lineEnding,
      characterLength: encodedContent.length,
      lineCount,
      byteLength: contentBuffer.length,
      exportedAt: new Date().toISOString(),
      generatorVersion: 'v1.0.0',
    };

    // 11. Redact Any Secret Keys in Outgoing Metadata
    this._assertNoSecretsInMetadata(metadata);

    // 12. Build & Validate Exported Envelope
    const result = {
      artifactId:
        artifact.resumeId ||
        artifact.letterId ||
        artifact.recommendationId ||
        artifact.summaryId ||
        randomUUID(),
      tenantId: context.tenantId,
      artifactType,
      format: opts.format,
      mimeType,
      fileName,
      content: encodedContent,
      sha256Checksum,
      metadata,
    };

    return ExportedArtifactSchema.parse(result);
  }

  // ===========================================================================
  // 2. Convenience Operations
  // ===========================================================================

  /**
   * Convenience method to export a TailoredResume.
   */
  exportResume(context, resume, candidateProfile = null, options = {}) {
    return this.exportCareerArtifact(context, resume, {
      ...options,
      candidateProfile: candidateProfile || options.candidateProfile,
    });
  }

  /**
   * Convenience method to export a TailoredCoverLetter.
   */
  exportCoverLetter(context, coverLetter, candidateProfile = null, options = {}) {
    return this.exportCareerArtifact(context, coverLetter, {
      ...options,
      candidateProfile: candidateProfile || options.candidateProfile,
    });
  }

  /**
   * Convenience method to export a PortfolioRecommendation.
   */
  exportPortfolio(context, portfolio, candidateProfile = null, options = {}) {
    return this.exportCareerArtifact(context, portfolio, {
      ...options,
      candidateProfile: candidateProfile || options.candidateProfile,
    });
  }

  // ===========================================================================
  // 3. Multi-Tenant Isolation & Integrity Checks
  // ===========================================================================

  _assertValidContext(context) {
    if (!context || typeof context !== 'object') {
      throw new ValidationError('Security context is required');
    }
    if (!context.tenantId || typeof context.tenantId !== 'string') {
      throw new ValidationError('Trusted tenantId is required in context');
    }
  }

  _assertTenantIsolation(context, artifact, options) {
    if (!artifact || typeof artifact !== 'object') {
      throw new ValidationError('Artifact must be a valid object');
    }

    if (artifact.tenantId && artifact.tenantId !== context.tenantId) {
      throw new NotFoundError(`Artifact not found in tenant '${context.tenantId}'`, {
        trustedTenantId: context.tenantId,
        artifactTenantId: artifact.tenantId,
      });
    }
    if (context.candidateId && artifact.candidateId !== context.candidateId) {
      throw new NotFoundError('Artifact not found for current candidate');
    }

    const cand = options.candidateProfile || artifact.candidateProfile;
    if (cand && cand.tenantId && cand.tenantId !== context.tenantId) {
      throw new NotFoundError(`Candidate profile not found in tenant '${context.tenantId}'`, {
        trustedTenantId: context.tenantId,
        candidateTenantId: cand.tenantId,
      });
    }

    // Inspect nested evidence items
    this._assertNoCrossTenantEvidence(context.tenantId, artifact);
  }

  _assertNoCrossTenantEvidence(trustedTenantId, artifact) {
    const evidenceList = [];

    if (Array.isArray(artifact.projects)) {
      for (const p of artifact.projects) {
        if (Array.isArray(p.evidenceRefs)) evidenceList.push(...p.evidenceRefs);
      }
    }
    if (Array.isArray(artifact.featuredProjects)) {
      for (const fp of artifact.featuredProjects) {
        if (Array.isArray(fp.evidenceHighlights)) evidenceList.push(...fp.evidenceHighlights);
      }
    }
    if (Array.isArray(artifact.paragraphs)) {
      for (const pg of artifact.paragraphs) {
        if (Array.isArray(pg.evidenceRefs)) evidenceList.push(...pg.evidenceRefs);
      }
    }

    for (const ev of evidenceList) {
      if (ev.tenantId && ev.tenantId !== trustedTenantId) {
        throw new NotFoundError(`Evidence reference belongs to a different tenant`, {
          trustedTenantId,
          evidenceTenantId: ev.tenantId,
        });
      }
    }
  }

  _validateArtifactIntegrity(context, artifact, _options) {
    if (artifact.integrityStatus === 'BLOCKED') {
      throw new ValidationError('Cannot export artifact with BLOCKED integrity status');
    }

    // Pass through integrity service audit if assertions are present
    if (Array.isArray(artifact.assertions) && artifact.assertions.length > 0) {
      const evidenceIndex = new Map();
      const summary = this.integrityGate.validateCareerAssertions(
        context,
        artifact.assertions,
        evidenceIndex,
        { candidateProfile: artifact.candidateProfile }
      );
      if (summary.integrityStatus === 'BLOCKED') {
        throw new ValidationError('Integrity audit failed with BLOCKED status');
      }
    }
  }

  _assertNoSecretsInMetadata(metadata) {
    const checkObject = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        for (const pattern of FORBIDDEN_SECRET_PATTERNS) {
          if (pattern.test(key)) {
            throw new ValidationError(
              `Security violation: secret property '${key}' detected in export metadata`
            );
          }
        }
        if (typeof obj[key] === 'object') {
          checkObject(obj[key]);
        }
      }
    };
    checkObject(metadata);
  }

  // ===========================================================================
  // 4. Artifact Type Detection
  // ===========================================================================

  _detectArtifactType(artifact) {
    if (
      artifact.resumeId ||
      artifact.structuredResume ||
      (Array.isArray(artifact.skills) && Array.isArray(artifact.experience))
    ) {
      return 'RESUME';
    }
    if (artifact.letterId || Array.isArray(artifact.paragraphs)) {
      return 'COVER_LETTER';
    }
    if (artifact.recommendationId || Array.isArray(artifact.featuredProjects)) {
      return 'PORTFOLIO';
    }
    if (artifact.summaryId || Array.isArray(artifact.assertions)) {
      return 'CAREER_SUMMARY';
    }
    return 'UNKNOWN';
  }

  // ===========================================================================
  // 5. JSON Resume Adapter (v1.0.0)
  // ===========================================================================

  _renderJsonResume(resume, options) {
    const cand = options.candidateProfile || {};
    const anonymize = options.anonymize;
    const includeUnverified = options.includeUnverifiedClaims;

    // Basics
    const name = anonymize ? '[REDACTED_NAME]' : cand.displayName || cand.name || 'Candidate Name';
    const email = anonymize ? '[REDACTED_EMAIL]' : cand.canonicalEmail || cand.email || null;
    const phone = anonymize ? '[REDACTED_PHONE]' : cand.canonicalPhone || cand.phone || null;
    const address = anonymize ? '[REDACTED_ADDRESS]' : cand.location?.address || null;

    const basics = {
      name,
      label: resume.headline || cand.headline || '',
      email,
      phone,
      url: cand.websiteUrl || cand.portfolioUrl || null,
      summary:
        `Candidate-provided or inferred; not independently verified proficiency. ${resume.summary || ''}`.trim(),
      location: {
        address,
        postalCode: cand.location?.postalCode || null,
        city: anonymize
          ? null
          : (typeof cand.location === 'string' ? cand.location : cand.location?.city) || null,
        countryCode: anonymize ? null : cand.location?.countryCode || null,
        region: anonymize ? null : cand.location?.region || null,
      },
      profiles: anonymize
        ? []
        : Array.isArray(cand.links)
          ? cand.links.map((link) => ({
              network: link.label || link.platform || '',
              url: link.url,
            }))
          : Array.isArray(cand.identities)
            ? cand.identities.map((id) => ({
                network: id.provider || '',
                username: anonymize ? '[REDACTED_USERNAME]' : id.externalUsername || '',
                url: anonymize ? null : id.profileUrl || null,
              }))
            : [],
    };

    // Work
    const work = (Array.isArray(resume.experience) ? resume.experience : [])
      .map((exp) => {
        const filteredBullets = this._filterBullets(exp.bullets, includeUnverified);
        return {
          name: exp.company || undefined,
          position: exp.title || undefined,
          url: exp.url || null,
          startDate: exp.startDate || null,
          endDate: exp.isCurrent ? null : exp.endDate || null,
          summary: [...new Set([exp.summary, exp.description].filter(Boolean))].join('\n') || null,
          highlights: filteredBullets.map((b) => this._formatBulletText(b, options.citationStyle)),
        };
      })
      .filter((w) => w.highlights.length > 0 || w.name || w.position || w.summary);

    // Education
    const education = (Array.isArray(resume.education) ? resume.education : []).map((edu) => ({
      institution: edu.institution || undefined,
      url: edu.url || null,
      area: edu.fieldOfStudy || null,
      studyType: edu.degree || undefined,
      startDate: edu.startDate || null,
      endDate: edu.endDate || null,
      score: edu.grade || null,
      courses: edu.coursework || [],
    }));

    // Skills
    const skills = (Array.isArray(resume.skills) ? resume.skills : []).map((cat) => {
      const skillItems = (Array.isArray(cat.skills) ? cat.skills : []).filter(
        (s) => includeUnverified || s.status !== 'CLAIMED'
      );
      return {
        name: cat.name,
        level: 'CANDIDATE_PROVIDED_OR_INFERRED',
        keywords: skillItems.map((s) =>
          s.status === 'CLAIMED' && includeUnverified ? `${s.name} [Unverified User Claim]` : s.name
        ),
      };
    });

    // Projects
    const projects = (Array.isArray(resume.projects) ? resume.projects : []).map((proj) => {
      const filteredBullets = this._filterBullets(proj.bullets, includeUnverified);
      return {
        name: proj.displayName || proj.name,
        description: proj.description || null,
        highlights: filteredBullets.map((b) => this._formatBulletText(b, options.citationStyle)),
        keywords: proj.technologies || [
          ...(proj.primaryLanguages || []),
          ...(proj.primaryFrameworks || []),
        ],
        startDate: proj.startDate || null,
        endDate: proj.endDate || null,
        url: proj.repositoryUrl || proj.liveUrl || proj.demoUrl || null,
        roles: [],
        entity: null,
        type: proj.projectType || null,
      };
    });

    // Certificates
    const certificates = (Array.isArray(resume.certifications) ? resume.certifications : []).map(
      (cert) => ({
        name: cert.name || undefined,
        date: cert.issueDate || null,
        issuer: cert.issuingOrganization || undefined,
        url: cert.credentialUrl || null,
      })
    );

    // Meta (Platform Provenance Envelope)
    const meta = {
      canonical: 'https://github.com/vishu1803/Ai-job-mcp',
      version: 'v1.0.0',
      antigravity: {
        generator: 'Antigravity Career Artifact Engine',
        integrityStatus: resume.integrityStatus || 'PASS',
        presentationMode: resume.presentationMode || 'GENERATE_NEW',
        evidenceGraphSummary: {
          totalProjects: projects.length,
          totalSkills: skills.reduce((acc, s) => acc + s.keywords.length, 0),
          citationStyle: options.citationStyle,
        },
        // JSON Resume lacks fields for credential IDs/expiry, honors and custom
        // sections. Preserve them in an explicit, privacy-filtered extension.
        sourceSections: this._renderCanonicalJson(
          {
            experience: resume.experience || [],
            education: resume.education || [],
            certifications: resume.certifications || [],
            projects: resume.projects || [],
            optionalSections: resume.optionalSections || {},
          },
          'RESUME',
          options
        ),
      },
    };
    this._assertNoSecretsInMetadata(meta);

    return {
      basics,
      work,
      education,
      skills,
      projects,
      certificates,
      meta,
    };
  }

  // ===========================================================================
  // 6. Markdown Adapter (CommonMark / GFM)
  // ===========================================================================

  _renderMarkdown(artifact, artifactType, options) {
    switch (artifactType) {
      case 'RESUME':
        return this._renderResumeMarkdown(artifact, options);
      case 'COVER_LETTER':
        return this._renderCoverLetterMarkdown(artifact, options);
      case 'PORTFOLIO':
        return this._renderPortfolioMarkdown(artifact, options);
      case 'CAREER_SUMMARY':
      default:
        return this._renderGenericMarkdown(artifact, options);
    }
  }

  _renderResumeMarkdown(resume, options) {
    const cand = options.candidateProfile || {};
    const anonymize = options.anonymize;
    const includeUnverified = options.includeUnverifiedClaims;
    const citationStyle = options.citationStyle;

    const footnotes = [];
    const getCitation = (evidenceRefs) => {
      if (citationStyle === 'NONE' || citationStyle === 'METADATA_ONLY') return '';
      if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) return '';
      if (citationStyle === 'INLINE') {
        const top = evidenceRefs[0];
        const sha = top.commitSha ? `@${top.commitSha.slice(0, 7)}` : '';
        const line = top.lineRange ? `:${top.lineRange.start}-${top.lineRange.end}` : '';
        return ` *[Source observation: ${this._escapeMarkdown(top.filePath)}${line}${sha}]*`;
      }
      if (citationStyle === 'FOOTNOTES') {
        footnotes.push(evidenceRefs[0]);
        const index = footnotes.length;
        return `[^${index}]`;
      }
      return '';
    };

    const lines = [];

    // Header
    const name = anonymize ? '[REDACTED_NAME]' : cand.displayName || cand.name || 'Candidate Name';
    const email = anonymize ? '[REDACTED_EMAIL]' : cand.canonicalEmail || cand.email || '';
    const phone = anonymize ? '[REDACTED_PHONE]' : cand.canonicalPhone || cand.phone || '';
    const location = anonymize ? '' : resumeLocation(cand.location);

    lines.push(`# ${this._escapeMarkdown(name)}`);
    if (resume.headline) lines.push(`**${this._escapeMarkdown(resume.headline)}**`);

    const contactParts = [email, phone, location].filter(Boolean);
    if (!anonymize)
      contactParts.push(...(cand.links || []).map((link) => link.url).filter(Boolean));
    if (contactParts.length > 0) {
      lines.push(contactParts.map((c) => this._escapeMarkdown(c)).join(' | '));
    }
    lines.push('');

    // Summary
    if (resume.summary) {
      lines.push('## Executive Summary');
      lines.push(this._escapeMarkdown(resume.summary));
      lines.push('');
    }

    // Skills
    if (Array.isArray(resume.skills) && resume.skills.length > 0) {
      lines.push('## Technical Skills');
      for (const cat of resume.skills) {
        const skillItems = (Array.isArray(cat.skills) ? cat.skills : [])
          .filter((s) => includeUnverified || s.status !== 'CLAIMED')
          .map((s) => {
            const label =
              s.status === 'CLAIMED' && includeUnverified
                ? `${s.name} [Unverified User Claim]`
                : s.name;
            return this._escapeMarkdown(label);
          });
        if (skillItems.length > 0) {
          lines.push(`- **${this._escapeMarkdown(cat.name)}**: ${skillItems.join(', ')}`);
        }
      }
      lines.push('');
    }

    // Experience
    if (Array.isArray(resume.experience) && resume.experience.length > 0) {
      lines.push('## Professional Experience');
      for (const exp of resume.experience) {
        const dates = resumeDateRange(exp);
        const loc = exp.location ? ` | ${exp.location}` : '';
        lines.push(`### ${this._escapeMarkdown(exp.title)} — ${this._escapeMarkdown(exp.company)}`);
        if (dates || loc)
          lines.push(`*${this._escapeMarkdown(dates)}${this._escapeMarkdown(loc)}*`);
        for (const detail of new Set(
          [
            exp.summary,
            exp.description,
            exp.employmentType,
            exp.technologies?.length ? `Technologies: ${exp.technologies.join(', ')}` : null,
          ].filter(Boolean)
        ))
          lines.push(this._escapeMarkdown(detail));
        const filteredBullets = this._filterBullets(exp.bullets, includeUnverified);
        for (const b of filteredBullets) {
          const cit = getCitation(b.evidenceRefs);
          lines.push(`- ${this._escapeMarkdown(b.text)}${cit}`);
        }
        lines.push('');
      }
    }

    // Projects
    if (Array.isArray(resume.projects) && resume.projects.length > 0) {
      lines.push('## Featured Projects');
      for (const proj of resume.projects) {
        const projName = proj.displayName || proj.name;
        lines.push(`### ${this._escapeMarkdown(projName)}`);
        if (
          proj.description &&
          !this._filterBullets(proj.bullets, includeUnverified).some(
            (bullet) => bullet.text.trim() === proj.description.trim()
          )
        ) {
          lines.push(`*${this._escapeMarkdown(proj.description)}*`);
        }
        for (const url of new Set([proj.repositoryUrl, proj.liveUrl, proj.demoUrl].filter(Boolean)))
          lines.push(this._escapeMarkdown(url));
        const technologies = proj.technologies || [
          ...(proj.primaryLanguages || []),
          ...(proj.primaryFrameworks || []),
        ];
        if (technologies.length)
          lines.push(`Technologies: ${this._escapeMarkdown(technologies.join(', '))}`);
        const filteredBullets = this._filterBullets(proj.bullets, includeUnverified);
        for (const b of filteredBullets) {
          const cit = getCitation(b.evidenceRefs);
          lines.push(`- ${this._escapeMarkdown(b.text)}${cit}`);
        }
        lines.push('');
      }
    }

    // Education
    if (Array.isArray(resume.education) && resume.education.length > 0) {
      lines.push('## Education');
      for (const edu of resume.education) {
        lines.push(
          `### ${this._escapeMarkdown(edu.degree)} — ${this._escapeMarkdown(edu.institution)}`
        );
        for (const detail of educationDetails(edu)) lines.push(this._escapeMarkdown(detail));
        lines.push('');
      }
    }

    for (const section of extraResumeSections(resume, includeUnverified)) {
      lines.push(
        `## ${section.title}`,
        ...section.entries.map((entry) => `- ${this._escapeMarkdown(entry)}`),
        ''
      );
    }

    // Footnotes Section
    if (citationStyle === 'FOOTNOTES' && footnotes.length > 0) {
      lines.push('---');
      lines.push('## Verified Evidence Ledger');
      footnotes.forEach((ev, idx) => {
        const sha = ev.commitSha ? `@${ev.commitSha.slice(0, 7)}` : '';
        const linesStr = ev.lineRange ? ` (Lines ${ev.lineRange.start}-${ev.lineRange.end})` : '';
        lines.push(
          `[^${idx + 1}]: Verified in \`${this._escapeMarkdown(ev.filePath)}\`${linesStr}${sha}`
        );
      });
      lines.push('');
    }

    return lines.join('\n').trim();
  }

  _renderCoverLetterMarkdown(letter, options) {
    const cand = options.candidateProfile || {};
    const anonymize = options.anonymize;
    const name = anonymize ? '[REDACTED_NAME]' : cand.displayName || cand.name || 'Candidate Name';
    const email = anonymize ? '[REDACTED_EMAIL]' : cand.canonicalEmail || cand.email || '';
    const phone = anonymize ? '[REDACTED_PHONE]' : cand.canonicalPhone || cand.phone || '';

    const lines = [];

    // Header
    lines.push(`# Cover Letter: ${this._escapeMarkdown(name)}`);
    lines.push(`**Target Position**: ${this._escapeMarkdown(letter.roleTitle)}  `);
    lines.push(`**Company**: ${this._escapeMarkdown(letter.companyName)}  `);
    lines.push(
      `**Date**: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
    );
    lines.push('');
    lines.push('---');
    lines.push('');

    // Salutation
    const recipient = letter.recipientName || 'Hiring Team';
    lines.push(`Dear ${this._escapeMarkdown(recipient)},`);
    lines.push('');

    // Paragraphs
    const paragraphs = Array.isArray(letter.paragraphs) ? letter.paragraphs : [];
    for (const pg of paragraphs) {
      lines.push(this._escapeMarkdown(pg.text));
      lines.push('');
    }

    // Closing
    lines.push('Sincerely,');
    lines.push('');
    lines.push(`**${this._escapeMarkdown(name)}**`);
    if (email || phone) {
      lines.push(
        [email, phone]
          .filter(Boolean)
          .map((c) => this._escapeMarkdown(c))
          .join(' | ')
      );
    }

    return lines.join('\n').trim();
  }

  _renderPortfolioMarkdown(portfolio, _options) {
    const lines = [];

    lines.push(`# Portfolio Strategy & Case Studies`);
    lines.push(`**Target Role Family**: ${portfolio.jobFamily || 'SOFTWARE_ENGINEERING'}`);
    lines.push('');

    // Summary Box
    lines.push('## Executive Summary');
    lines.push(`- **Featured Projects**: ${portfolio.featuredProjects?.length || 0}`);
    lines.push(
      `- **Requirements Covered**: ${portfolio.requirementCoverage?.requiredCovered || 0} / ${portfolio.requirementCoverage?.requiredCount || 0}`
    );
    lines.push('');

    // Featured Projects
    lines.push('## Featured Project Recommendations');
    for (const p of portfolio.featuredProjects || []) {
      lines.push(`### #${p.rank} ${this._escapeMarkdown(p.projectName)}`);
      lines.push(`- **Role**: ${this._escapeMarkdown(p.primaryRoleHighlighted)}`);
      lines.push(`- **Why Featured**: ${this._escapeMarkdown(p.reason)}`);
      lines.push(`- **Architectural Signals**: ${(p.signalsAdded || []).join(', ')}`);
      lines.push(`- **Key Technologies**: ${(p.skillsToHighlight || []).join(', ')}`);
      if (p.liveDemoAvailable) lines.push(`- **Live Demo**: Available`);
      lines.push('');
    }

    // Case Study Enablement
    if (
      Array.isArray(portfolio.caseStudyRecommendations) &&
      portfolio.caseStudyRecommendations.length > 0
    ) {
      lines.push('## Technical Interview Discussion Topics');
      for (const cs of portfolio.caseStudyRecommendations) {
        lines.push(`### ${this._escapeMarkdown(cs.projectDisplayName)}`);
        lines.push('**Key Reflection Questions**:');
        for (const q of cs.questionsForCandidate || []) {
          lines.push(`- ${this._escapeMarkdown(q)}`);
        }
        lines.push('');
        lines.push('**Interview Talking Points**:');
        for (const topic of cs.interviewDiscussionTopics || []) {
          lines.push(`- ${this._escapeMarkdown(topic)}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n').trim();
  }

  _renderGenericMarkdown(artifact, _options) {
    return `# Career Artifact Summary\n\n\`\`\`json\n${JSON.stringify(artifact, null, 2)}\n\`\`\``;
  }

  // ===========================================================================
  // 7. Plain Text Adapter (ATS-Safe Sanitized Linear Text)
  // ===========================================================================

  _renderPlainText(artifact, artifactType, options) {
    switch (artifactType) {
      case 'RESUME':
        return this._renderResumePlainText(artifact, options);
      case 'COVER_LETTER':
        return this._renderCoverLetterPlainText(artifact, options);
      case 'PORTFOLIO':
        return this._renderPortfolioPlainText(artifact, options);
      default:
        return this._sanitizePlainText(JSON.stringify(artifact, null, 2));
    }
  }

  _renderResumePlainText(resume, options) {
    const cand = options.candidateProfile || {};
    const anonymize = options.anonymize;
    const includeUnverified = options.includeUnverifiedClaims;

    const lines = [];

    // Header
    const name = anonymize ? '[REDACTED_NAME]' : cand.displayName || cand.name || 'Candidate Name';
    const email = anonymize ? '[REDACTED_EMAIL]' : cand.canonicalEmail || cand.email || '';
    const phone = anonymize ? '[REDACTED_PHONE]' : cand.canonicalPhone || cand.phone || '';
    const location = anonymize ? '' : resumeLocation(cand.location);

    lines.push(name.toUpperCase());
    if (resume.headline) lines.push(resume.headline);
    const contactLine = [
      email,
      phone,
      location,
      ...(!anonymize ? (cand.links || []).map((link) => link.url) : []),
    ]
      .filter(Boolean)
      .join(' | ');
    if (contactLine) lines.push(contactLine);
    lines.push('');

    // Summary
    if (resume.summary) {
      lines.push('=== SUMMARY ===');
      lines.push(this._sanitizePlainText(resume.summary));
      lines.push('');
    }

    // Skills
    if (Array.isArray(resume.skills) && resume.skills.length > 0) {
      lines.push('=== TECHNICAL SKILLS ===');
      for (const cat of resume.skills) {
        const skillItems = (Array.isArray(cat.skills) ? cat.skills : [])
          .filter((s) => includeUnverified || s.status !== 'CLAIMED')
          .map((s) =>
            s.status === 'CLAIMED' && includeUnverified
              ? `${s.name} [Unverified User Claim]`
              : s.name
          );
        if (skillItems.length > 0) {
          lines.push(`* ${cat.name}: ${skillItems.join(', ')}`);
        }
      }
      lines.push('');
    }

    // Experience
    if (Array.isArray(resume.experience) && resume.experience.length > 0) {
      lines.push('=== EXPERIENCE ===');
      for (const exp of resume.experience) {
        const dates = resumeDateRange(exp);
        const loc = exp.location ? ` | ${exp.location}` : '';
        lines.push(`${exp.title} | ${exp.company}`);
        if (dates || loc) lines.push(`${dates}${loc}`);
        for (const detail of new Set(
          [
            exp.summary,
            exp.description,
            exp.employmentType,
            exp.technologies?.length ? `Technologies: ${exp.technologies.join(', ')}` : null,
          ].filter(Boolean)
        ))
          lines.push(this._sanitizePlainText(detail));
        const filteredBullets = this._filterBullets(exp.bullets, includeUnverified);
        for (const b of filteredBullets) {
          lines.push(`* ${this._sanitizePlainText(b.text)}`);
        }
        lines.push('');
      }
    }

    // Projects
    if (Array.isArray(resume.projects) && resume.projects.length > 0) {
      lines.push('=== PROJECTS ===');
      for (const proj of resume.projects) {
        const projName = proj.displayName || proj.name;
        lines.push(`${projName}`);
        if (
          proj.description &&
          !this._filterBullets(proj.bullets, includeUnverified).some(
            (bullet) => bullet.text.trim() === proj.description.trim()
          )
        )
          lines.push(this._sanitizePlainText(proj.description));
        for (const url of new Set([proj.repositoryUrl, proj.liveUrl, proj.demoUrl].filter(Boolean)))
          lines.push(url);
        const technologies = proj.technologies || [
          ...(proj.primaryLanguages || []),
          ...(proj.primaryFrameworks || []),
        ];
        if (technologies.length) lines.push(`Technologies: ${technologies.join(', ')}`);
        const filteredBullets = this._filterBullets(proj.bullets, includeUnverified);
        for (const b of filteredBullets) {
          lines.push(`* ${this._sanitizePlainText(b.text)}`);
        }
        lines.push('');
      }
    }

    // Education
    if (Array.isArray(resume.education) && resume.education.length > 0) {
      lines.push('=== EDUCATION ===');
      for (const edu of resume.education) {
        lines.push(`${edu.degree} | ${edu.institution}`);
        for (const detail of educationDetails(edu)) lines.push(this._sanitizePlainText(detail));
        lines.push('');
      }
    }

    for (const section of extraResumeSections(resume, includeUnverified)) {
      lines.push(
        `=== ${section.title} ===`,
        ...section.entries.map((entry) => `* ${this._sanitizePlainText(entry)}`),
        ''
      );
    }
    return lines.join('\n').trim();
  }

  _renderCoverLetterPlainText(letter, options) {
    const cand = options.candidateProfile || {};
    const anonymize = options.anonymize;
    const name = anonymize ? '[REDACTED_NAME]' : cand.displayName || cand.name || 'Candidate Name';
    const email = anonymize ? '[REDACTED_EMAIL]' : cand.canonicalEmail || cand.email || '';
    const phone = anonymize ? '[REDACTED_PHONE]' : cand.canonicalPhone || cand.phone || '';

    const lines = [];

    lines.push(`COVER LETTER`);
    lines.push(`Position: ${letter.roleTitle}`);
    lines.push(`Company: ${letter.companyName}`);
    lines.push(
      `Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
    );
    lines.push('');
    lines.push(`Dear ${letter.recipientName || 'Hiring Team'},`);
    lines.push('');

    const paragraphs = Array.isArray(letter.paragraphs) ? letter.paragraphs : [];
    for (const pg of paragraphs) {
      lines.push(this._sanitizePlainText(pg.text));
      lines.push('');
    }

    lines.push('Sincerely,');
    lines.push(name);
    if (email || phone) lines.push([email, phone].filter(Boolean).join(' | '));

    return lines.join('\n').trim();
  }

  _renderPortfolioPlainText(portfolio, _options) {
    const lines = [];

    lines.push('=== PORTFOLIO RECOMMENDATIONS ===');
    lines.push(`Target Role Family: ${portfolio.jobFamily || 'SOFTWARE_ENGINEERING'}`);
    lines.push(
      `Requirements Covered: ${portfolio.requirementCoverage?.requiredCovered || 0} / ${portfolio.requirementCoverage?.requiredCount || 0}`
    );
    lines.push('');

    lines.push('=== FEATURED PROJECTS ===');
    for (const p of portfolio.featuredProjects || []) {
      lines.push(`* #${p.rank} ${p.projectName} (${p.primaryRoleHighlighted})`);
      lines.push(`  Why Featured: ${p.reason}`);
      lines.push(`  Signals: ${(p.signalsAdded || []).join(', ')}`);
      lines.push(`  Technologies: ${(p.skillsToHighlight || []).join(', ')}`);
      lines.push('');
    }

    return lines.join('\n').trim();
  }

  _sanitizePlainText(text) {
    if (!text) return '';
    return text
      .replace(/[\u2018\u2019]/g, "'") // Curly single quotes
      .replace(/[\u201C\u201D]/g, '"') // Curly double quotes
      .replace(/[\u2013\u2014]/g, '-') // En/em dashes
      .replace(/[\u2022\u25AA\u25BA]/g, '*') // Unicode bullets
      .replace(/\t/g, '  ') // Tabs to 2 spaces
      .replace(/<[^>]*>/g, ''); // Strip any HTML tags
  }

  // ===========================================================================
  // 8. Canonical JSON Adapter
  // ===========================================================================

  _renderCanonicalJson(artifact, _artifactType, options) {
    const cloned = JSON.parse(JSON.stringify(artifact));
    cloned.evidenceTrust = 'CANDIDATE_PROVIDED_OR_INFERRED_NOT_VERIFIED_PROFICIENCY';
    if (options.anonymize) {
      const identity = cloned.structuredResume?.candidateIdentity || cloned.candidateIdentity;
      if (identity) {
        identity.displayName = '[REDACTED_NAME]';
        identity.email = '[REDACTED_EMAIL]';
        identity.phone = '[REDACTED_PHONE]';
        identity.location = null;
        identity.links = [];
      }
      if (cloned.candidate) {
        cloned.candidate.name = '[REDACTED_NAME]';
        cloned.candidate.displayName = '[REDACTED_NAME]';
        cloned.candidate.email = '[REDACTED_EMAIL]';
        cloned.candidate.canonicalEmail = '[REDACTED_EMAIL]';
        cloned.candidate.phone = '[REDACTED_PHONE]';
        cloned.candidate.canonicalPhone = '[REDACTED_PHONE]';
      }
    }
    if (!options.includeUnverifiedClaims) {
      const document = cloned.structuredResume;
      if (document) {
        if (document.summary?.provenanceStatus === 'CLAIMED')
          document.summary = { ...document.summary, text: '' };
        document.experience = document.experience.filter(
          (entry) => entry.provenanceStatus !== 'CLAIMED'
        );
        document.education = document.education.filter(
          (entry) => entry.provenanceStatus !== 'CLAIMED'
        );
        document.certifications = document.certifications.filter(
          (entry) => entry.provenanceStatus !== 'CLAIMED'
        );
        for (const category of document.skills.categories)
          category.skills = category.skills.filter((skill) => skill.provenanceStatus !== 'CLAIMED');
        for (const project of document.projects)
          project.bullets = this._filterBullets(project.bullets, false);
        for (const key of Object.keys(document.optionalSections))
          document.optionalSections[key] = document.optionalSections[key].filter(
            (entry) => entry.provenanceStatus !== 'CLAIMED'
          );
      }
      for (const key of ['experience', 'education', 'certifications'])
        if (Array.isArray(cloned[key]))
          cloned[key] = cloned[key].filter((entry) => entry.provenanceStatus !== 'CLAIMED');
      if (cloned.optionalSections)
        for (const key of Object.keys(cloned.optionalSections))
          cloned.optionalSections[key] = cloned.optionalSections[key].filter(
            (entry) => entry.provenanceStatus !== 'CLAIMED'
          );
      if (Array.isArray(cloned.experience)) {
        for (const exp of cloned.experience) {
          exp.bullets = this._filterBullets(exp.bullets, false);
        }
      }
      if (Array.isArray(cloned.projects)) {
        for (const p of cloned.projects) {
          p.bullets = this._filterBullets(p.bullets, false);
        }
      }
    }
    return cloned;
  }

  // ===========================================================================
  // 9. Formatting, Sanitization & Utility Helpers
  // ===========================================================================

  _filterBullets(bullets, includeUnverified) {
    if (!Array.isArray(bullets)) return [];
    return bullets
      .map((b) => (typeof b === 'string' ? { text: b, status: 'USER_PROVIDED' } : b))
      .filter((b) => {
        if (!b?.text?.trim()) return false;
        if (includeUnverified) return true;
        if (
          b.status === 'CLAIMED' ||
          b.provenanceStatus === 'CLAIMED' ||
          (b.text && b.text.includes('[Unverified User Claim]'))
        ) {
          return false;
        }
        return true;
      });
  }

  _formatBulletText(bullet, citationStyle) {
    let text = bullet.text || '';
    if (
      citationStyle === 'INLINE' &&
      Array.isArray(bullet.evidenceRefs) &&
      bullet.evidenceRefs.length > 0
    ) {
      const top = bullet.evidenceRefs[0];
      const sha = top.commitSha ? `@${top.commitSha.slice(0, 7)}` : '';
      text += ` [Source observation: ${top.filePath}${sha}]`;
    }
    return text;
  }

  _escapeMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/javascript:/gi, '');
  }

  _normalizeLineEndings(content, lineEnding) {
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (lineEnding === 'CRLF') {
      return normalized.replace(/\n/g, '\r\n');
    }
    return normalized;
  }

  _applyEncoding(content, encoding) {
    if (encoding === 'ASCII') {
      // Transliterate / sanitize non-ASCII characters deterministically
      const strippedDiacritics = content.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // strip diacritics
      return strippedDiacritics
        .split('')
        .filter((char) => char.charCodeAt(0) <= 127)
        .join('');
    }
    return content;
  }

  _resolveSafeFileName(customName, defaultName) {
    const raw = customName || defaultName;
    // Prevent path traversal
    if (
      raw.includes('../') ||
      raw.includes('..\\') ||
      raw.startsWith('/') ||
      raw.startsWith('\\') ||
      raw.includes('\0')
    ) {
      throw new ValidationError(
        `Invalid filename: path traversal is strictly forbidden ('${raw}')`
      );
    }
    // Clean filename
    const clean = raw.replace(/[^a-zA-Z0-9._-]/g, '_');
    return clean || defaultName;
  }
}
