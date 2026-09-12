/**
 * @file Application Handoff Kit Orchestration Service
 *
 * Coordinates document generation, pre-exposure QA validation, encrypted artifact persistence,
 * and canonical readiness evaluation for manual job application submission.
 *
 * Invariants Enforced:
 * 1. Idempotency & Version Immutability: Documents are generated once per canonical packageHash
 *    and bound to { applicationId, packageHash, contentHash }. Never mixes document versions.
 * 2. Pre-Exposure QA Gating: Artifacts MUST pass the Resume Quality Audit before being exposed
 *    as READY to the candidate.
 * 3. Zero Fabricated Data: Stored candidate records only. Missing values are flagged as MISSING
 *    with direct [Complete in Profile] deep links.
 * 4. Truthful Handoff Status: HANDOFF_READY with explicit manual submission notice.
 */

import { LatexDocumentGenerator } from './latex-document-generator.service.js';
import { LatexCompilerService } from './latex-compiler.service.js';
import { PdfQaValidatorService } from './pdf-qa-validator.service.js';
import { ResumeQualityAssessmentService } from './resume-quality-assessment.service.js';
import { DocumentStorageService } from './document-storage.service.js';
import { CandidateProfileService } from './candidate-profile.service.js';
import { ApplicationTrackingService } from './application-tracking.service.js';
import { ApplicationReadinessService } from './application-readiness.service.js';
import { PdfGeometryAnalyzer } from './pdf-geometry-analyzer.service.js';
import { ValidationError } from '../errors/index.js';
import { logger } from '../utils/logger.js';
import { ResumeParserService } from './resume-parser.service.js';
import {
  RESUME_GENERATION_CONTRACT_VERSION,
  LEGACY_GENERATION_CONTRACT_VERSION,
  DEFAULT_STRUCTURED_RESUME_SCHEMA_VERSION,
} from '../domain/job/job-workflow.schemas.js';

export class ApplicationHandoffService {
  /**
   * @param {object} [dependencies={}]
   * @param {LatexDocumentGenerator} [dependencies.latexGenerator]
   * @param {LatexCompilerService} [dependencies.latexCompiler]
   * @param {PdfQaValidatorService} [dependencies.qaValidator]
   * @param {DocumentStorageService} [dependencies.documentStorage]
   * @param {CandidateProfileService} [dependencies.candidateProfileService]
   * @param {ApplicationTrackingService} [dependencies.applicationTrackingService]
   * @param {ApplicationReadinessService} [dependencies.readinessService]
   */
  constructor(dependencies = {}) {
    this.latexGenerator = dependencies.latexGenerator || new LatexDocumentGenerator();
    this.latexCompiler = dependencies.latexCompiler || new LatexCompilerService();
    this.qaValidator = dependencies.qaValidator || new PdfQaValidatorService();
    this.resumeQualityAssessment =
      dependencies.resumeQualityAssessment || new ResumeQualityAssessmentService();
    this.resumeParser = dependencies.resumeParser || new ResumeParserService();
    this.geometryAnalyzer = dependencies.geometryAnalyzer || new PdfGeometryAnalyzer({ resumeParser: this.resumeParser });
    this.documentStorage = dependencies.documentStorage || new DocumentStorageService();
    this.candidateProfileService =
      dependencies.candidateProfileService || new CandidateProfileService();
    this.applicationTrackingService =
      dependencies.applicationTrackingService || new ApplicationTrackingService();
    this.readinessService = dependencies.readinessService || new ApplicationReadinessService();
    this.logger = logger.child({ module: 'ApplicationHandoffService' });
  }

  /**
   * Evaluates application readiness across canonical candidate profile data.
   * Delegates to the single source of truth ApplicationReadinessService.
   *
   * @param {object} params
   * @param {object} params.candidateProfile Candidate profile DTO
   * @param {object} params.applicationPackage Canonical application package
   * @param {object} [params.answers] Candidate answers
   * @param {object} [params.jobPosting] Target job posting
   * @returns {Array<object>} Evaluated readiness checklist items
   */
  evaluateApplicationReadiness({
    candidateProfile = null,
    candidate = null,
    applicationPackage = null,
    answers = null,
    jobPosting = null,
  }) {
    const { items, semantics } = this.readinessService.evaluateReadiness({
      candidateProfile,
      candidate,
      applicationPackage,
      answers: answers || applicationPackage?.answers,
      jobPosting: jobPosting || applicationPackage?.targetJob,
    });
    items.readiness = items;
    items.readinessSemantics = semantics;
    return items;
  }

