/**
 * @file Unit Tests: P47 — Project Evidence Capacity, Bullet Minimums, and Validator Disambiguation
 *
 * Verifies:
 * 1. Source evidence extraction per project (≥3 authentic bullets).
 * 2. Final rendered bullet count ≥3 for each selected project.
 * 3. Top N=2 projects match authoritative ranking without alteration.
 * 4. Proof every bullet is candidate-supported with zero fabrication.
 * 5. Validator emits INSUFFICIENT_SOURCE_EVIDENCE when candidate project lacks 3 bullets.
 * 6. Validator emits PIPELINE_FAILURE when authoritative projects exist but pipeline failed to render them.
 * 7. Validator fails if 0 projects rendered while eligible projects exist.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStructuredResumeDocument,
  buildStructuredResumeSnapshot,
  validateStructuredResumeIntegrity,
} from '../../src/services/structured-resume.service.js';
import {
  assessPreRenderQuality,
  GATE_FINDING_CODES,
  GATE_SEVERITY,
} from '../../src/services/resume-content-quality-gate.service.js';

describe('P47: Project Evidence Capacity & Validator Disambiguation', () => {
  const TENANT_ID = 'p47-test-tenant-0000-0000-000000000001';
  const CANDIDATE_ID = 'p47-test-cand-0000-0000-000000000001';

  const proj1Id = 'p47-proj-1-0000-0000-000000000001';
  const proj2Id = 'p47-proj-2-0000-0000-000000000002';
  const proj3Id = 'p47-proj-3-0000-0000-000000000003';

  const baseProfile = {
    id: CANDIDATE_ID,
    tenantId: TENANT_ID,
    displayName: 'Alex Morgan',
    email: 'alex.morgan@example.com',
    skills: [
      {
        id: 'sk-1',
        name: 'TypeScript',
        slug: 'typescript',
        category: 'Languages',
        provenanceStatus: 'VERIFIED',
      },
      {
        id: 'sk-2',
        name: 'React',
        slug: 'react',
        category: 'Frameworks & Libraries',
        provenanceStatus: 'VERIFIED',
      },
      {
        id: 'sk-3',
        name: 'Node.js',
        slug: 'node-js',
        category: 'Frameworks & Libraries',
        provenanceStatus: 'VERIFIED',
      },
      {
        id: 'sk-4',
        name: 'PostgreSQL',
        slug: 'postgresql',
        category: 'Databases',
        provenanceStatus: 'VERIFIED',
      },
    ],
    experience: [
      {
        company: 'CloudSystems Inc',
        title: 'Full-Stack Engineer',
        bullets: [
          'Architected microservices handling high concurrency with Node.js and PostgreSQL.',
        ],
      },
    ],
    education: [
      {
        institution: 'Georgia Tech',
        degree: 'B.S. Computer Science',
      },
    ],
    projects: [
      {
        id: proj1Id,
        name: 'Collaborative Task Manager',
        bullets: [
          'Built a secure, full-stack task management platform with JWT-based authentication and fine-grained RBAC.',
          'Designed and implemented high-performance RESTful CRUD APIs using Node.js and Prisma ORM.',
          'Improved team productivity and coordination overhead by providing a responsive interface with real-time updates.',
        ],
        technologies: ['TypeScript', 'Node.js', 'PostgreSQL'],
        role: 'Full-Stack Developer',
      },
      {
        id: proj2Id,
        name: 'AI Code Review Assistant',
        bullets: [
          'Developed an intelligent automated code review system by integrating OpenAI API to analyze GitHub Pull Requests.',
          'Engineered a Flask backend with asynchronous FastAPI endpoints to handle real-time GitHub webhook integrations.',
          'Reduced average manual code review time across multiple repositories by automating code evaluation.',
        ],
        technologies: ['Python', 'FastAPI', 'PostgreSQL'],
        role: 'Backend Developer',
      },
      {
        id: proj3Id,
        name: 'Product Data Explorer',
        bullets: [
          'Architected full-stack product explorer with Next.js 14 frontend, Tailwind CSS, and server-side rendering.',
          'Engineered modular NestJS backend with TypeORM, PostgreSQL persistence, and Redis caching layer.',
          'Integrated Swagger/OpenAPI documentation and containerized services using Docker Compose.',
        ],
        technologies: ['TypeScript', 'NestJS', 'PostgreSQL', 'Redis'],
        role: 'Full-Stack Developer',
      },
    ],
  };

  const sampleJob = {
    id: 'job-p47-1',
    title: 'Senior Full-Stack Developer — React / Node.js / PostgreSQL',
    company: 'NextGen Tech',
    requirements: ['React', 'Node.js', 'PostgreSQL', 'TypeScript'],
  };

  const authoritativeRankings = [
    {
      id: proj1Id,
      projectId: proj1Id,
      name: 'Collaborative Task Manager',
      relevanceScore: 92,
      status: 'SELECTED',
      matchedRequirements: ['TypeScript', 'Node.js', 'PostgreSQL'],
    },
    {
      id: proj2Id,
      projectId: proj2Id,
      name: 'AI Code Review Assistant',
      relevanceScore: 84,
      status: 'SELECTED',
      matchedRequirements: ['PostgreSQL'],
    },
    {
      id: proj3Id,
      projectId: proj3Id,
      name: 'Product Data Explorer',
      relevanceScore: 78,
      status: 'OMITTED_BUDGET',
      matchedRequirements: ['TypeScript', 'PostgreSQL'],
    },
  ];

  it('1. Extracts >=3 authentic source bullets per candidate project', () => {
    for (const proj of baseProfile.projects) {
      assert.ok(Array.isArray(proj.bullets), `Project ${proj.name} should have bullets array`);
      assert.ok(
        proj.bullets.length >= 3,
        `Project ${proj.name} must have >= 3 authentic bullets, got ${proj.bullets.length}`
      );
    }
  });

  it('2. Renders top N=2 projects matching authoritative ranking with >=3 bullets each', () => {
    const snapshot = buildStructuredResumeSnapshot({
      candidateProfile: baseProfile,
      jobPosting: sampleJob,
      options: {
        projectRankings: authoritativeRankings,
      },
    });

    const rendered = snapshot.structuredResume.projects;
    assert.equal(rendered.length, 2, 'Must render exactly N=2 projects');
    assert.equal(
      rendered[0].projectId,
      proj1Id,
      'First project must match top authoritative ranking'
    );
    assert.equal(
      rendered[1].projectId,
      proj2Id,
      'Second project must match second authoritative ranking'
    );

    for (const p of rendered) {
      assert.ok(
        p.bullets.length >= 3,
        `Project ${p.displayName} must have >= 3 bullets, got ${p.bullets.length}`
      );
    }

    assert.equal(snapshot.evidenceValidationReceipt.overallStatus, 'PASS');
    assert.equal(snapshot.evidenceValidationReceipt.violations.length, 0);
  });

  it('3. Proof every rendered bullet is strictly candidate-supported (zero fabrication)', () => {
    const snapshot = buildStructuredResumeSnapshot({
      candidateProfile: baseProfile,
      jobPosting: sampleJob,
      options: {
        projectRankings: authoritativeRankings,
      },
    });

    const rendered = snapshot.structuredResume.projects;
    for (const renderedProj of rendered) {
      const sourceProj = baseProfile.projects.find((p) => p.id === renderedProj.projectId);
      assert.ok(sourceProj, `Source project must exist for ${renderedProj.displayName}`);

      const sourceBulletTexts = sourceProj.bullets.map((b) =>
        (typeof b === 'string' ? b : b.text).trim()
      );
      for (const b of renderedProj.bullets) {
        const text = (typeof b === 'string' ? b : b.text).trim();
        assert.ok(
          sourceBulletTexts.includes(text),
          `Rendered bullet '${text}' must be an authentic candidate bullet from source project`
        );
      }
    }
  });

  it('4. Validator emits INSUFFICIENT_SOURCE_EVIDENCE when candidate project lacks 3 bullets', () => {
    const candidateWithThinProjects = {
      ...baseProfile,
      projects: [
        {
          id: proj1Id,
          name: 'Thin Project Alpha',
          bullets: ['Only bullet 1', 'Only bullet 2'],
          technologies: ['TypeScript', 'Node.js'],
        },
        {
          id: proj2Id,
          name: 'Thin Project Beta',
          bullets: ['Only one bullet'],
          technologies: ['Python', 'PostgreSQL'],
        },
      ],
    };

    const doc = buildStructuredResumeDocument({
      candidateProfile: candidateWithThinProjects,
      jobPosting: sampleJob,
      options: {
        projectRankings: [
          {
            id: proj1Id,
            projectId: proj1Id,
            name: 'Thin Project Alpha',
            relevanceScore: 90,
            status: 'SELECTED',
          },
          {
            id: proj2Id,
            projectId: proj2Id,
            name: 'Thin Project Beta',
            relevanceScore: 80,
            status: 'SELECTED',
          },
        ],
      },
    });

    // Both projects should be dropped due to <3 bullets
    assert.equal(doc.projects.length, 0, 'Both thin projects must be dropped from rendering');
    const removalRecords =
      doc.debugTrace?.projectRemovalRecords || doc.metadata?.projectRemovalRecords || [];
    assert.ok(removalRecords.length >= 2, 'Must record project removal records');
    assert.ok(
      removalRecords.every((r) => r.reason === 'INSUFFICIENT_CANDIDATE_BULLETS'),
      'Removal reason must be INSUFFICIENT_CANDIDATE_BULLETS'
    );

    // Evidence validation receipt audit
    const receipt = validateStructuredResumeIntegrity(doc);
    assert.equal(
      receipt.overallStatus,
      'FAIL',
      'Integrity validation must FAIL when 0 projects rendered due to insufficient source evidence'
    );

    const violation = receipt.violations.find(
      (v) => v.violationType === 'INSUFFICIENT_SOURCE_EVIDENCE'
    );
    assert.ok(violation, 'Must emit INSUFFICIENT_SOURCE_EVIDENCE violation');
    assert.match(violation.message, /lack the required minimum 3 candidate-supported bullets/);

    // Pre-render content quality gate
    const gate = assessPreRenderQuality({ structuredResume: doc });
    assert.equal(gate.passed, false, 'Quality gate must fail');
    const gateFinding = gate.findings.find(
      (f) => f.code === GATE_FINDING_CODES.INSUFFICIENT_SOURCE_EVIDENCE
    );
    assert.ok(gateFinding, 'Gate must emit INSUFFICIENT_SOURCE_EVIDENCE finding');
    assert.equal(gateFinding.severity, GATE_SEVERITY.FAIL);
  });

  it('5. Validator emits PIPELINE_FAILURE when authoritative projects exist but pipeline failed to select them', () => {
    // Construct a document where authoritative projects existed but projects array is empty without removal records
    const mockDoc = {
      documentId: '00000000-0000-0000-0000-000000000001',
      candidateIdentity: { displayName: 'Alex Morgan' },
      projects: [],
      skills: { categories: [] },
      metadata: {
        authoritativeEligibleProjectCount: 2,
        selectedProjectIds: [],
        projectRemovalRecords: [],
      },
    };

    const receipt = validateStructuredResumeIntegrity(mockDoc);
    assert.equal(receipt.overallStatus, 'FAIL');
    const violation = receipt.violations.find((v) => v.violationType === 'PIPELINE_FAILURE');
    assert.ok(violation, 'Must emit PIPELINE_FAILURE violation');
    assert.match(violation.message, /despite 2 authoritative eligible projects existing/);

    const gate = assessPreRenderQuality({ structuredResume: mockDoc });
    assert.equal(gate.passed, false);
    const finding = gate.findings.find((f) => f.code === GATE_FINDING_CODES.PIPELINE_FAILURE);
    assert.ok(finding, 'Gate must emit PIPELINE_FAILURE finding');
  });

  it('6. Allows 0 projects legitimately when candidate genuinely has 0 projects and 0 eligible rankings', () => {
    const mockZeroDoc = {
      documentId: '00000000-0000-0000-0000-000000000002',
      candidateIdentity: { displayName: 'Alex Morgan' },
      projects: [],
      skills: { categories: [] },
      metadata: {
        authoritativeEligibleProjectCount: 0,
        selectedProjectIds: [],
        projectRemovalRecords: [],
      },
    };

    const receipt = validateStructuredResumeIntegrity(mockZeroDoc);
    assert.equal(
      receipt.overallStatus,
      'PASS',
      'Zero projects is permitted when candidate genuinely has zero eligible projects'
    );
    assert.equal(receipt.violations.length, 0);

    const gate = assessPreRenderQuality({ structuredResume: mockZeroDoc });
    const projectFindings = gate.findings.filter(
      (f) =>
        f.code === GATE_FINDING_CODES.INSUFFICIENT_SOURCE_EVIDENCE ||
        f.code === GATE_FINDING_CODES.PIPELINE_FAILURE
    );
    assert.equal(
      projectFindings.length,
      0,
      'No project failure findings when zero eligible projects exist'
    );
  });
});
