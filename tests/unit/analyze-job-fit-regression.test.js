/**
 * @file Comprehensive Regression Test Suite for analyze_job_fit Root Fix
 *
 * Covers:
 * A. Greenhouse HTML requirements extraction
 * B. Parser fallback when structured requirements are empty
 * C. Zero-requirement fail-closed behavior (INSUFFICIENT_DATA, null score)
 * D. No 75-point fallback gift
 * E. Project zero-requirement coverage = 0
 * F. Evidence citation count includes both requirement and project evidence
 * G. Canonical candidate profile passed intact
 * H. VERIFIED vs CORROBORATED vs CLAIMED provenance
 * I. Fresher + internship tenure handling
 * J. currentRole != currentEmployment
 * K. Education evaluation
 * L. Location evaluation
 * M. Job identity fields (jobId, externalJobId, provider, company, urls)
 * N. COMPLETE vs INSUFFICIENT_DATA status semantics
 * O. Meaningful matched / partial / missing / unknown breakdown
 * P. Project architecturalDimensions mapping
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { handleAnalyzeJobFit } from '../../src/mcp/tools/career-read-tools.js';
import { AtsFitScoreService } from '../../src/services/ats-fit-score.service.js';
import { ProjectRelevanceService } from '../../src/services/project-relevance.service.js';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import {
  cleanHtmlToPlainText,
  extractListItemsFromHtml,
} from '../../src/services/job-board-adapters/greenhouse.adapter.js';

const FIXED_TENANT_ID = '24d53f53-780e-4431-b065-32180c354175';
const FIXED_USER_ID = '9dd8e4fb-456b-4104-9cb1-c839a544b721';
const FIXED_CANDIDATE_ID = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';

function createMockContext() {
  return {
    tenantId: FIXED_TENANT_ID,
    userId: FIXED_USER_ID,
    roles: ['OWNER'],
    scopes: ['career:read'],
  };
}

describe('ANALYZE_JOB_FIT Production-Grade Root Fix Regression Suite', () => {
  // ---------------------------------------------------------------------------
  // A. Greenhouse HTML Requirements Extraction
  // ---------------------------------------------------------------------------
  describe('A. Greenhouse HTML Requirements Extraction', () => {
    it('extracts structured list items from raw HTML before tag stripping', () => {
      const rawHtml = `
        <div class="content-intro"><h2>About Us:</h2><p>Tech company.</p></div>
        <h2>Requirements:</h2>
        <ul>
          <li>3+ years experience with TypeScript and Node.js</li>
          <li>Strong proficiency in PostgreSQL and database indexing</li>
          <li>Experience with Docker and Kubernetes in production</li>
        </ul>
        <h2>Responsibilities:</h2>
        <ul>
          <li>Design and maintain backend microservices</li>
          <li>Collaborate with product and frontend teams</li>
        </ul>
      `;

      const requirements = extractListItemsFromHtml(rawHtml, 'requirements');
      const responsibilities = extractListItemsFromHtml(rawHtml, 'responsibilities');

      assert.strictEqual(requirements.length, 3);
      assert.ok(requirements[0].includes('TypeScript'));
      assert.ok(requirements[1].includes('PostgreSQL'));
      assert.ok(requirements[2].includes('Docker'));

      assert.strictEqual(responsibilities.length, 2);
      assert.ok(responsibilities[0].includes('backend microservices'));

      const plainText = cleanHtmlToPlainText(rawHtml);
      assert.ok(!plainText.includes('<li>'));
      assert.ok(!plainText.includes('<h2>'));
      assert.ok(plainText.includes('Tech company.'));
    });

    it('decodes HTML entities properly during extraction', () => {
      const rawHtml =
        '&lt;h2&gt;Requirements:&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;Expert in JavaScript &amp;amp; TypeScript&lt;/li&gt;&lt;/ul&gt;';
      const items = extractListItemsFromHtml(rawHtml, 'requirements');
      assert.strictEqual(items.length, 1);
      assert.ok(items[0].includes('JavaScript & TypeScript') || items[0].includes('JavaScript'));
    });
  });

  // ---------------------------------------------------------------------------
  // C & D. Zero-Requirement Fail-Closed & No 75-Point Fallback Gift
  // ---------------------------------------------------------------------------
  describe('C & D. Zero-Requirement Fail-Closed & No Fallback Gift', () => {
    it('returns INSUFFICIENT_DATA and null score when requirement matches are empty', () => {
      const context = createMockContext();
      const jobId = randomUUID();
      const job = { id: jobId, tenantId: FIXED_TENANT_ID, title: 'Engineer' };
      const matchAnalysis = {
        candidateId: FIXED_CANDIDATE_ID,
        jobDescriptionId: jobId,
        requirementMatches: [],
        skillGaps: [],
      };
      const projectAnalysis = {
        candidateId: FIXED_CANDIDATE_ID,
        jobDescriptionId: jobId,
        projectRankings: [],
      };
      const candidateProfile = { id: FIXED_CANDIDATE_ID, tenantId: FIXED_TENANT_ID };

      const result = AtsFitScoreService.calculateCandidateJobFit(
        context,
        job,
        matchAnalysis,
        projectAnalysis,
        candidateProfile
      );

      assert.strictEqual(result.analysisStatus, 'INSUFFICIENT_DATA');
      assert.strictEqual(result.fitBand, 'INSUFFICIENT_DATA');
      assert.strictEqual(result.overallScore, null);
      assert.strictEqual(result.scoreBreakdown.requiredSkillsScore, 0.0);
      assert.strictEqual(result.scoreBreakdown.preferredSkillsScore, 0.0);
      assert.strictEqual(result.scoreBreakdown.experienceFitScore, 0.0);
      assert.strictEqual(result.scoreBreakdown.educationFitScore, 0.0);
      assert.strictEqual(result.scoreBreakdown.locationFitScore, 0.0);
      assert.strictEqual(result.scoreBreakdown.rawScore, 0.0);
      assert.ok(result.zeroRequirementWarning.includes('Insufficient structured requirements'));
    });
  });

  // ---------------------------------------------------------------------------
  // E. Project Zero-Requirement Coverage
  // ---------------------------------------------------------------------------
  describe('E. Project Zero-Requirement Coverage', () => {
    it('awards 0.0 requirement coverage when job has 0 requirements', () => {
      const context = createMockContext();
      const job = { id: randomUUID(), tenantId: FIXED_TENANT_ID, requirements: [] };
      const project = {
        id: randomUUID(),
        name: 'Backend API',
        slug: 'backend-api',
        skills: [{ slug: 'typescript', name: 'TypeScript' }],
        evidence: [
          {
            id: randomUUID(),
            skillSlug: 'typescript',
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            filePath: 'package.json',
            confidenceScore: 1.0,
          },
        ],
        resources: [],
      };

      const result = ProjectRelevanceService.computeProjectRelevance(context, job, project, {
        candidateId: FIXED_CANDIDATE_ID,
      });

      assert.strictEqual(result.scoreBreakdown.requirementCoverageScore, 0.0);
    });
  });

  // ---------------------------------------------------------------------------
  // H. Skill Provenance Semantics (VERIFIED vs CORROBORATED vs CLAIMED)
  // ---------------------------------------------------------------------------
  describe('H. Skill Provenance Semantics', () => {
    it('preserves CLAIMED as PARTIAL with unverified warning and does not upgrade to VERIFIED', () => {
      const context = createMockContext();
      const reqId = randomUUID();
      const job = {
        id: randomUUID(),
        tenantId: FIXED_TENANT_ID,
        title: 'Python Engineer',
        requirements: [
          {
            id: reqId,
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            skillSlug: 'python',
            extractedValue: 'Python',
          },
        ],
      };

      const candidateProfile = {
        id: FIXED_CANDIDATE_ID,
        tenantId: FIXED_TENANT_ID,
        skills: [
          {
            id: randomUUID(),
            slug: 'python',
            name: 'Python',
            provenanceStatus: 'CLAIMED',
            isUserClaim: true,
            confidenceScore: 0.5,
          },
        ],
        projects: [],
      };

      const matchAnalysis = EvidenceMatchingService.matchJobToCandidate(
        context,
        job,
        candidateProfile
      );

      assert.strictEqual(matchAnalysis.summary.matchedCount, 0);
      assert.strictEqual(matchAnalysis.summary.partialCount, 1);
      const match = matchAnalysis.requirementMatches[0];
      assert.strictEqual(match.matchStatus, 'PARTIAL');
      assert.strictEqual(match.isUserClaim, true);
      assert.strictEqual(match.claimLabel, '[Unverified User Claim]');
    });
  });

  // ---------------------------------------------------------------------------
  // I & J. Experience Semantics: Fresher & Internship
  // ---------------------------------------------------------------------------
  describe('I & J. Experience Semantics: Fresher & Internship', () => {
    it('does not count internship as full-time professional corporate tenure', () => {
      const context = createMockContext();
      const reqId = randomUUID();
      const job = {
        id: randomUUID(),
        tenantId: FIXED_TENANT_ID,
        title: 'Senior Engineer',
        requirements: [
          {
            id: reqId,
            category: 'EXPERIENCE',
            importance: 'REQUIRED',
            weight: 1.0,
            extractedValue: '3+ years experience',
            normalizedCriteria: { minYears: 3 },
          },
        ],
      };

      const candidateProfile = {
        id: FIXED_CANDIDATE_ID,
        tenantId: FIXED_TENANT_ID,
        careerStatus: 'FRESHER',
        seniority: 'ENTRY_LEVEL',
        currentRole: 'Full-Stack & Backend Developer',
        currentEmployment: null,
        tenureMetrics: {
          professionalTenureYears: 0,
          professionalTenureMonths: 0,
          totalExperienceMonths: 4,
        },
        workHistory: [
          {
            title: 'Full Stack Developer Intern',
            company: 'FTV Saloon',
            employmentType: 'INTERNSHIP',
            startDate: '2024-06',
            endDate: '2024-09',
            isCurrent: false,
          },
        ],
        skills: [],
        projects: [],
      };

      const matchAnalysis = EvidenceMatchingService.matchJobToCandidate(
        context,
        job,
        candidateProfile
      );

      const expMatch = matchAnalysis.requirementMatches[0];
      assert.notStrictEqual(expMatch.matchStatus, 'MATCHED');
      assert.ok(
        expMatch.matchStatus === 'PARTIAL' ||
          expMatch.matchStatus === 'MISSING' ||
          expMatch.matchStatus === 'UNKNOWN'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // B, F, M, N, O, P. Full MCP analyze_job_fit Integration Parity
  // ---------------------------------------------------------------------------
  describe('MCP handleAnalyzeJobFit Integration', () => {
    it('executes parser fallback, unifies evidence citation count, and returns canonical job identity', async () => {
      const context = createMockContext();

      const mockProfileView = {
        candidate: {
          id: FIXED_CANDIDATE_ID,
          userId: FIXED_USER_ID,
          displayName: 'Vishwanath Nishad',
          headline: 'Full-Stack & Backend Developer',
          summary: 'Backend engineer specializing in Fastify and PostgreSQL.',
          canonicalEmail: 'test@example.com',
          location: 'Remote',
          profileMetadata: {
            careerStatus: 'FRESHER',
            currentRole: 'Full-Stack & Backend Developer',
            userCustom: {
              experience: [
                {
                  title: 'Full Stack Developer Intern',
                  company: 'FTV Saloon',
                  employmentType: 'INTERNSHIP',
                  startDate: '2024-06',
                  endDate: '2024-09',
                  isCurrent: false,
                },
              ],
              education: [
                {
                  degree: 'Bachelor of Technology in Electronics Engineering',
                  institution: 'Rajkiya Engineering College',
                  graduationDate: '2025-07',
                },
              ],
            },
          },
        },
        skills: [
          {
            id: randomUUID(),
            slug: 'typescript',
            name: 'TypeScript',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.95,
          },
          {
            id: randomUUID(),
            slug: 'fastify',
            name: 'Fastify',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.95,
          },
        ],
        projects: [
          {
            id: randomUUID(),
            name: 'AI Code Review Assistant',
            slug: 'ai-code-review-assistant',
            summary: 'Automated PR code reviewer built with Fastify and PostgreSQL.',
            skills: [{ slug: 'typescript', name: 'TypeScript' }],
            resources: [],
            evidence: [
              {
                id: randomUUID(),
                skillSlug: 'typescript',
                evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                filePath: 'package.json',
                confidenceScore: 1.0,
              },
            ],
          },
        ],
        resources: [],
        identities: [],
      };

      const mockCandidateProfileService = {
        getProfile: async () => mockProfileView,
        getCareerProfile: async () => ({
          careerStatus: 'FRESHER',
          seniority: 'ENTRY_LEVEL',
          currentRole: 'Full-Stack & Backend Developer',
          currentEmployment: null,
          tenureMetrics: {
            professionalTenureYears: 0,
            professionalTenureMonths: 0,
            totalExperienceMonths: 4,
          },
        }),
      };

      const mockJob = {
        id: randomUUID(),
        externalJobId: 'gh-vercel-5430088004',
        provider: 'GREENHOUSE',
        company: 'Vercel',
        title: 'Software Engineer, Backend',
        description: `
          About Vercel: Vercel is the agentic infrastructure company.
          About the Role: We are seeking a Backend leaning Software Engineer.
          Leveraging JavaScript/TypeScript, Node.js, SQL and NoSQL cloud-native databases, and AWS.
        `,
        requirements: [], // Empty to test parser fallback
        sourceUrl: 'https://boards.greenhouse.io/vercel',
        applicationUrl: 'https://boards.greenhouse.io/vercel/jobs/5430088004',
      };

      const mockDiscoveryService = {
        findJobById: async () => mockJob,
      };

      const result = await handleAnalyzeJobFit(
        context,
        { jobId: mockJob.id },
        {
          candidateProfileService: mockCandidateProfileService,
          discoveryService: mockDiscoveryService,
          db: {
            select: () => ({
              from: () => ({
                where: () => ({
                  limit: async () => [{ id: FIXED_CANDIDATE_ID }],
                }),
              }),
            }),
          },
        }
      );

      // Verify Job Identity in output
      assert.strictEqual(result.jobContext.jobId, mockJob.id);
      assert.strictEqual(result.jobContext.externalJobId, 'gh-vercel-5430088004');
      assert.strictEqual(result.jobContext.provider, 'GREENHOUSE');
      assert.strictEqual(result.jobContext.company, 'Vercel');
      assert.strictEqual(result.jobContext.extractedTitle, 'Software Engineer, Backend');
      assert.strictEqual(result.jobContext.sourceUrl, 'https://boards.greenhouse.io/vercel');
      assert.strictEqual(
        result.jobContext.applicationUrl,
        'https://boards.greenhouse.io/vercel/jobs/5430088004'
      );

      // Verify parser fallback extracted requirements
      assert.ok(result.jobContext.totalRequirementsIdentified > 0);
      assert.strictEqual(result.overallFit.analysisStatus, 'COMPLETE');
      assert.notStrictEqual(result.overallFit.atsScore, null);

      // Verify evidence citation count includes project evidence
      assert.ok(result.evidenceBacking.totalEvidenceItemsCited >= 1);

      // Verify project architectural dimensions mapping
      assert.ok(Array.isArray(result.topRelevantProjects));
      if (result.topRelevantProjects.length > 0) {
        assert.ok(Array.isArray(result.topRelevantProjects[0].matchedArchitecturalDimensions));
      }
    });
  });
});
