/**
 * @file Unit and Regression Tests: P90 Live Bug Fix Pass
 *
 * 1. Bug 1: Career Copilot Scroll Isolation
 *    - Rendered Copilot CSS/DOM contract:
 *      - overflow-y: auto on drawer body
 *      - overscroll-behavior: contain and overscroll-behavior-y: contain
 *      - fixed drawer geometry (top: 0; right: 0; bottom: 0; position: fixed;)
 *      - tabindex="-1" on drawer body for keyboard scrollability
 *      - wheel and touch event scroll boundary trapping
 *      - non-blocking desktop backdrop
 *      - no crude global body overflow: hidden
 *
 * 2. Bug 2: Profile Save Enum Normalization & Round-Trip
 *    - normalizeNoticePeriod("immediate") === "IMMEDIATE"
 *    - All enum field normalizers (remote, relocation, compensation, visa, career status, seniority)
 *    - Preprocessed schema validation via UpdateCareerPreferencesInputSchema
 *    - Full round-trip persistence and reload with canonical representation
 *    - Single canonical save action with idempotency guard and Enter key suppression
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { renderCopilotDrawer } from '../../src/views/components/copilot-drawer.js';
import { renderProfilePage } from '../../src/views/profile.page.js';
import {
  normalizeNoticePeriod,
  normalizeRemotePreference,
  normalizeRelocationPreference,
  normalizeCompensationPeriod,
  normalizeCompensationType,
  normalizeEmploymentType,
  normalizeEmploymentTypes,
  normalizeVisaSponsorship,
  normalizeCareerStatus,
  normalizeSeniorityLevel,
  canonicalizeCareerPreferencesInput,
  UpdateCareerPreferencesInputSchema,
  formatNoticePeriodLabel,
} from '../../src/domain/candidate/career-preferences.schemas.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';

describe('P90 LIVE BUG FIX — Copilot Scroll Isolation & Profile Save Enum Normalization', () => {
  // =========================================================================
  // BUG 1: CAREER COPILOT SCROLL ISOLATION CONTRACT
  // =========================================================================
  describe('Bug 1: Career Copilot Scroll Isolation', () => {
    it('enforces fixed drawer positioning and scroll boundary containment in CSS', () => {
      const html = renderCopilotDrawer({ pageContext: 'profile' });

      // Fixed positioning contract
      assert.match(html, /position:\s*fixed;/, 'Drawer must be position: fixed');
      assert.match(html, /top:\s*0;/, 'Drawer must be anchored at top: 0');
      assert.match(html, /right:\s*0;/, 'Drawer must be anchored at right: 0');
      assert.match(html, /bottom:\s*0;/, 'Drawer must be anchored at bottom: 0');

      // Scroll boundary containment on drawer and body
      assert.match(
        html,
        /overscroll-behavior:\s*contain;/,
        'Drawer container must have overscroll-behavior: contain'
      );
      assert.match(
        html,
        /overscroll-behavior-y:\s*contain;/,
        'Drawer container must have overscroll-behavior-y: contain'
      );

      // Drawer body scroll contract
      assert.match(
        html,
        /overflow-y:\s*auto;/,
        'Drawer body must be independently scrollable with overflow-y: auto'
      );
    });

    it('sets tabindex="-1" on #copilot-body for keyboard scrolling support', () => {
      const html = renderCopilotDrawer({ pageContext: 'profile' });
      assert.match(
        html,
        /id="copilot-body"[^>]*tabindex="-1"/,
        'copilot-body must have tabindex="-1" so it can be focused for keyboard navigation without tab trap'
      );
    });

    it('attaches non-passive wheel and touch event scroll boundary isolation script', () => {
      const html = renderCopilotDrawer({ pageContext: 'profile' });

      // Wheel boundary isolation
      assert.match(
        html,
        /drawerEl\.addEventListener\('wheel',[\s\S]*?\{\s*passive:\s*false\s*\}\)/,
        'Drawer must attach non-passive wheel listener to isolate scroll'
      );

      // Touch boundary isolation
      assert.match(
        html,
        /drawerEl\.addEventListener\('touchmove',[\s\S]*?\{\s*passive:\s*false\s*\}\)/,
        'Drawer must attach non-passive touchmove listener to isolate mobile scroll'
      );

      // Boundary calculation checks
      assert.match(html, /bodyEl\.scrollTop/, 'Must inspect internal scrollTop');
      assert.match(html, /bodyEl\.scrollHeight/, 'Must inspect internal scrollHeight');
      assert.match(html, /bodyEl\.clientHeight/, 'Must inspect internal clientHeight');
      assert.match(html, /e\.preventDefault\(\)/, 'Must cancel default scroll action when leaking');
      assert.match(html, /e\.stopPropagation\(\)/, 'Must stop event propagation to window');
    });

    it('does NOT inject crude document.body { overflow: hidden } on desktop', () => {
      const html = renderCopilotDrawer({ pageContext: 'profile' });
      // Verify no document.body.style.overflow = 'hidden' for desktop sidecar
      assert.doesNotMatch(
        html,
        /document\.body\.style\.overflow\s*=\s*['"]hidden['"]/,
        'Must NOT globally freeze background page scroll on desktop'
      );
    });

    it('maintains non-blocking backdrop with zero blur on desktop sidecar', () => {
      const html = renderCopilotDrawer({ pageContext: 'profile' });
      assert.match(html, /backdrop-filter:\s*none;/, 'Must not blur the underlying workspace');
      assert.match(
        html,
        /background:\s*rgba\(15,\s*23,\s*42,\s*0\.25\);/,
        'Must use subtle 25% tint'
      );
    });
  });

  // =========================================================================
  // BUG 2: NOTICE PERIOD & PROFILE ENUM NORMALIZATION
  // =========================================================================
  describe('Bug 2: Notice Period Normalization', () => {
    it('normalizes various lowercase and human notice period formats to canonical enum', () => {
      assert.equal(normalizeNoticePeriod('immediate'), 'IMMEDIATE');
      assert.equal(normalizeNoticePeriod('immediately'), 'IMMEDIATE');
      assert.equal(normalizeNoticePeriod('now'), 'IMMEDIATE');
      assert.equal(normalizeNoticePeriod('asap'), 'IMMEDIATE');
      assert.equal(normalizeNoticePeriod('IMMEDIATE'), 'IMMEDIATE');

      assert.equal(normalizeNoticePeriod('less than 1 week'), 'LESS_THAN_1_WEEK');
      assert.equal(normalizeNoticePeriod('less_than_1_week'), 'LESS_THAN_1_WEEK');
      assert.equal(normalizeNoticePeriod('< 1 week'), 'LESS_THAN_1_WEEK');

      assert.equal(normalizeNoticePeriod('1 to 2 weeks'), '1_TO_2_WEEKS');
      assert.equal(normalizeNoticePeriod('1-2 weeks'), '1_TO_2_WEEKS');
      assert.equal(normalizeNoticePeriod('1_to_2_weeks'), '1_TO_2_WEEKS');

      assert.equal(normalizeNoticePeriod('30 days'), '30_DAYS');
      assert.equal(normalizeNoticePeriod('30_days'), '30_DAYS');
      assert.equal(normalizeNoticePeriod('1 month'), '30_DAYS');

      assert.equal(normalizeNoticePeriod('60 days'), '60_DAYS');
      assert.equal(normalizeNoticePeriod('60_days'), '60_DAYS');
      assert.equal(normalizeNoticePeriod('2 months'), '60_DAYS');

      assert.equal(normalizeNoticePeriod('90 days'), '90_DAYS');
      assert.equal(normalizeNoticePeriod('90_days'), '90_DAYS');
      assert.equal(normalizeNoticePeriod('3 months'), '90_DAYS');

      assert.equal(normalizeNoticePeriod('custom'), 'CUSTOM');
      assert.equal(normalizeNoticePeriod('CUSTOM'), 'CUSTOM');

      assert.equal(normalizeNoticePeriod(''), null);
      assert.equal(normalizeNoticePeriod(null), null);
      assert.equal(normalizeNoticePeriod(undefined), null);
    });

    it('formats canonical notice period labels accurately for human display', () => {
      assert.equal(formatNoticePeriodLabel('IMMEDIATE'), 'Immediate');
      assert.equal(formatNoticePeriodLabel('LESS_THAN_1_WEEK'), 'Less than 1 week');
      assert.equal(formatNoticePeriodLabel('1_TO_2_WEEKS'), '1–2 weeks');
      assert.equal(formatNoticePeriodLabel('30_DAYS'), '30 days');
      assert.equal(formatNoticePeriodLabel('60_DAYS'), '60 days');
      assert.equal(formatNoticePeriodLabel('90_DAYS'), '90 days');
      assert.equal(formatNoticePeriodLabel('CUSTOM', '45 days'), '45 days');
    });
  });

  describe('Full Profile Enum Audit Normalizers', () => {
    it('normalizes remotePreference values from UI/text to canonical enum', () => {
      assert.equal(normalizeRemotePreference('remote'), 'REMOTE_ONLY');
      assert.equal(normalizeRemotePreference('remote_only'), 'REMOTE_ONLY');
      assert.equal(normalizeRemotePreference('onsite'), 'ON_SITE');
      assert.equal(normalizeRemotePreference('ONSITE'), 'ON_SITE');
      assert.equal(normalizeRemotePreference('on-site'), 'ON_SITE');
      assert.equal(normalizeRemotePreference('on_site'), 'ON_SITE');
      assert.equal(normalizeRemotePreference('hybrid'), 'HYBRID');
      assert.equal(normalizeRemotePreference('flexible'), 'FLEXIBLE');
      assert.equal(normalizeRemotePreference('remote_first'), 'REMOTE_FIRST');
      assert.equal(normalizeRemotePreference('no_preference'), 'NOT_SET');
      assert.equal(normalizeRemotePreference(''), null);
    });

    it('normalizes relocationPreference values from UI/text to canonical enum', () => {
      assert.equal(normalizeRelocationPreference('will_relocate'), 'WILLING_TO_RELOCATE');
      assert.equal(normalizeRelocationPreference('WILL_RELOCATE'), 'WILLING_TO_RELOCATE');
      assert.equal(normalizeRelocationPreference('willing_to_relocate'), 'WILLING_TO_RELOCATE');
      assert.equal(normalizeRelocationPreference('yes'), 'WILLING_TO_RELOCATE');
      assert.equal(normalizeRelocationPreference('open'), 'OPEN_TO_RELOCATION');
      assert.equal(normalizeRelocationPreference('open_to_relocation'), 'OPEN_TO_RELOCATION');
      assert.equal(normalizeRelocationPreference('no'), 'NOT_WILLING');
      assert.equal(normalizeRelocationPreference('not_willing'), 'NOT_WILLING');
      assert.equal(normalizeRelocationPreference('remote_only'), 'REMOTE_ONLY');
      assert.equal(normalizeRelocationPreference(''), null);
    });

    it('normalizes compensationPeriod values from UI/text to canonical enum', () => {
      assert.equal(normalizeCompensationPeriod('annual'), 'YEARLY');
      assert.equal(normalizeCompensationPeriod('ANNUAL'), 'YEARLY');
      assert.equal(normalizeCompensationPeriod('per year'), 'YEARLY');
      assert.equal(normalizeCompensationPeriod('yearly'), 'YEARLY');
      assert.equal(normalizeCompensationPeriod('monthly'), 'MONTHLY');
      assert.equal(normalizeCompensationPeriod('hourly'), 'HOURLY');
      assert.equal(normalizeCompensationPeriod('weekly'), 'WEEKLY');
      assert.equal(normalizeCompensationPeriod(''), null);
    });

    it('normalizes compensationType values to canonical enum', () => {
      assert.equal(normalizeCompensationType('base'), 'BASE_ONLY');
      assert.equal(normalizeCompensationType('base_salary'), 'BASE_ONLY');
      assert.equal(normalizeCompensationType('total'), 'TOTAL_COMP');
      assert.equal(normalizeCompensationType('total_comp'), 'TOTAL_COMP');
      assert.equal(normalizeCompensationType(''), null);
    });

    it('normalizes employmentTypes arrays and single strings', () => {
      assert.deepEqual(normalizeEmploymentTypes(['full-time', 'contract', 'part_time']), [
        'FULL_TIME',
        'CONTRACT',
        'PART_TIME',
      ]);
      assert.deepEqual(normalizeEmploymentTypes('full_time'), ['FULL_TIME']);
      assert.equal(normalizeEmploymentType('internship'), 'INTERNSHIP');
      assert.equal(normalizeEmploymentType('temporary'), 'CONTRACT');
    });

    it('normalizes visaSponsorshipRequired values safely without false defaults', () => {
      assert.equal(normalizeVisaSponsorship(true), 'YES');
      assert.equal(normalizeVisaSponsorship('true'), 'YES');
      assert.equal(normalizeVisaSponsorship('yes'), 'YES');
      assert.equal(normalizeVisaSponsorship('YES'), 'YES');

      assert.equal(normalizeVisaSponsorship(false), 'NO');
      assert.equal(normalizeVisaSponsorship('false'), 'NO');
      assert.equal(normalizeVisaSponsorship('no'), 'NO');
      assert.equal(normalizeVisaSponsorship('NO'), 'NO');

      assert.equal(normalizeVisaSponsorship('unknown'), 'UNKNOWN');
      assert.equal(normalizeVisaSponsorship('depends'), 'UNKNOWN');
      assert.equal(normalizeVisaSponsorship('not_set'), 'NOT_SET');
      assert.equal(normalizeVisaSponsorship(''), null);
      assert.equal(normalizeVisaSponsorship(null), null);
    });

    it('normalizes careerStatus and seniority levels', () => {
      assert.equal(normalizeCareerStatus('fresher'), 'FRESHER');
      assert.equal(normalizeCareerStatus('early career'), 'FRESHER');
      assert.equal(normalizeCareerStatus('employed'), 'EMPLOYED');
      assert.equal(normalizeCareerStatus('mid_level'), 'MID_LEVEL');
      assert.equal(normalizeCareerStatus('senior'), 'SENIOR');
      assert.equal(normalizeCareerStatus('lead'), 'LEAD');
      assert.equal(normalizeCareerStatus('executive'), 'EXECUTIVE');

      assert.equal(normalizeSeniorityLevel('lead'), 'LEAD');
      assert.equal(normalizeSeniorityLevel('principal'), 'PRINCIPAL');
      assert.equal(normalizeSeniorityLevel('intern'), 'INTERN');
    });
  });

  // =========================================================================
  // SCHEMA PREPROCESSING TEST
  // =========================================================================
  describe('Schema Validation Preprocessing', () => {
    it('successfully parses and canonicalizes lowercase and alias values in UpdateCareerPreferencesInputSchema', () => {
      const rawPayload = {
        noticePeriod: 'immediate',
        remotePreference: 'ONSITE',
        relocationPreference: 'WILL_RELOCATE',
        compensationPeriod: 'ANNUAL',
        compensationType: 'base',
        employmentTypes: ['full-time', 'contract'],
        visaSponsorshipRequired: 'no',
        targetSalary: 140000,
      };

      const parsed = UpdateCareerPreferencesInputSchema.safeParse(rawPayload);
      assert.equal(parsed.success, true, 'Schema parse must succeed without 400 rejection');

      const data = parsed.data;
      assert.equal(data.noticePeriod, 'IMMEDIATE');
      assert.equal(data.remotePreference, 'ON_SITE');
      assert.equal(data.relocationPreference, 'WILLING_TO_RELOCATE');
      assert.equal(data.compensationPeriod, 'YEARLY');
      assert.equal(data.compensationType, 'BASE_ONLY');
      assert.deepEqual(data.employmentTypes, ['FULL_TIME', 'CONTRACT']);
      assert.equal(data.visaSponsorshipRequired, 'NO');
      assert.equal(data.targetSalary, 140000);
    });

    it('preserves valid already-canonical enum inputs without alteration', () => {
      const canonicalPayload = {
        noticePeriod: '30_DAYS',
        remotePreference: 'HYBRID',
        relocationPreference: 'OPEN_TO_RELOCATION',
        compensationPeriod: 'MONTHLY',
        compensationType: 'TOTAL_COMP',
        employmentTypes: ['FULL_TIME'],
        visaSponsorshipRequired: 'YES',
      };

      const parsed = UpdateCareerPreferencesInputSchema.safeParse(canonicalPayload);
      assert.equal(parsed.success, true);
      assert.deepEqual(parsed.data, canonicalPayload);
    });
  });

  // =========================================================================
  // PROFILE SAVE ROUND-TRIP INVARIANT & PERSISTENCE TEST
  // =========================================================================
  describe('Profile Save Round-Trip Invariant & Persistence', () => {
    let mockDb;
    let service;
    const tenantId = randomUUID();
    const candidateId = randomUUID();
    const userId = randomUUID();

    const baseContext = {
      tenantId,
      userId,
      role: 'OWNER',
    };

    let candidateRecord;

    beforeEach(() => {
      candidateRecord = {
        id: candidateId,
        tenantId,
        userId,
        displayName: 'Test Engineer',
        headline: 'Staff Engineer',
        summary: 'Deep backend systems architecture.',
        canonicalEmail: 'engineer@example.com',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        profileMetadata: {
          currentRole: 'Staff Engineer',
          location: 'San Francisco, CA',
          careerStatus: 'EMPLOYED',
          currentEmployment: null,
          userCustom: {
            experience: [],
            education: [],
            certifications: [],
            languages: [],
            portfolioLinks: [],
          },
          careerPreferences: {
            targetRoles: ['Backend Engineer'],
            preferredLocations: ['Remote'],
            remotePreference: 'FLEXIBLE',
            employmentTypes: ['FULL_TIME'],
          },
        },
      };

      mockDb = {
        select: () => ({
          from: () => ({
            where: () => {
              const res = Promise.resolve([candidateRecord]);
              res.limit = () => Promise.resolve([candidateRecord]);
              res.orderBy = () => Promise.resolve([candidateRecord]);
              return res;
            },
            leftJoin() {
              return this;
            },
          }),
        }),
        update: () => ({
          set: (updates) => {
            if (updates.displayName) candidateRecord.displayName = updates.displayName;
            if (updates.headline !== undefined) candidateRecord.headline = updates.headline;
            if (updates.summary !== undefined) candidateRecord.summary = updates.summary;
            if (updates.profileMetadata) candidateRecord.profileMetadata = updates.profileMetadata;
            candidateRecord.updatedAt = new Date().toISOString();
            return {
              where: () => {
                const result = Promise.resolve([candidateRecord]);
                result.returning = () => Promise.resolve([candidateRecord]);
                return result;
              },
            };
          },
        }),
      };

      service = new CandidateProfileService(mockDb);
      service.getProfile = async () => ({
        candidate: candidateRecord,
        skills: [],
        projects: [],
        resources: [],
        identities: [],
      });
    });

    it('persists lowercase UI noticePeriod as canonical IMMEDIATE and reloads accurately', async () => {
      // 1. User submits profile with noticePeriod = 'immediate'
      const updateResult = await service.updateUserProfileSections(
        baseContext,
        candidateId,
        {
          sections: {
            eligibility: {
              noticePeriod: 'immediate',
              visaSponsorshipRequired: 'no',
              workAuthorization: ['US Citizen'],
            },
            preferences: {
              remotePreference: 'ONSITE',
              relocationPreference: 'WILL_RELOCATE',
              compensationPeriod: 'ANNUAL',
            },
          },
        },
        { minimalResponse: true }
      );

      assert.equal(updateResult.ok, true, 'Profile save must succeed');

      // Verify canonical storage in profileMetadata
      const savedPrefs = candidateRecord.profileMetadata.careerPreferences;
      assert.equal(savedPrefs.noticePeriod, 'IMMEDIATE', 'Database must store canonical IMMEDIATE');
      assert.equal(savedPrefs.remotePreference, 'ON_SITE', 'Database must store canonical ON_SITE');
      assert.equal(
        savedPrefs.relocationPreference,
        'WILLING_TO_RELOCATE',
        'Database must store canonical WILLING_TO_RELOCATE'
      );
      assert.equal(savedPrefs.compensationPeriod, 'YEARLY', 'Database must store canonical YEARLY');
      assert.equal(savedPrefs.visaSponsorshipRequired, 'NO', 'Database must store canonical NO');

      // 2. Reload profile via getCareerProfile
      const reloaded = await service.getCareerProfile(baseContext, candidateId);
      assert.equal(reloaded.noticePeriod, 'IMMEDIATE');
      assert.equal(reloaded.jobPreferences.noticePeriod, 'IMMEDIATE');
      assert.equal(reloaded.jobPreferences.remotePreference, 'ON_SITE');

      // 3. Render Profile Page with reloaded profile
      const renderedHtml = renderProfilePage({
        user: { id: userId, email: 'engineer@example.com', displayName: 'Test Engineer' },
        candidate: candidateRecord,
        profile: reloaded,
        preferences: reloaded.jobPreferences,
      });

      // Assert UI displays "Immediate" and option value="IMMEDIATE" is selected
      assert.match(
        renderedHtml,
        /<option value="IMMEDIATE" selected>Immediate \(Available immediately\)<\/option>/,
        'Frontend must render canonical option selected'
      );
      assert.match(
        renderedHtml,
        /<strong>Notice Period:<\/strong>\s*Immediate/,
        'Domain snapshot must display human-readable label "Immediate"'
      );
      assert.match(
        renderedHtml,
        /<option value="ON_SITE" selected>Onsite<\/option>/,
        'Frontend must render canonical workplace model ON_SITE selected'
      );
      assert.match(
        renderedHtml,
        /<option value="YEARLY" selected>Annual \(per year\)<\/option>/,
        'Frontend must render canonical pay period YEARLY selected'
      );
    });
  });

  // =========================================================================
  // DOUBLE-SAVE / FORM SUBMISSION SAFETY
  // =========================================================================
  describe('Double-Save & Submission Safety Contract', () => {
    it('verifies client-side profile script contains single-save idempotency guard and Enter key suppression', () => {
      const renderedHtml = renderProfilePage({
        user: { id: 'u1', email: 'test@example.com', displayName: 'Test' },
        candidate: { id: 'c1' },
        profile: { jobPreferences: {} },
      });

      // Idempotency flag check
      assert.match(renderedHtml, /let isSaving = false;/, 'Script must declare isSaving lock flag');
      assert.match(
        renderedHtml,
        /if \(isSaving\) return;/,
        'Submit listener must return early when isSaving is true'
      );
      assert.match(
        renderedHtml,
        /isSaving = true;/,
        'Submit listener must set isSaving = true immediately'
      );

      // Enter key suppression on inputs
      assert.match(
        renderedHtml,
        /e\.key === 'Enter' && e\.target\.tagName === 'INPUT' && e\.target\.type !== 'submit'/,
        'Must intercept Enter key on text inputs to prevent accidental multiple submissions'
      );
      assert.match(
        renderedHtml,
        /e\.preventDefault\(\)/,
        'Must call preventDefault on Enter key in single-line inputs'
      );

      // Button disabling & aria-busy
      assert.match(
        renderedHtml,
        /saveBtn\.disabled = true;/,
        'Save button must be disabled while saving'
      );
      assert.match(
        renderedHtml,
        /saveBtn\.setAttribute\('aria-busy',\s*'true'\);/,
        'Save button must set aria-busy="true"'
      );

      // Reset dirty state only on success
      assert.match(
        renderedHtml,
        /if \(res\.ok\) \{[\s\S]*isDirty = false;[\s\S]*isSaving = false;[\s\S]*updateSaveUI\('SUCCESS'\);/,
        'isDirty must reset only when server returns HTTP 200'
      );

      // Preserve dirty state on error
      assert.match(
        renderedHtml,
        /catch \(err\) \{[\s\S]*isSaving = false;[\s\S]*updateSaveUI\('ERROR'\);/,
        'Catch block must reset isSaving but retain dirty state to preserve candidate edits'
      );
    });
  });
});
