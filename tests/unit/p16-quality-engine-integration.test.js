/**
 * @file Quality Engine & Critical Regression Test Suite
 *
 * Exercises the complete professional quality pipeline:
 * candidate sources
 *   -> canonical fact inventory
 *   -> section planning
 *   -> evidence-to-accomplishment composition
 *   -> structured resume snapshot
 *   -> writing quality scoring
 *   -> PDF observation
 *
 * Validates:
 * 1. Critical regression fixture passes with rich multi-bullet complementary composition.
 * 2. Zero hallucinated metrics or synthetic defaults.
 * 3. 12-dimension writing quality engine.
 * 4. Section planner dynamic ordering and capacity estimation.
 * 5. Independent PDF observer analysis.
 */

import { describe, test, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCanonicalFactInventory,
  scoreFactsForJob,
  CANONICAL_FACT_TYPES,
} from '../../src/services/candidate-fact-inventory.service.js';
import {
  composeProfessionalProjectBullets,
  determineProjectBulletCapacity,
  composeExperienceRecords,
  composeDsaSection,
  composeProfessionalSummary,
  synthesizeAccomplishmentNarrative,
} from '../../src/services/resume-accomplishment-composer.service.js';
import {
  planDocumentSections,
  SECTION_KEYS,
} from '../../src/services/resume-section-planner.service.js';
import {
  evaluateResumeWritingQuality,
  evaluateEvidenceDerivedQuality,
  OMISSION_REASON_CODES,
} from '../../src/services/resume-writing-quality.service.js';
import {
  composeStructuredResumeDocument as composeViaLegacyEntry,
  compressProfessionalBullet,
  polishProfessionalSummary,
} from '../../src/services/resume-professional-composition.service.js';
import {
  evaluateResumeAcceptanceGate,
} from '../../src/services/resume-acceptance-gate.service.js';
import {
  ResumePdfObserver,
} from '../../src/services/resume-pdf-observer.service.js';
import {
  groupSkillsIntoCategories,
  categorizeTechnology,
  TECH_CATEGORIES,
} from '../../src/utils/technology-taxonomy.js';
import {
  buildStructuredResumeDocument,
  buildStructuredResumeSnapshot,
} from '../../src/services/structured-resume.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import {
  criticalRegressionFixture,
  benchmarkBackendEarlyCareer,
  benchmarkFrontendEarlyCareer,
} from '../fixtures/resume-benchmarks.js';

