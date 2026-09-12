/**
 * @file P18 Forensic Narrative Repair & Multi-Bullet Utilization Test Suite
 *
 * Verifies the forensic repair of the shallow/single-bullet recurring failure:
 * 1. Role-aware deduplication: preserves description + implementation, architecture + performance.
 * 2. Multi-bullet narrative composition: projects with multiple distinct contribution facts
 *    (e.g., Product Data Explorer model) yield >= 2 professional accomplishment bullets.
 * 3. Formal Invariant: RenderedClaims <= AuthorizedCanonicalEvidence (no invented metrics, technologies, or claims).
 * 4. Composition Authority Parity: Sync and async deterministic realizations are bit-for-bit identical.
 * 5. Dynamic Evidence-Weighted Summary: Summary adapts dynamically across job requirements without static regex hardcoding.
 * 6. Collapse Detection: Quality scorer flags PROJECT_NARRATIVE_COLLAPSE when multi-fact projects collapse to 1.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCanonicalFactInventory,
  scoreFactsForJob,
  classifyEvidenceRole,
  CONTRIBUTION_CLASSES,
  EVIDENCE_ROLES,
  areContributionClassesCompatible,
} from '../../src/services/candidate-fact-inventory.service.js';

import {
  composeProfessionalProjectBullets,
  composeProfessionalProjectBulletsAsync,
  composeProfessionalSummary,
} from '../../src/services/resume-accomplishment-composer.service.js';

import { evaluateResumeWritingQuality } from '../../src/services/resume-writing-quality.service.js';
import { defaultResumeClaimPlannerService } from '../../src/services/resume-claim-planner.service.js';

describe('P18 Forensic Narrative Repair: Role-Aware Deduplication & Classification', () => {
  test('classifyEvidenceRole accurately identifies architectural decisions and optimizations', () => {
    const role1 = classifyEvidenceRole('Architected high-throughput streaming telemetry pipelines with Raft consensus');
    assert.equal(role1, EVIDENCE_ROLES.DESIGN_DECISION);

    const role2 = classifyEvidenceRole('Engineered distributed telemetry pipelines in Rust with Raft consensus');
    assert.equal(role2, EVIDENCE_ROLES.ACCOMPLISHMENT);

    const role3 = classifyEvidenceRole('High-throughput distributed telemetry and data exploration platform in Rust and TypeScript');
    assert.equal(role3, EVIDENCE_ROLES.DESIGN_DECISION);

    const role4 = classifyEvidenceRole('Optimized cache hit ratio by 40% using Redis clusters');
    assert.equal(role4, EVIDENCE_ROLES.OPTIMIZATION);
  });

  test('areContributionClassesCompatible prevents collapsing implementation with design decision', () => {
    const actionClass = CONTRIBUTION_CLASSES.CANDIDATE_ACTION;
    const designClass = CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION;
    const descClass = CONTRIBUTION_CLASSES.DESCRIPTION;

    // Different candidate contribution roles are distinct narrative opportunities
    assert.equal(areContributionClassesCompatible(actionClass, designClass), false);
    assert.equal(areContributionClassesCompatible(actionClass, descClass), false);
    assert.equal(areContributionClassesCompatible(designClass, descClass), false);

    // Same class can be merged if lexical overlap is very high
    assert.equal(areContributionClassesCompatible(actionClass, actionClass), true);
    assert.equal(areContributionClassesCompatible(descClass, descClass), true);
  });

  test('Inventory preserves distinct implementation and architecture facts sharing keywords', () => {
    const candidate = {
      id: 'cand-pde-test',
      projects: [
        {
          id: 'proj-pde',
          name: 'Product Data Explorer',
          displayName: 'Product Data Explorer',
          technologies: ['Rust', 'TypeScript', 'Raft'],
          highlights: [
            'Engineered high-throughput distributed telemetry pipelines in Rust with Raft consensus',
            'High-throughput distributed telemetry and data exploration platform in Rust and TypeScript with streaming pipelines',
          ],
        },
      ],
    };

    const inv = buildCanonicalFactInventory(candidate);
    const facts = inv.byProject.get('proj-pde') || [];

    // Both distinct facts must be preserved in canonical inventory (no destructive merge)
    assert.equal(facts.length, 2, 'Both distinct contribution facts must be preserved');
    assert.ok(facts.some((f) => f.text.includes('Engineered')));
    assert.ok(facts.some((f) => f.text.includes('data exploration platform')));
  });
});

describe('P18 Forensic Narrative Repair: Multi-Bullet Narrative Generation', () => {
  const pdeProject = {
    id: 'proj-pde',
    name: 'Product Data Explorer',
    displayName: 'Product Data Explorer',
    technologies: ['Rust', 'TypeScript', 'Raft', 'WebSockets'],
    evidenceCount: 2,
  };

  const pdeFacts = [
    {
      id: 'fact-pde-1',
      factId: 'fact-pde-1',
      projectId: 'proj-pde',
      text: 'Engineered high-throughput distributed telemetry pipelines in Rust with Raft consensus.',
      evidenceRole: EVIDENCE_ROLES.ACCOMPLISHMENT,
      contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_ACTION,
      semanticTopic: 'performance',
      technologies: ['Rust', 'Raft'],
      metrics: {},
      renderable: true,
      confidence: 1.0,
      jobRelevance: 85,
    },
    {
      id: 'fact-pde-2',
      factId: 'fact-pde-2',
      projectId: 'proj-pde',
      text: 'High-throughput distributed telemetry and data exploration platform in Rust and TypeScript with streaming pipelines.',
      evidenceRole: EVIDENCE_ROLES.DESIGN_DECISION,
      contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION,
      semanticTopic: 'architecture',
      technologies: ['Rust', 'TypeScript'],
      metrics: {},
      renderable: true,
      confidence: 1.0,
      jobRelevance: 80,
    },
  ];

  const jobPosting = {
    title: 'Senior Systems Engineer',
    requirements: [
      { concept: 'Distributed Systems', text: 'Experience in distributed systems with Rust or Go' },
      { concept: 'Telemetry & Observability', text: 'Telemetry pipelines and data streaming' },
    ],
  };

  test('Claim planner creates distinct claim groups for distinct contribution classes', () => {
    const plan = defaultResumeClaimPlannerService.planClaims({
      facts: pdeFacts,
      ownerType: 'PROJECT',
      ownerId: 'proj-pde',
      jobPosting,
      targetBullets: 2,
    });

    assert.equal(plan.plannedClaims.length, 2, 'Should plan 2 distinct claims');
    assert.equal(plan.omittedFacts.length, 0, 'Zero facts should be omitted as description-only');
  });

  test('Product Data Explorer reliably yields 2 distinct, complementary accomplishment bullets', () => {
    const composed = composeProfessionalProjectBullets({
      facts: pdeFacts,
      project: pdeProject,
      jobPosting,
      explicitBudget: 2,
    });

    assert.equal(composed.bullets.length, 2, 'Must render exactly 2 bullets (never collapsed to 1)');
    assert.notEqual(composed.bullets[0].text, composed.bullets[1].text);

    // Each bullet must start with an active engineering past-tense verb
    assert.match(composed.bullets[0].text, /^(Engineered|Architected|Designed|Built)\b/i);
    assert.match(composed.bullets[1].text, /^(Engineered|Architected|Designed|Built)\b/i);

    // Verify distinct fact grounding across both bullets
    const renderedFactIds = composed.bullets.flatMap((b) => b.composedFromFactIds);
    assert.ok(renderedFactIds.includes('fact-pde-1'), 'Must include fact-pde-1');
    assert.ok(renderedFactIds.includes('fact-pde-2'), 'Must include fact-pde-2');

    // Zero omissions due to shallow collapse
    assert.equal(composed.omittedFacts.length, 0);
  });
});

describe('P18 Invariant: RenderedClaims <= AuthorizedCanonicalEvidence', () => {
  test('No unauthorized metrics or technologies are fabricated during composition', () => {
    const facts = [
      {
        id: 'fact-auth-1',
        factId: 'fact-auth-1',
        projectId: 'proj-auth',
        text: 'Engineered high-throughput telemetry stream processing in Rust.',
        evidenceRole: EVIDENCE_ROLES.ACCOMPLISHMENT,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_ACTION,
        semanticTopic: 'performance',
        technologies: ['Rust'],
        metrics: {},
        renderable: true,
      },
    ];

    const project = {
      id: 'proj-auth',
      name: 'Telemetry Streamer',
      technologies: ['Rust'],
    };

    const composed = composeProfessionalProjectBullets({
      facts,
      project,
      jobPosting: { title: 'Backend Engineer' },
    });

    assert.equal(composed.bullets.length, 1);
    const bulletText = composed.bullets[0].text;

    // Must NOT invent metric numbers
    assert.doesNotMatch(bulletText, /\b\d+(?:%|ms|k|m|rps|qps)\b/i);
    // Must NOT invent technologies not in authorized facts or project
    assert.doesNotMatch(bulletText, /\b(Kafka|Kubernetes|AWS|GCP|Python|Docker)\b/i);
  });
});

describe('P18 Single Composition Authority: Sync and Async Parity', () => {
  test('Sync and Async deterministic realizations yield bit-for-bit identical outputs', async () => {
    const facts = [
      {
        id: 'fact-pde-1',
        factId: 'fact-pde-1',
        projectId: 'proj-pde',
        text: 'Engineered high-throughput distributed telemetry pipelines in Rust with Raft consensus.',
        evidenceRole: EVIDENCE_ROLES.ACCOMPLISHMENT,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_ACTION,
        semanticTopic: 'performance',
        technologies: ['Rust', 'Raft'],
        metrics: {},
        renderable: true,
      },
      {
        id: 'fact-pde-2',
        factId: 'fact-pde-2',
        projectId: 'proj-pde',
        text: 'High-throughput distributed telemetry and data exploration platform in Rust and TypeScript with streaming pipelines.',
        evidenceRole: EVIDENCE_ROLES.DESIGN_DECISION,
        contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION,
        semanticTopic: 'architecture',
        technologies: ['Rust', 'TypeScript'],
        metrics: {},
        renderable: true,
      },
    ];

    const project = {
      id: 'proj-pde',
      name: 'Product Data Explorer',
      technologies: ['Rust', 'TypeScript', 'Raft'],
    };

    const syncResult = composeProfessionalProjectBullets({
      facts,
      project,
    });

    const asyncResult = await composeProfessionalProjectBulletsAsync({
      facts,
      project,
      aiProvider: null, // deterministic fallback
    });

    assert.equal(syncResult.bullets.length, asyncResult.bullets.length);
    for (let i = 0; i < syncResult.bullets.length; i++) {
      assert.equal(syncResult.bullets[i].text, asyncResult.bullets[i].text);
      assert.deepEqual(syncResult.bullets[i].composedFromFactIds, asyncResult.bullets[i].composedFromFactIds);
    }
    assert.deepEqual(syncResult.omittedFacts, asyncResult.omittedFacts);
    assert.deepEqual(syncResult.capacity, asyncResult.capacity);
  });
});

describe('P18 Dynamic Evidence-Weighted Summary Composition', () => {
  test('Adapts dynamically to job keywords and candidate evidence without hardcoded regex branches', () => {
    const candidate = {
      displayName: 'Alex Rivers',
      headline: 'Software Engineer',
      skills: [
        { name: 'Rust', slug: 'rust' },
        { name: 'Raft', slug: 'raft' },
        { name: 'Distributed Systems', slug: 'distributed-systems' },
        { name: 'Docker', slug: 'docker' },
      ],
      projects: [
        {
          id: 'proj-kv',
          name: 'Distributed KV Store',
          technologies: ['Rust', 'Raft'],
        },
      ],
    };

    const systemsJob = {
      title: 'Distributed Systems Engineer',
      requirements: ['Raft consensus', 'Distributed fault-tolerance', 'Rust'],
    };

    const summary = composeProfessionalSummary({
      candidateProfile: candidate,
      jobPosting: systemsJob,
      selectedSkills: candidate.skills,
      selectedProjects: candidate.projects,
    });

    assert.ok(summary.text.length > 50);
    assert.match(summary.text, /Systems/i);
    assert.match(summary.text, /Rust/i);
    assert.equal(summary.topRelevantTechnicalDomains[0], 'Distributed Systems');
    assert.ok(summary.topRelevantTechnologies.some((t) => t.toLowerCase() === 'rust'));
  });
});

describe('P18 Writing Quality: PROJECT_NARRATIVE_COLLAPSE Detection', () => {
  test('Flags PROJECT_NARRATIVE_COLLAPSE when multi-fact project renders only 1 bullet', () => {
    const resumeWithCollapsedProject = {
      projects: [
        {
          id: 'proj-collapsed',
          name: 'Telemetry Explorer',
          bullets: [
            {
              text: 'Engineered high-throughput distributed telemetry pipelines in Rust.',
              composedFromFactIds: ['fact-1'],
            },
          ],
        },
      ],
      experience: [],
    };

    const factInventory = {
      facts: [
        {
          id: 'fact-1',
          projectId: 'proj-collapsed',
          text: 'Engineered high-throughput distributed telemetry pipelines in Rust.',
          evidenceRole: EVIDENCE_ROLES.ACCOMPLISHMENT,
          contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_ACTION,
          renderable: true,
        },
        {
          id: 'fact-2',
          projectId: 'proj-collapsed',
          text: 'Architected distributed consensus engine in Rust.',
          evidenceRole: EVIDENCE_ROLES.DESIGN_DECISION,
          contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION,
          renderable: true,
        },
      ],
    };

    const quality = evaluateResumeWritingQuality({
      structuredResume: resumeWithCollapsedProject,
      factInventory,
    });

    const collapseFinding = quality.findings.find(
      (f) => f.code === 'PROJECT_NARRATIVE_COLLAPSE'
    );
    assert.ok(collapseFinding, 'Must detect PROJECT_NARRATIVE_COLLAPSE finding');
    assert.equal(collapseFinding.project, 'Telemetry Explorer');
  });

  test('Does NOT flag PROJECT_NARRATIVE_COLLAPSE when multi-fact project renders >= 2 bullets', () => {
    const resumeWithProperProject = {
      projects: [
        {
          id: 'proj-proper',
          name: 'Telemetry Explorer',
          bullets: [
            {
              text: 'Engineered high-throughput distributed telemetry pipelines in Rust with Raft consensus.',
              composedFromFactIds: ['fact-1'],
            },
            {
              text: 'Architected distributed consensus engine and streaming platform in Rust.',
              composedFromFactIds: ['fact-2'],
            },
          ],
        },
      ],
      experience: [],
    };

    const factInventory = {
      facts: [
        {
          id: 'fact-1',
          projectId: 'proj-proper',
          text: 'Engineered high-throughput distributed telemetry pipelines in Rust with Raft consensus.',
          evidenceRole: EVIDENCE_ROLES.ACCOMPLISHMENT,
          contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_ACTION,
          renderable: true,
        },
        {
          id: 'fact-2',
          projectId: 'proj-proper',
          text: 'Architected distributed consensus engine and streaming platform in Rust.',
          evidenceRole: EVIDENCE_ROLES.DESIGN_DECISION,
          contributionClass: CONTRIBUTION_CLASSES.CANDIDATE_DESIGN_DECISION,
          renderable: true,
        },
      ],
    };

    const quality = evaluateResumeWritingQuality({
      structuredResume: resumeWithProperProject,
      factInventory,
    });

    const collapseFinding = quality.findings.find(
      (f) => f.code === 'PROJECT_NARRATIVE_COLLAPSE'
    );
    assert.equal(collapseFinding, undefined, 'Must NOT flag collapse when multiple bullets rendered');
  });
});
