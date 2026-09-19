/**
 * @file AI Career Assistant Service (P87 Phase 1)
 *
 * Implements the first AI Career Assistant layer on top of the existing career architecture.
 *
 * Core Non-Negotiable Invariants:
 * 1. AI is NOT a source of truth.
 * 2. The canonical candidate profile remains authoritative (CandidateProfileService).
 * 3. The existing evidence/provenance system remains authoritative (CandidateFactInventoryService, EvidenceItem).
 * 4. The deterministic ATS/job-match engine remains authoritative (AtsFitScoreService).
 * 5. The ApplicationReadinessService remains authoritative for readiness.
 *
 * AI May:
 * - Explain profile fields and why information is needed
 * - Identify missing information
 * - Explain job requirements
 * - Summarize application readiness
 * - Suggest profile improvements (grounded in verified facts)
 * - Suggest resume wording (preserving authentic facts)
 * - Identify possible profile conflicts (without choosing one)
 * - Propose profile updates (strictly requiring explicit user confirmation)
 * - Help users navigate the portal
 *
 * AI May NOT Silently:
 * - Invent experience, skills, metrics, certifications, or employment
 * - Change work authorization or sponsorship requirements
 * - Change salary expectations without proposal and confirmation
 * - Submit an application
 * - Modify canonical profile data without explicit confirmation
 *
 * AI Failure:
 * - The portal must remain fully usable if AI fails.
 */

import crypto from 'node:crypto';
import { ApplicationReadinessService } from './application-readiness.service.js';
import { CandidateProfileService } from './candidate-profile.service.js';
import {
  SafeUpdateProposalSchema,
  ProfileConflictSchema,
  AssistantMessageSchema,
  PROHIBITED_AUTO_MUTATION_FIELDS,
  CANONICAL_PORTAL_ROUTES,
  COPILOT_PAGE_CONTEXTS,
  CopilotPageContextSchema,
  normalizeCopilotPageContext,
  SUPPORTED_PRODUCT_ACTION_IDS,
  SupportedProductActionIdSchema,
  StructuredAssistantResponseSchema,
  TRUSTED_ACTION_NAVIGATION_MAP,
} from '../domain/ai/career-assistant.schemas.js';
import {
  normalizeNoticePeriod,
  formatNoticePeriodLabel,
} from '../domain/candidate/career-preferences.schemas.js';
import { ValidationError, NotFoundError } from '../errors/index.js';
import { logger as defaultLogger } from '../utils/logger.js';
import { getDefaultAiProvider } from '../clients/ai/ai-provider-factory.js';

export class AiCareerAssistantService {
  /**
   * @param {object} [dependencies={}]
   * @param {CandidateProfileService} [dependencies.candidateProfileService]
   * @param {ApplicationReadinessService} [dependencies.readinessService]
   * @param {object} [dependencies.aiProvider]
   * @param {import('pino').Logger} [dependencies.logger]
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [dependencies.database]
   */
  constructor(dependencies = {}) {
    this.candidateProfileService =
      dependencies.candidateProfileService || new CandidateProfileService(dependencies.database);
    this.readinessService =
      dependencies.readinessService || new ApplicationReadinessService();
    this.aiProvider = dependencies.aiProvider !== undefined ? dependencies.aiProvider : null;
    this.logger = dependencies.logger || defaultLogger.child({ module: 'AiCareerAssistantService' });
    this.database = dependencies.database;
    this.pendingProposals = new Map();
  }

  /**
   * Saves a pending proposal awaiting explicit user confirmation.
   *
   * @param {string} tenantId
   * @param {string} candidateId
   * @param {object} proposal
   */
  savePendingProposal(tenantId, candidateId, proposal) {
    if (!tenantId || !candidateId || !proposal) return;
    const key = `${tenantId}:${candidateId}`;
    const list = this.pendingProposals.get(key) || [];
    const filtered = list.filter((p) => p.id !== proposal.id && p.field !== proposal.field);
    filtered.push(proposal);
    this.pendingProposals.set(key, filtered);
  }

  /**
   * Retrieves all pending proposals for a candidate.
   *
   * @param {string} tenantId
   * @param {string} candidateId
   * @returns {Array<object>}
   */
  getPendingProposals(tenantId, candidateId) {
    if (!tenantId || !candidateId) return [];
    const key = `${tenantId}:${candidateId}`;
    return this.pendingProposals.get(key) || [];
  }

  /**
   * Removes a pending proposal (after confirmation or dismissal).
   *
   * @param {string} tenantId
   * @param {string} candidateId
   * @param {string} proposalId
   */
  removePendingProposal(tenantId, candidateId, proposalId) {
    if (!tenantId || !candidateId || !proposalId) return;
    const key = `${tenantId}:${candidateId}`;
    const list = this.pendingProposals.get(key) || [];
    const filtered = list.filter((p) => p.id !== proposalId);
    this.pendingProposals.set(key, filtered);
  }

  /**
   * Resolves the active AI provider.
   *
   * @private
   * @returns {object|null}
   */
  _getProvider() {
    if (this.aiProvider !== null && this.aiProvider !== undefined) {
      return this.aiProvider;
    }
    try {
      return getDefaultAiProvider();
    } catch {
      return null;
    }
  }

