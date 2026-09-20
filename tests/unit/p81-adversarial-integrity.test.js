/**
 * @file P81 Adversarial Integrity & Unsupported-Claim Test Suite (Rule 32)
 *
 * Verifies that the platform actively defends against adversarial inputs:
 *  - Metric fabrication attempts
 *  - Unauthorized technology injection
 *  - Fabricated team leadership and scale assertions
 *  - Cross-project fact contamination
 *  - Keyword stuffing attempts to game scoring
 *  - Multi-column ATS degradation attempts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ResumeClaimValidationService } from '../../src/services/resume-claim-validation.service.js';
import { ResumeKeywordCoverageService } from '../../src/services/resume-keyword-coverage.service.js';
import { AtsParseabilityService } from '../../src/services/resume-ats-parseability.service.js';
import { generateUnifiedQualityReport } from '../../src/services/resume-quality-assessment.service.js';

describe('P81: Adversarial Integrity & Unsupported-Claim Defense (Rule 32)', () => {
  const claimValidator = new ResumeClaimValidationService();
  const keywordService = new ResumeKeywordCoverageService();
  const atsService = new AtsParseabilityService();

  const authorizedFacts = [
    {
      factId: 'fact-1',
      candidateId: 'cand-1',
      association: { projectId: 'proj-1' },
      text: 'Built REST API endpoints using Node.js and PostgreSQL.',
      technologies: ['Node.js', 'PostgreSQL'],
      metrics: [],
      provenance: 'VERIFIED',
    },
    {
      factId: 'fact-2',
      candidateId: 'cand-1',
      association: { projectId: 'proj-2' },
      text: 'Implemented caching layer using Redis.',
      technologies: ['Redis'],
      metrics: [],
      provenance: 'VERIFIED',
    },
  ];

  const candidateProfile = {
    id: 'cand-1',
    name: 'Alice Coder',
    skills: ['Node.js', 'PostgreSQL', 'Redis', 'JavaScript'],
  };

  it('Adversarial 1: blocks claim attempting to fabricate unbacked scale/performance metrics', () => {
    const maliciousClaim = {
      claimId: 'claim-adv-1',
      text: 'Engineered REST API endpoints handling 100,000 requests/sec with 99.99% uptime via Node.js.',
      factIds: ['fact-1'],
    };

    const validation = claimValidator.validateClaim(maliciousClaim, {
      factInventory: authorizedFacts,
      candidateProfile,
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: 'proj-1',
    });

    assert.equal(validation.valid, false);
    assert.equal(validation.rejected, true);
    assert.ok(
      validation.violations.some((v) => v.code === 'UNSUPPORTED_METRIC'),
      'Expected UNSUPPORTED_METRIC violation'
    );

    // Safety gate zeros headline score
    const unifiedReport = generateUnifiedQualityReport({
      atsParseabilityReport: { score: 95 },
      jobMatchReport: { score: 85 },
      contentQualityReport: { score: 90 },
      claimValidationReport: validation,
    });
    assert.equal(unifiedReport.headlineScore, 0);
    assert.equal(unifiedReport.status, 'REJECTED_BY_INTEGRITY_GATE');
  });

  it('Adversarial 2: blocks claim introducing unauthorized technologies not in verified evidence', () => {
    const maliciousClaim = {
      claimId: 'claim-adv-2',
      text: 'Architected cloud deployment pipelines using Kubernetes, Terraform, and AWS ECS.',
      factIds: ['fact-1'],
    };

    const validation = claimValidator.validateClaim(maliciousClaim, {
      factInventory: authorizedFacts,
      candidateProfile,
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: 'proj-1',
    });

    assert.equal(validation.valid, false);
    assert.equal(validation.rejected, true);
    assert.ok(
      validation.violations.some((v) => v.code === 'UNAUTHORIZED_TECHNOLOGY'),
      'Expected UNAUTHORIZED_TECHNOLOGY violation'
    );
  });

  it('Adversarial 3: blocks claim inventing team management or customer scale', () => {
    const maliciousClaim = {
      claimId: 'claim-adv-3',
      text: 'Led a team of 15 senior software engineers serving 2,000,000 enterprise customers.',
      factIds: ['fact-1'],
    };

    const validation = claimValidator.validateClaim(maliciousClaim, {
      factInventory: authorizedFacts,
      candidateProfile,
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: 'proj-1',
    });

    assert.equal(validation.valid, false);
    assert.equal(validation.rejected, true);
    assert.ok(
      validation.violations.some(
        (v) =>
          v.code === 'UNSUPPORTED_ACTOR_CLAIM' || v.code === 'UNSUPPORTED_LEADERSHIP_IMPLICATION'
      )
    );
  });

  it('Adversarial 4: blocks cross-project fact contamination', () => {
    const crossClaim = {
      claimId: 'claim-adv-4',
      text: 'Implemented caching layer using Redis.',
      factIds: ['fact-2'], // fact-2 belongs to proj-2, being claimed in proj-1
    };

    const validation = claimValidator.validateClaim(crossClaim, {
      factInventory: authorizedFacts,
      candidateProfile,
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: 'proj-1',
    });

    assert.equal(validation.valid, false);
    assert.ok(validation.violations.some((v) => v.code === 'CROSS_SECTION_CONTAMINATION'));
  });

  it('Adversarial 5: detects keyword stuffing attempting to artificially game ATS score', () => {
    const stuffedResume = {
      summary: {
        text: 'Kubernetes expert building Kubernetes clusters with Kubernetes pods. Highly proficient in Kubernetes orchestration and Kubernetes ingress.',
      },
      skills: {
        categories: [{ categoryName: 'DevOps', skills: [{ name: 'Kubernetes' }] }],
      },
      projects: [],
      experience: [],
    };

    const report = ResumeKeywordCoverageService.analyzeKeywordCoverage({
      jobDescription: { requirements: [{ skill: 'Kubernetes', importance: 'REQUIRED' }] },
      structuredResume: stuffedResume,
    });

    assert.ok(report.stuffingWarnings.length > 0);
    const kwWarning = report.stuffingWarnings.find((w) => w.term.toLowerCase() === 'kubernetes');
    assert.ok(kwWarning);
    assert.ok(kwWarning.reason.includes('keyword stuffing'));
    assert.ok(kwWarning.occurrences >= 4);
  });

  it('Adversarial 6: detects multi-column layout injection interfering with ATS extraction', () => {
    const multiColLatex = `
\\begin{document}
\\begin{multicols}{2}
Col 1
\\columnbreak
Col 2
\\end{multicols}
\\end{document}
`;

    const report = atsService.evaluateAtsParseability({
      extractedText: 'Jane Doe\njane@example.com\nSummary\nTechnical Skills\nProjects\nExperience',
      texContent: multiColLatex,
    });

    const readingOrder = report.checks.find((c) => c.checkId === 'READING_ORDER');
    assert.equal(readingOrder.passed, false);
    assert.ok(report.findings.some((f) => f.dimension === 'readingOrder'));
  });
});