  /**
   * Separates DOCUMENT readiness (generated artifacts present & QA-passed)
   * from APPLICATION PROFILE completeness (candidate screening fields).
   *
   * HANDOFF_READY means documents are prepared for manual submission; it MUST
   * NOT imply the applicant screening profile is complete. Missing profile
   * fields are listed truthfully as MISSING — never invented to green the matrix.
   *
   * @param {object} params
   * @param {object} params.handoffKit Handoff kit (or kit-shaped object with resume/coverLetter)
   * @param {Array<object>} params.readinessItems Evaluated readiness checklist items
   * @returns {{ documentsReady: boolean, profileComplete: boolean, documentsStatus: string, profileStatus: string, missingProfileFields: string[], needsConfirmationFields: string[], summary: string }}
   */
  evaluateHandoffSemantics({ handoffKit, readinessItems }) {
    const documentEntries = [handoffKit?.resume, handoffKit?.coverLetter].filter(Boolean);
    const documentsReady =
      documentEntries.length === 2 && documentEntries.every((doc) => doc?.qaAudit?.passed);

    const missingProfileFields = readinessItems
      .filter((item) => item.status === 'MISSING')
      .map((item) => item.field);
    const needsConfirmationFields = readinessItems
      .filter((item) => item.status === 'NEEDS_CONFIRMATION')
      .map((item) => item.field);

    const profileComplete = missingProfileFields.length === 0;

    return {
      documentsReady,
      profileComplete,
      documentsStatus: documentsReady ? 'DOCUMENTS_READY' : 'DOCUMENTS_BLOCKED',
      profileStatus: profileComplete ? 'PROFILE_COMPLETE' : 'PROFILE_INCOMPLETE',
      missingProfileFields,
      needsConfirmationFields,
      summary: profileComplete
        ? 'All applicant screening fields present. Confirm NEEDS_CONFIRMATION items with the candidate before final submission.'
        : `Application documents are ready for manual handoff, but the screening profile is incomplete (missing: ${missingProfileFields.join(', ')}). HANDOFF_READY does not imply these fields are complete.`,
    };
  }

  /**
   * Persist immutable database snapshots for the generated handoff artifacts,
   * scoped to the CURRENT package version (P14-005BA).
   *
   * A new package version creates NEW snapshot rows (history preserved);
   * snapshot rows for a previous package version are never overwritten or
   * deleted, so historical packages stay auditable.
   */
  async _attachTailoredDocumentSnapshots({
    tenantId,
    userId,
    applicationId,
    applicationPackage,
    handoffKit,
  }) {
    if (!applicationId) return;

    const context = { tenantId, userId, role: 'MEMBER' };
    const existingDetails = await this.applicationTrackingService.getApplicationDetails(
      context,
      applicationId
    );
    const packageHash = applicationPackage.packageHash;

    // Rows already carrying THIS package's encrypted PDF artifacts
    // (idempotency within a version). A bare prepare_job_application may have
    // already created a package-tagged content snapshot without an artifact;
    // that row is not sufficient to make View/Download available, so a new
    // immutable handoff snapshot is added below.
    const existingForPackage = new Set(
      (existingDetails.tailoredDocuments || [])
        .filter(
          (document) =>
            (document.metadata?.packageHash === packageHash ||
              document.metadata?.artifact?.packageHash === packageHash) &&
            document.metadata?.artifact?.storageKey
        )
        .map((document) => document.documentType)
    );

    const documents = [
      ['TAILORED_RESUME', applicationPackage.tailoredResume, handoffKit.resume],
      ['TAILORED_COVER_LETTER', applicationPackage.coverLetter, handoffKit.coverLetter],
    ];

    for (const [documentType, source, artifact] of documents) {
      if (existingForPackage.has(documentType)) continue;
      await this.applicationTrackingService.attachTailoredDocument(context, applicationId, {
        candidateId: applicationPackage.candidateId,
        documentType,
        title: source.title,
        content: {
          markdownContent: source.markdownContent,
          packageHash: applicationPackage.packageHash,
        },
        renderedMarkdown: source.markdownContent,
        metadata: {
          source: 'APPLICATION_HANDOFF',
          packageHash: applicationPackage.packageHash,
          // P14-005BC: Store the authoritative Markdown-only content hash from
          // prepare_job_application so legacy fallback paths can use it.
          // This is DIFFERENT from tailored_documents.contentHash which hashes
          // the entire content object {markdownContent, packageHash}.
          markdownContentHash: source.contentHash,
          artifact: {
            filename: artifact.filename,
            mimeType: artifact.mimeType,
            fileSizeBytes: artifact.fileSizeBytes,
            contentHash: artifact.contentHash,
            // P14-005BC: Also store the PDF byte hash for artifact integrity
            pdfContentHash: artifact.contentHash,
            status: artifact.qaAudit?.passed ? 'READY' : 'BLOCKED',
            storageKey: artifact.storageKey,
            viewUrl: artifact.viewUrl,
            downloadUrl: artifact.downloadUrl,
            packageHash: applicationPackage.packageHash,
            generationContractVersion:
              handoffKit.generationContractVersion ||
              artifact.generationContractVersion ||
              (applicationPackage.structuredResume || applicationPackage.tailoredResume?.structuredResume
                ? RESUME_GENERATION_CONTRACT_VERSION
                : LEGACY_GENERATION_CONTRACT_VERSION),
            structuredResumeSchemaVersion:
              handoffKit.structuredResumeSchemaVersion !== undefined
                ? handoffKit.structuredResumeSchemaVersion
                : artifact.structuredResumeSchemaVersion !== undefined
                  ? artifact.structuredResumeSchemaVersion
                  : null,
          },
        },
        integrityScore: artifact.qaAudit?.passed ? artifact.qaAudit.score / 100 : 0,
        atsFitScore:
          documentType === 'TAILORED_RESUME' ? applicationPackage.tailoredResume.fitScore : null,
      });
    }
  }

