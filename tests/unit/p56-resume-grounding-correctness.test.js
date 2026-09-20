/**
 * @file P56 Resume-Grounding Correctness Test Suite
 *
 * Validates:
 * 1. Unsupported outcome claim rejected (UNSUPPORTED_OUTCOME violation).
 * 2. Unsupported metric claim rejected (UNSUPPORTED_METRIC violation).
 * 3. Supported implementation claim accepted (valid: true, no violations).
 * 4. Mixed bullet safely rewritten to supported portion or rejected if pure outcome.
 * 5. Fallback-generated bullets undergo identical validation.
 * 6. Final canonical structured resume cannot contain unsupported outcome/metric bullets.
 * 7. 3-bullets-per-project requirement remains strictly intact.
 * 8. Project ranking and selection logic remains unchanged.
 * 9. PII protection and context privacy remain intact.
 * 10. MCP and Extension workflow parity is preserved.
 * 11. User-provided skills behavior remains intact.
 * 12. Heading precedence remains intact.
 * 13. Renderer output remains visually identical with zero layout/styling alterations.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ResumeClaimValidationService,
  defaultResumeClaimValidationService,
  validateClaimEvidenceGrounding,
  sanitizeAccomplishmentClaim,
  hasUnsupportedOutcomeOrMetric,
} from '../../src/services/resume-claim-validation.service.js';

import { sanitizeGroundedAccomplishment } from '../../src/services/resume-composition-primitives.js';

import {
  buildStructuredResumeDocument,
  buildStructuredResumeSnapshot,
} from '../../src/services/structured-resume.service.js';

import { CandidateArtifactContentService } from '../../src/services/candidate-artifact-content.service.js';

import {
  buildResumeAiContext,
  validateAiPrivacy,
} from '../../src/services/ai-context-sanitizer.service.js';

import { AiResumeContentGeneratorService } from '../../src/services/ai-resume-content-generator.service.js';

import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';

describe('P56 Resume-Grounding Correctness Test Suite', () => {
  const sampleProjectFacts = [
    {
      factId: 'fact-1',
      id: 'fact-1',
      projectId: 'proj-1',
      ownerId: 'proj-1',
      text: 'Engineered a Flask backend with asynchronous FastAPI endpoints to handle real-time GitHub webhook integrations.',
      canonicalFactType: 'IMPLEMENTATION',
      provenanceStatus: 'VERIFIED',
      sourceType: 'CANDIDATE_PROJECT_BULLET',
      source: 'CANDIDATE_PROJECT_BULLET',
      technologies: ['Flask', 'FastAPI', 'Python'],
    },
    {
      factId: 'fact-2',
      id: 'fact-2',
      projectId: 'proj-1',
      ownerId: 'proj-1',
      text: 'Developed an intelligent automated code review system by integrating OpenAI API to analyze GitHub Pull Requests.',
      canonicalFactType: 'IMPLEMENTATION',
      provenanceStatus: 'VERIFIED',
      sourceType: 'CANDIDATE_PROJECT_BULLET',
      source: 'CANDIDATE_PROJECT_BULLET',
      technologies: ['OpenAI API', 'Python'],
    },
    {
      factId: 'fact-3',
      id: 'fact-3',
      projectId: 'proj-1',
      ownerId: 'proj-1',
      text: 'Reduced average manual code review time across multiple repositories by automating code evaluation, resulting in improved developer velocity and code quality standards.',
      canonicalFactType: 'IMPLEMENTATION',
      provenanceStatus: 'VERIFIED',
      sourceType: 'bullet', // unverified candidate self-declaration in bullet
      source: 'CANDIDATE_PROJECT_BULLET',
    },
  ];

  const sampleCandidate = {
    id: 'cand-p56-001',
    name: 'Morgan Fletcher',
    displayName: 'Morgan Fletcher',
    email: 'morgan.fletcher@gmail.com',
    phone: '+1 555 333 4444',
    location: 'Seattle, WA',
    targetRole: 'Backend Engineer',
    skills: ['Python', 'FastAPI', 'Flask', 'PostgreSQL', 'Docker'],
    projects: [
      {
        id: 'proj-1',
        projectId: 'proj-1',
        name: 'code-review-assistant',
        displayName: 'AI Code Review Assistant',
        technologies: ['Python', 'FastAPI', 'Flask', 'OpenAI API'],
        bullets: [
          'Engineered a Flask backend with asynchronous FastAPI endpoints to handle real-time GitHub webhook integrations.',
          'Developed an intelligent automated code review system by integrating OpenAI API to analyze GitHub Pull Requests.',
          'Reduced average manual code review time across multiple repositories by automating code evaluation, resulting in improved developer velocity and code quality standards.',
        ],
        metadata: {
          bullets: [
            'Engineered a Flask backend with asynchronous FastAPI endpoints to handle real-time GitHub webhook integrations.',
            'Developed an intelligent automated code review system by integrating OpenAI API to analyze GitHub Pull Requests.',
            'Reduced average manual code review time across multiple repositories by automating code evaluation, resulting in improved developer velocity and code quality standards.',
          ],
        },
      },
      {
        id: 'proj-2',
        projectId: 'proj-2',
        name: 'task-engine',
        displayName: 'Distributed Task Engine',
        technologies: ['Node.js', 'PostgreSQL', 'Prisma', 'Socket.io'],
        bullets: [
          'Architected a full-stack task management platform using Node.js and TypeScript.',
          'Engineered high-performance RESTful CRUD APIs using Node.js and Prisma ORM.',
          'Implemented JWT-based authentication and Role-Based Access Control (RBAC) alongside real-time Socket.io updates.',
        ],
        metadata: {
          bullets: [
            'Architected a full-stack task management platform using Node.js and TypeScript.',
            'Engineered high-performance RESTful CRUD APIs using Node.js and Prisma ORM.',
            'Implemented JWT-based authentication and Role-Based Access Control (RBAC) alongside real-time Socket.io updates.',
          ],
        },
      },
    ],
    experience: [],
    education: [
      {
        institution: 'University of Washington',
        degree: 'Bachelor of Science in Computer Science',
        graduationDate: '2023',
      },
    ],
  };

  const sampleJobPosting = {
    title: 'Senior Backend Engineer',
    company: 'Tech Corp',
    description:
      'Looking for a Senior Backend Engineer skilled in Python, FastAPI, and PostgreSQL.',
    requirements: ['Python', 'FastAPI', 'Flask', 'PostgreSQL', 'Microservices'],
  };

  // ── Requirement 1: Unsupported outcome claim rejected ──────────────────────
  it('Req 1: rejects unverified outcome claims without circular authorization from self-authored bullets', () => {
    const pureOutcomeBullet =
      'Reduced code review time across repositories, resulting in improved developer velocity.';
    const isUnsupported = hasUnsupportedOutcomeOrMetric(pureOutcomeBullet, sampleProjectFacts);
    assert.equal(
      isUnsupported,
      true,
      'Pure unsupported outcome claim should be detected as unsupported'
    );

    const result = validateClaimEvidenceGrounding(
      {
        text: pureOutcomeBullet,
        factIds: ['fact-3'],
        sourceFact: pureOutcomeBullet,
        transformationType: 'VERBATIM',
      },
      {
        factInventory: sampleProjectFacts,
        contributingFacts: sampleProjectFacts,
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'proj-1',
        candidateProfile: sampleCandidate,
      }
    );

    assert.equal(result.valid, false, 'Pure unsupported outcome claim should be rejected');
    const hasOutcomeViolation = result.violations.some((v) => v.code === 'UNSUPPORTED_OUTCOME');
    assert.equal(hasOutcomeViolation, true, 'Should flag UNSUPPORTED_OUTCOME violation');
  });

  // ── Requirement 2: Unsupported metric claim rejected ──────────────────────
  it('Req 2: rejects unverified percentage reductions or numeric metrics without corroborated metric evidence', () => {
    const unverifiedMetricBullet = 'Optimized SQL queries, reduced database latency by 45%.';
    const isUnsupported = hasUnsupportedOutcomeOrMetric(unverifiedMetricBullet, sampleProjectFacts);
    assert.equal(isUnsupported, true, 'Unverified metric claim should be detected as unsupported');

    const result = validateClaimEvidenceGrounding(
      {
        text: unverifiedMetricBullet,
        factIds: ['fact-1'],
        sourceFact: unverifiedMetricBullet,
        transformationType: 'VERBATIM',
      },
      {
        factInventory: sampleProjectFacts,
        contributingFacts: sampleProjectFacts,
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'proj-1',
        candidateProfile: sampleCandidate,
      }
    );

    assert.equal(result.valid, false, 'Unverified metric claim should be rejected');
    const hasMetricViolation = result.violations.some((v) => v.code === 'UNSUPPORTED_METRIC');
    assert.equal(hasMetricViolation, true, 'Should flag UNSUPPORTED_METRIC violation');
  });

  // ── Requirement 3: Supported implementation claim accepted ────────────────
  it('Req 3: accepts substantiated engineering implementation claims', () => {
    const substantiatedBullet =
      'Engineered a Flask backend with asynchronous FastAPI endpoints to handle real-time GitHub webhook integrations.';
    const isUnsupported = hasUnsupportedOutcomeOrMetric(substantiatedBullet, sampleProjectFacts);
    assert.equal(
      isUnsupported,
      false,
      'Substantiated implementation bullet has no unsupported outcomes'
    );

    const result = validateClaimEvidenceGrounding(
      {
        text: substantiatedBullet,
        factIds: ['fact-1'],
        sourceFact: sampleProjectFacts[0].text,
        transformationType: 'VERBATIM',
      },
      {
        factInventory: sampleProjectFacts,
        contributingFacts: [sampleProjectFacts[0]],
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'proj-1',
        candidateProfile: sampleCandidate,
        project: sampleCandidate.projects[0],
      }
    );

    assert.equal(result.valid, true, 'Substantiated implementation claim should be accepted');
    assert.equal(result.violations.length, 0, 'Should have no violations');
  });

  // ── Requirement 4: Mixed bullet safely rewritten or rejected ─────────────
  it('Req 4: safely rewrites mixed bullets extracting supported engineering action and stripping ungrounded outcome clauses', () => {
    const mixedBullet =
      'Reduced average manual code review time across multiple repositories by automating code evaluation, resulting in improved developer velocity and code quality standards.';
    const sanitized = sanitizeAccomplishmentClaim(mixedBullet);

    assert.equal(
      sanitized,
      'Automated code evaluation across multiple repositories.',
      'Mixed bullet should be rewritten to active past tense supported implementation'
    );

    // Verify hasUnsupportedOutcomeOrMetric is false for sanitized accomplishment
    assert.equal(
      hasUnsupportedOutcomeOrMetric(sanitized, sampleProjectFacts),
      false,
      'Sanitized accomplishment should have no unsupported outcomes'
    );
  });

  // ── Requirement 5: Fallback-generated bullets undergo identical validation ─
  it('Req 5: validates fallback-generated bullets with identical grounding rules and strips outcome buzzwords', () => {
    const generator = new AiResumeContentGeneratorService();
    const fallbackBullets = generator._synthesizeJobConditionedProjectBullets({
      proj: sampleCandidate.projects[0],
      targetJobPosting: sampleJobPosting,
      isFullStack: false,
      isFrontend: false,
      isBackend: true,
      isPython: true,
      isDevOps: false,
      isDistributed: false,
      availableFacts: sampleProjectFacts,
      candidate: sampleCandidate,
    });

    assert.ok(Array.isArray(fallbackBullets), 'Fallback bullets should be an array');
    assert.equal(fallbackBullets.length, 3, 'Should produce exactly 3 fallback bullets');

    for (const b of fallbackBullets) {
      assert.doesNotMatch(
        b.text,
        /developer velocity/i,
        'No bullet may contain developer velocity'
      );
      assert.doesNotMatch(
        b.text,
        /code quality standards/i,
        'No bullet may contain code quality standards'
      );
      assert.doesNotMatch(
        b.text,
        /reduced average manual code review time/i,
        'No bullet may contain ungrounded review time claim'
      );
      assert.equal(
        hasUnsupportedOutcomeOrMetric(b.text, sampleProjectFacts),
        false,
        'Must be fully supported'
      );
    }
  });

  // ── Requirement 6: Final canonical resume cannot contain unsupported bullet ─
  it('Req 6: ensures canonical StructuredResume document rejects or sanitizes ungrounded bullets', () => {
    // Inject ungrounded bullets directly in aiContent
    const mockAiContent = {
      projectBullets: {
        'proj-1': [
          {
            text: 'Engineered a Flask backend with asynchronous FastAPI endpoints.',
            composedFromFactIds: ['fact-1'],
          },
          {
            text: 'Developed an intelligent automated code review system using OpenAI API.',
            composedFromFactIds: ['fact-2'],
          },
          {
            text: 'Reduced average manual code review time across multiple repositories by automating code evaluation, resulting in improved developer velocity and code quality standards.',
            composedFromFactIds: ['fact-3'],
          },
        ],
      },
    };

    const contentSvc = new CandidateArtifactContentService();
    const ranked = contentSvc.rankProjectsForJob(sampleCandidate, sampleJobPosting);

    const doc = buildStructuredResumeDocument({
      candidateProfile: sampleCandidate,
      jobPosting: sampleJobPosting,
      options: {
        aiContent: mockAiContent,
        projectRankings: ranked.selectedProjects,
      },
    });

    const project1 = doc.projects.find((p) => p.projectId === 'proj-1');
    assert.ok(project1, 'Project 1 must be present');
    assert.equal(project1.bullets.length, 3, 'Project 1 must have 3 bullets');

    for (const b of project1.bullets) {
      const text = typeof b === 'string' ? b : b.text;
      assert.doesNotMatch(text, /developer velocity/i);
      assert.doesNotMatch(text, /code quality standards/i);
      assert.doesNotMatch(text, /reduced average manual code review time/i);
      assert.equal(hasUnsupportedOutcomeOrMetric(text, sampleProjectFacts), false);
    }

    assert.equal(
      project1.bullets[2].text,
      'Automated code evaluation across multiple repositories.'
    );
  });

  // ── Requirement 7: 3-bullets-per-project requirement intact ────────────────
  it('Req 7: guarantees exactly 3 candidate-supported bullets per rendered project', () => {
    const contentSvc = new CandidateArtifactContentService();
    const ranked = contentSvc.rankProjectsForJob(sampleCandidate, sampleJobPosting);

    const doc = buildStructuredResumeDocument({
      candidateProfile: sampleCandidate,
      jobPosting: sampleJobPosting,
      options: {
        projectRankings: ranked.selectedProjects,
      },
    });

    assert.ok(Array.isArray(doc.projects), 'Projects must be an array');
    assert.equal(doc.projects.length, 2, 'Top 2 projects selected');
    for (const proj of doc.projects) {
      assert.equal(proj.bullets.length, 3, `Project ${proj.name} must have exactly 3 bullets`);
    }
  });

  // ── Requirement 8: Project ranking/selection unchanged ─────────────────────
  it('Req 8: preserves authoritative project ranking and selection logic', () => {
    const contentSvc = new CandidateArtifactContentService();
    const ranked = contentSvc.rankProjectsForJob(sampleCandidate, sampleJobPosting);

    assert.ok(Array.isArray(ranked.selectedProjects));
    assert.equal(ranked.selectedProjects.length, 2, 'Ranks all candidate projects');
    const selectedIds = ranked.selectedProjects.map((p) => p.id);
    assert.ok(selectedIds.includes('proj-1'), 'Project 1 is included in authoritative ranking');
    assert.ok(selectedIds.includes('proj-2'), 'Project 2 is included in authoritative ranking');
  });

  // ── Requirement 9: PII protection intact ──────────────────────────────────
  it('Req 9: ensures AI context and generated bullets are free from candidate PII', () => {
    const aiContext = buildResumeAiContext({
      candidateProfile: sampleCandidate,
      targetJobPosting: sampleJobPosting,
      selectedProjects: sampleCandidate.projects,
    });

    assert.doesNotMatch(JSON.stringify(aiContext), new RegExp(sampleCandidate.name, 'i'));
    assert.doesNotMatch(JSON.stringify(aiContext), new RegExp(sampleCandidate.email, 'i'));
    assert.doesNotMatch(JSON.stringify(aiContext), /555-333-4444/);
    assert.doesNotMatch(JSON.stringify(aiContext), /developer velocity/i);
  });

  // ── Requirement 10: MCP/Extension workflow parity intact ───────────────────
  it('Req 10: produces identical grounding and sanitization behavior in snapshot builder', () => {
    const snapshot = buildStructuredResumeSnapshot({
      candidateProfile: sampleCandidate,
      jobPosting: sampleJobPosting,
    });

    assert.ok(snapshot.structuredResume, 'Structured resume snapshot generated');
    assert.ok(snapshot.evidenceValidationReceipt, 'Evidence validation receipt generated');
    assert.equal(snapshot.evidenceValidationReceipt.overallStatus, 'PASS');

    for (const p of snapshot.structuredResume.projects) {
      assert.equal(p.bullets.length, 3, 'Every project has 3 bullets');
      for (const b of p.bullets) {
        const text = typeof b === 'string' ? b : b.text;
        assert.doesNotMatch(text, /developer velocity/i);
        assert.doesNotMatch(text, /code quality standards/i);
        assert.equal(hasUnsupportedOutcomeOrMetric(text, sampleProjectFacts), false);
      }
    }
  });

  // ── Requirement 11: User-provided skills behavior intact ──────────────────
  it('Req 11: preserves candidate verified skills without synthesizing unverified skills', () => {
    const doc = buildStructuredResumeDocument({
      candidateProfile: sampleCandidate,
      jobPosting: sampleJobPosting,
      options: {
        projectRankings: sampleCandidate.projects,
      },
    });

    const docSkills = doc.skills.categories.flatMap((c) => c.skills.map((s) => s.name));
    for (const s of docSkills) {
      assert.ok(
        sampleCandidate.skills.includes(s) ||
          sampleCandidate.projects.some((p) => p.technologies.includes(s)),
        `Skill ${s} must be candidate-owned`
      );
    }
  });

  // ── Requirement 12: Heading precedence intact ─────────────────────────────
  it('Req 12: preserves target role heading precedence', () => {
    const doc = buildStructuredResumeDocument({
      candidateProfile: sampleCandidate,
      jobPosting: sampleJobPosting,
      options: {
        projectRankings: sampleCandidate.projects,
      },
    });

    assert.ok(doc.targetRole, 'Target role is present');
    assert.match(doc.targetRole, /Senior Backend Engineer|Backend Engineer/i);
  });

  // ── Requirement 13: Renderer output visually identical ────────────────────
  it('Req 13: generates LaTeX document without layout, font, or margin alterations', () => {
    const snapshot = buildStructuredResumeSnapshot({
      candidateProfile: sampleCandidate,
      jobPosting: sampleJobPosting,
    });

    const generator = new LatexDocumentGenerator();
    const result = generator.generateTailoredResumeLatex({
      applicationPackage: {
        structuredResume: snapshot.structuredResume,
      },
    });

    const latex = result.texContent;
    assert.ok(latex.includes('\\documentclass['), 'Contains LaTeX documentclass');
    assert.ok(latex.includes('lmroman10'), 'Preserves frozen font lmroman10');
    assert.ok(latex.includes('0.52in') || latex.includes('0.5'), 'Preserves frozen margins');
    assert.doesNotMatch(
      latex,
      /developer velocity/i,
      'Generated LaTeX contains no developer velocity'
    );
    assert.doesNotMatch(
      latex,
      /code quality standards/i,
      'Generated LaTeX contains no code quality standards'
    );
  });
});
