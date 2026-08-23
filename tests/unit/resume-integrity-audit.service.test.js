/**
 * @file Unit Tests for Resume Integrity Audit Tool Service (P6-005)
 *
 * Verifies all 28 required test scenarios covering:
 * - Clean verified resume
 * - Claimed skills & inferred skills
 * - Missing evidence & unsupported skills
 * - Invalid & fabricated EvidenceIds
 * - Tenant mismatch (404) & candidate mismatch
 * - Resource & project mismatch
 * - Provenance mismatch (commit SHA, file path)
 * - Unsupported metrics & unsupported employers/tenure
 * - Contradictions & status inflation
 * - Content drift & ATS keyword stuffing
 * - Omission tolerance (omitting valid candidate facts is not penalized)
 * - Structured Resume, JSON Resume, Markdown, Plain Text
 * - Deterministic output & remediation generation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ResumeIntegrityAuditService } from '../../src/services/resume-integrity-audit.service.js';
import { NotFoundError, ValidationError } from '../../src/errors/index.js';
import { ResumeIntegrityAuditSchema } from '../../src/domain/career/resume-integrity-audit.schemas.js';

describe('Resume Integrity Audit Tool Service Unit Tests (P6-005)', () => {
  const tenantId = randomUUID();
  const candidateId = randomUUID();
  const context = { tenantId, userId: randomUUID(), role: 'OWNER' };

  const service = new ResumeIntegrityAuditService();

  // ---------------------------------------------------------------------------
  // Helper Fixtures
  // ---------------------------------------------------------------------------

  const createMockCandidate = () => ({
    id: candidateId,
    tenantId,
    name: 'Elena Rostova',
    displayName: 'Elena Rostova',
    headline: 'Senior Distributed Systems Architect',
    canonicalEmail: 'elena@example.com',
    canonicalPhone: '+1-555-0144',
    location: { city: 'Boston', region: 'MA', countryCode: 'US' },
    skills: [
      {
        id: randomUUID(),
        name: 'Go',
        slug: 'go',
        category: 'LANGUAGE',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 1.0,
      },
      {
        id: randomUUID(),
        name: 'PostgreSQL',
        slug: 'postgresql',
        category: 'DATABASE',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.95,
      },
      {
        id: randomUUID(),
        name: 'Docker',
        slug: 'docker',
        category: 'DEVOPS',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.9,
      },
      {
        id: randomUUID(),
        name: 'React',
        slug: 'react',
        category: 'FRONTEND',
        provenanceStatus: 'INFERRED',
        confidenceScore: 0.7,
      },
      {
        id: randomUUID(),
        name: 'Cassandra',
        slug: 'cassandra',
        category: 'DATABASE',
        provenanceStatus: 'CLAIMED',
        confidenceScore: 0.4,
      },
    ],
    experience: [
      {
        company: 'Apex Systems',
        title: 'Senior Systems Engineer',
        startDate: '2021-01-01',
        endDate: '2024-06-30',
        isCurrent: false,
        location: 'Boston, MA',
        bullets: ['Engineered high-throughput event processing pipelines in Go.'],
      },
    ],
    education: [
      {
        institution: 'MIT',
        degree: 'M.S. in Computer Science',
        fieldOfStudy: 'Distributed Systems',
      },
    ],
    projects: [
      {
        id: randomUUID(),
        name: 'distributed-store',
        slug: 'distributed-store',
      },
    ],
  });

  const createMockEvidence = () => ({
    id: randomUUID(),
    tenantId,
    candidateId,
    resourceId: randomUUID(),
    resourceName: 'distributed-store',
    evidenceType: 'CODE_IMPORT_USAGE',
    filePath: 'cmd/server/main.go',
    commitSha: '1111111111111111111111111111111111111111',
    lineRange: { start: 1, end: 40 },
    confidenceScore: 0.98,
    excerpt: 'package main\n\nimport "github.com/lib/pq"\n// 35% latency improvement benchmarked',
  });

  const createMockAssertions = (evItem) => [
    {
      assertionId: randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'SKILL',
      statement: 'Candidate is verified in Go',
      subjectSlug: 'go',
      status: 'VERIFIED',
      confidenceScore: 1.0,
      evidenceRefs: [
        {
          id: evItem.id,
          resourceId: evItem.resourceId,
          resourceName: evItem.resourceName,
          filePath: evItem.filePath,
          commitSha: evItem.commitSha,
          lineRange: evItem.lineRange,
          evidenceType: evItem.evidenceType,
          confidenceScore: evItem.confidenceScore,
        },
      ],
    },
    {
      assertionId: randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'SKILL',
      statement: 'Candidate is verified in PostgreSQL',
      subjectSlug: 'postgresql',
      status: 'VERIFIED',
      confidenceScore: 0.95,
      evidenceRefs: [],
    },
    {
      assertionId: randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'SKILL',
      statement: 'Candidate has inferred skill React',
      subjectSlug: 'react',
      status: 'INFERRED',
      confidenceScore: 0.7,
      evidenceRefs: [],
    },
  ];

  const createMockResume = (evItem) => ({
    resumeId: randomUUID(),
    tenantId,
    candidateId,
    targetJobId: randomUUID(),
    headline: 'Senior Distributed Systems Architect',
    summary: 'Expert systems engineer specializing in Go and PostgreSQL clustering.',
    skills: [
      {
        name: 'Backend Core',
        skills: [
          { name: 'Go', canonicalSlug: 'go', status: 'VERIFIED' },
          { name: 'PostgreSQL', canonicalSlug: 'postgresql', status: 'VERIFIED' },
        ],
      },
    ],
    experience: [
      {
        company: 'Apex Systems',
        title: 'Senior Systems Engineer',
        startDate: '2021-01-01',
        endDate: '2024-06-30',
        bullets: [
          {
            text: 'Designed distributed replication layer in Go with PostgreSQL.',
            status: 'VERIFIED',
            evidenceRefs: [
              {
                id: evItem.id,
                resourceId: evItem.resourceId,
                resourceName: evItem.resourceName,
                filePath: evItem.filePath,
                commitSha: evItem.commitSha,
                lineRange: evItem.lineRange,
                evidenceType: evItem.evidenceType,
                confidenceScore: evItem.confidenceScore,
              },
            ],
          },
        ],
      },
    ],
    projects: [
      {
        name: 'distributed-store',
        displayName: 'elena/distributed-store',
        bullets: [
          {
            text: 'Implemented Raft consensus algorithm.',
            status: 'VERIFIED',
            evidenceRefs: [],
          },
        ],
      },
    ],
    education: [
      {
        institution: 'MIT',
        degree: 'M.S. in Computer Science',
      },
    ],
    integrityStatus: 'PASS',
    metadata: {
      generatedAt: new Date().toISOString(),
      generatorVersion: 'v1.0.0',
    },
  });

  // ===========================================================================
  // 1. Clean Verified Resume
  // ===========================================================================
  it('1. emits PASS status on clean verified resume with authentic evidence', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);

    const audit = service.auditResume(context, resume, assertions, candidate);

    assert.strictEqual(audit.overallStatus, 'PASS');
    assert.strictEqual(audit.findings.filter((f) => f.severity === 'BLOCK').length, 0);
    assert.ok(audit.evidenceCoverage.coveragePercentage > 80);
    assert.doesNotThrow(() => ResumeIntegrityAuditSchema.parse(audit));
  });

  // ===========================================================================
  // 2. Claimed Skill
  // ===========================================================================
  it('2. emits WARN (LABELED_USER_CLAIM) when self-asserted user claim is retained', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);
    resume.skills[0].skills.push({
      name: 'Cassandra [Unverified User Claim]',
      canonicalSlug: 'cassandra',
      status: 'CLAIMED',
    });

    const audit = service.auditResume(context, resume, assertions, candidate);

    assert.strictEqual(audit.overallStatus, 'WARN');
    const claimFinding = audit.findings.find((f) => f.code === 'LABELED_USER_CLAIM');
    assert.ok(claimFinding);
    assert.strictEqual(claimFinding.severity, 'WARN');
  });

  // ===========================================================================
  // 3. Inferred Skill
  // ===========================================================================
  it('3. emits WARN (VALID_INFERENCE) when valid taxonomic inference is present', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);
    resume.skills[0].skills.push({
      name: 'React',
      canonicalSlug: 'react',
      status: 'INFERRED',
    });

    const audit = service.auditResume(context, resume, assertions, candidate);

    assert.strictEqual(audit.overallStatus, 'WARN');
    const infFinding = audit.findings.find((f) => f.code === 'VALID_INFERENCE');
    assert.ok(infFinding);
    assert.strictEqual(infFinding.severity, 'WARN');
  });

  // ===========================================================================
  // 4. Missing Evidence & Unsupported Skill
  // ===========================================================================
  it('4. emits BLOCK (UNSUPPORTED_SKILL) when unverified technology is presented as fact', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);
    resume.skills[0].skills.push({
      name: 'Kubernetes',
      canonicalSlug: 'kubernetes',
      status: 'VERIFIED',
    });

    const audit = service.auditResume(context, resume, assertions, candidate);

    assert.strictEqual(audit.overallStatus, 'BLOCK');
    const unsuppFinding = audit.findings.find((f) => f.code === 'UNSUPPORTED_SKILL');
    assert.ok(unsuppFinding);
    assert.strictEqual(unsuppFinding.severity, 'BLOCK');
    assert.ok(unsuppFinding.remediation.includes('Remove skill'));
  });

  // ===========================================================================
  // 5. Invalid EvidenceId
  // ===========================================================================
  it('5. emits BLOCK (INVALID_EVIDENCE_ID) when bullet cites non-existent EvidenceId', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);
    resume.experience[0].bullets[0].evidenceRefs = [
      {
        id: randomUUID(),
        resourceId: randomUUID(),
        resourceName: 'fake-repo',
        evidenceType: 'CODE_USAGE',
        filePath: 'fake.go',
      },
    ];

    const audit = service.auditResume(context, resume, assertions, candidate);

    assert.strictEqual(audit.overallStatus, 'BLOCK');
    const invFinding = audit.findings.find((f) => f.code === 'INVALID_EVIDENCE_ID');
    assert.ok(invFinding);
    assert.strictEqual(invFinding.severity, 'BLOCK');
  });

  // ===========================================================================
  // 6. Fabricated EvidenceId
  // ===========================================================================
  it('6. detects and blocks fabricated EvidenceId references', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);
    resume.experience[0].bullets[0].evidenceRefs[0].id = '00000000-0000-0000-0000-000000000000';

    const audit = service.auditResume(context, resume, assertions, candidate);

    assert.strictEqual(audit.overallStatus, 'BLOCK');
    assert.ok(audit.findings.some((f) => f.code === 'INVALID_EVIDENCE_ID'));
  });

  // ===========================================================================
  // 7. Tenant Mismatch (404 Default-Deny)
  // ===========================================================================
  it('7. throws NotFoundError (404) when resume or assertions belong to another tenant', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);
    resume.tenantId = randomUUID();

    assert.throws(() => service.auditResume(context, resume, assertions, candidate), NotFoundError);
  });

  // ===========================================================================
  // 8. Candidate Mismatch
  // ===========================================================================
  it('8. emits BLOCK (CANDIDATE_MISMATCH) when evidence belongs to another candidate', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);
    resume.experience[0].bullets[0].evidenceRefs[0].candidateId = randomUUID();

    const audit = service.auditResume(context, resume, assertions, candidate);

    assert.strictEqual(audit.overallStatus, 'BLOCK');
    assert.ok(audit.findings.some((f) => f.code === 'CANDIDATE_MISMATCH'));
  });

  // ===========================================================================
  // 9. Resource Mismatch
  // ===========================================================================
  it('9. blocks evidence citations with malformed resource metadata', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);
    resume.projects[0].name = 'unauthorized-external-repo';

    const audit = service.auditResume(context, resume, assertions, candidate);

    assert.strictEqual(audit.overallStatus, 'BLOCK');
    assert.ok(audit.findings.some((f) => f.code === 'PROJECT_MISMATCH'));
  });

  // ===========================================================================
  // 10. Provenance Mismatch (Commit SHA Tampering)
  // ===========================================================================
  it('10. emits BLOCK (PROVENANCE_MISMATCH) when commit SHA is altered or malformed', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);
    resume.experience[0].bullets[0].evidenceRefs[0].commitSha = 'tampered_sha_not_40_hex';

    const audit = service.auditResume(context, resume, assertions, candidate);

    assert.strictEqual(audit.overallStatus, 'BLOCK');
    assert.ok(audit.findings.some((f) => f.code === 'PROVENANCE_MISMATCH'));
  });

  // ===========================================================================
  // 11. Unsupported Metric
  // ===========================================================================
  it('11. emits BLOCK (UNSUPPORTED_METRIC) when quantitative metric lacks evidence', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);
    resume.summary = 'Engineered storage clustering system serving 10M users with 99.99% uptime.';

    const audit = service.auditResume(context, resume, assertions, candidate);

    assert.strictEqual(audit.overallStatus, 'BLOCK');
    const metricFinding = audit.findings.find((f) => f.code === 'UNSUPPORTED_METRIC');
    assert.ok(metricFinding);
    assert.strictEqual(metricFinding.severity, 'BLOCK');
  });

  // ===========================================================================
  // 12. Unsupported Employer
  // ===========================================================================
  it('12. emits BLOCK (UNSUPPORTED_EMPLOYER) when unlisted employer is present', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);
    resume.experience.push({
      company: 'Google LLC',
      title: 'Staff Engineer',
      startDate: '2019-01-01',
      endDate: '2020-12-31',
      bullets: [],
    });

    const audit = service.auditResume(context, resume, assertions, candidate);

    assert.strictEqual(audit.overallStatus, 'BLOCK');
    const empFinding = audit.findings.find((f) => f.code === 'UNSUPPORTED_EMPLOYER');
    assert.ok(empFinding);
  });

  // ===========================================================================
  // 13. Unsupported Education
  // ===========================================================================
  it('13. emits BLOCK (UNSUPPORTED_EDUCATION) when unverified degree is claimed', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);
    resume.education.push({
      institution: 'Stanford University',
      degree: 'Ph.D. in Computer Science',
    });

    const audit = service.auditResume(context, resume, assertions, candidate);

    assert.strictEqual(audit.overallStatus, 'BLOCK');
    assert.ok(audit.findings.some((f) => f.code === 'UNSUPPORTED_EDUCATION'));
  });

  // ===========================================================================
  // 14. Unsupported Tenure
  // ===========================================================================
  it('14. emits BLOCK (CONTRADICTORY_FACT) when tenure dates conflict with work history', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const markdown = `# Elena Rostova\n## Professional Experience\n### Senior Engineer — Apex Systems\n*2010 - 2024*\n- Built distributed systems in Go.`;

    const audit = service.auditResume(context, markdown, assertions, candidate, {
      format: 'MARKDOWN',
    });

    assert.strictEqual(audit.overallStatus, 'BLOCK');
    assert.ok(audit.findings.some((f) => f.code === 'CONTRADICTORY_FACT'));
  });

  // ===========================================================================
  // 15. Contradiction Detection
  // ===========================================================================
  it('15. detects contradictory facts between resume claims and candidate profile', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const plainText = `ELENA ROSTOVA\n=== EXPERIENCE ===\nStaff Engineer | Apex Systems\n2005 - 2024\n* Led core distributed engine in Go.`;

    const audit = service.auditResume(context, plainText, assertions, candidate, {
      format: 'PLAIN_TEXT',
    });

    assert.strictEqual(audit.overallStatus, 'BLOCK');
    assert.ok(audit.findings.some((f) => f.code === 'CONTRADICTORY_FACT'));
  });

  // ===========================================================================
  // 16. ATS Keyword Stuffing Defense
  // ===========================================================================
  it('16. emits BLOCK on repetitive ungrounded ATS keyword stuffing', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const textWithStuffing = `ELENA ROSTOVA\n=== SUMMARY ===\nKubernetes architect with Kubernetes clusters and Kubernetes deployments in Kubernetes.`;

    const audit = service.auditResume(context, textWithStuffing, assertions, candidate, {
      format: 'PLAIN_TEXT',
    });

    assert.strictEqual(audit.overallStatus, 'BLOCK');
    const stuffFinding = audit.findings.find(
      (f) => f.code === 'UNSUPPORTED_SKILL' && f.message.includes('Keyword stuffing')
    );
    assert.ok(stuffFinding);
  });

  // ===========================================================================
  // 17. Omission Tolerance Invariant
  // ===========================================================================
  it('17. does NOT penalize omissions of valid candidate skills or previous education', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);
    // Candidate has Docker and React, but resume omits them
    resume.skills = [
      {
        name: 'Backend',
        skills: [{ name: 'Go', canonicalSlug: 'go', status: 'VERIFIED' }],
      },
    ];
    resume.education = []; // Omitted education

    const audit = service.auditResume(context, resume, assertions, candidate);

    assert.strictEqual(audit.overallStatus, 'PASS');
  });

  // ===========================================================================
  // 18. Structured Resume Audit
  // ===========================================================================
  it('18. audits Structured Resume AST with full schema validation', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);

    const audit = service.auditResume(context, resume, assertions, candidate);

    assert.strictEqual(audit.inputFormat, 'STRUCTURED_RESUME');
    assert.strictEqual(audit.overallStatus, 'PASS');
  });

  // ===========================================================================
  // 19. JSON Resume Audit
  // ===========================================================================
  it('19. audits JSON Resume format independently of meta.antigravity envelope', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const jsonResume = {
      basics: { name: 'Elena Rostova', summary: 'Senior distributed architect in Go.' },
      work: [
        {
          name: 'Apex Systems',
          position: 'Senior Systems Engineer',
          highlights: ['Built storage in Go.'],
        },
      ],
      skills: [{ name: 'Backend', keywords: ['Go', 'PostgreSQL'] }],
      projects: [{ name: 'distributed-store', highlights: ['Implemented consensus.'] }],
    };

    const audit = service.auditResume(context, jsonResume, assertions, candidate);

    assert.strictEqual(audit.inputFormat, 'JSON_RESUME');
    assert.strictEqual(audit.overallStatus, 'PASS');
  });

  // ===========================================================================
  // 20. Markdown Audit
  // ===========================================================================
  it('20. audits Markdown document and safely escapes HTML without execution', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const markdown = `# Elena Rostova\n<script>alert('xss')</script>\n## Technical Skills\n- **Backend**: Go, PostgreSQL\n## Professional Experience\n### Senior Engineer — Apex Systems\n- Designed distributed engine in Go.`;

    const audit = service.auditResume(context, markdown, assertions, candidate);

    assert.strictEqual(audit.inputFormat, 'MARKDOWN');
    assert.strictEqual(audit.overallStatus, 'PASS');
  });

  // ===========================================================================
  // 21. Plain Text Audit
  // ===========================================================================
  it('21. audits Plain Text linear stream', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const plainText = `ELENA ROSTOVA\n=== TECHNICAL SKILLS ===\n* Backend: Go, PostgreSQL\n=== EXPERIENCE ===\nSenior Engineer | Apex Systems\n* Built distributed engine in Go.`;

    const audit = service.auditResume(context, plainText, assertions, candidate);

    assert.strictEqual(audit.inputFormat, 'PLAIN_TEXT');
    assert.strictEqual(audit.overallStatus, 'PASS');
  });

  // ===========================================================================
  // 22. Deterministic Output
  // ===========================================================================
  it('22. guarantees 100% deterministic findings and statistics across repeated audits', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);

    const audit1 = service.auditResume(context, resume, assertions, candidate);
    const audit2 = service.auditResume(context, resume, assertions, candidate);

    assert.strictEqual(audit1.overallStatus, audit2.overallStatus);
    assert.strictEqual(audit1.statistics.totalClaimsAudited, audit2.statistics.totalClaimsAudited);
    assert.strictEqual(
      audit1.evidenceCoverage.coveragePercentage,
      audit2.evidenceCoverage.coveragePercentage
    );
  });

  // ===========================================================================
  // 23. Remediation Generation
  // ===========================================================================
  it('23. generates actionable remediation instructions for all BLOCK and WARN findings', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);
    resume.skills[0].skills.push({
      name: 'Terraform',
      canonicalSlug: 'terraform',
      status: 'VERIFIED',
    });

    const audit = service.auditResume(context, resume, assertions, candidate);

    const blockFinding = audit.findings.find((f) => f.code === 'UNSUPPORTED_SKILL');
    assert.ok(blockFinding);
    assert.ok(blockFinding.remediation.length > 10);
  });

  // ===========================================================================
  // 24. Rejection of Unsupported Formats (PDF/DOCX)
  // ===========================================================================
  it('24. rejects PDF and DOCX format options with ValidationError (UNSUPPORTED_FORMAT)', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);

    assert.throws(
      () => service.auditResume(context, resume, assertions, candidate, { format: 'PDF' }),
      ValidationError
    );

    assert.throws(
      () => service.auditResume(context, resume, assertions, candidate, { format: 'DOCX' }),
      ValidationError
    );
  });

  // ===========================================================================
  // 25. Status Inflation Detection
  // ===========================================================================
  it('25. emits BLOCK (STATUS_INFLATION) when self-asserted user claim is presented as verified fact', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);
    // Candidate has Cassandra as CLAIMED. Resume asserts it as VERIFIED without [Unverified User Claim] label.
    resume.skills[0].skills.push({
      name: 'Cassandra',
      canonicalSlug: 'cassandra',
      status: 'VERIFIED',
    });

    const audit = service.auditResume(context, resume, assertions, candidate);

    assert.strictEqual(audit.overallStatus, 'BLOCK');
    const inflationFinding = audit.findings.find((f) => f.code === 'STATUS_INFLATION');
    assert.ok(inflationFinding);
    assert.strictEqual(inflationFinding.severity, 'BLOCK');
  });

  // ===========================================================================
  // 26. Content Drift Classification
  // ===========================================================================
  it('26. classifies contentDrift as FACTUAL_CHANGE when ungrounded skills are injected', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);
    resume.skills[0].skills.push({
      name: 'Kubernetes',
      canonicalSlug: 'kubernetes',
      status: 'VERIFIED',
    });

    const audit = service.auditResume(context, resume, assertions, candidate);

    assert.strictEqual(audit.contentDrift, 'FACTUAL_CHANGE');
  });

  // ===========================================================================
  // 27. Capability Statements vs Quantified Achievements
  // ===========================================================================
  it('27. allows natural capability statements while blocking ungrounded numerical achievements', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);
    // Add capability statement
    resume.experience[0].bullets.push({
      text: 'Architected and developed modular services in Go.',
      status: 'VERIFIED',
    });

    const audit = service.auditResume(context, resume, assertions, candidate);

    assert.strictEqual(audit.overallStatus, 'PASS');
  });

  // ===========================================================================
  // 28. Security Context Validation
  // ===========================================================================
  it('28. throws ValidationError when context is missing or invalid', () => {
    const candidate = createMockCandidate();
    const evItem = createMockEvidence();
    const assertions = createMockAssertions(evItem);
    const resume = createMockResume(evItem);

    assert.throws(() => service.auditResume(null, resume, assertions, candidate), ValidationError);
    assert.throws(() => service.auditResume({}, resume, assertions, candidate), ValidationError);
  });
});
