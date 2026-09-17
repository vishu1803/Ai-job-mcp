/**
 * @file P81 ATS Parseability Engine & PDF Artifact Round-Trip Tests
 *
 * Verifies:
 *  - Invariant 25: Parseability analysis consumes the final PDF artifact / extracted text
 *    and does not own PDF generation.
 *  - Invariant 30: Every score includes confidence where uncertainty exists.
 *  - Structural checks: Reading order, standard headings, contact completeness,
 *    LaTeX leakage, Unicode replacement glyphs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AtsParseabilityService,
  evaluateResumePdfRoundTrip,
} from '../../src/services/resume-ats-parseability.service.js';

describe('P81: ATS Parseability Engine (Rule 25 & Rule 30)', () => {
  const service = new AtsParseabilityService();

  const cleanSampleText = `
Jane Doe
jane.doe@example.com | +1 (555) 123-4567 | San Francisco, CA

Professional Summary
Senior Software Engineer with 6+ years designing high-throughput distributed architectures,
optimizing database query performance, and leading mission-critical cloud migrations.

Technical Skills
Languages: TypeScript, JavaScript, Go, Python, SQL
Frameworks & Tools: Node.js, Express, React, PostgreSQL, Redis, Docker, Kubernetes

Professional Experience
Senior Backend Engineer at CloudScale Systems | 2021 - Present
• Architected event-driven microservices processing 45,000 requests/sec via Kafka and Go.
• Optimized PostgreSQL query execution plans, reducing p99 latency by 32% across APIs.
• Spearheaded containerization and CI/CD pipelines deploying to Kubernetes clusters.

Technical Projects
Distributed Cache Engine
• Implemented high-performance in-memory cache utilizing Raft consensus in Go.
• Reduced cache misses by 28% through an adaptive LRU-K cache eviction policy.

Education
B.S. in Computer Science | University of California, Berkeley | 2017 - 2021
`;

  it('Rule 25: consumes PDF/text artifact and does not generate PDF; throws if no artifact supplied', () => {
    assert.throws(
      () => evaluateResumePdfRoundTrip({}),
      /evaluateResumePdfRoundTrip requires a compiled PDF artifact/
    );
  });

  it('Rule 30: provides confidence level based on input type (text vs PDF)', () => {
    const textReport = service.evaluateAtsParseability({ extractedText: cleanSampleText });
    assert.equal(textReport.passed, true);
    assert.ok(textReport.atsParseabilityScore >= 85);
    assert.equal(textReport.confidence, 0.85);

    // Mock PDF buffer
    const mockPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    const pdfReport = service.evaluateAtsParseability({
      pdfBuffer: mockPdfBuffer,
      extractedText: cleanSampleText,
    });
    assert.equal(pdfReport.confidence, 0.95);
  });

  it('validates single-column reading order and detects multi-column / tabular environments', () => {
    const multiColTex = `
\\documentclass{article}
\\begin{document}
\\begin{multicols}{2}
Left Column Content
\\columnbreak
Right Column Content
\\end{multicols}
\\end{document}
`;
    const report = service.evaluateAtsParseability({
      extractedText: cleanSampleText,
      texContent: multiColTex,
    });

    const readingOrderCheck = report.checks.find((c) => c.checkId === 'READING_ORDER');
    assert.ok(readingOrderCheck);
    assert.equal(readingOrderCheck.passed, false);
    assert.ok(report.findings.some((f) => f.dimension === 'readingOrder'));
  });

  it('detects missing contact details (email and name) and lowers contact completeness score', () => {
    const textWithoutContact = `
Professional Summary
Experienced systems engineer with expertise in distributed microservices.

Technical Skills
Node.js, PostgreSQL, Redis, Docker

Professional Experience
Software Engineer at Acme Corp
• Built backend REST APIs using Node.js and Express.
• Handled database queries with PostgreSQL.

Education
B.S. in Software Engineering
`;
    const report = service.evaluateAtsParseability({ extractedText: textWithoutContact });

    const contactCheck = report.checks.find((c) => c.checkId === 'CONTACT_COMPLETENESS');
    assert.ok(contactCheck);
    assert.equal(contactCheck.passed, false);
    assert.ok(report.findings.some((f) => f.dimension === 'contact'));
  });

  it('detects raw LaTeX commands leaking into plain text streams', () => {
    const leakedText = `
Jane Doe
jane.doe@example.com

Professional Summary
Senior Software Engineer.

Technical Skills
\\textbf{Languages}: TypeScript, Python
\\begin{itemize}
\\item Node.js, Express, Docker
\\end{itemize}

Education
B.S. in Computer Science
`;
    const report = service.evaluateAtsParseability({ extractedText: leakedText });

    const latexCheck = report.checks.find((c) => c.checkId === 'LATEX_LEAKAGE');
    assert.ok(latexCheck);
    assert.equal(latexCheck.passed, false);
    assert.equal(report.passed, false); // LaTeX leaks force passed = false
  });

  it('detects Unicode replacement glyphs (tofu/mojibake) and fails parseability', () => {
    const corruptedText = cleanSampleText.replace('Kafka and Go', 'Kafka and Go \uFFFD bad char');
    const report = service.evaluateAtsParseability({ extractedText: corruptedText });

    const glyphCheck = report.checks.find((c) => c.checkId === 'REPLACEMENT_GLYPHS');
    assert.ok(glyphCheck);
    assert.equal(glyphCheck.passed, false);
    assert.equal(report.passed, false);
  });

  it('Rule 25: fails contact completeness if email missing from PDF text even when structuredResume has it', () => {
    const textMissingEmail = `
Jane Doe
+1 (555) 123-4567 | San Francisco, CA

Professional Summary
Senior Software Engineer.

Technical Skills
TypeScript, Go, PostgreSQL

Professional Experience
• Engineered backend services.
• Optimized queries.
• Deployed containers.

Education
B.S. in Computer Science
`;
    const mockStructuredResume = {
      candidateIdentity: {
        displayName: 'Jane Doe',
        email: 'jane.doe@example.com',
      },
    };

    const report = service.evaluateAtsParseability({
      extractedText: textMissingEmail,
      structuredResume: mockStructuredResume,
    });

    const contactCheck = report.checks.find((c) => c.checkId === 'CONTACT_COMPLETENESS');
    assert.ok(contactCheck);
    assert.equal(contactCheck.passed, false);
    const unrenderedFinding = report.findings.find((f) => f.finding === 'EMAIL_NOT_RENDERED');
    assert.ok(unrenderedFinding);
    assert.equal(unrenderedFinding.expected, 'jane.doe@example.com');
  });

  it('Rule 25: fails bullet check if PDF lacks bullet markers even when structuredResume has bullets', () => {
    const textLackingBulletMarkers = `
Jane Doe
jane.doe@example.com | San Francisco, CA

Professional Summary
Senior Software Engineer.

Technical Skills
TypeScript, Go, PostgreSQL

Professional Experience
Engineered backend services without any bullet marker character.
Optimized queries without bullet markers.

Education
B.S. in Computer Science
`;
    const mockStructuredResume = {
      projects: [
        {
          name: 'Project 1',
          bullets: [{ text: 'Bullet 1' }, { text: 'Bullet 2' }, { text: 'Bullet 3' }],
        },
      ],
    };

    const report = service.evaluateAtsParseability({
      extractedText: textLackingBulletMarkers,
      structuredResume: mockStructuredResume,
    });

    const bulletCheck = report.checks.find((c) => c.checkId === 'BULLET_BOUNDARIES');
    assert.ok(bulletCheck);
    assert.equal(bulletCheck.passed, false);
    const unrenderedBullets = report.findings.find((f) => f.finding === 'BULLETS_NOT_RENDERED');
    assert.ok(unrenderedBullets);
  });
});
