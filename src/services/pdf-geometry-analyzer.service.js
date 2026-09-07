/**
 * @file PDF Geometry Analyzer Service (P14-026)
 *
 * Measures actual compiled PDF properties to validate layout quality:
 * 1. Page count detection from PDF page tree
 * 2. Section presence and ordering verification
 * 3. Content utilization estimation
 * 4. Spacing consistency validation
 * 5. Layout balance classification (TOO_SPARSE/BALANCED/DENSE/OVERFULL)
 * 6. DSA presence verification in compiled output
 *
 * This service operates on compiled PDF buffers using text extraction
 * and raw PDF stream inspection. It does NOT require external PDF
 * parsing libraries — it uses the existing ResumeParserService for
 * text extraction and lightweight binary inspection for page count.
 *
 * These are INTERNAL layout diagnostics, NOT employer-facing ATS scores.
 */

import zlib from 'node:zlib';
import { DENSITY_CLASSIFICATION, PAGE_STRATEGY } from './resume-layout-engine.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Section heading patterns recognized in extracted PDF text
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_HEADING_PATTERNS = Object.freeze({
  SUMMARY: [/\bprofessional\s+summary\b/i, /\bsummary\b/i, /\bprofile\b/i, /\bobjective\b/i],
  SKILLS: [/\btechnical\s+skills\b/i, /\bcore\s+competencies\b/i, /\bskills\b/i, /\bcompetencies\b/i],
  PROJECTS: [/\btechnical\s+projects\b/i, /\bselected\s+projects\b/i, /\bfeatured\s+projects\b/i, /\bprojects\b/i],
  DSA: [
    /\bproblem\s+solving\s*(?:&|and)\s*algorithmic\s+practice\b/i,
    /\bproblem\s+solving\b/i,
    /\balgorithmic\s+practice\b/i,
  ],
  EXPERIENCE: [/\bprofessional\s+experience\b/i, /\bexperience\b/i, /\bemployment\b/i, /\bwork\s+history\b/i],
  EDUCATION: [/\beducation\b/i, /\bacademic\b/i, /\bqualifications\b/i],
  CERTIFICATIONS: [/\bcertifications\b/i, /\bcertificates\b/i, /\bprofessional\s+development\b/i],
});

/**
 * Expected canonical section ordering for ATS-safe resumes.
 * Sections not present are simply skipped; ordering is checked among those found.
 */
const CANONICAL_SECTION_ORDER = ['SUMMARY', 'SKILLS', 'PROJECTS', 'DSA', 'EXPERIENCE', 'EDUCATION', 'CERTIFICATIONS'];

// ─────────────────────────────────────────────────────────────────────────────
// Geometry Analyzer
// ─────────────────────────────────────────────────────────────────────────────

export class PdfGeometryAnalyzer {
  /**
   * @param {object} [dependencies={}]
   * @param {object} [dependencies.resumeParser] ResumeParserService instance for text extraction
   */
  constructor(dependencies = {}) {
    this.resumeParser = dependencies.resumeParser || null;
  }

  /**
   * Analyzes a compiled PDF buffer and produces a geometry report.
   *
   * @param {object} params
   * @param {Buffer} params.pdfBuffer Compiled PDF binary buffer
   * @param {object} [params.expectedSections] Expected sections from the layout engine
   * @param {string} [params.pageStrategy] Expected page strategy
   * @returns {object} PdfGeometryReport
   */
  analyze({ pdfBuffer, expectedSections = [], pageStrategy = PAGE_STRATEGY.ONE_PAGE_TARGET }) {
    if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 50) {
      return this._failureReport('Invalid or empty PDF buffer');
    }

    // 1. Page count detection (with PDF 1.5 object stream support)
    const pageCount = this._detectPageCount(pdfBuffer);
    if (pageCount === null || pageCount <= 0) {
      return this._failureReport('PAGE_COUNT_UNDETERMINED: Could not reliably determine PDF page count');
    }

