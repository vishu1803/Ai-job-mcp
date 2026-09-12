import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { criticalRegressionFixture } from '../fixtures/resume-benchmarks.js';
import { buildCanonicalFactInventory } from '../../src/services/candidate-fact-inventory.service.js';
import { buildStructuredResumeSnapshot } from '../../src/services/structured-resume.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import { ResumePdfObserver } from '../../src/services/resume-pdf-observer.service.js';
import { defaultAtsParseabilityService } from '../../src/services/resume-ats-parseability.service.js';
import { evaluateResumeWritingQuality } from '../../src/services/resume-writing-quality.service.js';

describe('P17: End-to-End Evidence Grounded Resume Intelligence & PDF Quality', () => {
  const { candidate, targetJob } = criticalRegressionFixture;

  it('generates fully grounded, physically validated 1-page PDF passing P17 quality contract', async () => {
    // 1. Canonical Fact Inventory
    const inventory = buildCanonicalFactInventory(candidate, targetJob);
    assert.ok(inventory.facts.length >= 10, 'Must extract comprehensive canonical facts');

    // 2. Structured Resume Snapshot
    const snapshot = buildStructuredResumeSnapshot({
      candidateProfile: candidate,
      jobPosting: targetJob,
    });
    assert.ok(snapshot);
    const doc = snapshot.structuredResume;
    assert.ok(doc);
    assert.ok(doc.projects?.length >= 1, 'Must include at least 1 project');
    assert.ok(doc.experience?.length >= 1, 'Must include at least 1 experience record');

    // Verify Core Invariant: Every project bullet must have valid composedFromFactIds pointing to inventory
    const inventoryFactIds = new Set(inventory.facts.map((f) => f.factId || f.id));
    for (const p of doc.projects) {
      for (const b of (p.bullets || [])) {
        assert.ok(Array.isArray(b.composedFromFactIds), 'Must have composedFromFactIds array');
        assert.ok(b.composedFromFactIds.length > 0, 'Must trace to at least one canonical fact');
        for (const fid of b.composedFromFactIds) {
          assert.ok(inventoryFactIds.has(fid), `Bullet factId ${fid} must exist in canonical fact inventory`);
        }
      }
    }

    // 3. LaTeX Document Generation
    const latexGenerator = new LatexDocumentGenerator();
    const appPkg = {
      structuredResume: doc,
      tailoredResume: { structuredResume: doc },
      targetJob,
    };
    const latexResult = latexGenerator.generateTailoredResumeLatex({
      applicationPackage: appPkg,
    });
    assert.ok(latexResult.texContent);
    assert.ok(latexResult.texContent.includes('\\documentclass'));

    // 4. Physical PDF Compilation via Tectonic
    const compiler = new LatexCompilerService();
    const compileResult = await compiler.compileLatexToPdf({
      texContent: latexResult.texContent,
      jobName: 'p17-quality-test',
    });
    assert.ok(Buffer.isBuffer(compileResult.pdfBuffer));
    assert.ok(compileResult.pdfBuffer.length > 500);

    // 5. PDF Observer & Observation Validation
    const pdfObserver = new ResumePdfObserver();
    const pdfObs = pdfObserver.observe(compileResult.pdfBuffer);
    assert.ok(pdfObs);
    assert.equal(pdfObs.pageCount, 1, 'Final resume artifact must strictly fit on 1 page');
    assert.ok(pdfObs.textMetrics.textLength >= 400, 'Must contain dense selectable text');
    assert.equal(pdfObs.suspiciousGlyphsDetected, 0, 'Must have zero corrupt glyphs');

    // 6. Honest ATS Parseability Service Check
    const atsResult = defaultAtsParseabilityService.evaluateAtsParseability({
      pdfBuffer: compileResult.pdfBuffer,
      structuredResume: doc,
    });
    assert.ok(atsResult);
    assert.ok(
      atsResult.atsParseabilityScore >= 80,
      `ATS Parseability Score must be >= 80, got ${atsResult.atsParseabilityScore}`
    );

    // 7. 16-Dimension Writing Quality Evaluation
    const qualityReport = evaluateResumeWritingQuality({
      structuredResume: doc,
      jobPosting: targetJob,
      factInventory: inventory,
    });
    assert.ok(qualityReport);
    assert.ok(
      qualityReport.writingQualityScore >= 75,
      `Writing quality score must be >= 75, got ${qualityReport.writingQualityScore}`
    );
    assert.ok(qualityReport.dimensions.evidenceTraceability >= 90);
  });
});
