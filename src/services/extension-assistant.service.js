/**
 * @file Extension Assistant Service
 *
 * Coordinates AI career assistant capabilities for the browser extension thin client
 * while strictly adhering to architectural invariants:
 * 1. Single source of truth: Consumes canonical CandidateProfileService, ApplicationReadinessService,
 *    and AiCareerAssistantService. Never creates a shadow candidate profile architecture.
 * 2. Zero fabrication: Never fabricates skills, experience, education, certifications,
 *    metrics, authorization, salary, or application answers. If unavailable:
 *    "Not available in your verified profile."
 * 3. Safe autofill: Only approved canonical sources, with internal provenance tracking
 *    (source, confidence, evidence, requiresConfirmation). Sensitive fields require confirmation.
 * 4. Failure isolation: Extension remains 100% operational if AI fails.
 * 5. Compactness: Serves the 5 primary UI dimensions without internal diagnostic leakage.
 */

import {
  AutofillFieldPlanSchema,
  AutofillPlanResponseSchema,
  ExplainJobResponseSchema,
  CompareRequirementsResponseSchema,
  ExplainErrorResponseSchema,
  CompactExtensionAssistantContextSchema,
  SENSITIVE_AUTOFILL_FIELDS,
  UNAVAILABLE_IN_VERIFIED_PROFILE_MESSAGE,
} from '../domain/extension/extension-assistant.schemas.js';
import { CandidateProfileService } from './candidate-profile.service.js';
import { ApplicationReadinessService } from './application-readiness.service.js';
import { AiCareerAssistantService } from './ai-career-assistant.service.js';
import { handleAnalyzeJobFit } from '../mcp/tools/career-read-tools.js';
import { sanitizeErrorMessage } from './user-facing-error.sanitizer.js';
import { formatNoticePeriodLabel } from '../domain/candidate/career-preferences.schemas.js';
import { getDefaultAiProvider } from '../clients/ai/ai-provider-factory.js';
import { logger as defaultLogger } from '../utils/logger.js';

export class ExtensionAssistantService {
  /**
   * @param {object} [dependencies={}]
   * @param {CandidateProfileService} [dependencies.candidateProfileService]
   * @param {ApplicationReadinessService} [dependencies.readinessService]
   * @param {AiCareerAssistantService} [dependencies.careerAssistantService]
   * @param {Function} [dependencies.analyzeJobFitTool]
   * @param {object} [dependencies.aiProvider]
   * @param {import('pino').Logger} [dependencies.logger]
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [dependencies.database]
   */
  constructor(dependencies = {}) {
    this.database = dependencies.database;
    this.candidateProfileService =
      dependencies.candidateProfileService || new CandidateProfileService(dependencies.database);
    this.readinessService = dependencies.readinessService || new ApplicationReadinessService();
    this.careerAssistantService =
      dependencies.careerAssistantService ||
      new AiCareerAssistantService({
        candidateProfileService: this.candidateProfileService,
        readinessService: this.readinessService,
        aiProvider: dependencies.aiProvider,
        database: this.database,
      });
    this.analyzeJobFitTool = dependencies.analyzeJobFitTool || handleAnalyzeJobFit;
    this.aiProvider = dependencies.aiProvider !== undefined ? dependencies.aiProvider : null;
    this.logger =
      dependencies.logger || defaultLogger.child({ module: 'ExtensionAssistantService' });
  }

  /**
   * Resolves the active AI provider.
   *
   * @private
   * @returns {object|null}
   */
  _getProvider() {
    if (this.aiProvider !== undefined) {
      return this.aiProvider;
    }
    try {
      return getDefaultAiProvider();
    } catch {
      return null;
    }
  }

  /**
   * Use Case 1: Explain the current job page.
   *
   * @param {object} params
   * @param {object} params.job Detected job payload
   * @returns {Promise<object>} Grounded explanation of the job posting
   */
  async explainJobPage({ job = {} }) {
    const title = job.title || 'Untitled Role';
    const company = job.company || 'Unknown Company';
    const description = (job.description || job.rawText || '').trim();
    const requirements = Array.isArray(job.requirements) ? job.requirements : [];

    const detectedDetails = this.detectRelevantJobInformation({ job });

    // Fallback deterministic summary
    let summary = `Position: ${title} at ${company}.`;
    if (description.length > 50) {
      const firstLines = description
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 20)
        .slice(0, 3)
        .join(' ');
      summary = `${summary} ${firstLines}`;
    }

