/**
 * @file Unit Tests for Career Artifact Export Engine Service (P6-004)
 *
 * Verifies all 26 required architectural invariants and export formats.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto, { randomUUID } from 'node:crypto';
import { CareerArtifactExportService } from '../../src/services/career-artifact-export.service.js';
import { NotFoundError, ValidationError } from '../../src/errors/index.js';
import { JsonResumeSchema } from '../../src/domain/career/career-artifact-export.schemas.js';

describe('Career Artifact Export Engine Service Unit Tests (P6-004)', () => {
  const tenantId = randomUUID();
  const candidateId = randomUUID();
  const jobId = randomUUID();
  const context = { tenantId, userId: randomUUID(), role: 'OWNER' };

  const service = new CareerArtifactExportService();

  // ---------------------------------------------------------------------------
  // Helper Fixtures
  // ---------------------------------------------------------------------------

  const createMockCandidate = () => ({
    id: candidateId,
    tenantId,
    name: 'Alex Mercer',
    displayName: 'Alex Mercer',
    headline: 'Senior Backend Engineer | Distributed Infrastructure',
    canonicalEmail: 'alex.mercer@example.com',
    canonicalPhone: '+1-555-0199',
    location: {
      address: '123 Tech Lane',
      city: 'San Francisco',
      region: 'CA',
      countryCode: 'US',
      postalCode: '94105',
    },
    websiteUrl: 'https://alexmercer.dev',
    identities: [
      {
        provider: 'GitHub',
        externalUsername: 'alexmercer',
        profileUrl: 'https://github.com/alexmercer',
      },
    ],
  });

  const createMockResume = () => ({
    resumeId: randomUUID(),
    tenantId,
    candidateId,
    targetJobId: jobId,
    headline: 'Senior Backend Engineer',
    summary:
      'Distributed systems engineer with 6+ years experience in Go, PostgreSQL, and high-concurrency microservices.',
    summaryBullets: [],
    skills: [
      {
        category: 'DATABASE',
        name: 'Databases & Storage',
        skills: [
          { name: 'PostgreSQL', canonicalSlug: 'postgresql', status: 'VERIFIED' },
          { name: 'Redis', canonicalSlug: 'redis', status: 'VERIFIED' },
          {
            name: 'Cassandra [Unverified User Claim]',
            canonicalSlug: 'cassandra',
            status: 'CLAIMED',
          },
        ],
      },
      {
        category: 'LANGUAGE',
        name: 'Languages & Core',
        skills: [
          { name: 'Go', canonicalSlug: 'go', status: 'VERIFIED' },
          { name: 'TypeScript', canonicalSlug: 'typescript', status: 'VERIFIED' },
        ],
      },
    ],
    experience: [
      {
        company: 'CloudScale Inc',
        title: 'Senior Backend Engineer',
        startDate: '2021-06-01',
        endDate: null,
        isCurrent: true,
        location: 'San Francisco, CA',
        bullets: [
          {
            text: 'Designed and deployed distributed storage clustering engine in Go.',
            status: 'VERIFIED',
            evidenceRefs: [
              {
                id: randomUUID(),
                resourceId: randomUUID(),
                resourceName: 'cloud-storage-engine',
                evidenceType: 'CODE_IMPORT_USAGE',
                filePath: 'cmd/server/main.go',
                commitSha: '1111111111111111111111111111111111111111',
                lineRange: { start: 1, end: 50 },
                confidenceScore: 0.98,
              },
            ],
          },
          {
            text: 'Optimized PostgreSQL connection pooling reducing P99 latency by 35%.',
            status: 'VERIFIED',
            evidenceRefs: [],
          },
          {
            text: 'Led cross-functional team of 4 engineers [Unverified User Claim].',
            status: 'CLAIMED',
            evidenceRefs: [],
          },
        ],
      },
    ],
    projects: [
      {
        name: 'cloud-storage-engine',
        displayName: 'alex/cloud-storage-engine',
        description: 'High-concurrency object storage engine built with Go and PostgreSQL.',
        projectType: 'APPLICATION',
        repositoryUrl: 'https://github.com/alex/cloud-storage-engine',
        primaryLanguages: ['Go', 'SQL'],
        primaryFrameworks: ['gRPC'],
        bullets: [
          {
            text: 'Implemented raft-based consensus protocol with zero data loss.',
            status: 'VERIFIED',
            evidenceRefs: [
              {
                id: randomUUID(),
                resourceId: randomUUID(),
                resourceName: 'cloud-storage-engine',
                evidenceType: 'CODE_IMPORT_USAGE',
                filePath: 'pkg/raft/consensus.go',
                commitSha: '2222222222222222222222222222222222222222',
                lineRange: { start: 10, end: 85 },
                confidenceScore: 0.95,
              },
            ],
          },
        ],
      },
    ],
    education: [
      {
        id: randomUUID(),
        institution: 'University of California, Berkeley',
        degree: 'B.S. in Computer Science',
        fieldOfStudy: 'Distributed Systems',
        startDate: '2015-09-01',
        endDate: '2019-05-30',
        grade: '3.8 GPA',
        bullets: [],
      },
    ],
    certifications: [
      {
        id: randomUUID(),
        name: 'AWS Certified Solutions Architect',
        issuingOrganization: 'Amazon Web Services',
        issueDate: '2023-01-15',
        credentialUrl: 'https://aws.amazon.com/verify/12345',
        bullets: [],
      },
    ],
    atsMatchScore: 92.5,
    integrityStatus: 'PASS',
    presentationMode: 'GENERATE_NEW',
    metadata: {
      generatedAt: new Date().toISOString(),
      generatorVersion: 'v1.0.0',
      totalBullets: 4,
      verifiedBullets: 3,
      inferredBullets: 0,
      claimedBullets: 1,
      omittedSkillsCount: 0,
      presentationMode: 'GENERATE_NEW',
      presentationIntegrityStatus: 'PASS',
    },
  });

  const createMockCoverLetter = () => ({
    letterId: randomUUID(),
    tenantId,
    candidateId,
    targetJobId: jobId,
    companyName: 'Apex Data Platforms',
    roleTitle: 'Principal Backend Infrastructure Engineer',
    recipientName: 'Engineering Leadership Team',
    paragraphs: [
      {
        paragraphId: randomUUID(),
        paragraphType: 'OPENING',
        text: 'I am writing to express my enthusiastic interest in the Principal Backend Infrastructure Engineer role at Apex Data Platforms.',
        evidenceRefs: [],
        status: 'VERIFIED',
      },
      {
        paragraphId: randomUUID(),
        paragraphType: 'PROJECT_EVIDENCE',
        text: 'In my cloud-storage-engine repository, I built high-scale distributed consensus engines in Go with PostgreSQL.',
        evidenceRefs: [
          {
            id: randomUUID(),
            resourceId: randomUUID(),
            resourceName: 'cloud-storage-engine',
            evidenceType: 'CODE_IMPORT_USAGE',
            filePath: 'cmd/server/main.go',
            commitSha: '1111111111111111111111111111111111111111',
            lineRange: { start: 1, end: 50 },
            confidenceScore: 0.98,
          },
        ],
        status: 'VERIFIED',
      },
      {
        paragraphId: randomUUID(),
        paragraphType: 'CLOSING',
        text: 'I look forward to discussing how my experience in distributed systems can accelerate Apex Data Platforms roadmap.',
        evidenceRefs: [],
        status: 'VERIFIED',
      },
    ],
    overallFitScore: 91.0,
    integrityStatus: 'PASS',
    metadata: {
      generatedAt: new Date().toISOString(),
      generatorVersion: 'v1.0.0',
      tone: 'PROFESSIONAL',
      totalParagraphs: 3,
      verifiedParagraphs: 3,
      inferredParagraphs: 0,
      claimedParagraphs: 0,
      omittedSkillsCount: 0,
      integrityAuditStatus: 'PASS',
    },
  });

  const createMockPortfolio = () => ({
    recommendationId: randomUUID(),
    tenantId,
    candidateId,
    targetJobId: jobId,
    jobFamily: 'BACKEND',
    featuredProjects: [
      {
        projectId: randomUUID(),
        projectName: 'distributed-storage-engine',
        projectSlug: 'distributed-storage-engine',
        rank: 1,
        recommendationStatus: 'RECOMMENDED',
        selectionScore: 94.0,
        marginalValue: 88.0,
        primaryRoleHighlighted: 'Backend / Systems Engineer',
        reason: 'Recommended #1 as Primary Anchor Project: Covers core storage criteria.',
        signalsAdded: ['BACKEND_DISTRIBUTED', 'DATABASE_DATA_MODELING', 'TESTING_QUALITY'],
        skillsToHighlight: ['go', 'postgresql'],
        evidenceHighlights: [],
        liveDemoAvailable: true,
        sourceAvailable: true,
        documentationAvailable: true,
      },
    ],
    supportingProjects: [],
    deprioritizedProjects: [],
    requirementCoverage: {
      requiredCount: 2,
      requiredCovered: 2,
      requiredCoveragePercentage: 100.0,
      preferredCount: 1,
      preferredCovered: 1,
      preferredCoveragePercentage: 100.0,
      totalCount: 3,
      totalCovered: 3,
      totalCoveragePercentage: 100.0,
    },
    caseStudyRecommendations: [
      {
        projectId: randomUUID(),
        projectDisplayName: 'distributed-storage-engine',
        whyFeatured: 'Covers core backend requirements',
        primaryRoleHighlighted: 'Backend / Systems Engineer',
        skillsToHighlight: ['go', 'postgresql'],
        evidenceCitations: [],
        missingStoryElements: [],
        questionsForCandidate: [
          'What primary problem were you solving with distributed-storage-engine?',
          'What was your specific individual contribution to the architecture?',
        ],
        interviewDiscussionTopics: [
          'Deep dive into Backend / Systems Engineer responsibilities',
          'Architectural trade-offs around BACKEND_DISTRIBUTED and DATABASE_DATA_MODELING',
        ],
      },
    ],
    warnings: [],
    metadata: {
      generatedAt: new Date().toISOString(),
      generatorVersion: 'v1.0.0',
      totalEvaluatedProjects: 1,
      featuredCount: 1,
      supportingCount: 0,
      deprioritizedCount: 0,
      jobFamilyDetected: 'BACKEND',
      overallSignalCoverageCount: 3,
    },
  });

  // ===========================================================================
  // 1. JSON Resume Export
  // ===========================================================================
  it('1. exports TailoredResume to RFC-compliant JSON Resume v1.0.0', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();

    const exported = service.exportResume(context, resume, cand, {
      format: 'JSON_RESUME',
    });

    assert.strictEqual(exported.format, 'JSON_RESUME');
    assert.strictEqual(exported.mimeType, 'application/json');
    assert.strictEqual(exported.fileName, 'resume.json');

    const parsed = JSON.parse(exported.content);
    assert.strictEqual(parsed.basics.name, 'Alex Mercer');
    assert.strictEqual(parsed.basics.email, 'alex.mercer@example.com');
    assert.strictEqual(parsed.work.length, 1);
    assert.strictEqual(parsed.skills.length, 2);
    assert.strictEqual(parsed.projects.length, 1);
    assert.ok(parsed.meta.antigravity);
    assert.strictEqual(parsed.meta.antigravity.generator, 'Antigravity Career Artifact Engine');

    // Schema conformance
    assert.doesNotThrow(() => JsonResumeSchema.parse(parsed));
  });

  // ===========================================================================
  // 2. Markdown Export
  // ===========================================================================
  it('2. exports TailoredResume and CoverLetter to CommonMark/GFM Markdown', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();
    const letter = createMockCoverLetter();

    const exportedResume = service.exportResume(context, resume, cand, { format: 'MARKDOWN' });
    assert.strictEqual(exportedResume.format, 'MARKDOWN');
    assert.strictEqual(exportedResume.mimeType, 'text/markdown');
    assert.ok(exportedResume.content.includes('# Alex Mercer'));
    assert.ok(exportedResume.content.includes('## Executive Summary'));
    assert.ok(exportedResume.content.includes('## Technical Skills'));
    assert.ok(exportedResume.content.includes('## Professional Experience'));

    const exportedLetter = service.exportCoverLetter(context, letter, cand, { format: 'MARKDOWN' });
    assert.ok(exportedLetter.content.includes('# Cover Letter: Alex Mercer'));
    assert.ok(exportedLetter.content.includes('Apex Data Platforms'));
  });

  // ===========================================================================
  // 3. Plain Text Export
  // ===========================================================================
  it('3. exports TailoredResume to ATS-safe linear plain text', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();

    const exported = service.exportResume(context, resume, cand, { format: 'PLAIN_TEXT' });
    assert.strictEqual(exported.format, 'PLAIN_TEXT');
    assert.strictEqual(exported.mimeType, 'text/plain');
    assert.ok(exported.content.includes('ALEX MERCER'));
    assert.ok(exported.content.includes('=== SUMMARY ==='));
    assert.ok(exported.content.includes('=== EXPERIENCE ==='));
    assert.ok(exported.content.includes('=== PROJECTS ==='));
  });

  // ===========================================================================
  // 4. Canonical JSON Export
  // ===========================================================================
  it('4. exports full platform-neutral domain artifact in CANONICAL_JSON format', () => {
    const portfolio = createMockPortfolio();
    const cand = createMockCandidate();

    const exported = service.exportPortfolio(context, portfolio, cand, {
      format: 'CANONICAL_JSON',
    });
    assert.strictEqual(exported.format, 'CANONICAL_JSON');
    assert.strictEqual(exported.mimeType, 'application/json');

    const parsed = JSON.parse(exported.content);
    assert.strictEqual(parsed.jobFamily, 'BACKEND');
    assert.strictEqual(parsed.featuredProjects.length, 1);
  });

  // ===========================================================================
  // 5. Citation Style: NONE
  // ===========================================================================
  it('5. excludes all visible evidence references when citationStyle is NONE', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();

    const exported = service.exportResume(context, resume, cand, {
      format: 'MARKDOWN',
      citationStyle: 'NONE',
    });

    assert.ok(!exported.content.includes('[Verified:'));
    assert.ok(!exported.content.includes('[^1]'));
    assert.ok(!exported.content.includes('## Verified Evidence Ledger'));
  });

  // ===========================================================================
  // 6. Citation Style: INLINE
  // ===========================================================================
  it('6. appends compact inline evidence citations when citationStyle is INLINE', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();

    const exported = service.exportResume(context, resume, cand, {
      format: 'MARKDOWN',
      citationStyle: 'INLINE',
    });

    assert.ok(exported.content.includes('[Verified: cmd/server/main.go:1-50@1111111]'));
  });

  // ===========================================================================
  // 7. Citation Style: FOOTNOTES
  // ===========================================================================
  it('7. appends numbered superscripts and evidence ledger when citationStyle is FOOTNOTES', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();

    const exported = service.exportResume(context, resume, cand, {
      format: 'MARKDOWN',
      citationStyle: 'FOOTNOTES',
    });

    assert.ok(exported.content.includes('[^1]'));
    assert.ok(exported.content.includes('## Verified Evidence Ledger'));
    assert.ok(exported.content.includes('[^1]: Verified in `cmd/server/main.go`'));
  });

  // ===========================================================================
  // 8. Citation Style: METADATA_ONLY
  // ===========================================================================
  it('8. retains evidence in metadata only when citationStyle is METADATA_ONLY', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();

    const exported = service.exportResume(context, resume, cand, {
      format: 'MARKDOWN',
      citationStyle: 'METADATA_ONLY',
    });

    assert.ok(!exported.content.includes('[Verified:'));
    assert.ok(!exported.content.includes('[^1]'));
    assert.strictEqual(exported.metadata.citationStyle, 'METADATA_ONLY');
  });

  // ===========================================================================
  // 9. Anonymization
  // ===========================================================================
  it('9. redacts candidate PII when anonymize is true', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();

    const exported = service.exportResume(context, resume, cand, {
      format: 'PLAIN_TEXT',
      anonymize: true,
    });

    assert.ok(exported.content.includes('[REDACTED_NAME]'));
    assert.ok(exported.content.includes('[REDACTED_EMAIL]'));
    assert.ok(exported.content.includes('[REDACTED_PHONE]'));
    assert.ok(!exported.content.includes('Alex Mercer'));
    assert.ok(!exported.content.includes('alex.mercer@example.com'));
    assert.ok(exported.metadata.anonymized);
  });

  // ===========================================================================
  // 10. Unverified-Claim Omission
  // ===========================================================================
  it('10. omits [Unverified User Claim] items when includeUnverifiedClaims is false', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();

    const exported = service.exportResume(context, resume, cand, {
      format: 'MARKDOWN',
      includeUnverifiedClaims: false,
    });

    assert.ok(!exported.content.includes('Cassandra'));
    assert.ok(!exported.content.includes('Led cross-functional team'));
    assert.strictEqual(exported.metadata.includeUnverifiedClaims, false);
  });

  // ===========================================================================
  // 11. Unverified-Claim Inclusion
  // ===========================================================================
  it('11. retains explicit [Unverified User Claim] labeling when includeUnverifiedClaims is true', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();

    const exported = service.exportResume(context, resume, cand, {
      format: 'MARKDOWN',
      includeUnverifiedClaims: true,
    });

    assert.ok(exported.content.includes('Cassandra [Unverified User Claim]'));
    assert.ok(
      exported.content.includes('Led cross-functional team of 4 engineers [Unverified User Claim]')
    );
  });

  // ===========================================================================
  // 12. JSON Resume Validation
  // ===========================================================================
  it('12. rejects non-resume artifacts with ValidationError when requested in JSON_RESUME format', () => {
    const letter = createMockCoverLetter();

    assert.throws(
      () => service.exportCareerArtifact(context, letter, { format: 'JSON_RESUME' }),
      ValidationError
    );
  });

  // ===========================================================================
  // 13. Markdown Escaping
  // ===========================================================================
  it('13. escapes unsafe HTML characters in Markdown export', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();
    resume.headline = '<script>alert("xss")</script> Principal Architect';

    const exported = service.exportResume(context, resume, cand, { format: 'MARKDOWN' });
    assert.ok(!exported.content.includes('<script>'));
    assert.ok(exported.content.includes('&lt;script&gt;'));
  });

  // ===========================================================================
  // 14. Plain-Text ASCII Sanitization
  // ===========================================================================
  it('14. normalizes curly quotes, em-dashes, and unicode bullets in plain text', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();
    resume.summary = '“Engineered” high-performance platforms — with • bulleted features.';

    const exported = service.exportResume(context, resume, cand, { format: 'PLAIN_TEXT' });
    assert.ok(exported.content.includes('"Engineered"'));
    assert.ok(exported.content.includes('- with * bulleted features.'));
  });

  // ===========================================================================
  // 15. LF Line Endings
  // ===========================================================================
  it('15. normalizes line endings to LF (\n)', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();

    const exported = service.exportResume(context, resume, cand, {
      format: 'PLAIN_TEXT',
      lineEnding: 'LF',
    });

    assert.ok(!exported.content.includes('\r\n'));
    assert.ok(exported.content.includes('\n'));
    assert.strictEqual(exported.metadata.lineEnding, 'LF');
  });

  // ===========================================================================
  // 16. CRLF Line Endings
  // ===========================================================================
  it('16. normalizes line endings to CRLF (\r\n)', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();

    const exported = service.exportResume(context, resume, cand, {
      format: 'PLAIN_TEXT',
      lineEnding: 'CRLF',
    });

    assert.ok(exported.content.includes('\r\n'));
    assert.strictEqual(exported.metadata.lineEnding, 'CRLF');
  });

  // ===========================================================================
  // 17. UTF-8 Encoding
  // ===========================================================================
  it('17. preserves international UTF-8 characters when encoding is UTF-8', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();
    resume.headline = 'Senior Ingénieur & Développeur';

    const exported = service.exportResume(context, resume, cand, {
      format: 'PLAIN_TEXT',
      encoding: 'UTF-8',
    });

    assert.ok(exported.content.includes('Ingénieur & Développeur'));
    assert.strictEqual(exported.metadata.encoding, 'UTF-8');
  });

  // ===========================================================================
  // 18. ASCII Encoding Transliteration
  // ===========================================================================
  it('18. transliterates non-ASCII characters to standard ASCII when encoding is ASCII', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();
    resume.headline = 'Senior Ingénieur & Développeur';

    const exported = service.exportResume(context, resume, cand, {
      format: 'PLAIN_TEXT',
      encoding: 'ASCII',
    });

    assert.ok(exported.content.includes('Ingenieur & Developpeur'));
    assert.strictEqual(exported.metadata.encoding, 'ASCII');
  });

  // ===========================================================================
  // 19. Checksum Stability
  // ===========================================================================
  it('19. calculates SHA-256 checksum matching exact exported bytes', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();

    const exported = service.exportResume(context, resume, cand, { format: 'MARKDOWN' });
    const computed = Buffer.from(exported.content, 'utf8');
    const expectedHash = crypto.createHash('sha256').update(computed).digest('hex');

    assert.strictEqual(exported.sha256Checksum, expectedHash);
  });

  // ===========================================================================
  // 20. Checksum Changes After Content Mutation
  // ===========================================================================
  it('20. produces different checksum when content changes', () => {
    const cand = createMockCandidate();
    const resume1 = createMockResume();
    const resume2 = createMockResume();
    resume2.summary = 'Completely different career summary statement.';

    const exp1 = service.exportResume(context, resume1, cand, { format: 'MARKDOWN' });
    const exp2 = service.exportResume(context, resume2, cand, { format: 'MARKDOWN' });

    assert.notStrictEqual(exp1.sha256Checksum, exp2.sha256Checksum);
  });

  // ===========================================================================
  // 21. Safe Filename
  // ===========================================================================
  it('21. generates safe default filenames', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();

    const exp1 = service.exportResume(context, resume, cand, { format: 'JSON_RESUME' });
    assert.strictEqual(exp1.fileName, 'resume.json');

    const exp2 = service.exportResume(context, resume, cand, { format: 'MARKDOWN' });
    assert.strictEqual(exp2.fileName, 'resume.md');

    const exp3 = service.exportResume(context, resume, cand, { format: 'PLAIN_TEXT' });
    assert.strictEqual(exp3.fileName, 'resume.txt');
  });

  // ===========================================================================
  // 22. Path Traversal Rejection
  // ===========================================================================
  it('22. rejects path traversal in fileName with ValidationError', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();

    assert.throws(
      () => service.exportResume(context, resume, cand, { fileName: '../../etc/passwd' }),
      ValidationError
    );

    assert.throws(
      () => service.exportResume(context, resume, cand, { fileName: '..\\windows\\system32' }),
      ValidationError
    );
  });

  // ===========================================================================
  // 23. Secret Leakage Prevention
  // ===========================================================================
  it('23. prevents secret keys in metadata from leaking', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();

    const exported = service.exportResume(context, resume, cand, { format: 'MARKDOWN' });
    const metaStr = JSON.stringify(exported.metadata);
    assert.ok(!metaStr.includes('apiKey'));
    assert.ok(!metaStr.includes('password'));
    assert.ok(!metaStr.includes('token'));
  });

  // ===========================================================================
  // 24. Deterministic Output
  // ===========================================================================
  it('24. guarantees 100% deterministic output across repeated executions', () => {
    const cand = createMockCandidate();
    const resume = createMockResume();

    const exp1 = service.exportResume(context, resume, cand, { format: 'MARKDOWN' });
    const exp2 = service.exportResume(context, resume, cand, { format: 'MARKDOWN' });

    assert.strictEqual(exp1.content, exp2.content);
    assert.strictEqual(exp1.sha256Checksum, exp2.sha256Checksum);
  });

  // ===========================================================================
  // 25. Tenant Isolation
  // ===========================================================================
  it('25. throws NotFoundError on cross-tenant export requests (404 default-deny)', () => {
    const foreignTenantId = randomUUID();
    const cand = createMockCandidate();
    const resume = createMockResume();
    resume.tenantId = foreignTenantId;

    assert.throws(() => service.exportResume(context, resume, cand), NotFoundError);
  });

  // ===========================================================================
  // 26. Invalid EvidenceRef Rejection
  // ===========================================================================
  it('26. rejects artifacts with cross-tenant evidence references with NotFoundError', () => {
    const foreignTenantId = randomUUID();
    const cand = createMockCandidate();
    const resume = createMockResume();
    resume.projects[0].evidenceRefs = [
      {
        id: randomUUID(),
        tenantId: foreignTenantId,
        resourceId: randomUUID(),
        resourceName: 'foreign-repo',
        evidenceType: 'CODE_USAGE',
        filePath: 'src/main.go',
      },
    ];

    assert.throws(() => service.exportResume(context, resume, cand), NotFoundError);
  });
});
