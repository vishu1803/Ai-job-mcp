/**
 * @file Unit Tests: Measurable PDF QA Validator & Resume Quality Audit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PdfQaValidatorService } from '../../src/services/pdf-qa-validator.service.js';
import { ResumePdfObserver } from '../../src/services/resume-pdf-observer.service.js';
import { ResumeParserService } from '../../src/services/resume-parser.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { extractedTextContainsEmail } from '../../src/utils/pdf-text-normalization.js';

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
      markdownContent: `
## Summary

Backend and infrastructure engineer experienced in building reliable cloud services,
APIs, and data systems.

## Experience

### Infrastructure Engineer — Example Systems

- Built Node.js services backed by PostgreSQL for internal production workflows.
- Designed API integrations and automated test suites that improved release confidence.
- Improved service reliability through monitoring, failure handling, and operational runbooks.

## Projects

### Cloud Job Processing Platform

- Developed a TypeScript service for processing asynchronous job workflows.
- Added PostgreSQL persistence, retry handling, and structured error reporting.
- Reduced manual processing by automating validation and delivery steps.

## Skills

Node.js, TypeScript, PostgreSQL, REST APIs, automated testing, cloud infrastructure.
`,
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

    // Generator-level regression: the authoritative candidate email must be
    // rendered verbatim from applicationPackage.candidateEmail. This guards the
    // source contract independently of any PDF extraction behavior.
    assert.ok(
      texContent.includes('vishwanatnishad@gmail.com'),
      'Generated LaTeX must contain the literal canonical candidate email'
    );

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

    assert.equal(
      report.passed,
      true,
      [
        `score=${report.score}`,
        `qualityLevel=${report.qualityLevel}`,
        `criticalFailures=${JSON.stringify(report.criticalFailures)}`,
        `breakdown=${JSON.stringify(report.breakdown)}`,
      ].join('\n')
    );
    assert.ok(report.score >= 75);
    assert.ok(['EXCELLENT', 'GOOD'].includes(report.qualityLevel));
    assert.ok(report.breakdown.parsingCompatibility > 0);
    assert.ok(report.breakdown.contentIntegrity > 0);
    assert.ok(report.breakdown.readability > 0);
    assert.equal(report.criticalFailures.length, 0);

    // Artifact-level regression: the compiled PDF must actually contain the
    // canonical email once extracted. Matching tolerates only extraction-injected
    // whitespace inside the address; the complete address sequence is required,
    // so unrelated or corrupt text can never satisfy this assertion.
    assert.ok(
      extractedTextContainsEmail(report.extractedText, 'vishwanatnishad@gmail.com'),
      `Compiled PDF must contain the canonical email. Extracted text: ${report.extractedText}`
    );
  });

  it('1b. compiled PDF artifact + independent observer both expose the canonical email', async () => {
    const { texContent } = generator.generateTailoredResumeLatex({
      applicationPackage: mockPkg,
    });
    const { pdfBuffer } = await compiler.compileLatexToPdf({
      texContent,
      jobName: 'observer-email-test',
    });

    // Independent extraction path (parser service) must observe the email.
    const extracted = new ResumeParserService().extractRawText({
      buffer: pdfBuffer,
      format: 'PDF',
    });
    assert.ok(
      extractedTextContainsEmail(extracted, 'vishwanatnishad@gmail.com'),
      `Raw PDF extraction must contain the canonical email. Extracted: ${extracted}`
    );

    // Observer contact detection must not be defeated by extractor whitespace.
    const observed = new ResumePdfObserver().observe(pdfBuffer, { targetPageCount: 1 });
    assert.equal(observed.contactInfo.hasEmail, true);
    assert.equal(
      String(observed.contactInfo.email).toLowerCase(),
      'vishwanatnishad@gmail.com',
      `Observer must report the canonical email, got: ${observed.contactInfo.email}`
    );
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
