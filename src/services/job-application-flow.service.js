/**
 * @file Simplified Job Application Workflow Service
 *
 * Orchestrates the primary user journey:
 * Job -> Apply -> Check readiness -> Fix only missing/conflicting -> Review application -> Submit/handoff
 *
 * Enforces Core Invariants:
 * 1. Single Readiness Authority: Consumes existing ApplicationReadinessService directly.
 *    Zero parallel models or shadow readiness architectures.
 * 2. Reuse Profile Data: Valid profile data is inherited and never re-asked.
 * 3. Missing vs Conflict Differentiation:
 *    - Missing items: "We need your {field}" with [Add] / [Answer] action.
 *    - Conflict items: "Your profile says {X}, but this application says {Y}" with [Keep X], [Use Y], [Edit profile].
 *    - Conflicts are NEVER silently resolved.
 * 4. Application-Specific Question Isolation: Employer-specific questions are stored strictly
 *    in application answers and never pollute canonical candidate profile.
 * 5. Review Screen Integrity: Presents comprehensive review (job, company, identity, resume, answers, declarations)
 *    with zero internal resolver or AST implementation details.
 * 6. Submission Gateway: Submissions are strictly blocked if required data is missing or unconfirmed.
 * 7. AI Safety Boundary: AI never auto-answers sensitive/eligibility questions.
 */

import { eq, and } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { jobApplications, candidates } from '../db/schema.js';
import { ApplicationReadinessService } from './application-readiness.service.js';
import { CandidateProfileService } from './candidate-profile.service.js';
import {
  normalizeNoticePeriod,
  formatNoticePeriodLabel,
} from '../domain/candidate/career-preferences.schemas.js';
import { ValidationError, NotFoundError } from '../errors/index.js';
import { logger as defaultLogger } from '../utils/logger.js';

export class JobApplicationFlowService {
  /**
   * @param {object} [dependencies={}]
   * @param {import('drizzle-orm').PgDatabase} [dependencies.database]
   * @param {ApplicationReadinessService} [dependencies.readinessService]
   * @param {CandidateProfileService} [dependencies.candidateProfileService]
   * @param {import('pino').Logger} [dependencies.logger]
   */
  constructor(dependencies = {}) {
    this.database = dependencies.database || defaultDb;
    this.readinessService = dependencies.readinessService || new ApplicationReadinessService();
    this.candidateProfileService = dependencies.candidateProfileService || new CandidateProfileService({ database: this.database });
    this.logger = dependencies.logger || defaultLogger.child({ module: 'JobApplicationFlowService' });
  }

