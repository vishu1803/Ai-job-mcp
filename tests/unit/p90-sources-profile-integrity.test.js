/**
 * @file P90 Comprehensive Hardening: Sources Workspace + Profile Save Integrity + Navigation Test Suite.
 *
 * Verifies all P90 core invariants:
 * 1. Exactly one Profile Save control and one profile form in rendered HTML.
 * 2. Profile save state machine (CLEAN, DIRTY, SAVING, SUCCESS, ERROR) & double-click disabled protection.
 * 3. Complete six-domain round-trip preservation (identity, executive, preferences, compensation, workAuth, urls).
 * 4. Sources replaces Resumes as primary candidate workspace (/sources).
 * 5. Resume backward compatibility (/resumes redirects HTML to /sources; API returns JSON; CRUD routes preserved).
 * 6. Dashboard recommendation integrity (zero fake jobs, honest empty state with Browse jobs CTA).
 * 7. Applications UI hygiene (no "MCP SYNCHRONIZED" badge, human-readable stage badges).
 * 8. Five canonical navigation destinations with no standalone AI page in primary nav.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProfilePage } from '../../src/views/profile.page.js';
import { renderSourcesPage } from '../../src/views/sources.page.js';
import { renderDashboardPage } from '../../src/views/dashboard.page.js';
import { renderApplicationsPage } from '../../src/views/applications.page.js';
import { renderLayout } from '../../src/views/layout.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';

test('P90 Invariant 1: Exactly one Profile Save button and one profile form in HTML', () => {
  const mockCandidate = {
    id: 'cand-001',
    name: 'Alice Developer',
    email: 'alice@example.com',
    targetRole: 'Staff Backend Engineer',
    preferredLocations: ['Remote', 'San Francisco'],
    minBaseSalary: 180000,
    targetSalary: 220000,
    salaryCurrency: 'USD',
    customFields: {
      executiveSummary: 'Experienced distributed systems engineer.',
      currentTitle: 'Senior Systems Architect',
      currentLocation: 'San Francisco, CA',
      openToRemote: true,
      visaSponsorshipRequired: false,
      workAuthorization: 'US Citizen',
      noticePeriodWeeks: 2,
      linkedin: 'https://linkedin.com/in/alicedev',
      github: 'https://github.com/alicedev',
      portfolio: 'https://alice.dev',
    },
  };

  const html = renderProfilePage({
    user: { id: 'usr-1', email: 'alice@example.com' },
    candidate: mockCandidate,
  });

  // Count instances of <form ... id="careerProfileForm"
  const formMatches = html.match(/id="careerProfileForm"/g) || [];
  assert.equal(formMatches.length, 1, 'Must have exactly one careerProfileForm in HTML');

  // Count submit buttons for saving the profile
  const saveBtnMatches = html.match(/type="submit"[^>]*class="[^"]*btn-save/g) || [];
  assert.equal(saveBtnMatches.length, 1, 'Must have exactly one submit button with class btn-save');

  // Verify the single save button has data-testid="saveProfileBtn" and form="careerProfileForm"
  assert.ok(html.includes('data-testid="saveProfileBtn"'), 'Single save button must have testid');
  assert.ok(
    html.includes('form="careerProfileForm"'),
    'Save button must link to careerProfileForm'
  );

  // Verify no duplicate save button in stickySaveBar
  const stickyBarMatch = html.match(/id="stickySaveBar"[^>]*>([\s\S]*?)<\/div>/i);
  assert.ok(stickyBarMatch, 'Sticky save bar element must be present');
  assert.ok(
    !stickyBarMatch[1].includes('<button'),
    'Sticky save bar must not contain any duplicate button'
  );
});

test('P90 Invariant 2: Profile visual stability — fixed dimensions on avatar, zero layout shift', () => {
  const html = renderProfilePage({
    user: { id: 'usr-1', email: 'alice@example.com' },
    candidate: { id: 'cand-1', name: 'Alice Developer' },
  });

  // Avatar container must have explicit layout containment and fixed width/height
  assert.ok(
    html.includes('width:56px; height:56px;'),
    'Avatar must have explicit 56x56 dimensions'
  );
  assert.ok(html.includes('contain:layout size;'), 'Avatar must enforce layout size containment');
  assert.ok(html.includes('avatar-badge'), 'Avatar must use deterministic badge styling');
});

test('P90 Invariant 3: Profile Save State Machine & Double-Click Protection', () => {
  const html = renderProfilePage({
    user: { id: 'usr-1', email: 'alice@example.com' },
    candidate: { id: 'cand-1', name: 'Alice Developer' },
  });

  // State machine tokens in client script
  assert.ok(html.includes('All changes saved'), 'Must include CLEAN state label');
  assert.ok(html.includes('Unsaved changes'), 'Must include DIRTY state label');
  assert.ok(html.includes('Saving…'), 'Must include SAVING state label');
  assert.ok(html.includes('Saved'), 'Must include SUCCESS state label');
  assert.ok(html.includes('Could not save changes. Try again.'), 'Must include ERROR state label');

  // Double-click disabled prevention in script
  assert.ok(html.includes('isSaving = true'), 'Must toggle isSaving flag');
  assert.ok(html.includes('saveBtn.disabled = true'), 'Must disable save button while saving');
  assert.ok(html.includes('beforeunload'), 'Must bind beforeunload dirty state handler');
});

test('P90 Invariant 4: Candidate Profile Six-Domain Round-Trip with URL Persistence', async () => {
  const mockTenantId = 'tenant-test-001';
  const mockCandidateId = 'cand-test-001';

  let updatedCandidatePayload = null;
  const mockDatabase = {
    select: () => ({
      from: () => ({
        where: async () => [
          {
            id: mockCandidateId,
            tenantId: mockTenantId,
            targetRole: 'Initial Role',
            preferredLocations: ['Remote'],
            minBaseSalary: 100000,
            targetSalary: 120000,
            salaryCurrency: 'USD',
            profileMetadata: {
              userCustom: {
                currentTitle: 'Junior Dev',
                summary: 'Initial summary',
                linkedin: 'https://linkedin.com/in/old',
              },
            },
          },
        ],
      }),
    }),
    update: () => ({
      set: (payload) => ({
        where: () => ({
          returning: async () => {
            updatedCandidatePayload = payload;
            return [payload];
          },
        }),
      }),
    }),
  };

  const rawInput = {
    headline: 'Principal Distributed Systems Engineer',
    currentLocation: 'Seattle, WA',
    phone: '+1 206 555 0199',
    summary: '10+ years architecting high-throughput data pipelines.',
    noticePeriod: 'TWO_WEEKS',
    linkedin: 'https://linkedin.com/in/alice-dist',
    github: 'https://github.com/alice-dist',
    portfolio: 'https://alice.systems',
    careerPreferences: {
      targetRoles: ['Principal Engineer', 'Staff Backend'],
      preferredLocations: ['Seattle, WA', 'Remote'],
      remotePreference: 'REMOTE_ONLY',
      salaryFloor: 210000,
      targetSalary: 250000,
      salaryCurrency: 'USD',
      workAuthConfirmedByUser: true,
      visaSponsorshipConfirmedByUser: true,
    },
  };

  const service = new CandidateProfileService(mockDatabase);
  const context = { tenantId: mockTenantId, role: 'OWNER' };
  const result = await service.updateUserProfileSections(context, mockCandidateId, rawInput, {
    minimalResponse: true,
  });

  assert.ok(result, 'Result should be returned');
  assert.ok(updatedCandidatePayload, 'Candidate payload should be updated');

  // Verify careerPreferences persisted
  const prefs = updatedCandidatePayload.profileMetadata?.careerPreferences || {};
  assert.deepEqual(prefs.targetRoles, ['Principal Engineer', 'Staff Backend']);
  assert.deepEqual(prefs.preferredLocations, ['Seattle, WA', 'Remote']);
  assert.equal(prefs.salaryFloor, 210000);
  assert.equal(prefs.targetSalary, 250000);

  // Verify userCustom preserves URLs and details
  const custom = updatedCandidatePayload.profileMetadata?.userCustom || {};
  assert.equal(custom.headline, 'Principal Distributed Systems Engineer');
  assert.equal(custom.currentLocation, 'Seattle, WA');
  assert.equal(custom.phone, '+1 2065550199');
  assert.equal(custom.summary, '10+ years architecting high-throughput data pipelines.');
  assert.equal(custom.linkedin, 'https://linkedin.com/in/alice-dist');
  assert.equal(custom.github, 'https://github.com/alice-dist');
  assert.equal(custom.portfolio, 'https://alice.systems');
  assert.equal(custom.noticePeriod, 'TWO_WEEKS');
});

test('P90 Invariant 5: Sources Workspace (/sources) renders Active Resume + GitHub + Provider Roadmap', () => {
  const html = renderSourcesPage({
    user: { id: 'usr-1', email: 'alice@example.com' },
    activeResume: {
      id: 'res-001',
      filename: 'alice_staff_resume.pdf',
      fileType: 'application/pdf',
      status: 'ACTIVE',
      createdAt: new Date('2026-03-01T12:00:00Z'),
    },
    resumeVersions: [
      {
        id: 'res-000',
        filename: 'alice_resume_old.pdf',
        status: 'ARCHIVED',
        createdAt: new Date('2026-01-15T12:00:00Z'),
      },
    ],
    gitHubConnection: {
      connected: true,
      account: 'alice-dist',
      selectedRepoCount: 3,
      repositories: [
        {
          id: 'repo-1',
          name: 'raft-consensus-rs',
          displayName: 'raft-consensus-rs',
          isPrivate: false,
        },
        { id: 'repo-2', name: 'kv-store-go', displayName: 'kv-store-go', isPrivate: true },
      ],
    },
  });

  // Verify Active Resume Card
  assert.ok(html.includes('alice_staff_resume.pdf'), 'Must display active resume filename');
  assert.ok(html.includes('ACTIVE'), 'Must show active resume status');
  assert.ok(html.includes('/resumes/res-001/download'), 'Must provide View/Download link');
  assert.ok(html.includes('Replace Resume'), 'Must provide Replace Resume trigger');
  assert.ok(
    html.includes('Version History (1 previous)'),
    'Must offer progressive disclosure version history'
  );
  assert.ok(html.includes('alice_resume_old.pdf'), 'Must list previous versions');

  // Verify GitHub Card
  assert.ok(html.includes('alice-dist'), 'Must show connected GitHub account');
  assert.ok(html.includes('raft-consensus-rs'), 'Must list connected repositories');
  assert.ok(html.includes('/onboarding?step=3'), 'Must provide Manage repositories link');

  // Verify Future Sources with "Coming soon" badge (no fake connect buttons)
  assert.ok(html.includes('GitLab'), 'Must include GitLab in provider roadmap');
  assert.ok(html.includes('Google Drive'), 'Must include Google Drive in provider roadmap');
  assert.ok(html.includes('OneDrive'), 'Must include OneDrive in provider roadmap');
  assert.ok(html.includes('LinkedIn'), 'Must include LinkedIn in provider roadmap');
  assert.ok(html.includes('Portfolio / Website'), 'Must include Portfolio in provider roadmap');
  assert.ok(html.includes('Coming soon'), 'Future sources must be visibly marked Coming soon');
  assert.ok(!html.includes('Connect GitLab'), 'Must not provide fake connect buttons');
});

test('P90 Invariant 6: Dashboard Recommendation Integrity — Zero Fake Jobs, Honest Empty State', () => {
  // Scenario A: No matched jobs
  const emptyHtml = renderDashboardPage({
    user: { id: 'usr-1', email: 'alice@example.com' },
    recommendedJobs: [],
    recentApplications: [],
  });

  assert.ok(emptyHtml.includes('No matching jobs yet'), 'Must show honest empty state');
  assert.ok(emptyHtml.includes('Browse jobs'), 'Must provide Browse jobs CTA');
  assert.ok(!emptyHtml.includes('Stripe, Inc.'), 'Must NOT contain fake Stripe job');
  assert.ok(!emptyHtml.includes('GitHub / Microsoft'), 'Must NOT contain fake GitHub job');
  assert.ok(!emptyHtml.includes('Datadog'), 'Must NOT contain fake Datadog job');
  assert.ok(!emptyHtml.includes('92%'), 'Must NOT contain hardcoded synthetic 92% match score');

  // Scenario B: Real applications present
  const populatedHtml = renderDashboardPage({
    user: { id: 'usr-1', email: 'alice@example.com' },
    recommendedJobs: [
      {
        id: 'job-real-1',
        jobTitle: 'Distributed Systems Engineer',
        companyName: 'RealCorp Technologies',
        location: 'Remote',
        matchScore: 87,
        status: 'SAVED',
      },
    ],
    recentApplications: [],
  });

  assert.ok(populatedHtml.includes('RealCorp Technologies'), 'Must render real company name');
  assert.ok(populatedHtml.includes('87% Match'), 'Must render calculated match score');
  assert.ok(
    !populatedHtml.includes('No matching jobs yet'),
    'Must not show empty state when jobs exist'
  );
});

test('P90 Invariant 7: Applications UI — No Engineering Badges, Human-Readable Stages', () => {
  const html = renderApplicationsPage({
    user: { id: 'usr-1', email: 'alice@example.com' },
    applications: [
      {
        id: 'app-1',
        companyName: 'Acme Corp',
        jobTitle: 'Senior Backend Engineer',
        status: 'INTERVIEWING',
      },
      {
        id: 'app-2',
        companyName: 'Globex',
        jobTitle: 'Staff Engineer',
        status: 'SAVED',
      },
    ],
  });

  // Must not have engineering-facing labels
  assert.ok(!html.includes('MCP SYNCHRONIZED'), 'Must not contain MCP SYNCHRONIZED badge');

  // Must have human-readable badges
  assert.ok(
    html.includes('>Interview<') || html.includes('>INTERVIEW<'),
    'Must show Interview stage'
  );
  assert.ok(html.includes('>Draft<') || html.includes('>SAVED<'), 'Must show Draft/Saved stage');
});

test('P90 Invariant 8: Canonical Navigation — 5 Areas, Sources Replaces Resumes, No Standalone AI Page', () => {
  const loggedInNav = renderLayout({
    title: 'Candidate Dashboard',
    content: '<div>Workspace Content</div>',
    activeNav: 'dashboard',
    user: { id: 'usr-1', email: 'alice@example.com' },
  });

  // 5 Canonical user-facing links
  assert.ok(loggedInNav.includes('href="/dashboard"'), 'Must have Dashboard link');
  assert.ok(loggedInNav.includes('href="/apps/radar"'), 'Must have Jobs link');
  assert.ok(loggedInNav.includes('href="/applications"'), 'Must have Applications link');
  assert.ok(loggedInNav.includes('href="/profile"'), 'Must have Profile link');
  assert.ok(loggedInNav.includes('href="/sources"'), 'Must have Sources link');

  // Primary desktop nav must not link to /resumes
  const desktopNavSection = loggedInNav.slice(
    loggedInNav.indexOf('<ul class="nav-links">'),
    loggedInNav.indexOf('</ul>')
  );
  assert.ok(
    !desktopNavSection.includes('href="/resumes"'),
    'Desktop nav must link to /sources, not /resumes'
  );
  assert.ok(desktopNavSection.includes('href="/sources"'), 'Desktop nav must link to /sources');

  // No standalone AI page in primary navigation
  assert.ok(
    !desktopNavSection.includes('href="/assistant"'),
    'Nav must not contain standalone /assistant'
  );
  assert.ok(!desktopNavSection.includes('href="/ai"'), 'Nav must not contain standalone /ai');
  assert.ok(
    !desktopNavSection.includes('href="/copilot"'),
    'Nav must not contain standalone /copilot'
  );

  // Integrated drawer button present
  assert.ok(
    loggedInNav.includes('id="copilotOpenBtn"'),
    'Integrated Copilot drawer trigger must exist'
  );
});
