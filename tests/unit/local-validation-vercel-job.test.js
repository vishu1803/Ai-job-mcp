/**
 * Local validation test for Issue 1 + Issue 2 fixes.
 * Tests the complete analyze_job_fit behavior for the Vercel job fixture
 * with manifest-only vs source-level evidence scenarios.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';

const TENANT = crypto.randomUUID();
const CANDIDATE_ID = crypto.randomUUID();

describe('Local Validation: Issue 1 + Issue 2 for Vercel job fixture', () => {
  const vercelJobRequirements = [
    // From ABOUT ROLE section
    { id: crypto.randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0, extractedValue: 'JavaScript', skillSlug: 'javascript', originalText: 'JavaScript/TypeScript' },
    { id: crypto.randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0, extractedValue: 'TypeScript', skillSlug: 'typescript', originalText: 'JavaScript/TypeScript' },
    { id: crypto.randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0, extractedValue: 'Node.js', skillSlug: 'node-js', originalText: 'Node.js' },
    { id: crypto.randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0, extractedValue: 'SQL', skillSlug: 'sql', originalText: 'SQL' },
    { id: crypto.randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0, extractedValue: 'AWS', skillSlug: 'aws', originalText: 'AWS' },
    // From ABOUT YOU section
    { id: crypto.randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0, extractedValue: 'React', skillSlug: 'react', originalText: 'React' },
    { id: crypto.randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0, extractedValue: 'PostgreSQL', skillSlug: 'postgresql', originalText: 'SQL' },
    // EXPERIENCE requirement
    {
      id: crypto.randomUUID(), category: 'EXPERIENCE', importance: 'REQUIRED', weight: 1.0,
      extractedValue: 'Node.js Application Development Experience',
      rawSnippet: 'Practical experience developing and improving applications written in Node.js.',
      normalizedCriteria: {
        experienceType: 'PRACTICAL_DEVELOPMENT',
        technology: 'Node.js',
        associatedSkillSlug: 'node-js',
      },
    },
    // SCIM, Terraform, Kubernetes, REST APIs
    { id: crypto.randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0, extractedValue: 'Kubernetes', skillSlug: 'kubernetes', originalText: 'Kubernetes' },
    { id: crypto.randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0, extractedValue: 'Terraform', skillSlug: 'terraform', originalText: 'Terraform' },
    { id: crypto.randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0, extractedValue: 'REST APIs', skillSlug: 'rest-api', originalText: 'REST APIs' },
    // Security requirements
    { id: crypto.randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0, extractedValue: 'LDAP', skillSlug: 'ldap', originalText: 'LDAP' },
    { id: crypto.randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0, extractedValue: 'OAuth2', skillSlug: 'oauth-2-0', originalText: 'OAuth2' },
    { id: crypto.randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0, extractedValue: 'SAML', skillSlug: 'saml', originalText: 'SAML' },
    { id: crypto.randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0, extractedValue: 'SSO', skillSlug: 'sso', originalText: 'SSO' },
    { id: crypto.randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0, extractedValue: 'RBAC', skillSlug: 'rbac', originalText: 'RBAC' },
    // SOAP
    { id: crypto.randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0, extractedValue: 'SOAP', skillSlug: 'soap', originalText: 'SOAP' },
    // LOCATION
    { id: crypto.randomUUID(), category: 'LOCATION', importance: 'REQUIRED', weight: 1.0, extractedValue: 'Remote - United States' },
    // ELIGIBILITY
    { id: crypto.randomUUID(), category: 'ELIGIBILITY', importance: 'REQUIRED', weight: 1.0, extractedValue: 'United States Work Authorization' },
    // DOMAIN
    { id: crypto.randomUUID(), category: 'DOMAIN', importance: 'REQUIRED', weight: 1.0, extractedValue: 'security architecture' },
  ];

  const jobDescription = {
    id: crypto.randomUUID(),
    tenantId: TENANT,
    title: 'Software Engineer, Backend',
    company: 'Vercel',
    location: 'Remote - United States',
    requirements: vercelJobRequirements,
  };

  const fresherProfile = {
    id: CANDIDATE_ID,
    tenantId: TENANT,
    careerStatus: 'FRESHER',
    seniority: 'ENTRY_LEVEL',
    tenureMetrics: {
      totalExperienceMonths: 4,
      professionalTenureMonths: 0,
      professionalTenureYears: 0,
    },
    location: 'Gorakhpur, India',
    skills: [
      // Evidence-backed skills
      { id: crypto.randomUUID(), slug: 'typescript', name: 'TypeScript', provenanceStatus: 'VERIFIED', confidenceScore: 0.95, evidenceItems: [{ id: crypto.randomUUID(), evidenceType: 'CODE_USAGE', filePath: 'src/index.ts', resourceName: 'app', confidenceScore: 0.95 }] },
      { id: crypto.randomUUID(), slug: 'javascript', name: 'JavaScript', provenanceStatus: 'VERIFIED', confidenceScore: 0.95, evidenceItems: [{ id: crypto.randomUUID(), evidenceType: 'CODE_USAGE', filePath: 'src/app.js', resourceName: 'app', confidenceScore: 0.95 }] },
      { id: crypto.randomUUID(), slug: 'react', name: 'React', provenanceStatus: 'VERIFIED', confidenceScore: 0.9, evidenceItems: [{ id: crypto.randomUUID(), evidenceType: 'CODE_USAGE', filePath: 'src/App.tsx', resourceName: 'frontend', confidenceScore: 0.9 }] },
      { id: crypto.randomUUID(), slug: 'postgresql', name: 'PostgreSQL', provenanceStatus: 'CORROBORATED', confidenceScore: 0.85, evidenceItems: [{ id: crypto.randomUUID(), evidenceType: 'CODE_IMPORT_USAGE', filePath: 'src/db.js', resourceName: 'backend', confidenceScore: 0.85 }] },
      // Fastify with MANIFEST-ONLY evidence (the key test case)
      {
        id: crypto.randomUUID(), slug: 'fastify', name: 'Fastify',
        provenanceStatus: 'VERIFIED', confidenceScore: 0.85,
        primaryEvidence: {
          id: crypto.randomUUID(), evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          filePath: 'package.json', resourceName: 'ai-job-board-backend', confidenceScore: 0.85,
        },
        evidenceItems: [
          { id: crypto.randomUUID(), evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY', filePath: 'package.json', resourceName: 'ai-job-board-backend', confidenceScore: 0.85 },
        ],
      },
      // Kubernetes with CLAIMED provenance
      { id: crypto.randomUUID(), slug: 'kubernetes', name: 'Kubernetes', provenanceStatus: 'CLAIMED', isUserClaim: true, confidenceScore: 0.3, evidenceItems: [] },
    ],
    projects: [],
  };

  it('Node.js experience: Fastify manifest-only -> CLAIMED/LOW_TRUST', () => {
    const req = vercelJobRequirements.find(r => r.normalizedCriteria?.experienceType === 'PRACTICAL_DEVELOPMENT');
    const { match } = EvidenceMatchingService._evaluateExperienceRequirement(req, fresherProfile, new Map());

    assert.equal(match.matchStatus, 'PARTIAL');
    assert.equal(match.candidateProvenance, 'CLAIMED',
      'Fastify manifest-only must produce CLAIMED, not VERIFIED');
    assert.equal(match.provenanceTrustClass, 'LOW_TRUST',
      'Fastify manifest-only must produce LOW_TRUST, not HIGH_TRUST');
    assert.ok(match.matchConfidence < 0.5,
      'Confidence should be < 0.5 for manifest-only experience');
    assert.ok(match.explanation.includes('dependency') || match.explanation.includes('Dependency Declaration'),
      'Explanation should indicate manifest-only limitation');
  });

  it('Node.js experience: When Fastify has source evidence -> HIGH_TRUST', () => {
    const req = vercelJobRequirements.find(r => r.normalizedCriteria?.experienceType === 'PRACTICAL_DEVELOPMENT');
    // Clone profile and add source evidence to Fastify
    const profileWithSource = {
      ...fresherProfile,
      skills: fresherProfile.skills.map(s => {
        if (s.slug === 'fastify') {
          return {
            ...s,
            evidenceItems: [
              { id: crypto.randomUUID(), evidenceType: 'CODE_IMPORT_USAGE', filePath: 'src/server.js', resourceName: 'app', confidenceScore: 0.9 },
              { id: crypto.randomUUID(), evidenceType: 'CODE_USAGE', filePath: 'src/routes/api.js', resourceName: 'app', confidenceScore: 0.9 },
            ],
          };
        }
        return s;
      }),
    };

    const { match } = EvidenceMatchingService._evaluateExperienceRequirement(req, profileWithSource, new Map());

    assert.equal(match.candidateProvenance, 'VERIFIED');
    assert.equal(match.provenanceTrustClass, 'HIGH_TRUST');
    assert.ok(match.matchConfidence >= 0.7,
      'Source-level evidence should have higher confidence');
  });

  it('TypeScript: VERIFIED evidence-backed -> MATCHED with HIGH_TRUST', () => {
    const tsReq = vercelJobRequirements.find(r => r.extractedValue === 'TypeScript');
    const { match } = EvidenceMatchingService._evaluateSkillRequirement(tsReq, new Map([
      ['typescript', fresherProfile.skills.find(s => s.slug === 'typescript')],
    ]), new Map());

    assert.equal(match.matchStatus, 'MATCHED');
    assert.equal(match.candidateProvenance, 'VERIFIED');
  });

  it('React: VERIFIED evidence-backed -> MATCHED', () => {
    const reactReq = vercelJobRequirements.find(r => r.extractedValue === 'React');
    const { match } = EvidenceMatchingService._evaluateSkillRequirement(reactReq, new Map([
      ['react', fresherProfile.skills.find(s => s.slug === 'react')],
    ]), new Map());

    assert.equal(match.matchStatus, 'MATCHED');
    assert.equal(match.candidateProvenance, 'VERIFIED');
  });

  it('Kubernetes: CLAIMED only -> PARTIAL with LOW_TRUST', () => {
    const k8sReq = vercelJobRequirements.find(r => r.extractedValue === 'Kubernetes');
    const { match } = EvidenceMatchingService._evaluateSkillRequirement(k8sReq, new Map([
      ['kubernetes', fresherProfile.skills.find(s => s.slug === 'kubernetes')],
    ]), new Map());

    assert.equal(match.matchStatus, 'PARTIAL');
    assert.equal(match.candidateProvenance, 'CLAIMED');
    assert.equal(match.provenanceTrustClass, 'LOW_TRUST');
  });

  it('AWS: no evidence -> MISSING', () => {
    const awsReq = vercelJobRequirements.find(r => r.extractedValue === 'AWS');
    const { match } = EvidenceMatchingService._evaluateSkillRequirement(awsReq, new Map(), new Map());
    assert.equal(match.matchStatus, 'MISSING');
    assert.equal(match.candidateProvenance, 'NONE');
  });

  it('SOAP: no evidence -> MISSING (not inferred from Fastify)', () => {
    const soapReq = vercelJobRequirements.find(r => r.extractedValue === 'SOAP');
    const { match } = EvidenceMatchingService._evaluateSkillRequirement(soapReq, new Map([
      ['fastify', fresherProfile.skills.find(s => s.slug === 'fastify')],
    ]), new Map());
    assert.equal(match.matchStatus, 'MISSING',
      'SOAP must NOT be inferred from Fastify');
  });
});
