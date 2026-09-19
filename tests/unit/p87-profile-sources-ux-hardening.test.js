/**
 * @file P87: Main-Branch Product Surface Audit & Profile/Sources UX Hardening Test Suite.
 *
 * Validates the 14 mandatory product invariants across:
 * 1. Profile First-Render FOUC Prevention & Header Layout Stability
 * 2. Profile Single Save & Server State Convergence
 * 3. Overview Panel Single Source of Truth (Zero Redundant Disclosures)
 * 4. Sources Workspace & GitHub Return Flow (from=sources preservation)
 * 5. Onboarding Routing Protection (Incomplete users stay in onboarding)
 * 6. Copilot Candidate-Oriented Contextual Prompt Chips
 * 7. Candidate Workspace Tone (Calm, professional UI without engineering jargon)
 * 8. Canonical Ownership & Single Authoritative Surface
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderProfilePage } from '../../src/views/profile.page.js';
import { renderSourcesPage } from '../../src/views/sources.page.js';
import { renderOnboardingPage } from '../../src/views/onboarding.page.js';
import { renderDashboardPage } from '../../src/views/dashboard.page.js';
import { renderResumesPage } from '../../src/views/resumes.page.js';
import { renderCopilotDrawer } from '../../src/views/components/copilot-drawer.js';

describe('P87: Product Surface Audit & UX Hardening Suite', () => {
  const mockUser = {
    id: 'usr-p87-1',
    email: 'grace.hopper@example.com',
    displayName: 'Grace Hopper',
  };

  const mockCandidate = {
    id: 'cand-p87-1',
    displayName: 'Grace Hopper',
    headline: 'Distinguished Systems Engineer',
    profileMetadata: {
      location: 'New York, NY',
      currentRole: 'Chief Scientist',
      careerStatus: 'LEAD',
      userCustom: {
        summary: 'Pioneered compiled languages and compiler validation architecture.',
        phone: '+1 555-0199',
        countryCode: '+1',
        phoneNumber: '555-0199',
        linkedin: 'https://linkedin.com/in/gracehopper',
        github: 'https://github.com/gracehopper',
        portfolio: 'https://hopper.dev',
        experience: [
          {
            title: 'Chief Scientist',
            company: 'Compiler Labs',
            startDate: '2020-01',
            endDate: 'Present',
            isCurrent: true,
            description: 'Building verifiable intermediate representations.',
          },
        ],
        education: [
          {
            institution: 'Yale University',
            degree: 'Ph.D.',
            fieldOfStudy: 'Mathematics',
            graduationYear: '1934',
          },
        ],
        certifications: [],
        languages: [{ language: 'English', proficiency: 'Native' }],
        projects: [
          {
            name: 'A-0 Compiler',
            description: 'The first electronic compiler system.',
            technologies: ['Assembly', 'Machine Code'],
            repositoryUrl: 'https://github.com/gracehopper/a0-compiler',
          },
        ],
      },
      careerPreferences: {
        targetRoles: ['Principal Compiler Engineer', 'Systems Architect'],
        preferredLocations: ['Remote', 'New York, NY'],
        remotePreference: 'REMOTE_ONLY',
        employmentTypes: ['FULL_TIME'],
        salaryFloor: 180000,
        targetSalary: 220000,
        salaryCurrency: 'USD',
        compensationPeriod: 'ANNUAL',
        workAuthorization: ['US Citizen'],
        visaSponsorshipRequired: 'NO',
        noticePeriod: '30_days',
        availabilityDate: '2026-12-01',
        workAuthConfirmedByUser: true,
        visaSponsorshipConfirmedByUser: true,
      },
    },
  };

  const mockProfile = {
    canonicalEmail: 'grace.hopper@example.com',
    displayName: 'Grace Hopper',
    headline: 'Distinguished Systems Engineer',
    currentRole: 'Chief Scientist',
    location: 'New York, NY',
    careerStatus: 'LEAD',
    summary: 'Pioneered compiled languages and compiler validation architecture.',
    primarySkills: [
      { skillName: 'Systems Architecture', provenanceStatus: 'VERIFIED' },
      { skillName: 'Compilers', provenanceStatus: 'VERIFIED' },
    ],
    technologySignals: [],
    highlightedProjects: [
      {
        name: 'A-0 Compiler',
        description: 'The first electronic compiler system.',
        technologies: ['Assembly', 'Machine Code'],
        repositoryUrl: 'https://github.com/gracehopper/a0-compiler',
      },
    ],
    jobPreferences: mockCandidate.profileMetadata.careerPreferences,
    profileReadiness: {
      score: 100,
      status: 'PROFILE POPULATED',
      isComplete: true,
      missingFields: [],
      actionableFeedback: 'All critical parameters verified',
    },
  };

  // ---------------------------------------------------------------------------
  // 1. Profile First-Render & Layout Stability
  // ---------------------------------------------------------------------------
  describe('1. Profile First-Render & Layout Stability (FOUC Prevention)', () => {
    it('hoists the <style> block before HTML markup to eliminate flash of unstyled content', () => {
      const html = renderProfilePage({
        user: mockUser,
        candidate: mockCandidate,
        profile: mockProfile,
        activeSection: 'overview',
      });

      const stylePos = html.indexOf('<style>');
      const containerPos = html.indexOf('class="profile-page-container"');
      const anchorsPos = html.indexOf('id="section-contact"');

      assert.ok(stylePos !== -1, 'Page must contain <style> tag');
      assert.ok(containerPos !== -1, 'Page must contain .profile-page-container');
      assert.ok(stylePos < containerPos, '<style> must be parsed before .profile-page-container paints');
      assert.ok(stylePos < anchorsPos, '<style> must be parsed before anchor targets');
    });

    it('enforces layout containment and 1:1 aspect ratio on .avatar-badge to prevent visual shift', () => {
      const html = renderProfilePage({
        user: mockUser,
        candidate: mockCandidate,
        profile: mockProfile,
        activeSection: 'overview',
      });

      assert.ok(html.includes('contain: layout size;'), 'Must specify contain: layout size on avatar badge');
      assert.ok(html.includes('aspect-ratio: 1 / 1;'), 'Must specify aspect-ratio: 1 / 1 on avatar badge');
      assert.ok(html.includes('id="headerAvatarInitial"'), 'Must have id="headerAvatarInitial" for targeted client reconciliation');
      assert.ok(html.includes('id="headerCandidateDisplayName"'), 'Must have id="headerCandidateDisplayName" for instant name update');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Profile Single Save & Server State Convergence
  // ---------------------------------------------------------------------------
  describe('2. Profile Single Save & State Convergence', () => {
    it('has exactly one primary save button tied to the form', () => {
      const html = renderProfilePage({
        user: mockUser,
        candidate: mockCandidate,
        profile: mockProfile,
        activeSection: 'overview',
      });

      const saveButtons = html.match(/id="headerSaveBtn"/g) || [];
      assert.strictEqual(saveButtons.length, 1, 'Form must have exactly one authoritative save button');
      assert.ok(html.includes('form="careerProfileForm"'), 'Save button must be bound to #careerProfileForm');
    });

    it('client script includes response consumption logic to update header display name & avatar initial', () => {
      const html = renderProfilePage({
        user: mockUser,
        candidate: mockCandidate,
        profile: mockProfile,
        activeSection: 'professional',
      });

      assert.ok(
        html.includes("document.getElementById('headerCandidateDisplayName')"),
        'Script must reconcile #headerCandidateDisplayName from server response'
      );
      assert.ok(
        html.includes("document.getElementById('headerAvatarInitial')"),
        'Script must reconcile #headerAvatarInitial from server response'
      );
      assert.ok(
        html.includes('resData.displayName'),
        'Script must consume resData.displayName from JSON response'
      );
      assert.ok(
        html.includes("updateSaveUI('SUCCESS')"),
        'Script must transition save indicator to SUCCESS on 200 OK'
      );
      assert.ok(
        html.includes("updateSaveUI('ERROR')"),
        'Script must transition save indicator to ERROR on failure without discarding dirty input'
      );
    });

    it('enforces beforeunload guard when changes are unsaved', () => {
      const html = renderProfilePage({
        user: mockUser,
        candidate: mockCandidate,
        profile: mockProfile,
      });

      assert.ok(html.includes('beforeunload'), 'Must register beforeunload listener');
      assert.ok(html.includes('isDirty'), 'Must guard against navigating away with unsaved state');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Overview Panel: Zero Duplicate Information
  // ---------------------------------------------------------------------------
  describe('3. Overview Panel Information Architecture (Invariant 2)', () => {
    it('renders readiness hero gauge and dual grid without a 3rd duplicate checklist disclosure', () => {
      const html = renderProfilePage({
        user: mockUser,
        candidate: mockCandidate,
        profile: mockProfile,
        activeSection: 'overview',
      });

      // Gauge is present
      assert.ok(html.includes('gauge-circle'), 'Must render circular readiness gauge');

      // Dual Grid has verified checklist and attention items
      assert.ok(html.includes('readiness-dual-grid'), 'Must render calm dual grid');
      assert.ok(html.includes('Application Readiness Checklist'), 'Must render readiness checklist in dual grid');
      assert.ok(html.includes('status-ready'), 'Must render status-ready items');

      // 3rd duplicate disclosure has been removed
      assert.ok(
        !html.includes('checklist-disclosure'),
        'Must NOT render redundant 3rd disclosure checklist on Overview'
      );
      assert.ok(
        !html.includes('Application Readiness Checklist (Full breakdown)'),
        'Must NOT render redundant breakdown disclosure'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Sources Workspace & GitHub Return Flow (Invariant 7)
  // ---------------------------------------------------------------------------
  describe('4. Sources Workspace & GitHub Return Flow', () => {
    it('links repository management from Sources with from=sources query parameter', () => {
      const html = renderSourcesPage({
        user: mockUser,
        gitHubConnection: {
          id: 'conn-1',
          status: 'ACTIVE',
          connected: true,
          externalAccountName: 'gracehopper',
          repositories: [{ id: '1', name: 'a0-compiler', isPrivate: false }],
        },
        resources: [{ id: '1', name: 'a0-compiler', externalResourceId: '1', isPrivate: false }],
      });

      assert.ok(
        html.includes('href="/onboarding?step=3&from=sources"'),
        'Manage Repositories button in Sources must preserve from=sources'
      );
      assert.ok(
        !html.includes('href="/onboarding?step=3" class="btn btn-secondary btn-sm">Manage Repositories'),
        'Must not have bare /onboarding?step=3 link without from=sources'
      );
    });

    it('onboarding step 3 preserves from=sources with hidden input and return button', () => {
      const html = renderOnboardingPage({
        user: mockUser,
        tenant: { id: 't-1', name: 'Hopper Org' },
        candidate: mockCandidate,
        currentStep: 3,
        from: 'sources',
        availableRepos: [
          { id: '1', name: 'a0-compiler', fullName: 'gracehopper/a0-compiler', isPrivate: false },
        ],
        selectedRepos: [],
      });

      assert.ok(
        html.includes('<input type="hidden" name="from" value="sources">'),
        'Step 3 form must submit hidden from=sources'
      );
      assert.ok(
        html.includes('href="/sources" class="btn btn-secondary">← Back to Sources</a>'),
        'Back button must return directly to /sources when from=sources'
      );
      assert.ok(
        html.includes('Save Repositories & Return to Sources →'),
        'Submit button must indicate return to Sources'
      );
    });

    it('onboarding step 3 without from parameter preserves standard onboarding flow', () => {
      const html = renderOnboardingPage({
        user: mockUser,
        tenant: { id: 't-1', name: 'Hopper Org' },
        candidate: mockCandidate,
        currentStep: 3,
        from: '',
        availableRepos: [
          { id: '1', name: 'a0-compiler', fullName: 'gracehopper/a0-compiler', isPrivate: false },
        ],
      });

      assert.ok(
        html.includes('href="/onboarding?step=2" class="btn btn-secondary">← Back to GitHub</a>'),
        'Back button must return to Step 2 in standard onboarding'
      );
      assert.ok(
        html.includes('Save Selection &amp; Run Ingestion →'),
        'Submit button must proceed to Step 4 ingestion in standard onboarding'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Copilot Placement & Candidate Relevance (Invariant 8)
  // ---------------------------------------------------------------------------
  describe('5. Copilot Placement & Candidate Relevance', () => {
    it('profile context provides real candidate screening questions', () => {
      const html = renderCopilotDrawer({ pageContext: 'profile' });
      assert.ok(
        html.includes('What is missing for employer screening?'),
        'Profile Copilot must offer screening completeness prompt'
      );
      assert.ok(
        html.includes('Improve my professional summary'),
        'Profile Copilot must offer summary improvement prompt'
      );
      assert.ok(
        html.includes('Check application readiness'),
        'Profile Copilot must offer readiness evaluation prompt'
      );
    });

    it('sources context provides repository alignment questions', () => {
      const html = renderCopilotDrawer({ pageContext: 'sources' });
      assert.ok(
        html.includes('Which repositories best support my target role?'),
        'Sources Copilot must offer repository alignment prompt'
      );
      assert.ok(
        html.includes('Review active base resume'),
        'Sources Copilot must offer resume review prompt'
      );
    });

    it('job / radar context provides candidate skill-match questions', () => {
      const html = renderCopilotDrawer({ pageContext: 'radar' });
      assert.ok(
        html.includes('How well do my verified skills match this role?'),
        'Job Copilot must offer verified match prompt'
      );
      assert.ok(
        html.includes('What skills am I missing?'),
        'Job Copilot must offer skill gaps prompt'
      );
    });

    it('applications context provides screening question review prompts', () => {
      const html = renderCopilotDrawer({ pageContext: 'applications' });
      assert.ok(
        html.includes('What fields still need my attention?'),
        'Applications Copilot must offer attention items prompt'
      );
      assert.ok(
        html.includes('Review my application answers'),
        'Applications Copilot must offer answer review prompt'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Professional Minimal Tone (Invariant 10)
  // ---------------------------------------------------------------------------
  describe('6. Professional Minimal Tone & Calm Experience', () => {
    it('dashboard greeting card displays candidate identity and readiness bar cleanly without noise', () => {
      const html = renderDashboardPage({
        user: mockUser,
        tenant: { id: 't-1', name: 'Hopper Org' },
        candidate: mockCandidate,
        readiness: {
          readinessScore: 100,
          missingFields: [],
        },
        skills: [{ name: 'Compilers' }],
        projects: [{ name: 'A-0 Compiler' }],
      });

      assert.ok(html.includes('Grace Hopper'), 'Greeting must display candidate name');
      assert.ok(html.includes('Application Readiness'), 'Greeting must display authoritative readiness bar');
      assert.ok(html.includes('All key screening fields verified'), 'Must confirm readiness cleanly');
      // Verify no cluttered chip cluster crammed directly under the name
      assert.ok(
        !html.includes('badge badge-neutral" style="font-size:0.7rem; padding:1px 6px;"'),
        'Greeting should not have redundant project chip cluster'
      );
    });

    it('resumes page uses candidate-facing narrative text instead of TRUTH BOUNDARY jargon', () => {
      const html = renderResumesPage({
        user: mockUser,
        candidate: mockCandidate,
        resumesList: [
          {
            id: 'res-1',
            fileName: 'grace-hopper-cv.pdf',
            isBaseResume: true,
            version: 1,
            fileSizeBytes: 204800,
            contentHash: 'a1b2c3d4e5f6',
            createdAt: new Date().toISOString(),
            lifecycleState: 'USER_APPROVED',
          },
        ],
      });

      assert.ok(
        html.includes('CANDIDATE NARRATIVE'),
        'Must display professional CANDIDATE NARRATIVE badge'
      );
      assert.ok(
        html.includes('Authentic Resume History'),
        'Must describe authentic candidate-authored resume history'
      );
      assert.ok(
        !html.includes('TRUTH BOUNDARY'),
        'Must NOT expose engineering debug badge TRUTH BOUNDARY'
      );
      assert.ok(
        !html.includes('CLAIMED [Unverified User Claim]'),
        'Must NOT expose internal debug string CLAIMED [Unverified User Claim]'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Canonical Ownership (Invariant 1)
  // ---------------------------------------------------------------------------
  describe('7. Canonical Ownership & Single Authoritative Surface', () => {
    it('profile page locks verified skills and repository projects from arbitrary text overwriting', () => {
      const html = renderProfilePage({
        user: mockUser,
        candidate: mockCandidate,
        profile: mockProfile,
        activeSection: 'skills-projects',
      });

      // Verified skills should be displayed as authoritative chips with provenance indicators, not free-form text inputs
      assert.ok(html.includes('skill-chip'), 'Skills must be rendered as authoritative chips');
      assert.ok(html.includes('chip-verified'), 'Verified skills must retain provenance');
      assert.ok(
        !html.includes('<input type="text" name="primarySkills"'),
        'Verified skills must not have raw text inputs'
      );
    });
  });
});
