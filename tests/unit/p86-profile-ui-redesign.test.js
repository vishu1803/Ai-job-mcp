/**
 * @file P86 Phase 2: Candidate Profile UI/UX Redesign Test Suite
 *
 * Validates:
 * 1. Rendering of all 10 target navigation sections (Overview, Professional, Experience,
 *    Education, Skills, Projects, Credentials, Links, Preferences, Eligibility)
 * 2. Overview dashboard readiness percentage and actionable items from ApplicationReadinessService
 * 3. Separation of ready vs needs attention screening fields without exposing internal jargon
 * 4. Progressive disclosure encapsulating AST/provenance metrics inside disclosure elements
 * 5. Form editing controls preserving existing values with honest tri-state semantics
 * 6. Required vs optional field indicators avoiding false onboarding friction
 * 7. Accessibility semantics (tablist, tab, tabpanel, aria-selected, aria-controls, labels, aria-live)
 * 8. Backward-compatible anchor targets (#section-contact, #section-readiness, #section-links, #section-preferences)
 * 9. Phone country code selector and phone input ID preservation
 * 10. Save state indicator, dirty tracking infrastructure, and responsive layout classes
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderProfilePage } from '../../src/views/profile.page.js';

describe('P86 Phase 2: Candidate Profile UI/UX Redesign Suite', () => {
  const mockUser = { id: 'u-1', email: 'ada@example.com', displayName: 'Ada Lovelace' };
  const mockCandidate = {
    id: 'cand-1',
    displayName: 'Ada Lovelace',
    headline: 'Senior Systems Architect',
    profileMetadata: {
      location: 'London, UK',
      currentRole: 'Principal Architect',
      careerStatus: 'LEAD',
      userCustom: {
        summary: 'Pioneer of computing and distributed architectures.',
        phone: '+44 7905087928',
        countryCode: '+44',
        phoneNumber: '7905087928',
        linkedin: 'https://linkedin.com/in/adalovelace',
        github: 'https://github.com/adalovelace',
        portfolio: 'https://ada.dev',
        experience: [
          {
            title: 'Lead Architect',
            company: 'Analytical Engine Corp',
            startDate: '2022-01',
            endDate: 'Present',
            isCurrent: true,
            description: 'Architecting algorithmic computation pipelines.',
            astEvidenceCount: 14,
            repositoryCorroboration: 'analytical-engine',
          },
        ],
        education: [
          {
            institution: 'University of Cambridge',
            degree: 'Master of Science',
            fieldOfStudy: 'Mathematics',
            graduationYear: '2020',
          },
        ],
        certifications: [
          { name: 'Certified Systems Architect', issuer: 'Open Group', issueDate: '2023' },
        ],
        languages: [
          { language: 'English', proficiency: 'Native' },
        ],
        projects: [
          {
            name: 'Fastify Gateway',
            description: 'High-speed reverse proxy with zero overhead.',
            technologies: ['Node.js', 'TypeScript', 'Fastify'],
            repositoryUrl: 'https://github.com/adalovelace/fastify-gateway',
            astEvidence: true,
          },
        ],
      },
    },
  };

  const mockProfile = {
    canonicalEmail: 'ada@example.com',
    displayName: 'Ada Lovelace',
    headline: 'Senior Systems Architect',
    currentRole: 'Principal Architect',
    location: 'London, UK',
    careerStatus: 'LEAD',
    summary: 'Pioneer of computing and distributed architectures.',
    primarySkills: [
      { skillName: 'TypeScript', provenanceStatus: 'VERIFIED' },
      { skillName: 'Node.js', provenanceStatus: 'VERIFIED' },
      { skillName: 'PostgreSQL', provenanceStatus: 'CLAIMED' },
    ],
    technologySignals: [
      { skillName: 'Dotenv', provenanceStatus: 'VERIFIED' },
    ],
    highlightedProjects: [
      {
        name: 'Fastify Gateway',
        description: 'High-speed reverse proxy with zero overhead.',
        technologies: ['Node.js', 'TypeScript', 'Fastify'],
        repositoryUrl: 'https://github.com/adalovelace/fastify-gateway',
        astEvidence: true,
      },
    ],
    jobPreferences: {
      targetRoles: ['Principal Architect', 'Staff Engineer'],
      preferredLocations: ['Remote', 'London'],
      remotePreference: 'REMOTE_ONLY',
      employmentTypes: ['FULL_TIME'],
      salaryFloor: 150000,
      targetSalary: 180000,
      salaryCurrency: 'GBP',
      compensationPeriod: 'ANNUAL',
      workAuthorization: ['UK Citizen'],
      visaSponsorshipRequired: 'NO',
      noticePeriod: '30_days',
      availabilityDate: '2026-11-01',
      workAuthConfirmedByUser: true,
      visaSponsorshipConfirmedByUser: true,
    },
    profileReadiness: {
      score: 100,
      status: 'PROFILE POPULATED',
      isComplete: true,
      missingFields: [],
      actionableFeedback: 'Profile populated',
    },
  };

  // ---------------------------------------------------------------------------
  // 1. Navigation Architecture
  // ---------------------------------------------------------------------------
  it('1. Renders all 10 target navigation tabs and panels with accessible roles', () => {
    const html = renderProfilePage({
      user: mockUser,
      candidate: mockCandidate,
      profile: mockProfile,
      activeSection: 'overview',
    });

    const expectedTabs = [
      'overview',
      'professional',
      'experience',
      'education',
      'skills',
      'projects',
      'credentials',
      'links',
      'preferences',
      'eligibility',
    ];

    for (const tabId of expectedTabs) {
      assert.ok(html.includes(`id="tab-${tabId}"`), `Must render tab button for: ${tabId}`);
      assert.ok(html.includes(`data-tab="${tabId}"`), `Must have data-tab attribute for: ${tabId}`);
      assert.ok(html.includes(`id="panel-${tabId}"`), `Must render tab panel for: ${tabId}`);
      assert.ok(html.includes(`aria-controls="panel-${tabId}"`), `Must associate tab with panel: ${tabId}`);
    }

    assert.ok(html.includes('role="tablist"'), 'Navigation container must have role="tablist"');
    assert.ok(html.includes('role="tab"'), 'Tab buttons must have role="tab"');
    assert.ok(html.includes('role="tabpanel"'), 'Panels must have role="tabpanel"');
  });

  it('2. Honors activeSection parameter by marking active tab and panel', () => {
    const html = renderProfilePage({
      user: mockUser,
      candidate: mockCandidate,
      profile: mockProfile,
      activeSection: 'eligibility',
    });

    assert.ok(html.includes('id="tab-eligibility"') && html.includes('aria-selected="true"'), 'Eligibility tab must be active');
    assert.ok(html.includes('id="panel-eligibility"') && /id="panel-eligibility"[\s\S]*?class="tab-panel\s+active"/.test(html), 'Eligibility panel must be active');
    assert.ok(html.includes('id="tab-overview"') && html.includes('aria-selected="false"'), 'Overview tab must not be active');
  });

  // ---------------------------------------------------------------------------
  // 2. Overview Dashboard & Readiness Gauge
  // ---------------------------------------------------------------------------
  it('3. Overview dashboard displays honest readiness percentage and completion checklist', () => {
    const html = renderProfilePage({
      user: mockUser,
      candidate: mockCandidate,
      profile: mockProfile,
      activeSection: 'overview',
    });

    assert.ok(html.includes('gauge-circle'), 'Must render circular readiness gauge');
    assert.ok(html.includes('Application Readiness Checklist'), 'Must render readiness checklist');
    assert.ok(html.includes('status-ready'), 'Must render ready status items');
    assert.ok(html.includes('Work Authorization'), 'Checklist must include Work Authorization');
    assert.ok(html.includes('Notice Period'), 'Checklist must include Notice Period');
  });

  it('4. Consumes ApplicationReadinessService directly and displays actionable issues', () => {
    // Incomplete candidate profile: missing work auth and notice period
    const incompleteProfile = {
      ...mockProfile,
      canonicalEmail: 'ada@example.com',
      jobPreferences: {
        targetRoles: ['Engineer'],
        workAuthorization: [],
        visaSponsorshipRequired: null,
        noticePeriod: null,
        availabilityDate: null,
      },
    };

    const html = renderProfilePage({
      user: mockUser,
      candidate: { ...mockCandidate, profileMetadata: { phone: null } },
      profile: incompleteProfile,
      activeSection: 'overview',
    });

    assert.ok(html.includes('issue(s) require your attention'), 'Must display attention banner when issues exist');
    assert.ok(html.includes('action-item'), 'Must list action items');
    assert.ok(html.includes('switch-tab-trigger'), 'Action items must provide deep-link tab trigger buttons');
    assert.ok(html.includes('data-target-tab="eligibility"'), 'Action item must target eligibility tab');
  });

  // ---------------------------------------------------------------------------
  // 3. Progressive Disclosure (No AST/Internal Jargon Leaks)
  // ---------------------------------------------------------------------------
  it('5. Encapsulates technical AST and verification evidence inside progressive disclosure details', () => {
    const html = renderProfilePage({
      user: mockUser,
      candidate: mockCandidate,
      profile: mockProfile,
    });

    assert.ok(html.includes('<details class="advanced-disclosure">'), 'Must use advanced-disclosure container');
    assert.ok(html.includes('<summary>Show repository verification details</summary>'), 'Must provide friendly summary');
    // Ensure raw JSON dumps or AST engine metadata are not rendered bare
    assert.ok(!html.includes('"astEvidenceCount": 14'), 'Must not leak raw AST JSON dump');
  });

  // ---------------------------------------------------------------------------
  // 4. Form Field Binding & Safe Semantics
  // ---------------------------------------------------------------------------
  it('6. Form inputs preserve existing candidate values without data loss', () => {
    const html = renderProfilePage({
      user: mockUser,
      candidate: mockCandidate,
      profile: mockProfile,
    });

    assert.ok(html.includes('value="Ada Lovelace"'), 'Preserves displayName');
    assert.ok(html.includes('value="Senior Systems Architect"'), 'Preserves headline');
    assert.ok(html.includes('value="London, UK"'), 'Preserves location');
    assert.ok(html.includes('value="150000"'), 'Preserves salaryFloor');
    assert.ok(html.includes('value="180000"'), 'Preserves targetSalary');
    assert.ok(html.includes('value="30_days" selected'), 'Preserves notice period selection');
    assert.ok(html.includes('value="NO" selected'), 'Preserves visa sponsorship selection');
  });

  it('7. Preserves required phone country code and number inputs', () => {
    const html = renderProfilePage({
      user: mockUser,
      candidate: mockCandidate,
      profile: mockProfile,
    });

    assert.ok(html.includes('id="contactCountryCodeSelect"'), 'Must have contactCountryCodeSelect');
    assert.ok(html.includes('id="contactPhoneInput"'), 'Must have contactPhoneInput');
    assert.ok(html.includes('Choose code...'), 'Must contain placeholder prompt');
    assert.ok(html.includes('value="+44" selected'), 'Must select candidate country code');
    assert.ok(html.includes('value="7905087928"'), 'Must populate phone number');
  });

  it('8. Clearly indicates required vs optional fields', () => {
    const html = renderProfilePage({
      user: mockUser,
      candidate: mockCandidate,
      profile: mockProfile,
    });

    assert.ok(html.includes('class="required-star"'), 'Must have required star indicators');
    assert.ok(html.includes('class="optional-tag"'), 'Must have optional tags for voluntary fields');
  });

  // ---------------------------------------------------------------------------
  // 5. Anchor Targets & Deep Link Compatibility
  // ---------------------------------------------------------------------------
  it('9. Preserves anchor IDs for external and application readiness compatibility', () => {
    const html = renderProfilePage({
      user: mockUser,
      candidate: mockCandidate,
      profile: mockProfile,
    });

    assert.ok(html.includes('id="section-contact"'), 'Must preserve #section-contact anchor');
    assert.ok(html.includes('id="section-readiness"'), 'Must preserve #section-readiness anchor');
    assert.ok(html.includes('id="section-links"'), 'Must preserve #section-links anchor');
    assert.ok(html.includes('id="section-preferences"'), 'Must preserve #section-preferences anchor');
  });

  // ---------------------------------------------------------------------------
  // 6. Save State & Responsive Layout
  // ---------------------------------------------------------------------------
  it('10. Renders save status indicators and responsive layout structures', () => {
    const html = renderProfilePage({
      user: mockUser,
      candidate: mockCandidate,
      profile: mockProfile,
    });

    assert.ok(html.includes('id="globalSaveIndicator"'), 'Must render global save status indicator');
    assert.ok(html.includes('aria-live="polite"'), 'Save indicator must have aria-live="polite"');
    assert.ok(html.includes('id="stickySaveBar"'), 'Must render sticky save bar');
    assert.ok(html.includes('window.__INITIAL_PROFILE__'), 'Must embed initial profile state for dirty tracking');
    assert.ok(html.includes('profile-nav-tabs'), 'Must render responsive navigation tab bar');
  });
});
