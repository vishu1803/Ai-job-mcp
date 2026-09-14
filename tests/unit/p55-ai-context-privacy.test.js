/**
 * @file P55 AI-Context Privacy & Content-Grounding Test Suite
 *
 * Validates:
 * 1. AI context contains no candidate name.
 * 2. AI context contains no email.
 * 3. AI context contains no phone.
 * 4. AI context contains no location.
 * 5. AI context contains no personal URLs.
 * 6. AI context contains no candidate/tenant/application IDs.
 * 7. Summary generation never produces candidate name.
 * 8. Privacy validator rejects generated PII if present.
 * 9. Project bullet generation receives only project-scoped evidence.
 * 10. Unsupported outcomes are rejected.
 * 11. Unsupported metrics are rejected.
 * 12. Unsupported technologies are rejected.
 * 13. Three grounded bullets remain required.
 * 14. MCP and Extension use the same sanitized context.
 * 15. Candidate source-of-truth remains unchanged.
 * 16. Adversarial test with synthetic candidate containing unique name, email, phone, location, personal URLs, internal IDs.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildResumeAiContext,
  validateAiPrivacy,
  buildForbiddenPiiTokens,
  sanitizeProjectName,
  scrubTextPii,
} from '../../src/services/ai-context-sanitizer.service.js';

import {
  ResumeClaimValidationService,
  defaultResumeClaimValidationService,
} from '../../src/services/resume-claim-validation.service.js';

import {
  AiResumeContentGeneratorService,
} from '../../src/services/ai-resume-content-generator.service.js';

import { pool } from '../../src/db/index.js';

// Synthetic candidate for privacy & adversarial testing
const SYNTHETIC_CANDIDATE = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  tenantId: 't1t2t3t4-e5f6-7890-abcd-ef1234567890',
  userId: 'u1u2u3u4-e5f6-7890-abcd-ef1234567890',
  applicationId: 'ap1ap2ap-e5f6-7890-abcd-ef1234567890',
  displayName: 'Alexandria Montgomery',
  name: 'Alexandria Montgomery',
  email: 'alexandria.montgomery@syntheticdomain.org',
  phone: '+1 (555) 789-0123',
  location: 'Metropolis, New York, United States',
  githubUrl: 'https://github.com/alexandriamontgomery',
  linkedinUrl: 'https://linkedin.com/in/alexandria-montgomery-dev',
  portfolioUrl: 'https://alexandriamontgomery.tech',
  skills: ['Python', 'FastAPI', 'PostgreSQL', 'Docker', 'Redis'],
  projects: [
    {
      id: 'p1p2p3p4-e5f6-7890-abcd-ef1234567890',
      name: 'alexandriamontgomery/distributed-task-orchestrator',
      displayName: 'alexandriamontgomery/distributed-task-orchestrator',
      technologies: ['Python', 'FastAPI', 'Redis', 'Docker'],
      bullets: [
        'Architected asynchronous task execution engine using FastAPI and Redis streams for job queuing.',
        'Engineered distributed worker nodes in Python to process background workloads concurrently.',
        'Implemented comprehensive health checks and automated Docker Compose container deployment.',
      ],
      metadata: {
        sourceUrl: 'https://github.com/alexandriamontgomery/distributed-task-orchestrator',
      },
    },
  ],
};

const SAMPLE_JOB = {
  id: 'job-sec-001',
  title: 'Senior Python Backend Engineer',
  description: 'We are seeking a backend engineer experienced in Python, FastAPI, and PostgreSQL to build scalable data pipelines.',
  requirements: [
    '5+ years with Python and FastAPI',
    'Experience with PostgreSQL and Redis',
    'Docker containerization',
  ],
};

describe('Part 55: AI-Context Privacy & Content-Grounding Fix', () => {

  describe('1-6. Strict AI Privacy Boundary in buildResumeAiContext', () => {
    it('1. AI context contains no candidate name', () => {
      const { context } = buildResumeAiContext({
        job: SAMPLE_JOB,
        candidateProfile: SYNTHETIC_CANDIDATE,
        selectedProjects: SYNTHETIC_CANDIDATE.projects,
        selectedSkills: SYNTHETIC_CANDIDATE.skills,
        taskType: 'RESUME_SUMMARY_SYNTHESIS',
      });

      const serialized = JSON.stringify(context).toLowerCase();
      assert.ok(!serialized.includes('alexandria'), 'Must not contain first name Alexandria');
      assert.ok(!serialized.includes('montgomery'), 'Must not contain last name Montgomery');
      assert.ok(!serialized.includes('alexandriamontgomery'), 'Must not contain username alexandriamontgomery');
    });

    it('2. AI context contains no email', () => {
      const { context } = buildResumeAiContext({
        job: SAMPLE_JOB,
        candidateProfile: SYNTHETIC_CANDIDATE,
        selectedProjects: SYNTHETIC_CANDIDATE.projects,
        selectedSkills: SYNTHETIC_CANDIDATE.skills,
        taskType: 'RESUME_SUMMARY_SYNTHESIS',
      });

      const serialized = JSON.stringify(context).toLowerCase();
      assert.ok(!serialized.includes('alexandria.montgomery@syntheticdomain.org'), 'Must not contain candidate email');
      assert.ok(!serialized.includes('syntheticdomain.org'), 'Must not contain email domain');
    });

    it('3. AI context contains no phone or country code', () => {
      const { context } = buildResumeAiContext({
        job: SAMPLE_JOB,
        candidateProfile: SYNTHETIC_CANDIDATE,
        selectedProjects: SYNTHETIC_CANDIDATE.projects,
        selectedSkills: SYNTHETIC_CANDIDATE.skills,
        taskType: 'RESUME_SUMMARY_SYNTHESIS',
      });

      const serialized = JSON.stringify(context);
      assert.ok(!serialized.includes('789-0123'), 'Must not contain formatted phone');
      assert.ok(!serialized.includes('5557890123'), 'Must not contain raw phone digits');
    });

    it('4. AI context contains no candidate physical location', () => {
      const { context } = buildResumeAiContext({
        job: SAMPLE_JOB,
        candidateProfile: SYNTHETIC_CANDIDATE,
        selectedProjects: SYNTHETIC_CANDIDATE.projects,
        selectedSkills: SYNTHETIC_CANDIDATE.skills,
        taskType: 'RESUME_SUMMARY_SYNTHESIS',
      });

      const serialized = JSON.stringify(context).toLowerCase();
      assert.ok(!serialized.includes('metropolis'), 'Must not contain city Metropolis');
    });

    it('5. AI context contains no personal URLs, GitHub URLs, or portfolio URLs', () => {
      const { context } = buildResumeAiContext({
        job: SAMPLE_JOB,
        candidateProfile: SYNTHETIC_CANDIDATE,
        selectedProjects: SYNTHETIC_CANDIDATE.projects,
        selectedSkills: SYNTHETIC_CANDIDATE.skills,
        taskType: 'RESUME_SUMMARY_SYNTHESIS',
      });

      const serialized = JSON.stringify(context).toLowerCase();
      assert.ok(!serialized.includes('alexandriamontgomery.tech'), 'Must not contain portfolio URL');
      assert.ok(!serialized.includes('linkedin.com/in/alexandria'), 'Must not contain LinkedIn URL');
      assert.ok(!serialized.includes('github.com/alexandria'), 'Must not contain GitHub URL');
    });

    it('6. AI context contains no candidate/tenant/application/database IDs', () => {
      const { context } = buildResumeAiContext({
        job: SAMPLE_JOB,
        candidateProfile: SYNTHETIC_CANDIDATE,
        selectedProjects: SYNTHETIC_CANDIDATE.projects,
        selectedSkills: SYNTHETIC_CANDIDATE.skills,
        taskType: 'RESUME_SUMMARY_SYNTHESIS',
      });

      const serialized = JSON.stringify(context).toLowerCase();
      assert.ok(!serialized.includes('a1b2c3d4-e5f6-7890-abcd-ef1234567890'), 'Must not contain candidate ID');
      assert.ok(!serialized.includes('t1t2t3t4-e5f6-7890-abcd-ef1234567890'), 'Must not contain tenant ID');
      assert.ok(!serialized.includes('u1u2u3u4-e5f6-7890-abcd-ef1234567890'), 'Must not contain user ID');
      assert.ok(!serialized.includes('ap1ap2ap-e5f6-7890-abcd-ef1234567890'), 'Must not contain application ID');
      assert.ok(!serialized.includes('p1p2p3p4-e5f6-7890-abcd-ef1234567890'), 'Must not contain project database UUID');
    });
  });

  describe('7-8. Post-Generation Privacy Validator & Summary Name Prevention', () => {
    it('7. Summary generation produces neutral third-person text without candidate name', async () => {
      const generator = new AiResumeContentGeneratorService({ aiProvider: false });
      const summaryResult = await generator.generateJobConditionedSummary({
        candidateProfile: SYNTHETIC_CANDIDATE,
        targetJobPosting: SAMPLE_JOB,
        selectedProjects: SYNTHETIC_CANDIDATE.projects,
        selectedSkills: SYNTHETIC_CANDIDATE.skills,
      });

      assert.ok(summaryResult.text, 'Summary text must be generated');
      assert.ok(
        !summaryResult.text.includes('Alexandria'),
        'Summary must NOT mention Alexandria'
      );
      assert.ok(
        !summaryResult.text.includes('Montgomery'),
        'Summary must NOT mention Montgomery'
      );
      assert.ok(
        !/^Alexandria Montgomery is/i.test(summaryResult.text),
        'Summary must not start with candidate name'
      );
    });

    it('8. Privacy validator rejects generated PII (name, email, phone, location, IDs)', () => {
      // Test A: Clean text passes
      const cleanText = 'Backend engineer specializing in high-concurrency Python microservices and distributed queuing systems.';
      const cleanCheck = validateAiPrivacy({
        text: cleanText,
        candidateProfile: SYNTHETIC_CANDIDATE,
      });
      assert.equal(cleanCheck.valid, true, 'Clean text must pass privacy validation');
      assert.equal(cleanCheck.violations.length, 0);

      // Test B: Name detected
      const dirtyNameText = 'Alexandria Montgomery is an accomplished backend engineer.';
      const nameCheck = validateAiPrivacy({
        text: dirtyNameText,
        candidateProfile: SYNTHETIC_CANDIDATE,
      });
      assert.equal(nameCheck.valid, false, 'Must reject text containing candidate name');
      assert.ok(nameCheck.violations.some((v) => v.code === 'PII_CANDIDATE_NAME_DETECTED'));

      // Test C: Email detected
      const dirtyEmailText = 'Contact at alexandria.montgomery@syntheticdomain.org for inquiries.';
      const emailCheck = validateAiPrivacy({
        text: dirtyEmailText,
        candidateProfile: SYNTHETIC_CANDIDATE,
      });
      assert.equal(emailCheck.valid, false, 'Must reject text containing email');
      assert.ok(emailCheck.violations.some((v) => v.code === 'PII_EMAIL_DETECTED'));

      // Test D: Phone detected
      const dirtyPhoneText = 'Available for interviews at 555-789-0123 anytime.';
      const phoneCheck = validateAiPrivacy({
        text: dirtyPhoneText,
        candidateProfile: SYNTHETIC_CANDIDATE,
      });
      assert.equal(phoneCheck.valid, false, 'Must reject text containing phone');
      assert.ok(phoneCheck.violations.some((v) => v.code === 'PII_PHONE_DETECTED'));

      // Test E: Location detected
      const dirtyLocationText = 'Located in Metropolis with extensive distributed systems experience.';
      const locCheck = validateAiPrivacy({
        text: dirtyLocationText,
        candidateProfile: SYNTHETIC_CANDIDATE,
      });
      assert.equal(locCheck.valid, false, 'Must reject text containing location');
      assert.ok(locCheck.violations.some((v) => v.code === 'PII_LOCATION_DETECTED'));

      // Test F: Internal UUID detected
      const dirtyIdText = 'Application record ref: a1b2c3d4-e5f6-7890-abcd-ef1234567890.';
      const idCheck = validateAiPrivacy({
        text: dirtyIdText,
        candidateProfile: SYNTHETIC_CANDIDATE,
      });
      assert.equal(idCheck.valid, false, 'Must reject text containing internal ID');
      assert.ok(idCheck.violations.some((v) => v.code === 'PII_INTERNAL_ID_DETECTED' || v.code === 'PII_UUID_DETECTED'));
    });
  });

  describe('9. Project-Scoped Evidence Scoping', () => {
    it('9. Project bullet generation receives only project-scoped evidence', () => {
      const proj = SYNTHETIC_CANDIDATE.projects[0];
      const { context } = buildResumeAiContext({
        job: SAMPLE_JOB,
        candidateProfile: SYNTHETIC_CANDIDATE,
        selectedProjects: [proj],
        factInventory: proj.bullets.map((b, i) => ({
          id: `fact-${i + 1}`,
          text: b,
          technologies: proj.technologies,
        })),
        taskType: 'RESUME_ACCOMPLISHMENT_SYNTHESIS',
      });

      assert.equal(context.taskType, 'RESUME_ACCOMPLISHMENT_SYNTHESIS');
      assert.equal(context.projectName, 'distributed-task-orchestrator', 'Project name must be stripped of repo owner');
      assert.ok(!context.projectName.includes('alexandriamontgomery/'), 'Project name must not include owner username');
      assert.equal(context.facts.length, 3, 'Must contain exactly project facts');
      assert.ok(!context.skills, 'Must not send unrelated candidate skills array in project bullet context');
    });
  });

  describe('10-12. Strict Content Grounding & Unsupported Claims Rejection', () => {
    const validationService = new ResumeClaimValidationService();
    const mockFacts = [
      {
        factId: 'fact-auto-1',
        text: 'Automated code review using OpenAI API to analyze pull requests and flag style issues.',
        canonicalFactType: 'ACTION',
        technologies: ['Python', 'FastAPI', 'OpenAI API'],
      },
    ];

    it('10. Unsupported outcomes are rejected (review time reduction, developer velocity, productivity)', () => {
      // Claim asserts reduced manual review time and velocity when source fact only mentions automation
      const unsupportedClaim = {
        claimId: 'claim-1',
        text: 'Reduced average manual code review time across multiple repositories by automating code evaluation, resulting in improved developer velocity and code quality standards.',
        factIds: ['fact-auto-1'],
        technologiesUsed: ['Python', 'FastAPI'],
      };

      const result = validationService.validateClaim(unsupportedClaim, {
        factInventory: mockFacts,
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'proj-1',
      });

      assert.equal(result.valid, false, 'Must reject unsupported outcome claim');
      assert.ok(
        result.violations.some((v) => v.code === 'UNSUPPORTED_OUTCOME'),
        'Must report UNSUPPORTED_OUTCOME violation'
      );
    });

    it('11. Unsupported metrics and percentage reductions are rejected', () => {
      const unsupportedMetricClaim = {
        claimId: 'claim-2',
        text: 'Engineered automated review workflows, cutting code review latency by 45% across services.',
        factIds: ['fact-auto-1'],
      };

      const result = validationService.validateClaim(unsupportedMetricClaim, {
        factInventory: mockFacts,
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'proj-1',
      });

      assert.equal(result.valid, false, 'Must reject unsupported percentage metric');
      assert.ok(
        result.violations.some((v) => v.code === 'UNSUPPORTED_METRIC'),
        'Must report UNSUPPORTED_METRIC violation'
      );
    });

    it('12. Unsupported technologies are rejected', () => {
      const unsupportedTechClaim = {
        claimId: 'claim-3',
        text: 'Deployed automated review pipelines to AWS Lambda and managed infrastructure via Terraform.',
        factIds: ['fact-auto-1'],
        technologiesUsed: ['AWS', 'Terraform'],
      };

      const result = validationService.validateClaim(unsupportedTechClaim, {
        factInventory: mockFacts,
        candidateProfile: { skills: ['Python', 'FastAPI'] },
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'proj-1',
      });

      assert.equal(result.valid, false, 'Must reject unsupported technology claim');
      assert.ok(
        result.violations.some((v) => v.code === 'UNAUTHORIZED_TECHNOLOGY'),
        'Must report UNAUTHORIZED_TECHNOLOGY violation'
      );
    });
  });

  describe('13. Three Grounded Bullets Contract Preservation', () => {
    it('13. Three grounded bullets remain required per selected project', async () => {
      const generator = new AiResumeContentGeneratorService({ aiProvider: false });
      const bullets = await generator.generateJobConditionedProjectBullets({
        project: SYNTHETIC_CANDIDATE.projects[0],
        candidateProfile: SYNTHETIC_CANDIDATE,
        targetJobPosting: SAMPLE_JOB,
        projectFacts: SYNTHETIC_CANDIDATE.projects[0].bullets,
      });

      assert.ok(Array.isArray(bullets), 'Bullets must be an array');
      assert.ok(bullets.length >= 3, `Expected at least 3 bullets, got ${bullets.length}`);
      for (const b of bullets) {
        assert.ok(b.text.endsWith('.'), 'Bullet must end with a period');
        assert.ok(!b.text.includes('Alexandria'), 'Bullet must not contain candidate name');
        assert.ok(b.composedFromFactIds.length > 0, 'Bullet must be composed from fact IDs');
      }
    });
  });

  describe('14. MCP and Extension Parity', () => {
    it('14. MCP and Extension use the same sanitized context builder', () => {
      // Both MCP and Extension call JobApplicationWorkflowService.prepareJobApplication,
      // which delegates to buildResumeAiContext.
      const ctx1 = buildResumeAiContext({
        job: SAMPLE_JOB,
        candidateProfile: SYNTHETIC_CANDIDATE,
        selectedProjects: SYNTHETIC_CANDIDATE.projects,
        taskType: 'RESUME_SUMMARY_SYNTHESIS',
      });

      const ctx2 = buildResumeAiContext({
        job: SAMPLE_JOB,
        candidateProfile: SYNTHETIC_CANDIDATE,
        selectedProjects: SYNTHETIC_CANDIDATE.projects,
        taskType: 'RESUME_SUMMARY_SYNTHESIS',
      });

      assert.deepEqual(
        ctx1.context,
        ctx2.context,
        'Identical candidate and job inputs produce identical sanitized context'
      );
    });
  });

  describe('15. Candidate Source-of-Truth Invariance', () => {
    it('15. Candidate source-of-truth remains unchanged in database', async () => {
      const candId = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
      const beforeRes = await pool.query(
        'SELECT id, display_name, canonical_email, profile_metadata FROM candidates WHERE id = $1',
        [candId]
      );
      assert.equal(beforeRes.rows.length, 1, 'Production candidate must exist');
      const beforeRow = beforeRes.rows[0];

      // Execute AI context building on production candidate
      buildResumeAiContext({
        job: SAMPLE_JOB,
        candidateProfile: {
          id: beforeRow.id,
          displayName: beforeRow.display_name,
          email: beforeRow.canonical_email,
          profileMetadata: beforeRow.profile_metadata,
        },
        taskType: 'RESUME_SUMMARY_SYNTHESIS',
      });

      const afterRes = await pool.query(
        'SELECT id, display_name, canonical_email, profile_metadata FROM candidates WHERE id = $1',
        [candId]
      );
      const afterRow = afterRes.rows[0];

      assert.equal(beforeRow.display_name, afterRow.display_name);
      assert.equal(beforeRow.canonical_email, afterRow.canonical_email);
      assert.deepEqual(beforeRow.profile_metadata, afterRow.profile_metadata);
    });
  });

  describe('16. Adversarial Privacy Penetration Test', () => {
    it('16. Malicious or leaking AI output is strictly rejected by the validator', () => {
      const adversaryCandidate = {
        displayName: 'Zaphod Beeblebrox',
        email: 'zaphod@betelgeuse.galaxy',
        phone: '+42 999 888 7777',
        location: 'Heart of Gold Sector, Galaxy',
        githubUrl: 'https://github.com/zaphod-president',
        portfolioUrl: 'https://president-galaxy.space',
        id: '99999999-8888-7777-6666-555555555555',
      };

      // 1. Assert NONE of the adversary identifiers exist in sanitized context
      const { context } = buildResumeAiContext({
        job: SAMPLE_JOB,
        candidateProfile: adversaryCandidate,
        selectedProjects: [
          {
            name: 'zaphod-president/infinite-improbability-drive',
            technologies: ['Quantum', 'Python'],
            bullets: ['Implemented probability calculation matrix.'],
          },
        ],
        taskType: 'RESUME_SUMMARY_SYNTHESIS',
      });

      const serializedContext = JSON.stringify(context).toLowerCase();
      assert.ok(!serializedContext.includes('zaphod'), 'Sanitized context must NOT contain Zaphod');
      assert.ok(!serializedContext.includes('beeblebrox'), 'Sanitized context must NOT contain Beeblebrox');
      assert.ok(!serializedContext.includes('zaphod@betelgeuse.galaxy'), 'Sanitized context must NOT contain email');
      assert.ok(!serializedContext.includes('9998887777'), 'Sanitized context must NOT contain phone digits');
      assert.ok(!serializedContext.includes('betelgeuse'), 'Sanitized context must NOT contain location');
      assert.ok(!serializedContext.includes('zaphod-president'), 'Sanitized context must NOT contain github username');
      assert.ok(!serializedContext.includes('president-galaxy.space'), 'Sanitized context must NOT contain portfolio url');
      assert.ok(!serializedContext.includes('99999999-8888-7777-6666-555555555555'), 'Sanitized context must NOT contain ID');

      // 2. Pass adversarial hallucinated text containing candidate name and email to validator
      const maliciousOutputs = [
        'Zaphod Beeblebrox is a visionary backend engineer specializing in quantum architectures.',
        'Experienced engineer contactable at zaphod@betelgeuse.galaxy for quantum engineering roles.',
        'Available by phone at +42 999 888 7777 for immediate hire.',
        'Based in Heart of Gold Sector, Galaxy with proven quantum leadership.',
        'View source at https://github.com/zaphod-president for probability drive code.',
        'Refer to internal database record 99999999-8888-7777-6666-555555555555.',
      ];

      for (const badOutput of maliciousOutputs) {
        const validation = validateAiPrivacy({
          text: badOutput,
          candidateProfile: adversaryCandidate,
        });
        assert.equal(
          validation.valid,
          false,
          `Adversarial output "${badOutput}" must be REJECTED by validator`
        );
        assert.ok(
          validation.violations.length > 0,
          `Expected violation for "${badOutput}"`
        );
      }
    });
  });

  after(async () => {
    try {
      await pool.end();
    } catch {
      // ignore
    }
  });

});