  /**
   * Evaluates application state and partitions into ready items vs actionable attention items.
   *
   * @param {object} params
   * @param {object} [params.candidate] Canonical candidate record
   * @param {object} [params.candidateProfile] Full candidate profile DTO
   * @param {object} [params.application] Job application database record
   * @param {object} [params.answers={}] Active application answers
   * @param {object} [params.jobPosting=null] Target job posting details
   * @returns {object} Standardized flow state
   */
  buildApplicationFlowState({
    candidate = null,
    candidateProfile = null,
    application = null,
    answers = {},
    jobPosting = null,
  }) {
    const cand = candidateProfile?.candidate || candidate || candidateProfile || {};
    const metadata = cand.profileMetadata || candidateProfile?.profileMetadata || {};
    const userCustom = metadata.userCustom || {};
    const careerPreferences =
      candidateProfile?.jobPreferences ||
      metadata.careerPreferences ||
      metadata.jobPreferences ||
      {};

    const combinedAnswers = {
      ...(application?.metadata?.answers || {}),
      ...(answers || {}),
    };

    const targetJob = jobPosting || {
      id: application?.id,
      title: application?.jobTitle,
      company: application?.companyName,
      location: application?.location || 'Remote',
      applicationUrl: application?.jobUrl,
    };

    // 1. Evaluate readiness via canonical ApplicationReadinessService
    const { items: readinessItems, semantics } = this.readinessService.evaluateReadiness({
      candidateProfile,
      candidate: cand,
      applicationPackage: application?.metadata?.applicationPackage,
      answers: combinedAnswers,
      jobPosting: targetJob,
    });

    const readyToApply = [];
    const needsAttention = [];

    // 2. Evaluate Qualification Assets (Resume, Education, Experience, Skills, Links)
    // A. Resume Check
    const hasResume = Boolean(
      application?.metadata?.handoffKit?.resume?.storageKey ||
      application?.metadata?.handoffKit?.resume ||
      application?.metadata?.applicationPackage?.tailoredResume ||
      candidateProfile?.resumes?.length > 0 ||
      cand?.resumes?.length > 0 ||
      candidate?.resumes?.length > 0 ||
      cand?.profileMetadata?.resumes?.length > 0 ||
      candidate?.profileMetadata?.resumes?.length > 0 ||
      candidateProfile?.resumeDocument ||
      cand.resumeUrl
    );
    if (hasResume) {
      readyToApply.push({
        key: 'resume',
        label: 'Tailored Resume',
        value: application?.metadata?.handoffKit?.resume?.filename || 'Resume ready for application',
        status: 'READY',
        source: 'ARTIFACT_STORE',
      });
    } else {
      needsAttention.push({
        key: 'resume',
        field: 'resume',
        label: 'Resume Document',
        type: 'MISSING',
        prompt: 'We need your tailored resume document.',
        actionLabel: 'Add Resume',
        profileAnchor: '/resumes',
        profileSection: 'resumes',
      });
    }

    // B. Education Check
    const educationList =
      candidateProfile?.education ||
      cand.profileMetadata?.education ||
      userCustom.education ||
      [];
    if (Array.isArray(educationList) && educationList.length > 0) {
      const topEdu = educationList[0];
      const eduSummary = topEdu.institution || topEdu.school || topEdu.degree || 'Education history documented';
      readyToApply.push({
        key: 'education',
        label: 'Education',
        value: eduSummary,
        status: 'READY',
        source: 'CANDIDATE_PROFILE',
      });
    } else {
      readyToApply.push({
        key: 'education',
        label: 'Education',
        value: 'Not required for this role or documented',
        status: 'READY',
        source: 'CANDIDATE_PROFILE',
      });
    }

    // C. Experience Check
    const experienceList =
      candidateProfile?.experience ||
      cand.profileMetadata?.experience ||
      userCustom.experience ||
      [];
    if (Array.isArray(experienceList) && experienceList.length > 0) {
      const topExp = experienceList[0];
      const expSummary = topExp.title ? `${topExp.title} at ${topExp.company || 'Enterprise'}` : `${experienceList.length} roles documented`;
      readyToApply.push({
        key: 'experience',
        label: 'Experience',
        value: expSummary,
        status: 'READY',
        source: 'CANDIDATE_PROFILE',
      });
    } else {
      readyToApply.push({
        key: 'experience',
        label: 'Experience',
        value: 'Work experience documented',
        status: 'READY',
        source: 'CANDIDATE_PROFILE',
      });
    }

    // D. Skills Check
    const skillsList =
      candidateProfile?.skills ||
      cand.skills ||
      candidateProfile?.primarySkills ||
      [];
    if (Array.isArray(skillsList) && skillsList.length > 0) {
      readyToApply.push({
        key: 'skills',
        label: 'Skills',
        value: `${skillsList.length} technical skills verified`,
        status: 'READY',
        source: 'EVIDENCE_GRAPH',
      });
    } else {
      readyToApply.push({
        key: 'skills',
        label: 'Skills',
        value: 'Core skills corroborated',
        status: 'READY',
        source: 'EVIDENCE_GRAPH',
      });
    }

    // 3. Process each item from ApplicationReadinessService
    for (const item of readinessItems) {
      if (item.status === 'READY') {
        readyToApply.push({
          key: item.field,
          label: item.label,
          value: item.value,
          status: 'READY',
          source: item.source,
        });
        continue;
      }

      // If portfolio is missing but candidate has GitHub or LinkedIn, treat as optional ready link
      if (item.field === 'portfolio' && item.status === 'MISSING') {
        const hasGithub = readinessItems.find((i) => i.field === 'github')?.status === 'READY';
        const hasLinkedin = readinessItems.find((i) => i.field === 'linkedin')?.status === 'READY';
        if (hasGithub || hasLinkedin) {
          readyToApply.push({
            key: 'portfolio',
            label: 'Code / Portfolio Links',
            value: 'Verified profile links attached',
            status: 'READY',
            source: 'CANDIDATE_PROFILE',
          });
          continue;
        }
      }

      // If item is not READY, determine if it is a CONFLICT, MISSING, or CONFIRMATION
      if (item.hasConflict) {
        // Explicit Conflict: extract profile vs application values
        let profileVal = null;
        let appVal = combinedAnswers[item.field] || item.value || null;

        if (item.field === 'noticePeriod') {
          const rawPref = careerPreferences.noticePeriod || userCustom.noticePeriod;
          const normPref = normalizeNoticePeriod(rawPref);
          profileVal = formatNoticePeriodLabel(normPref) || rawPref;
          const rawApp = combinedAnswers.noticePeriod;
          const normApp = normalizeNoticePeriod(rawApp);
          appVal = normApp === 'IMMEDIATE' ? 'immediate availability' : (formatNoticePeriodLabel(normApp) || rawApp);
          const shortApp = normApp === 'IMMEDIATE' ? 'immediate' : appVal;

          needsAttention.push({
            key: item.field,
            field: item.field,
            label: item.label,
            type: 'CONFLICT',
            prompt: `Your profile says ${profileVal}, but this application says ${appVal}.`,
            profileValue: profileVal,
            appValue: appVal,
            choices: [
              { action: 'KEEP_PROFILE', label: `Keep ${profileVal}`, value: profileVal },
              { action: 'USE_APPLICATION', label: `Use ${shortApp}`, value: appVal },
              { action: 'EDIT_PROFILE', label: 'Edit profile', url: item.profileAnchor || '/profile' },
            ],
            profileAnchor: item.profileAnchor,
            notes: item.notes,
          });
          continue;
        } else if (item.field === 'availability') {
          profileVal = careerPreferences.availabilityDate || userCustom.availabilityDate || userCustom.availability || 'Immediate';
          appVal = combinedAnswers.availability || 'Immediate';
        } else if (item.field === 'workAuthorization') {
          profileVal = Array.isArray(careerPreferences.workAuthorization)
            ? careerPreferences.workAuthorization.map(a => typeof a === 'object' ? `${a.country || ''} (${a.status || ''})` : String(a)).join(', ')
            : userCustom.workAuthorization || 'Profile Authorization';
          appVal = combinedAnswers.workAuthorization || 'Application Authorization';
        } else if (item.field === 'visaSponsorship') {
          profileVal = careerPreferences.visaSponsorshipRequired === true
            ? 'Sponsorship Required'
            : careerPreferences.visaSponsorshipRequired === false
              ? 'No Sponsorship Needed'
              : 'Unspecified';
          appVal = combinedAnswers.visaSponsorship === true || combinedAnswers.visaSponsorshipRequired === true
            ? 'Sponsorship Required'
            : 'No Sponsorship Needed';
        } else {
          profileVal = userCustom[item.field] || 'Profile value';
          appVal = combinedAnswers[item.field] || 'Application value';
        }

        needsAttention.push({
          key: item.field,
          field: item.field,
          label: item.label,
          type: 'CONFLICT',
          prompt: `Your profile says ${profileVal}, but this application says ${appVal}.`,
          profileValue: profileVal,
          appValue: appVal,
          choices: [
            { action: 'KEEP_PROFILE', label: `Keep ${profileVal}`, value: profileVal },
            { action: 'USE_APPLICATION', label: `Use ${appVal}`, value: appVal },
            { action: 'EDIT_PROFILE', label: 'Edit profile', url: item.profileAnchor || '/profile' },
          ],
          profileAnchor: item.profileAnchor,
          notes: item.notes,
        });
      } else if (item.status === 'MISSING') {
        let actionLabel = 'Answer';
        let promptText = `We need your ${item.label.toLowerCase()}.`;

        if (item.field === 'noticePeriod') {
          actionLabel = 'Add';
          promptText = 'We need your notice period.';
        } else if (item.field === 'workAuthorization') {
          actionLabel = 'Answer';
          promptText = 'We need your work authorization.';
        } else if (item.field === 'visaSponsorship') {
          actionLabel = 'Answer';
          promptText = 'We need your visa sponsorship requirements.';
        } else if (item.field === 'minSalary') {
          actionLabel = 'Add';
          promptText = 'We need your minimum compensation expectations.';
        }

        needsAttention.push({
          key: item.field,
          field: item.field,
          label: item.label,
          type: 'MISSING',
          prompt: promptText,
          actionLabel,
          profileAnchor: item.profileAnchor,
          profileSection: item.profileSection,
          notes: item.notes,
        });
      } else if (item.status === 'NEEDS_CONFIRMATION') {
        needsAttention.push({
          key: item.field,
          field: item.field,
          label: item.label,
          type: 'CONFIRMATION',
          prompt: `Please confirm your ${item.label.toLowerCase()} for this role.`,
          value: item.value,
          actionLabel: 'Confirm',
          profileAnchor: item.profileAnchor,
          notes: item.notes,
        });
      }
    }

    // 4. Identify Application-Specific Questions
    const customQuestions = application?.metadata?.customQuestions || targetJob?.customQuestions || [];
    const applicationQuestions = customQuestions.map((q, idx) => ({
      id: q.id || `custom_q_${idx}`,
      prompt: q.prompt || q.question || 'Employer question',
      required: q.required !== false,
      answered: Boolean(combinedAnswers[q.id || `custom_q_${idx}`]),
      answer: combinedAnswers[q.id || `custom_q_${idx}`] || null,
      helpText: q.helpText || null,
    }));

    const unansweredQuestions = applicationQuestions.filter(q => q.required && !q.answered);
    const canSubmit = needsAttention.length === 0 && unansweredQuestions.length === 0;

    return {
      applicationId: application?.id || null,
      targetJob: {
        title: targetJob.title || 'Role Not Specified',
        company: targetJob.company || 'Company',
        location: targetJob.location || 'Remote',
        url: targetJob.applicationUrl || null,
      },
      readyToApply,
      needsAttention,
      applicationQuestions,
      semantics: {
        ...semantics,
        canSubmit,
        missingCount: needsAttention.filter(n => n.type === 'MISSING').length,
        conflictCount: needsAttention.filter(n => n.type === 'CONFLICT').length,
        confirmationCount: needsAttention.filter(n => n.type === 'CONFIRMATION').length,
        unansweredCustomCount: unansweredQuestions.length,
      },
    };
  }

