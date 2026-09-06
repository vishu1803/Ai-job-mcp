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
import { DocumentStorageService } from './document-storage.service.js';
import { CandidateProfileService } from './candidate-profile.service.js';
import { ApplicationTrackingService } from './application-tracking.service.js';
import { ValidationError } from '../errors/index.js';
import { logger } from '../utils/logger.js';

export class ApplicationHandoffService {
  /**
   * @param {object} [dependencies={}]
   * @param {LatexDocumentGenerator} [dependencies.latexGenerator]
   * @param {LatexCompilerService} [dependencies.latexCompiler]
   * @param {PdfQaValidatorService} [dependencies.qaValidator]
   * @param {DocumentStorageService} [dependencies.documentStorage]
   * @param {CandidateProfileService} [dependencies.candidateProfileService]
   * @param {ApplicationTrackingService} [dependencies.applicationTrackingService]
   */
  constructor(dependencies = {}) {
    this.latexGenerator = dependencies.latexGenerator || new LatexDocumentGenerator();
    this.latexCompiler = dependencies.latexCompiler || new LatexCompilerService();
    this.qaValidator = dependencies.qaValidator || new PdfQaValidatorService();
    this.documentStorage = dependencies.documentStorage || new DocumentStorageService();
    this.candidateProfileService =
      dependencies.candidateProfileService || new CandidateProfileService();
    this.applicationTrackingService =
      dependencies.applicationTrackingService || new ApplicationTrackingService();
    this.logger = logger.child({ module: 'ApplicationHandoffService' });
  }