  /**
   * Sanitizes route paths and raw URLs from text, converting them to user-friendly section names.
   * Hard P90 invariant: AI responses must never expose internal route paths or URLs.
   *
   * @param {string} text
   * @returns {string}
   */
  _sanitizeNoRoutes(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/\/apps\/radar/gi, 'Job Radar')
      .replace(/\/profile#eligibility/gi, 'Profile Eligibility section')
      .replace(/\/profile#basics/gi, 'Profile Basics section')
      .replace(/\/profile#roles/gi, 'Profile Roles section')
      .replace(/\/profile#compensation/gi, 'Profile Compensation section')
      .replace(/\/profile#skills/gi, 'Profile Skills section')
      .replace(/\/profile#experience/gi, 'Profile Experience section')
      .replace(/\/profile#education/gi, 'Profile Education section')
      .replace(/\/profile/gi, 'Profile settings')
      .replace(/\/resumes/gi, 'Resumes section')
      .replace(/\/sources/gi, 'Connected Sources')
      .replace(/\/applications/gi, 'Applications section')
      .replace(/\/connect/gi, 'AI Connect & Tokens')
      .replace(/\/dashboard/gi, 'Dashboard');
  }

  /**
   * Parses and safely normalizes structured AI responses.
   * If parsing fails or output is malformed, uses deterministic fallback data.
   *
   * @param {string} rawText
   * @param {string} userText
   * @param {object} fallbackContext
   * @returns {object} Validated StructuredAssistantResponse
   */
  _parseStructuredResponse(rawText, userText, fallbackContext = {}) {
    const { readinessData, profile, connectedRepositories = [] } = fallbackContext;
    const score = typeof readinessData?.overallScore === 'number'
      ? readinessData.overallScore
      : typeof readinessData?.score === 'number'
        ? readinessData.score
        : null;
    const missingItems = readinessData?.missingItems || [];

    let parsed = null;

    if (rawText && typeof rawText === 'string') {
      try {
        let clean = rawText.trim();
        if (clean.startsWith('```')) {
          clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
        }
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      } catch (err) {
        this.logger.debug({ err }, 'Failed to parse raw JSON from AI assistant output');
      }
    }

    // Validate using Zod schema
    const validation = StructuredAssistantResponseSchema.safeParse(parsed);
    if (validation.success) {
      const data = validation.data;
      const sanitizedSummary = this._sanitizeNoRoutes(data.summary).slice(0, 350);
      const sanitizedFindings = data.findings.slice(0, 5).map((f) => ({
        severity: f.severity,
        title: this._sanitizeNoRoutes(f.title).slice(0, 120),
        description: this._sanitizeNoRoutes(f.description).slice(0, 300),
      }));
      let primaryFound = false;
      const validActions = data.actions
        .filter((a) => SUPPORTED_PRODUCT_ACTION_IDS.includes(a.id))
        .slice(0, 3)
        .map((a, idx) => {
          const isPrimary = a.primary === true || (!primaryFound && idx === 0);
          if (isPrimary) primaryFound = true;
          return {
            id: a.id,
            label: this._sanitizeNoRoutes(a.label).slice(0, 60),
            primary: isPrimary,
          };
        });

      return {
        summary: sanitizedSummary,
        findings: sanitizedFindings,
        actions: validActions,
      };
    }

    // Safe normalization attempt if partial object
    if (parsed && typeof parsed === 'object') {
      const summaryText = typeof parsed.summary === 'string'
        ? this._sanitizeNoRoutes(parsed.summary).slice(0, 350)
        : (typeof parsed.answer === 'string' || typeof parsed.message === 'string')
          ? this._sanitizeNoRoutes(parsed.answer || parsed.message).slice(0, 350)
          : null;

      if (summaryText) {
        const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
        const validFindings = rawFindings.slice(0, 5).map((f) => ({
          severity: ['critical', 'warning', 'info'].includes(f.severity) ? f.severity : 'info',
          title: this._sanitizeNoRoutes(String(f.title || 'Note')).slice(0, 120),
          description: this._sanitizeNoRoutes(String(f.description || f.detail || '')).slice(0, 300),
        }));

        const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [];
        let primaryFound = false;
        const validActions = rawActions
          .filter((a) => a && SUPPORTED_PRODUCT_ACTION_IDS.includes(a.id))
          .slice(0, 3)
          .map((a, idx) => {
            const isPrimary = a.primary === true || (!primaryFound && idx === 0);
            if (isPrimary) primaryFound = true;
            return {
              id: a.id,
              label: this._sanitizeNoRoutes(String(a.label || 'View details')).slice(0, 60),
              primary: isPrimary,
            };
          });

        return {
          summary: summaryText,
          findings: validFindings,
          actions: validActions.length > 0 ? validActions : [{ id: 'complete_profile', label: 'Complete profile', primary: true }],
        };
      }
    }

    // Deterministic authority: if query is about blockers or readiness, prioritize deterministic findings
    if (/block|ready|readiness|missing/i.test(userText)) {
      const isAssessed = typeof score === 'number';
      return {
        summary: isAssessed
          ? (missingItems.length > 0
            ? `Your profile is at ${score}% application readiness with ${missingItems.length} screening item${missingItems.length > 1 ? 's' : ''} needing attention.`
            : `Your profile is at ${score}% application readiness with all essential screening fields verified.`)
          : (missingItems.length > 0
            ? `Application readiness has not been assessed yet; ${missingItems.length} screening item${missingItems.length > 1 ? 's need' : ' needs'} attention.`
            : `Application readiness evaluation is currently unavailable. Review your profile to calculate readiness.`),
        findings: missingItems.slice(0, 5).map((m) => ({
          severity: 'warning',
          title: m.label || 'Screening Item',
          description: this._sanitizeNoRoutes(m.notes || 'Required for employer screening.'),
        })),
        actions: [
          { id: 'complete_profile', label: 'Complete profile', primary: true },
          { id: 'check_readiness', label: 'Check readiness', primary: false },
        ],
      };
    }

    // Safe normalization if AI returned non-JSON plain text
    if (!parsed && rawText && typeof rawText === 'string' && rawText.trim().length > 0) {
      const cleanText = this._sanitizeNoRoutes(rawText.trim()).slice(0, 350);
      return {
        summary: cleanText,
        findings: [
          {
            severity: 'info',
            title: 'Guidance',
            description: cleanText,
          },
        ],
        actions: [{ id: 'complete_profile', label: 'Review profile', primary: true }],
      };
    }

    const isAssessed = typeof score === 'number';
    return {
      summary: 'Career Copilot evaluated your request against your verified profile and workspace context.',
      findings: [
        {
          severity: 'info',
          title: 'Workspace Status',
          description: isAssessed
            ? `Application readiness is currently at ${score}%. ${connectedRepositories.length} repository source${connectedRepositories.length === 1 ? ' is' : 's are'} connected.`
            : `Application readiness is currently NOT_ASSESSED. ${connectedRepositories.length} repository source${connectedRepositories.length === 1 ? ' is' : 's are'} connected.`,
        },
      ],
      actions: [
        { id: 'complete_profile', label: 'Review profile' },
        { id: 'view_matching_jobs', label: 'View matching jobs' },
      ],
    };
  }

  /**
   * Explains a specific profile field, its relevance in technical hiring / ATS,
   * and guidance on how to complete it.
   *
   * @param {string} fieldKey
   * @returns {{ field: string, label: string, explanation: string, atsImpact: string, navigationAnchor: string }}
   */
  explainProfileField(fieldKey) {
    const rawKey = String(fieldKey || '').toLowerCase().trim();
    let key = rawKey.replace(/\s+/g, '');

    if (rawKey.includes('notice') || rawKey.includes('availability')) {
      key = 'noticeperiod';
    } else if (rawKey.includes('salary') || rawKey.includes('compensation')) {
      key = 'salaryfloor';
    } else if (rawKey.includes('role') || rawKey.includes('title')) {
      key = 'targetroles';
    } else if (rawKey.includes('sponsor')) {
      key = 'visasponsorshiprequired';
    } else if (rawKey.includes('work auth') || rawKey.includes('authorization') || rawKey.includes('citizenship')) {
      key = 'workauthorization';
    } else if (rawKey.includes('remote') || rawKey.includes('hybrid') || rawKey.includes('work mode')) {
      key = 'remotepreference';
    } else if (rawKey.includes('skill')) {
      key = 'skills';
    } else if (rawKey.includes('headline')) {
      key = 'headline';
    }

    const FIELD_EXPLANATIONS = {
      noticeperiod: {
        field: 'noticePeriod',
        label: 'Notice Period & Availability',
        explanation:
          'Your notice period tells recruiters when you can realistically join. Having a structured availability (e.g. Immediate, 30 days, 60 days) prevents interview delays and sets mutual expectations.',
        atsImpact:
          'Applicant Tracking Systems (ATS) and hiring teams frequently filter candidates by joining timeline. Immediate or standard 30-day notice profiles receive faster screening calls.',
        navigationAnchor: '/profile#tab-eligibility',
      },
      salaryfloor: {
        field: 'salaryFloor',
        label: 'Minimum Compensation Floor',
        explanation:
          'The minimum compensation floor prevents you from being matched with roles below your acceptable threshold. It is kept private to your profile and used solely for radar filtering.',
        atsImpact:
          'Ensures you are only alerted to roles meeting your baseline compensation, saving time for both you and hiring managers.',
        navigationAnchor: '/profile#tab-preferences',
      },
      targetroles: {
        field: 'targetRoles',
        label: 'Target Job Titles',
        explanation:
          'Target roles represent the professional positions you are actively pursuing (e.g., Backend Engineer, Full-Stack Developer, DevOps Engineer).',
        atsImpact:
          'The ATS matching engine normalizes your target roles against job titles in open requisitions to compute initial title alignment scores.',
        navigationAnchor: '/profile#tab-preferences',
      },
      workauthorization: {
        field: 'workAuthorization',
        label: 'Work Authorization Status',
        explanation:
          'Your legal eligibility to work in your target countries (e.g., Citizen, Permanent Resident, Work Visa). This is sensitive legal information and must always be confirmed directly by you.',
        atsImpact:
          'Nearly all corporate ATS screening questionnaires include mandatory work eligibility knockout questions.',
        navigationAnchor: '/profile#tab-eligibility',
      },
      visasponsorshiprequired: {
        field: 'visaSponsorshipRequired',
        label: 'Visa Sponsorship Requirements',
        explanation:
          'Indicates whether you currently or in the future will require visa sponsorship to work for an employer in your target location.',
        atsImpact:
          'Many companies have strict policies regarding visa sponsorship. An honest tri-state declaration (YES / NO / UNKNOWN) avoids late-stage offer complications.',
        navigationAnchor: '/profile#tab-eligibility',
      },
      skills: {
        field: 'skills',
        label: 'Verified Technical Skills',
        explanation:
          'Skills in this platform are backed by verifiable evidence from your connected repositories and code commits, rather than unevidenced keywords.',
        atsImpact:
          'Evidence-backed skills provide higher credibility in technical evaluations, showing concrete repo links and commit histories to hiring managers.',
        navigationAnchor: '/skills',
      },
      headline: {
        field: 'headline',
        label: 'Professional Headline',
        explanation:
          'A concise one-line summary of your technical identity, core stack, and engineering focus (e.g., "Senior Backend Engineer | Node.js, Go & Distributed Systems").',
        atsImpact:
          'Recruiters spend an average of 6 seconds scanning a profile; a focused headline immediately communicates your core specialization.',
        navigationAnchor: '/profile#tab-professional',
      },
      remotepreference: {
        field: 'remotePreference',
        label: 'Work Mode Preference',
        explanation:
          'Specifies whether you are seeking remote-only, hybrid, or on-site roles, helping filter opportunities to match your lifestyle.',
        atsImpact:
          'Prevents irrelevant outreach from recruiters hiring strictly on-site in non-target geographies.',
        navigationAnchor: '/profile#tab-preferences',
      },
    };

    return (
      FIELD_EXPLANATIONS[key] || {
        field: fieldKey,
        label: fieldKey,
        explanation: `Field "${fieldKey}" is an important part of your canonical career profile. Keeping it accurate improves job matching and ATS readiness.`,
        atsImpact: 'Accurate profile data enables deterministic ATS scoring without guesswork.',
        navigationAnchor: '/profile',
      }
    );
  }

  /**
   * Identifies missing profile information by consuming ApplicationReadinessService.
   *
   * @param {object} params
   * @param {object} params.candidateProfile Canonical candidate career profile
   * @returns {{ missingCount: number, missingItems: Array<object>, readinessScore: number, guidance: string }}
   */
  identifyMissingInformation({ candidateProfile }) {
    if (!candidateProfile) {
      return {
        missingCount: 1,
        missingItems: [
          {
            field: 'profile',
            label: 'Candidate Profile',
            status: 'MISSING',
            notes: 'Profile data not loaded.',
            profileAnchor: '/profile',
          },
        ],
        readinessScore: null,
        guidance: 'Please set up your candidate profile to enable readiness evaluation.',
      };
    }

    const { items, semantics } = this.readinessService.evaluateReadiness({
      candidateProfile,
    });

    const missingItems = items.filter(
      (item) => item.status === 'MISSING' || item.status === 'NEEDS_CONFIRMATION'
    );

    const guidance =
      missingItems.length === 0
        ? 'Your profile is complete and ready for job applications! All primary readiness criteria are satisfied.'
        : `Your profile has ${missingItems.length} item(s) needing attention before applications can be prepared with maximum readiness: ${missingItems.map((m) => m.label).join(', ')}.`;

    const readyItems = items.filter((item) => item.status === 'READY');
    const computedScore = items.length > 0 ? Math.round((readyItems.length / items.length) * 100) : 0;

    return {
      missingCount: missingItems.length,
      missingItems,
      readinessScore: semantics.overallReadinessScore ?? computedScore,
      guidance,
    };
  }

  /**
   * Summarizes application readiness for a target job or generic application.
   *
   * @param {object} params
   * @param {object} params.candidateProfile
   * @param {object} [params.applicationPackage]
   * @param {object} [params.answers]
   * @param {object} [params.jobPosting]
   * @returns {object} Authoritative readiness evaluation
   */
  summarizeApplicationReadiness({
    candidateProfile,
    applicationPackage = null,
    answers = null,
    jobPosting = null,
  }) {
    const evaluation = this.readinessService.evaluateReadiness({
      candidateProfile,
      applicationPackage,
      answers,
      jobPosting,
    });

    const readyItems = evaluation.items.filter((i) => i.status === 'READY');
    const attentionItems = evaluation.items.filter(
      (i) => i.status === 'MISSING' || i.status === 'NEEDS_CONFIRMATION' || i.hasConflict
    );

    const computedScore =
      evaluation.items.length > 0 ? Math.round((readyItems.length / evaluation.items.length) * 100) : 0;

    return {
      authoritative: true,
      profileComplete: evaluation.semantics.profileComplete,
      readyCount: readyItems.length,
      attentionCount: attentionItems.length,
      readyItems: readyItems.map((i) => ({ field: i.field, label: i.label })),
      attentionItems: attentionItems.map((i) => ({
        field: i.field,
        label: i.label,
        status: i.status,
        notes: i.notes,
        anchor: i.profileAnchor,
      })),
      overallReadinessScore: evaluation.semantics.overallReadinessScore ?? computedScore,
      rawEvaluation: evaluation,
    };
  }

  /**
   * Explains job requirements, comparing required vs candidate verified skills.
   *
   * @param {object} params
   * @param {object} params.job
   * @param {object} params.candidateProfile
   * @returns {object} Requirement breakdown with evidence citations
   */
  explainJobRequirements({ job = {}, candidateProfile = {} }) {
    const jobTitle = job.title || job.jobTitle || 'Target Role';
    const company = job.company || job.companyName || 'Company';
    const rawReqs = job.requirements || job.skillsRequired || [];

    const verifiedSkillsList =
      candidateProfile.verifiedSkills ||
      candidateProfile.verifiedSkillsSummary ||
      candidateProfile.skills ||
      [];

    const verifiedSkillNames = new Set(
      verifiedSkillsList.map((s) => (typeof s === 'string' ? s : s.name || s.canonicalName || '').toLowerCase())
    );

    const verifiedMatches = [];
    const missingRequirements = [];

    const reqList = Array.isArray(rawReqs)
      ? rawReqs
      : typeof rawReqs === 'string'
        ? rawReqs.split(',').map((s) => s.trim())
        : [];

    for (const req of reqList) {
      const normReq = String(req).toLowerCase().trim();
      if (!normReq) continue;

      if (verifiedSkillNames.has(normReq)) {
        verifiedMatches.push({
          requirement: req,
          status: 'VERIFIED',
          source: {
            type: 'REPOSITORY_CODE',
            label: `Verified in candidate skills: ${req}`,
            verified: true,
          },
        });
      } else {
        missingRequirements.push({
          requirement: req,
          status: 'MISSING',
          message: `I can't verify "${req}" from your profile or connected repositories.`,
        });
      }
    }

    return {
      jobTitle,
      company,
      totalRequirements: reqList.length,
      verifiedMatches,
      missingRequirements,
      summary:
        missingRequirements.length === 0
          ? `You have verified evidence for all ${verifiedMatches.length} analyzed requirements!`
          : `You have verified evidence for ${verifiedMatches.length} requirement(s), but ${missingRequirements.length} requirement(s) cannot be verified from your profile: ${missingRequirements.map((m) => m.requirement).join(', ')}.`,
    };
  }

  /**
   * Detects conflicts between candidate profile data and application answers or resume.
   *
   * @param {object} params
   * @param {object} params.candidateProfile
   * @param {object} [params.applicationAnswers]
   * @param {object} [params.resumeFacts]
   * @returns {Array<object>} Detected conflicts with resolution options
   */
  identifyProfileConflicts({ candidateProfile = {}, applicationAnswers = {}, _resumeFacts = null }) {
    const conflicts = [];

    const prefs =
      candidateProfile.jobPreferences ||
      candidateProfile.profileMetadata?.careerPreferences ||
      {};
    const userCustom = candidateProfile.profileMetadata?.userCustom || {};

    // 1. Notice Period Conflict
    const profileNotice = prefs.noticePeriod || userCustom.noticePeriod;
    const appNotice =
      applicationAnswers.noticePeriod ||
      applicationAnswers['notice_period'] ||
      applicationAnswers.availability;

    if (profileNotice && appNotice) {
      const normProfileNotice = normalizeNoticePeriod(profileNotice);
      const normAppNotice = normalizeNoticePeriod(appNotice);

      if (normProfileNotice && normAppNotice && normProfileNotice !== normAppNotice) {
        conflicts.push({
          field: 'noticePeriod',
          fieldLabel: 'Notice Period',
          profileValue: formatNoticePeriodLabel(normProfileNotice, prefs.customNoticePeriod),
          applicationValue: formatNoticePeriodLabel(normAppNotice),
          notes: `Conflict detected: Your profile specifies "${formatNoticePeriodLabel(normProfileNotice)}", but this application specifies "${formatNoticePeriodLabel(normAppNotice)}".`,
          resolutionOptions: ['KEEP_PROFILE', 'USE_APPLICATION', 'EDIT_PROFILE'],
        });
      }
    }

    // 2. Work Authorization Conflict
    const profileWorkAuth =
      prefs.workAuthorization || userCustom.workAuthorization;
    const appWorkAuth =
      applicationAnswers.workAuthorization ||
      applicationAnswers['work_authorization'] ||
      applicationAnswers.citizenship;

    if (profileWorkAuth && appWorkAuth) {
      const pVal = Array.isArray(profileWorkAuth) ? profileWorkAuth.join(', ') : String(profileWorkAuth);
      const aVal = String(appWorkAuth);
      if (pVal.toLowerCase() !== aVal.toLowerCase() && !pVal.toLowerCase().includes(aVal.toLowerCase())) {
        conflicts.push({
          field: 'workAuthorization',
          fieldLabel: 'Work Authorization',
          profileValue: pVal,
          applicationValue: aVal,
          notes: `Conflict detected: Your profile specifies "${pVal}", but this application specifies "${aVal}".`,
          resolutionOptions: ['KEEP_PROFILE', 'USE_APPLICATION', 'EDIT_PROFILE'],
        });
      }
    }

    // 3. Target Role / Title Conflict
    const profileRoles = prefs.targetRoles || [];
    const appRole = applicationAnswers.desiredRole || applicationAnswers.targetRole;
    if (profileRoles.length > 0 && appRole) {
      const hasMatch = profileRoles.some((r) =>
        r.toLowerCase().includes(String(appRole).toLowerCase())
      );
      if (!hasMatch) {
        conflicts.push({
          field: 'targetRoles',
          fieldLabel: 'Desired Role',
          profileValue: profileRoles.join(', '),
          applicationValue: appRole,
          notes: `Conflict detected: Your profile target roles are "${profileRoles.join(', ')}", but application specifies "${appRole}".`,
          resolutionOptions: ['KEEP_PROFILE', 'USE_APPLICATION', 'EDIT_PROFILE'],
        });
      }
    }

    return conflicts;
  }

  /**
   * Suggests evidence-grounded profile improvements.
   * If a skill is unevidenced or candidate attempts to add unevidenced skills,
   * refuses with "I can't verify this from your profile."
   *
   * @param {object} params
   * @param {object} params.candidateProfile
   * @param {Array<object>} [params.factInventory]
   * @param {string} [params.requestedSkill] Skill requested to be checked or added
   * @returns {object} Suggestions with evidence sources
   */
  suggestProfileImprovements({
    candidateProfile = {},
    factInventory = [],
    requestedSkill = null,
  }) {
    if (requestedSkill) {
      const normRequested = String(requestedSkill).toLowerCase().trim();
      const verifiedFacts = (Array.isArray(factInventory) ? factInventory : []).filter(
        (f) =>
          (f.text && f.text.toLowerCase().includes(normRequested)) ||
          (f.canonicalName && f.canonicalName.toLowerCase().includes(normRequested)) ||
          (f.skillName && f.skillName.toLowerCase().includes(normRequested))
      );

      const verifiedSkills = (candidateProfile.verifiedSkills || []).filter((s) => {
        const sName = typeof s === 'string' ? s : s.name || s.canonicalName || '';
        return sName.toLowerCase().includes(normRequested);
      });

      if (verifiedFacts.length === 0 && verifiedSkills.length === 0) {
        return {
          canAdd: false,
          skill: requestedSkill,
          verified: false,
          message: `I can't verify "${requestedSkill}" from your profile or connected repositories. Do not guess. The system strictly prohibits adding unevidenced skills.`,
        };
      }

      return {
        canAdd: true,
        skill: requestedSkill,
        verified: true,
        evidenceCount: verifiedFacts.length + verifiedSkills.length,
        message: `Verified evidence found for "${requestedSkill}" in your profile and repository artifacts.`,
      };
    }

    // General improvement recommendations based on canonical readiness
    const { missingItems } = this.identifyMissingInformation({ candidateProfile });
    const suggestions = [];

    for (const m of missingItems) {
      suggestions.push({
        type: 'MISSING_FIELD',
        field: m.field,
        label: m.label,
        suggestion: `Add your ${m.label} to complete application readiness.`,
        anchor: m.profileAnchor,
      });
    }

    return {
      totalSuggestions: suggestions.length,
      suggestions,
    };
  }

  /**
   * Suggests resume bullet wording improvements without inventing metrics, skills, or employment.
   *
   * @param {object} params
   * @param {string} params.bulletText Original bullet text
   * @param {string} [params.targetRole] Target role context
   * @param {Array<number>} [params.knownMetrics] Legitimate metrics present in candidate facts
   * @returns {object} Improved wording preserving authentic metrics
   */
  suggestResumeWording({ bulletText = '', _targetRole = '', knownMetrics = [] }) {
    const raw = String(bulletText).trim();
    if (!raw) {
      throw new ValidationError('bulletText is required to suggest resume wording.');
    }

    // Extract numbers from original text
    const originalNumbers = raw.match(/\d+(?:\.\d+)?/g) || [];

    // Check if input contains request to invent unsupported metrics
    const asksToInventMetric =
      /say i improved|say i reduced by \d+%|pretend|make up a metric|invent/i.test(raw);

    if (asksToInventMetric) {
      return {
        safe: false,
        rejected: true,
        originalText: raw,
        suggestedText: null,
        message:
          "I can't verify this metric from your profile. Exaggerated or invented metrics violate verification standards and will be blocked by the integrity gate.",
      };
    }

    // Improve phrasing using strong engineering action verbs while strictly preserving facts
    let improved = raw;
    if (/^worked on/i.test(improved)) {
      improved = improved.replace(/^worked on/i, 'Engineered');
    } else if (/^helped with/i.test(improved)) {
      improved = improved.replace(/^helped with/i, 'Collaborated on developing');
    } else if (/^was responsible for/i.test(improved)) {
      improved = improved.replace(/^was responsible for/i, 'Architected and maintained');
    } else if (!/^[A-Z][a-z]+ed\b/.test(improved)) {
      improved = `Implemented ${improved.charAt(0).toLowerCase()}${improved.slice(1)}`;
    }

    return {
      safe: true,
      rejected: false,
      originalText: raw,
      suggestedText: improved,
      preservedMetrics: originalNumbers,
      evidenceGrounded: true,
      message:
        'Suggested phrasing uses active engineering action verbs while preserving your authentic facts and numbers.',
    };
  }

  /**
   * Parses candidate natural language intent and creates a SafeUpdateProposal.
   *
   * @param {object} params
   * @param {string} params.userInput Candidate chat message
   * @param {object} [params.candidateProfile] Current candidate profile
   * @returns {object} Structured proposals with confirmation requirements
   */
  proposeProfileUpdates({ userInput = '', candidateProfile = null }) {
    const text = String(userInput).trim();
    const proposals = [];
    const profile = candidateProfile || {};

    const existingPrefs =
      profile.jobPreferences ||
      profile.profileMetadata?.careerPreferences ||
      {};

    // 1. Role Parsing
    const roleMatch =
      text.match(/(?:looking for|target role|seeking|want)\s+(?:a\s+)?([a-zA-Z\s]+?)(?:jobs?|roles?|positions?|with|and|at|in|\.|$)/i) ||
      text.match(/(?:backend|frontend|fullstack|full-stack|devops|data engineer|cloud engineer)/i);

    if (roleMatch) {
      let role = (roleMatch[1] || roleMatch[0]).trim();
      // Clean role
      role = role.replace(/\b(?:remote|options|jobs?|roles?|positions?)\b/gi, '').trim();
      if (role.toLowerCase() === 'backend') role = 'Backend Engineer';
      if (role.toLowerCase() === 'frontend') role = 'Frontend Engineer';
      if (role.toLowerCase() === 'fullstack' || role.toLowerCase() === 'full-stack') role = 'Full-Stack Engineer';
      if (role.toLowerCase() === 'devops') role = 'DevOps Engineer';

      if (role.length > 2) {
        proposals.push(
          SafeUpdateProposalSchema.parse({
            id: crypto.randomUUID(),
            category: 'JOB_PREFERENCES',
            field: 'targetRoles',
            fieldLabel: 'Target role',
            currentValue: existingPrefs.targetRoles || [],
            proposedValue: [role],
            evidence: {
              type: 'USER_INPUT',
              label: 'User conversational request',
              quote: text,
              verified: false,
            },
            reason: `User requested target role update: "${role}"`,
            status: 'PROPOSED',
            requiresUserConfirmation: true,
            createdAt: new Date().toISOString(),
          })
        );
      }
    }

    // 2. Remote / Work Mode Parsing
    if (/remote(?:\s+options|\s+only)?/i.test(text)) {
      proposals.push(
        SafeUpdateProposalSchema.parse({
          id: crypto.randomUUID(),
          category: 'JOB_PREFERENCES',
          field: 'remotePreference',
          fieldLabel: 'Work mode',
          currentValue: existingPrefs.remotePreference || null,
          proposedValue: 'REMOTE_ONLY',
          evidence: {
            type: 'USER_INPUT',
            label: 'User conversational request',
            quote: text,
            verified: false,
          },
          reason: 'User requested remote work mode',
          status: 'PROPOSED',
          requiresUserConfirmation: true,
          createdAt: new Date().toISOString(),
        })
      );
    } else if (/hybrid/i.test(text)) {
      proposals.push(
        SafeUpdateProposalSchema.parse({
          id: crypto.randomUUID(),
          category: 'JOB_PREFERENCES',
          field: 'remotePreference',
          fieldLabel: 'Work mode',
          currentValue: existingPrefs.remotePreference || null,
          proposedValue: 'HYBRID',
          evidence: {
            type: 'USER_INPUT',
            label: 'User conversational request',
            quote: text,
            verified: false,
          },
          reason: 'User requested hybrid work mode',
          status: 'PROPOSED',
          requiresUserConfirmation: true,
          createdAt: new Date().toISOString(),
        })
      );
    }

    // 3. Compensation Parsing (e.g. "₹10 LPA", "10 LPA", "$120k", "1500000")
    const lpaMatch = text.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*lpa/i);
    const dollarMatch = text.match(/\$\s*(\d+(?:,\d+)?)\s*(?:k|usd)?/i);

    if (lpaMatch) {
      const lpaNum = parseFloat(lpaMatch[1]);
      const rawAmount = Math.round(lpaNum * 100000);
      proposals.push(
        SafeUpdateProposalSchema.parse({
          id: crypto.randomUUID(),
          category: 'JOB_PREFERENCES',
          field: 'salaryFloor',
          fieldLabel: 'Minimum compensation',
          currentValue: existingPrefs.salaryFloor ? `₹${existingPrefs.salaryFloor}` : null,
          proposedValue: rawAmount,
          evidence: {
            type: 'USER_INPUT',
            label: 'User conversational request',
            quote: text,
            verified: false,
          },
          reason: `User requested minimum compensation of ₹${lpaNum} LPA (${rawAmount.toLocaleString('en-IN')})`,
          status: 'PROPOSED',
          requiresUserConfirmation: true,
          createdAt: new Date().toISOString(),
        })
      );
      proposals.push(
        SafeUpdateProposalSchema.parse({
          id: crypto.randomUUID(),
          category: 'JOB_PREFERENCES',
          field: 'salaryCurrency',
          fieldLabel: 'Salary Currency',
          currentValue: existingPrefs.salaryCurrency || null,
          proposedValue: 'INR',
          evidence: {
            type: 'USER_INPUT',
            label: 'User conversational request',
            quote: text,
            verified: false,
          },
          reason: 'Derived currency from LPA specification',
          status: 'PROPOSED',
          requiresUserConfirmation: true,
          createdAt: new Date().toISOString(),
        })
      );
    } else if (dollarMatch) {
      const amtStr = dollarMatch[1].replace(/,/g, '');
      let amount = parseFloat(amtStr);
      if (/k/i.test(dollarMatch[0])) amount *= 1000;

      proposals.push(
        SafeUpdateProposalSchema.parse({
          id: crypto.randomUUID(),
          category: 'JOB_PREFERENCES',
          field: 'salaryFloor',
          fieldLabel: 'Minimum compensation',
          currentValue: existingPrefs.salaryFloor ? `$${existingPrefs.salaryFloor}` : null,
          proposedValue: amount,
          evidence: {
            type: 'USER_INPUT',
            label: 'User conversational request',
            quote: text,
            verified: false,
          },
          reason: `User requested minimum compensation of $${amount.toLocaleString()}`,
          status: 'PROPOSED',
          requiresUserConfirmation: true,
          createdAt: new Date().toISOString(),
        })
      );
      proposals.push(
        SafeUpdateProposalSchema.parse({
          id: crypto.randomUUID(),
          category: 'JOB_PREFERENCES',
          field: 'salaryCurrency',
          fieldLabel: 'Salary Currency',
          currentValue: existingPrefs.salaryCurrency || null,
          proposedValue: 'USD',
          evidence: {
            type: 'USER_INPUT',
            label: 'User conversational request',
            quote: text,
            verified: false,
          },
          reason: 'Derived currency from USD symbol',
          status: 'PROPOSED',
          requiresUserConfirmation: true,
          createdAt: new Date().toISOString(),
        })
      );
    }

    // 4. Notice Period Parsing
    if (/immediate|available immediately/i.test(text)) {
      proposals.push(
        SafeUpdateProposalSchema.parse({
          id: crypto.randomUUID(),
          category: 'JOB_PREFERENCES',
          field: 'noticePeriod',
          fieldLabel: 'Notice period',
          currentValue: existingPrefs.noticePeriod || null,
          proposedValue: 'immediate',
          evidence: {
            type: 'USER_INPUT',
            label: 'User conversational request',
            quote: text,
            verified: false,
          },
          reason: 'User requested immediate availability',
          status: 'PROPOSED',
          requiresUserConfirmation: true,
          createdAt: new Date().toISOString(),
        })
      );
    } else if (/30\s*days?/i.test(text)) {
      proposals.push(
        SafeUpdateProposalSchema.parse({
          id: crypto.randomUUID(),
          category: 'JOB_PREFERENCES',
          field: 'noticePeriod',
          fieldLabel: 'Notice period',
          currentValue: existingPrefs.noticePeriod || null,
          proposedValue: '30_days',
          evidence: {
            type: 'USER_INPUT',
            label: 'User conversational request',
            quote: text,
            verified: false,
          },
          reason: 'User requested 30-day notice period',
          status: 'PROPOSED',
          requiresUserConfirmation: true,
          createdAt: new Date().toISOString(),
        })
      );
    }

    // Format human-friendly preview
    let previewMessage = '';
    if (proposals.length > 0) {
      const lines = ['I can update your job preferences:\n'];
      for (const p of proposals) {
        let displayVal = p.proposedValue;
        if (p.field === 'salaryFloor') {
          displayVal =
            p.proposedValue >= 100000 && proposals.some((pr) => pr.field === 'salaryCurrency' && pr.proposedValue === 'INR')
              ? `₹${(p.proposedValue / 100000).toFixed(0)} LPA`
              : `$${p.proposedValue.toLocaleString()}`;
        } else if (p.field === 'remotePreference') {
          displayVal = p.proposedValue === 'REMOTE_ONLY' ? 'Remote' : 'Hybrid';
        } else if (p.field === 'noticePeriod') {
          displayVal = formatNoticePeriodLabel(p.proposedValue);
        } else if (Array.isArray(displayVal)) {
          displayVal = displayVal.join(', ');
        }
        if (p.field !== 'salaryCurrency') {
          lines.push(`${p.fieldLabel}: ${displayVal}`);
        }
      }
      lines.push('\nI won\'t change your profile until you confirm.');
      previewMessage = lines.join('\n');
    }

    return {
      proposals,
      hasProposals: proposals.length > 0,
      previewMessage,
    };
  }

  /**
   * Applies a proposed update to the canonical profile AFTER explicit user confirmation.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.userId
   * @param {string} params.candidateId
   * @param {object} params.proposal Validated SafeUpdateProposal
   * @param {boolean} params.confirmedByUser User confirmation status
   * @param {object} [params.context] Trusted context
   * @returns {Promise<object>} Result
   */
  async applyProposal({
    tenantId,
    userId,
    candidateId,
    proposal,
    confirmedByUser = false,
    context = null,
  }) {
    if (!confirmedByUser) {
      throw new ValidationError(
        'Cannot modify canonical profile data without explicit user confirmation. Action blocked by safety gate.'
      );
    }

    let targetProposal = typeof proposal === 'object' ? proposal : null;
    if (!targetProposal || !targetProposal.field) {
      const pId = typeof proposal === 'string' ? proposal : proposal?.id;
      const pending = this.getPendingProposals(tenantId, candidateId);
      targetProposal = pending.find((p) => p.id === pId);
    }

    if (!targetProposal || !targetProposal.field) {
      throw new ValidationError('Valid proposal object is required.');
    }

    const field = String(targetProposal.field).trim();

    // Guardrail: verify field is not prohibited for direct mutation
    if (PROHIBITED_AUTO_MUTATION_FIELDS.includes(field) && field !== 'salaryFloor') {
      throw new ValidationError(
        `Field "${field}" cannot be modified by AI proposal. Please edit this field directly on your profile.`
      );
    }

    const ctx = context || { tenantId, userId, role: 'MEMBER' };

    // Build preference update payload
    const prefUpdate = {};
    prefUpdate[field] = targetProposal.proposedValue;

    if (field === 'salaryFloor' && targetProposal.currency) {
      prefUpdate.salaryCurrency = targetProposal.currency;
    }

    const updated = await this.candidateProfileService.updateCareerPreferences(
      ctx,
      candidateId,
      prefUpdate
    );

    if (tenantId && candidateId && targetProposal.id) {
      this.removePendingProposal(tenantId, candidateId, targetProposal.id);
    }

    this.logger.info(
      { tenantId, candidateId, proposalId: targetProposal.id, field },
      'Safe update proposal applied to canonical profile after user confirmation'
    );

    return {
      success: true,
      proposalId: targetProposal.id,
      status: 'APPLIED',
      field,
      updatedValue: targetProposal.proposedValue,
      appliedAt: new Date().toISOString(),
      updatedPreferences: updated,
    };
  }

  /**
   * Blocks automatic application submission from the assistant.
   *
   * @returns {object}
   */
  submitApplicationIntent() {
    return {
      blocked: true,
      canSubmit: false,
      reason:
        'AI is strictly prohibited from submitting job applications automatically. Please review your complete application package and confirm your legal declarations on the application review screen.',
      actionUrl: '/applications',
    };
  }

  /**
   * Provides portal navigation assistance.
   *
   * @param {string} query
   * @returns {Array<{ label: string, path: string, description: string }>}
   */
  navigatePortal(query = '') {
    const q = String(query).toLowerCase();
    const suggestions = [];

    if (/preference|salary|compensation|remote|role|location/i.test(q)) {
      suggestions.push(CANONICAL_PORTAL_ROUTES.PREFERENCES);
    }
    if (/eligibility|notice|visa|sponsorship|work auth/i.test(q)) {
      suggestions.push(CANONICAL_PORTAL_ROUTES.ELIGIBILITY);
    }
    if (/skill|technology|stack/i.test(q)) {
      suggestions.push(CANONICAL_PORTAL_ROUTES.SKILLS);
    }
    if (/project|code|repo|github/i.test(q)) {
      suggestions.push(CANONICAL_PORTAL_ROUTES.PROJECTS);
      suggestions.push(CANONICAL_PORTAL_ROUTES.SOURCES);
    }
    if (/resume|upload|claim/i.test(q)) {
      suggestions.push(CANONICAL_PORTAL_ROUTES.RESUMES);
    }
    if (/radar|ats|match|fit/i.test(q)) {
      suggestions.push(CANONICAL_PORTAL_ROUTES.RADAR);
    }
    if (/application|pipeline|applied|track/i.test(q)) {
      suggestions.push(CANONICAL_PORTAL_ROUTES.APPLICATIONS);
    }

    if (suggestions.length === 0) {
      suggestions.push(CANONICAL_PORTAL_ROUTES.PROFILE);
      suggestions.push(CANONICAL_PORTAL_ROUTES.OVERVIEW);
    }

    return suggestions;
  }

  /**
   * Handles user conversational messages, orchestrating intent, evidence grounding,
   * proposal creation, and graceful degradation upon AI failure.
   *
   * @param {object} params
   * @param {string} params.message User chat message
   * @param {string} params.tenantId
   * @param {string} params.userId
   * @param {string} params.candidateId
   * @param {object} [params.candidateProfile] Full career profile
   * @param {object} [params.applicationAnswers] Active application screening answers
   * @param {object} [params.context]
   * @param {object} [params.readiness] Authoritative application readiness evaluation
   * @param {Array<object>} [params.connectedRepositories=[]] Connected repository resources
   * @param {Array<object>} [params.candidateSkills=[]] Candidate verified skills
   * @param {Array<object>} [params.applications=[]] Active tracked applications
   * @param {Array<object>} [params.resumes=[]] Active candidate resumes
   * @returns {Promise<object>} Assistant response payload
   */
  async handleUserMessage({
    message = '',
    tenantId,
    userId,
    candidateId,
    candidateProfile = null,
    applicationAnswers = {},
    context = null,
    readiness = null,
    connectedRepositories = [],
    candidateSkills = [],
    applications = [],
    resumes = [],
    pageContext = 'dashboard',
  }) {
    const userText = String(message).trim();
    if (!userText) {
      throw new ValidationError('Message cannot be empty.');
    }

    // Normalize pageContext to exact canonical context
    const validPageContext = normalizeCopilotPageContext(pageContext);

    // 1. Fetch candidate profile if not provided
    let profile = candidateProfile;
    if (!profile && candidateId && tenantId) {
      try {
        const ctx = context || { tenantId, userId, role: 'MEMBER' };
        profile = await this.candidateProfileService.getCareerProfile(ctx, candidateId);
      } catch (err) {
        this.logger.warn({ err, candidateId }, 'Could not load career profile for assistant');
      }
    }

    // Derive or consume authoritative application readiness
    let readinessData = readiness;
    if (!readinessData && profile) {
      try {
        readinessData = this.identifyMissingInformation({ candidateProfile: profile });
      } catch {
        readinessData = null;
      }
    }

    // 2. Safety Gate: Check for automatic application submission attempt
    if (/submit (?:my |the )?(?:application|job)|apply for me|submit to/i.test(userText)) {
      const submissionBlock = this.submitApplicationIntent();
      return {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: submissionBlock.reason,
        structuredResponse: {
          summary: submissionBlock.reason,
          findings: [
            {
              severity: 'critical',
              title: 'Automated Submission Blocked',
              description: 'External job submission requires explicit candidate review and submission.',
            },
          ],
          actions: [{ id: 'review_applications', label: 'Review applications' }],
        },
        timestamp: new Date().toISOString(),
        citations: [],
        proposals: [],
        conflicts: [],
        navigationSuggestions: [CANONICAL_PORTAL_ROUTES.APPLICATIONS],
        state: 'SUCCESS',
      };
    }

    // 3. Check for proposal generation intent (e.g. "I'm looking for backend jobs with remote options and at least ₹10 LPA")
    const proposalResult = this.proposeProfileUpdates({
      userInput: userText,
      candidateProfile: profile,
    });

    if (proposalResult.hasProposals) {
      if (tenantId && candidateId) {
        for (const p of proposalResult.proposals) {
          this.savePendingProposal(tenantId, candidateId, p);
        }
      }
      return {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: proposalResult.previewMessage,
        structuredResponse: {
          summary: 'I prepared suggested profile updates based on your request. Please confirm before they take effect.',
          findings: proposalResult.proposals.slice(0, 5).map((p) => ({
            severity: 'info',
            title: p.fieldLabel || p.field,
            description: `Proposed: ${String(p.proposedValue)}. Requires your explicit confirmation.`,
          })),
          actions: [{ id: 'complete_profile', label: 'Review profile' }],
        },
        timestamp: new Date().toISOString(),
        citations: [
          {
            type: 'USER_INPUT',
            label: 'Candidate chat instruction',
            quote: userText,
            verified: false,
          },
        ],
        proposals: proposalResult.proposals,
        conflicts: [],
        navigationSuggestions: [CANONICAL_PORTAL_ROUTES.PREFERENCES],
        state: 'SUCCESS',
      };
    }

    // 4. Check for conflict detection intent
    if (/conflict|mismatch|discrepancy|notice period conflict/i.test(userText)) {
      const conflicts = this.identifyProfileConflicts({
        candidateProfile: profile,
        applicationAnswers,
      });

      if (conflicts.length > 0) {
        const conflictLines = conflicts.map(
          (c) => `• ${c.fieldLabel}: Profile states "${c.profileValue}", but application states "${c.applicationValue}".`
        );
        return {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `I identified ${conflicts.length} profile conflict(s):\n\n${conflictLines.join('\n')}\n\nPlease review these differences and confirm which value you intend to use. I will not choose one for you.`,
          structuredResponse: {
            summary: `I identified ${conflicts.length} profile discrepancy between your profile and application answers.`,
            findings: conflicts.slice(0, 5).map((c) => ({
              severity: 'warning',
              title: c.fieldLabel,
              description: `Profile states "${c.profileValue}", but application answers state "${c.applicationValue}".`,
            })),
            actions: [{ id: 'complete_profile', label: 'Complete profile' }],
          },
          timestamp: new Date().toISOString(),
          citations: [
            {
              type: 'EXISTING_PROFILE',
              label: 'Canonical Candidate Profile',
              verified: true,
            },
            {
              type: 'APPLICATION',
              label: 'Application Answers',
              verified: false,
            },
          ],
          proposals: [],
          conflicts,
          navigationSuggestions: [CANONICAL_PORTAL_ROUTES.ELIGIBILITY],
          state: 'SUCCESS',
        };
      } else {
        return {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'No conflicts detected between your canonical profile and application answers.',
          structuredResponse: {
            summary: 'No conflicts detected between your canonical profile and application answers.',
            findings: [],
            actions: [{ id: 'check_readiness', label: 'Check readiness' }],
          },
          timestamp: new Date().toISOString(),
          citations: [],
          proposals: [],
          conflicts: [],
          navigationSuggestions: [],
          state: 'SUCCESS',
        };
      }
    }

    // 5. Check for profile field explanation intent (e.g. "explain notice period", "why do you need my salary floor")
    const explainMatch = !/readiness|blocking|ready/i.test(userText) && userText.match(/(?:explain|why do you need|what is|tell me about)\s+([a-zA-Z\s]+)/i);
    if (explainMatch) {
      const targetTerm = explainMatch[1].replace(/field|my|\?|\./g, '').trim();
      const explanation = this.explainProfileField(targetTerm);
      return {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `**${explanation.label}**\n\n${explanation.explanation}\n\n*ATS & Hiring Relevance:* ${explanation.atsImpact}`,
        structuredResponse: {
          summary: explanation.explanation.slice(0, 250),
          findings: [
            {
              severity: 'info',
              title: explanation.label,
              description: this._sanitizeNoRoutes(explanation.atsImpact).slice(0, 300),
            },
          ],
          actions: [{ id: 'complete_profile', label: 'Complete profile' }],
        },
        timestamp: new Date().toISOString(),
        citations: [],
        proposals: [],
        conflicts: [],
        navigationSuggestions: [
          {
            label: `Go to ${explanation.label}`,
            path: explanation.navigationAnchor,
          },
        ],
        state: 'SUCCESS',
      };
    }

    // 6. Check for resume wording / phrasing intent
    if (/rephrase|improve wording|better way to say|rewrite/i.test(userText)) {
      const wordingResult = this.suggestResumeWording({
        bulletText: userText,
      });

      if (wordingResult.rejected) {
        return {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: wordingResult.message,
          structuredResponse: {
            summary: wordingResult.message.slice(0, 250),
            findings: [
              {
                severity: 'warning',
                title: 'Wording Review Notice',
                description: 'We cannot rewrite statements containing unsubstantiated claims or missing evidence.',
              },
            ],
            actions: [{ id: 'review_resume', label: 'Review resume' }],
          },
          timestamp: new Date().toISOString(),
          citations: [],
          proposals: [],
          conflicts: [],
          navigationSuggestions: [],
          state: 'SUCCESS',
        };
      }

      return {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Here is a suggested phrasing based on your authentic facts:\n\n"${wordingResult.suggestedText}"\n\n${wordingResult.message}`,
        structuredResponse: {
          summary: `Suggested phrasing: "${wordingResult.suggestedText.slice(0, 200)}"`,
          findings: [
            {
              severity: 'info',
              title: 'Evidence-Grounded Phrasing',
              description: this._sanitizeNoRoutes(wordingResult.message).slice(0, 300),
            },
          ],
          actions: [{ id: 'review_resume', label: 'Review resume' }, { id: 'tailor_resume', label: 'Tailor resume' }],
        },
        timestamp: new Date().toISOString(),
        citations: [
          {
            type: 'USER_INPUT',
            label: 'Original Candidate Bullet',
            quote: wordingResult.originalText,
            verified: false,
          },
        ],
        proposals: [],
        conflicts: [],
        navigationSuggestions: [CANONICAL_PORTAL_ROUTES.RESUMES],
        state: 'SUCCESS',
      };
    }

    // 7. Navigation query
    const navSuggestions = this.navigatePortal(userText);

    // 8. Evidence-grounded response via active AI provider (with rich application context)
    const provider = this._getProvider();
    if (provider) {
      try {
        const missingInfo = readinessData?.missingItems ? readinessData : this.identifyMissingInformation({ candidateProfile: profile });
        const missingItems = missingInfo.missingItems || [];
        const readinessScore = typeof readinessData?.overallScore === 'number'
          ? readinessData.overallScore
          : typeof readinessData?.score === 'number'
            ? readinessData.score
            : typeof missingInfo?.readinessScore === 'number'
              ? missingInfo.readinessScore
              : null;

        const contextSummary = [
          `Active Page Context: ${validPageContext}`,
          `Candidate Name: ${profile?.candidate?.displayName || profile?.displayName || 'Candidate'}`,
          `Headline: ${profile?.candidate?.headline || profile?.headline || 'Software Engineer'}`,
          `Application Readiness: ${typeof readinessScore === 'number' ? `${readinessScore}%` : 'UNKNOWN (Readiness evaluation unavailable)'}`,
          `Deterministic Blockers / Missing Screening Items: ${missingItems.map((i) => i.label).join(', ') || 'None'}`,
          `Target Roles: ${(profile?.targetRoles || []).join(', ') || 'Not specified'}`,
          `Preferred Locations: ${(profile?.preferredLocations || []).join(', ') || 'Not specified'}`,
          `Work Authorization: ${profile?.workAuthorization || 'Not specified'}`,
          `Visa Sponsorship: ${profile?.visaSponsorshipRequired === true ? 'Required' : profile?.visaSponsorshipRequired === false ? 'Not required' : 'Not set'}`,
          `Verified Skills: ${(candidateSkills.length > 0 ? candidateSkills.map((s) => s.name) : (profile?.skills || [])).slice(0, 15).join(', ') || 'None'}`,
          `Connected GitHub Repositories: ${connectedRepositories.length > 0 ? connectedRepositories.map((r) => r.displayName || r.url).slice(0, 10).join(', ') : 'None provided'}`,
          `Tracked Applications: ${applications.length > 0 ? applications.map((a) => `${a.jobTitle} at ${a.companyName} (${a.status})`).join(', ') : 'None provided'}`,
          `Resumes: ${resumes.length > 0 ? resumes.map((r) => `${r.fileName} (${r.status})`).join(', ') : 'None provided'}`,
        ].join('\n');

        const prompt = `You are Career Copilot, an integrated, context-aware career workspace assistant.

APPLICATION CONTEXT:
${contextSummary}

USER QUERY:
"${userText}"

SAFETY & GROUNDING CONSTRAINTS:
1. Ground your response strictly in the candidate's authentic profile, connected repositories, and application data provided above.
2. If the user asks about skills, experience, or certifications NOT verified in their profile or repositories, state clearly: "I can't verify this from your profile." Never invent facts or qualifications.
3. If information is genuinely missing, point it out specifically as a warning or critical finding.
4. Do NOT claim that you lack access to profile, repository, or application information when it is provided in the context above. BOUNDARY ON UNSUPPLIED CONTEXT (HARD RULE): Ground your response strictly in the supplied context. You must NEVER claim or imply access to resources that were not supplied (e.g. if Connected GitHub Repositories is 'None provided', NEVER say 'I reviewed your repositories'. State clearly: 'Based on the profile information available to me' or 'No repositories have been connected yet').
5. ANTI-INVENTION INVARIANT (HARD RULE): NEVER invent skills, repositories, employment history, education/degrees, certifications, applications, resume claims, or job matches. Never claim cloud experience (AWS, GCP, Azure) unless backed by code evidence.
6. ZERO ROUTE EXPOSING: NEVER expose internal route paths or URLs (do NOT mention /profile, /resumes, /sources, etc.). Use human-friendly labels only.
7. Output ONLY a valid JSON object strictly matching this schema:
{
  "summary": "Short 1-2 sentence direct answer.",
  "findings": [
    {
      "severity": "critical" | "warning" | "info",
      "title": "Short title",
      "description": "Short specific explanation without route paths or URLs"
    }
  ],
  "actions": [
    {
      "id": "one of: complete_profile, review_sources, check_readiness, review_resume, view_matching_jobs, review_applications, tailor_resume",
      "label": "Short Human-friendly button label",
      "primary": true | false
    }
  ]
}
Note: Max 1 primary action, max 2 secondary actions (total max 3 actions). NEVER include url, route, or href fields.`;

        const aiResponse = await provider.generateText({
          prompt,
          taskType: 'CAREER_ASSISTANT',
          temperature: 0.2,
        });

        const structured = this._parseStructuredResponse(aiResponse.text, userText, {
          readinessData: { overallScore: readinessScore, missingItems },
          profile,
          connectedRepositories,
        });

        return {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: structured.summary,
          structuredResponse: structured,
          timestamp: new Date().toISOString(),
          citations: [
            {
              type: 'EXISTING_PROFILE',
              label: 'Canonical Candidate Profile',
              verified: true,
            },
          ],
          proposals: [],
          conflicts: [],
          navigationSuggestions: navSuggestions,
          state: 'SUCCESS',
        };
      } catch (err) {
        this.logger.warn({ err }, 'AI provider error during career assistant conversation; falling back gracefully');
        return {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            'Career Copilot is temporarily unavailable. The core portal remains fully functional. You can update your profile, review readiness, and manage applications directly.',
          structuredResponse: {
            summary: 'Career Copilot is temporarily unavailable.',
            findings: [
              {
                severity: 'warning',
                title: 'Service Temporarily Unavailable',
                description: 'The assistant could not be reached right now. Your workspace remains fully functional.',
              },
            ],
            actions: [{ id: 'complete_profile', label: 'Review profile' }],
          },
          timestamp: new Date().toISOString(),
          citations: [],
          proposals: [],
          conflicts: [],
          navigationSuggestions: navSuggestions,
          state: 'AI_FAILURE',
          error: err.message,
        };
      }
    }

    // 9. Deterministic Fallbacks when AI Provider is not configured or offline
    // Check for missing information / readiness intent
    if (/missing|readiness|ready to apply|what do i need|check (?:my )?application readiness|what(?:'s| is) blocking me/i.test(userText)) {
      const missingInfo = readinessData?.missingItems ? readinessData : this.identifyMissingInformation({ candidateProfile: profile });
      const score = typeof readinessData?.overallScore === 'number'
        ? readinessData.overallScore
        : typeof readinessData?.score === 'number'
          ? readinessData.score
          : typeof missingInfo?.readinessScore === 'number'
            ? missingInfo.readinessScore
            : null;
      const missingItems = missingInfo?.missingItems || [];
      const isAssessed = typeof score === 'number';

      const structured = {
        summary: isAssessed
          ? (missingItems.length > 0
            ? `Your profile is at ${score}% application readiness, with ${missingItems.length} screening item${missingItems.length > 1 ? 's' : ''} needing attention.`
            : `Your profile is at ${score}% application readiness with all essential screening fields verified.`)
          : (missingItems.length > 0
            ? `Application readiness has not been evaluated yet, with ${missingItems.length} screening item${missingItems.length > 1 ? 's' : ''} needing attention.`
            : `Application readiness evaluation is currently unavailable. Review your profile to calculate readiness.`),
        findings: missingItems.slice(0, 5).map((m) => ({
          severity: 'warning',
          title: m.label,
          description: this._sanitizeNoRoutes(m.notes || 'Required for employer screening.'),
        })),
        actions: [
          { id: 'complete_profile', label: 'Complete profile', primary: true },
          { id: 'check_readiness', label: 'Check readiness', primary: false },
        ],
      };

      return {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: structured.summary,
        structuredResponse: structured,
        timestamp: new Date().toISOString(),
        citations: [
          {
            type: 'EXISTING_PROFILE',
            label: 'ApplicationReadinessService Evaluation',
            verified: true,
          },
        ],
        proposals: [],
        conflicts: [],
        navigationSuggestions: [
          CANONICAL_PORTAL_ROUTES.PREFERENCES,
          CANONICAL_PORTAL_ROUTES.ELIGIBILITY,
        ],
        state: 'SUCCESS',
      };
    }

    // Check for profile improvement intent
    if (/improve (?:my )?profile|profile improvement|what should i do next/i.test(userText)) {
      const missingInfo = readinessData?.missingItems ? readinessData : this.identifyMissingInformation({ candidateProfile: profile });
      const missingItems = missingInfo?.missingItems || [];

      const structured = {
        summary: missingItems.length > 0
          ? `Your profile is missing ${missingItems.length} screening item${missingItems.length > 1 ? 's' : ''} that may affect match quality.`
          : `Your profile is complete with all required screening fields, corroborated by ${connectedRepositories.length} connected repositor${connectedRepositories.length === 1 ? 'y' : 'ies'}.`,
        findings: missingItems.slice(0, 5).map((m) => ({
          severity: 'info',
          title: m.label,
          description: this._sanitizeNoRoutes(m.notes || 'Required for screening.'),
        })),
        actions: [
          { id: 'complete_profile', label: 'Complete profile', primary: true },
          { id: 'review_sources', label: 'Review sources', primary: false },
        ],
      };

      return {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: structured.summary,
        structuredResponse: structured,
        timestamp: new Date().toISOString(),
        citations: [
          {
            type: 'EXISTING_PROFILE',
            label: 'Candidate Profile & Readiness Evaluation',
            verified: true,
          },
        ],
        proposals: [],
        conflicts: [],
        navigationSuggestions: [
          CANONICAL_PORTAL_ROUTES.PROFILE,
          CANONICAL_PORTAL_ROUTES.ELIGIBILITY,
          CANONICAL_PORTAL_ROUTES.PREFERENCES,
        ],
        state: 'SUCCESS',
      };
    }

    // Default graceful fallback when AI Provider is null
    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: 'Career Copilot is temporarily unavailable.',
      structuredResponse: {
        summary: 'Career Copilot is temporarily unavailable.',
        findings: [
          {
            severity: 'info',
            title: 'Core Workspace Available',
            description: 'You can update your profile, review readiness, and manage applications directly.',
          },
        ],
        actions: [{ id: 'complete_profile', label: 'Review profile' }],
      },
      timestamp: new Date().toISOString(),
      citations: [],
      proposals: [],
      conflicts: [],
      navigationSuggestions: navSuggestions,
      state: 'AI_FAILURE',
    };
  }
}

export default AiCareerAssistantService;