    // 2. Extract text for section analysis
    const extractedText = this._extractText(pdfBuffer);
    if (!extractedText || extractedText.trim().length < 50) {
      return this._failureReport('Failed to extract meaningful text from PDF');
    }

    // 3. Detect sections and their approximate positions
    const detectedSections = this._detectSections(extractedText);

    // 4. Verify section ordering
    const orderingResult = this._verifySectionOrdering(detectedSections);

    // 5. Content utilization estimation
    const utilizationResult = this._estimateContentUtilization(extractedText, pageCount);

    // 6. DSA presence verification (strict heading match only)
    const dsaRendered = detectedSections.some(s => s.type === 'DSA');

    // 7. Spacing consistency (text-based heuristic)
    const spacingConsistency = this._evaluateSpacingConsistency(extractedText, detectedSections);

    // 8. Layout balance classification
    const densityClassification = this._classifyLayoutBalance(
      utilizationResult.utilizationRatio,
      pageCount,
      pageStrategy
    );

    // 9. Section presence validation against expected
    const sectionPresenceReport = this._validateSectionPresence(
      detectedSections,
      expectedSections
    );

    // 10. Dual-check verification for optional sections (Content Strategy vs Physical PDF)
    const expectedNorm = expectedSections.map(s => String(s).toUpperCase());
    const dsaExpected = expectedNorm.includes('DSA') || expectedNorm.includes('PROBLEM_SOLVING');
    let dsaVerificationStatus = 'PASS';
    if (dsaExpected && !dsaRendered) {
      dsaVerificationStatus = 'RENDERING_FAILURE';
    } else if (!dsaExpected && dsaRendered) {
      dsaVerificationStatus = 'FALSE_POSITIVE_OR_ROGUE_INJECTION';
    }

    return {
      success: true,
      pageCount,
      sections: detectedSections,
      sectionOrdering: orderingResult,
      contentUtilization: utilizationResult,
      densityClassification,
      spacingConsistency,
      dsaRendered,
      dsaVerification: {
        expected: dsaExpected,
        rendered: dsaRendered,
        status: dsaVerificationStatus,
      },
      sectionPresence: sectionPresenceReport,
      layoutDiagnostics: {
        density: densityClassification,
        contentUtilizationRatio: utilizationResult.utilizationRatio,
        spacing: spacingConsistency.status,
        sectionsRendered: `${detectedSections.length}/${expectedSections.length || detectedSections.length}`,
        dsaRendered,
        dsaExpected,
        dsaVerificationStatus,
        pageCount,
        wordCount: utilizationResult.wordCount,
      },
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Page count detection
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Detects the number of pages in a PDF by inspecting the page tree.
   * Supports PDF 1.0-1.4 uncompressed structures as well as PDF 1.5+
   * FlateDecode compressed object streams (/ObjStm) produced by modern compilers (Tectonic).
   *
   * @private
   * @param {Buffer} pdfBuffer
   * @returns {number|null} Exact page count, or null if undetermined (NEVER silently defaults to 1)
   */
  _detectPageCount(pdfBuffer) {
    if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 50) {
      return null;
    }

    const pdfText = pdfBuffer.toString('latin1');

    // Strategy 1: Look for /Count N in the Pages dictionary (uncompressed)
    const countMatch1 = pdfText.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/);
    if (countMatch1) {
      return parseInt(countMatch1[1], 10);
    }
    const countMatch2 = pdfText.match(/\/Count\s+(\d+)[\s\S]*?\/Type\s*\/Pages/);
    if (countMatch2) {
      return parseInt(countMatch2[1], 10);
    }

    // Strategy 2: Count /Type /Page occurrences (exclude /Pages) in uncompressed text
    const pageMatches = pdfText.match(/\/Type\s*\/\s*Page(?!\s*s)\b/g);
    if (pageMatches && pageMatches.length > 0) {
      return pageMatches.length;
    }

    // Strategy 3: Count %%Page DSC comments (PostScript convention)
    const dscPages = pdfText.match(/%%Page:\s+\d+\s+\d+/g);
    if (dscPages && dscPages.length > 0) {
      return dscPages.length;
    }