  /**
   * Generates or retrieves the immutable Real Application Handoff Kit for an applicationPackage.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.userId
   * @param {string} params.candidateId
   * @param {object} params.applicationPackage Canonical ApplicationPackage
   * @param {string} [params.applicationId] Tracked Application ID (if saved in DB)
   * @param {string} [params.destinationUrl] Target employer portal URL
   * @returns {Promise<object>} Complete Handoff Kit with artifact metadata and readiness
   */
  async buildApplicationHandoffKit({
    tenantId,
    userId,
    candidateId,
    applicationPackage,
    applicationId = null,
    destinationUrl = null,
  }) {
    if (!applicationPackage || !applicationPackage.packageHash) {
      throw new ValidationError('Valid applicationPackage with packageHash is required');
    }

    const packageHash = applicationPackage.packageHash;
    const directPortalUrl = destinationUrl || applicationPackage.targetJob?.applicationUrl || '';

    const structuredResume =
      applicationPackage.tailoredResume?.structuredResume ||
      applicationPackage.structuredResume ||
      null;

    // 1. Fetch Candidate Profile for canonical metadata.
    // For legacy packages, without the real candidate profile the generator would fall
    // back to placeholder content, so a profile failure aborts kit generation.
    // For structured packages, the snapshot is authoritative and self-contained;
    // we attempt profile loading for screening evaluation but do not fail kit generation if it fails.
    let candidateProfile = null;
    try {
      candidateProfile = await this.candidateProfileService.getProfile(
        { tenantId, userId, role: 'MEMBER' },
        candidateId
      );
    } catch (err) {
      if (!structuredResume) {
        this.logger.error(
          { error: err.message, candidateId },
          'Canonical candidate profile could not be loaded; aborting handoff kit generation (fail-closed, zero placeholder fallback)'
        );
        throw new ValidationError(
          `Cannot generate handoff kit without a loadable canonical candidate profile: ${err.message}`
        );
      }
      this.logger.info(
        { candidateId, error: err.message },
        'Candidate profile fetch failed; proceeding with authoritative structuredResume snapshot'
      );
    }

    // 2. Idempotency Check: Look up existing application metadata
    let existingApp = null;
    if (applicationId) {
      try {
        existingApp = await this.applicationTrackingService.getApplication(
          { tenantId, userId, role: 'MEMBER' },
          applicationId
        );
      } catch {
        // Not found — kit is still generated; persistence below is best-effort
      }
    }

    const currentContractVersion =
      applicationPackage.generationContractVersion ||
      applicationPackage.tailoredResume?.generationContractVersion ||
      (structuredResume ? RESUME_GENERATION_CONTRACT_VERSION : LEGACY_GENERATION_CONTRACT_VERSION);

    let currentSchemaVersion;
    if (applicationPackage.structuredResumeSchemaVersion !== undefined) {
      currentSchemaVersion = applicationPackage.structuredResumeSchemaVersion;
    } else if (applicationPackage.tailoredResume?.structuredResumeSchemaVersion !== undefined) {
      currentSchemaVersion = applicationPackage.tailoredResume.structuredResumeSchemaVersion;
    } else if (structuredResume?.schemaVersion) {
      currentSchemaVersion = structuredResume.schemaVersion;
    } else if (currentContractVersion === LEGACY_GENERATION_CONTRACT_VERSION) {
      currentSchemaVersion = null;
    } else {
      currentSchemaVersion = DEFAULT_STRUCTURED_RESUME_SCHEMA_VERSION;
    }

    const existingKit = existingApp?.metadata?.handoffKit;

    const existingKitContract =
      existingKit?.generationContractVersion ||
      existingKit?.resume?.generationContractVersion ||
      (existingKit?.structuredResume || existingKit?.resume?.structuredResume
        ? RESUME_GENERATION_CONTRACT_VERSION
        : LEGACY_GENERATION_CONTRACT_VERSION);

    let existingKitSchemaVersion;
    if (existingKit?.structuredResumeSchemaVersion !== undefined) {
      existingKitSchemaVersion = existingKit.structuredResumeSchemaVersion;
    } else if (existingKit?.resume?.structuredResumeSchemaVersion !== undefined) {
      existingKitSchemaVersion = existingKit.resume.structuredResumeSchemaVersion;
    } else if (existingKitContract === LEGACY_GENERATION_CONTRACT_VERSION) {
      existingKitSchemaVersion = null;
    } else if (existingKit?.structuredResume?.schemaVersion) {
      existingKitSchemaVersion = existingKit.structuredResume.schemaVersion;
    } else {
      existingKitSchemaVersion = DEFAULT_STRUCTURED_RESUME_SCHEMA_VERSION;
    }

    const contractMatches = existingKitContract === currentContractVersion;
    const schemaMatches =
      currentSchemaVersion === null || existingKitSchemaVersion === null
        ? currentSchemaVersion === existingKitSchemaVersion
        : existingKitSchemaVersion === currentSchemaVersion;
    const hashMatches = existingKit?.packageHash === packageHash;
    const hasStorageKey = Boolean(existingKit?.resume?.storageKey);
    const belongsToApp =
      !existingKit?.applicationId || !applicationId || existingKit.applicationId === applicationId;

    // Artifact reuse requires BOTH identical packageHash AND matching generationContractVersion
    // AND matching structuredResumeSchemaVersion AND valid application binding.
    // A legacy artifact must NEVER satisfy a structured-package request (P16-001F-3A).
    if (
      existingKit &&
      hashMatches &&
      contractMatches &&
      schemaMatches &&
      hasStorageKey &&
      belongsToApp
    ) {
      await this._attachTailoredDocumentSnapshots({
        tenantId,
        userId,
        applicationId: existingApp.id,
        applicationPackage,
        handoffKit: existingKit,
      });
      this.logger.info(
        {
          applicationId,
          packageHash,
          generationContractVersion: currentContractVersion,
          structuredResumeSchemaVersion: currentSchemaVersion,
        },
        'Reusing existing immutable handoff kit matching packageHash and generationContractVersion'
      );
      return existingKit;
    } else if (existingKit) {
      this.logger.info(
        {
          applicationId,
          packageHash,
          existingKitHash: existingKit.packageHash,
          currentContractVersion,
          existingKitContract,
          currentSchemaVersion,
          existingKitSchemaVersion,
          hashMatches,
          contractMatches,
          schemaMatches,
          hasStorageKey,
          belongsToApp,
        },
        'Existing handoff kit not reusable due to contract/hash/schema mismatch; regenerating artifacts'
      );
    }

    // 3. Document Generation: ATS Resume
    const resumeLatexResult = this.latexGenerator.generateTailoredResumeLatex({
      applicationPackage,
      candidateProfile,
    });

    const resumePdfResult = await this.latexCompiler.compileLatexToPdf({
      texContent: resumeLatexResult.texContent,
      jobName: 'tailored-resume',
    });

    // 3b. Content Audit: real candidate data present, generic placeholders absent
    const realDataTokens = [];
    if (structuredResume) {
      const candidateDisplayName =
        structuredResume.candidateIdentity?.displayName ||
        structuredResume.candidateIdentity?.fullName ||
        applicationPackage.candidateName;
      if (candidateDisplayName) realDataTokens.push(candidateDisplayName);
      if (Array.isArray(structuredResume.education)) {
        for (const edu of structuredResume.education) {
          if (edu.institution) realDataTokens.push(edu.institution);
        }
      }
      if (Array.isArray(structuredResume.experience) && structuredResume.experience[0]?.company) {
        realDataTokens.push(structuredResume.experience[0].company);
      }
    } else {
      const userCustomMeta =
        candidateProfile?.candidate?.profileMetadata?.userCustom ||
        candidateProfile?.profileMetadata?.userCustom ||
        {};
      realDataTokens.push(
        applicationPackage.candidateName,
        ...(Array.isArray(userCustomMeta.education)
          ? userCustomMeta.education.map((edu) => edu.institution).filter(Boolean)
          : []),
        ...(Array.isArray(userCustomMeta.experience) && userCustomMeta.experience[0]?.company
          ? [userCustomMeta.experience[0].company]
          : [])
      );
    }
    const resumeContentAudit = LatexDocumentGenerator.auditLatexContent(
      resumeLatexResult.texContent,
      { requiredTokens: realDataTokens }
    );
    if (!resumeContentAudit.passed) {
      this.logger.error(
        { violations: resumeContentAudit.violations },
        'Generated resume LaTeX failed the real-content audit'
      );
      throw new ValidationError(
        `Generated resume failed real-content audit: ${resumeContentAudit.violations.join('; ')}`
      );
    }

    // 4. Document QA Audit: Resume Pre-Exposure Gating
    // 4a. Canonical source-to-PDF traceability contract (Phase 11): expectations
    // are derived strictly from the canonical structured snapshot — never from
    // candidate/project/job identities — so the gate is generic for all inputs.
    const buildExpectedContent = (snapshot, appliedMaxBulletsPerProject) => {
      if (!snapshot || typeof snapshot !== 'object') return null;
      const expected = {
        candidateName: null,
        targetRole: null,
        summary: null,
        phone: null,
        email: null,
        location: null,
        projectNames: [],
        projectBullets: [],
        experienceRoles: [],
        experienceCompanies: [],
        experienceBullets: [],
        educationTokens: [],
        institutions: [],
        degrees: [],
        coursework: [],
        certifications: [],
        links: [],
        sectionHeadings: [],
        skillsTokens: [],
        projectTechnologies: [],
        dsaTokens: [],
      };
      const clean = (s) => String(s || '').trim();

      const candName = snapshot.candidateIdentity?.displayName || snapshot.candidateIdentity?.fullName || snapshot.candidateIdentity?.name;
      if (candName) {
        expected.candidateName = clean(candName);
      }
      if (snapshot.candidateIdentity?.headline || snapshot.targetRole) {
        expected.targetRole = clean(snapshot.candidateIdentity?.headline || snapshot.targetRole);
      }
      if (snapshot.summary?.text) {
        expected.summary = clean(snapshot.summary.text);
      }
      const candPhone = snapshot.candidateIdentity?.phone || snapshot.contact?.phone;
      if (candPhone) expected.phone = clean(candPhone);
      const candEmail = snapshot.candidateIdentity?.email || snapshot.contact?.email;
      if (candEmail) expected.email = clean(candEmail);
      const candLoc = snapshot.candidateIdentity?.location || snapshot.contact?.location;
      if (candLoc) expected.location = clean(candLoc);

      // Skills tokens
      if (snapshot.skills) {
        if (Array.isArray(snapshot.skills)) {
          for (const s of snapshot.skills) {
            const name = clean(typeof s === 'string' ? s : s?.name || s?.skill);
            if (name) expected.skillsTokens.push(name);
          }
        } else if (typeof snapshot.skills === 'object') {
          for (const list of Object.values(snapshot.skills)) {
            if (Array.isArray(list)) {
              for (const s of list) {
                const name = clean(typeof s === 'string' ? s : s?.name || s?.skill);
                if (name) expected.skillsTokens.push(name);
              }
            }
          }
        }
      }

      // The renderer caps visible bullets per project; the expectation must
      // describe the same render contract, not an idealized superset.
      const bulletCap =
        Number.isInteger(appliedMaxBulletsPerProject) && appliedMaxBulletsPerProject > 0
          ? appliedMaxBulletsPerProject
          : 3;

      for (const p of Array.isArray(snapshot.projects) ? snapshot.projects : []) {
        const name = clean(p.displayName || p.name);
        if (name) expected.projectNames.push(name);
        const bullets = (Array.isArray(p.bullets) ? p.bullets : [])
          .map((b) => clean(typeof b === 'string' ? b : b?.text))
          .filter(Boolean)
          .slice(0, bulletCap);
        expected.projectBullets.push(...bullets);
        for (const tech of Array.isArray(p.technologies) ? p.technologies : []) {
          const t = clean(typeof tech === 'string' ? tech : tech?.name);
          if (t) expected.projectTechnologies.push(t);
        }
        for (const urlKey of ['repositoryUrl', 'liveUrl']) {
          if (p[urlKey] && typeof p[urlKey] === 'string') {
            expected.links.push(
              p[urlKey].replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
            );
          }
        }
      }
      for (const e of Array.isArray(snapshot.experience) ? snapshot.experience : []) {
        if (e.company) expected.experienceCompanies.push(clean(e.company));
        if (e.role || e.title) expected.experienceRoles.push(clean(e.role || e.title));
        for (const b of Array.isArray(e.bullets) ? e.bullets : []) {
          const t = clean(typeof b === 'string' ? b : b?.text);
          if (t) expected.experienceBullets.push(t);
        }
      }
      for (const e of Array.isArray(snapshot.education) ? snapshot.education : []) {
        if (e.institution || e.school) {
          const inst = clean(e.institution || e.school);
          expected.institutions.push(inst);
          expected.educationTokens.push(inst);
        }
        if (e.degree) {
          const deg = clean(e.degree);
          expected.degrees.push(deg);
          expected.educationTokens.push(deg);
        }
        for (const c of Array.isArray(e.coursework) ? e.coursework : []) {
          const t = clean(typeof c === 'string' ? c : c?.name);
          if (t) expected.coursework.push(t);
        }
      }
      for (const cert of Array.isArray(snapshot.certifications) ? snapshot.certifications : []) {
        const certName = clean(cert.name || cert.title);
        if (certName) expected.certifications.push(certName);
      }
      // Candidate profile links (candidateIdentity.links or contact.links)
      const candLinks = Array.isArray(snapshot.candidateIdentity?.links)
        ? snapshot.candidateIdentity.links
        : Array.isArray(snapshot.contact?.links)
          ? snapshot.contact.links
          : [];
      for (const link of candLinks) {
        const label = clean(typeof link === 'object' && link !== null ? (link.label || link.platform) : '');
        if (label) {
          expected.links.push(label);
        }
      }
      if (snapshot.dsa?.profileUrl && typeof snapshot.dsa.profileUrl === 'string') {
        const dsaDisplay = snapshot.dsa.profileUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
        if (dsaDisplay) expected.links.push(dsaDisplay);
      }
      if (snapshot.dsa && Array.isArray(snapshot.dsa.bullets)) {
        for (const b of snapshot.dsa.bullets) {
          const t = clean(typeof b === 'string' ? b : b?.text);
          if (t) expected.dsaTokens.push(t);
        }
      }
      // Expected section headings in canonical document order (generic label map).
      const headingLabels = {
        SUMMARY: 'Summary',
        SKILLS: 'Skills',
        EXPERIENCE: 'Experience',
        PROJECTS: 'Projects',
        EDUCATION: 'Education',
        DSA: 'Problem Solving',
        CERTIFICATIONS: 'Certifications',
        COURSEWORK: 'Coursework',
        PUBLICATIONS: 'Publications',
      };
      const hasSectionContent = (key) => {
        switch (key) {
          case 'SUMMARY':
            return Boolean(
              typeof snapshot.summary === 'string'
                ? snapshot.summary.trim()
                : snapshot.summary?.text?.trim()
            );
          case 'SKILLS':
            return Boolean(Array.isArray(snapshot.skills) && snapshot.skills.length > 0);
          case 'EXPERIENCE':
            return Boolean(Array.isArray(snapshot.experience) && snapshot.experience.length > 0);
          case 'PROJECTS':
            return Boolean(Array.isArray(snapshot.projects) && snapshot.projects.length > 0);
          case 'EDUCATION':
            return Boolean(Array.isArray(snapshot.education) && snapshot.education.length > 0);
          case 'DSA':
            return Boolean(
              (snapshot.dsa && Array.isArray(snapshot.dsa.bullets) && snapshot.dsa.bullets.length > 0) ||
              (snapshot.problemSolving && Array.isArray(snapshot.problemSolving.bullets) && snapshot.problemSolving.bullets.length > 0)
            );
          case 'CERTIFICATIONS':
            return Boolean(Array.isArray(snapshot.certifications) && snapshot.certifications.length > 0);
          case 'COURSEWORK':
            return Boolean(Array.isArray(snapshot.coursework) && snapshot.coursework.length > 0);
          case 'PUBLICATIONS':
            return Boolean(Array.isArray(snapshot.publications) && snapshot.publications.length > 0);
          default:
            return false;
        }
      };
      const order = Array.isArray(snapshot.sectionOrder) ? snapshot.sectionOrder : [];
      for (const key of order) {
        if (key === 'HEADER') continue;
        if (headingLabels[key] && hasSectionContent(key)) {
          expected.sectionHeadings.push(headingLabels[key]);
        }
      }

      return expected.projectNames.length > 0 ||
        expected.projectBullets.length > 0 ||
        expected.experienceBullets.length > 0 ||
        expected.educationTokens.length > 0
        ? expected
        : null;
    };
    const expectedContent = buildExpectedContent(structuredResume, resumeLatexResult.appliedMaxBulletsPerProject);

    const verifiedSkillNames = (applicationPackage.verifiedSkills || []).map((s) => s.name);
    const resumeQaAudit = await this.qaValidator.validatePdf({
      pdfBuffer: resumePdfResult.pdfBuffer,
      expectedCandidate: {
        name: applicationPackage.candidateName,
        email: applicationPackage.candidateEmail,
        phone: applicationPackage.candidatePhone,
      },
      targetJob: applicationPackage.targetJob,
      verifiedSkills: verifiedSkillNames,
      documentType: 'RESUME',
      expectedContent,
    });

    // 4b. Deterministic Resume-Quality Assessment (P14-024).
    // Three honest metrics replace the misleading arbitrary ATS score:
    // - ATS Parseability: deterministic check ledger over the ACTUAL rendered PDF
    // - Job Match: strict passthrough of the existing evidence-aware fit engine
    // - Evidence-Backed Coverage: job requirements vs evidence-grounded content
    let resumeQuality = null;
    try {
      const extractedResumeText = this.resumeParser
        ? this.resumeParser.extractRawText({ buffer: resumePdfResult.pdfBuffer, format: 'PDF' })
        : '';
      resumeQuality = this.resumeQualityAssessment.assessResumeQuality({
        extractedText: extractedResumeText,
        texContent: resumeLatexResult.texContent,
        applicationPackage,
        candidateProfile,
        jobFit: applicationPackage.jobFitAnalysis || null,
        analyzedAt: applicationPackage.preparedAt || null,
      });
    } catch (assessErr) {
      this.logger.warn(
        { error: assessErr.message },
        'Resume-quality assessment failed; kit continues without the three-metric block'
      );
    }

    // 4c. PDF Geometry Analysis (P14-026): measure actual compiled PDF layout
    let layoutDiagnostics = null;
    try {
      const packageSectionOrder =
        applicationPackage.structuredResume?.sectionOrder ||
        applicationPackage.tailoringPlan?.sectionOrder ||
        applicationPackage.tailoredResume?.sectionOrder ||
        null;

      const selectedSections = applicationPackage.tailoredResume?.selectedSections ||
        applicationPackage.selectedSections || [];
      const expectedSections = packageSectionOrder && packageSectionOrder.length > 0
        ? packageSectionOrder.filter((s) => s !== 'HEADER')
        : ['SUMMARY', 'SKILLS', 'PROJECTS'];
      if (!packageSectionOrder) {
        if (selectedSections.includes('PROBLEM_SOLVING') ||
            selectedSections.includes('LEETCODE') ||
            selectedSections.includes('ALGORITHMIC_PRACTICE')) {
          expectedSections.push('DSA');
        }
        expectedSections.push('EXPERIENCE', 'EDUCATION');
      }

      const geometryReport = this.geometryAnalyzer.analyze({
        pdfBuffer: resumePdfResult.pdfBuffer,
        expectedSections,
        expectedSectionOrder: packageSectionOrder,
      });
      layoutDiagnostics = geometryReport.layoutDiagnostics;
    } catch (geoErr) {
      this.logger.warn(
        { error: geoErr.message },
        'PDF geometry analysis failed; kit continues without layout diagnostics'
      );
    }

    // 5. Document Generation: Cover Letter
    const clLatexResult = this.latexGenerator.generateTailoredCoverLetterLatex({
      applicationPackage,
      candidateProfile,
    });

    const clPdfResult = await this.latexCompiler.compileLatexToPdf({
      texContent: clLatexResult.texContent,
      jobName: 'tailored-cover-letter',
    });

    // 6. Document QA Audit: Cover Letter Pre-Exposure Gating
    const clQaAudit = await this.qaValidator.validatePdf({
      pdfBuffer: clPdfResult.pdfBuffer,
      expectedCandidate: {
        name: applicationPackage.candidateName,
        email: applicationPackage.candidateEmail,
      },
      targetJob: applicationPackage.targetJob,
      documentType: 'COVER_LETTER',
    });

    // 7. Secure Encrypted Persistence via DocumentStorageService
    const storedResumePdf = await this.documentStorage.storeEncryptedDocument({
      tenantId,
      candidateId,
      buffer: resumePdfResult.pdfBuffer,
      originalFileName: 'tailored-resume.pdf',
      mimeType: 'application/pdf',
    });

    const storedResumeTex = await this.documentStorage.storeEncryptedDocument({
      tenantId,
      candidateId,
      buffer: Buffer.from(resumeLatexResult.texContent, 'utf8'),
      originalFileName: 'tailored-resume.tex',
      mimeType: 'text/x-tex',
    });

    const storedClPdf = await this.documentStorage.storeEncryptedDocument({
      tenantId,
      candidateId,
      buffer: clPdfResult.pdfBuffer,
      originalFileName: 'tailored-cover-letter.pdf',
      mimeType: 'application/pdf',
    });

    // 8. Readiness Evaluation
    const readinessItems = this.evaluateApplicationReadiness({
      candidateProfile,
      applicationPackage,
      answers: applicationPackage.answers,
      jobPosting: applicationPackage.targetJob,
    });

    const appRef = applicationId || 'pkg-' + packageHash.slice(0, 8);

    // 9b. Package-consistency: a kit must only be reused/persisted for the
    // application whose authoritative CURRENT package hash matches. Kits built
    // for a different package on the same application belong to a different
    // version and are NOT returned as the current kit here.

    // 9. Construct Complete Immutable Handoff Kit
    const handoffKit = {
      status: 'HANDOFF_READY',
      packageHash,
      generationContractVersion: currentContractVersion,
      structuredResumeSchemaVersion: currentSchemaVersion,
      applicationId: existingApp?.id || applicationId,
      submissionNotice: 'Prepared for manual submission. External submission has not occurred.',
      targetJob: {
        title: applicationPackage.targetJob?.title || 'Role',
        company: applicationPackage.targetJob?.company || 'Company',
        location: applicationPackage.targetJob?.location || 'Remote',
        directPortalUrl,
      },
      resume: {
        filename: 'tailored-resume.pdf',
        mimeType: 'application/pdf',
        contentHash: storedResumePdf.contentHash,
        fileSizeBytes: storedResumePdf.fileSizeBytes,
        storageKey: storedResumePdf.storageKey,
        texStorageKey: storedResumeTex.storageKey,
        viewUrl: `/api/applications/${appRef}/artifacts/resume/view`,
        downloadUrl: `/api/applications/${appRef}/artifacts/resume/download`,
        generationContractVersion: currentContractVersion,
        structuredResumeSchemaVersion: currentSchemaVersion,
        qaAudit: {
          score: resumeQaAudit.score,
          qualityLevel: resumeQaAudit.qualityLevel,
          passed: resumeQaAudit.passed,
          breakdown: resumeQaAudit.breakdown,
          metrics: resumeQaAudit.metrics,
          findings: resumeQaAudit.findings,
          traceability: resumeQaAudit.traceability,
        },
        resumeQuality,
        layoutDiagnostics,
      },
      coverLetter: {
        filename: 'tailored-cover-letter.pdf',
        mimeType: 'application/pdf',
        contentHash: storedClPdf.contentHash,
        fileSizeBytes: storedClPdf.fileSizeBytes,
        storageKey: storedClPdf.storageKey,
        viewUrl: `/api/applications/${appRef}/artifacts/cover-letter/view`,
        downloadUrl: `/api/applications/${appRef}/artifacts/cover-letter/download`,
        generationContractVersion: currentContractVersion,
        structuredResumeSchemaVersion: currentSchemaVersion,
        qaAudit: {
          score: clQaAudit.score,
          qualityLevel: clQaAudit.qualityLevel,
          passed: clQaAudit.passed,
          breakdown: clQaAudit.breakdown,
          metrics: clQaAudit.metrics,
          findings: clQaAudit.findings,
        },
      },
      readiness: readinessItems,
      suggestedAnswers: applicationPackage.answers || {},
      directPortalUrl,
      generatedAt: new Date().toISOString(),
    };

    // 10b. Readiness Semantics: distinguish DOCUMENT readiness from PROFILE completeness.
    handoffKit.readinessSemantics = this.evaluateHandoffSemantics({
      handoffKit,
      readinessItems,
    });

    if (applicationId) {
      await this._attachTailoredDocumentSnapshots({
        tenantId,
        userId,
        applicationId,
        applicationPackage,
        handoffKit,
      });
    }

    // 10. Persist metadata back to tracked application record if available.
    // setApplicationHandoffKit atomically writes the kit and syncs
    // metadata.currentPackageHash so inspection tools resolve the same package.
    const targetAppId = existingApp?.id || applicationId;
    if (targetAppId) {
      try {
        await this.applicationTrackingService.setApplicationHandoffKit(
          { tenantId, userId, role: 'MEMBER' },
          targetAppId,
          handoffKit
        );
      } catch (saveErr) {
        this.logger.warn(
          { error: saveErr.message },
          'Failed to persist handoffKit to application metadata'
        );
      }
    }

    return handoffKit;
  }
}
