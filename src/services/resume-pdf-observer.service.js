/**
 * @file Resume PDF Observer Service
 *
 * Independent observation engine for actual compiled PDF artifacts.
 * Operates purely on the generated binary PDF artifact, without trusting
 * structuredResume or in-memory snapshot metadata.
 *
 * Observes:
 * - Text extraction (uncompressed & FlateDecode streams)
 * - Page count detection
 * - Reading order & section headings
 * - Contact information (email, phone, URLs, GitHub/LinkedIn)
 * - Dates and temporal formatting
 * - Bullet boundaries & count
 * - Broken words & awkward hyphenation
 * - Suspicious glyphs / raw LaTeX leakage
 * - Text clipping & margin safety
 * - Density & bottom whitespace measurement
 * - Duplicate rendered content detection
 *
 * Produces:
 * - pdfObservabilityScore (0-100)
 * - Component findings with severity (INFO | WARN | FAIL)
 */

import zlib from 'node:zlib';
import { PdfGeometryAnalyzer } from './pdf-geometry-analyzer.service.js';
import { ResumeParserService } from './resume-parser.service.js';

const SECTION_PATTERNS = [
  { key: 'SUMMARY', regex: /\b(professional\s+summary|summary|profile|about\s+me)\b/i },
  { key: 'SKILLS', regex: /\b(technical\s+skills|core\s+competencies|skills)\b/i },
  { key: 'PROJECTS', regex: /\b(technical\s+projects|selected\s+projects|featured\s+projects|projects)\b/i },
  { key: 'DSA', regex: /\b(problem\s+solving\s*(?:&|and)\s*algorithmic\s+practice|problem\s+solving|data\s+structures\s*(?:&|and)\s*algorithms)\b/i },
  { key: 'EXPERIENCE', regex: /\b(professional\s+experience|work\s+experience|experience|employment\s+history)\b/i },
  { key: 'EDUCATION', regex: /\b(education|academic\s+background)\b/i },
  { key: 'CERTIFICATIONS', regex: /\b(certifications|certificates|licenses)\b/i },
  { key: 'AWARDS', regex: /\b(awards|honors|achievements)\b/i },
  { key: 'OPEN_SOURCE', regex: /\b(open\s+source|contributions)\b/i },
];