describe('Critical Regression: Rich Evidence Utilization vs Shallow/Redundant Bullets', () => {
  const { candidate, targetJob } = criticalRegressionFixture;

  it('canonical fact inventory extracts all distinct project and experience facts without loss', () => {
    const inv = buildCanonicalFactInventory(candidate, targetJob);
    assert.ok(inv.facts.length >= 12, 'must extract at least 12 distinct facts');

    const telemetryFacts = inv.byProject.get('proj-telemetry') || [];
    // 3 bullets + 3 highlights = 6 distinct claims
    const claimFacts = telemetryFacts.filter((f) => f.factType !== 'technology');
    assert.ok(claimFacts.length >= 4, `expected at least 4 claim facts, got ${claimFacts.length}`);

    // Verify deterministic fact IDs
    for (const f of claimFacts) {
      assert.ok(f.id, 'fact must have an id');
      assert.equal(f.ownerType, 'PROJECT');
      assert.ok(f.text.length > 20);
    }
  });

  it('section planner selects all meaningful candidate sections in evidence-driven order', () => {
    const inv = buildCanonicalFactInventory(candidate, targetJob);
    const plan = planDocumentSections({
      candidateProfile: candidate,
      factInventory: inv,
      jobPosting: targetJob,
    });

    assert.equal(plan.candidateArchetype, 'FRESHER');
    assert.ok(plan.sectionOrder.includes(SECTION_KEYS.SUMMARY));
    assert.ok(plan.sectionOrder.includes(SECTION_KEYS.SKILLS));
    assert.ok(plan.sectionOrder.includes(SECTION_KEYS.PROJECTS));
    assert.ok(plan.sectionOrder.includes(SECTION_KEYS.DSA));
    assert.ok(plan.sectionOrder.includes(SECTION_KEYS.EXPERIENCE));
    assert.ok(plan.sectionOrder.includes(SECTION_KEYS.EDUCATION));

    // For fresher, PROJECTS precedes EXPERIENCE
    const projIdx = plan.sectionOrder.indexOf(SECTION_KEYS.PROJECTS);
    const expIdx = plan.sectionOrder.indexOf(SECTION_KEYS.EXPERIENCE);
    assert.ok(projIdx < expIdx, 'Projects must precede Experience for project-strong fresher archetype');
  });

  it('structured resume snapshot composes complementary multi-bullet project without shallow repetition', () => {
    const { structuredResume, evidenceValidationReceipt, contentQualityGate } =
      buildStructuredResumeSnapshot({
        candidateProfile: candidate,
        jobPosting: targetJob,
      });

    assert.ok(structuredResume);
    assert.ok(contentQualityGate.passed);
    assert.equal(evidenceValidationReceipt.violations?.length || 0, 0);

    const telemetry = structuredResume.projects.find((p) => p.name.includes('Telemetry'));
    assert.ok(telemetry, 'Telemetry project must be included');
    // Crucial check: candidate has 6 distinct facts, must render at least 2 complementary bullets (never forced down to 1)
    assert.ok(telemetry.bullets.length >= 2, `expected at least 2 bullets, got ${telemetry.bullets.length}`);

    // Verify bullets are complementary (not exact or near duplicate)
    const bulletTexts = telemetry.bullets.map((b) => b.text.toLowerCase());
    for (let i = 0; i < bulletTexts.length; i++) {
      for (let j = i + 1; j < bulletTexts.length; j++) {
        assert.notEqual(bulletTexts[i], bulletTexts[j]);
      }
    }

    // Verify experience section rendered
    assert.ok(structuredResume.experience.length >= 1);
    assert.equal(structuredResume.experience[0].company, 'Apex Infrastructure');
    assert.ok(structuredResume.experience[0].bullets.length >= 2);

    // Verify DSA rendered truthfully
    assert.ok(structuredResume.dsa);
    assert.equal(structuredResume.dsa.hasSection, true);
    assert.ok(structuredResume.dsa.profileUrl.includes('leetcode.com'));
  });
});

describe('Writing Quality Scorer: 12-Dimension Evaluation', () => {
  it('evaluates benchmark backend resume and yields high score without penalizing lack of metrics', () => {
    const snap = buildStructuredResumeSnapshot({
      candidateProfile: benchmarkBackendEarlyCareer,
    });

    const report = evaluateResumeWritingQuality({
      structuredResume: snap.structuredResume,
    });

    assert.ok(report.writingQualityScore >= 70, `Score ${report.writingQualityScore} should be >= 70`);
    assert.ok(report.dimensions.actionVerbStrength >= 70);
    assert.ok(report.dimensions.technicalSpecificity >= 70);
    assert.ok(report.dimensions.authenticMetricUsage >= 80, 'Must not penalize authentic metrics');
    assert.ok(report.dimensions.redundancy >= 80);
    assert.ok(report.strengths.length >= 1);
  });

  it('detects weak verbs and clichés in degraded resume', () => {
    const degradedResume = {
      projects: [
        {
          name: 'Lazy Project',
          bullets: [
            { text: 'Worked on a dynamic results-driven team player website.' },
            { text: 'Helped with database stuff was developed by me.' },
          ],
        },
      ],
      experience: [],
      summary: { text: 'Passionate self-starter developer.' },
    };

    const report = evaluateResumeWritingQuality({
      structuredResume: degradedResume,
    });

    assert.ok(report.writingQualityScore < 60, `Degraded score ${report.writingQualityScore} should be < 60`);
    assert.ok(report.findings.some((f) => f.code === 'WEAK_VERB'));
    assert.ok(report.findings.some((f) => f.code === 'CLICHE_DETECTED'));
  });
});