    // Strategy 4: Decompress PDF 1.5 object streams (/ObjStm) and inspect decompressed objects
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    let decompressedPageCount = 0;
    let decompressedCountAttr = null;

    while ((match = streamRegex.exec(pdfText)) !== null) {
      const rawStream = Buffer.from(match[1], 'binary');
      let decompressed;
      try {
        decompressed = zlib.inflateSync(rawStream);
      } catch {
        try {
          decompressed = zlib.inflateRawSync(rawStream);
        } catch {
          decompressed = rawStream;
        }
      }
      const decStr = decompressed.toString('latin1');

      // Check for /Count N in /Pages inside decompressed streams
      const objPagesCount1 = decStr.match(/\/Type\s*\/\s*Pages[\s\S]{0,200}?\/Count\s+(\d+)/);
      if (objPagesCount1) {
        decompressedCountAttr = parseInt(objPagesCount1[1], 10);
      }
      const objPagesCount2 = decStr.match(/\/Count\s+(\d+)[\s\S]{0,200}?\/Type\s*\/\s*Pages/);
      if (objPagesCount2) {
        decompressedCountAttr = parseInt(objPagesCount2[1], 10);
      }

      // Count /Type /Page inside decompressed object streams (handles /Type/Page and /Type /Page)
      const objPageMatches = decStr.match(/\/Type\s*\/\s*Page(?!\s*s)\b/g);
      if (objPageMatches) {
        decompressedPageCount += objPageMatches.length;
      }
    }

    if (decompressedCountAttr !== null && decompressedCountAttr > 0) {
      return decompressedCountAttr;
    }
    if (decompressedPageCount > 0) {
      return decompressedPageCount;
    }

    // IMPORTANT: Never silently fall back to 1. If page count cannot be determined, return null.
    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Text extraction
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Extracts text from PDF using available parser or raw stream inspection.
   *
   * @private
   * @param {Buffer} pdfBuffer
   * @returns {string}
   */
  _extractText(pdfBuffer) {
    // Try ResumeParserService if available
    if (this.resumeParser && typeof this.resumeParser.extractRawText === 'function') {
      try {
        const text = this.resumeParser.extractRawText({ buffer: pdfBuffer, format: 'PDF' });
        if (text && text.trim().length > 50) return text;
      } catch {
        // Fall through to raw extraction
      }
    }

    // Fallback: raw PDF stream text extraction
    return this._extractRawPdfText(pdfBuffer);
  }

