/**
 * @file Unit Tests for the Four analyze_job_fit Forensic Fixes
 *
 * Covers:
 * FIX 1 — Prevent framework -> runtime false MATCHED (Next.js -> Node.js)
 * FIX 2 — Correct CLAIMED / SELF_DECLARED trust (LOW_TRUST)
 * FIX 3 — Correct NONE / missing evidence trust (NO_EVIDENCE)
 * FIX 4 — Filter and reprioritize project supporting evidence (code > manifest, reject UI plumbing)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import { ProjectRelevanceService } from '../../src/services/project-relevance.service.js';
import { SkillWorthinessGate } from '../../src/domain/career/skill-worthiness-gate.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

describe('Four Targeted Forensic Fixes for analyze_job_fit', () => {
  // ===========================================================================
  // FIX 1: Prevent framework -> runtime false MATCHED
  // ===========================================================================
  describe('FIX 1 — Framework -> Runtime Matching Guard', () => {
    it('does NOT match Node.js requirement when candidate only has Next.js', () => {
      const candidateProfile = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        skills: [
          {
            id: randomUUID(),
            slug: 'next-js',
            name: 'Next.js',
            provenanceStatus: 'VERIFIED',
            category: 'FRAMEWORK',
            evidence: [
              {
                id: randomUUID(),
                evidenceType: 'CODE_USAGE',
                sourceLocation: { filePath: 'src/pages/index.tsx' },
                confidenceScore: 0.95,
              },
            ],
          },
        ],
        workHistory: [],
        profileMetadata: {},
      };

      const jobRequirements = [
        {
          id: randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          extractedValue: 'Node.js',
          normalizedCriteria: { skillSlug: 'node-js', skillName: 'Node.js' },
        },
      ];

      const jobDescription = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        requirements: jobRequirements,
      };

      const result = EvidenceMatchingService.matchJobToCandidate(
        { tenantId: TENANT_ID },
        jobDescription,
        candidateProfile
      );

      const nodeMatch = result.requirementMatches.find(
        (m) => m.skillSlug === 'node-js' || m.normalizedRequirement === 'Node.js'
      );

      assert.ok(nodeMatch, 'Node.js requirement match should be present');
      assert.notStrictEqual(
        nodeMatch.matchStatus,
        'MATCHED',
        'Next.js alone must NOT grant MATCHED status for Node.js'
      );
      assert.ok(
        nodeMatch.matchStatus === 'PARTIAL' || nodeMatch.matchStatus === 'MISSING',
        `Expected PARTIAL or MISSING, got: ${nodeMatch.matchStatus}`
      );
    });

    it('matches Node.js as MATCHED when candidate has direct verified Node.js', () => {
      const candidateProfile = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        skills: [
          {
            id: randomUUID(),
            slug: 'node-js',
            name: 'Node.js',
            provenanceStatus: 'VERIFIED',
            category: 'LANGUAGE',
            evidence: [
              {
                id: randomUUID(),
                evidenceType: 'CODE_USAGE',
                sourceLocation: { filePath: 'src/server.js' },
                confidenceScore: 0.95,
              },
            ],
          },
        ],
        workHistory: [],
        profileMetadata: {},
      };

      const jobRequirements = [
        {
          id: randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          extractedValue: 'Node.js',
          normalizedCriteria: { skillSlug: 'node-js', skillName: 'Node.js' },
        },
      ];

      const jobDescription = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        requirements: jobRequirements,
      };

      const result = EvidenceMatchingService.matchJobToCandidate(
        { tenantId: TENANT_ID },
        jobDescription,
        candidateProfile
      );

      const nodeMatch = result.requirementMatches.find(
        (m) => m.skillSlug === 'node-js' || m.normalizedRequirement === 'Node.js'
      );

      assert.ok(nodeMatch);
      assert.strictEqual(nodeMatch.matchStatus, 'MATCHED');
    });

    it('preserves valid BUILT_ON relationship: Next.js satisfies React requirement', () => {
      const candidateProfile = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        skills: [
          {
            id: randomUUID(),
            slug: 'next-js',
            name: 'Next.js',
            provenanceStatus: 'VERIFIED',
            category: 'FRAMEWORK',
            evidence: [
              {
                id: randomUUID(),
                evidenceType: 'CODE_USAGE',
                sourceLocation: { filePath: 'src/pages/index.tsx' },
                confidenceScore: 0.95,
              },
            ],
          },
        ],
        workHistory: [],
        profileMetadata: {},
      };

      const jobRequirements = [
        {
          id: randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          extractedValue: 'React',
          normalizedCriteria: { skillSlug: 'react', skillName: 'React' },
        },
      ];

      const jobDescription = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        requirements: jobRequirements,
      };

      const result = EvidenceMatchingService.matchJobToCandidate(
        { tenantId: TENANT_ID },
        jobDescription,
        candidateProfile
      );

      const reactMatch = result.requirementMatches.find(
        (m) => m.skillSlug === 'react' || m.normalizedRequirement === 'React'
      );

      assert.ok(reactMatch);
      assert.strictEqual(reactMatch.matchStatus, 'MATCHED');
      assert.strictEqual(reactMatch.relationshipType, 'BUILT_ON');
    });

    it('preserves valid PARENT_OF relationship: TypeScript satisfies JavaScript requirement', () => {
      const candidateProfile = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        skills: [
          {
            id: randomUUID(),
            slug: 'typescript',
            name: 'TypeScript',
            provenanceStatus: 'VERIFIED',
            category: 'LANGUAGE',
            evidence: [
              {
                id: randomUUID(),
                evidenceType: 'CODE_USAGE',
                sourceLocation: { filePath: 'src/index.ts' },
                confidenceScore: 0.95,
              },
            ],
          },
        ],
        workHistory: [],
        profileMetadata: {},
      };

      const jobRequirements = [
        {
          id: randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          extractedValue: 'JavaScript',
          normalizedCriteria: { skillSlug: 'javascript', skillName: 'JavaScript' },
        },
      ];

      const jobDescription = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        requirements: jobRequirements,
      };

      const result = EvidenceMatchingService.matchJobToCandidate(
        { tenantId: TENANT_ID },
        jobDescription,
        candidateProfile
      );

      const jsMatch = result.requirementMatches.find(
        (m) => m.skillSlug === 'javascript' || m.normalizedRequirement === 'JavaScript'
      );

      assert.ok(jsMatch);
      assert.strictEqual(jsMatch.matchStatus, 'MATCHED');
    });
  });

  // ===========================================================================
  // FIX 2: Correct CLAIMED / SELF_DECLARED trust
  // ===========================================================================
  describe('FIX 2 — CLAIMED / SELF_DECLARED Trust Classification', () => {
    it('sets provenanceTrustClass to LOW_TRUST for CLAIMED skill without evidence', () => {
      const candidateProfile = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        skills: [
          {
            id: randomUUID(),
            slug: 'kubernetes',
            name: 'Kubernetes',
            provenanceStatus: 'CLAIMED',
            category: 'TOOL',
            evidence: [],
          },
        ],
        workHistory: [],
        profileMetadata: {},
      };

      const jobRequirements = [
        {
          id: randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          extractedValue: 'Kubernetes',
          normalizedCriteria: { skillSlug: 'kubernetes', skillName: 'Kubernetes' },
        },
      ];

      const jobDescription = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        requirements: jobRequirements,
      };

      const result = EvidenceMatchingService.matchJobToCandidate(
        { tenantId: TENANT_ID },
        jobDescription,
        candidateProfile
      );

      const k8sMatch = result.requirementMatches[0];
      assert.strictEqual(k8sMatch.candidateProvenance, 'CLAIMED');
      assert.strictEqual(k8sMatch.provenanceTrustClass, 'LOW_TRUST');
    });

    it('sets provenanceTrustClass to LOW_TRUST for SELF_DECLARED skill without evidence', () => {
      const candidateProfile = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        skills: [
          {
            id: randomUUID(),
            slug: 'docker',
            name: 'Docker',
            provenanceStatus: 'SELF_DECLARED',
            category: 'TOOL',
            evidence: [],
          },
        ],
        workHistory: [],
        profileMetadata: {},
      };

      const jobRequirements = [
        {
          id: randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          extractedValue: 'Docker',
          normalizedCriteria: { skillSlug: 'docker', skillName: 'Docker' },
        },
      ];

      const jobDescription = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        requirements: jobRequirements,
      };

      const result = EvidenceMatchingService.matchJobToCandidate(
        { tenantId: TENANT_ID },
        jobDescription,
        candidateProfile
      );

      const dockerMatch = result.requirementMatches[0];
      assert.strictEqual(dockerMatch.candidateProvenance, 'SELF_DECLARED');
      assert.strictEqual(dockerMatch.provenanceTrustClass, 'LOW_TRUST');
    });
  });

  // ===========================================================================
  // FIX 3: Correct NONE / missing evidence trust
  // ===========================================================================
  describe('FIX 3 — NONE / Missing Requirement Trust Classification', () => {
    it('sets provenanceTrustClass to NO_EVIDENCE for MISSING technical skill', () => {
      const candidateProfile = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        skills: [],
        workHistory: [],
        profileMetadata: {},
      };

      const jobRequirements = [
        {
          id: randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          extractedValue: 'Terraform',
          normalizedCriteria: { skillSlug: 'terraform', skillName: 'Terraform' },
        },
      ];

      const jobDescription = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        requirements: jobRequirements,
      };

      const result = EvidenceMatchingService.matchJobToCandidate(
        { tenantId: TENANT_ID },
        jobDescription,
        candidateProfile
      );

      const match = result.requirementMatches[0];
      assert.strictEqual(match.matchStatus, 'MISSING');
      assert.strictEqual(match.candidateProvenance, 'NONE');
      assert.strictEqual(match.provenanceTrustClass, 'NO_EVIDENCE');
      assert.deepStrictEqual(match.candidateSkills, []);
    });

    it('sets provenanceTrustClass to NO_EVIDENCE for MISSING domain requirement', () => {
      const candidateProfile = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        skills: [],
        workHistory: [],
        profileMetadata: { domains: [] },
      };

      const jobRequirements = [
        {
          id: randomUUID(),
          category: 'DOMAIN',
          importance: 'REQUIRED',
          weight: 1.0,
          extractedValue: 'Cybersecurity & Infrastructure',
          normalizedCriteria: { domainSlug: 'cybersecurity' },
        },
      ];

      const jobDescription = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        requirements: jobRequirements,
      };

      const result = EvidenceMatchingService.matchJobToCandidate(
        { tenantId: TENANT_ID },
        jobDescription,
        candidateProfile
      );

      const match = result.requirementMatches[0];
      assert.strictEqual(match.matchStatus, 'MISSING');
      assert.strictEqual(match.candidateProvenance, 'NONE');
      assert.strictEqual(match.provenanceTrustClass, 'NO_EVIDENCE');
      assert.deepStrictEqual(match.candidateSkills, []);
    });

    it('sets provenanceTrustClass to NO_EVIDENCE for MISSING location requirement', () => {
      const candidateProfile = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        location: 'India',
        skills: [],
        workHistory: [],
        profileMetadata: {},
      };

      const jobRequirements = [
        {
          id: randomUUID(),
          category: 'LOCATION',
          importance: 'REQUIRED',
          weight: 1.0,
          extractedValue: 'United States',
          normalizedCriteria: { country: 'United States' },
        },
      ];

      const jobDescription = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        requirements: jobRequirements,
      };

      const result = EvidenceMatchingService.matchJobToCandidate(
        { tenantId: TENANT_ID },
        jobDescription,
        candidateProfile
      );

      const match = result.requirementMatches[0];
      assert.strictEqual(match.matchStatus, 'MISSING');
      assert.strictEqual(match.candidateProvenance, 'NONE');
      assert.strictEqual(match.provenanceTrustClass, 'NO_EVIDENCE');
      assert.deepStrictEqual(match.candidateSkills, []);
    });
  });

  // ===========================================================================
  // FIX 4: Filter and reprioritize project supporting evidence
  // ===========================================================================
  describe('FIX 4 — Project Supporting Evidence Filtering & Prioritization', () => {
    it('prioritizes CODE_USAGE above PACKAGE_MANIFEST_DEPENDENCY', () => {
      const job = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        requirements: [
          {
            id: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            extractedValue: 'React',
            normalizedCriteria: { skillSlug: 'react', skillName: 'React' },
          },
        ],
      };

      const project = {
        id: randomUUID(),
        name: 'Web App',
        slug: 'web-app',
        tenantId: TENANT_ID,
        evidence: [
          {
            id: randomUUID(),
            tenantId: TENANT_ID,
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            sourceLocation: { filePath: 'package.json' },
            excerpt: '"react": "^18.2.0"',
            confidenceScore: 0.9,
            metadata: { technology: 'React' },
          },
          {
            id: randomUUID(),
            tenantId: TENANT_ID,
            evidenceType: 'CODE_USAGE',
            sourceLocation: { filePath: 'src/App.tsx' },
            excerpt: 'import React from "react";',
            confidenceScore: 0.9,
            metadata: { technology: 'React' },
          },
        ],
      };

      const res = ProjectRelevanceService.computeProjectRelevance(
        { tenantId: TENANT_ID },
        job,
        project
      );

      assert.ok(res.supportingEvidence.length > 0);
      assert.strictEqual(
        res.supportingEvidence[0].evidenceType,
        'CODE_USAGE',
        'CODE_USAGE must be ranked higher than PACKAGE_MANIFEST_DEPENDENCY'
      );
    });

    it('filters out non-skill-worthy UI packages like @radix-ui/* and lucide-react from supporting evidence', () => {
      const job = {
        id: randomUUID(),
        tenantId: TENANT_ID,
        requirements: [
          {
            id: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            extractedValue: 'TypeScript',
            normalizedCriteria: { skillSlug: 'typescript', skillName: 'TypeScript' },
          },
        ],
      };

      const project = {
        id: randomUUID(),
        name: 'Frontend Project',
        slug: 'frontend-project',
        tenantId: TENANT_ID,
        evidence: [
          {
            id: randomUUID(),
            tenantId: TENANT_ID,
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            sourceLocation: { filePath: 'package.json' },
            excerpt: '"typescript": "^5.0.0"',
            confidenceScore: 0.95,
            metadata: { technology: 'TypeScript' },
          },
          {
            id: randomUUID(),
            tenantId: TENANT_ID,
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            sourceLocation: { filePath: 'package.json' },
            excerpt: '"@radix-ui/react-avatar": "^1.0.4"',
            confidenceScore: 0.9,
            metadata: { derivedFromPackage: 'react-avatar' },
          },
          {
            id: randomUUID(),
            tenantId: TENANT_ID,
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            sourceLocation: { filePath: 'package.json' },
            excerpt: '"@headlessui/react": "^2.2.9"',
            confidenceScore: 0.9,
            metadata: { derivedFromPackage: 'headlessui' },
          },
          {
            id: randomUUID(),
            tenantId: TENANT_ID,
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            sourceLocation: { filePath: 'package.json' },
            excerpt: '"lucide-react": "^0.553.0"',
            confidenceScore: 0.9,
            metadata: { derivedFromPackage: 'lucide-react' },
          },
        ],
      };

      const res = ProjectRelevanceService.computeProjectRelevance(
        { tenantId: TENANT_ID },
        job,
        project
      );

      const excerpts = res.supportingEvidence.map((e) => e.excerpt || '');
      assert.ok(
        excerpts.some((e) => e.includes('typescript')),
        'TypeScript should be preserved in supporting evidence'
      );
      assert.ok(
        !excerpts.some((e) => e.includes('@radix-ui/react-avatar')),
        '@radix-ui/react-avatar must NOT appear in supporting evidence'
      );
      assert.ok(
        !excerpts.some((e) => e.includes('@headlessui/react')),
        '@headlessui/react must NOT appear in supporting evidence'
      );
      assert.ok(
        !excerpts.some((e) => e.includes('lucide-react')),
        'lucide-react must NOT appear in supporting evidence'
      );
    });

    it('confirms SkillWorthinessGate correctly evaluates packages', () => {
      assert.strictEqual(SkillWorthinessGate.isSkillWorthy('@radix-ui/react-avatar'), false);
      assert.strictEqual(SkillWorthinessGate.isSkillWorthy('@radix-ui/react-select'), false);
      assert.strictEqual(SkillWorthinessGate.isSkillWorthy('lucide-react'), false);
      assert.strictEqual(SkillWorthinessGate.isSkillWorthy('@headlessui/react'), false);
      assert.strictEqual(SkillWorthinessGate.isSkillWorthy('@heroicons/react'), false);
      assert.strictEqual(SkillWorthinessGate.isSkillWorthy('typescript'), true);
      assert.strictEqual(SkillWorthinessGate.isSkillWorthy('next'), true);
      assert.strictEqual(SkillWorthinessGate.isSkillWorthy('express'), true);
      assert.strictEqual(SkillWorthinessGate.isSkillWorthy('fastify'), true);
    });
  });
});
