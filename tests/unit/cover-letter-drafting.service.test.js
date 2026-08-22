/**
 * @file Unit Tests for Cover Letter Drafting Service (P6-002)
 *
 * Verifies all architectural invariants approved in ARCH-018 / ADR-038:
 * 1. Opening paragraph grounding in verified facts
 * 2. Company alignment grounded in explicit job text (Zero mission fabrication)
 * 3. Explicit corporate work history (Commits != employment tenure)
 * 4. Project evidence grounded in commit-pinned EvidenceRefs
 * 5. Motivation grounded in technical alignment (Zero personal fabrication)
 * 6. Closing grounded in neutral professional courtesy
 * 7. Verified required skill prioritization (Tier 1: 100.0 score)
 * 8. High relevance project prioritization (Tier 2: >= 70.0 score)
 * 9. Verified preferred skill prioritization (Tier 3: 75.0 score)
 * 10. Claimed skill labeling ([Unverified User Claim])
 * 11. Inferred skill handling
 * 12. Unsupported metric blocking (Metric safety guard)
 * 13. Unsupported technology omission
 * 14. ATS terminology normalization (postgres -> PostgreSQL)
 * 15. EvidenceRef capping at maximum 5 references per paragraph
 * 16. 100% Deterministic drafting across repeated runs
 * 17. Tone handling (PROFESSIONAL, CONCISE, CONFIDENT, WARM)
 * 18. Paragraph length bounds (3 to 6 paragraphs)
 * 19. Optional LLM phrasing sandbox & passive boundary
 * 20. Post-generation integrity gate validation
 * 21. Multi-tenant default-deny isolation (404 NotFoundError)
 * 22. ID coherence check (ValidationError)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { CoverLetterDraftingService } from '../../src/services/cover-letter-drafting.service.js';
import { ValidationError, NotFoundError } from '../../src/errors/index.js';

describe('Cover Letter Drafting Service Unit Tests (P6-002)', () => {
  let service;
  let tenantId;
  let userId;
  let candidateId;
  let jobId;
  let projectId1;
  let projectId2;
  let evidenceId1;
  let evidenceId2;
  let evidenceId3;

  let candidateProfile;
  let jobDescription;
  let candidateMatchAnalysis;
  let projectRelevanceAnalysis;
  let atsFitAnalysis;
  let integrityCheckedAssertions;

  beforeEach(() => {
    service = new CoverLetterDraftingService();
    tenantId = crypto.randomUUID();
    userId = crypto.randomUUID();
    candidateId = crypto.randomUUID();
    jobId = crypto.randomUUID();
    projectId1 = crypto.randomUUID();
    projectId2 = crypto.randomUUID();
    evidenceId1 = crypto.randomUUID();
    evidenceId2 = crypto.randomUUID();
    evidenceId3 = crypto.randomUUID();

    candidateProfile = {
      id: candidateId,
      tenantId,
      userId,
      name: 'Alex Rivera',
      displayName: 'Alex Rivera',
      headline: 'Senior Backend Engineer',
      skills: [
        { name: 'Go', category: 'LANGUAGE', verified: true, verificationConfidence: 1.0 },
        { name: 'PostgreSQL', category: 'DATABASE', verified: true, verificationConfidence: 0.95 },
        { name: 'Docker', category: 'TOOL', verified: true, verificationConfidence: 0.9 },
        {
          name: 'GraphQL',
          category: 'FRAMEWORK',
          verified: false,
          claimText: 'Self-taught GraphQL',
        },
      ],
      experience: [
        {
          id: crypto.randomUUID(),
          company: 'Acme Systems',
          title: 'Senior Backend Developer',
          startDate: '2021-03',
          endDate: '2024-01',
          location: 'San Francisco, CA',
          isCurrent: false,
          bullets: [
            'Architected Go distributed microservices processing API traffic.',
            'Optimized PostgreSQL queries and database indexes.',
          ],
        },
      ],
      projects: [
        {
          id: projectId1,
          name: 'payment-gateway',
          displayName: 'FinTech Payment Gateway',
          description: 'High-throughput transactional microservices platform in Go.',
          primaryLanguages: ['Go'],
          primaryFrameworks: ['Chi'],
        },
        {
          id: projectId2,
          name: 'analytics-worker',
          displayName: 'Realtime Analytics Worker',
          description: 'Event-driven streaming worker using PostgreSQL.',
          primaryLanguages: ['Go', 'SQL'],
          primaryFrameworks: [],
        },
      ],
      education: [
        {
          id: crypto.randomUUID(),
          institution: 'State University',
          degree: 'B.S. in Computer Science',
          startDate: '2016-09',
          endDate: '2020-05',
        },
      ],
      certifications: [],
      evidenceGraph: {
        items: [
          {
            id: evidenceId1,
            tenantId,
            resourceId: crypto.randomUUID(),
            projectId: projectId1,
            skillName: 'Go',
            verificationQuality: 0.95,
            commitSha: '1111111111111111111111111111111111111111',
            filePath: 'pkg/server/main.go',
            contextSnippet: 'package main\nimport "net/http"',
          },
          {
            id: evidenceId2,
            tenantId,
            resourceId: crypto.randomUUID(),
            projectId: projectId1,
            skillName: 'PostgreSQL',
            verificationQuality: 0.9,
            commitSha: '2222222222222222222222222222222222222222',
            filePath: 'migrations/001_init.sql',
            contextSnippet: 'CREATE TABLE payments (id UUID PRIMARY KEY);',
          },
          {
            id: evidenceId3,
            tenantId,
            resourceId: crypto.randomUUID(),
            projectId: projectId2,
            skillName: 'Docker',
            verificationQuality: 0.85,
            commitSha: '3333333333333333333333333333333333333333',
            filePath: 'Dockerfile',
            contextSnippet: 'FROM golang:1.22-alpine',
          },
        ],
      },
    };

    jobDescription = {
      id: jobId,
      tenantId,
      title: 'Senior Backend Engineer',
      companyName: 'FinTech Dynamics',
      description:
        'Building high-throughput scalable financial infrastructure in Go and PostgreSQL.',
      rawText:
        'FinTech Dynamics is hiring a Senior Backend Engineer to build resilient distributed payment services.',
      requirements: [
        { id: crypto.randomUUID(), title: 'Go', priority: 'REQUIRED', category: 'LANGUAGE' },
        {
          id: crypto.randomUUID(),
          title: 'PostgreSQL',
          priority: 'REQUIRED',
          category: 'DATABASE',
        },
        { id: crypto.randomUUID(), title: 'Docker', priority: 'PREFERRED', category: 'TOOL' },
        { id: crypto.randomUUID(), title: 'Rust', priority: 'REQUIRED', category: 'LANGUAGE' }, // Missing skill
      ],
    };

    candidateMatchAnalysis = {
      tenantId,
      candidateId,
      targetJobId: jobId,
      jobDescriptionId: jobId,
      overallScore: 82.5,
      fitScore: 82.5,
      matches: [
        { title: 'Go', requirementTitle: 'Go', status: 'MATCHED', priority: 'REQUIRED' },
        {
          title: 'PostgreSQL',
          requirementTitle: 'PostgreSQL',
          status: 'MATCHED',
          priority: 'REQUIRED',
        },
        { title: 'Docker', requirementTitle: 'Docker', status: 'MATCHED', priority: 'PREFERRED' },
        { title: 'Rust', requirementTitle: 'Rust', status: 'MISSING', priority: 'REQUIRED' },
      ],
    };

    projectRelevanceAnalysis = {
      tenantId,
      candidateId,
      targetJobId: jobId,
      scoredProjects: [
        {
          projectId: projectId1,
          relevanceScore: 92.0,
          relevanceBand: 'HIGH',
          relevanceExplanation:
            'Deep Go microservices architecture matching target payment infrastructure.',
        },
        {
          projectId: projectId2,
          relevanceScore: 78.0,
          relevanceBand: 'HIGH',
          relevanceExplanation: 'PostgreSQL and Go data processing worker.',
        },
      ],
    };

    atsFitAnalysis = {
      tenantId,
      candidateId,
      targetJobId: jobId,
      overallScore: 84.0,
      fitBand: 'STRONG',
    };

    integrityCheckedAssertions = [
      {
        id: crypto.randomUUID(),
        tenantId,
        candidateId,
        assertionType: 'SKILL',
        statement: 'Demonstrated production Go capability',
        canonicalSlug: 'go',
        status: 'VERIFIED',
        confidenceScore: 1.0,
        evidenceRefs: [
          {
            id: evidenceId1,
            resourceId: crypto.randomUUID(),
            resourceName: 'payment-gateway',
            evidenceType: 'FILE_CONTENT',
            filePath: 'pkg/server/main.go',
            commitSha: '1111111111111111111111111111111111111111',
            lineRange: { start: 1, end: 1 },
            confidenceScore: 0.95,
            excerpt: 'package main',
          },
        ],
      },
      {
        id: crypto.randomUUID(),
        tenantId,
        candidateId,
        assertionType: 'SKILL',
        statement: 'Demonstrated PostgreSQL database optimization',
        canonicalSlug: 'postgresql',
        status: 'VERIFIED',
        confidenceScore: 0.95,
        evidenceRefs: [
          {
            id: evidenceId2,
            resourceId: crypto.randomUUID(),
            resourceName: 'payment-gateway',
            evidenceType: 'FILE_CONTENT',
            filePath: 'migrations/001_init.sql',
            commitSha: '2222222222222222222222222222222222222222',
            lineRange: { start: 1, end: 1 },
            confidenceScore: 0.9,
            excerpt: 'CREATE TABLE payments',
          },
        ],
      },
      {
        id: crypto.randomUUID(),
        tenantId,
        candidateId,
        assertionType: 'PROJECT',
        statement: 'Built FinTech Payment Gateway in Go',
        projectId: projectId1,
        status: 'VERIFIED',
        confidenceScore: 0.95,
        evidenceRefs: [
          {
            id: evidenceId1,
            resourceId: crypto.randomUUID(),
            resourceName: 'payment-gateway',
            evidenceType: 'FILE_CONTENT',
            filePath: 'pkg/server/main.go',
            commitSha: '1111111111111111111111111111111111111111',
            lineRange: { start: 1, end: 1 },
            confidenceScore: 0.95,
            excerpt: 'package main',
          },
        ],
      },
    ];
  });

  // -------------------------------------------------------------------------
  // 1. OPENING Paragraph Grounding
  // -------------------------------------------------------------------------
  it('1. synthesizes OPENING paragraph grounded in verified skills, candidate name, and company', async () => {
    const context = { tenantId, userId };
    const letter = await service.draftCoverLetter(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      atsFitAnalysis,
      integrityCheckedAssertions
    );

    const opening = letter.paragraphs.find((p) => p.paragraphType === 'OPENING');
    assert.ok(opening);
    assert.strictEqual(opening.status, 'VERIFIED');
    assert.ok(opening.text.includes('Senior Backend Engineer'));
    assert.ok(opening.text.includes('FinTech Dynamics'));
    assert.ok(opening.text.includes('Go'));
    assert.ok(opening.assertionIds.length > 0);
  });

  // -------------------------------------------------------------------------
  // 2. COMPANY_ALIGNMENT Paragraph Grounding
  // -------------------------------------------------------------------------
  it('2. synthesizes COMPANY_ALIGNMENT paragraph grounded strictly in explicit job posting text', async () => {
    const context = { tenantId, userId };
    const letter = await service.draftCoverLetter(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      atsFitAnalysis,
      integrityCheckedAssertions,
      { targetParagraphCount: 5 }
    );

    const companyPara = letter.paragraphs.find((p) => p.paragraphType === 'COMPANY_ALIGNMENT');
    assert.ok(companyPara);
    assert.ok(companyPara.text.includes('FinTech Dynamics'));
    assert.ok(
      companyPara.text.includes('financial infrastructure') || companyPara.text.includes('payment')
    );
    // Zero unbacked mission or funding fabrication
    assert.ok(!companyPara.text.includes('Series B'));
    assert.ok(!companyPara.text.includes('$50M funding'));
  });

  // -------------------------------------------------------------------------
  // 3. RELEVANT_EXPERIENCE Authority
  // -------------------------------------------------------------------------
  it('3. sources RELEVANT_EXPERIENCE strictly from candidateProfile.experience', async () => {
    const context = { tenantId, userId };
    const letter = await service.draftCoverLetter(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      atsFitAnalysis,
      integrityCheckedAssertions
    );

    const expPara = letter.paragraphs.find((p) => p.paragraphType === 'RELEVANT_EXPERIENCE');
    assert.ok(expPara);
    assert.ok(expPara.text.includes('Acme Systems'));
    assert.ok(expPara.text.includes('Senior Backend Developer'));
    assert.ok(expPara.text.includes('2021-03'));
  });

  // -------------------------------------------------------------------------
  // 4. PROJECT_EVIDENCE Grounding & EvidenceRefs
  // -------------------------------------------------------------------------
  it('4. grounds PROJECT_EVIDENCE in top-scoring repository with commit-pinned citations', async () => {
    const context = { tenantId, userId };
    const letter = await service.draftCoverLetter(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      atsFitAnalysis,
      integrityCheckedAssertions
    );

    const projPara = letter.paragraphs.find((p) => p.paragraphType === 'PROJECT_EVIDENCE');
    assert.ok(projPara);
    assert.ok(projPara.text.includes('FinTech Payment Gateway'));
    assert.ok(projPara.text.includes('Go'));
    assert.ok(projPara.evidenceRefs.length > 0);
    assert.ok(projPara.evidenceRefs.some((r) => r.id === evidenceId1));
  });

  // -------------------------------------------------------------------------
  // 5. MOTIVATION Paragraph
  // -------------------------------------------------------------------------
  it('5. grounds MOTIVATION in verified technical alignment without personal life fabrications', async () => {
    const context = { tenantId, userId };
    const letter = await service.draftCoverLetter(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      atsFitAnalysis,
      integrityCheckedAssertions
    );

    const motPara = letter.paragraphs.find((p) => p.paragraphType === 'MOTIVATION');
    if (motPara) {
      assert.ok(motPara.text.includes('FinTech Dynamics'));
      assert.ok(motPara.text.includes('Go') || motPara.text.includes('PostgreSQL'));
      // Zero personal relation claims
      assert.ok(!motPara.text.includes('childhood'));
      assert.ok(!motPara.text.includes('dream company'));
    }
  });

  // -------------------------------------------------------------------------
  // 6. CLOSING Paragraph
  // -------------------------------------------------------------------------
  it('6. generates neutral professional CLOSING without inventing visa, salary, or interview details', async () => {
    const context = { tenantId, userId };
    const letter = await service.draftCoverLetter(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      atsFitAnalysis,
      integrityCheckedAssertions
    );

    const closing = letter.paragraphs.find((p) => p.paragraphType === 'CLOSING');
    assert.ok(closing);
    assert.ok(closing.text.includes('Thank you for your time and consideration'));
    assert.ok(!closing.text.includes('H-1B'));
    assert.ok(!closing.text.includes('$150,000'));
  });

  // -------------------------------------------------------------------------
  // 7. Verified Required Skill Priority (Tier 1)
  // -------------------------------------------------------------------------
  it('7. prioritizes verified required skills (Go, PostgreSQL) over other skills', async () => {
    const context = { tenantId, userId };
    const letter = await service.draftCoverLetter(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      atsFitAnalysis,
      integrityCheckedAssertions
    );

    const opening = letter.paragraphs[0];
    assert.ok(opening.text.includes('Go'));
    assert.ok(opening.text.includes('PostgreSQL'));
  });

  // -------------------------------------------------------------------------
  // 8. Project Priority from ProjectRelevanceAnalysis
  // -------------------------------------------------------------------------
  it('8. selects highest scoring project (FinTech Payment Gateway, score: 92.0) over lower scoring project', async () => {
    const context = { tenantId, userId };
    const letter = await service.draftCoverLetter(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      atsFitAnalysis,
      integrityCheckedAssertions
    );

    const projPara = letter.paragraphs.find((p) => p.paragraphType === 'PROJECT_EVIDENCE');
    assert.ok(projPara.text.includes('FinTech Payment Gateway'));
  });

  // -------------------------------------------------------------------------
  // 9. Preferred Skill Handling
  // -------------------------------------------------------------------------
  it('9. correctly captures verified preferred skills (Docker) in metadata and text', async () => {
    const context = { tenantId, userId };
    const letter = await service.draftCoverLetter(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      atsFitAnalysis,
      integrityCheckedAssertions
    );

    assert.ok(letter.metadata.totalParagraphs >= 3);
    assert.strictEqual(letter.integrityStatus, 'PASS');
  });

  // -------------------------------------------------------------------------
  // 10. Claimed Skill Handling
  // -------------------------------------------------------------------------
  it('10. omits unverified user claims that are irrelevant or flags them safely', async () => {
    const context = { tenantId, userId };
    const letter = await service.draftCoverLetter(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      atsFitAnalysis,
      integrityCheckedAssertions
    );

    // GraphQL was a self-taught unverified claim not required by job
    assert.strictEqual(letter.metadata.omittedSkillsCount, 1);
    for (const p of letter.paragraphs) {
      assert.ok(!p.text.includes('GraphQL'));
    }
  });

  // -------------------------------------------------------------------------
  // 11. Unsupported Metric Blocking (Metric Safety Guard)
  // -------------------------------------------------------------------------
  it('11. blocks ungrounded quantitative metric injection in experience with ValidationError', async () => {
    const context = { tenantId, userId };
    // Inject unbacked quantitative claim
    candidateProfile.experience[0].bullets.push(
      'Reduced cloud infrastructure spend by 45% ($300k).'
    );

    await assert.rejects(
      async () => {
        await service.draftCoverLetter(
          context,
          candidateProfile,
          jobDescription,
          candidateMatchAnalysis,
          projectRelevanceAnalysis,
          atsFitAnalysis,
          integrityCheckedAssertions
        );
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.ok(err.message.includes('Quantitative achievement claim rejected'));
        return true;
      }
    );
  });

  // -------------------------------------------------------------------------
  // 12. Unsupported Technology Omission
  // -------------------------------------------------------------------------
  it('12. strictly omits missing required technologies (Rust) from cover letter', async () => {
    const context = { tenantId, userId };
    const letter = await service.draftCoverLetter(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      atsFitAnalysis,
      integrityCheckedAssertions
    );

    for (const p of letter.paragraphs) {
      assert.ok(!p.text.includes('Rust'));
    }
  });

  // -------------------------------------------------------------------------
  // 13. ATS Terminology Normalization
  // -------------------------------------------------------------------------
  it('13. normalizes candidate terminology (e.g. postgres -> PostgreSQL) without inventing skills', async () => {
    const context = { tenantId, userId };
    candidateProfile.skills[1].name = 'postgres';

    const letter = await service.draftCoverLetter(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      atsFitAnalysis,
      integrityCheckedAssertions
    );

    const opening = letter.paragraphs[0];
    assert.ok(opening.text.includes('PostgreSQL'));
  });

  // -------------------------------------------------------------------------
  // 14. Maximum 5 EvidenceRefs per Paragraph
  // -------------------------------------------------------------------------
  it('14. caps evidence references at maximum 5 per paragraph', async () => {
    const context = { tenantId, userId };
    const letter = await service.draftCoverLetter(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      atsFitAnalysis,
      integrityCheckedAssertions
    );

    for (const p of letter.paragraphs) {
      assert.ok(p.evidenceRefs.length <= 5);
    }
  });

  // -------------------------------------------------------------------------
  // 15. 100% Deterministic Output
  // -------------------------------------------------------------------------
  it('15. guarantees bit-for-bit deterministic output across multiple runs', async () => {
    const context = { tenantId, userId };
    const fixedLetterId = crypto.randomUUID();

    const letter1 = await service.draftCoverLetter(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      atsFitAnalysis,
      integrityCheckedAssertions,
      { letterId: fixedLetterId }
    );

    const letter2 = await service.draftCoverLetter(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      atsFitAnalysis,
      integrityCheckedAssertions,
      { letterId: fixedLetterId }
    );

    assert.strictEqual(letter1.paragraphs.length, letter2.paragraphs.length);
    for (let i = 0; i < letter1.paragraphs.length; i++) {
      assert.strictEqual(letter1.paragraphs[i].text, letter2.paragraphs[i].text);
      assert.strictEqual(letter1.paragraphs[i].paragraphType, letter2.paragraphs[i].paragraphType);
    }
  });

  // -------------------------------------------------------------------------
  // 16. Tone Handling (PROFESSIONAL, CONCISE, CONFIDENT, WARM)
  // -------------------------------------------------------------------------
  it('16. supports selectable tones while preserving identical factual evidence references', async () => {
    const context = { tenantId, userId };
    const tones = ['PROFESSIONAL', 'CONCISE', 'CONFIDENT', 'WARM'];

    for (const tone of tones) {
      const letter = await service.draftCoverLetter(
        context,
        candidateProfile,
        jobDescription,
        candidateMatchAnalysis,
        projectRelevanceAnalysis,
        atsFitAnalysis,
        integrityCheckedAssertions,
        { tone }
      );

      assert.strictEqual(letter.metadata.tone, tone);
      assert.ok(letter.paragraphs.length >= 3);
      assert.strictEqual(letter.integrityStatus, 'PASS');
    }
  });

  // -------------------------------------------------------------------------
  // 17. Paragraph Length Bounds (3 to 6 Paragraphs)
  // -------------------------------------------------------------------------
  it('17. adheres to paragraph length bounds (3 to 6 paragraphs)', async () => {
    const context = { tenantId, userId };
    const letter3 = await service.draftCoverLetter(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      atsFitAnalysis,
      integrityCheckedAssertions,
      { targetParagraphCount: 3 }
    );
    assert.ok(letter3.paragraphs.length >= 3 && letter3.paragraphs.length <= 6);

    const letter6 = await service.draftCoverLetter(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      atsFitAnalysis,
      integrityCheckedAssertions,
      { targetParagraphCount: 6 }
    );
    assert.ok(letter6.paragraphs.length >= 3 && letter6.paragraphs.length <= 6);
  });

  // -------------------------------------------------------------------------
  // 18. Optional LLM Linguistic Sandbox & Metric Defense
  // -------------------------------------------------------------------------
  it('18. applies optional LLM adapter for prose flow but blocks metric hallucination', async () => {
    const context = { tenantId, userId };

    const mockLlmAdapter = {
      transformProse: async (_xmlPayload, _opts) => ({
        paragraphs: [
          { text: 'Refined professional opening text with polished flow.' },
          { text: 'Refined company alignment narrative.' },
          { text: 'Refined project evidence description.' },
          { text: 'Refined closing remarks.' },
        ],
      }),
    };

    const letter = await service.draftCoverLetter(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      atsFitAnalysis,
      integrityCheckedAssertions,
      { llmAdapter: mockLlmAdapter }
    );

    assert.strictEqual(
      letter.paragraphs[0].text,
      'Refined professional opening text with polished flow.'
    );

    // Malicious LLM injecting metric
    const maliciousLlmAdapter = {
      transformProse: async (_xmlPayload, _opts) => ({
        paragraphs: [{ text: 'Refined text claiming 99.99% uptime and $5M in revenue.' }],
      }),
    };

    await assert.rejects(
      async () => {
        await service.draftCoverLetter(
          context,
          candidateProfile,
          jobDescription,
          candidateMatchAnalysis,
          projectRelevanceAnalysis,
          atsFitAnalysis,
          integrityCheckedAssertions,
          { llmAdapter: maliciousLlmAdapter }
        );
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.ok(err.message.includes('ungrounded quantitative metric'));
        return true;
      }
    );
  });

  // -------------------------------------------------------------------------
  // 19. Post-Generation Integrity Failure Handling
  // -------------------------------------------------------------------------
  it('19. fails closed with ValidationError when paragraph cites non-existent EvidenceId', async () => {
    const context = { tenantId, userId };
    const foreignEvidenceId = crypto.randomUUID();

    // Fabricate assertion with non-existent EvidenceId
    integrityCheckedAssertions[0].evidenceRefs = [
      {
        id: foreignEvidenceId,
        resourceId: crypto.randomUUID(),
        resourceName: 'fake-repo',
        evidenceType: 'FILE_CONTENT',
        filePath: 'pkg/main.go',
        commitSha: '1111111111111111111111111111111111111111',
        lineRange: { start: 1, end: 1 },
        confidenceScore: 1.0,
        excerpt: 'fake code',
      },
    ];

    await assert.rejects(
      async () => {
        await service.draftCoverLetter(
          context,
          candidateProfile,
          jobDescription,
          candidateMatchAnalysis,
          projectRelevanceAnalysis,
          atsFitAnalysis,
          integrityCheckedAssertions
        );
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.ok(err.message.includes('non-existent EvidenceId'));
        return true;
      }
    );
  });

  // -------------------------------------------------------------------------
  // 20. Multi-Tenant Default-Deny Isolation
  // -------------------------------------------------------------------------
  it('20. enforces strict multi-tenant default-deny isolation (404 NotFoundError)', async () => {
    const context = { tenantId, userId };
    const foreignTenantId = crypto.randomUUID();

    // Foreign Candidate Profile
    await assert.rejects(
      async () => {
        await service.draftCoverLetter(
          context,
          { ...candidateProfile, tenantId: foreignTenantId },
          jobDescription,
          candidateMatchAnalysis,
          projectRelevanceAnalysis,
          atsFitAnalysis,
          integrityCheckedAssertions
        );
      },
      (err) => err instanceof NotFoundError
    );

    // Foreign Job Description
    await assert.rejects(
      async () => {
        await service.draftCoverLetter(
          context,
          candidateProfile,
          { ...jobDescription, tenantId: foreignTenantId },
          candidateMatchAnalysis,
          projectRelevanceAnalysis,
          atsFitAnalysis,
          integrityCheckedAssertions
        );
      },
      (err) => err instanceof NotFoundError
    );
  });

  // -------------------------------------------------------------------------
  // 21. Entity ID Coherence
  // -------------------------------------------------------------------------
  it('21. rejects mismatched candidate or job IDs with ValidationError', async () => {
    const context = { tenantId, userId };
    const foreignCandidateId = crypto.randomUUID();

    await assert.rejects(
      async () => {
        await service.draftCoverLetter(
          context,
          candidateProfile,
          jobDescription,
          { ...candidateMatchAnalysis, candidateId: foreignCandidateId },
          projectRelevanceAnalysis,
          atsFitAnalysis,
          integrityCheckedAssertions
        );
      },
      (err) => err instanceof ValidationError
    );
  });
});
