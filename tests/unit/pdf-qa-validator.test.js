/**
 * @file Unit Tests: Measurable PDF QA Validator & Resume Quality Audit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PdfQaValidatorService } from '../../src/services/pdf-qa-validator.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';

describe('PdfQaValidatorService', () => {
  const qaValidator = new PdfQaValidatorService();
  const compiler = new LatexCompilerService();
  const generator = new LatexDocumentGenerator();

  const mockPkg = {
    candidateName: 'Vishwanath Nishad',
    candidateEmail: 'vishwanatnishad@gmail.com',
    candidatePhone: '+1-555-0199',
    targetJob: {
      title: 'Infrastructure Engineer',
      company: 'Vercel',
      applicationUrl: 'https://boards.greenhouse.io',
      retrievedAt: '2026-09-05T00:00:00Z',
    },
    tailoredResume: {
      title: 'Resume',
      markdownContent: 'Experienced backend engineer with proven cloud systems expertise.',
      contentHash: 'hash1',
      fitScore: 88,
    },
    coverLetter: {
      title: 'Cover Letter',
      markdownContent: 'Dear Hiring Team at Vercel, I am eager to contribute to your team.',
      contentHash: 'hash2',
    },
    verifiedSkills: [
      { name: 'Node.js', truthCategory: 'VERIFIED' },
      { name: 'PostgreSQL', truthCategory: 'VERIFIED' },
    ],
    claimedSkills: [{ name: 'TypeScript', truthCategory: 'CLAIMED' }],
    portfolioLinks: [],
    packageHash: 'mock-package-hash-321',
    preparedAt: '2026-09-05T00:00:00Z',
  };

  it('1. validates and passes a clean, authentic compiled resume PDF', async () => {
    const { texContent } = generator.generateTailoredResumeLatex({
      applicationPackage: mockPkg,
    });

    const { pdfBuffer } = await compiler.compileLatexToPdf({
      texContent,
      jobName: 'clean-qa-test',
    });

    const report = await qaValidator.validatePdf({
      pdfBuffer,
      expectedCandidate: {
        name: 'Vishwanath Nishad',
        email: 'vishwanatnishad@gmail.com',
      },
      targetJob: { company: 'Vercel' },
      verifiedSkills: ['Node.js', 'PostgreSQL'],
      documentType: 'RESUME',
    });

    assert.equal(report.passed, true);
    assert.ok(report.score >= 75);
    assert.ok(['EXCELLENT', 'GOOD'].includes(report.qualityLevel));
    assert.ok(report.breakdown.parsingCompatibility > 0);
    assert.ok(report.breakdown.contentIntegrity > 0);
    assert.ok(report.breakdown.readability > 0);
    assert.equal(report.criticalFailures.length, 0);
  });

  it('2. fails validation if candidate authentic email is missing from PDF', async () => {
    const sampleTex = `\\documentclass{article}
\\begin{document}
\\section*{Resume}
Candidate Name Without Email
\\end{document}`;

    const { pdfBuffer } = await compiler.compileLatexToPdf({
      texContent: sampleTex,
      jobName: 'no-email-test',
    });

    const report = await qaValidator.validatePdf({
      pdfBuffer,
      expectedCandidate: {
        name: 'Candidate',
        email: 'vishwanatnishad@gmail.com',
      },
      documentType: 'RESUME',
    });

    assert.equal(report.passed, false);
    assert.ok(report.criticalFailures.some((f) => f.includes('Authoritative email')));
  });

  it('3. rejects corrupted or invalid PDF buffer', async () => {
    const invalidBuffer = Buffer.from('NOT A VALID PDF BUFFER');

    const report = await qaValidator.validatePdf({
      pdfBuffer: invalidBuffer,
      expectedCandidate: { name: 'Vishwanath', email: 'test@example.com' },
    });

    assert.equal(report.passed, false);
    assert.equal(report.score, 0);
    assert.equal(report.qualityLevel, 'FAILED');
  });

  it('4. hard-fails documents containing historical generic placeholder prose', async () => {
    const placeholderTex = `\\documentclass{article}
\\begin{document}
\\section*{Resume}
Vishwanath Nishad \\hfill vishwanatnishad@gmail.com
\\vspace{2pt}
Dedicated software engineer with verified technical skills tailored for Vercel.
\\vspace{6pt}
\\section*{Experience}
Built backend services with PostgreSQL and Node.js for internal tooling.
Delivered API integrations and wrote automated test suites for quality assurance.
\\section*{Skills}
Node.js, PostgreSQL, REST APIs, TypeScript, automated testing.
\\end{document}`;

    const { pdfBuffer } = await compiler.compileLatexToPdf({
      texContent: placeholderTex,
      jobName: 'placeholder-prose-test',
    });

    const report = await qaValidator.validatePdf({
      pdfBuffer,
      expectedCandidate: {
        name: 'Vishwanath Nishad',
        email: 'vishwanatnishad@gmail.com',
      },
      targetJob: { company: 'Vercel' },
      documentType: 'RESUME',
    });

    assert.equal(report.passed, false);
    assert.ok(report.criticalFailures.some((f) => f.includes('Generic placeholder prose')));
  });
});
