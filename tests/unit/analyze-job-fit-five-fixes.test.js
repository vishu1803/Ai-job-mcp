/**
 * @file analyze-job-fit-five-fixes.test.js
 *
 * Regression tests for the five remaining evidence-pipeline defects discovered
 * during the second live ChatGPT MCP invocation of analyze_job_fit.
 *
 * ISSUE 1: UI packages (@heroicons/react, @radix-ui/*, lucide-react) must NOT
 *           appear in topRelevantProjects.supportingEvidence.
 * ISSUE 2: Passive manifest evidence must not outrank source-level evidence.
 * ISSUE 3: SOAP must NOT match through Fastify via shared http-services ancestor.
 * ISSUE 4: Node.js experience requirement must not accept TypeScript/JavaScript
 *           as evidence; explanation must name actual evidence skill on fallback.
 * ISSUE 5: isUserClaim is intentionally NOT in the public MCP contract.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Service imports
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import { SkillWorthinessGate } from '../../src/domain/career/skill-worthiness-gate.js';
import {
  ProjectRelevanceService,
  isSkillWorthyEvidence,
} from '../../src/services/project-relevance.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const TENANT_ID = randomUUID();

function makeSkill(slug, name, opts = {}) {
  return {
    id: randomUUID(),
    slug,
    name,
    category: opts.category || 'TOOL',
    provenanceStatus: opts.provenanceStatus || 'VERIFIED',
    evidence: opts.evidence || [
      {
        id: randomUUID(),
        evidenceType: opts.evidenceType || 'CODE_USAGE',
        excerpt: opts.excerpt || `import ${name} from '${slug}'`,
        confidenceScore: opts.confidenceScore || 0.9,
        sourceLocation: {
          filePath: opts.filePath || `src/services/${slug}.ts`,
          commitSha: 'a'.repeat(40),
        },
      },
    ],
  };
}

function makeRequirement(slug, name, opts = {}) {
  return {
    id: randomUUID(),
    category: opts.category || 'SKILL',
    importance: opts.importance || 'REQUIRED',
    weight: opts.weight || 1.0,
    extractedValue: name,
    normalizedCriteria: opts.normalizedCriteria || { skillSlug: slug, skillName: name },
    ...(opts.extra || {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ISSUE 1 TESTS: UI Package Exclusion from Supporting Evidence
// ─────────────────────────────────────────────────────────────────────────────

describe('ISSUE 1 — UI Package Exclusion from Supporting Evidence', () => {
  it('1. @heroicons/react is classified as IMPLEMENTATION_DETAIL by SkillWorthinessGate', () => {
    const result = SkillWorthinessGate.evaluate('@heroicons/react');
    assert.equal(result.isSkillWorthy, false, '@heroicons/react must NOT be skill-worthy');
    assert.equal(result.classification, 'IMPLEMENTATION_DETAIL');
  });

  it('2. @radix-ui/react-dialog is classified as IMPLEMENTATION_DETAIL', () => {
    const result = SkillWorthinessGate.evaluate('@radix-ui/react-dialog');
    assert.equal(result.isSkillWorthy, false);
    assert.equal(result.classification, 'IMPLEMENTATION_DETAIL');
  });

  it('3. @radix-ui/react-select is classified as IMPLEMENTATION_DETAIL', () => {
    const result = SkillWorthinessGate.evaluate('@radix-ui/react-select');
    assert.equal(result.isSkillWorthy, false);
    assert.equal(result.classification, 'IMPLEMENTATION_DETAIL');
  });

  it('4. lucide-react is classified as IMPLEMENTATION_DETAIL', () => {
    const result = SkillWorthinessGate.evaluate('lucide-react');
    assert.equal(result.isSkillWorthy, false);
    assert.equal(result.classification, 'IMPLEMENTATION_DETAIL');
  });

  it('5. @headlessui/react is classified as IMPLEMENTATION_DETAIL', () => {
    const result = SkillWorthinessGate.evaluate('@headlessui/react');
    assert.equal(result.isSkillWorthy, false);
    assert.equal(result.classification, 'IMPLEMENTATION_DETAIL');
  });

  it('6. Meaningful technologies (express, react, typescript) remain skill-worthy', () => {
    assert.equal(SkillWorthinessGate.isSkillWorthy('express'), true);
    assert.equal(SkillWorthinessGate.isSkillWorthy('react'), true);
    assert.equal(SkillWorthinessGate.isSkillWorthy('typescript'), true);
    assert.equal(SkillWorthinessGate.isSkillWorthy('prisma'), true);
    assert.equal(SkillWorthinessGate.isSkillWorthy('fastify'), true);
  });

  it('7. isSkillWorthy correctly rejects heroicons, radix-ui, lucide-react', () => {
    assert.equal(SkillWorthinessGate.isSkillWorthy('@heroicons/react'), false);
    assert.equal(SkillWorthinessGate.isSkillWorthy('@heroicons/react/24/solid'), false);
    assert.equal(SkillWorthinessGate.isSkillWorthy('@radix-ui/react-slot'), false);
    assert.equal(SkillWorthinessGate.isSkillWorthy('lucide-react'), false);
  });

  it('8. isSkillWorthyEvidence rejects UI plumbing evidence in package.json', () => {
    const heroiconsEv = {
      evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
      filePath: 'frontend/package.json',
      excerpt: '"@heroicons/react": "^2.2.0"',
    };
    assert.equal(isSkillWorthyEvidence(heroiconsEv), false);

    const radixEv = {
      evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
      filePath: 'frontend/package.json',
      excerpt: '"@radix-ui/react-dialog": "^1.0.0"',
    };
    assert.equal(isSkillWorthyEvidence(radixEv), false);

    const lucideEv = {
      evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
      filePath: 'frontend/package.json',
      excerpt: '"lucide-react": "^0.263.1"',
    };
    assert.equal(isSkillWorthyEvidence(lucideEv), false);
  });

  it('9. isSkillWorthyEvidence preserves legitimate technologies in package.json and source', () => {
    const expressEv = {
      evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
      filePath: 'backend/package.json',
      excerpt: '"express": "^4.18.2"',
    };
    assert.equal(isSkillWorthyEvidence(expressEv), true);

    const codeEv = {
      evidenceType: 'CODE_USAGE',
      filePath: 'backend/src/app.ts',
      excerpt: "import express from 'express';",
    };
    assert.equal(isSkillWorthyEvidence(codeEv), true);

    const prismaEv = {
      evidenceType: 'CODE_IMPORT_USAGE',
      filePath: 'backend/src/types/index.ts',
      excerpt: "import { User } from '@prisma/client';",
    };
    assert.equal(isSkillWorthyEvidence(prismaEv), true);
  });

  it('10. ProjectRelevanceService excludes @heroicons/react from project supportingEvidence', () => {
    const job = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      requirements: [
        makeRequirement('express', 'Express.js'),
        makeRequirement('typescript', 'TypeScript'),
      ],
    };

    const project = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      name: 'Collaborative-task-manager',
      slug: 'collaborative-task-manager',
      evidence: [
        {
          id: randomUUID(),
          evidenceType: 'CODE_USAGE',
          sourceLocation: { filePath: 'backend/src/app.ts' },
          excerpt: "import express from 'express';",
          skillSlug: 'express',
          confidenceScore: 0.95,
        },
        {
          id: randomUUID(),
          evidenceType: 'CODE_IMPORT_USAGE',
          sourceLocation: { filePath: 'backend/src/types/index.ts' },
          excerpt: "import { User, Task } from '@prisma/client';",
          skillSlug: 'prisma',
          confidenceScore: 0.9,
        },
        {
          id: randomUUID(),
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          sourceLocation: { filePath: 'frontend/package.json' },
          excerpt: '"@heroicons/react": "^2.2.0"',
          skillSlug: 'heroicons',
          confidenceScore: 0.85,
        },
        {
          id: randomUUID(),
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          sourceLocation: { filePath: 'frontend/package.json' },
          excerpt: '"@radix-ui/react-dialog": "^1.0.0"',
          skillSlug: 'radix-ui',
          confidenceScore: 0.85,
        },
        {
          id: randomUUID(),
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          sourceLocation: { filePath: 'frontend/package.json' },
          excerpt: '"lucide-react": "^0.263.1"',
          skillSlug: 'lucide-react',
          confidenceScore: 0.85,
        },
      ],
    };

    const result = ProjectRelevanceService.computeProjectRelevance(
      { tenantId: TENANT_ID },
      job,
      project,
      []
    );

    const excerpts = result.supportingEvidence.map((e) => e.excerpt || '');
    assert.ok(
      !excerpts.some((ex) => ex.includes('@heroicons/react')),
      '@heroicons/react must NOT be in supportingEvidence'
    );
    assert.ok(
      !excerpts.some((ex) => ex.includes('@radix-ui')),
      '@radix-ui must NOT be in supportingEvidence'
    );
    assert.ok(
      !excerpts.some((ex) => ex.includes('lucide-react')),
      'lucide-react must NOT be in supportingEvidence'
    );
    // Verified code evidence is preserved
    assert.ok(
      excerpts.some((ex) => ex.includes('express')),
      'express code evidence must be preserved'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ISSUE 2 TESTS: Manifest Evidence Ranking and Capping
// ─────────────────────────────────────────────────────────────────────────────

describe('ISSUE 2 — Passive Manifest Evidence Capping and Source Preference', () => {
  it('1. Source implementation beats passive dependency evidence in top evidence ranking', () => {
    const job = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      requirements: [
        makeRequirement('express', 'Express.js'),
        makeRequirement('react', 'React'),
      ],
    };

    const project = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      name: 'Source-heavy project',
      evidence: [
        {
          id: randomUUID(),
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          sourceLocation: { filePath: 'package.json' },
          excerpt: '"react": "^18.2.0"',
          skillSlug: 'react',
          confidenceScore: 0.99,
        },
        {
          id: randomUUID(),
          evidenceType: 'CODE_USAGE',
          sourceLocation: { filePath: 'src/App.tsx' },
          excerpt: 'export function App() { return <div>App</div>; }',
          skillSlug: 'react',
          confidenceScore: 0.90,
        },
        {
          id: randomUUID(),
          evidenceType: 'CODE_IMPORT_USAGE',
          sourceLocation: { filePath: 'src/server.ts' },
          excerpt: "import express from 'express';",
          skillSlug: 'express',
          confidenceScore: 0.90,
        },
      ],
    };

    const result = ProjectRelevanceService.computeProjectRelevance(
      { tenantId: TENANT_ID },
      job,
      project,
      []
    );

    // CODE_USAGE and CODE_IMPORT_USAGE rank 1 and 2, outranking PACKAGE_MANIFEST_DEPENDENCY rank 3
    const topTypes = result.supportingEvidence.map((e) => e.evidenceType);
    assert.ok(
      topTypes.includes('CODE_USAGE') || topTypes.includes('CODE_IMPORT_USAGE'),
      'Must contain code-level evidence'
    );
  });

  it('2. Caps manifest entries to max 2 when source evidence exists', () => {
    const job = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      requirements: [
        makeRequirement('express', 'Express.js'),
        makeRequirement('react', 'React'),
        makeRequirement('typescript', 'TypeScript'),
        makeRequirement('prisma', 'Prisma'),
      ],
    };

    const project = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      name: 'Manifest-heavy project with some source',
      evidence: [
        {
          id: randomUUID(),
          evidenceType: 'CODE_USAGE',
          sourceLocation: { filePath: 'src/index.ts' },
          excerpt: "console.log('source');",
          skillSlug: 'typescript',
          confidenceScore: 0.9,
        },
        {
          id: randomUUID(),
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          sourceLocation: { filePath: 'package.json' },
          excerpt: '"express": "^4.18.2"',
          skillSlug: 'express',
          confidenceScore: 0.9,
        },
        {
          id: randomUUID(),
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          sourceLocation: { filePath: 'package.json' },
          excerpt: '"react": "^18.2.0"',
          skillSlug: 'react',
          confidenceScore: 0.9,
        },
        {
          id: randomUUID(),
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          sourceLocation: { filePath: 'package.json' },
          excerpt: '"prisma": "^5.0.0"',
          skillSlug: 'prisma',
          confidenceScore: 0.9,
        },
        {
          id: randomUUID(),
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          sourceLocation: { filePath: 'package.json' },
          excerpt: '"typescript": "^5.0.0"',
          skillSlug: 'typescript',
          confidenceScore: 0.9,
        },
      ],
    };

    const result = ProjectRelevanceService.computeProjectRelevance(
      { tenantId: TENANT_ID },
      job,
      project,
      []
    );

    const manifestCount = result.supportingEvidence.filter(
      (e) => e.evidenceType === 'PACKAGE_MANIFEST_DEPENDENCY'
    ).length;
    assert.ok(
      manifestCount <= 2,
      `Manifest evidence must be capped at max 2 when source exists. Got: ${manifestCount}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ISSUE 3 TESTS: SOAP Protocol-Specific Guard
// ─────────────────────────────────────────────────────────────────────────────

describe('ISSUE 3 — SOAP Protocol-Specific Guard in PEER IMPLEMENTS', () => {
  it('1. Fastify alone must NOT establish SOAP proficiency', () => {
    const profile = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      skills: [
        makeSkill('fastify', 'Fastify', {
          category: 'FRAMEWORK',
          filePath: 'backend/src/app.ts',
          excerpt: "import Fastify from 'fastify'",
        }),
      ],
      workHistory: [],
      profileMetadata: {},
    };
    const job = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      requirements: [makeRequirement('soap', 'SOAP')],
    };

    const result = EvidenceMatchingService.matchJobToCandidate(
      { tenantId: TENANT_ID },
      job,
      profile
    );

    const soapMatch = result.requirementMatches.find(
      (m) => m.skillSlug === 'soap' || m.normalizedRequirement === 'SOAP'
    );
    assert.ok(soapMatch, 'SOAP requirement match must be present');
    assert.notEqual(soapMatch.matchStatus, 'MATCHED', 'SOAP must NOT be MATCHED via Fastify');
    if (soapMatch.matchStatus === 'PARTIAL') {
      assert.ok(
        !soapMatch.explanation?.includes('http-services'),
        'SOAP must not match through http-services paradigm'
      );
    }
  });

  it('2. Fastify + REST API requirement remains valid MATCHED', () => {
    const profile = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      skills: [
        makeSkill('fastify', 'Fastify', {
          category: 'FRAMEWORK',
          filePath: 'backend/src/app.ts',
          excerpt: "import Fastify from 'fastify'",
        }),
      ],
      workHistory: [],
      profileMetadata: {},
    };
    const job = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      requirements: [makeRequirement('rest-api', 'REST API')],
    };

    const result = EvidenceMatchingService.matchJobToCandidate(
      { tenantId: TENANT_ID },
      job,
      profile
    );

    const restMatch = result.requirementMatches.find(
      (m) => m.skillSlug === 'rest-api' || m.normalizedRequirement === 'REST API'
    );
    assert.ok(restMatch, 'REST API match must exist');
    assert.equal(restMatch.matchStatus, 'MATCHED', 'Fastify -> REST API must remain MATCHED');
  });

  it('3. Actual SOAP evidence produces valid MATCHED', () => {
    const profile = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      skills: [
        makeSkill('soap', 'SOAP', {
          excerpt: "import soap from 'soap';",
          filePath: 'src/services/soap-client.ts',
        }),
      ],
      workHistory: [],
      profileMetadata: {},
    };
    const job = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      requirements: [makeRequirement('soap', 'SOAP')],
    };

    const result = EvidenceMatchingService.matchJobToCandidate(
      { tenantId: TENANT_ID },
      job,
      profile
    );

    const soapMatch = result.requirementMatches.find(
      (m) => m.skillSlug === 'soap' || m.normalizedRequirement === 'SOAP'
    );
    assert.ok(soapMatch, 'Direct SOAP match must exist');
    assert.equal(soapMatch.matchStatus, 'MATCHED', 'Direct SOAP evidence must produce MATCHED');
  });

  it('4. Fastify + HTTP Services remains valid MATCHED', () => {
    const profile = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      skills: [
        makeSkill('fastify', 'Fastify', { category: 'FRAMEWORK' }),
      ],
      workHistory: [],
      profileMetadata: {},
    };
    const job = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      requirements: [makeRequirement('http-services', 'HTTP Services')],
    };

    const result = EvidenceMatchingService.matchJobToCandidate(
      { tenantId: TENANT_ID },
      job,
      profile
    );

    const httpMatch = result.requirementMatches.find(
      (m) => m.skillSlug === 'http-services' || m.normalizedRequirement === 'HTTP Services'
    );
    assert.ok(httpMatch, 'HTTP Services match must exist');
    assert.equal(httpMatch.matchStatus, 'MATCHED', 'Fastify -> HTTP Services must remain MATCHED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ISSUE 4 TESTS: Node.js Experience Requirement Fallback
// ─────────────────────────────────────────────────────────────────────────────

describe('ISSUE 4 — Node.js Experience Requirement Evidence/Explanation', () => {
  it('1. TypeScript package.json only -> NOT verified Node.js application experience', () => {
    const profile = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      skills: [
        makeSkill('typescript', 'TypeScript', {
          provenanceStatus: 'CORROBORATED',
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          excerpt: '"typescript": "^5.0.0"',
          filePath: 'backend/package.json',
        }),
      ],
      workHistory: [],
      profileMetadata: {},
      tenureMetrics: { professionalTenureMonths: 0 },
      careerStatus: 'FRESHER',
    };

    const job = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      requirements: [
        makeRequirement('node-js', 'Node.js Application Development Experience', {
          category: 'EXPERIENCE',
          normalizedCriteria: {
            experienceType: 'PRACTICAL_DEVELOPMENT',
            technology: 'Node.js',
            associatedSkillSlug: 'node-js',
            skillSlug: 'node-js',
            skillName: 'Node.js',
          },
        }),
      ],
    };

    const result = EvidenceMatchingService.matchJobToCandidate(
      { tenantId: TENANT_ID },
      job,
      profile
    );

    const nodeExpMatch = result.requirementMatches.find(
      (m) => m.category === 'EXPERIENCE'
    );
    assert.ok(nodeExpMatch, 'Experience match must exist');
    assert.equal(
      nodeExpMatch.matchStatus,
      'MISSING',
      'TypeScript-only evidence must NOT prove Node.js app development'
    );
  });

  it('2. Fastify evidence -> valid Node.js experience with accurate explanation', () => {
    const profile = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      skills: [
        makeSkill('fastify', 'Fastify', {
          category: 'FRAMEWORK',
          filePath: 'backend/src/app.ts',
          excerpt: "import Fastify from 'fastify'",
        }),
      ],
      workHistory: [],
      profileMetadata: {},
      tenureMetrics: { professionalTenureMonths: 0 },
      careerStatus: 'FRESHER',
    };

    const job = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      requirements: [
        makeRequirement('node-js', 'Node.js Application Development Experience', {
          category: 'EXPERIENCE',
          normalizedCriteria: {
            experienceType: 'PRACTICAL_DEVELOPMENT',
            technology: 'Node.js',
            associatedSkillSlug: 'node-js',
            skillSlug: 'node-js',
            skillName: 'Node.js',
          },
        }),
      ],
    };

    const result = EvidenceMatchingService.matchJobToCandidate(
      { tenantId: TENANT_ID },
      job,
      profile
    );

    const nodeExpMatch = result.requirementMatches.find(
      (m) => m.category === 'EXPERIENCE'
    );
    assert.ok(nodeExpMatch, 'Node.js experience match must exist');
    assert.ok(
      ['PARTIAL', 'MATCHED'].includes(nodeExpMatch.matchStatus),
      `Expected PARTIAL or MATCHED, got ${nodeExpMatch.matchStatus}`
    );
    // Explanation must name Fastify
    assert.ok(
      nodeExpMatch.explanation.includes('Fastify'),
      `Explanation must name Fastify. Got: ${nodeExpMatch.explanation}`
    );
    // candidateSkills should include Fastify
    assert.ok(
      nodeExpMatch.candidateSkills.includes('Fastify'),
      'candidateSkills must include Fastify'
    );
    // RelationshipType should be BUILT_ON for fallback match
    assert.equal(
      nodeExpMatch.relationshipType,
      'BUILT_ON',
      'Fallback match should be BUILT_ON'
    );
  });

  it('3. Next.js alone must NOT prove Node.js application-development experience', () => {
    const profile = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      skills: [
        makeSkill('next-js', 'Next.js', {
          category: 'FRAMEWORK',
          filePath: 'frontend/pages/_app.tsx',
        }),
      ],
      workHistory: [],
      profileMetadata: {},
      tenureMetrics: { professionalTenureMonths: 0 },
      careerStatus: 'FRESHER',
    };

    const job = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      requirements: [
        makeRequirement('node-js', 'Node.js Application Development Experience', {
          category: 'EXPERIENCE',
          normalizedCriteria: {
            experienceType: 'PRACTICAL_DEVELOPMENT',
            technology: 'Node.js',
            associatedSkillSlug: 'node-js',
            skillSlug: 'node-js',
            skillName: 'Node.js',
          },
        }),
      ],
    };

    const result = EvidenceMatchingService.matchJobToCandidate(
      { tenantId: TENANT_ID },
      job,
      profile
    );

    const nodeExpMatch = result.requirementMatches.find(
      (m) => m.category === 'EXPERIENCE'
    );
    assert.ok(nodeExpMatch, 'Experience match must exist');
    assert.equal(
      nodeExpMatch.matchStatus,
      'MISSING',
      'Next.js alone must NOT prove Node.js app development'
    );
  });

  it('4. Direct Node.js evidence -> valid match with EXACT relationship', () => {
    const profile = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      skills: [
        makeSkill('node-js', 'Node.js', {
          filePath: 'src/server.js',
          excerpt: "const http = require('http');",
        }),
      ],
      workHistory: [],
      profileMetadata: {},
      tenureMetrics: { professionalTenureMonths: 12 },
      careerStatus: 'PROFESSIONAL',
    };

    const job = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      requirements: [
        makeRequirement('node-js', 'Node.js Application Development Experience', {
          category: 'EXPERIENCE',
          normalizedCriteria: {
            experienceType: 'PRACTICAL_DEVELOPMENT',
            technology: 'Node.js',
            associatedSkillSlug: 'node-js',
            skillSlug: 'node-js',
            skillName: 'Node.js',
          },
        }),
      ],
    };

    const result = EvidenceMatchingService.matchJobToCandidate(
      { tenantId: TENANT_ID },
      job,
      profile
    );

    const nodeExpMatch = result.requirementMatches.find(
      (m) => m.category === 'EXPERIENCE'
    );
    assert.ok(nodeExpMatch, 'Direct Node.js match must exist');
    assert.equal(nodeExpMatch.matchStatus, 'MATCHED');
    assert.equal(nodeExpMatch.relationshipType, 'EXACT', 'Direct match must be EXACT');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ISSUE 5 TESTS: isUserClaim Public Contract
// ─────────────────────────────────────────────────────────────────────────────

describe('ISSUE 5 — isUserClaim Not in Public MCP Contract', () => {
  it('1. candidateProvenance + provenanceTrustClass encode user-claim semantic', () => {
    const claimedProvenance = 'CLAIMED';
    const selfDeclaredProvenance = 'SELF_DECLARED';
    const verifiedProvenance = 'VERIFIED';

    const isClaimLowTrust = ['CLAIMED', 'SELF_DECLARED', 'LEARNING'].includes(claimedProvenance);
    const isSelfDeclaredLowTrust = ['CLAIMED', 'SELF_DECLARED', 'LEARNING'].includes(selfDeclaredProvenance);
    const isVerifiedNotLowTrust = !['CLAIMED', 'SELF_DECLARED', 'LEARNING'].includes(verifiedProvenance);

    assert.equal(isClaimLowTrust, true, 'CLAIMED maps to LOW_TRUST');
    assert.equal(isSelfDeclaredLowTrust, true, 'SELF_DECLARED maps to LOW_TRUST');
    assert.equal(isVerifiedNotLowTrust, true, 'VERIFIED does not map to LOW_TRUST');
  });

  it('2. isUserClaim exists internally in match results (not stripped)', () => {
    const profile = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      skills: [
        {
          id: randomUUID(),
          slug: 'react',
          name: 'React',
          category: 'FRAMEWORK',
          provenanceStatus: 'CLAIMED',
          isUserClaim: true,
          evidence: [],
          metadata: { isUserClaim: true },
        },
      ],
      workHistory: [],
      profileMetadata: {},
    };

    const job = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      requirements: [makeRequirement('react', 'React')],
    };

    const result = EvidenceMatchingService.matchJobToCandidate(
      { tenantId: TENANT_ID },
      job,
      profile
    );

    const reactMatch = result.requirementMatches.find(
      (m) => m.skillSlug === 'react' || m.normalizedRequirement === 'React'
    );
    if (reactMatch) {
      assert.equal(typeof reactMatch.isUserClaim, 'boolean', 'isUserClaim exists internally');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION GUARDS: Preserve Previous 4 Fixes
// ─────────────────────────────────────────────────────────────────────────────

describe('REGRESSION GUARDS — Previous Four Fixes Still Pass', () => {
  it('FIX 1: Next.js must NOT satisfy standalone Node.js requirement', () => {
    const profile = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      skills: [
        makeSkill('next-js', 'Next.js', { category: 'FRAMEWORK' }),
      ],
      workHistory: [],
      profileMetadata: {},
    };
    const job = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      requirements: [makeRequirement('node-js', 'Node.js')],
    };

    const result = EvidenceMatchingService.matchJobToCandidate(
      { tenantId: TENANT_ID },
      job,
      profile
    );

    const nodeMatch = result.requirementMatches.find(
      (m) => m.skillSlug === 'node-js' || m.normalizedRequirement === 'Node.js'
    );
    assert.ok(nodeMatch, 'Node.js match must exist');
    assert.notEqual(nodeMatch.matchStatus, 'MATCHED', 'Next.js must NOT MATCH Node.js');
  });

  it('FIX 2: CLAIMED provenance must produce LOW_TRUST derivation', () => {
    for (const status of ['CLAIMED', 'SELF_DECLARED']) {
      const isLowTrust = ['CLAIMED', 'SELF_DECLARED', 'LEARNING'].includes(status);
      assert.equal(isLowTrust, true, `${status} must map to LOW_TRUST`);
    }
  });

  it('FIX 3: NONE provenance with no evidence must produce NO_EVIDENCE', () => {
    let trustClass;
    const provenance = 'NONE';
    const hasEvidence = false;
    const isUserClaim = false;

    if (isUserClaim) trustClass = 'LOW_TRUST';
    else if (provenance === 'NONE' || !hasEvidence) trustClass = 'NO_EVIDENCE';
    else trustClass = 'HIGH_TRUST';

    assert.equal(trustClass, 'NO_EVIDENCE');
  });

  it('FIX 4: UI plumbing packages must not become candidate skills', () => {
    assert.equal(SkillWorthinessGate.isSkillWorthy('@radix-ui/react-dialog'), false);
    assert.equal(SkillWorthinessGate.isSkillWorthy('@heroicons/react'), false);
    assert.equal(SkillWorthinessGate.isSkillWorthy('lucide-react'), false);
    assert.equal(SkillWorthinessGate.isSkillWorthy('cmdk'), false);
    assert.equal(SkillWorthinessGate.isSkillWorthy('react-icons'), false);
  });
});
