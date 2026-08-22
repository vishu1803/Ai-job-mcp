/**
 * @file Unit Tests for Zero-Hallucination Integrity Gate Service (P5-006)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ZeroHallucinationIntegrityService } from '../../src/services/zero-hallucination-integrity.service.js';
import { ValidationError } from '../../src/errors/index.js';

describe('Zero-Hallucination Integrity Gate Service Unit Tests (P5-006)', () => {
  let service;
  let tenantId;
  let candidateId;
  let resourceId;
  let projectId;
  let context;

  beforeEach(() => {
    service = new ZeroHallucinationIntegrityService();
    tenantId = crypto.randomUUID();
    candidateId = crypto.randomUUID();
    resourceId = crypto.randomUUID();
    projectId = crypto.randomUUID();
    context = { tenantId };
  });

  const createSampleEvidenceItem = (overrides = {}) => ({
    id: overrides.id || crypto.randomUUID(),
    tenantId: overrides.tenantId || tenantId,
    candidateId: overrides.candidateId || candidateId,
    resourceId: overrides.resourceId || resourceId,
    projectId: overrides.projectId || projectId,
    skillId: overrides.skillId || crypto.randomUUID(),
    evidenceType: overrides.evidenceType || 'PACKAGE_MANIFEST_DEPENDENCY',
    sourceProvider: overrides.sourceProvider || 'GITHUB_APP',
    sourceLocation: {
      filePath: overrides.filePath || 'package.json',
      commitSha: overrides.commitSha || 'a'.repeat(40),
      lineRange: { start: 1, end: 20 },
    },
    excerpt: overrides.excerpt || '"dependencies": { "pg": "^8.11.0" }',
    confidenceScore: overrides.confidenceScore ?? 1.0,
    metadata: overrides.metadata || { skillSlug: 'postgresql' },
  });

  const createSampleEvidenceRef = (evidenceItem, overrides = {}) => ({
    id: evidenceItem.id,
    resourceId: evidenceItem.resourceId,
    resourceName: overrides.resourceName || 'owner/backend-repo',
    evidenceType: evidenceItem.evidenceType,
    filePath: evidenceItem.sourceLocation.filePath,
    commitSha: evidenceItem.sourceLocation.commitSha,
    lineRange: evidenceItem.sourceLocation.lineRange,
    excerpt: evidenceItem.excerpt,
    confidenceScore: evidenceItem.confidenceScore,
  });

  // -------------------------------------------------------------------------
  // 1. Valid Assertions & Status Verification
  // -------------------------------------------------------------------------

  it('1. verifies valid VERIFIED assertion with authentic commit-pinned evidence', () => {
    const evidenceItem = createSampleEvidenceItem();
    const evidenceRef = createSampleEvidenceRef(evidenceItem);
    const evidenceIndex = new Map([[evidenceItem.id, evidenceItem]]);

    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'SKILL',
      statement: 'Candidate is proficient with PostgreSQL database interactions',
      subjectSlug: 'postgresql',
      status: 'VERIFIED',
      confidenceScore: 0.95,
      evidenceRefs: [evidenceRef],
    };

    const summary = service.validateCareerAssertions(context, [assertion], evidenceIndex);

    assert.equal(summary.integrityStatus, 'PASS');
    assert.equal(summary.totalAssertions, 1);
    assert.equal(summary.verifiedCount, 1);
    assert.equal(summary.blockedCount, 0);

    const audited = summary.assertions[0];
    assert.equal(audited.status, 'VERIFIED');
    assert.equal(audited.auditReasonCode, 'VALID_EVIDENCE');
    assert.equal(audited.evidenceRefs.length, 1);
    assert.equal(audited.evidenceRefs[0].id, evidenceItem.id);
  });

  it('2. verifies valid INFERRED assertion derived via taxonomy or adjacent evidence', () => {
    const evidenceItem = createSampleEvidenceItem({
      metadata: { skillSlug: 'next-js' },
      filePath: 'package.json',
      excerpt: '"next": "14.0.0"',
    });
    const evidenceRef = createSampleEvidenceRef(evidenceItem);
    const evidenceIndex = new Map([[evidenceItem.id, evidenceItem]]);

    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'SKILL',
      statement: 'Candidate has React experience inferred from Next.js usage',
      subjectSlug: 'react',
      status: 'INFERRED',
      confidenceScore: 0.8,
      evidenceRefs: [evidenceRef],
    };

    const summary = service.validateCareerAssertions(context, [assertion], evidenceIndex);

    assert.equal(summary.integrityStatus, 'PARTIAL');
    assert.equal(summary.inferredCount, 1);

    const audited = summary.assertions[0];
    assert.equal(audited.status, 'INFERRED');
    assert.equal(audited.auditReasonCode, 'VALID_INFERENCE');
    assert.equal(audited.confidenceScore, 0.75);
  });

  it('3. verifies valid CLAIMED assertion retains [Unverified User Claim] label', () => {
    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'SKILL',
      statement: 'Kafka streaming distributed architecture',
      subjectSlug: 'apache-kafka',
      status: 'CLAIMED',
      confidenceScore: 0.5,
      evidenceRefs: [],
      claimLabel: '[Unverified User Claim]',
    };

    const summary = service.validateCareerAssertions(context, [assertion], new Map());

    assert.equal(summary.integrityStatus, 'PARTIAL');
    assert.equal(summary.claimedCount, 1);

    const audited = summary.assertions[0];
    assert.equal(audited.status, 'CLAIMED');
    assert.equal(audited.claimLabel, '[Unverified User Claim]');
    assert.equal(audited.auditReasonCode, 'LABELED_USER_CLAIM');
    assert.equal(audited.confidenceScore, 0.25);
  });

  it('4. structures zero-evidence queries as MISSING_EVIDENCE and never as verified truth', () => {
    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'SKILL',
      statement: 'Kubernetes cluster deployment experience',
      subjectSlug: 'kubernetes',
      status: 'MISSING_EVIDENCE',
      confidenceScore: 0.0,
      evidenceRefs: [],
    };

    const summary = service.validateCareerAssertions(context, [assertion], new Map());

    assert.equal(summary.integrityStatus, 'PARTIAL');
    assert.equal(summary.missingCount, 1);

    const audited = summary.assertions[0];
    assert.equal(audited.status, 'MISSING_EVIDENCE');
    assert.equal(audited.auditReasonCode, 'MISSING_EVIDENCE');
    assert.equal(audited.confidenceScore, 0.0);
  });

  it('5. handles UNKNOWN criteria neutrally', () => {
    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'DOMAIN',
      statement: 'Cultural fit and remote collaboration style',
      status: 'UNKNOWN',
      confidenceScore: 0.5,
      evidenceRefs: [],
    };

    const summary = service.validateCareerAssertions(context, [assertion], new Map());

    const audited = summary.assertions[0];
    assert.equal(audited.status, 'UNKNOWN');
    assert.equal(audited.auditReasonCode, 'UNKNOWN');
  });

  // -------------------------------------------------------------------------
  // 2. Evidence Reference & Provenance Integrity Guards
  // -------------------------------------------------------------------------

  it('6. blocks assertion citing non-existent EvidenceId (INVALID_EVIDENCE_ID)', () => {
    const fakeEvidenceId = crypto.randomUUID();
    const fakeRef = {
      id: fakeEvidenceId,
      resourceId,
      resourceName: 'owner/fake-repo',
      evidenceType: 'CODE_USAGE',
      filePath: 'src/main.js',
      commitSha: 'b'.repeat(40),
    };

    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'SKILL',
      statement: 'Go microservice concurrency',
      subjectSlug: 'go',
      status: 'VERIFIED',
      confidenceScore: 1.0,
      evidenceRefs: [fakeRef],
    };

    const summary = service.validateCareerAssertions(context, [assertion], new Map());

    assert.equal(summary.integrityStatus, 'BLOCKED');
    assert.equal(summary.blockedCount, 1);
    assert.equal(summary.assertions[0].auditReasonCode, 'INVALID_EVIDENCE_ID');
    assert.ok(summary.blockedReasons[0].includes(fakeEvidenceId));
  });

  it('7. blocks assertion citing cross-tenant evidence (TENANT_MISMATCH)', () => {
    const foreignTenantId = crypto.randomUUID();
    const evidenceItem = createSampleEvidenceItem({ tenantId: foreignTenantId });
    const evidenceRef = createSampleEvidenceRef(evidenceItem);
    const evidenceIndex = new Map([[evidenceItem.id, evidenceItem]]);

    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId, // Trusted context tenant
      candidateId,
      assertionType: 'SKILL',
      statement: 'Cross-tenant leak test',
      status: 'VERIFIED',
      confidenceScore: 1.0,
      evidenceRefs: [evidenceRef],
    };

    const summary = service.validateCareerAssertions(context, [assertion], evidenceIndex);

    assert.equal(summary.integrityStatus, 'BLOCKED');
    assert.equal(summary.blockedCount, 1);
    assert.equal(summary.assertions[0].auditReasonCode, 'TENANT_MISMATCH');
  });

  it('8. blocks assertion citing evidence belonging to a different candidate (CANDIDATE_MISMATCH)', () => {
    const foreignCandidateId = crypto.randomUUID();
    const evidenceItem = createSampleEvidenceItem({ candidateId: foreignCandidateId });
    const evidenceRef = createSampleEvidenceRef(evidenceItem);
    const evidenceIndex = new Map([[evidenceItem.id, evidenceItem]]);

    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId,
      candidateId, // Target candidate A
      assertionType: 'SKILL',
      statement: 'Candidate impersonation test',
      status: 'VERIFIED',
      confidenceScore: 1.0,
      evidenceRefs: [evidenceRef],
    };

    const summary = service.validateCareerAssertions(context, [assertion], evidenceIndex);

    assert.equal(summary.integrityStatus, 'BLOCKED');
    assert.equal(summary.assertions[0].auditReasonCode, 'CANDIDATE_MISMATCH');
  });

  it('9. blocks assertion with tampered commitSha provenance (PROVENANCE_MISMATCH)', () => {
    const evidenceItem = createSampleEvidenceItem({ commitSha: '1'.repeat(40) });
    const tamperedRef = createSampleEvidenceRef(evidenceItem, {});
    tamperedRef.commitSha = '2'.repeat(40); // Tampered SHA!

    const evidenceIndex = new Map([[evidenceItem.id, evidenceItem]]);

    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'SKILL',
      statement: 'SHA tampering test',
      status: 'VERIFIED',
      confidenceScore: 1.0,
      evidenceRefs: [tamperedRef],
    };

    const summary = service.validateCareerAssertions(context, [assertion], evidenceIndex);

    assert.equal(summary.integrityStatus, 'BLOCKED');
    assert.equal(summary.assertions[0].auditReasonCode, 'PROVENANCE_MISMATCH');
  });

  it('10. blocks assertion with tampered filePath provenance (PROVENANCE_MISMATCH)', () => {
    const evidenceItem = createSampleEvidenceItem({ filePath: 'src/real.js' });
    const tamperedRef = createSampleEvidenceRef(evidenceItem);
    tamperedRef.filePath = 'src/fake.js'; // Tampered file path!

    const evidenceIndex = new Map([[evidenceItem.id, evidenceItem]]);

    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'SKILL',
      statement: 'File path tampering test',
      status: 'VERIFIED',
      confidenceScore: 1.0,
      evidenceRefs: [tamperedRef],
    };

    const summary = service.validateCareerAssertions(context, [assertion], evidenceIndex);

    assert.equal(summary.integrityStatus, 'BLOCKED');
    assert.equal(summary.assertions[0].auditReasonCode, 'PROVENANCE_MISMATCH');
  });

  // -------------------------------------------------------------------------
  // 3. Anti-Hallucination Specific Guards
  // -------------------------------------------------------------------------

  it('11. blocks unsupported employment tenure assertion derived only from commit activity (UNSUPPORTED_TENURE)', () => {
    const evidenceItem = createSampleEvidenceItem({
      evidenceType: 'COMMIT_CONTRIBUTION',
    });
    const evidenceRef = createSampleEvidenceRef(evidenceItem);
    const evidenceIndex = new Map([[evidenceItem.id, evidenceItem]]);

    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'EXPERIENCE',
      statement: 'Candidate has 5 years of professional Python engineering experience at Acme Corp',
      status: 'VERIFIED',
      confidenceScore: 1.0,
      evidenceRefs: [evidenceRef],
    };

    const summary = service.validateCareerAssertions(context, [assertion], evidenceIndex, {
      candidateProfile: { experience: [] }, // No corporate work history!
    });

    assert.equal(summary.integrityStatus, 'BLOCKED');
    assert.equal(summary.assertions[0].auditReasonCode, 'UNSUPPORTED_TENURE');
  });

  it('12. blocks ungrounded quantitative achievement assertions (UNSUPPORTED_ACHIEVEMENT)', () => {
    const evidenceItem = createSampleEvidenceItem({
      evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
    });
    const evidenceRef = createSampleEvidenceRef(evidenceItem);
    const evidenceIndex = new Map([[evidenceItem.id, evidenceItem]]);

    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'ACHIEVEMENT',
      statement: 'Reduced query latency by 70% and served 10 million users daily',
      status: 'VERIFIED',
      confidenceScore: 1.0,
      evidenceRefs: [evidenceRef],
    };

    const summary = service.validateCareerAssertions(context, [assertion], evidenceIndex);

    assert.equal(summary.integrityStatus, 'BLOCKED');
    assert.equal(summary.assertions[0].auditReasonCode, 'UNSUPPORTED_ACHIEVEMENT');
  });

  it('13. safely downgrades VERIFIED assertion with 0 evidence to MISSING_EVIDENCE', () => {
    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'SKILL',
      statement: 'Candidate has deep expertise in Rust systems programming',
      subjectSlug: 'rust',
      status: 'VERIFIED', // Claims VERIFIED without evidence!
      confidenceScore: 1.0,
      evidenceRefs: [],
    };

    const summary = service.validateCareerAssertions(context, [assertion], new Map());

    assert.equal(summary.integrityStatus, 'PARTIAL');
    assert.equal(summary.missingCount, 1);

    const audited = summary.assertions[0];
    assert.equal(audited.status, 'MISSING_EVIDENCE');
    assert.equal(audited.auditReasonCode, 'MISSING_EVIDENCE');
  });

  it('14. downgrades SKILL to INFERRED when evidence only demonstrates parent framework (Next.js -> React)', () => {
    const evidenceItem = createSampleEvidenceItem({
      metadata: { skillSlug: 'next-js' },
      filePath: 'package.json',
      excerpt: '"next": "^14.0.0"',
    });
    const evidenceRef = createSampleEvidenceRef(evidenceItem);
    const evidenceIndex = new Map([[evidenceItem.id, evidenceItem]]);

    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'SKILL',
      statement: 'Candidate has React expertise',
      subjectSlug: 'react', // Stated as React, backed by Next.js
      status: 'VERIFIED',
      confidenceScore: 1.0,
      evidenceRefs: [evidenceRef],
    };

    const summary = service.validateCareerAssertions(context, [assertion], evidenceIndex);

    const audited = summary.assertions[0];
    assert.equal(audited.status, 'INFERRED');
    assert.equal(audited.auditReasonCode, 'VALID_INFERENCE');
    assert.equal(audited.confidenceScore, 0.75);
  });

  // -------------------------------------------------------------------------
  // 4. Evidence Reference Deduplication, Sorting, and Capping
  // -------------------------------------------------------------------------

  it('15. deduplicates duplicate EvidenceRefs with identical EvidenceId', () => {
    const evidenceItem = createSampleEvidenceItem();
    const evidenceRef1 = createSampleEvidenceRef(evidenceItem);
    const evidenceRef2 = createSampleEvidenceRef(evidenceItem);
    const evidenceIndex = new Map([[evidenceItem.id, evidenceItem]]);

    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'PROJECT',
      statement: 'Distributed PostgreSQL database project',
      status: 'VERIFIED',
      confidenceScore: 1.0,
      evidenceRefs: [evidenceRef1, evidenceRef2],
    };

    const summary = service.validateCareerAssertions(context, [assertion], evidenceIndex);

    assert.equal(summary.assertions[0].evidenceRefs.length, 1);
  });

  it('16. deterministically sorts evidence refs by quality weight and caps at 5', () => {
    const items = [
      createSampleEvidenceItem({
        id: '00000000-0000-0000-0000-000000000001',
        evidenceType: 'README_SPECIFICATION',
      }),
      createSampleEvidenceItem({
        id: '00000000-0000-0000-0000-000000000002',
        evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
      }),
      createSampleEvidenceItem({
        id: '00000000-0000-0000-0000-000000000003',
        evidenceType: 'CODE_IMPORT_USAGE',
      }),
      createSampleEvidenceItem({
        id: '00000000-0000-0000-0000-000000000004',
        evidenceType: 'CONFIG_SYNTAX_DECLARATION',
      }),
      createSampleEvidenceItem({
        id: '00000000-0000-0000-0000-000000000005',
        evidenceType: 'COMMIT_CONTRIBUTION',
      }),
      createSampleEvidenceItem({
        id: '00000000-0000-0000-0000-000000000006',
        evidenceType: 'FILE_PATTERN_MATCH',
      }),
      createSampleEvidenceItem({
        id: '00000000-0000-0000-0000-000000000007',
        evidenceType: 'DOCUMENT_CLAIM',
      }),
    ];

    const evidenceIndex = new Map(items.map((i) => [i.id, i]));
    const refs = items.map((i) => createSampleEvidenceRef(i));

    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'PROJECT',
      statement: 'Multi-evidence project test',
      status: 'VERIFIED',
      confidenceScore: 1.0,
      evidenceRefs: refs,
    };

    const summary = service.validateCareerAssertions(context, [assertion], evidenceIndex);
    const auditedRefs = summary.assertions[0].evidenceRefs;

    // Capped at 5
    assert.equal(auditedRefs.length, 5);
    // Highest quality weight first: PACKAGE_MANIFEST_DEPENDENCY (1.00)
    assert.equal(auditedRefs[0].evidenceType, 'PACKAGE_MANIFEST_DEPENDENCY');
    // Second: CODE_IMPORT_USAGE (0.95)
    assert.equal(auditedRefs[1].evidenceType, 'CODE_IMPORT_USAGE');
    // Third: CONFIG_SYNTAX_DECLARATION (0.85)
    assert.equal(auditedRefs[2].evidenceType, 'CONFIG_SYNTAX_DECLARATION');
    // Fourth: COMMIT_CONTRIBUTION (0.75)
    assert.equal(auditedRefs[3].evidenceType, 'COMMIT_CONTRIBUTION');
    // Fifth: FILE_PATTERN_MATCH (0.65)
    assert.equal(auditedRefs[4].evidenceType, 'FILE_PATTERN_MATCH');
  });

  // -------------------------------------------------------------------------
  // 5. Overall Summary Integrity & Determinism
  // -------------------------------------------------------------------------

  it('17. enforces overall PASS status when all assertions are verified', () => {
    const item1 = createSampleEvidenceItem();
    const item2 = createSampleEvidenceItem();
    const evidenceIndex = new Map([
      [item1.id, item1],
      [item2.id, item2],
    ]);

    const assertions = [
      {
        assertionId: crypto.randomUUID(),
        tenantId,
        candidateId,
        assertionType: 'SKILL',
        statement: 'Skill 1',
        status: 'VERIFIED',
        confidenceScore: 1.0,
        evidenceRefs: [createSampleEvidenceRef(item1)],
      },
      {
        assertionId: crypto.randomUUID(),
        tenantId,
        candidateId,
        assertionType: 'PROJECT',
        statement: 'Project 1',
        status: 'VERIFIED',
        confidenceScore: 1.0,
        evidenceRefs: [createSampleEvidenceRef(item2)],
      },
    ];

    const summary = service.validateCareerAssertions(context, assertions, evidenceIndex);

    assert.equal(summary.integrityStatus, 'PASS');
    assert.equal(summary.verifiedCount, 2);
    assert.equal(summary.blockedCount, 0);
  });

  it('18. enforces overall PARTIAL status when unverified claims or inferences are mixed with verified facts', () => {
    const item1 = createSampleEvidenceItem();
    const evidenceIndex = new Map([[item1.id, item1]]);

    const assertions = [
      {
        assertionId: crypto.randomUUID(),
        tenantId,
        candidateId,
        assertionType: 'SKILL',
        statement: 'Verified Skill',
        status: 'VERIFIED',
        confidenceScore: 1.0,
        evidenceRefs: [createSampleEvidenceRef(item1)],
      },
      {
        assertionId: crypto.randomUUID(),
        tenantId,
        candidateId,
        assertionType: 'SKILL',
        statement: 'Manual Claim',
        status: 'CLAIMED',
        confidenceScore: 0.5,
        claimLabel: '[Unverified User Claim]',
        evidenceRefs: [],
      },
    ];

    const summary = service.validateCareerAssertions(context, assertions, evidenceIndex);

    assert.equal(summary.integrityStatus, 'PARTIAL');
    assert.equal(summary.verifiedCount, 1);
    assert.equal(summary.claimedCount, 1);
    assert.equal(summary.blockedCount, 0);
  });

  it('19. rejects assertion with mismatched tenant in context with ValidationError', () => {
    assert.throws(() => service.validateCareerAssertions(null, [], new Map()), ValidationError);
    assert.throws(() => service.validateCareerAssertions({}, [], new Map()), ValidationError);
  });

  it('20. guarantees bit-for-bit determinism across 100 consecutive executions', () => {
    const item = createSampleEvidenceItem();
    const evidenceIndex = new Map([[item.id, item]]);
    const summaryId = crypto.randomUUID();
    const evaluatedAt = '2026-08-22T12:00:00.000Z';

    const assertions = [
      {
        assertionId: crypto.randomUUID(),
        tenantId,
        candidateId,
        assertionType: 'SKILL',
        statement: 'Deterministic Test Skill',
        status: 'VERIFIED',
        confidenceScore: 0.95,
        evidenceRefs: [createSampleEvidenceRef(item)],
      },
    ];

    const baseline = JSON.stringify(
      service.validateCareerAssertions(context, assertions, evidenceIndex, {
        summaryId,
        evaluatedAt,
      })
    );

    for (let i = 0; i < 100; i++) {
      const run = JSON.stringify(
        service.validateCareerAssertions(context, assertions, evidenceIndex, {
          summaryId,
          evaluatedAt,
        })
      );
      assert.equal(run, baseline);
    }
  });

  it('21. blocks assertion citing evidence with mismatched resourceId (RESOURCE_MISMATCH)', () => {
    const evidenceItem = createSampleEvidenceItem({ resourceId: crypto.randomUUID() });
    const evidenceRef = createSampleEvidenceRef(evidenceItem, {});
    evidenceRef.resourceId = crypto.randomUUID(); // Different resource!

    const evidenceIndex = new Map([[evidenceItem.id, evidenceItem]]);

    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'PROJECT',
      statement: 'Resource mismatch test',
      status: 'VERIFIED',
      confidenceScore: 1.0,
      evidenceRefs: [evidenceRef],
    };

    const summary = service.validateCareerAssertions(context, [assertion], evidenceIndex);

    assert.equal(summary.integrityStatus, 'BLOCKED');
    assert.equal(summary.assertions[0].auditReasonCode, 'RESOURCE_MISMATCH');
  });

  it('22. blocks assertion citing evidence with mismatched projectId (PROJECT_MISMATCH)', () => {
    const evidenceItem = createSampleEvidenceItem({ projectId: crypto.randomUUID() });
    const evidenceRef = createSampleEvidenceRef(evidenceItem);
    const evidenceIndex = new Map([[evidenceItem.id, evidenceItem]]);

    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'PROJECT',
      statement: 'Project mismatch test',
      status: 'VERIFIED',
      confidenceScore: 1.0,
      evidenceRefs: [evidenceRef],
      metadata: { projectId: crypto.randomUUID() }, // Different project than stored!
    };

    const summary = service.validateCareerAssertions(context, [assertion], evidenceIndex);

    assert.equal(summary.integrityStatus, 'BLOCKED');
    assert.equal(summary.assertions[0].auditReasonCode, 'PROJECT_MISMATCH');
  });

  it('23. blocks assertion if assertion.tenantId does not match context.tenantId (TENANT_MISMATCH)', () => {
    const foreignTenantId = crypto.randomUUID();
    const item = createSampleEvidenceItem();
    const evidenceIndex = new Map([[item.id, item]]);

    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId: foreignTenantId, // Mismatched tenant
      candidateId,
      assertionType: 'SKILL',
      statement: 'Foreign tenant assertion',
      status: 'VERIFIED',
      confidenceScore: 1.0,
      evidenceRefs: [createSampleEvidenceRef(item)],
    };

    const summary = service.validateCareerAssertions(context, [assertion], evidenceIndex);

    assert.equal(summary.integrityStatus, 'BLOCKED');
    assert.equal(summary.assertions[0].auditReasonCode, 'TENANT_MISMATCH');
  });

  it('24. verifies SUMMARY assertion safety against underlying audited statements', () => {
    const item = createSampleEvidenceItem();
    const evidenceIndex = new Map([[item.id, item]]);

    const summaryAssertion = {
      assertionId: crypto.randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'SUMMARY',
      statement: 'Candidate demonstrates strong full-stack PostgreSQL engineering capability',
      status: 'VERIFIED',
      confidenceScore: 0.9,
      evidenceRefs: [createSampleEvidenceRef(item)],
      childAssertionIds: [crypto.randomUUID()],
    };

    const summary = service.validateCareerAssertions(context, [summaryAssertion], evidenceIndex);

    assert.equal(summary.integrityStatus, 'PASS');
    assert.equal(summary.assertions[0].assertionType, 'SUMMARY');
    assert.equal(summary.assertions[0].auditReasonCode, 'VALID_EVIDENCE');
  });

  it('25. retains [Unverified User Claim] label even when prose contains authoritative language', () => {
    const assertion = {
      assertionId: crypto.randomUUID(),
      tenantId,
      candidateId,
      assertionType: 'SKILL',
      statement: 'World-renowned expert and authority in distributed consensus algorithms',
      subjectSlug: 'raft',
      status: 'CLAIMED',
      confidenceScore: 0.9,
      evidenceRefs: [],
    };

    const summary = service.validateCareerAssertions(context, [assertion], new Map());

    const audited = summary.assertions[0];
    assert.equal(audited.status, 'CLAIMED');
    assert.equal(audited.claimLabel, '[Unverified User Claim]');
    assert.equal(audited.auditReasonCode, 'LABELED_USER_CLAIM');
    assert.equal(audited.confidenceScore, 0.25);
  });

  it('26. buildEvidenceIndex accepts Map, Array, or Object formats seamlessly', () => {
    const item = createSampleEvidenceItem();

    // Map input
    const mapInput = new Map([[item.id, item]]);
    assert.equal(service.buildEvidenceIndex(mapInput).size, 1);

    // Array input
    const arrayInput = [item];
    assert.equal(service.buildEvidenceIndex(arrayInput).size, 1);
    assert.equal(service.buildEvidenceIndex(arrayInput).get(item.id).id, item.id);

    // Object input
    const objectInput = { [item.id]: item };
    assert.equal(service.buildEvidenceIndex(objectInput).size, 1);

    // Null/undefined input
    assert.equal(service.buildEvidenceIndex(null).size, 0);
    assert.equal(service.buildEvidenceIndex(undefined).size, 0);
  });
});