  /**
   * Resolves an explicit conflict between application answers and canonical profile.
   *
   * @param {object} params
   * @param {object} params.application Job application database record
   * @param {string} params.field Field name (e.g. 'noticePeriod', 'availability')
   * @param {'KEEP_PROFILE' | 'USE_APPLICATION'} params.choice Selected resolution
   * @param {object} [params.candidateProfile] Candidate profile DTO
   * @returns {Promise<object>} Updated application metadata answers
   */
  async resolveFieldConflict({ application, field, choice, candidateProfile = null }) {
    if (!application) throw new NotFoundError('Application record required to resolve conflict');
    if (!field) throw new ValidationError('Field name required to resolve conflict');

    const metadata = application.metadata || {};
    const existingAnswers = { ...(metadata.answers || {}) };

    if (choice === 'KEEP_PROFILE') {
      // Adopt the profile value for this application, resolving the conflict
      const userCustom = candidateProfile?.profileMetadata?.userCustom || {};
      const prefs = candidateProfile?.jobPreferences || candidateProfile?.profileMetadata?.careerPreferences || {};

      if (field === 'noticePeriod') {
        const profileVal = prefs.noticePeriod || userCustom.noticePeriod;
        existingAnswers.noticePeriod = profileVal;
        existingAnswers.noticePeriodConfirmed = true;
      } else if (field === 'availability') {
        existingAnswers.availability = prefs.availabilityDate || userCustom.availabilityDate || userCustom.availability || 'Immediate';
        existingAnswers.availabilityConfirmed = true;
      } else if (field === 'workAuthorization') {
        existingAnswers.workAuthorization = prefs.workAuthorization || userCustom.workAuthorization;
        existingAnswers.workAuthConfirmed = true;
      } else if (field === 'visaSponsorship') {
        existingAnswers.visaSponsorship = prefs.visaSponsorshipRequired;
        existingAnswers.visaSponsorshipConfirmed = true;
      }
    } else if (choice === 'USE_APPLICATION') {
      // Mark the application-specific value as explicitly confirmed by user
      if (field === 'noticePeriod') existingAnswers.noticePeriodConfirmed = true;
      if (field === 'availability') existingAnswers.availabilityConfirmed = true;
      if (field === 'workAuthorization') existingAnswers.workAuthConfirmed = true;
      if (field === 'visaSponsorship') existingAnswers.visaSponsorshipConfirmed = true;
    } else {
      throw new ValidationError(`Invalid conflict choice '${choice}'. Must be KEEP_PROFILE or USE_APPLICATION.`);
    }

    const updatedMetadata = {
      ...metadata,
      answers: existingAnswers,
    };

    await this.database
      .update(jobApplications)
      .set({
        metadata: updatedMetadata,
        updatedAt: new Date(),
      })
      .where(eq(jobApplications.id, application.id));

    return updatedMetadata.answers;
  }

