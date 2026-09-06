/**
 * @file Unit Tests: ATS LaTeX Document Generator Service
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LatexDocumentGenerator,
  escapeLatex,
} from '../../src/services/latex-document-generator.service.js';
import { ValidationError } from '../../src/errors/index.js';

describe('LatexDocumentGenerator Service', () => {
  const generator = new LatexDocumentGenerator();

  const mockApplicationPackage = {
    candidateId: '00000000-0000-0000-0000-000000000001',
    candidateName: 'Vishwanath Nishad',
    candidateEmail: 'vishwanatnishad@gmail.com',
    candidatePhone: '+1-555-0199',
    targetJob: {
      id: 'job-vercel-001',
      title: 'Staff Software Engineer - Infrastructure',
      company: 'Vercel',
      location: 'Remote, US',
      applicationUrl: 'https://boards.greenhouse.io/vercel/jobs/5450849004',
      retrievedAt: '2026-09-05T00:00:00Z',
    },
    tailoredResume: {
      title: 'Vishwanath Nishad - Tailored for Vercel',
      markdownContent:
        '# Vishwanath Nishad\n\n**Email:** vishwanatnishad@gmail.com\n\n### Professional Summary\nSpecialist in distributed systems and cloud infrastructure.',
      contentHash: 'a1b2c3d4e5f6',
      fitScore: 92,
    },
    coverLetter: {
      title: 'Cover Letter - Vercel',
      markdownContent:
        'Dear Hiring Team at Vercel,\n\nI am thrilled to apply for the Staff Software Engineer - Infrastructure position.\n\nSincerely,\nVishwanath Nishad',
      contentHash: 'f6e5d4c3b2a1',
    },
    verifiedSkills: [
      { name: 'Node.js', truthCategory: 'VERIFIED' },
      { name: 'PostgreSQL', truthCategory: 'VERIFIED' },
      { name: 'Fastify', truthCategory: 'CORROBORATED' },
    ],
    claimedSkills: [
      { name: 'TypeScript', truthCategory: 'CLAIMED' },
      { name: 'Redis', truthCategory: 'USER_PROVIDED' },
      { name: 'Rust', truthCategory: 'LEARNING' },
    ],
    portfolioLinks: [
      {
        projectName: 'Ai-career-agent',
        repositoryUrl: 'https://github.com/vishu1803/Ai-job-mcp',
        highlights: ['Model Context Protocol server', 'AES-256-GCM encrypted persistence'],
      },
    ],
    packageHash: '3f8e91a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e',
    preparedAt: '2026-09-05T00:00:00Z',
  };

  const mockCandidateProfile = {
    displayName: 'Vishwanath Nishad',
    primaryEmail: 'vishwanatnishad@gmail.com',
    candidatePhone: '+1-555-0199',
    location: 'San Francisco, CA',
    experience: [
      {
        title: 'Senior Backend Engineer',
        company: 'Cloud Scale Inc',
        location: 'Remote',
        startDate: '2022',
        endDate: 'Present',
        isCurrent: true,
        bullets: [
          'Architected high-throughput API endpoints with sub-10ms latency.',
          'Reduced cloud infrastructure spend by 30% through connection pooling.',
        ],
      },
    ],
    education: [
      {
        degree: 'Bachelor of Technology',
        field: 'Computer Science',
        institution: 'University of Technology',
        startDate: '2018',
        endDate: '2022',
      },
    ],
  };

  it('1. escapes reserved LaTeX characters properly', () => {
    assert.equal(
      escapeLatex('100% test & check $5 #1 _init_ {braces}'),
      '100\\% test \\& check \\$5 \\#1 \\_init\\_ \\{braces\\}'
    );
    assert.equal(escapeLatex('path\\to\\file'), 'path\\textbackslash{}to\\textbackslash{}file');
    assert.equal(
      escapeLatex('~tilde and ^hat'),
      '\\textasciitilde{}tilde and \\textasciicircum{}hat'
    );
    assert.equal(escapeLatex(null), '');
    assert.equal(escapeLatex(undefined), '');
  });

  it('2. generates ATS resume LaTeX with authentic candidate identity', () => {
    const result = generator.generateTailoredResumeLatex({
      applicationPackage: mockApplicationPackage,
      candidateProfile: mockCandidateProfile,
    });

    assert.ok(result.texContent.includes('\\documentclass'));
    assert.ok(result.texContent.includes('Vishwanath Nishad'));
    assert.ok(result.texContent.includes('vishwanatnishad@gmail.com'));
    assert.ok(result.texContent.includes('+1-555-0199'));
    assert.ok(result.texContent.includes('Vercel'));
    assert.ok(result.texContent.includes('Staff Software Engineer - Infrastructure'));
    assert.equal(result.candidateEmail, 'vishwanatnishad@gmail.com');
  });

  it('3. strictly rejects synthetic email vishw@example.com', () => {
    const fakePkg = {
      ...mockApplicationPackage,
      candidateEmail: 'vishw@example.com',
    };

    assert.throws(
      () => generator.generateTailoredResumeLatex({ applicationPackage: fakePkg }),
      (err) => err instanceof ValidationError && err.message.includes('synthetic email')
    );
  });

  it('4. preserves truthful skill provenance (verified vs claimed vs learning)', () => {
    const result = generator.generateTailoredResumeLatex({
      applicationPackage: mockApplicationPackage,
      candidateProfile: mockCandidateProfile,
    });

    assert.ok(result.texContent.includes('Verified Capabilities'));
    assert.ok(result.texContent.includes('Node.js, PostgreSQL, Fastify'));
    assert.ok(result.texContent.includes('Technical Proficiency'));
    assert.ok(result.texContent.includes('TypeScript, Redis'));
    assert.ok(result.texContent.includes('Active Learning'));
    assert.ok(result.texContent.includes('Rust'));
  });

  it('5. generates formal cover letter LaTeX', () => {
    const result = generator.generateTailoredCoverLetterLatex({
      applicationPackage: mockApplicationPackage,
      candidateProfile: mockCandidateProfile,
    });

    assert.ok(result.texContent.includes('Vishwanath Nishad'));
    assert.ok(result.texContent.includes('vishwanatnishad@gmail.com'));
    assert.ok(result.texContent.includes('Vercel'));
    assert.ok(result.texContent.includes('Staff Software Engineer - Infrastructure'));
    assert.ok(result.texContent.includes('Subject: Application for'));
    assert.ok(result.texContent.includes('Sincerely'));
  });

  it('6. generates identical LaTeX for identical package inputs', () => {
    const params = {
      applicationPackage: mockApplicationPackage,
      candidateProfile: mockCandidateProfile,
    };

    const first = generator.generateTailoredCoverLetterLatex(params);
    const second = generator.generateTailoredCoverLetterLatex(params);

    assert.equal(first.texContent, second.texContent);
  });
});