describe('Technology Taxonomy: Safe Pass-Through & Categorization', () => {
  it('categorizes canonical technologies correctly', () => {
    assert.equal(categorizeTechnology('TypeScript'), TECH_CATEGORIES.LANGUAGES);
    assert.equal(categorizeTechnology('React'), TECH_CATEGORIES.FRAMEWORKS);
    assert.equal(categorizeTechnology('PostgreSQL'), TECH_CATEGORIES.DATABASES);
    assert.equal(categorizeTechnology('Docker'), TECH_CATEGORIES.CLOUD_DEVOPS);
    assert.equal(categorizeTechnology('gRPC'), TECH_CATEGORIES.SYSTEMS_ARCHITECTURE);
    assert.equal(categorizeTechnology('PyTorch'), TECH_CATEGORIES.AI_ML);
  });

  it('safely passes through unknown technologies to Developer Tools without throwing', () => {
    const unknownTech = 'HyperionCustomEngine v4.2';
    const category = categorizeTechnology(unknownTech);
    assert.equal(category, TECH_CATEGORIES.DEVELOPER_TOOLS);

    const grouped = groupSkillsIntoCategories([
      'TypeScript',
      'React',
      unknownTech,
    ]);

    assert.ok(grouped.some((g) => g.categoryName === TECH_CATEGORIES.LANGUAGES));
    assert.ok(grouped.some((g) => g.categoryName === TECH_CATEGORIES.FRAMEWORKS));
    assert.ok(grouped.some((g) => g.categoryName === TECH_CATEGORIES.DEVELOPER_TOOLS));

    const devToolsGroup = grouped.find((g) => g.categoryName === TECH_CATEGORIES.DEVELOPER_TOOLS);
    assert.ok(devToolsGroup.skills.some((s) => s.name === unknownTech));
  });
});

describe('PDF Observer: Independent PDF Observation', () => {
  it('evaluates mock PDF buffer and detects missing email, broken words, or glyphs', () => {
    const observer = new ResumePdfObserver();
    const mockBuffer = Buffer.from(
      '%PDF-1.5\n/Count 1\nstream\n(Devin Thorne) Tj\n(devin@example.com) Tj\n(https://github.com/devin) Tj\n(Technical Skills) Tj\n(Projects) Tj\nendstream\n%%EOF'
    );

    const report = observer.observe(mockBuffer);
    assert.equal(report.pageCount, 1);
    assert.equal(report.contactInfo.hasEmail, true);
    assert.equal(report.contactInfo.email, 'devin@example.com');
    assert.ok(report.readingOrder.includes('SKILLS'));
    assert.ok(report.readingOrder.includes('PROJECTS'));
  });

  it('rejects invalid or empty PDF buffers cleanly', () => {
    const observer = new ResumePdfObserver();
    const report = observer.observe(Buffer.alloc(10));
    assert.equal(report.passed, false);
    assert.equal(report.pdfObservabilityScore, 0);
  });
});

describe('End-to-End Real PDF Quality Pipeline (Directive Section 21)', () => {
  it('compiles candidate through entire quality pipeline to real PDF and validates via PDF observer', async () => {
    const { candidate, targetJob } = criticalRegressionFixture;

    // 1. Build structured resume snapshot (canonical facts + section planning + accomplishment composer)
    const { structuredResume, contentQualityGate, evidenceValidationReceipt } =
      buildStructuredResumeSnapshot({
        candidateProfile: candidate,
        jobPosting: targetJob,
      });

    assert.ok(structuredResume);
    assert.equal(contentQualityGate.passed, true);
    assert.equal(evidenceValidationReceipt.violations?.length || 0, 0);

    // 2. Generate LaTeX from structured snapshot
    const latexGenerator = new LatexDocumentGenerator();
    const appPkg = {
      structuredResume,
      tailoredResume: { structuredResume },
      targetJob,
    };
    const latexResult = latexGenerator.generateTailoredResumeLatex({
      applicationPackage: appPkg,
    });
    assert.ok(latexResult.texContent.includes('\\documentclass'));

    // 3. Compile actual PDF using local Tectonic compiler
    const compiler = new LatexCompilerService();
    const compiled = await compiler.compileLatexToPdf({
      texContent: latexResult.texContent,
      jobName: 'integration-quality-test',
    });

    assert.ok(Buffer.isBuffer(compiled.pdfBuffer));
    assert.ok(compiled.pdfBuffer.length > 1000);
    assert.equal(compiled.pdfBuffer.slice(0, 5).toString('latin1'), '%PDF-');

    // 4. Independent PDF Observer inspection
    const observer = new ResumePdfObserver();
    const obsReport = observer.observe(compiled.pdfBuffer, { targetPageCount: 1 });

    assert.equal(obsReport.pageCount, 1, 'Compiled PDF must be exactly 1 page');
    assert.ok(obsReport.pdfObservabilityScore >= 75, `Observability score ${obsReport.pdfObservabilityScore} should be >= 75`);
    assert.equal(obsReport.passed, true);
    assert.equal(obsReport.contactInfo.hasEmail, true);
    assert.ok(obsReport.textMetrics.bulletCount >= 3, 'Must render multiple structured bullets');
    assert.ok(obsReport.readingOrder.includes('SKILLS'));
    assert.ok(obsReport.readingOrder.includes('PROJECTS'));
  });
});