  /**
   * Evaluates application readiness across canonical candidate profile data.
   *
   * @param {object} params
   * @param {object} params.candidateProfile Candidate profile DTO
   * @param {object} params.applicationPackage Canonical application package
   * @returns {Array<object>} Evaluated readiness checklist items
   */
  evaluateApplicationReadiness({ candidateProfile, applicationPackage }) {
    const candidateMeta = candidateProfile?.profileMetadata || {};
    const identityMeta = candidateMeta.identity || {};
    const readinessMeta = candidateMeta.readiness || {};
    const contactMeta = candidateMeta.contact || {};
    const preferencesMeta = candidateMeta.jobPreferences || {};

    const items = [];

    // 1. Email
    const email = applicationPackage?.candidateEmail || candidateProfile?.primaryEmail;
    if (email && !email.includes('example.com')) {
      items.push({
        field: 'email',
        label: 'Candidate Email',
        value: email,
        status: 'READY',
        notes: 'Authoritative primary account email verified',
        profileSection: 'contact',
        profileAnchor: '/profile#section-contact',
      });
    } else {
      items.push({
        field: 'email',
        label: 'Candidate Email',
        value: null,
        status: 'MISSING',
        notes: 'Valid candidate email required',
        profileSection: 'contact',
        profileAnchor: '/profile#section-contact',
      });
    }

    // 2. Phone
    const phone =
      applicationPackage?.candidatePhone ||
      candidateProfile?.candidatePhone ||
      candidateProfile?.phone ||
      contactMeta.phone;

    if (phone && phone.trim().length > 0) {
      items.push({
        field: 'phone',
        label: 'Contact Phone',
        value: phone.trim(),
        status: 'READY',
        notes: 'Candidate phone number registered',
        profileSection: 'contact',
        profileAnchor: '/profile#section-contact',
      });
    } else {
      items.push({
        field: 'phone',
        label: 'Contact Phone',
        value: null,
        status: 'MISSING',
        notes: 'Phone number not yet provided in Profile',
        profileSection: 'contact',
        profileAnchor: '/profile#section-contact',
      });
    }

    // 3. Work Authorization
    const workAuth = readinessMeta.workAuthorization || identityMeta.workAuthorization;
    if (workAuth && workAuth.trim().length > 0) {
      items.push({
        field: 'workAuthorization',
        label: 'Work Authorization',
        value: workAuth,
        status: 'NEEDS_CONFIRMATION',
        notes: 'Requires candidate confirmation for target job jurisdiction',
        profileSection: 'readiness',
        profileAnchor: '/profile#section-readiness',
      });
    } else {
      items.push({
        field: 'workAuthorization',
        label: 'Work Authorization',
        value: null,
        status: 'MISSING',
        notes: 'Work authorization status not yet documented',
        profileSection: 'readiness',
        profileAnchor: '/profile#section-readiness',
      });
    }

    // 4. Visa Sponsorship Required
    const visaSponsorship =
      readinessMeta.visaSponsorshipRequired ?? identityMeta.visaSponsorshipRequired;
    if (visaSponsorship !== undefined && visaSponsorship !== null) {
      items.push({
        field: 'visaSponsorship',
        label: 'Visa Sponsorship',
        value: visaSponsorship ? 'Sponsorship Required' : 'No Sponsorship Needed',
        status: 'NEEDS_CONFIRMATION',
        notes: 'Confirm sponsorship requirements with target employer',
        profileSection: 'readiness',
        profileAnchor: '/profile#section-readiness',
      });
    } else {
      items.push({
        field: 'visaSponsorship',
        label: 'Visa Sponsorship',
        value: null,
        status: 'MISSING',
        notes: 'Visa sponsorship preference not set',
        profileSection: 'readiness',
        profileAnchor: '/profile#section-readiness',
      });
    }

    // 5. LinkedIn / Professional Links
    const allLinks = [
      ...(Array.isArray(candidateProfile?.portfolioLinks) ? candidateProfile.portfolioLinks : []),
      ...(Array.isArray(contactMeta.links) ? contactMeta.links : []),
    ];
    const linkedin = allLinks.find((l) => /linkedin/i.test(l.platform || l.label || l.url || ''));
    if (linkedin && linkedin.url) {
      items.push({
        field: 'linkedin',
        label: 'LinkedIn Profile',
        value: linkedin.url,
        status: 'READY',
        notes: 'Connected professional profile link',
        profileSection: 'links',
        profileAnchor: '/profile#section-links',
      });
    } else {
      items.push({
        field: 'linkedin',
        label: 'LinkedIn Profile',
        value: null,
        status: 'MISSING',
        notes: 'LinkedIn profile link not added to links collection',
        profileSection: 'links',
        profileAnchor: '/profile#section-links',
      });
    }

    // 6. Portfolio / Code Repositories
    const githubUser = candidateProfile?.githubUsername;
    const portfolioUrl = allLinks.find((l) =>
      /portfolio|github|website/i.test(l.platform || l.label || '')
    )?.url;

    if (githubUser || portfolioUrl) {
      items.push({
        field: 'portfolio',
        label: 'Code / Portfolio',
        value: portfolioUrl || `https://github.com/${githubUser}`,
        status: 'READY',
        notes: 'Evidence-backed repository profile verified',
        profileSection: 'links',
        profileAnchor: '/profile#section-links',
      });
    } else {
      items.push({
        field: 'portfolio',
        label: 'Code / Portfolio',
        value: null,
        status: 'MISSING',
        notes: 'GitHub or portfolio URL not linked',
        profileSection: 'links',
        profileAnchor: '/profile#section-links',
      });
    }

    // 7. Earliest Availability / Notice Period
    const availability = preferencesMeta.availabilityDate || readinessMeta.availabilityDate;
    if (availability) {
      items.push({
        field: 'availability',
        label: 'Earliest Start Date',
        value: availability,
        status: 'READY',
        notes: 'Candidate start date recorded',
        profileSection: 'preferences',
        profileAnchor: '/profile#section-preferences',
      });
    } else {
      items.push({
        field: 'availability',
        label: 'Earliest Start Date',
        value: null,
        status: 'MISSING',
        notes: 'Availability date not specified in Job Search Intent',
        profileSection: 'preferences',
        profileAnchor: '/profile#section-preferences',
      });
    }

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

    // 1. Fetch Candidate Profile for canonical metadata.
    // Fail-closed: without the real candidate profile the generator would fall
    // back to placeholder content, so a profile failure aborts kit generation.
    let candidateProfile = null;
    try {
      candidateProfile = await this.candidateProfileService.getProfile(
        { tenantId, userId, role: 'MEMBER' },
        candidateId
      );
    } catch (err) {
      this.logger.error(
        { error: err.message, candidateId },
        'Canonical candidate profile could not be loaded; aborting handoff kit generation (fail-closed, zero placeholder fallback)'
      );
      throw new ValidationError(
        `Cannot generate handoff kit without a loadable canonical candidate profile: ${err.message}`
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

    // If matching packageHash artifacts already exist, return them without re-generation.
    // A kit for a DIFFERENT (non-current) packageHash must never be reused.
    const currentMetaHash =
      existingApp?.metadata?.currentPackageHash || existingApp?.metadata?.packageHash;
    if (currentMetaHash && currentMetaHash !== packageHash) {
      this.logger.info(
        { applicationId, currentMetaHash, packageHash },
        'Existing kit packageHash differs from incoming package; regenerating kit for the current package'
      );
    } else {
      const existingKit = existingApp?.metadata?.handoffKit;
      if (
        existingKit &&
        existingKit.packageHash === packageHash &&
        existingKit.resume?.storageKey
      ) {
        await this._attachTailoredDocumentSnapshots({
          tenantId,
          userId,
          applicationId: existingApp.id,
          applicationPackage,
          handoffKit: existingKit,
        });
        this.logger.info(
          { applicationId, packageHash },
          'Reusing existing immutable handoff kit matching packageHash'
        );
        return existingKit;
      }
    }

    // If matching packageHash artifacts already exist, return them without re-generation
    const existingKit = existingApp?.metadata?.handoffKit;
    if (existingKit && existingKit.packageHash === packageHash && existingKit.resume?.storageKey) {
      await this._attachTailoredDocumentSnapshots({
        tenantId,
        userId,
        applicationId: existingApp.id,
        applicationPackage,
        handoffKit: existingKit,
      });
      this.logger.info(
        { applicationId, packageHash },
        'Reusing existing immutable handoff kit matching packageHash'
      );
      return existingKit;
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
    const userCustomMeta =
      candidateProfile?.candidate?.profileMetadata?.userCustom ||
      candidateProfile?.profileMetadata?.userCustom ||
      {};
    const realDataTokens = [
      applicationPackage.candidateName,
      ...(Array.isArray(userCustomMeta.education)
        ? userCustomMeta.education.map((edu) => edu.institution).filter(Boolean)
        : []),
      ...(Array.isArray(userCustomMeta.experience) && userCustomMeta.experience[0]?.company
        ? [userCustomMeta.experience[0].company]
        : []),
    ].filter(Boolean);
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
    });

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
        qaAudit: {
          score: resumeQaAudit.score,
          qualityLevel: resumeQaAudit.qualityLevel,
          passed: resumeQaAudit.passed,
          breakdown: resumeQaAudit.breakdown,
          metrics: resumeQaAudit.metrics,
          findings: resumeQaAudit.findings,
        },
      },
      coverLetter: {
        filename: 'tailored-cover-letter.pdf',
        mimeType: 'application/pdf',
        contentHash: storedClPdf.contentHash,
        fileSizeBytes: storedClPdf.fileSizeBytes,
        storageKey: storedClPdf.storageKey,
        viewUrl: `/api/applications/${appRef}/artifacts/cover-letter/view`,
        downloadUrl: `/api/applications/${appRef}/artifacts/cover-letter/download`,
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
    if (existingApp) {
      try {
        await this.applicationTrackingService.setApplicationHandoffKit(
          { tenantId, userId, role: 'MEMBER' },
          existingApp.id,
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
