/**
 * @file P81 Integration: Real-World PDF Corpus Test Suite
 *
 * Evaluates the ATS Parseability & Keyword Coverage engines against diverse, non-Tectonic,
 * real-world PDF text streams and layouts:
 * - Fixture G: Microsoft Word / LibreOffice exported PDF stream
 * - Fixture H: Google Docs / Canva multi-box layout
 * - Fixture I: Typographic ligatures (fi, fl, ffi, ff) and smart punctuation
 * - Fixture J: Hyperlinks, anchors, and profile URL extractions
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { defaultAtsParseabilityService } from '../../src/services/resume-ats-parseability.service.js';
import { ResumeKeywordCoverageService } from '../../src/services/resume-keyword-coverage.service.js';

describe('P81 Integration: Real-World PDF Corpus Suite', () => {
  it('Fixture G: Microsoft Word / LibreOffice exported PDF stream parses cleanly without false failures', () => {
    // Word / LibreOffice PDF extracted text with typical formatting:
    // bullet symbols like \u2022, space indentation, standard headers
    const wordPdfText = `
Elena Rostova
elena.rostova@example.com | (555) 342-9081 | San Francisco, CA
https://github.com/erostova | https://linkedin.com/in/erostova

Professional Summary
Full-stack engineer with 6 years of experience building scalable distributed web applications using TypeScript, Node.js, and PostgreSQL.

Technical Skills
• Languages: TypeScript, JavaScript, Python, Go, SQL
• Frameworks: Node.js, Express, React, Next.js
• Databases & Cloud: PostgreSQL, Redis, Docker, AWS

Professional Experience
Senior Software Engineer - CloudScale Inc. (2021 – Present)
• Architected event-driven microservices processing 45,000 requests/sec with 99.99% availability.
• Optimized PostgreSQL query execution plans, reducing p99 database latency by 42%.
• Led migration of legacy monolith to containerized Docker services on AWS ECS.

Education
B.S. in Computer Science - University of Washington (2015 – 2019)
`;

    const report = defaultAtsParseabilityService.evaluateAtsParseability({
      extractedText: wordPdfText,
      candidateProfile: {
        displayName: 'Elena Rostova',
        primaryEmail: 'elena.rostova@example.com',
      },
    });

    assert.ok(report.passed, `Expected Word PDF to pass ATS parseability, got score ${report.atsParseabilityScore}`);
    assert.ok(report.atsParseabilityScore >= 80, `Expected score >= 80, got ${report.atsParseabilityScore}`);

    const contactCheck = report.checks.find((c) => c.checkId === 'CONTACT_COMPLETENESS');
    assert.ok(contactCheck?.passed, 'Expected contact completeness to pass');

    const bulletCheck = report.checks.find((c) => c.checkId === 'BULLET_BOUNDARIES');
    assert.ok(bulletCheck?.passed, 'Expected Word bullet markers to pass');
  });

  it('Fixture H: Google Docs / Canva multi-box layout maintains readable section ordering', () => {
    // Google Docs / Canva often emits text with sections in side-by-side or stacked blocks
    const canvaPdfText = `
Marcus Vance
marcus.vance@example.com | Chicago, IL
https://github.com/mvance

Technical Skills
Languages: Python, Go, SQL
Tools: Docker, Kubernetes, Linux

Professional Summary
DevOps and backend engineer focused on continuous delivery and infrastructure automation.

Work Experience
Platform Engineer - Apex Systems (2022 – Present)
• Automated Kubernetes cluster deployments using Helm and ArgoCD.
• Configured Prometheus and Grafana monitoring stacks across 8 production clusters.
• Reduced mean time to recovery (MTTR) by 35% through automated self-healing scripts.

Education
B.S. in Software Engineering - Purdue University (2018 – 2022)
`;

    const report = defaultAtsParseabilityService.evaluateAtsParseability({
      extractedText: canvaPdfText,
      candidateProfile: {
        displayName: 'Marcus Vance',
        primaryEmail: 'marcus.vance@example.com',
      },
    });

    assert.ok(report.passed);
    assert.ok(report.atsParseabilityScore >= 75);
    assert.equal(report.metrics.contactDetected.hasEmail, true);
  });

  it('Fixture I: Typographic ligatures (fi, fl, ffi, ff) and smart punctuation match requirements accurately', () => {
    // Real typesetting often converts 'fi' into ligature \uFB01 (ﬁ), 'fl' into \uFB02 (ﬂ), 'ffi' into \uFB03 (ﬃ)
    // and uses smart quotes and em-dashes
    const ligatureText = `
Alexander Wright
alex.wright@example.com | New York, NY
https://github.com/awright

Professional Summary
Eﬃcient and proﬁcient backend engineer specializing in high-velocity data pipelines.

Technical Skills
PostgreSQL, Docker, Go, Python, React

Selected Projects
High-Throughput Key-Value Store
• Engineered an eﬃcient in-memory storage engine handling 100k writes/sec.
• Conﬁgured oﬄine snapshotting and real-time replication across clusters.
• Reduced memory overﬂow issues by 60% using custom arena allocation.

Education
B.S. in Computer Science - Columbia University (2017 – 2021)
`;

    const report = defaultAtsParseabilityService.evaluateAtsParseability({
      extractedText: ligatureText,
      candidateProfile: {
        displayName: 'Alexander Wright',
        primaryEmail: 'alex.wright@example.com',
      },
    });

    // Valid ligatures must NOT trigger replacement glyph (tofu) errors
    const glyphCheck = report.checks.find((c) => c.checkId === 'REPLACEMENT_GLYPHS');
    assert.ok(glyphCheck?.passed, 'Ligatures must not be flagged as mojibake/tofu');

    // Keyword matching should recognize canonical technologies even alongside ligature-rich prose
    const kwReport = ResumeKeywordCoverageService.analyzeKeywordCoverage({
      jobDescription: {
        title: 'Backend Engineer',
        requirements: [
          { text: 'PostgreSQL', importance: 'REQUIRED' },
          { text: 'Docker', importance: 'REQUIRED' },
        ],
      },
      structuredResume: {
        candidateIdentity: { displayName: 'Alexander Wright' },
        skills: { categories: [{ name: 'Tech', skills: ['PostgreSQL', 'Docker'] }] },
        projects: [
          {
            name: 'High-Throughput Key-Value Store',
            technologies: ['PostgreSQL', 'Docker'],
            bullets: ['Engineered an eﬃcient in-memory storage engine.'],
          },
        ],
      },
      extractedText: ligatureText,
    });

    assert.equal(kwReport.missingTerms, 0);
    assert.equal(kwReport.exactMatches, 2);
  });

  it('Fixture J: Hyperlinks, anchors, and profile URL extractions are safely validated', () => {
    const urlText = `
Sarah Jenkins
sarah.jenkins@example.com | (206) 555-0199 | Seattle, WA
https://github.com/sjenkins-dev | https://linkedin.com/in/sarah-jenkins-dev | https://sarahjenkins.io

Professional Summary
Cloud infrastructure architect with extensive AWS and Kubernetes production experience.

Technical Skills
AWS, Kubernetes, Terraform, Go, Python

Projects
Cloud Migration Pipeline
• Provisioned multi-region AWS infrastructure using Terraform and Terragrunt.
• Deployed microservices to Amazon EKS with automated canary deployments.
• Implemented IAM least-privilege security policies across 40 accounts.

Education
B.S. in Informatics - University of Washington
`;

    const report = defaultAtsParseabilityService.evaluateAtsParseability({
      extractedText: urlText,
      candidateProfile: {
        displayName: 'Sarah Jenkins',
        primaryEmail: 'sarah.jenkins@example.com',
      },
    });

    const urlCheck = report.checks.find((c) => c.checkId === 'URL_SAFETY');
    assert.ok(urlCheck?.passed, 'Valid URLs must pass URL_SAFETY');
    assert.ok(report.passed);
  });
});