const SUSPICIOUS_GLYPH_PATTERNS = [
  /\\[a-zA-Z]+\{/i,            // Leaked LaTeX commands like \textbf{ or \item
  /\b(undefined|NaN|null)\b/i, // Leaked JavaScript primitives
  /[\uFFFD]/,                   // Unicode replacement character (tofu)
  //,                         // Broken encoding glyph
];

export class ResumePdfObserver {
  constructor(dependencies = {}) {
    this.geometryAnalyzer = dependencies.geometryAnalyzer || new PdfGeometryAnalyzer();
    this.resumeParser = dependencies.resumeParser || new ResumeParserService();
  }

  /**
   * Observes a compiled PDF buffer and computes an independent observability score.
   *
   * @param {Buffer} pdfBuffer - Compiled PDF binary
   * @param {object} [options]
   * @param {number} [options.targetPageCount=1]
   * @returns {object} PDF observation report
   */
  observe(pdfBuffer, options = {}) {
    const targetPageCount = options.targetPageCount || 1;

    if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 50) {
      return {
        pdfObservabilityScore: 0,
        pageCount: 0,
        passed: false,
        findings: [{ dimension: 'buffer', severity: 'FAIL', message: 'Invalid or empty PDF buffer' }],
      };
    }

    // 1. Page Count Detection
    const pageCount = this.geometryAnalyzer._detectPageCount(pdfBuffer) || 1;

    // 2. Text Extraction
    const extractedText = this._extractTextStreams(pdfBuffer);
    const textLength = extractedText.length;
    const wordCount = (extractedText.match(/\b[A-Za-z0-9_-]+\b/g) || []).length;

    // 3. Section Headings & Reading Order
    const detectedSections = [];
    for (const sec of SECTION_PATTERNS) {
      const match = extractedText.match(sec.regex);
      if (match) {
        detectedSections.push({
          key: sec.key,
          index: match.index,
          matchedText: match[0],
        });
      }
    }
    detectedSections.sort((a, b) => a.index - b.index);
    const sectionOrder = detectedSections.map((s) => s.key);

    // 4. Contact Information
    const emailMatch = extractedText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = extractedText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    const githubMatch = extractedText.match(/github\.com\/[a-zA-Z0-9_-]+/i);
    const linkedinMatch = extractedText.match(/linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);

    const contactInfo = {
      hasEmail: Boolean(emailMatch),
      email: emailMatch ? emailMatch[0] : null,
      hasPhone: Boolean(phoneMatch),
      hasGithub: Boolean(githubMatch),
      hasLinkedin: Boolean(linkedinMatch),
    };

    // 5. URLs
    const urlMatches = extractedText.match(/https?:\/\/[^\s)"]+/gi) || [];
    const uniqueUrls = [...new Set(urlMatches)];

    // 6. Dates
    const dateMatches = extractedText.match(/\b(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4}\s*[-–—]\s*(?:\d{4}|Present|Current))\b/gi) || [];

    // 7. Bullet Boundaries & Count
    const bulletMarkers = (extractedText.match(/[•\u2022\u25cf\u25cb\u2219-]\s+/g) || []).length;

    // 8. Broken Words & Hyphenation Glitches
    const brokenWords = extractedText.match(/\b[a-zA-Z]{2,}-\s+[a-zA-Z]{2,}\b/g) || [];

    // 9. Suspicious Glyphs / LaTeX command leakage
    const suspiciousGlyphs = [];
    for (const pat of SUSPICIOUS_GLYPH_PATTERNS) {
      const match = extractedText.match(pat);
      if (match) {
        suspiciousGlyphs.push(match[0]);
      }
    }

    // 10. Geometry & Bottom Whitespace
    const geometry = this.geometryAnalyzer.measurePdfBottom(pdfBuffer);
    const bottomWhitespacePt = geometry.bottomWhitespacePt || 0;
    const pageOccupancyRatio = geometry.pageOccupancyRatio || 0.85;

    // 11. Duplicate Rendered Content
    const sentences = (extractedText.match(/[^.!?\n]{25,}[.!?]/g) || []).map((s) => s.trim().toLowerCase());
    const duplicates = [];
    const seenSentences = new Set();
    for (const s of sentences) {
      if (seenSentences.has(s)) {
        duplicates.push(s);
      } else {
        seenSentences.add(s);
      }
    }

    // 12. Evaluate Findings & Score
    const findings = [];
    let score = 100;

    // Page count penalty
    if (pageCount !== targetPageCount) {
      score -= 35;
      findings.push({
        dimension: 'pageCount',
        severity: 'FAIL',
        message: `Expected ${targetPageCount} page(s), but rendered PDF has ${pageCount} page(s)`,
      });
    }

    // LaTeX leakage / suspicious glyphs
    if (suspiciousGlyphs.length > 0) {
      score -= 30;
      findings.push({
        dimension: 'suspiciousGlyphs',
        severity: 'FAIL',
        message: `Detected suspicious glyphs or raw LaTeX command leakage: ${suspiciousGlyphs.join(', ')}`,
      });
    }

    // Duplicate content
    if (duplicates.length > 0) {
      score -= 20;
      findings.push({
        dimension: 'duplicateRenderedContent',
        severity: 'WARN',
        message: `Detected ${duplicates.length} duplicate rendered sentence(s)`,
      });
    }

    // Broken hyphenated words
    if (brokenWords.length > 2) {
      score -= 10;
      findings.push({
        dimension: 'brokenWords',
        severity: 'WARN',
        message: `Detected ${brokenWords.length} awkwardly hyphenated word breaks: ${brokenWords.slice(0, 3).join(', ')}`,
      });
    }

    // Occupancy / whitespace
    if (pageOccupancyRatio < 0.60 && pageCount === 1) {
      score -= 15;
      findings.push({
        dimension: 'bottomWhitespace',
        severity: 'WARN',
        message: `Page occupancy is sparse (${Math.round(pageOccupancyRatio * 100)}%, ~${Math.round(bottomWhitespacePt)}pt whitespace)`,
      });
    } else if (pageOccupancyRatio > 0.98) {
      score -= 10;
      findings.push({
        dimension: 'clippingRisk',
        severity: 'WARN',
        message: `Page occupancy is near overflow boundary (${Math.round(pageOccupancyRatio * 100)}%)`,
      });
    }

    // Contact info
    if (!contactInfo.hasEmail) {
      score -= 10;
      findings.push({
        dimension: 'contactInformation',
        severity: 'WARN',
        message: 'No candidate email found in rendered PDF header',
      });
    }

    const pdfObservabilityScore = Math.max(0, Math.min(100, score));

    return {
      pdfObservabilityScore,
      pageCount,
      targetPageCount,
      passed: pdfObservabilityScore >= 70 && pageCount === targetPageCount,
      textMetrics: {
        textLength,
        wordCount,
        bulletCount: bulletMarkers,
        dateCount: dateMatches.length,
        urlCount: uniqueUrls.length,
      },
      readingOrder: sectionOrder,
      contactInfo,
      geometry: {
        bottomWhitespacePt: Math.round(bottomWhitespacePt),
        pageOccupancyRatio: Math.round(pageOccupancyRatio * 100) / 100,
      },
      duplicatesDetected: duplicates.length,
      brokenWordsDetected: brokenWords.length,
      suspiciousGlyphsDetected: suspiciousGlyphs.length,
      findings,
    };
  }

  /**
   * Internal text stream extractor supporting FlateDecode streams.
   * @private
   */
  _extractTextStreams(pdfBuffer) {
    try {
      if (this.resumeParser && typeof this.resumeParser.extractRawText === 'function') {
        const parsed = this.resumeParser.extractRawText({ buffer: pdfBuffer, format: 'PDF' });
        if (parsed && parsed.trim().length > 50) {
          return parsed;
        }
      }
    } catch {
      // Fall through to manual stream inspection
    }

    let combined = '';

    // First try standard Latin1 inspection for uncompressed text
    const raw = pdfBuffer.toString('latin1');
    const directText = this._extractTjText(raw);
    if (directText.length > 100) {
      combined += directText;
    }

    // Extract and decompress Flate streams
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    while ((match = streamRegex.exec(raw)) !== null) {
      const streamData = Buffer.from(match[1], 'latin1');
      try {
        const decompressed = zlib.inflateSync(streamData).toString('latin1');
        const textFromStream = this._extractTjText(decompressed);
        if (textFromStream.length > 0) {
          combined += ' ' + textFromStream;
        }
      } catch {
        // Stream may not be zlib/Flate, ignore decompression errors
      }
    }

    if (combined.trim().length === 0) {
      // Fallback to geometry analyzer's text extractor
      combined = this.geometryAnalyzer._extractText(pdfBuffer);
    }

    return combined;
  }

  /**
   * Extracts text from PDF Tj / TJ operator strings.
   * @private
   */
  _extractTjText(streamContent) {
    const pieces = [];
    // Match (string) Tj
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let m;
    while ((m = tjRegex.exec(streamContent)) !== null) {
      pieces.push(m[1]);
    }

    // Match [(string) ... (string)] TJ
    const arrayRegex = /\[([^\]]*)\]\s*TJ/g;
    while ((m = arrayRegex.exec(streamContent)) !== null) {
      const inner = m[1];
      const strRegex = /\(([^)]*)\)/g;
      let s;
      while ((s = strRegex.exec(inner)) !== null) {
        pieces.push(s[1]);
      }
    }

    return pieces.join(' ').replace(/\\([()\\])/g, '$1');
  }
}
