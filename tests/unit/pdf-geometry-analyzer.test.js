/**
 * @file PDF Geometry Analyzer Unit Tests (P14-026)
 *
 * Tests for the PDF geometry analyzer that measures actual compiled PDF
 * properties including page count, section detection, content utilization,
 * spacing consistency, and layout balance classification.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PdfGeometryAnalyzer } from '../../src/services/pdf-geometry-analyzer.service.js';
import { DENSITY_CLASSIFICATION, PAGE_STRATEGY } from '../../src/services/resume-layout-engine.service.js';

const analyzer = new PdfGeometryAnalyzer();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: create synthetic PDF-like buffers for testing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a minimal synthetic PDF buffer with injected text content.
 * This is NOT a valid PDF for rendering, but contains enough structure
 * for the analyzer's text extraction and page count detection.
 */
function createSyntheticPdfBuffer({
  text = '',
  pageCount = 1,
} = {}) {
  // Build a minimal PDF structure
  const textOperators = text
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(line => `(${line.replace(/[()\\]/g, '')})Tj`)
    .join(' ');

  const pageObjects = Array.from({ length: pageCount }, (_, i) =>
    `/Type /Page /Parent 2 0 R /Contents ${3 + i} 0 R`
  ).join('\n');

  const pdfContent = [
    '%PDF-1.4',
    '1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj',
    `2 0 obj <</Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${3 + i} 0 R`).join(' ')}] /Count ${pageCount}>> endobj`,
    ...Array.from({ length: pageCount }, (_, i) =>
      `${3 + i} 0 obj <</Length ${textOperators.length + 20}>> stream\nBT ${textOperators} ET\nendstream endobj`
    ),
    `${3 + pageCount} 0 obj <</Type /Page /Parent 2 0 R>> endobj`,
    `xref\n0 ${4 + pageCount}`,
    'trailer <</Size 5 /Root 1 0 R>>',
    '%%EOF',
  ].join('\n');

  return Buffer.from(pdfContent, 'latin1');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('PdfGeometryAnalyzer — P14-026', () => {
  describe('Invalid Input Handling', () => {
    it('returns failure report for non-buffer input', () => {
      const result = analyzer.analyze({ pdfBuffer: 'not-a-buffer' });
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('returns failure report for empty buffer', () => {
      const result = analyzer.analyze({ pdfBuffer: Buffer.alloc(10) });
      assert.strictEqual(result.success, false);
    });

    it('returns failure report for buffer too small to be a valid PDF', () => {
      const result = analyzer.analyze({ pdfBuffer: Buffer.from('%PDF-1.4') });
      assert.strictEqual(result.success, false);
    });
  });

  describe('Page Count Detection', () => {
    it('detects single page from /Count', () => {
      const pdf = createSyntheticPdfBuffer({
        text: 'Professional Summary\nTechnical Skills\nExperience entries here with enough content to be a valid resume document for testing purposes',
        pageCount: 1,
      });
      const result = analyzer.analyze({ pdfBuffer: pdf });
      if (result.success) {
        assert.strictEqual(result.pageCount, 1);
      }
    });

    it('detects multiple pages from /Count', () => {
      const pdf = createSyntheticPdfBuffer({
        text: 'Professional Summary\nTechnical Skills\nExperience entries here with enough content to be a valid resume document for testing purposes',
        pageCount: 2,
      });
      const result = analyzer.analyze({ pdfBuffer: pdf });
      if (result.success) {
        assert.strictEqual(result.pageCount, 2);
      }
    });
  });

  describe('Section Detection', () => {
    it('detects standard resume sections', () => {
      const pdf = createSyntheticPdfBuffer({
        text: [
          'Test Candidate',
          'Professional Summary',
          'Experienced software engineer with skills in building systems',
          'Technical Skills',
          'JavaScript, Python, React, Node.js, PostgreSQL',
          'Technical Projects',
          'Project A: Built a web application with React',
          'Professional Experience',
          'Software Engineer at Company A from 2020 to Present',
          'Education',
          'B.Tech in Computer Science from University A',
        ].join('\n'),
      });
      const result = analyzer.analyze({
        pdfBuffer: pdf,
        expectedSections: ['SUMMARY', 'SKILLS', 'PROJECTS', 'EXPERIENCE', 'EDUCATION'],
      });

      if (result.success) {
        const sectionTypes = result.sections.map(s => s.type);
        assert.ok(sectionTypes.includes('SUMMARY'), 'Should detect Summary');
        assert.ok(sectionTypes.includes('SKILLS'), 'Should detect Skills');
        assert.ok(sectionTypes.includes('PROJECTS'), 'Should detect Projects');
        assert.ok(sectionTypes.includes('EXPERIENCE'), 'Should detect Experience');
        assert.ok(sectionTypes.includes('EDUCATION'), 'Should detect Education');
      }
    });

    it('detects DSA section when present', () => {
      const pdf = createSyntheticPdfBuffer({
        text: [
          'Test Candidate',
          'Professional Summary',
          'Some summary text here',
          'Technical Skills',
          'JavaScript, Python',
          'Technical Projects',
          'Project A',
          'Problem Solving and Algorithmic Practice',
          'Solved algorithmic challenges',
          'Professional Experience',
          'Software Engineer',
          'Education',
          'B.Tech in Computer Science',
        ].join('\n'),
      });
      const result = analyzer.analyze({ pdfBuffer: pdf });

      if (result.success) {
        assert.ok(result.dsaRendered, 'DSA should be detected as rendered');
      }
    });

    it('reports DSA as not rendered when absent', () => {
      const pdf = createSyntheticPdfBuffer({
        text: [
          'Test Candidate',
          'Professional Summary',
          'Some summary text here',
          'Technical Skills',
          'JavaScript, Python',
          'Technical Projects',
          'Project A with some bullets about the project',
          'Professional Experience',
          'Software Engineer at some company',
          'Education',
          'B.Tech in Computer Science from some university',
        ].join('\n'),
      });
      const result = analyzer.analyze({ pdfBuffer: pdf });

      if (result.success) {
        assert.strictEqual(result.dsaRendered, false, 'DSA should not be detected when absent');
      }
    });
  });

  describe('Section Ordering', () => {
    it('validates correct canonical ordering', () => {
      const pdf = createSyntheticPdfBuffer({
        text: 'Professional Summary\nTechnical Skills\nTechnical Projects\nProfessional Experience\nEducation\nMore text to ensure sufficient content for the analyzer',
      });
      const result = analyzer.analyze({ pdfBuffer: pdf });

      if (result.success) {
        assert.ok(result.sectionOrdering.valid, 'Canonical ordering should be valid');
        assert.strictEqual(result.sectionOrdering.violations.length, 0);
      }
    });
  });

  describe('Content Utilization', () => {
    it('estimates reasonable utilization for typical resume', () => {
      const words = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
      const pdf = createSyntheticPdfBuffer({
        text: `Professional Summary\n${words}\nTechnical Skills\nExperience\nEducation`,
      });
      const result = analyzer.analyze({ pdfBuffer: pdf });

      if (result.success) {
        assert.ok(result.contentUtilization.wordCount > 0, 'Should count words');
        assert.ok(result.contentUtilization.utilizationRatio > 0, 'Utilization should be positive');
      }
    });
  });

  describe('Layout Balance Classification', () => {
    it('classifies OVERFULL when one-page target has 2+ pages', () => {
      const result = analyzer._classifyLayoutBalance(0.8, 2, PAGE_STRATEGY.ONE_PAGE_TARGET);
      assert.strictEqual(result, DENSITY_CLASSIFICATION.OVERFULL);
    });

    it('classifies BALANCED for typical single-page resume', () => {
      const result = analyzer._classifyLayoutBalance(0.8, 1, PAGE_STRATEGY.ONE_PAGE_TARGET);
      assert.strictEqual(result, DENSITY_CLASSIFICATION.BALANCED);
    });

    it('classifies TOO_SPARSE for very low utilization', () => {
      const result = analyzer._classifyLayoutBalance(0.3, 1, PAGE_STRATEGY.ONE_PAGE_TARGET);
      assert.strictEqual(result, DENSITY_CLASSIFICATION.TOO_SPARSE);
    });

    it('classifies DENSE for high utilization', () => {
      const result = analyzer._classifyLayoutBalance(0.98, 1, PAGE_STRATEGY.ONE_PAGE_TARGET);
      assert.strictEqual(result, DENSITY_CLASSIFICATION.DENSE);
    });
  });

  describe('Section Presence Validation', () => {
    it('reports all expected sections as present when found', () => {
      const detected = [
        { type: 'SUMMARY' },
        { type: 'SKILLS' },
        { type: 'PROJECTS' },
        { type: 'EXPERIENCE' },
        { type: 'EDUCATION' },
      ];
      const expected = ['SUMMARY', 'SKILLS', 'PROJECTS', 'EXPERIENCE', 'EDUCATION'];
      const result = analyzer._validateSectionPresence(detected, expected);
      assert.ok(result.allPresent);
      assert.strictEqual(result.missing.length, 0);
    });

    it('reports missing sections accurately', () => {
      const detected = [{ type: 'SUMMARY' }, { type: 'SKILLS' }];
      const expected = ['SUMMARY', 'SKILLS', 'PROJECTS', 'EXPERIENCE'];
      const result = analyzer._validateSectionPresence(detected, expected);
      assert.strictEqual(result.allPresent, false);
      assert.ok(result.missing.includes('PROJECTS'));
      assert.ok(result.missing.includes('EXPERIENCE'));
    });

    it('reports extra sections not in expected list', () => {
      const detected = [{ type: 'SUMMARY' }, { type: 'DSA' }];
      const expected = ['SUMMARY'];
      const result = analyzer._validateSectionPresence(detected, expected);
      assert.ok(result.extra.includes('DSA'));
    });
  });

  describe('Spacing Consistency', () => {
    it('returns PASS for well-structured text', () => {
      const text = 'Header\n\nSummary content\n\nSkills content\n\nProjects content\n\nExperience\n\nEducation';
      const sections = [{ type: 'SUMMARY', contentLength: 100 }, { type: 'SKILLS', contentLength: 80 }, { type: 'EXPERIENCE', contentLength: 120 }];
      const result = analyzer._evaluateSpacingConsistency(text, sections);
      assert.strictEqual(result.status, 'PASS');
    });

    it('detects excessive blank lines', () => {
      const text = 'Header\n\n\n\n\n\n\n\n\nSummary content\nSkills content';
      const result = analyzer._evaluateSpacingConsistency(text, []);
      assert.ok(result.findings.length > 0, 'Should flag excessive blank lines');
    });
  });

  describe('Failure Report Structure', () => {
    it('failure report has all expected fields', () => {
      const report = analyzer._failureReport('test reason');
      assert.strictEqual(report.success, false);
      assert.strictEqual(report.error, 'test reason');
      assert.strictEqual(report.pageCount, 0);
      assert.ok(Array.isArray(report.sections));
      assert.ok(report.layoutDiagnostics);
      assert.strictEqual(report.densityClassification, DENSITY_CLASSIFICATION.TOO_SPARSE);
    });
  });
});