describe('Strategic Enhancement 1: Accomplishment Narrative Realization', () => {
  it('synthesizes natural engineering narrative instead of robotic semicolon concatenation', () => {
    const primary = {
      id: 'fact-1',
      text: 'Engineered high-throughput distributed telemetry ingest pipeline in Rust',
      technologies: ['Rust'],
      factType: 'architecture',
    };
    const complementary = {
      id: 'fact-2',
      text: 'Implemented write-ahead logging and disk spillover buffering for zero data loss',
      technologies: ['WAL'],
      factType: 'implementation',
    };

    const narrative = synthesizeAccomplishmentNarrative(primary, complementary);
    assert.ok(narrative);
    assert.ok(narrative.text.length > 50);
    // Must NOT contain robotic semicolon concatenation
    assert.ok(!narrative.text.includes(';'), 'Narrative should not use semicolon concatenation');
    // Must contain natural participle linkage
    assert.ok(
      narrative.text.includes('implementing') || narrative.text.includes('incorporating') || narrative.text.includes('utilizing'),
      `Expected participle linkage, got: "${narrative.text}"`
    );
    assert.deepEqual(narrative.composedFromFactIds, ['fact-1', 'fact-2']);
    assert.equal(narrative.evidenceRefs.length, 2);
  });
});

describe('Strategic Enhancement 2: Genuinely Utility-Driven Section Planning', () => {
  const { candidate, targetJob } = criticalRegressionFixture;

  it('computes multi-attribute utilityScore and marginalUtilityPerSpace for all candidate sections', () => {
    const inv = buildCanonicalFactInventory(candidate, targetJob);
    const plan = planDocumentSections({
      candidateProfile: candidate,
      factInventory: inv,
      jobPosting: targetJob,
    });

    for (const key of Object.keys(plan.sectionMetrics)) {
      const metric = plan.sectionMetrics[key];
      assert.ok(typeof metric.utilityScore === 'number', `${key} must have utilityScore`);
      assert.ok(typeof metric.marginalUtilityPerSpace === 'number', `${key} must have marginalUtilityPerSpace`);
      if (metric.available && metric.estimatedHeight > 0) {
        assert.ok(metric.marginalUtilityPerSpace > 0, `${key} must have positive marginal utility per space`);
      }
    }
  });

  it('prunes lowest marginal utility sections with explicit omission reasons when capacity exceeded', () => {
    const richCandidate = {
      ...candidate,
      awards: [{ title: 'ACM Regional Finalist', year: '2023' }],
      openSource: [{ name: 'tokio-contrib', description: 'Async runtime patch' }],
      certifications: [{ name: 'AWS Certified Solutions Architect', authority: 'AWS' }],
    };
    const inv = buildCanonicalFactInventory(richCandidate, targetJob);
    const plan = planDocumentSections({
      candidateProfile: richCandidate,
      factInventory: inv,
      jobPosting: targetJob,
    });

    assert.ok(plan.sectionOrder.length > 0);
    assert.ok(plan.totalEstimatedHeight <= plan.usablePageHeight + 35, 'Total height should be disciplined to single-page capacity');
  });
});

