/**
 * @file Unit Tests: P16-004 Hardening, Real-Candidate Verification & Genericity Invariants
 *
 * Implements the 15 mandatory semantic/negative regression tests for P16-004:
 * 1. dependency-only evidence cannot create accomplishment prose
 * 2. import-only evidence cannot create accomplishment prose
 * 3. file-path evidence cannot create accomplishment prose
 * 4. technology-only evidence cannot create accomplishment prose
 * 5. arbitrary unknown technologies do not trigger special logic
 * 6. arbitrary project names do not trigger special logic
 * 7. arbitrary candidate names do not trigger special logic
 * 8. arbitrary job roles do not trigger special logic
 * 9. summary cannot introduce unsupported claims (metrics/scale/tenure)
 * 10. DSA cannot fall back to generic filler
 * 11. file paths cannot appear in final PDF bullets
 * 12. source/evidence metadata cannot leak into final prose
 * 13. final PDF traceability catches dropped skills/summary/DSA/coursework/etc.
 * 14. final receipt corresponds exactly to final structured snapshot
 * 15. candidate-authored content remains intact
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EVIDENCE_SEMANTIC_CLASS,
  classifyEvidenceSemanticType,
  isClaimSafeToRender,
  isMeaningfulDsa,
  selectAndRephraseProjectBullets,
  generateGroundedSummary,
} from '../../src/services/resume-content-strategy.service.js';

import {
  buildStructuredResumeDocument,
  buildStructuredResumeSnapshot,
  validateStructuredResumeIntegrity,
  estimateProjectCapacity,
} from '../../src/services/structured-resume.service.js';

import {
  normalizeTechnologyName,
  isNoisyTechnology,
  formatTechnologyStack,
  CANONICAL_TECH_MAP,
} from '../../src/utils/technology-normalizer.js';

import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import { ResumeParserService } from '../../src/services/resume-parser.service.js';
import { PdfQaValidatorService } from '../../src/services/pdf-qa-validator.service.js';

describe('P16-004: Semantic Invariants & Hardening Regression Suite', () => {

  // 1. dependency-only evidence cannot create accomplishment prose
  it('1. dependency-only evidence cannot create accomplishment prose', () => {
    const depEv = {
      id: 'e1',
      evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
      packageName: 'express',
      version: '^4.18.2',
    };
    assert.strictEqual(classifyEvidenceSemanticType(depEv), EVIDENCE_SEMANTIC_CLASS.PRESENCE_EVIDENCE);
    assert.strictEqual(isClaimSafeToRender('express', EVIDENCE_SEMANTIC_CLASS.PRESENCE_EVIDENCE), false);

    const project = {
      id: 'p1',
      name: 'Sample Service',
      technologies: ['Node.js'],
      bullets: [],
      evidence: [depEv],
    };
    const bullets = selectAndRephraseProjectBullets({
      project,
      jobTerms: new Set(['express', 'backend']),
      maxBullets: 3,
    });
    // No accomplishment prose can be synthesized
    assert.strictEqual(bullets.length, 0);
  });

  // 2. import-only evidence cannot create accomplishment prose
  it('2. import-only evidence cannot create accomplishment prose', () => {
    const importEv = {
      id: 'e2',
      evidenceType: 'CODE_IMPORT_USAGE',
      moduleName: 'fastify',
      filePath: 'src/server.js',
    };
    assert.strictEqual(classifyEvidenceSemanticType(importEv), EVIDENCE_SEMANTIC_CLASS.PRESENCE_EVIDENCE);

    const project = {
      id: 'p2',
      name: 'API Service',
      technologies: ['Fastify'],
      bullets: [],
      evidence: [importEv],
    };
    const bullets = selectAndRephraseProjectBullets({
      project,
      jobTerms: new Set(['fastify', 'api']),
      maxBullets: 3,
    });
    assert.strictEqual(bullets.length, 0);
  });

  // 3. file-path evidence cannot create accomplishment prose
  it('3. file-path evidence cannot create accomplishment prose', () => {
    const fileEv = {
      id: 'e3',
      evidenceType: 'FILE_PATTERN_MATCH',
      filePath: 'src/controllers/auth.controller.js',
    };
    assert.strictEqual(classifyEvidenceSemanticType(fileEv), EVIDENCE_SEMANTIC_CLASS.PRESENCE_EVIDENCE);

    // Even if passed to claim safety, file paths must be rejected
    assert.strictEqual(isClaimSafeToRender('Developed authentication logic in src/controllers/auth.controller.js'), false);
    assert.strictEqual(isClaimSafeToRender('Built application using Dockerfile and config.json'), false);
  });

  // 4. technology-only evidence cannot create accomplishment prose
  it('4. technology-only evidence cannot create accomplishment prose', () => {
    const techEv = {
      id: 'e4',
      evidenceType: 'TECHNOLOGY_PRESENCE',
      technology: 'PostgreSQL',
    };
    assert.strictEqual(classifyEvidenceSemanticType(techEv), EVIDENCE_SEMANTIC_CLASS.PRESENCE_EVIDENCE);

    const project = {
      id: 'p4',
      name: 'Data Platform',
      technologies: ['PostgreSQL'],
      bullets: [],
      evidence: [techEv],
    };
    const bullets = selectAndRephraseProjectBullets({
      project,
      jobTerms: new Set(['postgresql', 'database']),
      maxBullets: 3,
    });
    assert.strictEqual(bullets.length, 0);
  });

  // 5. arbitrary unknown technologies do not trigger special logic
  it('5. arbitrary unknown technologies do not trigger special logic', () => {
    const novelTechs = ['HyperVectorDB', 'QuantumMesh', 'AeroProtocol', 'CustomEngineX'];
    for (const tech of novelTechs) {
      const normalized = normalizeTechnologyName(tech);
      // Preserves original casing and renders cleanly without mutation or crash
      assert.strictEqual(normalized, tech);
      assert.strictEqual(isNoisyTechnology(tech), false);
    }
    const stack = formatTechnologyStack(novelTechs);
    assert.deepStrictEqual(stack, novelTechs);
  });

  // 6. arbitrary project names do not trigger special logic
  it('6. arbitrary project names do not trigger special logic', () => {
    const arbitraryProjects = [
      'Project Alpha Zeta',
      'System-77-Core',
      'TelemetryCollectorV3',
      'Enterprise_Pipeline_Delta',
    ];
    for (const name of arbitraryProjects) {
      const cand = {
        displayName: 'Test Dev',
        email: 'test@example-candidate.com',
        headline: 'Developer',
        skills: [{ name: 'Go', provenanceStatus: 'VERIFIED' }],
        projects: [{ id: 'p-' + name, name, technologies: ['Go'], bullets: ['Authored core network transport handler.'] }],
        experience: [],
        education: [{ institution: 'Tech Inst', degree: 'B.S.' }],
      };
      const doc = buildStructuredResumeDocument({
        candidateProfile: cand,
        jobPosting: { title: 'Go Developer', company: 'Arbitrary Co' },
      });
      assert.strictEqual(doc.projects[0].name, name);
    }
  });

  // 7. arbitrary candidate names do not trigger special logic
  it('7. arbitrary candidate names do not trigger special logic', () => {
    const arbitraryNames = [
      'Jean-Luc Picard',
      'Aaliyah Al-Mansoor',
      'Łukasz Wiśniewski',
      'Mei-Ling Zhou',
    ];
    for (const name of arbitraryNames) {
      const cand = {
        displayName: name,
        email: 'person@candidate-domain.org',
        headline: 'Engineer',
        skills: [{ name: 'Python', provenanceStatus: 'VERIFIED' }],
        projects: [{ id: 'p1', name: 'Service', technologies: ['Python'], bullets: ['Built asynchronous task worker.'] }],
        experience: [],
        education: [{ institution: 'Global University', degree: 'B.S.' }],
      };
      const doc = buildStructuredResumeDocument({
        candidateProfile: cand,
        jobPosting: { title: 'Python Engineer', company: 'Target Co' },
      });
      assert.strictEqual(doc.candidateIdentity.displayName, name);
    }
  });

  // 8. arbitrary job roles do not trigger special logic
  it('8. arbitrary job roles do not trigger special logic', () => {
    const arbitraryRoles = [
      'Quantitative Systems Research Associate',
      'Bioinformatics Pipeline Software Specialist',
      'Subsurface Sensor Telemetry Engineer',
    ];
    for (const role of arbitraryRoles) {
      const cand = {
        displayName: 'Candidate Name',
        email: 'cand@test.com',
        headline: 'Software Engineer',
        skills: [{ name: 'C++', provenanceStatus: 'VERIFIED' }],
        projects: [{ id: 'p1', name: 'Sensor Core', technologies: ['C++'], bullets: ['Engineered high-frequency numerical analysis algorithms.'] }],
        experience: [],
        education: [{ institution: 'Research Polytech', degree: 'B.S.' }],
      };
      const doc = buildStructuredResumeDocument({
        candidateProfile: cand,
        jobPosting: { title: role, company: 'Science Corp' },
      });
      assert.strictEqual(doc.targetRole, role);
      assert.strictEqual(doc.candidateIdentity.headline, role);
    }
  });

  // 9. summary cannot introduce unsupported claims (metrics/scale/tenure)
  it('9. summary cannot introduce unsupported claims (metrics/scale/tenure)', () => {
    const cand = {
      displayName: 'Junior Dev',
      email: 'jr@domain.net',
      careerStatus: 'FRESHER',
      headline: 'Software Engineer',
      skills: [{ name: 'Python', provenanceStatus: 'VERIFIED' }],
      projects: [{ id: 'p1', name: 'Web Tool', technologies: ['Python'], bullets: ['Developed command line utility.'] }],
      experience: [],
      education: [{ institution: 'State College', degree: 'B.S.' }],
    };
    const summary = generateGroundedSummary({
      candidateProfile: cand,
      jobPosting: { title: 'Backend Developer', description: 'Python APIs' },
    });
    // Must not invent years of experience, user counts, latency percentages, or production scale
    assert.doesNotMatch(summary.text, /\b\d+\+?\s*years?\b/i);
    assert.doesNotMatch(summary.text, /\b\d+%\b/);
    assert.doesNotMatch(summary.text, /\b(?:millions|thousands)\s+of\s+users\b/i);
    assert.doesNotMatch(summary.text, /\b(?:expert|proven track record|enterprise scale)\b/i);
  });

  // 10. DSA cannot fall back to generic filler
  it('10. DSA cannot fall back to generic filler', () => {
    const genericFillerCases = [
      { bullets: ['Engaged in problem solving on online platforms daily.'] },
      { bullets: ['Built foundational analytical complexity and practiced coding problems.'] },
      { bullets: ['Practiced coding problems and solved questions online.'] },
      { bullets: ['Daily problem solving practice on LeetCode.'] },
      { bullets: [] },
      { hasSection: false },
    ];
    for (const dsa of genericFillerCases) {
      assert.strictEqual(isMeaningfulDsa(dsa), false);
    }

    const authenticDsa = {
      hasSection: true,
      profileUrl: 'https://leetcode.com/authentic-coder',
      problemsSolved: 350,
      bullets: ['Solved 350+ data structure and algorithmic challenges covering graphs and dynamic programming.'],
    };
    assert.strictEqual(isMeaningfulDsa(authenticDsa), true);
  });

  // 11. file paths cannot appear in final PDF bullets
  it('11. file paths cannot appear in final PDF bullets', () => {
    const pathsToReject = [
      'Refactored services/auth.service.ts to handle session validation.',
      'Updated components/Navbar.jsx with responsive styling.',
      'Configured Dockerfile and app.py for container orchestration.',
      'Modified routes/api.js to add rate limiting headers.',
    ];
    for (const text of pathsToReject) {
      assert.strictEqual(isClaimSafeToRender(text), false);
    }
  });

  // 12. source/evidence metadata cannot leak into final prose
  it('12. source/evidence metadata cannot leak into final prose', () => {
    const metadataPhrases = [
      'Developed API functionality in src/server.js, verified by repository evidence.',
      'Engineered backend system with tested reliability and maintainable code',
      'Implemented feature across package.json and controllers/api.go',
      'Defined in repository vishu1803/Product-Data-Explorer',
    ];
    for (const text of metadataPhrases) {
      assert.strictEqual(isClaimSafeToRender(text), false);
    }
  });

  // 13. final PDF traceability catches dropped skills/summary/DSA/coursework/etc.
  it('13. final PDF traceability catches dropped skills/summary/DSA/coursework/etc.', async () => {
    const validator = new PdfQaValidatorService();

    // Create mock PDF buffer with basic text
    const sampleTex = `\\documentclass{article}\\begin{document}John Smith\\\\john@test.com\\\\Full-Stack Developer\\end{document}`;
    const compiler = new LatexCompilerService();
    const pdf = await compiler.compileLatexToPdf({ texContent: sampleTex, jobName: 'traceability-test' });

    // Expecting missing skill and missing project
    const expectedContent = {
      candidateName: 'John Smith',
      skillsTokens: ['SurrealDB', 'QuantumVector'],
      projectNames: ['Missing Autonomous Drone Platform'],
      links: [],
    };

    const qaResult = await validator.validatePdf({
      pdfBuffer: pdf.pdfBuffer,
      expectedCandidate: { name: 'John Smith', email: 'john@test.com' },
      expectedContent,
    });

    assert.strictEqual(qaResult.passed, false);
    assert.ok(qaResult.traceability?.missing?.length >= 2);
    const missingKinds = qaResult.traceability.missing.map(m => m.kind);
    assert.ok(missingKinds.includes('skill'));
    assert.ok(missingKinds.includes('project name'));
  });

  // 14. final receipt corresponds exactly to final structured snapshot
  it('14. final receipt corresponds exactly to final structured snapshot', () => {
    const cand = {
      displayName: 'Jordan Dev',
      email: 'jordan@dev.net',
      skills: [{ name: 'Rust', provenanceStatus: 'VERIFIED' }],
      projects: [{ id: 'p1', name: 'Telemetry', technologies: ['Rust'], bullets: ['Authored lock-free circular ring buffer in Rust.'] }],
      dsa: { hasSection: true, bullets: ['Engaged in problem solving.'] }, // Weak DSA: should be remediated
      experience: [],
      education: [{ institution: 'Polytechnic', degree: 'B.S.' }],
    };

    const snapshot = buildStructuredResumeSnapshot({
      candidateProfile: cand,
      jobPosting: { title: 'Rust Engineer' },
    });

    // Remediated weak DSA
    assert.strictEqual(snapshot.structuredResume.dsa?.hasSection, false);
    // Receipt validates the final post-remediation snapshot
    assert.strictEqual(snapshot.evidenceValidationReceipt.overallStatus, 'PASS');
    assert.strictEqual(snapshot.contentQualityGate.passed, true);
  });

  // 15. candidate-authored content remains intact
  it('15. candidate-authored content remains intact', () => {
    const authoredBullet = 'Architected low-latency distributed order matching engine handling 50k transactions/sec with zero packet loss.';
    const cand = {
      displayName: 'Senior Lead',
      email: 'lead@fintech.co',
      skills: [{ name: 'C++', provenanceStatus: 'VERIFIED' }],
      projects: [
        {
          id: 'p1',
          name: 'Trading Core',
          technologies: ['C++'],
          bullets: [authoredBullet],
        },
      ],
      experience: [],
      education: [{ institution: 'Tech Inst', degree: 'B.S.' }],
    };

    const doc = buildStructuredResumeDocument({
      candidateProfile: cand,
      jobPosting: { title: 'C++ Systems Engineer' },
    });

    const bulletText = typeof doc.projects[0].bullets[0] === 'string'
      ? doc.projects[0].bullets[0]
      : doc.projects[0].bullets[0]?.text;
    assert.strictEqual(bulletText, authoredBullet);
  });

  // 16. contrasting job requirements cause genuine project switching
  it('16. contrasting job requirements cause genuine project switching (Job A selects Project X, Job B selects Project Y)', async () => {
    const { ProjectRelevanceService } = await import('../../src/services/project-relevance.service.js');

    const projAlphaId = '33333333-3333-4333-8333-333333333301';
    const projBetaId = '33333333-3333-4333-8333-333333333302';
    const tenantId = '44444444-4444-4444-8444-444444444444';

    const cand = {
      displayName: 'Multi-Skilled Engineer',
      email: 'dev@test.org',
      skills: [
        { name: 'Python', provenanceStatus: 'VERIFIED' },
        { name: 'FastAPI', provenanceStatus: 'VERIFIED' },
        { name: 'TypeScript', provenanceStatus: 'VERIFIED' },
        { name: 'Express', provenanceStatus: 'VERIFIED' },
      ],
      projects: [
        {
          id: projAlphaId,
          projectId: projAlphaId,
          name: 'Python Asynchronous API Engine',
          technologies: ['Python', 'FastAPI', 'PostgreSQL'],
          bullets: [
            'Engineered high-throughput asynchronous REST APIs using FastAPI and PostgreSQL.',
            'Optimized relational database queries reducing latency across services.',
          ],
          evidenceCount: 15,
          provenanceStatus: 'CORROBORATED',
          evidence: [
            { id: '11111111-1111-4111-8111-111111111111', evidenceType: 'CODE_USAGE', skillSlug: 'python', confidenceScore: 0.95, sourceLocation: { filePath: 'app/main.py' } },
            { id: '11111111-1111-4111-8111-111111111112', evidenceType: 'CODE_USAGE', skillSlug: 'fastapi', confidenceScore: 0.95, sourceLocation: { filePath: 'app/api.py' } },
          ],
        },
        {
          id: projBetaId,
          projectId: projBetaId,
          name: 'TypeScript Collaborative Workspace',
          technologies: ['TypeScript', 'Express', 'Prisma'],
          bullets: [
            'Developed real-time collaboration backend using Express, TypeScript, and Prisma ORM.',
            'Architected distributed event messaging layer for simultaneous active users.',
          ],
          evidenceCount: 15,
          provenanceStatus: 'CORROBORATED',
          evidence: [
            { id: '22222222-2222-4222-8222-222222222211', evidenceType: 'CODE_USAGE', skillSlug: 'typescript', confidenceScore: 0.95, sourceLocation: { filePath: 'src/index.ts' } },
            { id: '22222222-2222-4222-8222-222222222212', evidenceType: 'CODE_USAGE', skillSlug: 'express', confidenceScore: 0.95, sourceLocation: { filePath: 'src/server.ts' } },
          ],
        },
      ],
      experience: [],
      education: [{ institution: 'Tech Inst', degree: 'B.S.' }],
    };

    const pythonJob = {
      id: '55555555-5555-4555-8555-555555555501',
      tenantId,
      title: 'Python Backend Engineer',
      company: 'Python Corp',
      description: 'Building async APIs with Python and FastAPI.',
      requirements: [
        { id: '66666666-6666-4666-8666-666666666601', category: 'SKILL', skillSlug: 'python', importance: 'REQUIRED', weight: 1.0 },
        { id: '66666666-6666-4666-8666-666666666602', category: 'SKILL', skillSlug: 'fastapi', importance: 'REQUIRED', weight: 1.0 },
      ],
      skills: ['python', 'fastapi'],
    };

    const tsJob = {
      id: '55555555-5555-4555-8555-555555555502',
      tenantId,
      title: 'TypeScript Full Stack Engineer',
      company: 'TS Systems',
      description: 'Building web services with TypeScript and Express.',
      requirements: [
        { id: '77777777-7777-4777-8777-777777777701', category: 'SKILL', skillSlug: 'typescript', importance: 'REQUIRED', weight: 1.0 },
        { id: '77777777-7777-4777-8777-777777777702', category: 'SKILL', skillSlug: 'express', importance: 'REQUIRED', weight: 1.0 },
      ],
      skills: ['typescript', 'express'],
    };

    const analysisPy = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId },
      pythonJob,
      cand.projects
    );

    const analysisTs = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId },
      tsJob,
      cand.projects
    );

    const docPy = buildStructuredResumeDocument({
      candidateProfile: cand,
      jobPosting: { ...pythonJob, projectRankings: analysisPy.projectRankings },
    });

    const docTs = buildStructuredResumeDocument({
      candidateProfile: cand,
      jobPosting: { ...tsJob, projectRankings: analysisTs.projectRankings },
    });

    assert.strictEqual(docPy.projects[0].projectId, projAlphaId);
    assert.strictEqual(docTs.projects[0].projectId, projBetaId);
    assert.notStrictEqual(docPy.projects[0].projectId, docTs.projects[0].projectId);
    assert.strictEqual(docPy.projects[0].displayName || docPy.projects[0].name, 'Python Asynchronous API Engine');
    assert.strictEqual(docTs.projects[0].displayName || docTs.projects[0].name, 'TypeScript Collaborative Workspace');
  });

});
