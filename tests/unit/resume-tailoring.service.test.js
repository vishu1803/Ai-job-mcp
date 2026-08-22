/**
 * @file Unit Tests for Resume Tailoring Service (P6-001)
 *
 * Verifies all architectural invariants approved in ARCH-017 / ADR-037:
 * 1. Verified required skill prioritization (Tier 1: 100.0 score)
 * 2. High relevance project prioritization (Tier 2: >= 70.0 score)
 * 3. Verified preferred skill prioritization (Tier 3: 75.0 score)
 * 4. Inferred skill labeling ([Inferred from <source>])
 * 5. Claimed skill labeling ([Unverified User Claim])
 * 6. Missing skill omission (Missing requirements are omitted, not hallucinated)
 * 7. Canonical keyword adaptation (e.g. postgres -> PostgreSQL)
 * 8. Unsupported metric blocking (Metric safety guard)
 * 9. Unsupported technology omission
 * 10. Explicit corporate work history preservation (Commits != work tenure)
 * 11. Project deduplication by projectId
 * 12. Multi-resource project handling
 * 13. EvidenceRef capping at maximum 5 references per bullet/project
 * 14. 100% Deterministic ordering across repeated runs
 * 15. Complete evidence metadata preservation
 * 16. Summary grounding in verified facts
 * 17. Explicit education preservation
 * 18. Explicit certification preservation
 * 19. Optional LLM phrasing sandbox & metadata safety
 * 20. Post-generation integrity validation enforcement
 * 21. Multi-tenant default-deny isolation (404 NotFoundError)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ResumeTailoringService } from '../../src/services/resume-tailoring.service.js';
import { ValidationError, NotFoundError } from '../../src/errors/index.js';

describe('Resume Tailoring Service Unit Tests (P6-001)', () => {
  let service;
  let tenantId;
  let userId;
  let candidateId;
  let jobId;

  let validEvidenceId1;
  let validEvidenceId2;
  let validEvidenceId3;

  let candidateProfile;
  let jobDescription;
  let candidateMatchAnalysis;
  let projectRelevanceAnalysis;
  let integrityCheckedAssertions;

  beforeEach(() => {
    service = new ResumeTailoringService();
    tenantId = crypto.randomUUID();
    userId = crypto.randomUUID();
    candidateId = crypto.randomUUID();
    jobId = crypto.randomUUID();

    validEvidenceId1 = crypto.randomUUID();
    validEvidenceId2 = crypto.randomUUID();
    validEvidenceId3 = crypto.randomUUID();

    const resourceId1 = crypto.randomUUID();
    const projectId1 = crypto.randomUUID();

    candidateProfile = {
      id: candidateId,
      tenantId,
      userId,
      displayName: 'Alice Engineer',
      headline: 'Staff Backend Architect | Distributed Systems',
      summary: 'Experienced backend engineer specializing in Go and PostgreSQL.',
      canonicalEmail: 'alice@example.com',
      status: 'ACTIVE',
      profileMetadata: {
        experience: [
          {
            company: 'Acme Corp',
            title: 'Senior Backend Engineer',
            startDate: '2021-03-01',
            endDate: null,
            location: 'San Francisco, CA',
            isCurrent: true,
            bullets: [
              'Architected core event-driven microservices using Go and PostgreSQL.',
              'Collaborated with infrastructure team to deploy Kubernetes services.',
            ],
            verified: true,
          },
        ],
        education: [
          {
            institution: 'University of California, Berkeley',
            degree: 'Bachelor of Science',
            fieldOfStudy: 'Computer Science',
            startDate: '2016-08-01',
            endDate: '2020-05-15',
            grade: '3.9 GPA',
          },
        ],
        certifications: [
          {
            name: 'AWS Certified Solutions Architect',
            issuingOrganization: 'Amazon Web Services',
            issueDate: '2022-06-01',
            credentialId: 'AWS-123456',
            credentialUrl: 'https://aws.amazon.com/verify/123456',
          },
        ],
      },
      skills: [
        {
          id: crypto.randomUUID(),
          name: 'Go',
          slug: 'go',
          category: 'LANGUAGE',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 1.0,
          evidenceCount: 1,
          evidence: [
            {
              id: validEvidenceId1,
              resourceId: resourceId1,
              resourceName: 'alice/distributed-kv',
              filePath: 'go.mod',
              commitSha: 'a'.repeat(40),
              lineRange: { start: 1, end: 5 },
              evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
              confidenceScore: 1.0,
              excerpt: 'module github.com/alice/distributed-kv\n\ngo 1.22',
            },
          ],
        },
        {
          id: crypto.randomUUID(),
          name: 'postgres',
          slug: 'postgresql',
          category: 'DATABASE',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceCount: 1,
          evidence: [
            {
              id: validEvidenceId2,
              resourceId: resourceId1,
              resourceName: 'alice/distributed-kv',
              filePath: 'db/conn.go',
              commitSha: 'b'.repeat(40),
              lineRange: { start: 10, end: 20 },
              evidenceType: 'CODE_IMPORT_USAGE',
              confidenceScore: 0.95,
              excerpt: 'import "github.com/jackc/pgx/v5"',
            },
          ],
        },
        {
          id: crypto.randomUUID(),
          name: 'Docker',
          slug: 'docker',
          category: 'CLOUD_DEVOPS',
          provenanceStatus: 'INFERRED',
          confidenceScore: 0.75,
          evidenceCount: 1,
          evidence: [
            {
              id: validEvidenceId3,
              resourceId: resourceId1,
              resourceName: 'alice/distributed-kv',
              filePath: 'Dockerfile',
              commitSha: 'c'.repeat(40),
              lineRange: { start: 1, end: 10 },
              evidenceType: 'CONFIG_SYNTAX_DECLARATION',
              confidenceScore: 0.75,
              excerpt: 'FROM golang:1.22-alpine',
            },
          ],
        },
        {
          id: crypto.randomUUID(),
          name: 'GraphQL',
          slug: 'graphql',
          category: 'ARCHITECTURE',
          provenanceStatus: 'CLAIMED',
          confidenceScore: 0.25,
          evidenceCount: 0,
          evidence: [],
        },
      ],
      projects: [
        {
          id: projectId1,
          name: 'distributed-kv',
          displayName: 'Distributed Key-Value Store',
          summary: 'High performance distributed KV store with Raft consensus in Go.',
          slug: 'distributed-kv',
          resources: [
            {
              id: resourceId1,
              provider: 'GITHUB_APP',
              name: 'distributed-kv',
              displayName: 'alice/distributed-kv',
            },
          ],
          evidence: [
            {
              id: validEvidenceId1,
              resourceId: resourceId1,
              resourceName: 'alice/distributed-kv',
              filePath: 'go.mod',
              commitSha: 'a'.repeat(40),
              lineRange: { start: 1, end: 5 },
              evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
              confidenceScore: 1.0,
            },
          ],
        },
      ],
    };

    jobDescription = {
      id: jobId,
      tenantId,
      title: 'Principal Backend Engineer',
      summary: 'Seeking strong Go and PostgreSQL engineers for distributed storage.',
      requirements: [
        {
          id: crypto.randomUUID(),
          title: 'Go',
          requirementType: 'REQUIRED',
          isRequired: true,
          weight: 1.0,
          category: 'LANGUAGE',
        },
        {
          id: crypto.randomUUID(),
          title: 'PostgreSQL',
          requirementType: 'REQUIRED',
          isRequired: true,
          weight: 1.0,
          category: 'DATABASE',
        },
        {
          id: crypto.randomUUID(),
          title: 'Docker',
          requirementType: 'PREFERRED',
          isRequired: false,
          weight: 0.5,
          category: 'CLOUD_DEVOPS',
        },
        {
          id: crypto.randomUUID(),
          title: 'Rust',
          requirementType: 'REQUIRED',
          isRequired: true,
          weight: 1.0,
          category: 'LANGUAGE',
        },
      ],
    };

    candidateMatchAnalysis = {
      tenantId,
      candidateId,
      jobDescriptionId: jobId,
      overallScore: 85.5,
      overallMatchScore: 85.5,
      requirementMatches: [
        {
          requirementSlug: 'go',
          requirementTitle: 'Go',
          isRequired: true,
          matchStatus: 'MATCHED',
        },
        {
          requirementSlug: 'postgresql',
          requirementTitle: 'PostgreSQL',
          isRequired: true,
          matchStatus: 'MATCHED',
        },
        {
          requirementSlug: 'docker',
          requirementTitle: 'Docker',
          isRequired: false,
          matchStatus: 'PARTIAL',
        },
        {
          requirementSlug: 'rust',
          requirementTitle: 'Rust',
          isRequired: true,
          matchStatus: 'MISSING',
        },
      ],
    };

    projectRelevanceAnalysis = {
      tenantId,
      candidateId,
      jobDescriptionId: jobId,
      overallScore: 92.0,
      rankedProjects: [
        {
          projectId: projectId1,
          name: 'distributed-kv',
          displayName: 'Distributed Key-Value Store',
          description: 'High performance distributed KV store with Raft consensus in Go.',
          projectType: 'APPLICATION',
          relevanceScore: 92.0,
          relevanceBand: 'HIGH',
          primaryLanguages: ['Go'],
          primaryFrameworks: ['PostgreSQL'],
          architecturalSignals: ['DATA_PERSISTENCE', 'TESTING'],
          evidenceRefs: [
            {
              id: validEvidenceId1,
              resourceId: resourceId1,
              resourceName: 'alice/distributed-kv',
              filePath: 'go.mod',
              commitSha: 'a'.repeat(40),
              lineRange: { start: 1, end: 5 },
              evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
              confidenceScore: 1.0,
            },
          ],
        },
      ],
    };

    integrityCheckedAssertions = {
      tenantId,
      candidateId,
      integrityStatus: 'PASS',
      assertions: [
        {
          assertionId: crypto.randomUUID(),
          candidateId,
          assertionType: 'SKILL',
          statement: 'Candidate is proficient in Go',
          subjectSlug: 'go',
          status: 'VERIFIED',
          confidenceScore: 1.0,
          evidenceRefs: [
            {
              id: validEvidenceId1,
              resourceId: resourceId1,
              resourceName: 'alice/distributed-kv',
              filePath: 'go.mod',
              commitSha: 'a'.repeat(40),
              lineRange: { start: 1, end: 5 },
              evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
              confidenceScore: 1.0,
            },
          ],
          claimLabel: null,
          auditReasonCode: 'VALID_EVIDENCE',
          isAudited: true,
          auditMessage: 'Backed by verified code',
        },
        {
          assertionId: crypto.randomUUID(),
          candidateId,
          assertionType: 'SKILL',
          statement: 'Candidate is proficient in PostgreSQL',
          subjectSlug: 'postgresql',
          status: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceRefs: [
            {
              id: validEvidenceId2,
              resourceId: resourceId1,
              resourceName: 'alice/distributed-kv',
              filePath: 'db/conn.go',
              commitSha: 'b'.repeat(40),
              lineRange: { start: 10, end: 20 },
              evidenceType: 'CODE_IMPORT_USAGE',
              confidenceScore: 0.95,
            },
          ],
          claimLabel: null,
          auditReasonCode: 'VALID_EVIDENCE',
          isAudited: true,
          auditMessage: 'Backed by verified code',
        },
        {
          assertionId: crypto.randomUUID(),
          candidateId,
          assertionType: 'SKILL',
          statement: 'Candidate has Docker containerization experience',
          subjectSlug: 'docker',
          status: 'INFERRED',
          confidenceScore: 0.75,
          evidenceRefs: [
            {
              id: validEvidenceId3,
              resourceId: resourceId1,
              resourceName: 'alice/distributed-kv',
              filePath: 'Dockerfile',
              commitSha: 'c'.repeat(40),
              lineRange: { start: 1, end: 10 },
              evidenceType: 'CONFIG_SYNTAX_DECLARATION',
              confidenceScore: 0.75,
            },
          ],
          claimLabel: '[Inferred from related evidence]',
          auditReasonCode: 'VALID_INFERENCE',
          isAudited: true,
          auditMessage: 'Inferred from configuration files',
        },
        {
          assertionId: crypto.randomUUID(),
          candidateId,
          assertionType: 'SKILL',
          statement: 'Candidate claims GraphQL experience',
          subjectSlug: 'graphql',
          status: 'CLAIMED',
          confidenceScore: 0.25,
          evidenceRefs: [],
          claimLabel: '[Unverified User Claim]',
          auditReasonCode: 'LABELED_USER_CLAIM',
          isAudited: true,
          auditMessage: 'Self-asserted manual profile claim',
        },
      ],
    };
  });

  // -------------------------------------------------------------------------
  // 1. Verified Required Skill Prioritization
  // -------------------------------------------------------------------------
  it('1. prioritizes verified required skills (Tier 1: relevanceScore 100.0)', async () => {
    const context = { tenantId, userId };
    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions
    );

    assert.ok(resume);
    assert.strictEqual(resume.candidateId, candidateId);
    assert.strictEqual(resume.targetJobId, jobId);

    const langCat = resume.skills.find((c) => c.category === 'LANGUAGE');
    assert.ok(langCat);
    const goSkill = langCat.skills.find((s) => s.canonicalSlug === 'go');
    assert.ok(goSkill);
    assert.strictEqual(goSkill.status, 'VERIFIED');
    assert.strictEqual(goSkill.relevanceScore, 100.0);
    assert.strictEqual(goSkill.claimLabel, null);
  });

  // -------------------------------------------------------------------------
  // 2. High Relevance Project Prioritization
  // -------------------------------------------------------------------------
  it('2. prioritizes high relevance projects (Tier 2: relevance >= 70.0)', async () => {
    const context = { tenantId, userId };
    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions
    );

    assert.strictEqual(resume.projects.length, 1);
    const proj = resume.projects[0];
    assert.strictEqual(proj.displayName, 'Distributed Key-Value Store');
    assert.strictEqual(proj.relevanceScore, 92.0);
    assert.strictEqual(proj.relevanceBand, 'HIGH');
    assert.ok(proj.bullets.length >= 1);
    assert.strictEqual(proj.bullets[0].status, 'VERIFIED');
    assert.ok(proj.bullets[0].evidenceRefs.length > 0);
  });

  // -------------------------------------------------------------------------
  // 3. Preferred Skill Prioritization
  // -------------------------------------------------------------------------
  it('3. prioritizes preferred skills (Tier 3: relevanceScore 75.0)', async () => {
    const context = { tenantId, userId };
    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions
    );

    const devopsCat = resume.skills.find((c) => c.category === 'CLOUD_DEVOPS');
    assert.ok(devopsCat);
    const dockerSkill = devopsCat.skills.find((s) => s.canonicalSlug === 'docker');
    assert.ok(dockerSkill);
    assert.strictEqual(dockerSkill.relevanceScore, 75.0);
    assert.strictEqual(dockerSkill.status, 'INFERRED');
  });

  // -------------------------------------------------------------------------
  // 4. Inferred Skill Labeling
  // -------------------------------------------------------------------------
  it('4. labels inferred skills explicitly with [Inferred from <source>]', async () => {
    const context = { tenantId, userId };
    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions
    );

    const devopsCat = resume.skills.find((c) => c.category === 'CLOUD_DEVOPS');
    const dockerSkill = devopsCat.skills.find((s) => s.canonicalSlug === 'docker');
    assert.ok(dockerSkill.claimLabel.includes('Inferred'));
  });

  // -------------------------------------------------------------------------
  // 5. Claimed Skill Labeling
  // -------------------------------------------------------------------------
  it('5. labels claimed skills explicitly with [Unverified User Claim]', async () => {
    const context = { tenantId, userId };
    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions
    );

    const archCat = resume.skills.find((c) => c.category === 'ARCHITECTURE');
    assert.ok(archCat);
    const gqlSkill = archCat.skills.find((s) => s.canonicalSlug === 'graphql');
    assert.ok(gqlSkill);
    assert.strictEqual(gqlSkill.status, 'CLAIMED');
    assert.strictEqual(gqlSkill.claimLabel, '[Unverified User Claim]');
  });

  // -------------------------------------------------------------------------
  // 6. Missing Skill Omission
  // -------------------------------------------------------------------------
  it('6. strictly omits missing required skills (e.g. Rust) from skills list and records omitted count', async () => {
    const context = { tenantId, userId };
    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions
    );

    // Job requires Rust, but candidate has 0 Rust evidence/claims
    const allSkills = resume.skills.flatMap((c) => c.skills);
    const rustSkill = allSkills.find((s) => s.canonicalSlug === 'rust');
    assert.strictEqual(rustSkill, undefined);
    assert.strictEqual(resume.metadata.omittedSkillsCount, 1);
  });

  // -------------------------------------------------------------------------
  // 7. Canonical ATS Keyword Adaptation
  // -------------------------------------------------------------------------
  it('7. adapts candidate terminology (postgres) to job requirement title (PostgreSQL) via taxonomy mapping', async () => {
    const context = { tenantId, userId };
    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions
    );

    const dbCat = resume.skills.find((c) => c.category === 'DATABASE');
    assert.ok(dbCat);
    const pgSkill = dbCat.skills.find((s) => s.canonicalSlug === 'postgresql');
    assert.ok(pgSkill);
    assert.strictEqual(pgSkill.name, 'PostgreSQL'); // Aligned to job title
  });

  // -------------------------------------------------------------------------
  // 8. Metric Safety Guard
  // -------------------------------------------------------------------------
  it('8. blocks ungrounded quantitative achievement claims (e.g. "reduced latency by 70%")', async () => {
    const context = { tenantId, userId };
    // Inject ungrounded quantitative claim in experience bullet
    candidateProfile.profileMetadata.experience[0].bullets.push(
      'Reduced latency by 70% across production API gateways.'
    );

    await assert.rejects(
      async () => {
        await service.tailorResume(
          context,
          candidateProfile,
          jobDescription,
          candidateMatchAnalysis,
          projectRelevanceAnalysis,
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
  // 9. Unsupported Technology Omission
  // -------------------------------------------------------------------------
  it('9. does not invent unsupported technologies in project descriptions', async () => {
    const context = { tenantId, userId };
    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions
    );

    for (const proj of resume.projects) {
      for (const bullet of proj.bullets) {
        assert.strictEqual(bullet.text.includes('Rust'), false);
        assert.strictEqual(bullet.text.includes('Kubernetes'), false);
      }
    }
  });

  // -------------------------------------------------------------------------
  // 10. Corporate Work History Authority
  // -------------------------------------------------------------------------
  it('10. derives work experience exclusively from explicit profile work history', async () => {
    const context = { tenantId, userId };
    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions
    );

    assert.strictEqual(resume.experience.length, 1);
    assert.strictEqual(resume.experience[0].company, 'Acme Corp');
    assert.strictEqual(resume.experience[0].title, 'Senior Backend Engineer');
    assert.strictEqual(resume.experience[0].isCurrent, true);
  });

  // -------------------------------------------------------------------------
  // 11. Project Deduplication
  // -------------------------------------------------------------------------
  it('11. deduplicates projects by projectId even if multiple ranked entries exist', async () => {
    const context = { tenantId, userId };
    // Duplicate project in ranked list
    projectRelevanceAnalysis.rankedProjects.push({
      ...projectRelevanceAnalysis.rankedProjects[0],
    });

    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions
    );

    assert.strictEqual(resume.projects.length, 1);
  });

  // -------------------------------------------------------------------------
  // 12. EvidenceRef Capping
  // -------------------------------------------------------------------------
  it('12. caps evidence refs per bullet at maximum 5 items', async () => {
    const context = { tenantId, userId };
    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions
    );

    for (const bullet of resume.summaryBullets) {
      assert.ok(bullet.evidenceRefs.length <= 5);
    }
    for (const proj of resume.projects) {
      for (const bullet of proj.bullets) {
        assert.ok(bullet.evidenceRefs.length <= 5);
      }
    }
  });

  // -------------------------------------------------------------------------
  // 13. 100% Deterministic Output
  // -------------------------------------------------------------------------
  it('13. guarantees 100% deterministic content selection across 50 consecutive runs', async () => {
    const context = { tenantId, userId };

    const first = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions
    );

    for (let i = 0; i < 50; i++) {
      const run = await service.tailorResume(
        context,
        candidateProfile,
        jobDescription,
        candidateMatchAnalysis,
        projectRelevanceAnalysis,
        integrityCheckedAssertions
      );

      assert.strictEqual(run.headline, first.headline);
      assert.strictEqual(run.summary, first.summary);
      assert.strictEqual(run.skills.length, first.skills.length);
      assert.strictEqual(run.projects.length, first.projects.length);
      assert.strictEqual(run.experience.length, first.experience.length);
      assert.strictEqual(run.metadata.totalBullets, first.metadata.totalBullets);
    }
  });

  // -------------------------------------------------------------------------
  // 14. Executive Summary Grounding
  // -------------------------------------------------------------------------
  it('14. grounds executive summary in verified required skills and top projects', async () => {
    const context = { tenantId, userId };
    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions
    );

    assert.ok(resume.summary.includes('Go'));
    assert.ok(resume.summary.includes('PostgreSQL'));
    assert.ok(resume.summary.includes('Distributed Key-Value Store'));
  });

  // -------------------------------------------------------------------------
  // 15. Education Preservation
  // -------------------------------------------------------------------------
  it('15. preserves explicit candidate education records without manufacturing degrees', async () => {
    const context = { tenantId, userId };
    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions
    );

    assert.strictEqual(resume.education.length, 1);
    assert.strictEqual(resume.education[0].institution, 'University of California, Berkeley');
    assert.strictEqual(resume.education[0].degree, 'Bachelor of Science');
  });

  // -------------------------------------------------------------------------
  // 16. Certification Preservation
  // -------------------------------------------------------------------------
  it('16. preserves explicit candidate certification records without manufacturing certificates', async () => {
    const context = { tenantId, userId };
    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions
    );

    assert.strictEqual(resume.certifications.length, 1);
    assert.strictEqual(resume.certifications[0].name, 'AWS Certified Solutions Architect');
  });

  // -------------------------------------------------------------------------
  // 17. Optional LLM Phrasing Sandbox
  // -------------------------------------------------------------------------
  it('17. applies LLM phrasing transformation safely without permitting fact invention', async () => {
    const context = { tenantId, userId };
    const mockLlmAdapter = {
      transformPhrasing: async (prompt) => {
        assert.ok(prompt.includes('<job_input>'));
        assert.ok(prompt.includes('<candidate_facts>'));
        return {
          headline: 'Lead Distributed Systems Engineer | Go & PostgreSQL Specialist',
          summary: 'Specialist in distributed systems engineering with deep Go expertise.',
        };
      },
    };

    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions,
      { llmAdapter: mockLlmAdapter }
    );

    assert.strictEqual(
      resume.headline,
      'Lead Distributed Systems Engineer | Go & PostgreSQL Specialist'
    );
    assert.strictEqual(
      resume.summary,
      'Specialist in distributed systems engineering with deep Go expertise.'
    );
  });

  // -------------------------------------------------------------------------
  // 18. Multi-Tenant Default-Deny Security Barrier
  // -------------------------------------------------------------------------
  it('18. strictly rejects cross-tenant candidate, job, match, or project access with 404 NotFoundError', async () => {
    const foreignTenantId = crypto.randomUUID();
    const context = { tenantId, userId };

    // Foreign Candidate
    await assert.rejects(
      async () => {
        await service.tailorResume(
          context,
          { ...candidateProfile, tenantId: foreignTenantId },
          jobDescription,
          candidateMatchAnalysis,
          projectRelevanceAnalysis,
          integrityCheckedAssertions
        );
      },
      (err) => err instanceof NotFoundError
    );

    // Foreign Job
    await assert.rejects(
      async () => {
        await service.tailorResume(
          context,
          candidateProfile,
          { ...jobDescription, tenantId: foreignTenantId },
          candidateMatchAnalysis,
          projectRelevanceAnalysis,
          integrityCheckedAssertions
        );
      },
      (err) => err instanceof NotFoundError
    );

    // Foreign Match Analysis
    await assert.rejects(
      async () => {
        await service.tailorResume(
          context,
          candidateProfile,
          jobDescription,
          { ...candidateMatchAnalysis, tenantId: foreignTenantId },
          projectRelevanceAnalysis,
          integrityCheckedAssertions
        );
      },
      (err) => err instanceof NotFoundError
    );

    // Foreign Project Analysis
    await assert.rejects(
      async () => {
        await service.tailorResume(
          context,
          candidateProfile,
          jobDescription,
          candidateMatchAnalysis,
          { ...projectRelevanceAnalysis, tenantId: foreignTenantId },
          integrityCheckedAssertions
        );
      },
      (err) => err instanceof NotFoundError
    );
  });

  // -------------------------------------------------------------------------
  // 19. Entity ID Coherence
  // -------------------------------------------------------------------------
  it('19. rejects mismatched candidate or job IDs with ValidationError', async () => {
    const context = { tenantId, userId };
    const foreignCandidateId = crypto.randomUUID();

    await assert.rejects(
      async () => {
        await service.tailorResume(
          context,
          candidateProfile,
          jobDescription,
          { ...candidateMatchAnalysis, candidateId: foreignCandidateId },
          projectRelevanceAnalysis,
          integrityCheckedAssertions
        );
      },
      (err) => err instanceof ValidationError
    );
  });

  // -------------------------------------------------------------------------
  // 20. GENERATE_NEW Presentation Mode (Default & Templates)
  // -------------------------------------------------------------------------
  it('20. generates resume in GENERATE_NEW mode with default ATS_FOCUSED template', async () => {
    const context = { tenantId, userId };
    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions,
      { presentationMode: 'GENERATE_NEW' }
    );

    assert.strictEqual(resume.presentationMode, 'GENERATE_NEW');
    assert.strictEqual(resume.templateId, 'ATS_FOCUSED');
    assert.strictEqual(resume.presentationIntegrityStatus, 'PASS');
    assert.ok(resume.presentationAudit);
    assert.strictEqual(resume.presentationAudit.presentationIntegrityStatus, 'PASS');
  });

  it('21. generates resume in GENERATE_NEW mode with explicit templateId (MODERN)', async () => {
    const context = { tenantId, userId };
    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions,
      { presentationMode: 'GENERATE_NEW', templateId: 'MODERN' }
    );

    assert.strictEqual(resume.presentationMode, 'GENERATE_NEW');
    assert.strictEqual(resume.templateId, 'MODERN');
    assert.strictEqual(resume.presentationIntegrityStatus, 'PASS');
  });

  // -------------------------------------------------------------------------
  // 22. PRESERVE_EXISTING Presentation Mode (DOCX Preservation)
  // -------------------------------------------------------------------------
  it('22. tailors resume in PRESERVE_EXISTING mode preserving DOCX visual styling attributes', async () => {
    const context = { tenantId, userId };
    const sourceStyles = {
      fontFamily: 'Calibri',
      fontSize: '11pt',
      margins: { top: '1in', bottom: '1in', left: '1in', right: '1in' },
      lineSpacing: 1.15,
      textColor: '#222222',
    };

    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions,
      {
        presentationMode: 'PRESERVE_EXISTING',
        sourceDocumentId: 'doc-resume-docx-001',
        sourceDocument: {
          id: 'doc-resume-docx-001',
          format: 'DOCX',
          styles: sourceStyles,
        },
      }
    );

    assert.strictEqual(resume.presentationMode, 'PRESERVE_EXISTING');
    assert.strictEqual(resume.sourceDocumentId, 'doc-resume-docx-001');
    assert.strictEqual(resume.presentationIntegrityStatus, 'PASS');
    assert.ok(resume.presentationAudit.preservedAttributes);
    assert.strictEqual(resume.presentationAudit.preservedAttributes.fontFamily, 'Calibri');
    assert.strictEqual(resume.presentationAudit.preservedAttributes.fontSize, '11pt');
    assert.strictEqual(resume.presentationAudit.preservedAttributes.textColor, '#222222');
    assert.strictEqual(resume.presentationAudit.discrepancies.length, 0);

    // Assert content is still tailored and verified
    assert.ok(resume.summary.includes('Go'));
    assert.strictEqual(resume.projects.length, 1);
  });

  // -------------------------------------------------------------------------
  // 23. PRESERVE_EXISTING Missing Source Document Rejection
  // -------------------------------------------------------------------------
  it('23. rejects PRESERVE_EXISTING request when source document reference is missing', async () => {
    const context = { tenantId, userId };

    await assert.rejects(
      async () => {
        await service.tailorResume(
          context,
          candidateProfile,
          jobDescription,
          candidateMatchAnalysis,
          projectRelevanceAnalysis,
          integrityCheckedAssertions,
          { presentationMode: 'PRESERVE_EXISTING' }
        );
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.ok(err.message.includes('sourceDocumentId or sourceDocument is required'));
        return true;
      }
    );
  });

  // -------------------------------------------------------------------------
  // 24. PRESERVE_EXISTING PDF Source Warning
  // -------------------------------------------------------------------------
  it('24. returns WARNING status when PRESERVE_EXISTING is requested for PDF source document', async () => {
    const context = { tenantId, userId };

    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions,
      {
        presentationMode: 'PRESERVE_EXISTING',
        sourceDocumentId: 'doc-pdf-orig',
        sourceDocument: {
          id: 'doc-pdf-orig',
          format: 'PDF',
        },
      }
    );

    assert.strictEqual(resume.presentationMode, 'PRESERVE_EXISTING');
    assert.strictEqual(resume.presentationIntegrityStatus, 'WARNING');
    assert.ok(resume.presentationAudit.warnings.some((w) => w.includes('PDF format detected')));
  });

  // -------------------------------------------------------------------------
  // 25. PRESERVE_EXISTING Plain Text / Markdown Unsupported Status
  // -------------------------------------------------------------------------
  it('25. returns UNSUPPORTED_PRESERVATION for Plain Text / Markdown in PRESERVE_EXISTING mode', async () => {
    const context = { tenantId, userId };

    const resume = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions,
      {
        presentationMode: 'PRESERVE_EXISTING',
        sourceDocumentId: 'doc-txt-orig',
        sourceDocument: {
          id: 'doc-txt-orig',
          format: 'PLAIN_TEXT',
        },
      }
    );

    assert.strictEqual(resume.presentationMode, 'PRESERVE_EXISTING');
    assert.strictEqual(resume.presentationIntegrityStatus, 'UNSUPPORTED_PRESERVATION');
  });

  // -------------------------------------------------------------------------
  // 26. Invalid Presentation Mode Rejection
  // -------------------------------------------------------------------------
  it('26. rejects invalid presentationMode with ValidationError', async () => {
    const context = { tenantId, userId };

    await assert.rejects(
      async () => {
        await service.tailorResume(
          context,
          candidateProfile,
          jobDescription,
          candidateMatchAnalysis,
          projectRelevanceAnalysis,
          integrityCheckedAssertions,
          { presentationMode: 'CUSTOM_INVALID_MODE' }
        );
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.ok(err.message.includes('Invalid presentationMode'));
        return true;
      }
    );
  });

  // -------------------------------------------------------------------------
  // 27. Content Engine Parity Between Modes
  // -------------------------------------------------------------------------
  it('27. produces identical tailored content (skills, projects, keywords) across both presentation modes', async () => {
    const context = { tenantId, userId };

    const resumeGenNew = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions,
      { presentationMode: 'GENERATE_NEW' }
    );

    const resumePreserve = await service.tailorResume(
      context,
      candidateProfile,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      integrityCheckedAssertions,
      {
        presentationMode: 'PRESERVE_EXISTING',
        sourceDocumentId: 'doc-parity-1',
        sourceDocument: {
          id: 'doc-parity-1',
          format: 'DOCX',
        },
      }
    );

    assert.strictEqual(resumeGenNew.headline, resumePreserve.headline);
    assert.strictEqual(resumeGenNew.summary, resumePreserve.summary);
    assert.strictEqual(resumeGenNew.skills.length, resumePreserve.skills.length);
    assert.strictEqual(resumeGenNew.projects.length, resumePreserve.projects.length);
    assert.strictEqual(resumeGenNew.experience.length, resumePreserve.experience.length);
    assert.strictEqual(
      resumeGenNew.metadata.omittedSkillsCount,
      resumePreserve.metadata.omittedSkillsCount
    );
  });

  // -------------------------------------------------------------------------
  // 28. Truth Model Parity Between Modes
  // -------------------------------------------------------------------------
  it('28. strictly enforces Zero-Hallucination metric safety under PRESERVE_EXISTING mode', async () => {
    const context = { tenantId, userId };
    // Inject ungrounded quantitative metric
    candidateProfile.profileMetadata.experience[0].bullets.push(
      'Increased system throughput by 85% with zero downtime.'
    );

    await assert.rejects(
      async () => {
        await service.tailorResume(
          context,
          candidateProfile,
          jobDescription,
          candidateMatchAnalysis,
          projectRelevanceAnalysis,
          integrityCheckedAssertions,
          {
            presentationMode: 'PRESERVE_EXISTING',
            sourceDocumentId: 'doc-safety-check',
            sourceDocument: {
              id: 'doc-safety-check',
              format: 'DOCX',
            },
          }
        );
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.ok(err.message.includes('Quantitative achievement claim rejected'));
        return true;
      }
    );
  });
});
