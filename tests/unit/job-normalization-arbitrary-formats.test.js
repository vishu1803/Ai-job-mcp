/**
 * @file Arbitrary Job Description Formats & Canonical Requirement Regression Suite
 *
 * Enforces Section 5 (No Overfitting) & Section 4 (Canonical Requirement Projection):
 * Validates that arbitrary heading formats, bullet styles, and compound skill lines
 * preserve canonical REQUIRED and PREFERRED semantics across all parser and matching pipelines.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import {
  parseJobDescriptionSections,
  normalizeJobInput,
} from '../../src/services/job-normalization.service.js';
import { JobDescriptionParser } from '../../src/domain/career/job-parser.js';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import { AtsFitScoreService } from '../../src/services/ats-fit-score.service.js';

describe('Arbitrary Job Description Formats & Requirement Semantics (Anti-Overfitting)', () => {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const candidateId = randomUUID();
  const mockRepoResourceId = randomUUID();

  const context = {
    tenantId,
    userId,
    candidateId,
    scopes: ['career:read', 'career:write'],
  };

  const createCandidate = () => ({
    id: candidateId,
    tenantId,
    userId,
    skills: [
      {
        id: randomUUID(),
        slug: 'react',
        name: 'React',
        provenanceStatus: 'VERIFIED',
        truthCategory: 'VERIFIED',
        evidenceCount: 1,
        primaryEvidence: {
          id: randomUUID(),
          resourceId: mockRepoResourceId,
          resourceName: 'frontend-app',
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          filePath: 'package.json',
        },
      },
      {
        id: randomUUID(),
        slug: 'node-js',
        name: 'Node.js',
        provenanceStatus: 'SELF_DECLARED',
        truthCategory: 'CLAIMED',
        evidenceCount: 0,
        primaryEvidence: null,
      },
      {
        id: randomUUID(),
        slug: 'javascript',
        name: 'JavaScript',
        provenanceStatus: 'VERIFIED',
        truthCategory: 'VERIFIED',
        evidenceCount: 1,
        primaryEvidence: {
          id: randomUUID(),
          resourceId: mockRepoResourceId,
          resourceName: 'frontend-app',
          evidenceType: 'CODE_USAGE',
          filePath: 'src/index.js',
        },
      },
      {
        id: randomUUID(),
        slug: 'postgresql',
        name: 'PostgreSQL',
        provenanceStatus: 'VERIFIED',
        truthCategory: 'VERIFIED',
        evidenceCount: 1,
        primaryEvidence: {
          id: randomUUID(),
          resourceId: mockRepoResourceId,
          resourceName: 'frontend-app',
          evidenceType: 'CONFIG_SYNTAX_DECLARATION',
          filePath: 'docker-compose.yml',
        },
      },
      {
        id: randomUUID(),
        slug: 'docker',
        name: 'Docker',
        provenanceStatus: 'SELF_DECLARED',
        truthCategory: 'CLAIMED',
        evidenceCount: 0,
        primaryEvidence: null,
      },
    ],
    projects: [
      {
        id: randomUUID(),
        tenantId,
        name: 'Web Platform',
        slug: 'web-platform',
        skills: ['react', 'javascript', 'postgresql'],
        evidence: [
          {
            id: randomUUID(),
            skillSlug: 'react',
            skillName: 'React',
            filePath: 'src/App.jsx',
            evidenceType: 'CODE_USAGE',
            confidenceScore: 0.95,
          },
        ],
        resources: [{ id: mockRepoResourceId, name: 'frontend-app' }],
      },
    ],
  });

  describe('Format 1: Required / Preferred with bullets', () => {
    const jdText = `
Software Engineer

Required:
- React
- Node.js

Preferred:
- Docker
- AWS
`;

    it('extracts requirements preserving REQUIRED vs PREFERRED', () => {
      const items = parseJobDescriptionSections(jdText);
      const react = items.find((i) => i.text.toLowerCase().includes('react'));
      const node = items.find((i) => i.text.toLowerCase().includes('node'));
      const docker = items.find((i) => i.text.toLowerCase().includes('docker'));
      const aws = items.find((i) => i.text.toLowerCase().includes('aws'));

      assert.ok(react, 'React extracted');
      assert.equal(react.importance, 'REQUIRED');
      assert.ok(node, 'Node.js extracted');
      assert.equal(node.importance, 'REQUIRED');

      assert.ok(docker, 'Docker extracted');
      assert.equal(docker.importance, 'PREFERRED');
      assert.ok(aws, 'AWS extracted');
      assert.equal(aws.importance, 'PREFERRED');
    });

    it('normalizes job input with canonical required flags', () => {
      const normalized = normalizeJobInput(jdText);
      const reqs = normalized.normalizedRequirements;

      const react = reqs.find((r) => r.text.toLowerCase().includes('react'));
      const node = reqs.find((r) => r.text.toLowerCase().includes('node'));
      const docker = reqs.find((r) => r.text.toLowerCase().includes('docker'));
      const aws = reqs.find((r) => r.text.toLowerCase().includes('aws'));

      assert.equal(react.required, true);
      assert.equal(node.required, true);
      assert.equal(docker.required, false);
      assert.equal(aws.required, false);
    });
  });

  describe('Format 2: Must have / Nice to have with bullets', () => {
    const jdText = `
Backend Engineer

Must have:
- React
- PostgreSQL

Nice to have:
- Redis
`;

    it('extracts requirements preserving REQUIRED vs PREFERRED', () => {
      const items = parseJobDescriptionSections(jdText);
      const react = items.find((i) => i.text.toLowerCase().includes('react'));
      const pg = items.find((i) => i.text.toLowerCase().includes('postgres'));
      const redis = items.find((i) => i.text.toLowerCase().includes('redis'));

      assert.ok(react, 'React extracted');
      assert.equal(react.importance, 'REQUIRED');
      assert.ok(pg, 'PostgreSQL extracted');
      assert.equal(pg.importance, 'REQUIRED');

      assert.ok(redis, 'Redis extracted');
      assert.equal(redis.importance, 'PREFERRED');
    });

    it('normalizes job input with canonical required flags', () => {
      const normalized = normalizeJobInput(jdText);
      const reqs = normalized.normalizedRequirements;

      const react = reqs.find((r) => r.text.toLowerCase().includes('react'));
      const pg = reqs.find((r) => r.text.toLowerCase().includes('postgres'));
      const redis = reqs.find((r) => r.text.toLowerCase().includes('redis'));

      assert.equal(react.required, true);
      assert.equal(pg.required, true);
      assert.equal(redis.required, false);
    });
  });

  describe('Format 3: Required qualifications / Preferred qualifications with multi-skill lines', () => {
    const jdText = `
Full Stack Developer

Required qualifications:
JavaScript and React.

Preferred qualifications:
Next.js or Vue.
`;

    it('extracts multi-skill lines into atomic requirement items with correct priorities', () => {
      const items = parseJobDescriptionSections(jdText);

      const js = items.find((i) => i.text.toLowerCase().includes('javascript'));
      const react = items.find((i) => i.text.toLowerCase().includes('react'));
      const next = items.find((i) => i.text.toLowerCase().includes('next'));
      const vue = items.find((i) => i.text.toLowerCase().includes('vue'));

      assert.ok(js, 'JavaScript extracted individually');
      assert.equal(js.importance, 'REQUIRED');
      assert.ok(react, 'React extracted individually');
      assert.equal(react.importance, 'REQUIRED');

      assert.ok(next, 'Next.js extracted individually');
      assert.equal(next.importance, 'PREFERRED');
      assert.ok(vue, 'Vue extracted individually');
      assert.equal(vue.importance, 'PREFERRED');
    });

    it('normalizes job input with canonical required flags', () => {
      const normalized = normalizeJobInput(jdText);
      const reqs = normalized.normalizedRequirements;

      const js = reqs.find((r) => r.text.toLowerCase().includes('javascript'));
      const react = reqs.find((r) => r.text.toLowerCase().includes('react'));
      const next = reqs.find((r) => r.text.toLowerCase().includes('next'));

      assert.equal(js.required, true);
      assert.equal(react.required, true);
      assert.equal(next.required, false);
    });
  });

  describe('Format 4: You must have / Bonus without bullets', () => {
    const jdText = `
Platform Engineer

You must have:
React
Node.js

Bonus:
Docker
AWS
`;

    it('extracts requirements preserving REQUIRED vs PREFERRED', () => {
      const items = parseJobDescriptionSections(jdText);

      const react = items.find((i) => i.text.toLowerCase().includes('react'));
      const node = items.find((i) => i.text.toLowerCase().includes('node'));
      const docker = items.find((i) => i.text.toLowerCase().includes('docker'));
      const aws = items.find((i) => i.text.toLowerCase().includes('aws'));

      assert.ok(react, 'React extracted');
      assert.equal(react.importance, 'REQUIRED');
      assert.ok(node, 'Node.js extracted');
      assert.equal(node.importance, 'REQUIRED');

      assert.ok(docker, 'Docker extracted');
      assert.equal(docker.importance, 'PREFERRED');
      assert.ok(aws, 'AWS extracted');
      assert.equal(aws.importance, 'PREFERRED');
    });

    it('end-to-end evidence matching and ATS scoring preserves semantics', () => {
      const candidate = createCandidate();
      const normalized = normalizeJobInput(jdText);

      const jobDescription = {
        id: randomUUID(),
        tenantId,
        title: 'Platform Engineer',
        requirements: normalized.normalizedRequirements,
      };

      const matchAnalysis = EvidenceMatchingService.matchJobToCandidate(
        context,
        jobDescription,
        candidate
      );

      // Verify Match Statuses
      const reactMatch = matchAnalysis.requirementMatches.find((m) =>
        m.normalizedRequirement.toLowerCase().includes('react')
      );
      const nodeMatch = matchAnalysis.requirementMatches.find((m) =>
        m.normalizedRequirement.toLowerCase().includes('node')
      );
      const dockerMatch = matchAnalysis.requirementMatches.find((m) =>
        m.normalizedRequirement.toLowerCase().includes('docker')
      );
      const awsMatch = matchAnalysis.requirementMatches.find((m) =>
        m.normalizedRequirement.toLowerCase().includes('aws')
      );

      // React: VERIFIED in profile -> MATCHED, required: true
      assert.equal(reactMatch.required, true);
      assert.equal(reactMatch.matchStatus, 'MATCHED');

      // Node.js: SELF_DECLARED in profile -> UNVERIFIED_CLAIM, required: true
      assert.equal(nodeMatch.required, true);
      assert.equal(nodeMatch.matchStatus, 'UNVERIFIED_CLAIM');
      assert.notEqual(nodeMatch.matchStatus, 'MATCHED');

      // Docker: SELF_DECLARED in profile -> UNVERIFIED_CLAIM, required: false
      assert.equal(dockerMatch.required, false);
      assert.equal(dockerMatch.matchStatus, 'UNVERIFIED_CLAIM');

      // AWS: Not in profile -> MISSING, required: false
      assert.equal(awsMatch.required, false);
      assert.equal(awsMatch.matchStatus, 'MISSING');

      // Summary counts strictly equal partition
      const summary = matchAnalysis.summary;
      assert.equal(summary.matchedCount, 1); // React
      assert.equal(summary.unverifiedClaimCount, 2); // Node.js, Docker
      assert.equal(summary.missingCount, 1); // AWS
      assert.equal(summary.partialCount, 0);
      assert.equal(
        summary.matchedCount +
          summary.partialCount +
          summary.unverifiedClaimCount +
          summary.missingCount +
          summary.unknownCount,
        summary.totalRequirements
      );

      // ATS Fit Score: requiredSkillsScore must be > 0 and preferredSkillsScore must be separate
      const fitScore = AtsFitScoreService.calculateCandidateJobFit(
        context,
        jobDescription,
        matchAnalysis,
        { candidateId, jobDescriptionId: jobDescription.id, projectRankings: [] },
        candidate
      );

      assert.ok(
        fitScore.scoreBreakdown.requiredSkillsScore > 0,
        `Expected requiredSkillsScore > 0, got ${fitScore.scoreBreakdown.requiredSkillsScore}`
      );
      assert.ok(
        fitScore.scoreBreakdown.preferredSkillsScore >= 0,
        `Expected preferredSkillsScore >= 0, got ${fitScore.scoreBreakdown.preferredSkillsScore}`
      );
    });
  });
});