    const responsibilities = [];
    const keyExpectations = [];

    // Extract core expectations and responsibilities from text
    const descLower = description.toLowerCase();
    const lines = description
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    for (const l of lines) {
      if (/^[•*-]\s+/.test(l) || /^\d+\.\s+/.test(l)) {
        const clean = l.replace(/^[•*-\d.]+\s+/, '').trim();
        if (clean.length > 15 && responsibilities.length < 5) {
          responsibilities.push(clean);
        }
      }
    }

    if (requirements.length > 0) {
      keyExpectations.push(...requirements.slice(0, 6));
    } else if (detectedDetails.coreSkills.length > 0) {
      keyExpectations.push(...detectedDetails.coreSkills.slice(0, 6));
    }

    // Attempt AI refinement if available, failing closed to deterministic output
    let aiAvailable = true;
    const provider = this._getProvider();
    if (provider && description.length > 50) {
      try {
        const prompt = `You are an AI career advisor analyzing a job posting page.
Title: ${title}
Company: ${company}
Description:
${description.slice(0, 3000)}

Requirements:
${requirements.join('\n')}

Provide a concise, 2-3 sentence grounded summary of what this role entails, what team/mission it supports, and primary candidate expectations. Strictly ground all statements in the text provided. Do not hallucinate or guess.`;

        const response = await provider.generateText({
          prompt,
          taskType: 'CAREER_ASSISTANT',
          temperature: 0.1,
        });

        if (response?.text) {
          summary = response.text.trim();
        }
      } catch (err) {
        aiAvailable = false;
        this.logger.warn(
          { err },
          'AI provider failed during explainJobPage; falling back to deterministic explanation'
        );
      }
    } else if (!provider) {
      aiAvailable = false;
    }