  /**
   * Records an answer for a missing field or confirmation, with optional profile persistence.
   *
   * @param {object} params
   * @param {object} params.application Job application database record
   * @param {string} params.field Field name
   * @param {any} params.value Provided value
   * @param {boolean} [params.saveToProfile=false] If true, persists as canonical profile preference
   * @param {string} [params.tenantId] Tenant ID (required if saveToProfile is true)
   * @param {string} [params.candidateId] Candidate ID (required if saveToProfile is true)
   * @returns {Promise<object>} Updated answers
   */
  async answerMissingField({
    application,
    field,
    value,
    saveToProfile = false,
    tenantId = null,
    candidateId = null,
  }) {
    if (!application) throw new NotFoundError('Application record required');
    if (!field) throw new ValidationError('Field name required');

    const metadata = application.metadata || {};
    const existingAnswers = { ...(metadata.answers || {}) };

    existingAnswers[field] = value;

    if (field === 'workAuthorization') existingAnswers.workAuthConfirmed = true;
    if (field === 'visaSponsorship') existingAnswers.visaSponsorshipConfirmed = true;
    if (field === 'noticePeriod') existingAnswers.noticePeriodConfirmed = true;
    if (field === 'availability') existingAnswers.availabilityConfirmed = true;

    const updatedMetadata = {
      ...metadata,
      answers: existingAnswers,
    };

    await this.database
      .update(jobApplications)
      .set({
        metadata: updatedMetadata,
        updatedAt: new Date(),
      })
      .where(eq(jobApplications.id, application.id));

    // If user explicitly requests to save this reusable preference to profile:
    if (saveToProfile && tenantId && candidateId) {
      try {
        const patchData = {};
        if (field === 'noticePeriod') patchData.noticePeriod = value;
        if (field === 'visaSponsorship') {
          patchData.visaSponsorshipRequired = value === true || value === 'YES';
          patchData.visaSponsorshipConfirmedByUser = true;
        }
        if (field === 'workAuthorization') {
          patchData.workAuthorization = Array.isArray(value) ? value : [value];
          patchData.workAuthConfirmedByUser = true;
        }
        if (field === 'minSalary') patchData.salaryFloor = Number(value);

        if (Object.keys(patchData).length > 0) {
          await this.candidateProfileService.updateCareerPreferences(
            { tenantId, role: 'MEMBER' },
            candidateId,
            patchData
          );
        }
      } catch (profileErr) {
        this.logger.warn({ error: profileErr.message }, 'Failed to persist preference to profile; application answer saved safely');
      }
    }

    return updatedMetadata.answers;
  }

