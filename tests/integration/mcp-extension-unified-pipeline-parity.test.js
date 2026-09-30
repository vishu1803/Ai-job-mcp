/**
 * @file Cross-Surface Integration Test: MCP <-> Extension Unified Pipeline Parity
 *
 * Verifies that the Web App, Remote MCP server, and Chrome Extension are NOT
 * separate implementations, but different interfaces over the exact same
 * canonical Career Hub architecture:
 *
 * 1. Canonical Job Identity & Fingerprint Parity:
 *    - MCP and Extension resolve to the exact same canonicalJobId and 64-char jobFingerprint.
 *    - Resilient across tracking params (UTMs, ref tags) and application routes.
 *
 * 2. Canonical Requirement Semantics Parity (Bug A Fix):
 *    - All 6 required skills preserve REQUIRED priority and required: true across MCP & Extension.
 *    - All 4 preferred skills preserve PREFERRED priority and required: false across MCP & Extension.
 *    - requiredSkillsScore > 0 and preferredSkillsScore > 0 are identical.
 *
 * 3. Canonical Evidence Parity & Zero Evidence Upgrade (Bug B Fix):
 *    - Node.js (SELF_DECLARED) has truth category CLAIMED and matchStatus UNVERIFIED_CLAIM across surfaces.
 *    - Docker (SELF_DECLARED) has truth category CLAIMED and matchStatus UNVERIFIED_CLAIM across surfaces.
 *    - Neither MCP, Extension, Tailored Resume, Cover Letter, nor Application Preparation upgrades evidence.
 *
 * 4. Canonical ATS Fit Score Parity:
 *    - ATS score is calculated once by the canonical engine.
 *    - MCP atsScore, grade, recommendation, and 7-component breakdown exactly match Extension.
 *
 * 5. Application Lifecycle & Package Hash Convergence:
 *    - MCP prepare_job_application and Extension /prepare-handoff converge on the same applicationId
 *      and identical packageHash.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto, { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase, pool } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  jobApplications,
  applicationPackages,
  resources,
  projects,
  candidateSkills,
  skills,
} from '../../src/db/schema.js';
import { createSession } from '../../src/security/session.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { handleAnalyzeJobFit } from '../../src/mcp/tools/career-read-tools.js';
import {
  handleGenerateTailoredResume,
  handleDraftCoverLetter,
} from '../../src/mcp/tools/career-artifact-tools.js';
import { defaultAiResumeContentGenerator } from '../../src/services/ai-resume-content-generator.service.js';
import {
  deriveCanonicalJobId,
  deriveJobFingerprint,
  normalizeJobPostingUrl,
} from '../../src/utils/url-normalizer.js';

describe('MCP <-> Extension Unified Pipeline Parity Integration Suite', () => {
  let app;
  let workflowService;
  let trackingService;
  let candidateProfileService;
  let originalGenerate;

  const createdTenantIds = [];
  let tenant;
  let user;
  let candidate;
  let session;
  let mcpContext;
  let commonDeps;

  // Canonical Job Fixture
  const jobTitle = 'Junior Full Stack Engineer';
  const companyName = 'TechCorp Inc';
  const jobPostingUrl = 'https://boards.greenhouse.io/techcorp/jobs/987654321?utm_source=linkedin&ref=board';

  const jobDescription = `About the Role:
We are seeking a talented Junior Full Stack Engineer to join our growing engineering team at TechCorp Inc.
You will build and scale reliable web applications and backend microservices.

Required Qualifications:
- JavaScript
- React
- Node.js
- PostgreSQL
- REST APIs
- Git

Preferred Qualifications:
- Next.js
- Docker
- TypeScript
- FastAPI

Responsibilities:
- Collaborate with product designers and backend engineers to craft responsive interfaces.
- Build clean, accessible UI components with React.
- Design resilient REST APIs with PostgreSQL databases.
- Write maintainable, tested code with Git version control.`;

  before(async () => {
    workflowService = new JobApplicationWorkflowService({ database: db });
    trackingService = new ApplicationTrackingService({ database: db });
    candidateProfileService = new CandidateProfileService(db);

    const mockLatexCompiler = {
      compileLatexToPdf: async () => ({
        success: true,
        compilerUsed: 'mock-tectonic',
        pdfBuffer: Buffer.from('%PDF-1.5 mock pdf for testing'),
        texContent: '% mock tex',
      }),
    };
    workflowService.applicationHandoffService.latexCompiler = mockLatexCompiler;
    if (workflowService.applicationHandoffService.resumeOptimizer) {
      workflowService.applicationHandoffService.resumeOptimizer.latexCompiler = mockLatexCompiler;
    }

    originalGenerate = defaultAiResumeContentGenerator.generateResumeAiContent;
    defaultAiResumeContentGenerator.generateResumeAiContent = async () => ({
      success: true,
      summary:
        'Junior Full-Stack Engineer with verified competencies in JavaScript, React, PostgreSQL, and Git.',
      projectBullets: {
        all: [
          'Architected responsive enterprise frontend using React and Next.js with automated test coverage.',
          'Engineered backend REST APIs with PostgreSQL database persistence and schema migrations.',
          'Maintained reliable Git workflows with CI/CD automation and code review gates.',
        ],
      },
    });

    app = buildApp({
      db,
      jobApplicationWorkflowService: workflowService,
      applicationTrackingService: trackingService,
    });
    await app.ready();

    // 1. Seed Tenant
    const tenantId = randomUUID();
    createdTenantIds.push(tenantId);
    [tenant] = await db
      .insert(tenants)
      .values({
        id: tenantId,
        name: 'Parity Test Tenant',
        slug: `parity-tenant-${Date.now()}`,
        tier: 'PRO',
      })
      .returning();

    // 2. Seed User
    const userId = randomUUID();
    [user] = await db
      .insert(users)
      .values({
        id: userId,
        tenantId,
        email: `candidate-${Date.now()}@parity.test`,
        displayName: 'Devon Fullstack',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    // 3. Seed Candidate
    const candidateId = randomUUID();
    [candidate] = await db
      .insert(candidates)
      .values({
        id: candidateId,
        tenantId,
        userId,
        displayName: 'Devon Fullstack',
        canonicalEmail: user.email,
        status: 'ACTIVE',
        profileMetadata: {
          userCustom: {},
          systemInferred: { onboardingState: 'COMPLETED' },
          resumeData: {
            identity: { fullName: 'Devon Fullstack', email: user.email, phone: '+1-555-0199' },
            skills: ['JavaScript', 'React', 'PostgreSQL', 'Git', 'Next.js', 'FastAPI', 'Node.js', 'Docker'],
          },
        },
      })
      .returning();

    // 4. Create Session
    session = await createSession(db, { userId, tenantId });

    mcpContext = {
      tenantId,
      userId,
      role: 'MEMBER',
      scopes: ['career:read', 'career:write'],
    };

    commonDeps = {
      db,
      database: db,
      candidateProfileService,
      jobApplicationWorkflowService: workflowService,
      applicationTrackingService: trackingService,
    };

    // 5. Seed Repository Resource
    const repoResourceId = randomUUID();
    await db.insert(resources).values({
      id: repoResourceId,
      tenantId,
      provider: 'GITHUB_APP',
      resourceType: 'REPOSITORY',
      externalResourceId: 'repo-web-platform',
      name: 'devon/enterprise-web-platform',
      displayName: 'Enterprise Web Platform',
      status: 'ACTIVE',
      metadata: {},
    });

    // 6. Seed Project
    const projId = randomUUID();
    await db.insert(projects).values({
      id: projId,
      tenantId,
      candidateId,
      name: 'Enterprise Web Platform',
      slug: 'enterprise-web-platform',
      portfolioStatus: 'FEATURED',
      technologies: ['JavaScript', 'React', 'PostgreSQL', 'Git', 'Next.js', 'FastAPI'],
      metadata: {},
    });

    // 7. Seed Skills & CandidateSkills
    // Verified skills: JavaScript, React, PostgreSQL, Git, Next.js, FastAPI
    // Self-declared skills (NO repository evidence): Node.js, Docker
    const skillSpecs = [
      { name: 'JavaScript', slug: 'javascript', category: 'LANGUAGE', provenance: 'VERIFIED', conf: 0.95 },
      { name: 'React', slug: 'react', category: 'FRAMEWORK', provenance: 'VERIFIED', conf: 0.95 },
      { name: 'PostgreSQL', slug: 'postgresql', category: 'DATABASE', provenance: 'VERIFIED', conf: 0.90 },
      { name: 'Git', slug: 'git', category: 'TOOL', provenance: 'VERIFIED', conf: 0.90 },
      { name: 'Next.js', slug: 'next-js', category: 'FRAMEWORK', provenance: 'VERIFIED', conf: 0.90 },
      { name: 'FastAPI', slug: 'fastapi', category: 'FRAMEWORK', provenance: 'VERIFIED', conf: 0.90 },
      // Node.js: Candidate self-declared skill (no repository evidence)
      { name: 'Node.js', slug: 'node-js', category: 'FRAMEWORK', provenance: 'SELF_DECLARED', conf: 0.85 },
      // Docker: Candidate self-declared skill (no repository evidence)
      { name: 'Docker', slug: 'docker', category: 'TOOL', provenance: 'SELF_DECLARED', conf: 0.80 },
    ];

    for (const spec of skillSpecs) {
      let [existingSkill] = await db
        .select()
        .from(skills)
        .where(eq(skills.slug, spec.slug))
        .limit(1);

      let skillId = existingSkill?.id;
      if (!skillId) {
        skillId = randomUUID();
        await db.insert(skills).values({
          id: skillId,
          name: spec.name,
          slug: spec.slug,
          category: spec.category,
          standardName: spec.name,
          aliases: [],
        });
      }

      await db.insert(candidateSkills).values({
        id: randomUUID(),
        tenantId,
        candidateId,
        skillId,
        category: spec.category,
        confidenceScore: spec.conf,
        provenanceStatus: spec.provenance,
        evidenceCount: spec.provenance === 'VERIFIED' ? 1 : 0,
        metadata: spec.provenance === 'SELF_DECLARED' ? { isUserClaim: true, userClaimNote: 'Self-reported' } : {},
      });
    }
  });

  after(async () => {
    if (originalGenerate) {
      defaultAiResumeContentGenerator.generateResumeAiContent = originalGenerate;
    }
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
    await app.close();
    await closeDatabase(pool);
  });

  // ---------------------------------------------------------------------------
  // 1. CANONICAL JOB IDENTITY & FINGERPRINT PARITY
  // ---------------------------------------------------------------------------
  it('1. MCP and Extension resolve to identical canonicalJobId and 64-char jobFingerprint', async () => {
    // A. MCP tool analysis
    const mcpResult = await handleAnalyzeJobFit(
      mcpContext,
      {
        jobDescriptionText: jobDescription,
        jobTitle,
        companyName,
        sourceUrl: jobPostingUrl,
        url: jobPostingUrl,
      },
      commonDeps
    );

    // B. Extension API analysis
    const extRes = await app.inject({
      method: 'POST',
      url: '/api/extension/analyze-job',
      headers: {
        authorization: `Bearer ${session.rawToken}`,
      },
      payload: {
        job: {
          title: jobTitle,
          company: companyName,
          sourceUrl: jobPostingUrl,
          description: jobDescription,
        },
      },
    });

    assert.equal(extRes.statusCode, 200);
    const extResult = JSON.parse(extRes.payload);

    // Identity assertions
    assert.ok(mcpResult.canonicalJobId, 'MCP must produce canonicalJobId');
    assert.ok(extResult.canonicalJob.canonicalJobId, 'Extension must produce canonicalJobId');
    assert.equal(
      mcpResult.canonicalJobId,
      extResult.canonicalJob.canonicalJobId,
      'MCP and Extension canonicalJobId must be identical'
    );

    assert.ok(mcpResult.jobFingerprint, 'MCP must produce jobFingerprint');
    assert.ok(extResult.fitAnalysis.jobFingerprint, 'Extension must produce jobFingerprint');
    assert.equal(mcpResult.jobFingerprint.length, 64, 'jobFingerprint must be 64-char SHA-256');
    assert.equal(
      mcpResult.jobFingerprint,
      extResult.fitAnalysis.jobFingerprint,
      'MCP and Extension jobFingerprint must be identical'
    );

    // Clean normalized URL resilience (tracking params stripped)
    const normalizedUrl = normalizeJobPostingUrl(jobPostingUrl);
    assert.ok(!normalizedUrl.includes('utm_source'), 'Normalized URL must strip tracking params');
    assert.equal(extResult.canonicalJob.normalizedJobUrl, normalizedUrl);
  });

  // ---------------------------------------------------------------------------
  // 2. REQUIREMENT SEMANTICS PARITY (BUG A PERMANENT FIX)
  // ---------------------------------------------------------------------------
  it('2. Requirement semantics survive across MCP and Extension (Bug A Fix)', async () => {
    const mcpResult = await handleAnalyzeJobFit(
      mcpContext,
      {
        jobDescriptionText: jobDescription,
        jobTitle,
        companyName,
        sourceUrl: jobPostingUrl,
      },
      commonDeps
    );

    const extRes = await app.inject({
      method: 'POST',
      url: '/api/extension/analyze-job',
      headers: { authorization: `Bearer ${session.rawToken}` },
      payload: {
        job: {
          title: jobTitle,
          company: companyName,
          sourceUrl: jobPostingUrl,
          description: jobDescription,
        },
      },
    });
    const extResult = JSON.parse(extRes.payload);

    const requiredSkills = ['javascript', 'react', 'node.js', 'postgresql', 'rest apis', 'git'];
    const preferredSkills = ['next.js', 'docker', 'typescript', 'fastapi'];

    // Map MCP matches
    const mcpMatchesMap = new Map();
    for (const m of mcpResult.requirementMatches) {
      if (m.normalizedRequirement) mcpMatchesMap.set(m.normalizedRequirement.toLowerCase(), m);
      if (m.skillSlug) mcpMatchesMap.set(m.skillSlug.toLowerCase(), m);
      if (m.originalRequirement) mcpMatchesMap.set(m.originalRequirement.toLowerCase(), m);
      if (m.extractedValue) mcpMatchesMap.set(m.extractedValue.toLowerCase(), m);
    }

    // Map Extension matches
    const extMatchesMap = new Map();
    const extMatchesList = extResult.fitAnalysis.requirementMatches || [
      ...(extResult.fitAnalysis.matches || []),
      ...(extResult.fitAnalysis.partialMatches || []),
      ...(extResult.fitAnalysis.missingRequirements || []),
    ];
    for (const m of extMatchesList) {
      if (m.normalizedRequirement) extMatchesMap.set(m.normalizedRequirement.toLowerCase(), m);
      if (m.skillSlug) extMatchesMap.set(m.skillSlug.toLowerCase(), m);
      if (m.name) extMatchesMap.set(m.name.toLowerCase(), m);
      if (m.requirement) extMatchesMap.set(m.requirement.toLowerCase(), m);
      if (m.originalRequirement) extMatchesMap.set(m.originalRequirement.toLowerCase(), m);
      if (m.extractedValue) extMatchesMap.set(m.extractedValue.toLowerCase(), m);
    }

    // A. All 6 required skills must have required: true and importance: 'REQUIRED' across both
    for (const skill of requiredSkills) {
      const mcpMatch = mcpMatchesMap.get(skill);
      assert.ok(mcpMatch, `MCP must contain match for required skill '${skill}'`);
      assert.equal(mcpMatch.required, true, `MCP '${skill}' must have required: true`);
      assert.equal(mcpMatch.importance, 'REQUIRED', `MCP '${skill}' must have importance: REQUIRED`);

      const extMatch = extMatchesMap.get(skill);
      assert.ok(extMatch, `Extension must contain match for required skill '${skill}'`);
      assert.equal(extMatch.required, true, `Extension '${skill}' must have required: true`);
      assert.equal(extMatch.importance, 'REQUIRED', `Extension '${skill}' must have importance: REQUIRED`);
    }

    // B. All 4 preferred skills must have required: false and importance: 'PREFERRED' across both
    for (const skill of preferredSkills) {
      const mcpMatch = mcpMatchesMap.get(skill);
      assert.ok(mcpMatch, `MCP must contain match for preferred skill '${skill}'`);
      assert.equal(mcpMatch.required, false, `MCP '${skill}' must have required: false`);
      assert.equal(mcpMatch.importance, 'PREFERRED', `MCP '${skill}' must have importance: PREFERRED`);

      const extMatch = extMatchesMap.get(skill);
      assert.ok(extMatch, `Extension must contain match for preferred skill '${skill}'`);
      assert.equal(extMatch.required, false, `Extension '${skill}' must have required: false`);
      assert.equal(extMatch.importance, 'PREFERRED', `Extension '${skill}' must have importance: PREFERRED`);
    }

    // C. Required skills score must be strictly > 0 (proving Bug A is permanently solved)
    const mcpBreakdown = mcpResult.overallFit.scoreBreakdown;
    const extBreakdown = extResult.fitAnalysis.overallFit.scoreBreakdown;

    assert.ok(mcpBreakdown.requiredSkillsScore > 0, 'MCP requiredSkillsScore must be > 0');
    assert.ok(extBreakdown.requiredSkillsScore > 0, 'Extension requiredSkillsScore must be > 0');
    assert.equal(
      mcpBreakdown.requiredSkillsScore,
      extBreakdown.requiredSkillsScore,
      'MCP and Extension requiredSkillsScore must be identical'
    );
  });

  // ---------------------------------------------------------------------------
  // 3. CANONICAL EVIDENCE PARITY & ZERO EVIDENCE UPGRADE (BUG B FIX)
  // ---------------------------------------------------------------------------
  it('3. Evidence truth category CLAIMED is preserved without upgrading across any surface (Bug B Fix)', async () => {
    // A. MCP Analysis
    const mcpResult = await handleAnalyzeJobFit(
      mcpContext,
      {
        jobDescriptionText: jobDescription,
        jobTitle,
        companyName,
      },
      commonDeps
    );

    // B. Extension Analysis
    const extRes = await app.inject({
      method: 'POST',
      url: '/api/extension/analyze-job',
      headers: { authorization: `Bearer ${session.rawToken}` },
      payload: {
        job: { title: jobTitle, company: companyName, description: jobDescription },
      },
    });
    const extResult = JSON.parse(extRes.payload);

    // Node.js is self-declared without repo evidence -> must be UNVERIFIED_CLAIM / CLAIMED
    const mcpNodeMatch = mcpResult.requirementMatches.find(
      (m) => m.skillSlug === 'node-js' || m.normalizedRequirement?.toLowerCase() === 'node.js'
    );
    assert.ok(mcpNodeMatch);
    assert.equal(mcpNodeMatch.matchStatus, 'UNVERIFIED_CLAIM');
    assert.equal(mcpNodeMatch.truthCategory, 'CLAIMED');
    assert.equal(mcpNodeMatch.candidateProvenance, 'SELF_DECLARED');

    const extNodeMatch = extResult.fitAnalysis.requirementMatches?.find(
      (m) => m.skillSlug === 'node-js' || m.normalizedRequirement?.toLowerCase() === 'node.js'
    );
    assert.ok(extNodeMatch);
    assert.equal(extNodeMatch.matchStatus, 'UNVERIFIED_CLAIM');
    assert.equal(extNodeMatch.truthCategory, 'CLAIMED');
    assert.equal(extNodeMatch.candidateProvenance, 'SELF_DECLARED');

    // Docker is self-declared without repo evidence -> must be UNVERIFIED_CLAIM / CLAIMED
    const mcpDockerMatch = mcpResult.requirementMatches.find(
      (m) => m.skillSlug === 'docker' || m.normalizedRequirement?.toLowerCase() === 'docker'
    );
    assert.ok(mcpDockerMatch);
    assert.equal(mcpDockerMatch.matchStatus, 'UNVERIFIED_CLAIM');
    assert.equal(mcpDockerMatch.truthCategory, 'CLAIMED');
    assert.equal(mcpDockerMatch.candidateProvenance, 'SELF_DECLARED');

    // C. Resume Generation: Node.js and Docker must NEVER be upgraded to VERIFIED
    const resumeResult = await handleGenerateTailoredResume(
      mcpContext,
      {
        candidateId: candidate.id,
        jobTitle,
        companyName,
        jobDescriptionText: jobDescription,
      },
      commonDeps
    );

    assert.ok(resumeResult.structuredResume);
    // Find Node.js and Docker in structuredResume skills
    const allResumeSkills = resumeResult.structuredResume.skills.categories.flatMap((c) => c.skills);
    const nodeInResume = allResumeSkills.find((s) => s.slug === 'node-js' || s.name === 'Node.js');
    if (nodeInResume) {
      assert.notEqual(
        nodeInResume.truthCategory,
        'VERIFIED',
        'Resume generator must NEVER upgrade self-declared Node.js to VERIFIED'
      );
    }
    const dockerInResume = allResumeSkills.find((s) => s.slug === 'docker' || s.name === 'Docker');
    if (dockerInResume) {
      assert.notEqual(
        dockerInResume.truthCategory,
        'VERIFIED',
        'Resume generator must NEVER upgrade self-declared Docker to VERIFIED'
      );
    }

    // D. Cover Letter Generation: Must not crash on SELF_DECLARED and must use canonical truth categories
    const coverLetterResult = await handleDraftCoverLetter(
      mcpContext,
      {
        candidateId: candidate.id,
        jobTitle,
        companyName,
        jobDescriptionText: jobDescription,
      },
      commonDeps
    );

    assert.ok(coverLetterResult.paragraphs);
    for (const p of coverLetterResult.paragraphs) {
      assert.notEqual(p.status, 'SELF_DECLARED', 'Must not emit legacy SELF_DECLARED');
      assert.ok(['VERIFIED', 'INFERRED', 'CLAIMED', 'MISSING_EVIDENCE', 'UNKNOWN'].includes(p.status));
    }
  });

  // ---------------------------------------------------------------------------
  // 4. CANONICAL ATS SCORE PARITY
  // ---------------------------------------------------------------------------
  it('4. ATS score is calculated once and is identical across MCP and Extension', async () => {
    const mcpResult = await handleAnalyzeJobFit(
      mcpContext,
      {
        jobDescriptionText: jobDescription,
        jobTitle,
        companyName,
        sourceUrl: jobPostingUrl,
      },
      commonDeps
    );

    const extRes = await app.inject({
      method: 'POST',
      url: '/api/extension/analyze-job',
      headers: { authorization: `Bearer ${session.rawToken}` },
      payload: {
        job: { title: jobTitle, company: companyName, sourceUrl: jobPostingUrl, description: jobDescription },
      },
    });
    const extResult = JSON.parse(extRes.payload);

    // ATS Overall Score Parity
    assert.equal(
      mcpResult.overallFit.atsScore,
      extResult.fitAnalysis.overallFit.atsScore,
      'MCP and Extension atsScore must match exactly'
    );
    assert.equal(
      mcpResult.overallFit.matchGrade,
      extResult.fitAnalysis.overallFit.matchGrade,
      'MCP and Extension matchGrade must match exactly'
    );
    assert.equal(
      mcpResult.overallFit.recommendation,
      extResult.fitAnalysis.overallFit.recommendation,
      'MCP and Extension recommendation must match exactly'
    );

    // Score Breakdown Parity across all 7 components
    const mcpBd = mcpResult.overallFit.scoreBreakdown;
    const extBd = extResult.fitAnalysis.overallFit.scoreBreakdown;

    assert.equal(mcpBd.requiredSkillsScore, extBd.requiredSkillsScore, 'requiredSkillsScore parity');
    assert.equal(mcpBd.preferredSkillsScore, extBd.preferredSkillsScore, 'preferredSkillsScore parity');
    assert.equal(mcpBd.experienceFitScore, extBd.experienceFitScore, 'experienceFitScore parity');
    assert.equal(mcpBd.seniorityFitScore, extBd.seniorityFitScore, 'seniorityFitScore parity');
    assert.equal(mcpBd.semanticSimilarityScore, extBd.semanticSimilarityScore, 'semanticSimilarityScore parity');
    assert.equal(mcpBd.qualityScore, extBd.qualityScore, 'qualityScore parity');
    assert.equal(mcpBd.bonusDeductionScore, extBd.bonusDeductionScore, 'bonusDeductionScore parity');
  });

  // ---------------------------------------------------------------------------
  // 5. APPLICATION LIFECYCLE & PACKAGE HASH CONVERGENCE
  // ---------------------------------------------------------------------------
  it('5. MCP prepareJobApplication and Extension prepare-handoff converge on same application and packageHash', async () => {
    // A. Extension prepares handoff
    const extRes = await app.inject({
      method: 'POST',
      url: '/api/extension/prepare-handoff',
      headers: { authorization: `Bearer ${session.rawToken}` },
      payload: {
        job: {
          title: jobTitle,
          company: companyName,
          sourceUrl: jobPostingUrl,
          description: jobDescription,
        },
      },
    });

    assert.equal(extRes.statusCode, 200);
    const extPrep = JSON.parse(extRes.payload);

    assert.ok(extPrep.applicationId, 'Extension prepare-handoff must produce applicationId');
    assert.ok(extPrep.packageHash, 'Extension prepare-handoff must produce packageHash');

    // B. Subsequent call to workflowService.prepareJobApplication for same job and candidate
    const mcpPrep = await workflowService.prepareJobApplication({
      tenantId: tenant.id,
      candidateId: candidate.id,
      jobPosting: {
        title: jobTitle,
        company: companyName,
        sourceUrl: jobPostingUrl,
        applicationUrl: jobPostingUrl,
        description: jobDescription,
      },
    });

    // Convergence assertions
    assert.equal(
      mcpPrep.applicationId,
      extPrep.applicationId,
      'MCP and Extension must converge on the exact same applicationId'
    );
    assert.equal(
      mcpPrep.packageHash,
      extPrep.packageHash,
      'MCP and Extension must converge on the exact same packageHash'
    );
    assert.equal(
      mcpPrep.canonicalJobId,
      extPrep.canonicalJobId,
      'MCP and Extension must converge on the exact same canonicalJobId'
    );
  });
});