  /**
   * Extracts text directly from PDF content streams by parsing Tj/TJ operators.
   *
   * @private
   * @param {Buffer} pdfBuffer
   * @returns {string}
   */
  _extractRawPdfText(pdfBuffer) {
    const raw = pdfBuffer.toString('binary');
    const chunks = [];

    // Match text showing operators: (text)Tj and [(text)]TJ
    const tjMatches = raw.match(/\(([^()]{1,500})\)\s*Tj/g) || [];
    for (const m of tjMatches) {
      const text = m.replace(/^\(|\)\s*Tj$/g, '');
      if (text.length > 0) chunks.push(text);
    }

    // Also try TJ array operator
    const tjArrayMatches = raw.match(/\[((?:\([^()]*\)\s*[-\d.]*\s*)+)\]\s*TJ/gi) || [];
    for (const arr of tjArrayMatches) {
      const innerMatches = arr.match(/\(([^()]*)\)/g) || [];
      for (const inner of innerMatches) {
        const text = inner.replace(/^\(|\)$/g, '');
        if (text.length > 0) chunks.push(text);
      }
    }

    return chunks.join(' ');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Section detection
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Detects resume sections from extracted text.
   * Returns an ordered array of detected sections with their types and
   * approximate text positions.
   *
   * @private
   * @param {string} text Extracted PDF text
   * @returns {Array<{type: string, heading: string, position: number, contentLength: number}>}
   */
  _detectSections(text) {
    const sections = [];
    const normalizedText = text.replace(/\s+/g, ' ');

    for (const [sectionType, patterns] of Object.entries(SECTION_HEADING_PATTERNS)) {
      for (const pattern of patterns) {
        const match = normalizedText.match(pattern);
        if (match) {
          // Check if this heading hasn't been claimed by a higher-priority section
          const alreadyFound = sections.some(s => s.type === sectionType);
          if (!alreadyFound) {
            sections.push({
              type: sectionType,
              heading: match[0],
              position: match.index,
              contentLength: this._estimateSectionContentLength(normalizedText, match.index, sectionType),
            });
          }
          break; // Use first matching pattern for each section type
        }
      }
    }

    // Sort by position (reading order)
    sections.sort((a, b) => a.position - b.position);
    return sections;
  }

  /**
   * Estimates the content length of a section (characters until next section).
   *
   * @private
   */
  _estimateSectionContentLength(text, startPosition, _sectionType) {
    // Find the next section heading after this one
    let nextSectionPos = text.length;
    for (const patterns of Object.values(SECTION_HEADING_PATTERNS)) {
      for (const pattern of patterns) {
        const rest = text.slice(startPosition + 1);
        const match = rest.match(pattern);
        if (match && (startPosition + 1 + match.index) < nextSectionPos) {
          nextSectionPos = startPosition + 1 + match.index;
        }
      }
    }
    return nextSectionPos - startPosition;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Section ordering verification
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Verifies that detected sections appear in the expected canonical order.
   *
   * @private
   * @param {Array<{type: string, position: number}>} detectedSections
   * @returns {{valid: boolean, order: string[], violations: string[]}}
   */
  _verifySectionOrdering(detectedSections) {
    const actualOrder = detectedSections.map(s => s.type);
    const violations = [];

    // Check pairwise ordering against canonical order
    for (let i = 0; i < actualOrder.length; i++) {
      for (let j = i + 1; j < actualOrder.length; j++) {
        const idxA = CANONICAL_SECTION_ORDER.indexOf(actualOrder[i]);
        const idxB = CANONICAL_SECTION_ORDER.indexOf(actualOrder[j]);
        if (idxA >= 0 && idxB >= 0 && idxA > idxB) {
          violations.push(
            `${actualOrder[i]} appears before ${actualOrder[j]} but canonical order expects the reverse`
          );
        }
      }
    }

    return {
      valid: violations.length === 0,
      order: actualOrder,
      violations,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Content utilization
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Estimates content utilization from word density and page count.
   *
   * @private
   * @param {string} text Extracted text
   * @param {number} pageCount
   * @returns {{utilizationRatio: number, wordCount: number, charCount: number, wordsPerPage: number}}
   */
  _estimateContentUtilization(text, pageCount) {
    const cleanText = text.replace(/\s+/g, ' ').trim();
    const wordCount = cleanText.split(' ').filter(w => w.length > 0).length;
    const charCount = cleanText.length;
    const wordsPerPage = wordCount / Math.max(1, pageCount);

    // A well-utilized single page typically has 350-550 words
    // Very sparse: < 200 words, very dense: > 600 words
    const optimalWordsPerPage = 450;
    const utilizationRatio = Math.min(1.2, wordsPerPage / optimalWordsPerPage);

    return {
      utilizationRatio,
      wordCount,
      charCount,
      wordsPerPage: Math.round(wordsPerPage),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Spacing consistency
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Evaluates spacing consistency using text-based heuristics.
   * Without full Y-coordinate data, we check for indicators of spacing problems:
   * - Multiple consecutive blank lines (suggests large gaps)
   * - Consistent section separation
   *
   * @private
   * @param {string} text Extracted text
   * @param {Array} detectedSections
   * @returns {{status: string, findings: string[]}}
   */
  _evaluateSpacingConsistency(text, detectedSections) {
    const findings = [];
    const lines = text.split('\n').map(l => l.trim());

    // Check for excessive consecutive blank lines (indicator of large gaps)
    let maxConsecutiveBlanks = 0;
    let currentBlanks = 0;
    for (const line of lines) {
      if (line.length === 0) {
        currentBlanks++;
        maxConsecutiveBlanks = Math.max(maxConsecutiveBlanks, currentBlanks);
      } else {
        currentBlanks = 0;
      }
    }

    if (maxConsecutiveBlanks > 5) {
      findings.push(`Detected ${maxConsecutiveBlanks} consecutive blank lines — possible large spacing gap`);
    }

    // Check section content lengths are reasonably balanced (no one section dominating)
    if (detectedSections.length >= 3) {
      const lengths = detectedSections
        .filter(s => s.contentLength > 0)
        .map(s => s.contentLength);

      if (lengths.length >= 2) {
        const maxLen = Math.max(...lengths);
        const minLen = Math.min(...lengths);
        if (maxLen > minLen * 15 && minLen < 20) {
          findings.push('Extreme section size imbalance detected');
        }
      }
    }

    const status = findings.length === 0 ? 'PASS' : (findings.length <= 2 ? 'WARN' : 'FAIL');

    return { status, findings };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Layout balance classification
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Classifies layout balance from actual PDF measurements.
   *
   * @private
   * @param {number} utilizationRatio
   * @param {number} pageCount
   * @param {string} pageStrategy
   * @returns {string} DENSITY_CLASSIFICATION value
   */
  _classifyLayoutBalance(utilizationRatio, pageCount, pageStrategy) {
    if (pageStrategy === PAGE_STRATEGY.TWO_PAGE_ALLOWED) {
      if (pageCount === 1 && utilizationRatio < 0.5) return DENSITY_CLASSIFICATION.TOO_SPARSE;
      if (pageCount <= 2 && utilizationRatio >= 0.5) return DENSITY_CLASSIFICATION.BALANCED;
      if (pageCount > 2) return DENSITY_CLASSIFICATION.OVERFULL;
      return DENSITY_CLASSIFICATION.BALANCED;
    }

    // ONE_PAGE_TARGET
    if (pageCount > 1) return DENSITY_CLASSIFICATION.OVERFULL;
    if (utilizationRatio < 0.55) return DENSITY_CLASSIFICATION.TOO_SPARSE;
    if (utilizationRatio <= 0.95) return DENSITY_CLASSIFICATION.BALANCED;
    return DENSITY_CLASSIFICATION.DENSE;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Section presence validation
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Validates that expected sections are present in the PDF.
   *
   * @private
   * @param {Array<{type: string}>} detectedSections
   * @param {string[]} expectedSections
   * @returns {{allPresent: boolean, present: string[], missing: string[], extra: string[]}}
   */
  _validateSectionPresence(detectedSections, expectedSections) {
    const detectedTypes = new Set(detectedSections.map(s => s.type));
    const expectedSet = new Set(expectedSections);

    const present = expectedSections.filter(s => detectedTypes.has(s));
    const missing = expectedSections.filter(s => !detectedTypes.has(s));
    const extra = [...detectedTypes].filter(s => !expectedSet.has(s));

    return {
      allPresent: missing.length === 0,
      present,
      missing,
      extra,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Failure report
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * @private
   */
  _failureReport(reason) {
    return {
      success: false,
      error: reason,
      pageCount: 0,
      sections: [],
      sectionOrdering: { valid: false, order: [], violations: [reason] },
      contentUtilization: { utilizationRatio: 0, wordCount: 0, charCount: 0, wordsPerPage: 0 },
      densityClassification: DENSITY_CLASSIFICATION.TOO_SPARSE,
      spacingConsistency: { status: 'FAIL', findings: [reason] },
      dsaRendered: false,
      sectionPresence: { allPresent: false, present: [], missing: [], extra: [] },
      layoutDiagnostics: {
        density: DENSITY_CLASSIFICATION.TOO_SPARSE,
        contentUtilizationRatio: 0,
        spacing: 'FAIL',
        sectionsRendered: '0/0',
        dsaRendered: false,
        pageCount: 0,
        wordCount: 0,
      },
    };
  }
}