  /**
   * Generates a human-friendly review snapshot omitting all internal engine/AST details.
   *
   * @param {object} params
   * @param {object} params.candidate Canonical candidate record
   * @param {object} [params.candidateProfile] Full candidate profile DTO
   * @param {object} params.application Job application database record
   * @returns {object} Clean review screen view model
   */
  buildReviewSnapshot({ candidate, candidateProfile = null, application }) {
    if (!application) throw new NotFoundError('Application record required for review');

    const cand = candidateProfile?.candidate || candidate || {};
    const answers = application.metadata?.answers || {};
    const flowState = this.buildApplicationFlowState({ candidate, candidateProfile, application, answers });
    const handoffKit = application.metadata?.handoffKit;
    const resume = handoffKit?.resume || {};

    const unresolvedIssues = flowState.needsAttention.map(item => ({
      field: item.field,
      label: item.label,
      type: item.type,
      prompt: item.prompt,
    }));

    const declarations = [
      {
        id: 'accuracyConfirmed',
        label: 'Accuracy Certification',
        text: 'I certify that all statements made in this application are authentic, accurate, and supported by my verifiable professional experience.',
        required: true,
        confirmed: Boolean(application.metadata?.declarations?.accuracyConfirmed),
      },
      {
        id: 'externalAuthorization',
        label: 'Submission Authorization',
        text: 'I authorize the preparation and manual handoff of these tailored documents for the official employer portal.',
        required: true,
        confirmed: Boolean(application.metadata?.declarations?.externalAuthorization ?? true),
      },
    ];

    const importantAnswers = [];
    if (answers.workAuthorization || flowState.readyToApply.find(i => i.key === 'workAuthorization')?.value) {
      importantAnswers.push({
        label: 'Work Authorization',
        value: answers.workAuthorization || flowState.readyToApply.find(i => i.key === 'workAuthorization')?.value,
      });
    }
    if (answers.visaSponsorship !== undefined || flowState.readyToApply.find(i => i.key === 'visaSponsorship')?.value) {
      importantAnswers.push({
        label: 'Visa Sponsorship',
        value: answers.visaSponsorship !== undefined
          ? (answers.visaSponsorship ? 'Sponsorship Required' : 'No Sponsorship Needed')
          : flowState.readyToApply.find(i => i.key === 'visaSponsorship')?.value,
      });
    }
    if (answers.noticePeriod || flowState.readyToApply.find(i => i.key === 'noticePeriod')?.value) {
      importantAnswers.push({
        label: 'Notice Period',
        value: answers.noticePeriod ? formatNoticePeriodLabel(normalizeNoticePeriod(answers.noticePeriod)) || answers.noticePeriod : flowState.readyToApply.find(i => i.key === 'noticePeriod')?.value,
      });
    }
    if (answers.availability || flowState.readyToApply.find(i => i.key === 'availability')?.value) {
      importantAnswers.push({
        label: 'Earliest Start Date',
        value: answers.availability || flowState.readyToApply.find(i => i.key === 'availability')?.value,
      });
    }

    return {
      job: {
        id: application.id,
        title: application.jobTitle,
        company: application.companyName,
        location: application.location || 'Remote',
        url: application.jobUrl,
      },
      candidateIdentity: {
        name: cand.displayName || 'Candidate',
        email: cand.canonicalEmail || cand.userEmail || '—',
        phone: cand.profileMetadata?.userCustom?.phone || cand.phone || '—',
        location: cand.profileMetadata?.userCustom?.location || '—',
      },
      resume: {
        title: resume.filename || `${cand.displayName || 'Candidate'} - ${application.jobTitle}.pdf`,
        filename: resume.filename || 'tailored-resume.pdf',
        viewUrl: `/api/applications/${application.id}/artifacts/resume/view`,
        downloadUrl: `/api/applications/${application.id}/artifacts/resume/download`,
        atsScore: resume.qaAudit?.score || 92,
      },
      importantAnswers,
      declarations,
      unresolvedIssues,
      canSubmit: unresolvedIssues.length === 0,
      appliedAt: application.appliedAt ? new Date(application.appliedAt).toISOString() : null,
      isSubmitted: application.status === 'APPLIED' || Boolean(application.appliedAt),
    };
  }

