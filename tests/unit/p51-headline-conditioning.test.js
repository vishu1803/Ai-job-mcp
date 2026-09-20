/**
 * @file Unit & Integration Regression Test: Job-Conditioned Professional Headline
 *
 * Verifies:
 * 1. Master resume headline remains valid and unmutated as candidate source-of-truth (MASTER_HEADLINE).
 * 2. Tailored resume headline conditions dynamically to target role semantics and candidate-owned evidence.
 * 3. 5 materially different job families produce appropriately differentiated headlines:
 *    - Full-Stack
 *    - Python Backend
 *    - Frontend
 *    - DevOps / Platform
 *    - Distributed Systems / backend
 * 4. Seniority inflation protection: freshers never receive Senior/Lead/Staff/Principal.
 * 5. Evidence grounding: no fabrication of unsupported capabilities (e.g. mobile/iOS without evidence).
 * 6. Conciseness: headline remains recruiter-readable and fits header layout.
 * 7. Stability: same role with slightly different wording does not produce arbitrary churn.
 * 8. Pipeline parity: MCP and Extension share the same canonical headline-generation authority.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { closeDatabase } from '../../src/db/index.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import {
  buildStructuredResumeSnapshot,
  buildStructuredResumeDocument,
} from '../../src/services/structured-resume.service.js';
import { deriveTargetRoleHeading } from '../../src/services/resume-content-strategy.service.js';

const CANDIDATE_ID = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
const MCP_CONTEXT = {
  tenantId: '24d53f53-780e-4431-b065-32180c354175',
  userId: '9dd8e4fb-456b-4104-9cb1-c839a544b721',
  role: 'MEMBER',
};

describe('P51: Tailored Professional Headline Conditioning Regression Suite', () => {
  let candidateProfile;

  it('loads real candidate profile without mutation', async () => {
    const service = new CandidateProfileService();
    candidateProfile = await service.getProfile(MCP_CONTEXT, CANDIDATE_ID);
    assert.ok(candidateProfile, 'Profile must load');
    assert.equal(candidateProfile.candidate.headline, 'Full-Stack & Backend Developer');
  });

  describe('1. Five Materially Different Job Families produce Differentiated Headlines', () => {
    const jobCases = [
      {
        family: 'Full-Stack',
        jobPosting: {
          title: 'Full-Stack Developer — React / Node.js',
          description: 'Full stack development with React, Node, and PostgreSQL',
        },
        expectedHeadline: 'Full-Stack Developer',
      },
      {
        family: 'Python Backend',
        jobPosting: {
          title: 'Python Backend Engineer — FastAPI / PostgreSQL',
          description: 'Develop high-performance APIs in Python and FastAPI',
        },
        expectedHeadline: 'Python Backend Engineer',
      },
      {
        family: 'Frontend',
        jobPosting: {
          title: 'Frontend Engineer — React / Next.js / TypeScript',
          description: 'Build user-facing responsive applications in React and TypeScript',
        },
        expectedHeadline: 'Frontend Engineer',
      },
      {
        family: 'DevOps / Platform',
        jobPosting: {
          title: 'DevOps / Platform Engineer — Cloud Infrastructure & CI/CD',
          description: 'Manage Docker containers, CI/CD pipelines, and cloud systems',
        },
        expectedHeadline: 'DevOps / Platform Engineer',
      },
      {
        family: 'Distributed Systems',
        jobPosting: {
          title: 'Distributed Systems Engineer — High-Throughput Microservices',
          description: 'Architect low-latency asynchronous microservices with Redis and Docker',
        },
        expectedHeadline: 'Distributed Systems Engineer',
      },
    ];

    const generatedHeadlines = [];

    for (const jc of jobCases) {
      it(`conditions ${jc.family} job to "${jc.expectedHeadline}"`, () => {
        const sourceHeadlineBefore = candidateProfile.candidate.headline;

        const snapshot = buildStructuredResumeSnapshot({
          candidateProfile,
          jobPosting: jc.jobPosting,
        });

        const headline = snapshot.structuredResume.candidateIdentity.headline;
        const masterHeadline = snapshot.structuredResume.candidateIdentity.masterHeadline;
        const tailoredHeadline = snapshot.structuredResume.candidateIdentity.tailoredHeadline;

        // 1. Headline exists
        assert.ok(headline, `${jc.family}: headline must exist`);

        // 2. Headline is candidate-grounded and matches expected role
        assert.strictEqual(headline, jc.expectedHeadline);
        assert.strictEqual(tailoredHeadline, jc.expectedHeadline);

        // 3. Master headline preserved
        assert.strictEqual(masterHeadline, 'Full-Stack & Backend Developer');

        // 4. Headline is not inherited unchanged when a specific role is appropriate
        if (jc.family !== 'Full-Stack') {
          assert.notStrictEqual(
            headline,
            'Full-Stack & Backend Developer',
            `${jc.family} must differentiate from master headline`
          );
        }

        // 5. Does not invent seniority (candidate is fresher)
        assert.doesNotMatch(headline, /\b(senior|sr\.?|principal|lead|staff|architect)\b/i);

        // 6. Does not introduce unsupported technologies
        assert.doesNotMatch(headline, /\b(kubernetes|swift|ios|android|rust|ruby)\b/i);

        // 7. Concise (< 60 chars)
        assert.ok(headline.length < 60, `Headline too long: ${headline}`);

        // 8. Candidate source-of-truth remains unchanged
        assert.strictEqual(candidateProfile.candidate.headline, sourceHeadlineBefore);

        generatedHeadlines.push(headline);
      });
    }

    it('ensures distinct headlines across all 5 job families', () => {
      const uniqueHeadlines = new Set(generatedHeadlines);
      assert.strictEqual(
        uniqueHeadlines.size,
        5,
        `All 5 job families must produce differentiated headlines! Got: ${Array.from(uniqueHeadlines).join(', ')}`
      );
    });
  });

  describe('2. Wording Stability & Churn Prevention', () => {
    it('produces identical headline for slight title variations of the same role', () => {
      const variations = [
        'Python Backend Engineer — FastAPI / PostgreSQL',
        'Python Backend Engineer - Core Services Team',
        'Python Backend Engineer | API Platform',
        'Python Backend Engineer — Scalable Backend',
      ];

      const results = variations.map((title) => {
        const snap = buildStructuredResumeSnapshot({
          candidateProfile,
          jobPosting: { title },
        });
        return snap.structuredResume.candidateIdentity.headline;
      });

      const uniqueResults = new Set(results);
      assert.strictEqual(
        uniqueResults.size,
        1,
        `Slight title variations should not cause headline churn. Got: ${results.join(', ')}`
      );
      assert.strictEqual(results[0], 'Python Backend Engineer');
    });
  });

  describe('3. Seniority Inflation Protection & Fresher Guard', () => {
    it('strips Senior/Principal/Lead for fresher candidates targeting senior roles', () => {
      const seniorJobs = [
        'Senior Full-Stack Developer',
        'Lead Python Backend Engineer',
        'Staff DevOps Engineer',
        'Principal Systems Architect',
      ];

      for (const title of seniorJobs) {
        const snap = buildStructuredResumeSnapshot({
          candidateProfile,
          jobPosting: { title },
        });
        const headline = snap.structuredResume.candidateIdentity.headline;
        assert.doesNotMatch(
          headline,
          /\b(senior|sr\.?|principal|lead|staff|architect)\b/i,
          `Fresher headline must not contain inflated seniority. Got: "${headline}" for job "${title}"`
        );
      }
    });

    it('preserves legitimate seniority for experienced senior candidates', () => {
      const experiencedProfile = {
        id: 'cand-exp-p51',
        displayName: 'Senior Engineer',
        canonicalEmail: 'senior.engineer@workmail.net',
        headline: 'Senior Backend Engineer',
        seniority: 'SENIOR',
        careerStatus: 'EMPLOYED',
        skills: [
          { name: 'Python', slug: 'python' },
          { name: 'PostgreSQL', slug: 'postgresql' },
        ],
        projects: [
          {
            id: 'proj-exp-1',
            name: 'API Service',
            technologies: ['Python', 'PostgreSQL'],
            bullets: ['Built production API service in Python.'],
          },
        ],
        experience: [
          {
            id: 'exp-p51-1',
            title: 'Senior Software Engineer',
            company: 'Tech Corp',
            startDate: '2020-01-01',
            endDate: 'Present',
            bullets: ['Led backend engineering team.'],
          },
        ],
        education: [
          {
            id: 'edu-p51-1',
            institution: 'University',
            degree: 'B.S. in Computer Science',
          },
        ],
      };

      const snap = buildStructuredResumeSnapshot({
        candidateProfile: experiencedProfile,
        jobPosting: { title: 'Senior Backend Engineer — Python' },
      });

      assert.strictEqual(
        snap.structuredResume.candidateIdentity.headline,
        'Senior Backend Engineer'
      );
    });
  });

  describe('4. Zero-Fabrication & Evidence Grounding Fallbacks', () => {
    it('falls back to Software Engineer for unsupported mobile/iOS role without evidence', () => {
      const snap = buildStructuredResumeSnapshot({
        candidateProfile, // Has JS, TS, React, Node, Python, Docker; NO iOS/Swift
        jobPosting: { title: 'Senior iOS Engineer — Swift / SwiftUI' },
      });

      assert.strictEqual(
        snap.structuredResume.candidateIdentity.headline,
        'Software Engineer',
        'Must not claim iOS Engineer without candidate-owned Swift/iOS evidence'
      );
    });

    it('safely rejects unsupported Machine Learning role without ML evidence', () => {
      const candidateNoML = {
        id: 'cand-noml-p51',
        displayName: 'Web Developer',
        canonicalEmail: 'web.developer@workmail.net',
        headline: 'Full-Stack Developer',
        careerStatus: 'FRESHER',
        skills: [
          { name: 'React', slug: 'react' },
          { name: 'Node.js', slug: 'nodejs' },
        ],
        projects: [
          {
            id: 'proj-noml-1',
            name: 'Web App',
            technologies: ['React', 'Node.js'],
            bullets: ['Built full-stack web application.'],
          },
        ],
        experience: [],
        education: [
          {
            id: 'edu-noml-1',
            institution: 'University',
            degree: 'B.S. in Computer Science',
          },
        ],
      };

      const snap = buildStructuredResumeSnapshot({
        candidateProfile: candidateNoML,
        jobPosting: { title: 'Machine Learning Engineer — PyTorch / TensorFlow' },
      });

      assert.doesNotMatch(
        snap.structuredResume.candidateIdentity.headline,
        /\b(?:machine\s+learning|ml|ai)\b/i,
        'Must not claim Machine Learning Engineer without ML evidence'
      );
      assert.strictEqual(
        snap.structuredResume.candidateIdentity.headline,
        'Full-Stack Developer',
        'Must fall back to authentic candidate profile headline'
      );
    });
  });

  describe('5. Master Resume Rule & Immutability', () => {
    it('preserves masterHeadline when no job is provided (unconditioned master resume)', () => {
      const snap = buildStructuredResumeSnapshot({
        candidateProfile,
        jobPosting: null,
      });

      assert.strictEqual(
        snap.structuredResume.candidateIdentity.headline,
        'Full-Stack & Backend Developer',
        'Unconditioned master resume headline must equal candidate base headline'
      );
      assert.strictEqual(
        snap.structuredResume.candidateIdentity.masterHeadline,
        'Full-Stack & Backend Developer'
      );
      assert.strictEqual(snap.structuredResume.candidateIdentity.tailoredHeadline, null);
    });

    it('preserves candidate source profile completely untouched across multiple tailorings', () => {
      const copyBefore = JSON.stringify(candidateProfile);

      buildStructuredResumeSnapshot({ candidateProfile, jobPosting: { title: 'DevOps Engineer' } });
      buildStructuredResumeSnapshot({
        candidateProfile,
        jobPosting: { title: 'Frontend Developer' },
      });
      buildStructuredResumeSnapshot({ candidateProfile, jobPosting: { title: 'Python Engineer' } });

      assert.strictEqual(
        JSON.stringify(candidateProfile),
        copyBefore,
        'Source profile must never be mutated'
      );
    });
  });

  describe('6. Canonical Parity across MCP and Extension Callers', () => {
    it('guarantees identical headline output for identical candidate and job input', () => {
      const job = { title: 'DevOps / Platform Engineer — Cloud Infrastructure' };

      // Caller 1: Direct snapshot (MCP pathway)
      const mcpSnap = buildStructuredResumeSnapshot({
        candidateProfile,
        jobPosting: job,
      });

      // Caller 2: Document builder (Extension / Workflow pathway)
      const doc = buildStructuredResumeDocument({
        candidateProfile,
        jobPosting: job,
      });

      assert.strictEqual(
        mcpSnap.structuredResume.candidateIdentity.headline,
        doc.candidateIdentity.headline,
        'MCP and Extension must yield identical headline'
      );
      assert.strictEqual(
        mcpSnap.structuredResume.candidateIdentity.masterHeadline,
        doc.candidateIdentity.masterHeadline,
        'MCP and Extension must yield identical masterHeadline'
      );
      assert.strictEqual(
        mcpSnap.structuredResume.candidateIdentity.tailoredHeadline,
        doc.candidateIdentity.tailoredHeadline,
        'MCP and Extension must yield identical tailoredHeadline'
      );
    });
  });

  describe('7. Broad Explicit Role Precedence & Critical Negative Test', () => {
    it('CRITICAL NEGATIVE TEST: broad explicit title "Software Engineer" retains "Software Engineer" despite backend/cloud description', () => {
      const jobPosting = {
        title: 'Software Engineer',
        description:
          'Build robust backend services using Python, Node.js, PostgreSQL, AWS, distributed systems, and cloud infrastructure.',
      };

      const snap = buildStructuredResumeSnapshot({
        candidateProfile,
        jobPosting,
      });

      const headline = snap.structuredResume.candidateIdentity.headline;
      const masterHeadline = snap.structuredResume.candidateIdentity.masterHeadline;

      // 1. Expected headline MUST be "Software Engineer"
      assert.strictEqual(
        headline,
        'Software Engineer',
        'Explicit broad role title must NOT be overridden by inferred specialization'
      );

      // 2. Prohibited outcomes
      assert.notStrictEqual(headline, 'Backend Engineer');
      assert.notStrictEqual(headline, 'Full-Stack & Backend Developer');
      assert.notStrictEqual(headline, 'DevOps / Platform Engineer');

      // 3. Master headline remains unmutated
      assert.strictEqual(masterHeadline, 'Full-Stack & Backend Developer');

      // 4. Target role in tailoring plan matches explicit role
      assert.strictEqual(snap.structuredResume.targetRole, 'Software Engineer');

      // 5. Summary remains job-conditioned
      assert.ok(snap.structuredResume.summary?.text, 'Summary must be present');

      // 6. Project selection remains authoritative
      assert.ok(Array.isArray(snap.structuredResume.projects));
      assert.strictEqual(snap.structuredResume.projects.length, 2);
    });

    it('retains "Software Engineer" for Crunchyroll-style comma-separated role specifier', () => {
      const snap = buildStructuredResumeSnapshot({
        candidateProfile,
        jobPosting: {
          title: 'Software Engineer, Service Monetization',
          description:
            'Backend subscription services, Python, TypeScript, Node.js, databases, cloud, reliability',
        },
      });

      assert.strictEqual(
        snap.structuredResume.candidateIdentity.headline,
        'Software Engineer',
        '"Software Engineer, Service Monetization" must remain fundamentally Software Engineer'
      );
    });

    it('retains "Software Engineer" for dash-separated specialty without becoming Full-Stack & Backend Developer', () => {
      const snap = buildStructuredResumeSnapshot({
        candidateProfile,
        jobPosting: {
          title: 'Software Engineer — Backend Services',
          description: 'Core backend platform services and microservices',
        },
      });

      assert.strictEqual(
        snap.structuredResume.candidateIdentity.headline,
        'Software Engineer',
        '"Software Engineer — Backend Services" must remain Software Engineer and avoid headline churn'
      );
      assert.notStrictEqual(
        snap.structuredResume.candidateIdentity.headline,
        'Full-Stack & Backend Developer'
      );
    });
  });

  after(async () => {
    await closeDatabase();
  });
});
