/**
 * @file Live Integration Tests for Career Artifact Export Engine Service (P6-004)
 *
 * Verifies live execution against PostgreSQL and realistic tailored artifacts:
 * 1. Exports live TailoredResume to JSON_RESUME, MARKDOWN, PLAIN_TEXT, and CANONICAL_JSON
 * 2. Exports live TailoredCoverLetter and PortfolioRecommendation
 * 3. Enforces cross-tenant 404 default-deny isolation in both directions
 * 4. Enforces zero database mutations during on-demand export
 * 5. Guarantees 100% deterministic export output and checksums
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  resourceConnections,
  resources,
  evidenceItems,
} from '../../src/db/schema.js';
import { CareerArtifactExportService } from '../../src/services/career-artifact-export.service.js';
import { ResumeTailoringService } from '../../src/services/resume-tailoring.service.js';
import { CoverLetterDraftingService } from '../../src/services/cover-letter-drafting.service.js';
import { PortfolioRecommendationService } from '../../src/services/portfolio-recommendation.service.js';
import { NotFoundError } from '../../src/errors/index.js';
import { JsonResumeSchema } from '../../src/domain/career/career-artifact-export.schemas.js';

describe('Live Career Artifact Export Service Integration Tests (P6-004)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];

  let exportService;
  let resumeService;
  let coverLetterService;

  let tenantA;
  let userA;
  let candidateA;
  let connectionA;
  let resourceA;
  let evidenceItemA;

  let tenantB;
  let userB;
  let candidateB;

  let tailoredResumeA;
  let tailoredCoverLetterA;
  let portfolioRecommendationA;

  before(async () => {
    exportService = new CareerArtifactExportService();
    resumeService = new ResumeTailoringService();
    coverLetterService = new CoverLetterDraftingService();

    // 1. Provision Tenant A & Candidate A
    [tenantA] = await db
      .insert(tenants)
      .values({
        name: `Tenant A (Export ${testRunId})`,
        slug: `tenant-a-exp-${testRunId}`,
        plan: 'ENTERPRISE',
        status: 'ACTIVE',
      })
      .returning();
    createdTenantIds.push(tenantA.id);

    [userA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `user-a-exp-${testRunId}@example.com`,
        passwordHash: 'argon2_hashed_dummy_value',
        role: 'OWNER',
        displayName: 'Alice Exporter',
        status: 'ACTIVE',
      })
      .returning();

    [candidateA] = await db
      .insert(candidates)
      .values({
        tenantId: tenantA.id,
        userId: userA.id,
        displayName: 'Alice Exporter',
        headline: 'Staff Distributed Systems Engineer',
        summary: 'Expert in Go, PostgreSQL, and scalable stream processing.',
        canonicalEmail: `alice-exp-${testRunId}@example.com`,
        canonicalPhone: '+1-555-0188',
        location: {
          city: 'Seattle',
          region: 'WA',
          countryCode: 'US',
        },
      })
      .returning();

    // 2. Provision Resource Connection & Evidence for Candidate A
    [connectionA] = await db
      .insert(resourceConnections)
      .values({
        tenantId: tenantA.id,
        userId: userA.id,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
        displayName: 'Alice GitHub Account',
        status: 'ACTIVE',
        externalAccountId: `gh-exp-${testRunId}`,
        externalAccountName: 'alice-exp',
        encryptedCredentials: 'enc_credentials_dummy',
        keyVersion: 'v1',
        scopes: ['repo:read'],
      })
      .returning();

    [resourceA] = await db
      .insert(resources)
      .values({
        tenantId: tenantA.id,
        connectionId: connectionA.id,
        candidateId: candidateA.id,
        provider: 'GITHUB_APP',
        resourceType: 'REPOSITORY',
        externalResourceId: `repo-exp-${testRunId}`,
        name: 'stream-processing-engine',
        displayName: 'alice-exp/stream-processing-engine',
        status: 'ACTIVE',
        metadata: {
          primaryLanguage: 'Go',
          languages: ['Go', 'SQL'],
        },
      })
      .returning();

    [evidenceItemA] = await db
      .insert(evidenceItems)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        resourceId: resourceA.id,
        sourceProvider: 'GITHUB_APP',
        evidenceType: 'CODE_IMPORT_USAGE',
        sourceLocation: {
          filePath: 'cmd/engine/main.go',
          commitSha: '3333333333333333333333333333333333333333',
          lineRange: { start: 1, end: 40 },
        },
        confidenceScore: 0.98,
        excerpt: 'package main\n\nimport "github.com/lib/pq"\n// Core streaming pipeline',
        metadata: {
          projectId: resourceA.id,
          verificationQuality: 0.95,
          detectedAt: new Date().toISOString(),
        },
      })
      .returning();

    // 3. Provision Tenant B & Candidate B (For Cross-Tenant Boundary Tests)
    [tenantB] = await db
      .insert(tenants)
      .values({
        name: `Tenant B (Export ${testRunId})`,
        slug: `tenant-b-exp-${testRunId}`,
        plan: 'STARTER',
        status: 'ACTIVE',
      })
      .returning();
    createdTenantIds.push(tenantB.id);

    [userB] = await db
      .insert(users)
      .values({
        tenantId: tenantB.id,
        email: `user-b-exp-${testRunId}@example.com`,
        passwordHash: 'argon2_hashed_dummy_value',
        role: 'OWNER',
        displayName: 'Bob Stranger',
        status: 'ACTIVE',
      })
      .returning();

    [candidateB] = await db
      .insert(candidates)
      .values({
        tenantId: tenantB.id,
        userId: userB.id,
        displayName: 'Bob Stranger',
        headline: 'Frontend Engineer',
        summary: 'Web developer.',
        canonicalEmail: `bob-exp-${testRunId}@example.com`,
      })
      .returning();

    // 4. Build Realistic Artifact Fixtures for Tenant A
    const jobIdA = crypto.randomUUID();
    const jobDescriptionA = {
      id: jobIdA,
      tenantId: tenantA.id,
      title: 'Principal Stream Processing Engineer',
      companyName: 'DataPulse Systems',
      jobFamily: 'BACKEND',
      requirements: [
        {
          id: crypto.randomUUID(),
          title: 'Go Streaming Architecture',
          skillSlug: 'go',
          priority: 'REQUIRED',
        },
      ],
    };

    const candidateMatchAnalysisA = {
      jobDescriptionId: jobIdA,
      candidateId: candidateA.id,
      tenantId: tenantA.id,
      requirementMatches: [
        {
          requirementId: jobDescriptionA.requirements[0].id,
          requirementTitle: 'Go Streaming Architecture',
          skillSlug: 'go',
          priority: 'REQUIRED',
          status: 'MATCHED',
          matchConfidence: 0.98,
        },
      ],
    };

    const projectRelevanceAnalysisA = {
      jobDescriptionId: jobIdA,
      candidateId: candidateA.id,
      tenantId: tenantA.id,
      projectRankings: [
        {
          projectId: resourceA.id,
          projectName: 'stream-processing-engine',
          projectSlug: 'stream-processing-engine',
          projectType: 'APPLICATION',
          relevanceScore: 95.0,
          relevanceBand: 'HIGH',
          scoreBreakdown: {
            requirementCoverageScore: 48.0,
            architecturalDensityScore: 23.0,
            evidenceQualityScore: 14.0,
            projectCompletenessScore: 5.0,
            recencyScore: 5.0,
            totalScore: 95.0,
          },
          matchedRequirementIds: [jobDescriptionA.requirements[0].id],
          contributingSkills: ['go', 'postgresql'],
          architecturalSignals: ['API_ROUTING', 'DATA_PERSISTENCE', 'TESTING'],
          supportingEvidence: [
            {
              id: evidenceItemA.id,
              resourceId: resourceA.id,
              resourceName: resourceA.name,
              evidenceType: evidenceItemA.evidenceType,
              filePath: evidenceItemA.sourceLocation.filePath,
              commitSha: evidenceItemA.sourceLocation.commitSha,
              lineRange: evidenceItemA.sourceLocation.lineRange,
              excerpt: evidenceItemA.excerpt,
              confidenceScore: evidenceItemA.confidenceScore,
              detectedAt: evidenceItemA.metadata.detectedAt,
            },
          ],
          explanations: [],
          explanation: 'Covers core backend streaming requirements with verified Go code.',
          confidence: 0.98,
          resourcesCount: 1,
        },
      ],
      summary: {
        totalProjectsEvaluated: 1,
        highRelevanceCount: 1,
        mediumRelevanceCount: 0,
        lowRelevanceCount: 0,
        minimalRelevanceCount: 0,
        averageProjectScore: 95.0,
      },
      analyzedAt: new Date().toISOString(),
    };

    const atsFitAnalysisA = {
      overallFitScore: 95.0,
      fitBand: 'EXCELLENT_FIT',
    };

    const contextA = { tenantId: tenantA.id, userId: userA.id };

    candidateA.canonical = {
      id: candidateA.id,
      tenantId: tenantA.id,
      displayName: candidateA.displayName,
      headline: candidateA.headline,
      summary: candidateA.summary,
      canonicalEmail: candidateA.canonicalEmail,
      canonicalPhone: candidateA.canonicalPhone,
      location: candidateA.location,
      skills: [
        {
          id: crypto.randomUUID(),
          name: 'Go',
          slug: 'go',
          skillSlug: 'go',
          category: 'LANGUAGE',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.98,
        },
        {
          id: crypto.randomUUID(),
          name: 'PostgreSQL',
          slug: 'postgresql',
          skillSlug: 'postgresql',
          category: 'DATABASE',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.95,
        },
      ],
      experience: [
        {
          company: 'DataStream Corp',
          title: 'Senior Systems Engineer',
          startDate: '2020-01-01',
          endDate: null,
          isCurrent: true,
          location: 'Seattle, WA',
          bullets: ['Engineered high-throughput event pipelines in Go.'],
          verified: true,
        },
      ],
      projects: [
        {
          id: resourceA.id,
          tenantId: tenantA.id,
          candidateId: candidateA.id,
          name: 'stream-processing-engine',
          slug: 'stream-processing-engine',
          description: 'High-throughput stream processing pipeline built in Go.',
          isOwner: true,
          role: 'OWNER',
          commitSharePercentage: 95,
          isFork: false,
          demoUrl: 'https://stream.datapulse.io',
          repositoryUrl: 'https://github.com/alice/stream-engine',
        },
      ],
    };

    candidateB.canonical = {
      id: candidateB.id,
      tenantId: tenantB.id,
      displayName: candidateB.displayName,
      skills: [],
      projects: [],
    };

    // Generate Tailored Resume, Cover Letter, and Portfolio Recommendation
    tailoredResumeA = await resumeService.tailorResume(
      contextA,
      candidateA.canonical,
      jobDescriptionA,
      candidateMatchAnalysisA,
      projectRelevanceAnalysisA,
      []
    );

    tailoredCoverLetterA = await coverLetterService.draftCoverLetter(
      contextA,
      candidateA.canonical,
      jobDescriptionA,
      candidateMatchAnalysisA,
      projectRelevanceAnalysisA,
      atsFitAnalysisA,
      []
    );

    portfolioRecommendationA = PortfolioRecommendationService.recommendPortfolio(
      contextA,
      candidateA.canonical,
      jobDescriptionA,
      candidateMatchAnalysisA,
      projectRelevanceAnalysisA,
      atsFitAnalysisA
    );
  });

  after(async () => {
    // Clean up created test tenants
    for (const tId of createdTenantIds) {
      await db.delete(evidenceItems).where(eq(evidenceItems.tenantId, tId));
      await db.delete(resources).where(eq(resources.tenantId, tId));
      await db.delete(resourceConnections).where(eq(resourceConnections.tenantId, tId));
      await db.delete(candidates).where(eq(candidates.tenantId, tId));
      await db.delete(users).where(eq(users.tenantId, tId));
      await db.delete(tenants).where(eq(tenants.id, tId));
    }
    await closeDatabase();
  });

  // -------------------------------------------------------------------------
  // Live Integration Test Cases
  // -------------------------------------------------------------------------

  it('1. exports live TailoredResume across all 4 formats with verified JSON Resume schema validation', () => {
    const context = { tenantId: tenantA.id, userId: userA.id };

    // Format 1: JSON_RESUME
    const expJsonResume = exportService.exportResume(
      context,
      tailoredResumeA,
      candidateA.canonical,
      {
        format: 'JSON_RESUME',
      }
    );
    assert.strictEqual(expJsonResume.format, 'JSON_RESUME');
    assert.strictEqual(expJsonResume.mimeType, 'application/json');
    const parsedJson = JSON.parse(expJsonResume.content);
    assert.doesNotThrow(() => JsonResumeSchema.parse(parsedJson));
    assert.strictEqual(parsedJson.basics.name, 'Alice Exporter');
    assert.ok(parsedJson.meta.antigravity);

    // Format 2: MARKDOWN
    const expMd = exportService.exportResume(context, tailoredResumeA, candidateA.canonical, {
      format: 'MARKDOWN',
      citationStyle: 'INLINE',
    });
    assert.strictEqual(expMd.format, 'MARKDOWN');
    assert.strictEqual(expMd.mimeType, 'text/markdown');
    assert.ok(expMd.content.includes('# Alice Exporter'));
    assert.ok(expMd.content.includes('## Professional Experience'));

    // Format 3: PLAIN_TEXT
    const expTxt = exportService.exportResume(context, tailoredResumeA, candidateA.canonical, {
      format: 'PLAIN_TEXT',
    });
    assert.strictEqual(expTxt.format, 'PLAIN_TEXT');
    assert.strictEqual(expTxt.mimeType, 'text/plain');
    assert.ok(expTxt.content.includes('ALICE EXPORTER'));
    assert.ok(expTxt.content.includes('=== EXPERIENCE ==='));

    // Format 4: CANONICAL_JSON
    const expCanonical = exportService.exportResume(
      context,
      tailoredResumeA,
      candidateA.canonical,
      {
        format: 'CANONICAL_JSON',
      }
    );
    assert.strictEqual(expCanonical.format, 'CANONICAL_JSON');
    assert.strictEqual(expCanonical.mimeType, 'application/json');
  });

  it('2. exports live TailoredCoverLetter and PortfolioRecommendation to Markdown and Plain Text', () => {
    const context = { tenantId: tenantA.id, userId: userA.id };

    // Cover letter export
    const expLetterMd = exportService.exportCoverLetter(
      context,
      tailoredCoverLetterA,
      candidateA.canonical,
      {
        format: 'MARKDOWN',
      }
    );
    assert.ok(expLetterMd.content.includes('# Cover Letter: Alice Exporter'));
    assert.ok(expLetterMd.content.includes('DataPulse Systems'));

    // Portfolio export
    const expPortfolioMd = exportService.exportPortfolio(
      context,
      portfolioRecommendationA,
      candidateA.canonical,
      {
        format: 'MARKDOWN',
      }
    );
    assert.ok(expPortfolioMd.content.includes('# Portfolio Strategy & Case Studies'));
    assert.ok(expPortfolioMd.content.includes('stream-processing-engine'));
  });

  it('3. enforces cross-tenant 404 default-deny isolation in both directions', () => {
    const contextA = { tenantId: tenantA.id, userId: userA.id };
    const contextB = { tenantId: tenantB.id, userId: userB.id };

    // Tenant B context attempting to export Tenant A resume
    assert.throws(
      () => exportService.exportResume(contextB, tailoredResumeA, candidateA.canonical),
      NotFoundError
    );

    // Tenant A context attempting to export Tenant B candidate
    assert.throws(
      () => exportService.exportResume(contextA, tailoredResumeA, candidateB.canonical),
      NotFoundError
    );
  });

  it('4. guarantees zero database mutations during on-demand export execution', async () => {
    const context = { tenantId: tenantA.id, userId: userA.id };

    // Query row counts prior to export
    const [cCountBefore] = await db
      .select({ count: sql`count(*)` })
      .from(candidates)
      .where(eq(candidates.tenantId, tenantA.id));
    const [eCountBefore] = await db
      .select({ count: sql`count(*)` })
      .from(evidenceItems)
      .where(eq(evidenceItems.tenantId, tenantA.id));

    // Execute multiple exports
    exportService.exportResume(context, tailoredResumeA, candidateA.canonical, {
      format: 'JSON_RESUME',
    });
    exportService.exportResume(context, tailoredResumeA, candidateA.canonical, {
      format: 'MARKDOWN',
    });
    exportService.exportCoverLetter(context, tailoredCoverLetterA, candidateA.canonical, {
      format: 'PLAIN_TEXT',
    });
    exportService.exportPortfolio(context, portfolioRecommendationA, candidateA.canonical, {
      format: 'CANONICAL_JSON',
    });

    // Query row counts after export
    const [cCountAfter] = await db
      .select({ count: sql`count(*)` })
      .from(candidates)
      .where(eq(candidates.tenantId, tenantA.id));
    const [eCountAfter] = await db
      .select({ count: sql`count(*)` })
      .from(evidenceItems)
      .where(eq(evidenceItems.tenantId, tenantA.id));

    assert.strictEqual(Number(cCountAfter.count), Number(cCountBefore.count));
    assert.strictEqual(Number(eCountAfter.count), Number(eCountBefore.count));
  });

  it('5. guarantees 100% deterministic export output and SHA-256 checksums', () => {
    const context = { tenantId: tenantA.id, userId: userA.id };

    const exp1 = exportService.exportResume(context, tailoredResumeA, candidateA.canonical, {
      format: 'MARKDOWN',
      citationStyle: 'INLINE',
    });
    const exp2 = exportService.exportResume(context, tailoredResumeA, candidateA.canonical, {
      format: 'MARKDOWN',
      citationStyle: 'INLINE',
    });

    assert.strictEqual(exp1.content, exp2.content);
    assert.strictEqual(exp1.sha256Checksum, exp2.sha256Checksum);
  });
});