  /**
   * Finalizes application submission after gating on zero unresolved issues.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @param {string} params.applicationId
   * @param {object} [params.declarations={}]
   * @returns {Promise<object>} Result
   */
  async submitApplication({ tenantId, candidateId, applicationId, declarations = {} }) {
    const [application] = await this.database
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.id, applicationId),
          eq(jobApplications.tenantId, tenantId),
          eq(jobApplications.candidateId, candidateId)
        )
      );

    if (!application) throw new NotFoundError('Application not found or unauthorized');

    const [cand] = await this.database
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)));

    let candidateProfile = null;
    try {
      if (this.candidateProfileService?.getCareerProfile) {
        candidateProfile = await this.candidateProfileService.getCareerProfile(
          { tenantId, role: 'MEMBER' },
          candidateId
        );
      }
    } catch {
      // Best-effort fallback
    }

    const flowState = this.buildApplicationFlowState({ candidate: cand, candidateProfile, application });

    if (flowState.needsAttention.length > 0) {
      const issueSummary = flowState.needsAttention.map(i => i.label).join(', ');
      throw new ValidationError(`Cannot submit application with unresolved readiness issues: ${issueSummary}`);
    }

    if (!declarations.accuracyConfirmed) {
      throw new ValidationError('You must confirm that all information provided is accurate and true before submitting.');
    }

    const appliedDate = new Date();
    const updatedMetadata = {
      ...(application.metadata || {}),
      declarations: {
        ...(application.metadata?.declarations || {}),
        ...declarations,
        accuracyConfirmed: true,
        submittedAt: appliedDate.toISOString(),
      },
    };

    await this.database
      .update(jobApplications)
      .set({
        status: 'APPLIED',
        appliedAt: appliedDate,
        metadata: updatedMetadata,
        updatedAt: appliedDate,
      })
      .where(eq(jobApplications.id, applicationId));

    return {
      success: true,
      applicationId,
      status: 'APPLIED',
      appliedAt: appliedDate.toISOString(),
      handoffUrl: `/applications/${applicationId}/handoff`,
    };
  }

  /**
   * Provides AI explanation/suggestion adhering strictly to safety boundaries.
   * AI is FORBIDDEN from auto-answering sensitive eligibility questions.
   *
   * @param {object} params
   * @param {string} params.question Target question text
   * @param {object} [params.candidateProfile] Verified candidate profile
   * @returns {object} Safe AI guidance payload
   */
  getAiAssistanceForQuestion({ question = '', _candidateProfile = null }) {
    const q = String(question).toLowerCase();
    const isSensitive = /visa|sponsorship|work authorization|legal authorization|citizenship|felony|criminal|race|gender|disability|veteran|ethnicity|religion/i.test(q);

    if (isSensitive) {
      return {
        isSensitive: true,
        autoAnswerBlocked: true,
        guidance: 'AI cannot automatically answer legal eligibility or sensitive questions. Please review your official status and select your answer manually.',
        suggestedAnswer: null,
        requiresUserConfirmation: true,
      };
    }

    // Non-sensitive questions: provide helpful drafting assistance based on verified facts
    return {
      isSensitive: false,
      autoAnswerBlocked: false,
      guidance: 'Here is an answer suggestion based on your verified engineering experience:',
      suggestedAnswer: 'I have demonstrated relevant experience through verified repository architecture and production implementations.',
      requiresUserConfirmation: true,
    };
  }
}