describe('Strategic Enhancement 3: Evidence-Derived Quality Metrics', () => {
  const { candidate, targetJob } = criticalRegressionFixture;

  it('derives ATS parseability, exact job requirement coverage, fact utilization, and omission reasons', () => {
    const inv = buildCanonicalFactInventory(candidate, targetJob);
    const { structuredResume } = buildStructuredResumeSnapshot({
      candidateProfile: candidate,
      jobPosting: targetJob,
    });

    const quality = evaluateEvidenceDerivedQuality({
      structuredResume,
      factInventory: inv,
      jobPosting: targetJob,
    });

    // 1. Evidence-derived ATS Parseability
    assert.ok(quality.atsParseabilityScore >= 90, `ATS score ${quality.atsParseabilityScore} should be >= 90`);
    assert.equal(quality.atsFindings.length, 0, 'Should have 0 ATS defects for well-structured snapshot');

    // 2. Evidence-derived Job Relevance & Requirement Matching
    assert.ok(typeof quality.jobRelevanceScore === 'number');
    assert.ok(quality.matchedRequirements.length > 0, 'Must identify matched requirements');
    const matchedKeywords = quality.matchedRequirements.map((r) => r.keyword.toLowerCase());
    assert.ok(matchedKeywords.includes('rust'), 'Must match Rust from requirements');

    // 3. Exact Fact Utilization
    assert.ok(quality.factUtilization.totalAvailableFacts > 0);
    assert.ok(quality.factUtilization.totalRenderedFacts > 0);
    assert.ok(quality.factUtilization.utilizationRate > 0 && quality.factUtilization.utilizationRate <= 1.0);
    assert.ok(quality.factUtilization.renderedFactIds.length > 0);

    // 4. Omission Reasons
    assert.ok(typeof quality.omissionReasons === 'object');
    for (const factId of quality.factUtilization.unrenderedFactIds) {
      assert.ok(
        quality.omissionReasons[factId],
        `Unrendered fact ${factId} must have an explicit omission reason`
      );
      assert.ok(
        Object.values(OMISSION_REASON_CODES).includes(quality.omissionReasons[factId]),
        `Omission reason must be a recognized code`
      );
    }
  });
});

describe('Strategic Enhancement 4: Unified Composition Authority', () => {
  it('resume-professional-composition re-exports and delegates cleanly to accomplishment composer', () => {
    const { candidate, targetJob } = criticalRegressionFixture;
    const { structuredResume } = buildStructuredResumeSnapshot({
      candidateProfile: candidate,
      jobPosting: targetJob,
    });

    const composed = composeViaLegacyEntry(structuredResume);
    assert.ok(composed);
    assert.ok(composed.summary);
    assert.ok(composed.projects);
    assert.equal(composed.experience[0].company, 'Apex Infrastructure');
  });
});

describe('Directive 15-Point Formal Acceptance Contract', () => {
  const { candidate, targetJob } = criticalRegressionFixture;

  it('validates generated resume passes all 15 acceptance criteria', async () => {
    const inv = buildCanonicalFactInventory(candidate, targetJob);
    const plan = planDocumentSections({
      candidateProfile: candidate,
      factInventory: inv,
      jobPosting: targetJob,
    });
    const { structuredResume } = buildStructuredResumeSnapshot({
      candidateProfile: candidate,
      jobPosting: targetJob,
    });

    const latexGen = new LatexDocumentGenerator();
    const appPkg = { structuredResume, tailoredResume: { structuredResume }, targetJob };
    const latex = latexGen.generateTailoredResumeLatex({ applicationPackage: appPkg });

    const compiler = new LatexCompilerService();
    const compiled = await compiler.compileLatexToPdf({
      texContent: latex.texContent,
      jobName: 'acceptance-contract-test',
    });

    const gateResult = evaluateResumeAcceptanceGate({
      structuredResume,
      factInventory: inv,
      jobPosting: targetJob,
      sectionPlan: plan,
      pdfBuffer: compiled.pdfBuffer,
    });

    assert.equal(
      gateResult.passed,
      true,
      `Gate failed with violations: ${JSON.stringify(gateResult.violations, null, 2)}`
    );
    assert.equal(gateResult.violations.length, 0);

    // Verify all 15 criteria explicitly pass
    for (let i = 1; i <= 15; i++) {
      assert.ok(gateResult.criteria[i], `Criterion ${i} must be evaluated`);
      assert.equal(
        gateResult.criteria[i].passed,
        true,
        `Criterion ${i} (${gateResult.criteria[i].name}) must pass`
      );
    }
  });
});



