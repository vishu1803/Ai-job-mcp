import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ResumeClaimValidationService,
  defaultResumeClaimValidationService,
} from '../../src/services/resume-claim-validation.service.js';

describe('P17: ResumeClaimValidationService', () => {
  const sampleCandidate = {
    id: 'cand-123',
    skills: ['Go', 'PostgreSQL', 'Docker', 'Raft', 'Redis'],
    projects: [
      {
        id: 'proj-dist-kv',
        technologies: ['Go', 'Raft', 'Docker'],
      },
    ],
  };

  const sampleFacts = [
    {
      factId: 'f-raft-1',
      candidateId: 'cand-123',
      ownerId: 'proj-dist-kv',
      projectId: 'proj-dist-kv',
      text: 'Architected distributed key-value store using Raft consensus protocol in Go.',
      canonicalFactType: 'ARCHITECTURE',
      evidenceRole: 'ARCHITECTURE',
      semanticTopic: 'architecture',
      technologies: ['Go', 'Raft'],
      metrics: [],
      renderable: true,
    },
    {
      factId: 'f-wal-2',
      candidateId: 'cand-123',
      ownerId: 'proj-dist-kv',
      projectId: 'proj-dist-kv',
      text: 'Implemented write-ahead logging (WAL) sustaining 15,000 writes/sec with 0 data loss.',
      canonicalFactType: 'IMPLEMENTATION',
      evidenceRole: 'IMPLEMENTATION',
      semanticTopic: 'reliability',
      technologies: ['Go'],
      metrics: [{ raw: '15,000 writes/sec', value: 15000, unit: 'writes/sec' }],
      renderable: true,
    },
    {
      factId: 'f-other-proj',
      candidateId: 'cand-123',
      ownerId: 'proj-ecommerce',
      projectId: 'proj-ecommerce',
      text: 'Developed payment processing service using PostgreSQL and Redis.',
      canonicalFactType: 'IMPLEMENTATION',
      evidenceRole: 'IMPLEMENTATION',
      technologies: ['PostgreSQL', 'Redis'],
      metrics: [],
      renderable: true,
    },
  ];

  it('accepts a fully grounded, valid accomplishment claim', () => {
    const claim = {
      claimId: 'claim-1',
      factIds: ['f-raft-1'],
      text: 'Architected distributed key-value store using Raft consensus protocol in Go.',
      semanticDimensions: ['architecture'],
    };

    const res = defaultResumeClaimValidationService.validateClaim(claim, {
      factInventory: sampleFacts,
      candidateProfile: sampleCandidate,
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: 'proj-dist-kv',
      project: sampleCandidate.projects[0],
    });

    assert.equal(res.valid, true);
    assert.equal(res.rejected, false);
    assert.equal(res.violations.length, 0);
  });

  it('rejects claim referencing non-existent factId (UNKNOWN_FACT_ID)', () => {
    const claim = {
      claimId: 'claim-2',
      factIds: ['f-does-not-exist'],
      text: 'Architected distributed consensus engine handling replication across nodes.',
    };

    const res = defaultResumeClaimValidationService.validateClaim(claim, {
      factInventory: sampleFacts,
      candidateProfile: sampleCandidate,
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: 'proj-dist-kv',
    });

    assert.equal(res.valid, false);
    assert.equal(res.rejected, true);
    assert.ok(res.violations.some((v) => v.code === 'UNKNOWN_FACT_ID'));
  });

  it('rejects claim referencing fact belonging to another candidate (FOREIGN_CANDIDATE_FACT)', () => {
    const foreignFact = {
      factId: 'f-foreign',
      candidateId: 'cand-999-other',
      ownerId: 'proj-dist-kv',
      projectId: 'proj-dist-kv',
      text: 'Engineered high-throughput messaging queue.',
      technologies: ['Go'],
    };

    const claim = {
      claimId: 'claim-3',
      factIds: ['f-foreign'],
      text: 'Engineered high-throughput messaging queue in Go.',
    };

    const res = defaultResumeClaimValidationService.validateClaim(claim, {
      factInventory: [...sampleFacts, foreignFact],
      candidateProfile: sampleCandidate,
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: 'proj-dist-kv',
    });

    assert.equal(res.valid, false);
    assert.ok(res.violations.some((v) => v.code === 'FOREIGN_CANDIDATE_FACT'));
  });

  it('rejects claim with cross-project fact contamination (CROSS_SECTION_CONTAMINATION)', () => {
    const claim = {
      claimId: 'claim-4',
      factIds: ['f-other-proj'], // belongs to proj-ecommerce
      text: 'Developed payment processing service using PostgreSQL and Redis.',
    };

    const res = defaultResumeClaimValidationService.validateClaim(claim, {
      factInventory: sampleFacts,
      candidateProfile: sampleCandidate,
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: 'proj-dist-kv', // target is proj-dist-kv
    });

    assert.equal(res.valid, false);
    assert.ok(res.violations.some((v) => v.code === 'CROSS_SECTION_CONTAMINATION'));
  });

  it('rejects claim with ungrounded fabricated metric (UNSUPPORTED_METRIC)', () => {
    const claim = {
      claimId: 'claim-5',
      factIds: ['f-raft-1'],
      // 99.99% and 500,000 req/sec do not exist in f-raft-1 evidence
      text: 'Architected distributed key-value store achieving 99.99% availability and 500,000 req/sec.',
    };

    const res = defaultResumeClaimValidationService.validateClaim(claim, {
      factInventory: sampleFacts,
      candidateProfile: sampleCandidate,
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: 'proj-dist-kv',
    });

    assert.equal(res.valid, false);
    assert.ok(res.violations.some((v) => v.code === 'UNSUPPORTED_METRIC'));
  });

  it('rejects claim introducing unauthorized technologies (UNAUTHORIZED_TECHNOLOGY)', () => {
    const claim = {
      claimId: 'claim-6',
      factIds: ['f-raft-1'],
      // Rust & Kubernetes are not in candidate skills or project technologies
      text: 'Architected distributed key-value store using Rust and Kubernetes orchestrations.',
    };

    const res = defaultResumeClaimValidationService.validateClaim(claim, {
      factInventory: sampleFacts,
      candidateProfile: sampleCandidate,
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: 'proj-dist-kv',
      project: sampleCandidate.projects[0],
    });

    assert.equal(res.valid, false);
    assert.ok(res.violations.some((v) => v.code === 'UNAUTHORIZED_TECHNOLOGY'));
  });

  it('rejects unbacked team leadership or scale assertions (UNSUPPORTED_ACTOR_CLAIM)', () => {
    const claim = {
      claimId: 'claim-7',
      factIds: ['f-raft-1'],
      text: 'Led a team of 12 engineers in architecting distributed key-value store with Raft.',
    };

    const res = defaultResumeClaimValidationService.validateClaim(claim, {
      factInventory: sampleFacts,
      candidateProfile: sampleCandidate,
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: 'proj-dist-kv',
    });

    assert.equal(res.valid, false);
    assert.ok(res.violations.some((v) => v.code === 'UNSUPPORTED_ACTOR_CLAIM'));
  });

  it('rejects unbacked outcome revenue or dollar savings claims (UNSUPPORTED_OUTCOME)', () => {
    const claim = {
      claimId: 'claim-8',
      factIds: ['f-raft-1'],
      text: 'Architected distributed key-value store in Go resulting in saved $500,000 in infrastructure costs.',
    };

    const res = defaultResumeClaimValidationService.validateClaim(claim, {
      factInventory: sampleFacts,
      candidateProfile: sampleCandidate,
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: 'proj-dist-kv',
    });

    assert.equal(res.valid, false);
    assert.ok(res.violations.some((v) => v.code === 'UNSUPPORTED_OUTCOME'));
  });

  it('rejects uncorroborated performance multipliers (UNSUPPORTED_PERFORMANCE_CLAIM)', () => {
    const claim = {
      claimId: 'claim-9',
      factIds: ['f-raft-1'],
      text: 'Architected distributed key-value store in Go running 10x faster than alternative solutions.',
    };

    const res = defaultResumeClaimValidationService.validateClaim(claim, {
      factInventory: sampleFacts,
      candidateProfile: sampleCandidate,
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: 'proj-dist-kv',
    });

    assert.equal(res.valid, false);
    assert.ok(res.violations.some((v) => v.code === 'UNSUPPORTED_PERFORMANCE_CLAIM'));
  });

  it('rejects duplicate claims exceeding semantic similarity threshold (DUPLICATE_RENDERED_CLAIM)', () => {
    const claim = {
      claimId: 'claim-10',
      factIds: ['f-raft-1'],
      text: 'Architected distributed key-value store using Raft consensus protocol in Go.',
    };

    const alreadyRendered = [
      { text: 'Architected distributed key-value store using Raft consensus algorithm in Go.' },
    ];

    const res = defaultResumeClaimValidationService.validateClaim(claim, {
      factInventory: sampleFacts,
      candidateProfile: sampleCandidate,
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: 'proj-dist-kv',
      alreadyRenderedClaims: alreadyRendered,
    });

    assert.equal(res.valid, false);
    assert.ok(res.violations.some((v) => v.code === 'DUPLICATE_RENDERED_CLAIM'));
  });

  it('rejects weak passive verb openers (WEAK_VERB_OPENER)', () => {
    const claim = {
      claimId: 'claim-11',
      factIds: ['f-raft-1'],
      text: 'Responsible for building distributed key-value store with Raft consensus in Go.',
    };

    const res = defaultResumeClaimValidationService.validateClaim(claim, {
      factInventory: sampleFacts,
      candidateProfile: sampleCandidate,
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: 'proj-dist-kv',
    });

    assert.equal(res.valid, false);
    assert.ok(res.violations.some((v) => v.code === 'WEAK_VERB_OPENER'));
  });

  it('rejects raw LaTeX tag leaks (LATEX_LEAKAGE)', () => {
    const claim = {
      claimId: 'claim-12',
      factIds: ['f-raft-1'],
      text: 'Architected distributed key-value store using \\textbf{Raft} consensus in Go.',
    };

    const res = defaultResumeClaimValidationService.validateClaim(claim, {
      factInventory: sampleFacts,
      candidateProfile: sampleCandidate,
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: 'proj-dist-kv',
    });

    assert.equal(res.valid, false);
    assert.ok(res.violations.some((v) => v.code === 'LATEX_LEAKAGE'));
  });
});
