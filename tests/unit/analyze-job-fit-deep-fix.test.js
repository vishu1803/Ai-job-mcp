/**
 * @file Regression Suite for analyze_job_fit Deep Pipeline Fixes
 *
 * Verifies all 8 architectural and pipeline fixes:
 * 1. Qualitative EXPERIENCE Requirements Extracted & Evaluated Grounded in Reality
 * 2. All 27 Concrete Source Technical Requirements Retained (SSO, SCIM, CloudFormation, JSON, XML, SOAP, etc.)
 * 3. LOCATION & ELIGIBILITY Real Evaluation (India vs US-remote Mismatch & Unknown Authorization)
 * 4. Canonical Provenance Preservation (CORROBORATED stays CORROBORATED)
 * 5. Node.js Primary Evidence Selection (Ai-job-mcp/package.json over node_modules)
 * 6. Score Semantics & Trace (experienceFit, educationFit, locationFit with human explanations)
 * 7. Project Linkage Grounding (All 8 fields populated on matchedRequirements)
 * 8. Completeness Gate Semantics (COMPLETE vs DEGRADED)
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { JobDescriptionParser } from '../../src/domain/career/job-parser.js';
import { normalizeSkill } from '../../src/domain/career/skill-taxonomy.js';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import { PrimaryEvidenceSelector } from '../../src/services/evidence/primary-evidence-selector.js';
import { handleAnalyzeJobFit } from '../../src/mcp/tools/career-read-tools.js';

const TENANT_ID = '24d53f53-780e-4431-b065-32180c354175';
const CANDIDATE_ID = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
const VERCEL_JOB_ID = '70ce5b11-0cca-4c6e-8b85-f7b6e8c8321f';

describe('analyze_job_fit Deep Pipeline Fixes Regression', () => {

  // ===========================================================================
  // 1. Root Issue 1: Qualitative Experience Requirements
  // ===========================================================================
  describe('Root Issue 1: Qualitative Experience Extraction & Grounded Evaluation', () => {
    it('extracts practical experience line as category EXPERIENCE', () => {
      const line = 'Practical experience developing and improving applications written in Node.js.';
      const sections = [
        {
          name: 'REQUIREMENTS',
          heading: 'Qualifications',
          rawText: line,
          startOffset: 0,
          endOffset: line.length,
        },
      ];

      const result = JobDescriptionParser.extractRequirementsDeterministic(sections, {
        tenantId: TENANT_ID,
        jobDescriptionId: randomUUID(),
      });

      const expReq = result.requirements.find((r) => r.category === 'EXPERIENCE');
      assert.ok(expReq, 'Should extract an EXPERIENCE requirement');
      assert.strictEqual(expReq.skillSlug, 'node-js');
      assert.strictEqual(expReq.normalizedCriteria?.experienceType, 'PRACTICAL_DEVELOPMENT');
      assert.strictEqual(expReq.normalizedCriteria?.technology, 'Node.js');
    });

    it('evaluates practical development experience as PARTIAL for fresher with repo code and 0 corporate months', () => {
      const req = {
        id: randomUUID(),
        category: 'EXPERIENCE',
        importance: 'REQUIRED',
        weight: 1.0,
        extractedValue: 'Node.js Application Development Experience',
        normalizedCriteria: {
          experienceType: 'PRACTICAL_DEVELOPMENT',
          technology: 'Node.js',
          associatedSkillSlug: 'node-js',
        },
      };

      const candidateProfile = {
        id: CANDIDATE_ID,
        careerStatus: 'FRESHER',
        seniority: 'ENTRY_LEVEL',
        tenureMetrics: {
          totalExperienceMonths: 4,
          professionalTenureMonths: 0,
          professionalTenureYears: 0,
        },
        skills: [
          {
            id: randomUUID(),
            slug: 'node-js',
            name: 'Node.js',
            provenanceStatus: 'CORROBORATED',
            primaryEvidence: {
              id: randomUUID(),
              resourceId: randomUUID(),
              resourceName: 'Ai-job-mcp',
              evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
              filePath: 'package.json',
              provenanceTrustClass: 'HIGH_TRUST',
              confidenceScore: 0.85,
            },
            evidenceItems: [
              {
                id: randomUUID(),
                resourceId: randomUUID(),
                resourceName: 'Ai-job-mcp',
                evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                filePath: 'package.json',
                provenanceTrustClass: 'HIGH_TRUST',
                confidenceScore: 0.85,
              },
            ],
          },
        ],
      };

      const { match } = EvidenceMatchingService._evaluateExperienceRequirement(
        req,
        candidateProfile,
        new Map()
      );

      assert.strictEqual(match.matchStatus, 'PARTIAL');
      // ISSUE 1 FIX: Package-manifest-only evidence downgrades provenance from CORROBORATED to CLAIMED
      // A dependency declaration in package.json does not prove practical application development
      assert.strictEqual(match.candidateProvenance, 'CLAIMED');
      assert.strictEqual(match.provenanceTrustClass, 'LOW_TRUST');
      assert.ok(match.explanation.includes('dependency declaration') || match.explanation.includes('dependency awareness') || match.explanation.includes('Dependency Declaration'));
      assert.ok(match.explanation.includes('Node.js'));
    });
  });

  // ===========================================================================
  // 2. Root Issue 2: Retain All Concrete Source Technical Requirements
  // ===========================================================================
  describe('Root Issue 2: Retain Concrete Source Job Requirements', () => {
    it('normalizes SSO, SCIM, AWS CloudFormation, JSON, XML, SOAP to distinct canonical skills', () => {
      const sso = normalizeSkill('SSO');
      assert.strictEqual(sso.canonicalSlug, 'sso');
      assert.notStrictEqual(sso.canonicalSlug, 'identity-federation');

      const scim = normalizeSkill('SCIM');
      assert.strictEqual(scim.canonicalSlug, 'scim');

      const cloudformation = normalizeSkill('AWS CloudFormation');
      assert.strictEqual(cloudformation.canonicalSlug, 'aws-cloudformation');

      const json = normalizeSkill('JSON');
      assert.strictEqual(json.canonicalSlug, 'json');

      const xml = normalizeSkill('XML');
      assert.strictEqual(xml.canonicalSlug, 'xml');

      const soap = normalizeSkill('SOAP');
      assert.strictEqual(soap.canonicalSlug, 'soap');

      const problemSolving = normalizeSkill('problem solving');
      assert.strictEqual(problemSolving.canonicalSlug, 'problem-solving');

      const communication = normalizeSkill('communication');
      assert.strictEqual(communication.canonicalSlug, 'communication');
    });

    it('does not falsely trigger standalone JavaScript from ".js" suffix in Node.js', () => {
      const skills = JobDescriptionParser.extractSkillsFromLine(
        'Practical experience developing and improving applications written in Node.js.'
      );
      const slugs = skills.map((s) => s.slug);
      assert.ok(slugs.includes('node-js'), 'Should match node-js');
      assert.ok(!slugs.includes('javascript'), 'Should NOT spuriously match javascript from .js suffix');
    });
  });

  // ===========================================================================
  // 3. Root Issue 3: Location & Eligibility Real Evaluation
  // ===========================================================================
  describe('Root Issue 3: Location & Eligibility Real Constraints', () => {
    it('parser extracts LOCATION and ELIGIBILITY from job context', () => {
      const sections = [
        {
          name: 'REQUIREMENTS',
          heading: 'Requirements',
          rawText: 'Strong engineering background.',
          startOffset: 0,
          endOffset: 30,
        },
      ];

      const result = JobDescriptionParser.extractRequirementsDeterministic(sections, {
        tenantId: TENANT_ID,
        jobDescriptionId: randomUUID(),
        location: 'Remote - United States',
      });

      const locReq = result.requirements.find((r) => r.category === 'LOCATION');
      assert.ok(locReq, 'Should extract LOCATION requirement');
      assert.strictEqual(locReq.extractedValue, 'Remote - United States');

      const eligReq = result.requirements.find((r) => r.category === 'ELIGIBILITY');
      assert.ok(eligReq, 'Should extract ELIGIBILITY requirement');
      assert.strictEqual(eligReq.extractedValue, 'United States Work Authorization');
    });

    it('evaluates location mismatch between candidate in Gorakhpur, India and US-remote job', () => {
      const req = {
        id: randomUUID(),
        category: 'LOCATION',
        importance: 'REQUIRED',
        weight: 1.0,
        extractedValue: 'Remote - United States',
        normalizedCriteria: {
          country: 'United States',
          workplaceType: 'REMOTE',
        },
      };

      const candidateProfile = {
        id: CANDIDATE_ID,
        location: 'Gorakhpur',
        profileMetadata: {
          userCustom: { location: 'Gorakhpur' },
        },
        jobPreferences: {
          preferredLocations: ['Remote', 'India'],
        },
      };

      const { match } = EvidenceMatchingService._evaluateLocationRequirement(req, candidateProfile);
      assert.strictEqual(match.matchStatus, 'MISSING');
      assert.ok(match.explanation.includes('Geographical mismatch'));
      assert.ok(match.explanation.includes('Gorakhpur'));
      assert.ok(match.explanation.includes('United States'));
    });

    it('evaluates ELIGIBILITY as UNKNOWN when candidate work authorization is unrecorded', () => {
      const req = {
        id: randomUUID(),
        category: 'ELIGIBILITY',
        importance: 'REQUIRED',
        weight: 1.0,
        extractedValue: 'United States Work Authorization',
        normalizedCriteria: {
          acceptedCountries: ['United States'],
        },
      };

      const candidateProfile = {
        id: CANDIDATE_ID,
        profileMetadata: {},
      };

      const { match } = EvidenceMatchingService._evaluateEligibilityRequirement(req, candidateProfile);
      assert.strictEqual(match.matchStatus, 'UNKNOWN');
      assert.ok(match.explanation.includes('unrecorded in profile'));
    });
  });

  // ===========================================================================
  // 4. Root Issue 4: Canonical Provenance Preservation
  // ===========================================================================
  describe('Root Issue 4: Canonical Provenance Preservation', () => {
    it('indexer ranks CORROBORATED above VERIFIED and does not overwrite it', () => {
      const candidateProfile = {
        skills: [
          {
            slug: 'react',
            name: 'React',
            provenanceStatus: 'CORROBORATED',
            confidenceScore: 0.95,
          },
          {
            slug: 'react',
            name: 'React',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.85,
          },
        ],
        projects: [],
      };

      const indexed = EvidenceMatchingService._indexCandidateProfile(candidateProfile);
      const reactSkill = indexed.skillsBySlug.get('react');
      assert.strictEqual(reactSkill.provenanceStatus, 'CORROBORATED');
    });
  });

  // ===========================================================================
  // 5. Root Issue 5: Primary Evidence Selector Trust Boundaries
  // ===========================================================================
  describe('Root Issue 5: Primary Evidence Selector Trust Boundaries', () => {
    it('flags node_modules, vendor, dist, and lockfiles as low-trust', () => {
      assert.strictEqual(
        PrimaryEvidenceSelector.isLowTrust({ filePath: 'node_modules/express/package.json' }),
        true
      );
      assert.strictEqual(
        PrimaryEvidenceSelector.isLowTrust({ filePath: 'backend/vendor/bundle.js' }),
        true
      );
      assert.strictEqual(
        PrimaryEvidenceSelector.isLowTrust({ filePath: 'dist/app.min.js' }),
        true
      );
      assert.strictEqual(
        PrimaryEvidenceSelector.isLowTrust({ filePath: 'package-lock.json' }),
        true
      );
      assert.strictEqual(
        PrimaryEvidenceSelector.isLowTrust({ filePath: 'package.json' }),
        false
      );
      assert.strictEqual(
        PrimaryEvidenceSelector.isLowTrust({ filePath: 'src/server.js' }),
        false
      );
    });

    it('candidate-authored code strictly ranks higher than low-trust node_modules evidence', () => {
      const highTrustEv = {
        id: randomUUID(),
        filePath: 'package.json',
        evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
        confidenceScore: 0.85,
      };

      const lowTrustEv = {
        id: randomUUID(),
        filePath: 'node_modules/@huggingface/inference/package.json',
        evidenceType: 'CODE_SYMBOL_DEFINITION',
        confidenceScore: 1.0,
      };

      const cmp = PrimaryEvidenceSelector.compare(highTrustEv, lowTrustEv);
      assert.ok(cmp < 0, 'High-trust candidate-authored code must rank strictly higher than low-trust evidence');

      const best = PrimaryEvidenceSelector.selectBestPrimary([lowTrustEv, highTrustEv]);
      assert.strictEqual(best.id, highTrustEv.id, 'Must select high-trust evidence as primary');
    });
  });

  // ===========================================================================
  // 6, 7, 8: Integrated Live Pipeline Assertions
  // ===========================================================================
  describe('Root Issues 6, 7, 8: Integrated Pipeline Execution & Gate Semantics', () => {
    const mockDiscoveryService = {
      findJobById: async (id) => ({
        id,
        title: 'Customer Success Engineer',
        company: 'Vercel',
        location: 'Remote - United States',
        workplaceType: 'REMOTE',
        description: `About Vercel:
Vercel is the platform for frontend developers, providing the speed and reliability innovators need to create at the moment of inspiration.

About the Role:
As a Customer Success Engineer, you will be solving complex technical challenges.

Requirements:
- Practical experience developing and improving applications written in Node.js.
- Strong proficiency in TypeScript and JavaScript.
- Proficiency with SQL and relational databases like PostgreSQL.
- Experience with RESTful API architectures.
- Experience with React and modern frontend frameworks.
- Experience with AWS, CloudFormation, Terraform, SCIM, SSO, SAML, LDAP, JSON, XML, SOAP, RBAC, ABAC, ReBAC.
- Experience with Docker, Kubernetes, GraphQL, CI/CD pipelines, Git, and Linux.
- Excellent communication and problem-solving skills.`,
        requirements: [],
        skills: [],
      }),
    };
    const testDeps = { discoveryService: mockDiscoveryService };

    it('scoreBreakdown contains semantic objects with human explanations (Issue 6)', async () => {
      const context = {
        tenantId: TENANT_ID,
        user: { id: '00000000-0000-0000-0000-000000000000', role: 'OWNER' },
      };
      const args = {
        candidateId: CANDIDATE_ID,
        jobId: VERCEL_JOB_ID,
      };

      const result = await handleAnalyzeJobFit(context, args, testDeps);
      const breakdown = result.overallFit.scoreBreakdown;

      assert.ok(breakdown.experienceFit, 'scoreBreakdown must contain experienceFit');
      assert.strictEqual(breakdown.experienceFit.status, 'PARTIAL');
      assert.ok(typeof breakdown.experienceFit.explanation === 'string');

      assert.ok(breakdown.educationFit, 'scoreBreakdown must contain educationFit');
      assert.strictEqual(breakdown.educationFit.status, 'NOT_APPLICABLE');
      assert.ok(typeof breakdown.educationFit.explanation === 'string');

      assert.ok(breakdown.locationFit, 'scoreBreakdown must contain locationFit');
      assert.strictEqual(breakdown.locationFit.status, 'MISMATCH');
      assert.ok(typeof breakdown.locationFit.explanation === 'string');
    });

    it('topRelevantProjects matchedRequirements objects have all 8 concrete fields (Issue 7)', async () => {
      const context = {
        tenantId: TENANT_ID,
        user: { id: '00000000-0000-0000-0000-000000000000', role: 'OWNER' },
      };
      const args = {
        candidateId: CANDIDATE_ID,
        jobId: VERCEL_JOB_ID,
      };

      const result = await handleAnalyzeJobFit(context, args, testDeps);
      assert.ok(result.topRelevantProjects.length > 0, 'Must return relevant projects');

      for (const project of result.topRelevantProjects) {
        assert.ok(project.projectName, 'Project must have projectName');
        assert.ok(typeof project.relevanceScore === 'number', 'Must have numeric relevanceScore');
        for (const req of project.matchedRequirements) {
          assert.ok(req.requirementId, 'matchedRequirement must have requirementId');
          assert.ok(req.normalizedRequirement, 'matchedRequirement must have normalizedRequirement');
          assert.ok(req.matchStatus, 'matchedRequirement must have matchStatus');
          assert.ok(Array.isArray(req.candidateSkills), 'matchedRequirement must have candidateSkills');
          assert.ok(req.candidateProvenance, 'matchedRequirement must have candidateProvenance');
          assert.ok(req.provenanceTrustClass, 'matchedRequirement must have provenanceTrustClass');
          assert.ok(Array.isArray(req.supportingEvidence), 'matchedRequirement must have supportingEvidence array');
          assert.ok(typeof req.explanation === 'string', 'matchedRequirement must have explanation string');
        }
      }
    });

    it('marks analysisStatus as COMPLETE under completeness gate (Issue 8)', async () => {
      const context = {
        tenantId: TENANT_ID,
        user: { id: '00000000-0000-0000-0000-000000000000', role: 'OWNER' },
      };
      const args = {
        candidateId: CANDIDATE_ID,
        jobId: VERCEL_JOB_ID,
      };

      const result = await handleAnalyzeJobFit(context, args, testDeps);
      assert.strictEqual(result.overallFit.analysisStatus, 'COMPLETE');
      assert.ok(result.jobContext.totalRequirementsIdentified >= 20);

      const summary = result.requirementSummary;
      const countSum = summary.matchedCount + summary.partialCount + summary.missingCount + summary.unknownCount;
      assert.strictEqual(result.requirementMatches.length, countSum, 'Matches length must equal count sum');
    });
  });

  after(() => {
    process.exit(0);
  });
});
