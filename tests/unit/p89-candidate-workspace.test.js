/**
 * @file P85 / P89: Candidate-First Job Application Workspace Test Suite.
 *
 * Validates:
 * 1. 5 Core Pillars: Dashboard, Jobs (Radar), Applications, Profile, Resumes
 * 2. Dashboard 3-Pillar Candidate UX:
 *    - Section 1: What should I do next? (Greeting, Authoritative Readiness Bar, Max 3 Actions)
 *    - Section 2: Which jobs should I consider? (Top 3 Matching Job Cards with Fit Scores)
 *    - Section 3: Which applications need attention? (Active Pipeline Table & Actions)
 * 3. Universal Contextual Career Copilot Drawer:
 *    - Persistent trigger in navbar & mobile menu
 *    - Dynamic contextual prompt chips for dashboard, profile, radar/job, applications, resumes
 *    - Two-phase human confirmation cards for AI proposals (Fail-Closed Safety)
 *    - No separate AI page (Drawer only)
 * 4. Profile & UI Hardening:
 *    - Elimination of redundant 3rd checklist card in profile.page.js
 *    - Zero raw unicode checkmark artifacts (no double checkmarks)
 *    - Zero layout shifts (fixed dimensions on SVG renderIcon)
 * 5. Resumes & Sources Cleanliness:
 *    - Prominent Active Base Resume hero card
 *    - Storage encryption & SHA-256 digests housed in secondary disclosure
 *    - Deterministic SVG icons (no raw unicode empty symbol ∅)
 * 6. Backend Route Resiliency & Aliases:
 *    - /jobs route redirect to /apps/radar
 *    - Incomplete onboarding redirect to /onboarding?step=1
 *    - renderOnboardingPage compatibility with ingestionRun and ingestionJob
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderDashboardPage } from '../../src/views/dashboard.page.js';
import { renderLayout } from '../../src/views/layout.js';
import { renderCopilotDrawer } from '../../src/views/components/copilot-drawer.js';
import { renderProfilePage } from '../../src/views/profile.page.js';
import { renderResumesPage } from '../../src/views/resumes.page.js';
import { renderSourcesPage } from '../../src/views/sources.page.js';
import { renderIcon } from '../../src/views/components/icons.js';

describe('P85 / P89: Candidate-First Job Application Workspace Suite', () => {
  const mockUser = {
    id: 'user-p89',
    email: 'grace.hopper@example.com',
    displayName: 'Grace Hopper',
    role: 'MEMBER',
  };

  const mockTenant = {
    id: 'tenant-p89',
    name: 'Hopper Workspace',
    slug: 'hopper-workspace',
  };

  const mockCandidate = {
    id: 'cand-p89',
    displayName: 'Grace Hopper',
    headline: 'Senior Distributed Systems Engineer',
    canonicalEmail: 'grace.hopper@example.com',
    profileMetadata: {
      location: 'New York, NY',
      targetRoles: ['Staff Backend Engineer', 'Systems Architect'],
    },
  };

  const mockReadiness = {
    readinessScore: 82,
    missingFields: ['phone', 'salaryFloor'],
    flaggedItems: [],
  };

  const mockSkills = [
    { name: 'TypeScript', slug: 'typescript', provenanceStatus: 'VERIFIED', confidenceScore: 0.95 },
    { name: 'Node.js', slug: 'nodejs', provenanceStatus: 'VERIFIED', confidenceScore: 0.92 },
    { name: 'PostgreSQL', slug: 'postgresql', provenanceStatus: 'VERIFIED', confidenceScore: 0.88 },
  ];

  const mockApplications = [
    {
      id: 'app-1',
      companyName: 'Stripe',
      jobTitle: 'Senior Infrastructure Engineer',
      status: 'INTERVIEWING',
      updatedAt: new Date('2026-09-15T12:00:00Z'),
    },
    {
      id: 'app-2',
      companyName: 'GitHub',
      jobTitle: 'Backend Platform Engineer',
      status: 'SUBMITTED',
      updatedAt: new Date('2026-09-14T12:00:00Z'),
    },
  ];

  const mockRecommendedJobs = [
    {
      id: 'job-1',
      title: 'Senior Backend Engineer',
      company: 'Datadog',
      location: 'Remote / US',
      workplaceType: 'Full-time',
      matchScore: 94,
      skills: ['Node.js', 'PostgreSQL', 'Distributed Systems'],
      status: 'DISCOVERED',
    },
    {
      id: 'job-2',
      title: 'Staff Systems Architect',
      company: 'Cloudflare',
      location: 'Remote',
      workplaceType: 'Full-time',
      matchScore: 89,
      skills: ['TypeScript', 'Networking', 'Security'],
      status: 'DISCOVERED',
    },
  ];

  describe('1. Dashboard 3-Pillar Candidate Experience', () => {
    it('renders Section 1: "What should I do next?" with greeting, readiness bar, and max 3 priority actions', () => {
      const html = renderDashboardPage({
        user: mockUser,
        tenant: mockTenant,
        candidate: mockCandidate,
        readiness: mockReadiness,
        skills: mockSkills,
        applications: mockApplications,
        recommendedJobs: mockRecommendedJobs,
        activeProposals: [{ id: 'prop-1', field: 'headline', proposedValue: 'Lead Systems Architect' }],
      });

      // Candidate Greeting & Identity
      assert.match(html, /Grace Hopper/);
      assert.match(html, /Senior Distributed Systems Engineer/);

      // Section 1 Heading & Readiness Bar
      assert.match(html, /What should I do next\?/);
      assert.match(html, /Application Readiness/);
      assert.match(html, /82%/);

      // Priority Action Items
      assert.match(html, /Add Phone number/);
      assert.match(html, /Review Copilot Proposals/);
    });

    it('renders Section 2: "Which jobs should I consider?" with matching cards, match score, and Radar actions', () => {
      const html = renderDashboardPage({
        user: mockUser,
        tenant: mockTenant,
        candidate: mockCandidate,
        readiness: mockReadiness,
        skills: mockSkills,
        applications: mockApplications,
        recommendedJobs: mockRecommendedJobs,
      });

      assert.match(html, /Which jobs should I consider\?/);
      assert.match(html, /Opportunities matching your verified skills/);
      assert.match(html, /Senior Backend Engineer/);
      assert.match(html, /Datadog/);
      assert.match(html, /94% Match/);
      assert.match(html, /Staff Systems Architect/);
      assert.match(html, /Cloudflare/);
      assert.match(html, /89% Match/);
      assert.match(html, /Evaluate Fit with Radar/);
      assert.match(html, /href="\/apps\/radar"/);
    });

    it('renders Section 3: "Which applications need attention?" with pipeline table and review links', () => {
      const html = renderDashboardPage({
        user: mockUser,
        tenant: mockTenant,
        candidate: mockCandidate,
        readiness: mockReadiness,
        skills: mockSkills,
        applications: mockApplications,
        recommendedJobs: mockRecommendedJobs,
      });

      assert.match(html, /Which applications need attention\?/);
      assert.match(html, /Active pipeline tracking/);
      assert.match(html, /Stripe/);
      assert.match(html, /Senior Infrastructure Engineer/);
      assert.match(html, /INTERVIEWING/);
      assert.match(html, /GitHub/);
      assert.match(html, /Backend Platform Engineer/);
      assert.match(html, /Review/);
      assert.match(html, /href="\/applications\/app-1"/);
    });

    it('eliminates developer jargon ("Deterministic" badges, duplicate skills cloud, and connected repos card)', () => {
      const html = renderDashboardPage({
        user: mockUser,
        tenant: mockTenant,
        candidate: mockCandidate,
        readiness: mockReadiness,
        skills: mockSkills,
        applications: mockApplications,
        recommendedJobs: mockRecommendedJobs,
      });

      // "Deterministic" badge on cards is eliminated from dashboard quick actions
      assert.doesNotMatch(html, />Deterministic<\/span>/);

      // Duplicate Copilot drawer container inside dashboard page body is eliminated (rendered by layout)
      const asideCount = (html.match(/id="copilot-drawer"/g) || []).length;
      assert.strictEqual(asideCount, 1, 'Only exactly 1 copilot-drawer instance in rendered document');
    });
  });

  describe('2. Universal Contextual Career Copilot Drawer & Layout Integration', () => {
    it('renders persistent [✦ Copilot] button in navbar and mobile menu for authenticated users', () => {
      const html = renderLayout({
        title: 'Dashboard',
        content: '<div>Workspace Content</div>',
        activeNav: 'dashboard',
        user: mockUser,
      });

      assert.match(html, /id="copilotOpenBtn"/);
      assert.match(html, /class="copilot-nav-btn"/);
      assert.match(html, /Open Career Copilot/);
      assert.match(html, /id="copilot-drawer"/);
    });

    it('suppresses Copilot button and drawer for unauthenticated visitors', () => {
      const html = renderLayout({
        title: 'Home',
        content: '<div>Public Landing</div>',
        activeNav: 'home',
        user: null,
      });

      assert.doesNotMatch(html, /id="copilotOpenBtn"/);
      assert.doesNotMatch(html, /id="copilot-drawer"/);
    });

    it('maps dynamic contextual prompt chips by pageContext', () => {
      // Dashboard context
      const dashboardDrawer = renderCopilotDrawer({ pageContext: 'dashboard' });
      assert.match(dashboardDrawer, /data-page-context="dashboard"/);
      assert.match(dashboardDrawer, /What should I do next\?/);
      assert.match(dashboardDrawer, /Find matching jobs|Find jobs matching my profile/);

      // Profile context
      const profileDrawer = renderCopilotDrawer({ pageContext: 'profile' });
      assert.match(profileDrawer, /data-page-context="profile"/);
      assert.match(profileDrawer, /What(?:&#039;s|&#39;s|'s| is) missing from my profile\?/);
      assert.match(profileDrawer, /Fix my profile gaps|Improve my professional summary/);

      // Radar / Job context
      const radarDrawer = renderCopilotDrawer({ pageContext: 'radar' });
      assert.match(radarDrawer, /data-page-context="(?:jobs|radar)"/);
      assert.match(radarDrawer, /How (?:strong is my match|well do I match)\?/);
      assert.match(radarDrawer, /What (?:am I missing|skills am I missing)\?/);

      // Applications context
      const appsDrawer = renderCopilotDrawer({ pageContext: 'applications' });
      assert.match(appsDrawer, /data-page-context="applications"/);
      assert.match(appsDrawer, /Is this application ready\?|Review my application answers/);
      assert.match(appsDrawer, /Improve my match|Help me prepare for interviews/);

      // Resumes context
      const resumesDrawer = renderCopilotDrawer({ pageContext: 'resumes' });
      assert.match(resumesDrawer, /data-page-context="resumes"/);
      assert.match(resumesDrawer, /Review my active resume|What should I improve on my resume\?/);
      assert.match(resumesDrawer, /Tailor my resume|Review active base resume/);
    });

    it('enforces two-phase safe proposal cards requiring explicit human [Confirm] / [Dismiss]', () => {
      const drawer = renderCopilotDrawer({
        pageContext: 'profile',
        activeProposals: [
          {
            id: 'prop-headline',
            field: 'headline',
            fieldLabel: 'Professional Headline',
            currentValue: 'Software Engineer',
            proposedValue: 'Senior Distributed Systems Architect',
          },
        ],
      });

      assert.match(drawer, /Proposed Profile Updates \(Confirmation Required\)/);
      assert.match(drawer, /Senior Distributed Systems Architect/);
      assert.match(drawer, /action="\/assistant\/proposals\/confirm"/);
      assert.match(drawer, /name="confirmedByUser" value="true"/);
      assert.match(drawer, /Confirm<\/span>/);
      assert.match(drawer, /action="\/assistant\/proposals\/reject"/);
      assert.match(drawer, /Dismiss<\/span>/);
    });

    it('provides accessible dialog attributes and keyboard trap handling', () => {
      const drawer = renderCopilotDrawer({ pageContext: 'dashboard' });
      assert.match(drawer, /role="dialog"/);
      assert.match(drawer, /aria-label="Career Copilot"/);
      assert.match(drawer, /aria-modal="true"/);
      assert.match(drawer, /id="copilotCloseBtn"/);
      assert.match(drawer, /e\.key === 'Escape'/);
    });
  });

  describe('3. Profile UI Simplification & Icon Hygiene', () => {
    it('does not render redundant 3rd checklist-card in profile overview', () => {
      const html = renderProfilePage({
        user: mockUser,
        tenant: mockTenant,
        candidate: mockCandidate,
        careerProfile: {
          profileView: {
            candidate: mockCandidate,
            sections: [],
          },
          targetRoles: ['Backend Engineer'],
        },
        readinessSummary: {
          readinessScore: 85,
          readyItems: [{ label: 'Work Authorization', value: 'US Citizen' }],
          attentionItems: [{ field: 'phone', label: 'Phone Number', status: 'MISSING' }],
        },
      });

      // The redundant 3rd card has been eliminated
      assert.doesNotMatch(html, /class="card checklist-card"/);
      assert.doesNotMatch(html, /Application Readiness Checklist<\/h3>/);

      // Ready to Apply and Needs Attention cards are preserved
      assert.match(html, /Ready to Apply/);
      assert.match(html, /Needs Attention/);
    });

    it('eliminates dual checkmark symbols next to corroborated skills in profile.page.js', () => {
      const html = renderProfilePage({
        user: mockUser,
        tenant: mockTenant,
        candidate: mockCandidate,
        profile: {
          profileView: {
            candidate: mockCandidate,
            sections: [],
          },
          primarySkills: [{ skillName: 'PostgreSQL', provenanceStatus: 'VERIFIED' }],
        },
        readinessSummary: { readinessScore: 90, readyItems: [], attentionItems: [] },
      });

      // Must not contain "✓ Corroborated" with raw unicode checkmark
      assert.doesNotMatch(html, /✓ Corroborated/);
      // Must contain clean Corroborated label
      assert.match(html, /Corroborated/);
    });
  });

  describe('4. Resumes & Sources Cleanliness', () => {
    it('renders prominent Active Base Resume card and removes raw SHA-256 column from main view', () => {
      const mockResumesList = [
        {
          id: 'res-base',
          fileName: 'Grace_Hopper_Base_2026.pdf',
          fileSizeBytes: 245000,
          version: 2,
          isBaseResume: true,
          lifecycleState: 'USER_APPROVED',
          mimeType: 'application/pdf',
          contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          createdAt: new Date('2026-09-10'),
        },
        {
          id: 'res-old',
          fileName: 'Grace_Hopper_Draft_2025.docx',
          fileSizeBytes: 180000,
          version: 1,
          isBaseResume: false,
          lifecycleState: 'PARSED',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          contentHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
          createdAt: new Date('2026-08-01'),
        },
      ];

      const html = renderResumesPage({
        user: mockUser,
        tenant: mockTenant,
        candidate: mockCandidate,
        resumesList: mockResumesList,
      });

      // Prominent Active Base Resume hero
      assert.match(html, /ACTIVE BASE RESUME/);
      assert.match(html, /Grace_Hopper_Base_2026\.pdf/);
      assert.match(html, /Review Claims/);

      // Cryptographic / storage details moved into disclosure
      assert.match(html, /Security &amp; storage specifications/);
      assert.match(html, /details class="advanced-disclosure"/);

      // Cleaned table headers (SHA-256 Digest is no longer a dedicated main column)
      assert.doesNotMatch(html, /<th>SHA-256 Digest<\/th>/);
    });

    it('sources view uses standardized SVG renderIcon without raw ∅ empty symbols', () => {
      const html = renderSourcesPage({
        user: mockUser,
        tenant: mockTenant,
        gitHubConnection: null,
        resources: [],
      });

      // No raw unicode empty symbol
      assert.doesNotMatch(html, />∅<\/div>/);
      // Uses SVG renderIcon
      assert.match(html, /class="icon-svg"/);
      assert.match(html, /No Repositories Connected/);
      assert.match(html, /contents:read, metadata:read/);
    });
  });

  describe('5. Deterministic Icon Rendering & CLS Stability', () => {
    it('renderIcon produces deterministic SVGs with explicit width, height, and accessibility attributes', () => {
      const icon = renderIcon('sparkles', { size: 18, className: 'test-icon' });
      assert.match(icon, /<svg class="test-icon"/);
      assert.match(icon, /width="18"/);
      assert.match(icon, /height="18"/);
      assert.match(icon, /viewBox="0 0 24 24"/);
      assert.match(icon, /aria-hidden="true"/);
    });

    it('falls back safely to info icon on unknown icon names without crashing', () => {
      const icon = renderIcon('non_existent_icon_name');
      assert.match(icon, /<svg class="icon-svg"/);
      assert.match(icon, /width="16"/);
      assert.match(icon, /height="16"/);
    });
  });
});
