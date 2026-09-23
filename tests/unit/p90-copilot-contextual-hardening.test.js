/**
 * @file Unit Tests: P90 Career Copilot UX/UI & Contextual Assistant Hardening
 *
 * Validates:
 * A. Drawer UX contract:
 *    - Desktop width constraints (~400px), tablet (360px), mobile bottom sheet.
 *    - Unblurred crisp background (backdrop-filter: none; background: rgba(15, 23, 42, 0.25)).
 *    - Minimal header (Career Copilot, subtitle, close button; zero marketing/Ready badges).
 *    - No permanent Copilot section on dashboard.
 * B. Context:
 *    - Strict pageContext enum ('dashboard', 'profile', 'jobs', 'applications', 'resumes', 'sources').
 *    - Invalid/missing page contexts default safely to 'dashboard'.
 *    - Contextual prompt mappings for all 6 surfaces (max 3-4 per page).
 * C. Structured Response Contract:
 *    - Schema validation ({ summary, findings, actions }).
 *    - Max 5 findings, max 3 actions.
 *    - Severity enum: 'critical', 'warning', 'info'.
 * D. Navigation Safety:
 *    - AI returns action IDs only from strict allowlist.
 *    - Model cannot provide executable routes; routes are stripped/sanitized from text.
 *    - Client TRUSTED_ACTION_NAVIGATION_MAP maps action IDs to trusted application routes.
 *    - Unknown action IDs are rejected or filtered.
 * E. Grounding & Deterministic Authority:
 *    - Deterministic readiness score and blockers remain authoritative.
 *    - Missing screening items cannot be fabricated.
 * F. Failure Handling:
 *    - Provider failure handled gracefully (state: 'AI_FAILURE').
 *    - Malformed JSON safely normalized or defaulted.
 *    - Clean error states with retry support.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderCopilotDrawer, CONTEXT_PROMPTS } from '../../src/views/components/copilot-drawer.js';
import { renderDashboardPage } from '../../src/views/dashboard.page.js';
import { AiCareerAssistantService } from '../../src/services/ai-career-assistant.service.js';
import {
  COPILOT_PAGE_CONTEXTS,
  CopilotPageContextSchema,
  normalizeCopilotPageContext,
  SUPPORTED_PRODUCT_ACTION_IDS,
  SupportedProductActionIdSchema,
  StructuredAssistantFindingSchema,
  StructuredAssistantActionSchema,
  StructuredAssistantResponseSchema,
  TRUSTED_ACTION_NAVIGATION_MAP,
  NavigationSuggestionSchema,
} from '../../src/domain/ai/career-assistant.schemas.js';

describe('P90: Career Copilot UX/UI & Contextual Assistant Hardening', () => {
  // -------------------------------------------------------------------------
  // A. Drawer UX Contract & Dashboard Clutter Removal
  // -------------------------------------------------------------------------
  describe('A. Drawer UX Contract & Dashboard Clutter Removal', () => {
    it('enforces ~400px desktop width, 360px tablet, and mobile bottom sheet', () => {
      const html = renderCopilotDrawer({ pageContext: 'dashboard' });
      assert.match(html, /width:\s*400px;/);
      assert.match(html, /max-width:\s*90vw;/);
      assert.match(
        html,
        /@media\s*\(max-width:\s*900px\)\s*\{\s*\.copilot-drawer\s*\{\s*width:\s*360px;/
      );
      assert.match(
        html,
        /@media\s*\(max-width:\s*600px\)\s*\{\s*\.copilot-drawer\s*\{\s*top:\s*auto;/
      );
    });

    it('enforces unblurred subtle backdrop overlay keeping page readable', () => {
      const html = renderCopilotDrawer({ pageContext: 'dashboard' });
      assert.match(html, /backdrop-filter:\s*none;/);
      assert.match(html, /-webkit-backdrop-filter:\s*none;/);
      assert.match(html, /background:\s*rgba\(15,\s*23,\s*42,\s*0\.25\);/);
      assert.doesNotMatch(html, /backdrop-filter:\s*blur/);
    });

    it('renders minimal header with title, subtitle, and close button, with NO marketing or status badges', () => {
      const html = renderCopilotDrawer({ pageContext: 'dashboard' });
      assert.match(html, /<h2[^>]*>Career Copilot<\/h2>/);
      assert.match(html, /Contextual career assistance/);
      assert.match(html, /id="copilotCloseBtn"/);
      // Ensure marketing/status badges are completely removed
      assert.doesNotMatch(html, /copilot-status-indicator/);
      assert.doesNotMatch(html, /<span[^>]*>\s*Ready\s*<\/span>/i);
      assert.doesNotMatch(html, /AI-powered/i);
    });

    it('removes permanent Section 4 Copilot marketing card from dashboard page', () => {
      const dashHtml = renderDashboardPage({
        user: {
          id: '00000000-0000-0000-0000-000000000001',
          displayName: 'Test User',
          email: 'test@example.com',
        },
        tenant: { id: '00000000-0000-0000-0000-000000000001', name: 'Test Tenant' },
        candidate: { id: '00000000-0000-0000-0000-000000000001', displayName: 'Test Candidate' },
        readiness: { readinessScore: 80, missingFields: ['phone'] },
        skills: [{ id: 's-1', name: 'Node.js' }],
        applications: [],
        recommendedJobs: [],
      });
      // Verify no permanent Section 4 Help Strip banner
      assert.doesNotMatch(dashHtml, /SECTION 4: CONTEXTUAL COPILOT HELP STRIP/);
      assert.doesNotMatch(dashHtml, /Get context-aware advice on screening readiness/);
    });

    it('ensures backdrop is non-blocking on desktop viewports so screen clicks do not dismiss drawer', () => {
      const html = renderCopilotDrawer({ pageContext: 'dashboard' });
      assert.match(
        html,
        /@media\s*\(min-width:\s*901px\)\s*\{\s*\.copilot-backdrop\s*\{\s*display:\s*none\s*!important;\s*pointer-events:\s*none\s*!important;/
      );
      assert.match(html, /id="copilotClearBtn"/);
    });
  });

  // -------------------------------------------------------------------------
  // B. Controlled Page Context
  // -------------------------------------------------------------------------
  describe('B. Controlled Page Context & Suggested Prompts', () => {
    it('accepts strictly defined enum contexts and rejects arbitrary contexts', () => {
      assert.deepStrictEqual(COPILOT_PAGE_CONTEXTS, [
        'dashboard',
        'profile',
        'jobs',
        'applications',
        'resumes',
        'sources',
      ]);

      assert.strictEqual(CopilotPageContextSchema.safeParse('dashboard').success, true);
      assert.strictEqual(CopilotPageContextSchema.safeParse('profile').success, true);
      assert.strictEqual(CopilotPageContextSchema.safeParse('jobs').success, true);
      assert.strictEqual(CopilotPageContextSchema.safeParse('applications').success, true);
      assert.strictEqual(CopilotPageContextSchema.safeParse('resumes').success, true);
      assert.strictEqual(CopilotPageContextSchema.safeParse('sources').success, true);

      // Rejects invalid strings
      assert.strictEqual(CopilotPageContextSchema.safeParse('invalid_route').success, false);
      assert.strictEqual(CopilotPageContextSchema.safeParse('/profile').success, false);
      assert.strictEqual(CopilotPageContextSchema.safeParse('').success, false);
      assert.strictEqual(CopilotPageContextSchema.safeParse(null).success, false);
    });

    it('normalizes every supported route and legacy alias to exactly one canonical context', () => {
      // Radar / jobs routes and aliases
      assert.strictEqual(normalizeCopilotPageContext('/apps/radar'), 'jobs');
      assert.strictEqual(normalizeCopilotPageContext('radar'), 'jobs');
      assert.strictEqual(normalizeCopilotPageContext('job'), 'jobs');
      assert.strictEqual(normalizeCopilotPageContext('jobs'), 'jobs');
      assert.strictEqual(normalizeCopilotPageContext('/jobs'), 'jobs');
      assert.strictEqual(normalizeCopilotPageContext('/jobs/backend-engineer-1'), 'jobs');
      assert.strictEqual(normalizeCopilotPageContext('/job/senior-dev'), 'jobs');

      // Applications routes and aliases
      assert.strictEqual(normalizeCopilotPageContext('/applications'), 'applications');
      assert.strictEqual(normalizeCopilotPageContext('/applications/app-uuid-123'), 'applications');
      assert.strictEqual(normalizeCopilotPageContext('application'), 'applications');
      assert.strictEqual(normalizeCopilotPageContext('applications'), 'applications');
      assert.strictEqual(normalizeCopilotPageContext('/apply'), 'applications');
      assert.strictEqual(normalizeCopilotPageContext('/handoff'), 'applications');

      // Profile routes and aliases
      assert.strictEqual(normalizeCopilotPageContext('/profile'), 'profile');
      assert.strictEqual(normalizeCopilotPageContext('/profile#eligibility'), 'profile');
      assert.strictEqual(normalizeCopilotPageContext('/profile#readiness'), 'profile');
      assert.strictEqual(normalizeCopilotPageContext('profile'), 'profile');
      assert.strictEqual(normalizeCopilotPageContext('preferences'), 'profile');
      assert.strictEqual(normalizeCopilotPageContext('eligibility'), 'profile');

      // Resumes routes and aliases
      assert.strictEqual(normalizeCopilotPageContext('/resumes'), 'resumes');
      assert.strictEqual(normalizeCopilotPageContext('/resumes/res-active-1'), 'resumes');
      assert.strictEqual(normalizeCopilotPageContext('resume'), 'resumes');
      assert.strictEqual(normalizeCopilotPageContext('resumes'), 'resumes');

      // Sources routes and aliases
      assert.strictEqual(normalizeCopilotPageContext('/sources'), 'sources');
      assert.strictEqual(normalizeCopilotPageContext('/sources/github'), 'sources');
      assert.strictEqual(normalizeCopilotPageContext('source'), 'sources');
      assert.strictEqual(normalizeCopilotPageContext('sources'), 'sources');

      // Dashboard routes and aliases
      assert.strictEqual(normalizeCopilotPageContext('/dashboard'), 'dashboard');
      assert.strictEqual(normalizeCopilotPageContext('dashboard'), 'dashboard');
      assert.strictEqual(normalizeCopilotPageContext('home'), 'dashboard');
      assert.strictEqual(normalizeCopilotPageContext('overview'), 'dashboard');
      assert.strictEqual(normalizeCopilotPageContext('/'), 'dashboard');

      // Edge cases: missing, null, undefined, unknown fallback to 'dashboard'
      assert.strictEqual(normalizeCopilotPageContext(''), 'dashboard');
      assert.strictEqual(normalizeCopilotPageContext(null), 'dashboard');
      assert.strictEqual(normalizeCopilotPageContext(undefined), 'dashboard');
      assert.strictEqual(normalizeCopilotPageContext('/unrecognized/arbitrary/path'), 'dashboard');
    });

    it('proves CONTEXT_PROMPTS has strictly the six canonical keys without duplicate aliases', () => {
      assert.deepStrictEqual(Object.keys(CONTEXT_PROMPTS).sort(), [
        'applications',
        'dashboard',
        'jobs',
        'profile',
        'resumes',
        'sources',
      ]);
    });

    it('defaults invalid or missing page context safely to dashboard in assistant service', async () => {
      const mockProvider = {
        async generateText({ prompt }) {
          return {
            text: JSON.stringify({
              summary: 'Here are your next recommended steps.',
              findings: [
                {
                  severity: 'info',
                  title: 'Action Plan',
                  description: 'Review your resume and apply to matching roles.',
                },
              ],
              actions: [{ id: 'view_matching_jobs', label: 'View matching jobs' }],
            }),
          };
        },
      };

      const assistant = new AiCareerAssistantService({
        aiProvider: mockProvider,
        candidateProfileService: {
          async getCareerProfile() {
            return {
              candidate: { displayName: 'Vishwanath' },
              skills: ['JavaScript'],
            };
          },
        },
      });

      // Pass invalid pageContext
      const res = await assistant.handleUserMessage({
        message: 'What should I do next?',
        tenantId: '00000000-0000-0000-0000-000000000001',
        userId: '00000000-0000-0000-0000-000000000001',
        candidateId: '00000000-0000-0000-0000-000000000001',
        pageContext: 'arbitrary_invalid_path',
        candidateProfile: {
          candidate: { displayName: 'Vishwanath' },
          skills: ['JavaScript'],
        },
      });

      assert.strictEqual(res.state, 'SUCCESS');
      assert.ok(res.structuredResponse);
      assert.strictEqual(typeof res.structuredResponse.summary, 'string');
    });

    it('renders exact P90 contextual prompts for each surface (max 3-4 per page)', () => {
      // Dashboard prompts
      const dashDrawer = renderCopilotDrawer({ pageContext: 'dashboard' });
      assert.match(dashDrawer, /What should I do next\?/);
      assert.match(dashDrawer, /What(?:'|&#039;|&#39;)s blocking me from applying\?/);
      assert.match(dashDrawer, /Improve my profile/);
      assert.match(dashDrawer, /Find matching jobs/);

      // Profile prompts
      const profDrawer = renderCopilotDrawer({ pageContext: 'profile' });
      assert.match(profDrawer, /What(?:'|&#039;|&#39;)s missing from my profile\?/);
      assert.match(profDrawer, /Fix my profile gaps/);
      assert.match(profDrawer, /What evidence is missing\?/);

      // Jobs prompts
      const jobsDrawer = renderCopilotDrawer({ pageContext: 'jobs' });
      assert.match(jobsDrawer, /How strong is my match\?/);
      assert.match(jobsDrawer, /What am I missing\?/);
      assert.match(jobsDrawer, /Should I apply\?/);
      assert.match(jobsDrawer, /Tailor my resume/);

      // Applications prompts
      const appsDrawer = renderCopilotDrawer({ pageContext: 'applications' });
      assert.match(appsDrawer, /Is this application ready\?/);
      assert.match(appsDrawer, /What is missing\?/);
      assert.match(appsDrawer, /Improve my match/);

      // Resumes prompts
      const resDrawer = renderCopilotDrawer({ pageContext: 'resumes' });
      assert.match(resDrawer, /Review my active resume/);
      assert.match(resDrawer, /What claims lack evidence\?/);
      assert.match(resDrawer, /Tailor my resume/);

      // Sources prompts
      const srcDrawer = renderCopilotDrawer({ pageContext: 'sources' });
      assert.match(srcDrawer, /What evidence do my sources provide\?/);
      assert.match(srcDrawer, /Which skills need stronger evidence\?/);
      assert.match(srcDrawer, /Review my connected sources/);
    });
  });

  // -------------------------------------------------------------------------
  // C. Structured Response Contract
  // -------------------------------------------------------------------------
  describe('C. Structured Response Contract Validation', () => {
    it('validates structured response conforming to summary, max 5 findings, max 3 actions', () => {
      const validPayload = {
        summary: 'Your profile has 85% readiness but needs work authorization verified.',
        findings: [
          {
            severity: 'critical',
            title: 'Missing Work Authorization',
            description: 'Employer screening requires work authorization details.',
          },
          {
            severity: 'warning',
            title: 'Unverified Cloud Experience',
            description: 'Cloud skills were claimed without repository code evidence.',
          },
        ],
        actions: [
          {
            id: 'complete_profile',
            label: 'Complete profile',
          },
          {
            id: 'review_sources',
            label: 'Review sources',
          },
        ],
      };

      const result = StructuredAssistantResponseSchema.safeParse(validPayload);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.findings.length, 2);
      assert.strictEqual(result.data.actions.length, 2);
    });

    it('rejects payload with more than 5 findings or more than 3 actions', () => {
      const overPayload = {
        summary: 'Summary test',
        findings: [
          { severity: 'info', title: 'F1', description: 'D1' },
          { severity: 'info', title: 'F2', description: 'D2' },
          { severity: 'info', title: 'F3', description: 'D3' },
          { severity: 'info', title: 'F4', description: 'D4' },
          { severity: 'info', title: 'F5', description: 'D5' },
          { severity: 'info', title: 'F6', description: 'D6' }, // 6th item
        ],
        actions: [
          { id: 'complete_profile', label: 'L1' },
          { id: 'review_sources', label: 'L2' },
          { id: 'check_readiness', label: 'L3' },
          { id: 'review_resume', label: 'L4' }, // 4th action
        ],
      };

      const result = StructuredAssistantResponseSchema.safeParse(overPayload);
      assert.strictEqual(result.success, false);
    });

    it('rejects invalid action IDs and invalid severities', () => {
      const invalidAction = {
        summary: 'Summary test',
        findings: [{ severity: 'unknown_severity', title: 'T', description: 'D' }],
        actions: [{ id: 'execute_arbitrary_route', label: 'Go' }],
      };

      const result = StructuredAssistantResponseSchema.safeParse(invalidAction);
      assert.strictEqual(result.success, false);
    });

    it('strictly rejects any model payloads containing url, route, or href fields', () => {
      const withUrl = { id: 'complete_profile', label: 'Complete profile', url: '/profile' };
      assert.strictEqual(StructuredAssistantActionSchema.safeParse(withUrl).success, false);

      const withRoute = { id: 'complete_profile', label: 'Complete profile', route: '/profile' };
      assert.strictEqual(StructuredAssistantActionSchema.safeParse(withRoute).success, false);

      const withHref = { id: 'complete_profile', label: 'Complete profile', href: '/profile' };
      assert.strictEqual(StructuredAssistantActionSchema.safeParse(withHref).success, false);

      const withPath = { id: 'complete_profile', label: 'Complete profile', path: '/profile' };
      assert.strictEqual(StructuredAssistantActionSchema.safeParse(withPath).success, false);

      const responseWithUrl = {
        summary: 'Summary with forbidden url key',
        findings: [],
        actions: [{ id: 'complete_profile', label: 'Complete profile' }],
        url: 'https://evil.example.com',
      };
      assert.strictEqual(
        StructuredAssistantResponseSchema.safeParse(responseWithUrl).success,
        false
      );

      const responseWithPath = {
        summary: 'Summary with forbidden path key',
        findings: [],
        actions: [{ id: 'complete_profile', label: 'Complete profile' }],
        path: '/profile',
      };
      assert.strictEqual(
        StructuredAssistantResponseSchema.safeParse(responseWithPath).success,
        false
      );

      const responseWithRoute = {
        summary: 'Summary with forbidden route key',
        findings: [],
        actions: [{ id: 'complete_profile', label: 'Complete profile' }],
        route: '/profile',
      };
      assert.strictEqual(
        StructuredAssistantResponseSchema.safeParse(responseWithRoute).success,
        false
      );
    });

    it('confirms NavigationSuggestionSchema is quarantined and rejected from structured response', () => {
      // StructuredAssistantResponseSchema is strict and rejects navigationSuggestions
      const responseWithLegacyNav = {
        summary: 'Summary attempting to inject legacy navigation suggestions',
        findings: [],
        actions: [{ id: 'complete_profile', label: 'Complete profile' }],
        navigationSuggestions: [{ label: 'Go to profile', path: '/profile' }],
      };
      assert.strictEqual(
        StructuredAssistantResponseSchema.safeParse(responseWithLegacyNav).success,
        false
      );

      // Legacy NavigationSuggestionSchema itself is quarantined as strict
      assert.strictEqual(
        NavigationSuggestionSchema.safeParse({ label: 'Profile', path: '/profile' }).success,
        true
      );
      assert.strictEqual(
        NavigationSuggestionSchema.safeParse({
          label: 'Profile',
          path: '/profile',
          arbitraryField: 'bad',
        }).success,
        false
      );
    });

    it('enforces at most one primary action in structured response schema', () => {
      const twoPrimaries = {
        summary: 'Valid summary text.',
        findings: [],
        actions: [
          { id: 'complete_profile', label: 'Complete profile', primary: true },
          { id: 'review_sources', label: 'Review sources', primary: true },
        ],
      };
      const result = StructuredAssistantResponseSchema.safeParse(twoPrimaries);
      assert.strictEqual(result.success, false);
    });

    it('designates exactly one primary action during structured response parsing', () => {
      const assistant = new AiCareerAssistantService();
      const rawJson = JSON.stringify({
        summary: 'Here are your recommended actions.',
        findings: [{ severity: 'info', title: 'Step 1', description: 'Complete your profile.' }],
        actions: [
          { id: 'complete_profile', label: 'Complete profile' },
          { id: 'review_sources', label: 'Review sources' },
        ],
      });

      const parsed = assistant._parseStructuredResponse(rawJson, 'What to do?', {});
      assert.strictEqual(parsed.actions.length, 2);
      assert.strictEqual(parsed.actions[0].primary, true, 'First action must be primary');
      assert.strictEqual(parsed.actions[1].primary, false, 'Second action must be secondary');
    });
  });

  // -------------------------------------------------------------------------
  // D. Navigation Safety & Route Sanitization
  // -------------------------------------------------------------------------
  describe('D. Navigation Safety & Zero Route Exposure', () => {
    it('verifies all supported product action IDs map to trusted client routes', () => {
      for (const actionId of SUPPORTED_PRODUCT_ACTION_IDS) {
        const mapping = TRUSTED_ACTION_NAVIGATION_MAP[actionId];
        assert.ok(mapping, `Action ID ${actionId} must be mapped in TRUSTED_ACTION_NAVIGATION_MAP`);
        assert.ok(
          mapping.path.startsWith('/'),
          `Path for ${actionId} must be a valid internal route path`
        );
        assert.ok(mapping.label, `Label for ${actionId} must exist`);
      }
    });

    it('sanitizes internal route paths from text and replaces with human labels', () => {
      const assistant = new AiCareerAssistantService();
      const rawText =
        'Please visit /profile to update your skills, or check /sources for code evidence, or /apps/radar for matching roles.';
      const sanitized = assistant._sanitizeNoRoutes(rawText);

      assert.doesNotMatch(sanitized, /\/profile/);
      assert.doesNotMatch(sanitized, /\/sources/);
      assert.doesNotMatch(sanitized, /\/apps\/radar/);
      assert.match(sanitized, /Profile settings/);
      assert.match(sanitized, /Connected Sources/);
      assert.match(sanitized, /Job Radar/);
    });

    it('filters out unsupported or malicious action IDs during response parsing', () => {
      const assistant = new AiCareerAssistantService();
      const rawAiJson = JSON.stringify({
        summary: 'Test summary response.',
        findings: [{ severity: 'info', title: 'Screening', description: 'All looks clear.' }],
        actions: [
          { id: 'complete_profile', label: 'Complete profile' },
          { id: 'execute_arbitrary_shell_command', label: 'Exploit' },
        ],
      });

      const parsed = assistant._parseStructuredResponse(rawAiJson, 'Check readiness', {
        readinessData: { overallScore: 90, missingItems: [] },
      });

      assert.strictEqual(parsed.actions.length, 1);
      assert.strictEqual(parsed.actions[0].id, 'complete_profile');
    });
  });

  // -------------------------------------------------------------------------
  // E. Grounding & Deterministic Authority
  // -------------------------------------------------------------------------
  describe('E. Grounding & Deterministic Authority', () => {
    it('gives deterministic readiness blockers first priority and reflects them in structured findings', async () => {
      const mockProvider = {
        async generateText({ prompt }) {
          // Assert that deterministic readiness blockers are in the prompt sent to AI
          assert.match(prompt, /Work Authorization/i);
          assert.match(prompt, /Contact Phone/i);
          return {
            text: JSON.stringify({
              summary: 'Your application readiness is blocked by missing requirements.',
              findings: [
                {
                  severity: 'critical',
                  title: 'Work Authorization',
                  description: 'Missing legal authorization status',
                },
                {
                  severity: 'warning',
                  title: 'Contact Phone',
                  description: 'Required for recruiter outreach',
                },
              ],
              actions: [{ id: 'complete_profile', label: 'Complete profile' }],
            }),
          };
        },
      };

      const assistant = new AiCareerAssistantService({
        aiProvider: mockProvider,
        candidateProfileService: {
          async getCareerProfile() {
            return {
              candidate: { displayName: 'Candidate' },
            };
          },
        },
      });

      const response = await assistant.handleUserMessage({
        message: "What's blocking me from applying?",
        tenantId: '00000000-0000-0000-0000-000000000001',
        userId: '00000000-0000-0000-0000-000000000001',
        candidateId: '00000000-0000-0000-0000-000000000001',
        readiness: {
          overallScore: 25,
          score: 25,
          missingItems: [
            { label: 'Work Authorization', notes: 'Missing legal authorization status' },
            { label: 'Contact Phone', notes: 'Required for recruiter outreach' },
          ],
        },
        candidateProfile: {
          candidate: { displayName: 'Candidate' },
        },
      });

      assert.strictEqual(response.state, 'SUCCESS');
      assert.ok(response.structuredResponse);
      assert.ok(
        response.structuredResponse.findings.length >= 2,
        'Should contain at least the 2 blockers'
      );
      assert.ok(
        response.structuredResponse.findings.some(
          (f) => /work authorization/i.test(f.title) || /work authorization/i.test(f.description)
        ),
        'Must include work authorization blocker'
      );
      assert.ok(
        response.structuredResponse.findings.some(
          (f) => /phone/i.test(f.title) || /phone/i.test(f.description)
        ),
        'Must include contact phone blocker'
      );
      assert.ok(
        response.structuredResponse.actions.some((a) => SUPPORTED_PRODUCT_ACTION_IDS.includes(a.id))
      );
    });

    it('enforces boundary on unsupplied context: never claims to have reviewed repositories when none were provided', async () => {
      let promptSent = '';
      const mockProvider = {
        async generateText({ prompt }) {
          promptSent = prompt;
          return {
            text: JSON.stringify({
              summary:
                'Based on the profile information available to me, you have verified Node.js skills.',
              findings: [
                {
                  severity: 'warning',
                  title: 'No Repositories Connected',
                  description:
                    'Connect your GitHub account in Sources to provide verifiable code evidence.',
                },
              ],
              actions: [{ id: 'review_sources', label: 'Review sources' }],
            }),
          };
        },
      };

      const assistant = new AiCareerAssistantService({
        aiProvider: mockProvider,
        candidateProfileService: {
          async getCareerProfile() {
            return {
              candidate: { displayName: 'Candidate' },
              skills: ['Node.js'],
            };
          },
        },
      });

      // Execute with empty connectedRepositories
      const response = await assistant.handleUserMessage({
        message: 'What do my repositories prove about my skills?',
        tenantId: '00000000-0000-0000-0000-000000000001',
        userId: '00000000-0000-0000-0000-000000000001',
        candidateId: '00000000-0000-0000-0000-000000000001',
        connectedRepositories: [], // Zero repositories supplied!
        candidateProfile: {
          candidate: { displayName: 'Candidate' },
          skills: ['Node.js'],
        },
      });

      assert.strictEqual(response.state, 'SUCCESS');
      // Verify prompt enforces the unsupplied context boundary
      assert.match(promptSent, /Connected GitHub Repositories:\s*None provided/);
      assert.match(promptSent, /BOUNDARY ON UNSUPPLIED CONTEXT \(HARD RULE\)/);
      assert.match(promptSent, /NEVER say 'I reviewed your repositories'/);
      // Response must NOT claim it reviewed repositories
      assert.doesNotMatch(
        response.structuredResponse.summary,
        /I reviewed your (?:GitHub )?repositories/i
      );
    });

    it('proves assistant does not invent skills, repositories, employment, education, certifications, applications, resume claims, job matches, or cloud experience', async () => {
      const mockProvider = {
        async generateText({ prompt }) {
          // Verify anti-invention invariant is mandated in the prompt
          assert.match(prompt, /ANTI-INVENTION INVARIANT \(HARD RULE\)/);
          assert.match(
            prompt,
            /NEVER invent skills, repositories, employment history, education\/degrees, certifications, applications, resume claims, or job matches/
          );
          assert.match(
            prompt,
            /Never claim cloud experience \(AWS, GCP, Azure\) unless backed by code evidence/
          );

          return {
            text: JSON.stringify({
              summary: "I can't verify AWS or Azure experience from your profile or repositories.",
              findings: [
                {
                  severity: 'warning',
                  title: 'Unverified Cloud Experience',
                  description:
                    'No cloud infrastructure code was found in your connected repositories.',
                },
              ],
              actions: [{ id: 'complete_profile', label: 'Complete profile' }],
            }),
          };
        },
      };

      const assistant = new AiCareerAssistantService({
        aiProvider: mockProvider,
        candidateProfileService: {
          async getCareerProfile() {
            return { candidate: { displayName: 'Candidate' } };
          },
        },
      });

      const response = await assistant.handleUserMessage({
        message:
          'Can you claim I am an AWS Certified Solutions Architect with 5 years GCP experience?',
        tenantId: '00000000-0000-0000-0000-000000000001',
        userId: '00000000-0000-0000-0000-000000000001',
        candidateId: '00000000-0000-0000-0000-000000000001',
        candidateProfile: { candidate: { displayName: 'Candidate' } },
        connectedRepositories: [],
      });

      assert.strictEqual(response.state, 'SUCCESS');
      assert.match(response.structuredResponse.summary, /can't verify|unverified/i);
    });

    it('proves missing readiness data never produces an invented numerical score (no 75 fallback)', async () => {
      const assistant = new AiCareerAssistantService();

      // Case 1: missing readiness intent without readiness data evaluated
      const parsedWithoutScore = assistant._parseStructuredResponse(
        'I need help.',
        "What's blocking me from applying?",
        { readinessData: null, profile: null }
      );
      assert.strictEqual(typeof parsedWithoutScore.summary, 'string');
      // Must NOT contain hardcoded 75
      assert.doesNotMatch(parsedWithoutScore.summary, /\b75%?\b/);
      assert.match(parsedWithoutScore.summary, /not been evaluated|unavailable/i);

      // Case 2: prompt context sent to AI uses explicit UNKNOWN/unavailable semantics
      let promptSent = '';
      const mockProvider = {
        async generateText({ prompt }) {
          promptSent = prompt;
          return {
            text: JSON.stringify({
              summary: 'Readiness evaluation is currently unavailable.',
              findings: [
                { severity: 'info', title: 'Status', description: 'Readiness unassessed.' },
              ],
              actions: [{ id: 'complete_profile', label: 'Complete profile' }],
            }),
          };
        },
      };

      const serviceWithMock = new AiCareerAssistantService({
        aiProvider: mockProvider,
        candidateProfileService: {
          async getCareerProfile() {
            return null; // Profile unavailable
          },
        },
      });

      // Send a general query with no profile so readiness cannot be assessed
      const generalResp = await serviceWithMock.handleUserMessage({
        message: 'What should I work on today?',
        tenantId: '00000000-0000-0000-0000-000000000001',
        userId: '00000000-0000-0000-0000-000000000001',
        candidateId: '00000000-0000-0000-0000-000000000001',
        readiness: null, // Zero readiness data supplied
        candidateProfile: null, // Zero candidate profile supplied
      });

      assert.strictEqual(generalResp.state, 'SUCCESS');
      // Prompt must NOT contain hardcoded 75%
      assert.doesNotMatch(promptSent, /75%/);
      assert.match(
        promptSent,
        /Application Readiness:\s*UNKNOWN \(Readiness evaluation unavailable\)/
      );

      // Case 3: deterministic handler also returns no invented score
      const readinessResp = await serviceWithMock.handleUserMessage({
        message: 'What is my application readiness?',
        tenantId: '00000000-0000-0000-0000-000000000001',
        userId: '00000000-0000-0000-0000-000000000001',
        candidateId: '00000000-0000-0000-0000-000000000001',
        readiness: null,
        candidateProfile: null,
      });
      assert.strictEqual(readinessResp.state, 'SUCCESS');
      assert.doesNotMatch(readinessResp.structuredResponse.summary, /\b75%?\b/);
      assert.match(readinessResp.structuredResponse.summary, /not been evaluated|unavailable/i);
    });
  });

  // -------------------------------------------------------------------------
  // F. Failure Handling & Recovery
  // -------------------------------------------------------------------------
  describe('F. Failure Handling & Safe Error States', () => {
    it('returns controlled AI_FAILURE with structured fallback when provider throws', async () => {
      const failingProvider = {
        async generateText() {
          throw new Error('Vertex AI 503 Overloaded: Quota exceeded');
        },
      };

      const assistant = new AiCareerAssistantService({
        aiProvider: failingProvider,
      });

      const response = await assistant.handleUserMessage({
        message: 'Recommend next steps for my career.',
        tenantId: '00000000-0000-0000-0000-000000000001',
        userId: '00000000-0000-0000-0000-000000000001',
        candidateId: '00000000-0000-0000-0000-000000000001',
        candidateProfile: { candidate: { displayName: 'Candidate' } },
      });

      assert.strictEqual(response.state, 'AI_FAILURE');
      assert.ok(response.structuredResponse);
      assert.strictEqual(
        response.structuredResponse.summary,
        'Career Copilot is temporarily unavailable.'
      );
      // Never leak stack trace or internal API errors in structured response
      assert.doesNotMatch(response.structuredResponse.summary, /Vertex/i);
      assert.doesNotMatch(response.structuredResponse.summary, /503/);
      assert.doesNotMatch(response.structuredResponse.summary, /Quota/i);
    });

    it('safely normalizes malformed AI output into deterministic structured response', () => {
      const assistant = new AiCareerAssistantService();
      const malformedAiOutput = 'This is raw unformatted prose without any JSON structure.';

      const parsed = assistant._parseStructuredResponse(
        malformedAiOutput,
        "What's blocking me from applying?",
        {
          readinessData: {
            overallScore: 40,
            missingItems: [{ label: 'Notice Period', notes: 'Required screening field' }],
          },
        }
      );

      assert.ok(parsed);
      assert.strictEqual(typeof parsed.summary, 'string');
      assert.ok(parsed.findings.length > 0);
      assert.strictEqual(parsed.findings[0].title, 'Notice Period');
      assert.ok(parsed.actions.length > 0);
      assert.strictEqual(parsed.actions[0].id, 'complete_profile');
    });

    it('renders exact Phase 6 user-facing error states in drawer client', () => {
      const html = renderCopilotDrawer({ pageContext: 'dashboard' });
      // Temporary unavailability state
      assert.match(html, /Career Copilot is temporarily unavailable\./);
      assert.match(html, /Try again/);
      // Insufficient context state
      assert.match(html, /I need more profile information to answer this reliably\./);
      assert.match(html, /Review profile/);
      // Must not contain leaked technical error tokens
      assert.doesNotMatch(html, /Vertex AI 503/i);
      assert.doesNotMatch(html, /stack trace/i);
    });
  });

  // -------------------------------------------------------------------------
  // G. App-Wide Persistence & Workspace Utility Usability
  // -------------------------------------------------------------------------
  describe('G. App-Wide Persistence & Workspace Utility Usability', () => {
    it('implements sessionStorage open-state and chat-history persistence across whole app', () => {
      const html = renderCopilotDrawer({ pageContext: 'dashboard' });
      assert.match(html, /copilot_drawer_open/);
      assert.match(html, /copilot_chat_history/);
      assert.match(html, /sessionStorage\.setItem\(STORAGE_OPEN_KEY/);
      assert.match(html, /sessionStorage\.getItem\(STORAGE_HISTORY_KEY\)/);
      assert.match(html, /window\.clearCopilotConversation/);
    });

    it('renders exactly one primary action and distinguishes secondary actions in DOM', () => {
      const html = renderCopilotDrawer({ pageContext: 'dashboard' });
      assert.match(html, /copilot-action-btn primary/);
      assert.match(html, /copilot-action-btn secondary/);
    });

    it('provides Escape-to-close and focus restoration in drawer controller script', () => {
      const html = renderCopilotDrawer({ pageContext: 'dashboard' });
      assert.match(html, /e\.key === 'Escape'/);
      assert.match(html, /lastFocusedElement/);
      assert.match(html, /lastFocusedElement\.focus\(\)/);
      assert.match(html, /copilotOpenBtn/);
    });

    it('renders Clear conversation button as visually secondary (borderless, muted, subordinate) to Close', () => {
      const html = renderCopilotDrawer({ pageContext: 'dashboard' });
      assert.match(html, /id="copilotClearBtn"[^>]*class="copilot-clear-btn"/);
      assert.match(html, /background:transparent;\s*border:none;/);
      assert.match(html, /id="copilotCloseBtn"/);
    });
  });
});