    return ExplainJobResponseSchema.parse({
      summary,
      responsibilities:
        responsibilities.length > 0
          ? responsibilities
          : ['Review job description for detailed tasks.'],
      keyExpectations:
        keyExpectations.length > 0
          ? keyExpectations
          : ['Relevant engineering and domain expertise.'],
      detectedDetails,
      groundedInPage: true,
      aiAvailable,
    });
  }

  /**
   * Use Case 2: Detect relevant job information.
   *
   * @param {object} params
   * @param {object} params.job
   * @returns {object} Structured extracted job attributes
   */
  detectRelevantJobInformation({ job = {} }) {
    const title = job.title || 'Untitled Role';
    const company = job.company || 'Unknown Company';
    const location = job.location || null;
    const text = `${title} ${job.description || ''} ${job.rawText || ''}`;

    // 1. Workplace detection
    let workplace = job.workplace || null;
    if (!workplace) {
      if (/\bremote\b/i.test(text)) workplace = 'REMOTE';
      else if (/\bhybrid\b/i.test(text)) workplace = 'HYBRID';
      else if (/\bon-?site\b/i.test(text)) workplace = 'ON_SITE';
    }

    // 2. Employment type detection
    let employmentType = job.employmentType || null;
    if (!employmentType) {
      if (/\bfull-?time\b/i.test(text)) employmentType = 'FULL_TIME';
      else if (/\bcontract\b/i.test(text) || /\bfreelance\b/i.test(text))
        employmentType = 'CONTRACT';
      else if (/\bpart-?time\b/i.test(text)) employmentType = 'PART_TIME';
      else if (/\bintern(?:ship)?\b/i.test(text)) employmentType = 'INTERNSHIP';
    }

    // 3. Compensation detection
    let salaryRange = null;
    const salaryMatch =
      text.match(
        /\$\s*([0-9]{2,3}(?:,[0-9]{3})*(?:\.[0-9]+)?\s*(?:k|usd)?)\s*(?:-|to)\s*\$\s*([0-9]{2,3}(?:,[0-9]{3})*(?:\.[0-9]+)?\s*(?:k|usd)?)/i
      ) ||
      text.match(
        /(?:₹|rs\.?|inr)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:-|to)\s*([0-9]+(?:\.[0-9]+)?)\s*lpa/i
      ) ||
      text.match(/\$\s*([0-9]{2,3}(?:,[0-9]{3})*)\s*(?:\/|\s*per\s*)(?:yr|year|hr|hour)/i);
    if (salaryMatch) {
      salaryRange = salaryMatch[0].trim();
    }

    // 4. Experience level
    let experienceLevel = null;
    if (/\b(?:staff|principal|lead|director|head of)\b/i.test(title)) {
      experienceLevel = 'LEAD_OR_PRINCIPAL';
    } else if (/\bsenior\b|\bsr\.?\b/i.test(title) || /\bsenior\b/i.test(text)) {
      experienceLevel = 'SENIOR';
    } else if (/\bmid(?:-level)?\b/i.test(text)) {
      experienceLevel = 'MID_LEVEL';
    } else if (/\b(?:junior|entry|associate|graduate)\b/i.test(title) || /\bjunior\b/i.test(text)) {
      experienceLevel = 'JUNIOR_OR_ENTRY';
    }

    // 5. Sponsorship / clearance notes
    let sponsorshipNotes = null;
    if (
      /(?:no\s+sponsorship|unable\s+to\s+sponsor|cannot\s+sponsor|sponsorship\s+is\s+not\s+available)/i.test(
        text
      )
    ) {
      sponsorshipNotes = 'Visa sponsorship is not available for this role.';
    } else if (/(?:sponsorship\s+available|will\s+sponsor|sponsorship\s+offered)/i.test(text)) {
      sponsorshipNotes = 'Visa sponsorship is mentioned as available.';
    } else if (/(?:security\s+clearance|ts\/sci|secret\s+clearance)/i.test(text)) {
      sponsorshipNotes = 'Role notes security clearance requirements.';
    }

    // 6. Core skills extraction
    const COMMON_TECH = [
      'javascript',
      'typescript',
      'python',
      'java',
      'go',
      'golang',
      'rust',
      'c++',
      'c#',
      'react',
      'next.js',
      'node.js',
      'vue',
      'angular',
      'fastapi',
      'django',
      'flask',
      'postgresql',
      'postgres',
      'mysql',
      'mongodb',
      'redis',
      'elasticsearch',
      'docker',
      'kubernetes',
      'aws',
      'gcp',
      'azure',
      'graphql',
      'rest',
      'kafka',
      'git',
    ];
    const coreSkills = [];
    const textLower = text.toLowerCase();
    for (const tech of COMMON_TECH) {
      const reg = new RegExp(`\\b${tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (reg.test(textLower)) {
        coreSkills.push(tech);
      }
    }

    return {
      title,
      company,
      location,
      workplace,
      employmentType,
      salaryRange,
      experienceLevel,
      sponsorshipNotes,
      coreSkills,
    };
  }

  /**
   * Use Case 3 & 5: Compare job requirements with the user's profile and explain
   * why each requirement is or is not satisfied.
   *
   * @param {object} params
   * @param {object} params.job
   * @param {object} params.candidateProfile
   * @returns {object} Full comparison with evidence or strict refusal
   */
  compareRequirements({ job = {}, candidateProfile = {} }) {
    const rawReqs = job.requirements || job.skillsRequired || [];
    const reqList = Array.isArray(rawReqs)
      ? rawReqs
      : typeof rawReqs === 'string'
        ? rawReqs.split(',').map((s) => s.trim())
        : [];

    const verifiedSkills = (candidateProfile.verifiedSkills || candidateProfile.skills || []).map(
      (s) =>
        typeof s === 'string' ? s.toLowerCase() : (s.name || s.canonicalName || '').toLowerCase()
    );

    const matches = [];
    let satisfiedCount = 0;
    let missingCount = 0;

    for (const req of reqList) {
      const normReq = String(req).toLowerCase().trim();
      if (!normReq) continue;

      const matched = verifiedSkills.some(
        (v) =>
          v === normReq ||
          (v.length > 2 && normReq.includes(v)) ||
          (normReq.length > 2 && v.includes(normReq))
      );

      if (matched) {
        satisfiedCount++;
        matches.push({
          requirement: req,
          satisfied: true,
          status: 'VERIFIED',
          explanation: `Satisfied: Corroborated in verified profile skills.`,
          evidence: `Candidate verified skills index`,
          source: 'CANONICAL_VERIFIED_SKILLS',
        });
      } else {
        missingCount++;
        matches.push({
          requirement: req,
          satisfied: false,
          status: 'MISSING',
          explanation: UNAVAILABLE_IN_VERIFIED_PROFILE_MESSAGE,
          evidence: null,
          source: 'NONE',
        });
      }
    }

    const summary =
      missingCount === 0 && satisfiedCount > 0
        ? `All ${satisfiedCount} analyzed requirements are substantiated by verified evidence in your profile.`
        : `Verified evidence confirms ${satisfiedCount} requirement(s). ${missingCount} requirement(s) are: ${UNAVAILABLE_IN_VERIFIED_PROFILE_MESSAGE}`;

    return CompareRequirementsResponseSchema.parse({
      totalRequirements: reqList.length,
      satisfiedCount,
      missingCount,
      matches,
      summary,
    });
  }

  /**
   * Use Case 4: Identify missing application information.
   *
   * @param {object} params
   * @param {object} params.candidateProfile
   * @param {object} [params.job]
   * @param {object} [params.applicationAnswers]
   * @returns {Array<object>} Missing items with profile anchors
   */
  identifyMissingInformation({ candidateProfile = {}, job = null, applicationAnswers = {} }) {
    const evaluation = this.readinessService.evaluateReadiness({
      candidateProfile,
      jobPosting: job,
      answers: applicationAnswers,
    });

    const attentionItems = evaluation.items.filter(
      (item) => item.status === 'MISSING' || item.status === 'NEEDS_CONFIRMATION'
    );

    return attentionItems.map((item) => ({
      field: item.field,
      label: item.label,
      status: item.status,
      notes: item.notes || `Please provide or confirm ${item.label}.`,
      profileAnchor: item.profileAnchor || '/profile',
    }));
  }

  /**
   * Use Case 6: Help fill application fields using verified profile data.
   * Safe Autofill:
   * - Autofill only from approved canonical sources.
   * - Internally track: source, confidence, evidence, requiresConfirmation.
   * - Sensitive or high-risk fields require confirmation.
   * - Never fabricates; missing fields output "Not available in your verified profile."
   *
   * @param {object} params
   * @param {Array<object>} params.formFields Detected DOM fields
   * @param {object} params.candidateProfile Canonical candidate profile
   * @returns {object} Safe autofill plan
   */
  generateAutofillPlan({ formFields = [], candidateProfile = {} }) {
    const contact = candidateProfile.contact || {};
    const prefs =
      candidateProfile.jobPreferences || candidateProfile.profileMetadata?.careerPreferences || {};
    const userCustom = candidateProfile.profileMetadata?.userCustom || {};
    const social = candidateProfile.socialLinks || {};

    const mappedFields = [];
    let fillableCount = 0;
    let sensitiveCount = 0;
    let missingCount = 0;

    for (const field of formFields) {
      const rawType = (field.fieldType || field.type || '').toUpperCase();
      const rawName = (field.name || field.id || field.fieldName || '').toLowerCase();
      const label = field.label || field.name || rawType;

      let value = null;
      let source = 'NONE';
      let confidence = 0.0;
      let evidence = UNAVAILABLE_IN_VERIFIED_PROFILE_MESSAGE;
      let isSensitive = false;
      let requiresConfirmation = false;
      let available = false;
      let unavailabilityReason = null;

      // 1. Identity
      if (
        rawType === 'FIRST_NAME' ||
        rawName.includes('first_name') ||
        rawName.includes('firstname')
      ) {
        const val =
          contact.firstName ||
          (candidateProfile.displayName ? candidateProfile.displayName.split(' ')[0] : null);
        if (val) {
          value = val;
          source = 'CANONICAL_PROFILE_IDENTITY';
          confidence = 1.0;
          evidence = 'Canonical Candidate Profile Display Name / Contact First Name';
          available = true;
        }
      } else if (
        rawType === 'LAST_NAME' ||
        rawName.includes('last_name') ||
        rawName.includes('lastname')
      ) {
        const val =
          contact.lastName ||
          (candidateProfile.displayName
            ? candidateProfile.displayName.split(' ').slice(1).join(' ')
            : null);
        if (val) {
          value = val;
          source = 'CANONICAL_PROFILE_IDENTITY';
          confidence = 1.0;
          evidence = 'Canonical Candidate Profile Display Name / Contact Last Name';
          available = true;
        }
      } else if (rawType === 'FULL_NAME' || rawName === 'name' || rawName.includes('fullname')) {
        const val =
          candidateProfile.displayName ||
          `${contact.firstName || ''} ${contact.lastName || ''}`.trim() ||
          null;
        if (val) {
          value = val;
          source = 'CANONICAL_PROFILE_IDENTITY';
          confidence = 1.0;
          evidence = 'Canonical Candidate Profile Display Name';
          available = true;
        }
      }

      // 2. Contact
      else if (rawType === 'EMAIL' || rawName.includes('email')) {
        const val = candidateProfile.canonicalEmail || contact.email || null;
        if (val) {
          value = val;
          source = 'CANONICAL_PROFILE_CONTACT';
          confidence = 1.0;
          evidence = 'Canonical Candidate Email';
          available = true;
        }
      } else if (rawType === 'PHONE' || rawName.includes('phone') || rawName.includes('mobile')) {
        const val = contact.phone || contact.nationalNumber || null;
        if (val) {
          value = val;
          source = 'CANONICAL_PROFILE_CONTACT';
          confidence = 1.0;
          evidence = 'Candidate Contact Phone Number';
          available = true;
        }
      }

      // 3. Social / Portfolio Links
      else if (rawType === 'LINKEDIN_URL' || rawName.includes('linkedin')) {
        const val = social.linkedin || contact.linkedin || null;
        if (val) {
          value = val;
          source = 'CANONICAL_PROFILE_CONTACT';
          confidence = 1.0;
          evidence = 'Candidate Verified Profile Social Links (LinkedIn)';
          available = true;
        }
      } else if (rawType === 'GITHUB_URL' || rawName.includes('github')) {
        const val = social.github || contact.github || null;
        if (val) {
          value = val;
          source = 'CANONICAL_PROFILE_CONTACT';
          confidence = 1.0;
          evidence = 'Candidate Verified Profile Social Links (GitHub)';
          available = true;
        }
      } else if (
        rawType === 'PORTFOLIO_URL' ||
        rawName.includes('portfolio') ||
        rawName.includes('website')
      ) {
        const val = social.portfolio || candidateProfile.portfolioUrl || contact.portfolio || null;
        if (val) {
          value = val;
          source = 'CANONICAL_PROFILE_CONTACT';
          confidence = 1.0;
          evidence = 'Candidate Portfolio URL';
          available = true;
        }
      }

      // 4. Location / Address
      else if (rawType === 'CITY' || rawName.includes('city')) {
        const val = contact.city || null;
        if (val) {
          value = val;
          source = 'CANONICAL_PROFILE_CONTACT';
          confidence = 1.0;
          evidence = 'Candidate Contact Address (City)';
          available = true;
        }
      } else if (rawType === 'STATE' || rawName.includes('state')) {
        const val = contact.state || null;
        if (val) {
          value = val;
          source = 'CANONICAL_PROFILE_CONTACT';
          confidence = 1.0;
          evidence = 'Candidate Contact Address (State)';
          available = true;
        }
      } else if (
        rawType === 'POSTAL_CODE' ||
        rawName.includes('postal') ||
        rawName.includes('zip')
      ) {
        const val = contact.postalCode || null;
        if (val) {
          value = val;
          source = 'CANONICAL_PROFILE_CONTACT';
          confidence = 1.0;
          evidence = 'Candidate Contact Address (Postal Code)';
          available = true;
        }
      }

      // 5. Notice Period / Availability (Non-sensitive, but structured)
      else if (
        rawType === 'NOTICE_PERIOD' ||
        rawName.includes('notice') ||
        rawName.includes('availability')
      ) {
        const val = prefs.noticePeriod || userCustom.noticePeriod || null;
        if (val) {
          value = formatNoticePeriodLabel(val, prefs.customNoticePeriod);
          source = 'CANONICAL_CAREER_PREFERENCES';
          confidence = 0.95;
          evidence = 'Career Preferences Notice Period';
          available = true;
        }
      }

      // 6. Sensitive / High-Risk Fields (STRICT CONFIRMATION REQUIRED)
      else if (
        rawType === 'WORK_AUTHORIZATION' ||
        rawName.includes('authorized') ||
        rawName.includes('work_auth') ||
        rawName.includes('citizenship')
      ) {
        isSensitive = true;
        requiresConfirmation = true;
        sensitiveCount++;
        const val = prefs.workAuthorization || userCustom.workAuthorization || null;
        if (val) {
          value = Array.isArray(val) ? val.join(', ') : String(val);
          source = 'CANONICAL_CAREER_PREFERENCES';
          confidence = 0.95;
          evidence = 'Career Preferences Work Authorization (User Declared)';
          available = true;
        }
      } else if (
        rawType === 'VISA_SPONSORSHIP' ||
        rawName.includes('sponsor') ||
        rawName.includes('visa')
      ) {
        isSensitive = true;
        requiresConfirmation = true;
        sensitiveCount++;
        const val = prefs.visaSponsorshipRequired ?? userCustom.visaSponsorshipRequired ?? null;
        if (val !== null && val !== undefined) {
          const strVal = String(val).trim().toUpperCase();
          value =
            strVal === 'YES' || val === true
              ? 'Yes'
              : strVal === 'NO' || val === false
                ? 'No'
                : String(val);
          source = 'CANONICAL_CAREER_PREFERENCES';
          confidence = 0.95;
          evidence = 'Career Preferences Visa Sponsorship (User Declared)';
          available = true;
        }
      } else if (
        rawType === 'SALARY_EXPECTATION' ||
        rawType === 'SALARY_FLOOR' ||
        rawName.includes('salary') ||
        rawName.includes('compensation')
      ) {
        isSensitive = true;
        requiresConfirmation = true;
        sensitiveCount++;
        const val = prefs.salaryFloor || prefs.targetSalary || userCustom.salaryFloor || null;
        if (val) {
          value = typeof val === 'number' ? val.toLocaleString() : String(val);
          source = 'CANONICAL_CAREER_PREFERENCES';
          confidence = 0.9;
          evidence = 'Career Preferences Minimum Compensation / Floor';
          available = true;
        }
      } else if (
        SENSITIVE_AUTOFILL_FIELDS.includes(rawType) ||
        rawName.includes('declaration') ||
        rawName.includes('signature') ||
        rawName.includes('disability') ||
        rawName.includes('veteran') ||
        rawName.includes('criminal')
      ) {
        isSensitive = true;
        requiresConfirmation = true;
        sensitiveCount++;
      }

      // Final verification: if value is missing or unevidenced, enforce strict refusal
      if (!available || value === null || value === undefined) {
        value = null;
        available = false;
        confidence = 0.0;
        source = 'NONE';
        evidence = UNAVAILABLE_IN_VERIFIED_PROFILE_MESSAGE;
        unavailabilityReason = UNAVAILABLE_IN_VERIFIED_PROFILE_MESSAGE;
        missingCount++;
      } else {
        fillableCount++;
      }

      mappedFields.push(
        AutofillFieldPlanSchema.parse({
          fieldName: field.name || field.id || rawType,
          fieldType: rawType,
          label,
          value,
          source,
          confidence,
          evidence,
          requiresConfirmation,
          isSensitive,
          available,
          unavailabilityReason,
        })
      );
    }

    const status =
      missingCount > 0 ? 'INCOMPLETE' : sensitiveCount > 0 ? 'NEEDS_CONFIRMATION' : 'READY';

    return AutofillPlanResponseSchema.parse({
      mappedFields,
      fillableCount,
      sensitiveCount,
      missingCount,
      status,
    });
  }

  /**
   * Use Case 7: Detect conflicts before submission.
   *
   * @param {object} params
   * @param {object} params.candidateProfile
   * @param {object} params.applicationAnswers
   * @param {object} [params.job]
   * @returns {Array<object>} Pre-submission conflicts
   */
  detectSubmissionConflicts({ candidateProfile = {}, applicationAnswers = {}, job = null }) {
    return this.careerAssistantService.identifyProfileConflicts({
      candidateProfile,
      applicationAnswers,
    });
  }

  /**
   * Use Case 8: Help the user understand application errors.
   *
   * @param {object} params
   * @param {string|object} params.error Error thrown during submission or validation
   * @param {object} [params.context] Additional context
   * @returns {object} Clean, humanized explanation and recovery steps
   */
  explainApplicationError({ error, _context = {} }) {
    const rawMessage =
      typeof error === 'string' ? error : error?.message || 'Application submission failed';
    const sanitized = sanitizeErrorMessage(rawMessage);

    let errorCategory = 'SUBMISSION_ERROR';
    let humanSummary = sanitized;
    const recoverySteps = [];
    let suggestedAction = 'Review application fields and try again.';
    let isRetryable = true;

    if (/unauthorized|session|login|authenticated/i.test(rawMessage)) {
      errorCategory = 'AUTHENTICATION_REQUIRED';
      humanSummary = 'Your session has expired or requires sign in before continuing.';
      recoverySteps.push('Sign in to AI Careers Hub in the web portal or extension.');
      recoverySteps.push('Your detected job and progress will be preserved.');
      suggestedAction = 'Sign in to your account';
    } else if (/required|missing|incomplete/i.test(rawMessage)) {
      errorCategory = 'VALIDATION_ERROR';
      humanSummary = 'The application form is missing one or more required fields.';
      recoverySteps.push('Check the highlighted required fields on the portal form.');
      recoverySteps.push(
        'Complete the missing answers or use Safe Autofill for verified profile fields.'
      );
      suggestedAction = 'Fill in the required fields';
    } else if (/network|offline|econnrefused|fetch/i.test(rawMessage)) {
      errorCategory = 'NETWORK_ERROR';
      humanSummary = 'Could not reach the server or application portal due to a connection issue.';
      recoverySteps.push('Verify your internet connection.');
      recoverySteps.push('Ensure the AI Careers Hub service is running.');
      recoverySteps.push('Retry submission in a few moments without losing your data.');
      suggestedAction = 'Retry submission';
    } else if (/file|resume|format|pdf|upload|size/i.test(rawMessage)) {
      errorCategory = 'DOCUMENT_UPLOAD_ERROR';
      humanSummary =
        'The application portal encountered an issue processing your resume or attachment.';
      recoverySteps.push('Ensure your resume is a standard PDF under 5MB.');
      recoverySteps.push('Download the tailored PDF from your Handoff Kit and re-upload.');
      suggestedAction = 'Re-upload verified resume PDF';
    } else {
      recoverySteps.push('Confirm all screening answers are accurate.');
      recoverySteps.push('Review the pre-submission readiness checklist.');
      recoverySteps.push('Retry submitting the application.');
    }

    return ExplainErrorResponseSchema.parse({
      humanSummary,
      recoverySteps,
      suggestedAction,
      isRetryable,
      errorCategory,
    });
  }

  /**
   * Builds the compact 5-dimension primary UI payload.
   *
   * @param {object} params
   * @param {object} params.job Detected job
   * @param {Array<object>} [params.formFields] Detected DOM form fields
   * @param {object} [params.applicationAnswers]
   * @param {object} params.candidateProfile Canonical candidate profile
   * @param {string} [params.tenantId]
   * @param {string} [params.userId]
   * @returns {Promise<object>} Compact UI context
   */
  async getCompactContext({
    job = {},
    formFields = [],
    applicationAnswers = {},
    candidateProfile = {},
    tenantId,
    userId,
  }) {
    // 1. Job Match (Fit analysis)
    let jobMatch = {
      score: null,
      band: 'UNASSESSED',
      matchedSkills: [],
      missingSkills: [],
      summary: 'ATS match analysis has not yet been performed for this job.',
    };

    try {
      const fitResult = await this.analyzeJobFitTool(
        {
          jobDescription: job.description || job.rawText || `${job.title} at ${job.company}`,
          candidateId: candidateProfile.id,
        },
        {
          tenantId: tenantId || candidateProfile.tenantId,
          userId: userId || candidateProfile.userId,
          database: this.database,
        }
      );

      if (fitResult?.atsScore) {
        jobMatch = {
          score: Number.isFinite(fitResult.atsScore.overallScore)
            ? fitResult.atsScore.overallScore
            : null,
          band: fitResult.atsScore.matchBand || 'UNASSESSED',
          matchedSkills: (fitResult.requirementMatches || [])
            .filter((m) => m.matchStatus === 'MATCHED')
            .map((m) => m.normalizedRequirement || m.originalRequirement)
            .filter(Boolean)
            .slice(0, 5),
          missingSkills: (fitResult.requirementMatches || [])
            .filter((m) => m.matchStatus === 'MISSING')
            .map((m) => m.normalizedRequirement || m.originalRequirement)
            .filter(Boolean)
            .slice(0, 5),
          summary: fitResult.atsScore.summary || 'Job fit match calculated from verified skills.',
        };
      }
    } catch {
      // Fallback to rule comparison if ATS tool throws
      const comp = this.compareRequirements({ job, candidateProfile });
      jobMatch = {
        score:
          comp.totalRequirements > 0
            ? Math.round((comp.satisfiedCount / comp.totalRequirements) * 100)
            : null,
        band:
          comp.totalRequirements > 0
            ? comp.satisfiedCount > 0
              ? 'RECOMMENDED'
              : 'NOT_RECOMMENDED'
            : 'UNASSESSED',
        matchedSkills: comp.matches
          .filter((m) => m.satisfied)
          .map((m) => m.requirement)
          .slice(0, 5),
        missingSkills: comp.matches
          .filter((m) => !m.satisfied)
          .map((m) => m.requirement)
          .slice(0, 5),
        summary: comp.summary,
      };
    }

    // 2. Application Readiness
    const readinessEval = this.careerAssistantService.summarizeApplicationReadiness({
      candidateProfile,
      answers: applicationAnswers,
      jobPosting: job,
    });

    const applicationReadiness = {
      readinessScore: readinessEval.overallReadinessScore,
      status: readinessEval.profileComplete ? 'READY' : 'NEEDS_ATTENTION',
      profileComplete: readinessEval.profileComplete,
      summary:
        readinessEval.attentionCount === 0
          ? 'Profile is 100% ready for application submission.'
          : `${readinessEval.attentionCount} item(s) require your review before applying.`,
    };

    // 3. Missing Information
    const missingInformation = this.identifyMissingInformation({
      candidateProfile,
      job,
      applicationAnswers,
    });

    // 4. Conflicts
    const conflicts = this.detectSubmissionConflicts({
      candidateProfile,
      applicationAnswers,
      job,
    });

    // 5. AI Help (with Failure Isolation)
    let aiHelp = {
      available: true,
      overview: `Role: ${job.title || 'Role'} at ${job.company || 'Company'}.`,
      quickActions: ['Explain Job', 'Check Requirements', 'Safe Autofill', 'Explain Error'],
      errorGuidance: null,
      fallbackNotice: null,
    };

    const provider = this._getProvider();
    if (!provider) {
      aiHelp.available = false;
      aiHelp.fallbackNotice =
        'The AI assistant is temporarily unavailable. Job match, readiness, and manual application remain fully accessible.';
    }

    try {
      const jobExplanation = await this.explainJobPage({ job });
      aiHelp.overview = jobExplanation.summary;
      if (jobExplanation.aiAvailable === false) {
        aiHelp.available = false;
        aiHelp.fallbackNotice =
          'The AI assistant is temporarily unavailable. Job match, readiness, and manual application remain fully accessible.';
      }
    } catch (err) {
      this.logger.warn(
        { err },
        'AI service unavailable in getCompactContext; failing closed gracefully'
      );
      aiHelp = {
        available: false,
        overview: `Role: ${job.title || 'Role'} at ${job.company || 'Company'}.`,
        quickActions: ['Safe Autofill', 'Check Readiness'],
        errorGuidance: null,
        fallbackNotice:
          'The AI assistant is temporarily unavailable. Job match, readiness, and manual application remain fully accessible.',
      };
    }

    // 6. Optional Safe Autofill Plan
    let autofillPlan = undefined;
    if (Array.isArray(formFields) && formFields.length > 0) {
      autofillPlan = this.generateAutofillPlan({ formFields, candidateProfile });
    }

    return CompactExtensionAssistantContextSchema.parse({
      jobMatch,
      applicationReadiness,
      missingInformation,
      conflicts,
      aiHelp,
      autofillPlan,
    });
  }
}

export default ExtensionAssistantService;
