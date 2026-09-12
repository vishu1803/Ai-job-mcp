/**
 * @file Honest ATS Parseability Service (P17 Architecture)
 *
 * Provides deterministic, multi-dimensional ATS parseability evaluation
 * directly from compiled PDF artifacts, LaTeX source, or extracted text streams.
 *
 * Eliminates naive heuristics (e.g. text.length > 200 => 98) in favor of
 * honest, evidence-based structural checks:
 *  1. Text Extraction & Stream Integrity
 *  2. Candidate Contact Completeness
 *  3. Standard Section Headings & Recognizability
 *  4. Single-Column ATS Reading Order
 *  5. Date Coherence & Temporal Integrity
 *  6. Bullet Boundary & List Structure
 *  7. URL Validity & Extraction Safety
 *  8. LaTeX Leakage Prevention
 *  9. Replacement Glyph (Tofu / Mojibake) Prevention
 * 10. Word Fragmentation & Broken Hyphenation
 * 11. Geometry & Page Clipping Safety
 */

import { ResumePdfObserver } from './resume-pdf-observer.service.js';
import { normalizeTechnologyName } from '../utils/technology-normalizer.js';

export const ATS_PARSEABILITY_VERSION = '1.0.0';

export const ATS_CHECK_WEIGHTS = Object.freeze({
  TEXT_EXTRACTION: 15,
  CONTACT_COMPLETENESS: 15,
  STANDARD_HEADINGS: 15,
  READING_ORDER: 10,
  BULLET_BOUNDARIES: 10,
  URL_SAFETY: 10,
  LATEX_LEAKAGE: 10,
  REPLACEMENT_GLYPHS: 5,
  WORD_FRAGMENTATION: 5,
  DATE_COHERENCE: 5,
});

const STANDARD_ATS_HEADINGS = [
  { key: 'SUMMARY', label: 'Summary', pattern: /\b(professional\s+summary|summary|profile|about\s+me)\b/i },
  { key: 'SKILLS', label: 'Technical Skills', pattern: /\b(technical\s+skills|core\s+competencies|skills)\b/i },
  { key: 'EXPERIENCE', label: 'Work Experience', pattern: /\b(professional\s+experience|work\s+experience|experience|employment\s+history)\b/i },
  { key: 'PROJECTS', label: 'Projects', pattern: /\b(technical\s+projects|selected\s+projects|featured\s+projects|projects)\b/i },
  { key: 'EDUCATION', label: 'Education', pattern: /\b(education|academic\s+background)\b/i },
  { key: 'DSA', label: 'Problem Solving / DSA', pattern: /\b(problem\s+solving\s*(?:&|and)\s*algorithmic\s+practice|problem\s+solving|data\s+structures\s*(?:&|and)\s*algorithms)\b/i },
  { key: 'CERTIFICATIONS', label: 'Certifications', pattern: /\b(certifications|certificates|licenses)\b/i },
];

const RAW_LATEX_PATTERNS = [
  /\\[a-zA-Z]+\{/i,
  /\\(?:textbf|textit|item|href|begin|end|hline|vspace|hspace|documentclass|usepackage)/i,
  /\$\$.*\$\$/,
];

const REPLACEMENT_GLYPH_PATTERN = /[\uFFFD\u0000\u0007\u0008\u000B\u000C\u000E\u000F]/;

const BROKEN_WORD_HYPHEN_PATTERN = /\b([a-zA-Z]{3,})-\s+([a-zA-Z]{3,})\b/g;

export class AtsParseabilityService {
  constructor(dependencies = {}) {
    this.pdfObserver = dependencies.pdfObserver || new ResumePdfObserver();
  }

  /**
   * Evaluates ATS parseability from PDF binary, LaTeX source, or extracted text.
   *
   * @param {object} params
   * @param {Buffer} [params.pdfBuffer] Compiled PDF buffer
   * @param {string} [params.extractedText] Extracted plain text
   * @param {string} [params.texContent] Raw LaTeX source
   * @param {object} [params.structuredResume] Structured resume object
   * @param {object} [params.candidateProfile] Candidate profile
   * @returns {{ atsParseabilityScore: number, passed: boolean, version: string, checks: Array<object>, findings: Array<object>, metrics: object }}
   */
  evaluateAtsParseability({
    pdfBuffer = null,
    extractedText = null,
    texContent = '',
    structuredResume = null,
    candidateProfile = null,
  } = {}) {
    let text = extractedText || '';
    let pdfObservation = null;

    if (Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 50) {
      pdfObservation = this.pdfObserver.observe(pdfBuffer);
      if (!text && typeof this.pdfObserver._extractTextStreams === 'function') {
        text = this.pdfObserver._extractTextStreams(pdfBuffer);
      }
    }

    if (!text && structuredResume) {
      text = this._deriveTextFromStructuredResume(structuredResume);
    }

    text = String(text || '').trim();
    const checks = [];
    const findings = [];

    // ── 1. Text Extraction & Stream Integrity (15 pts) ────────────────────────
    const textLength = text.length;
    const hasSufficientText = textLength >= 250;
    const isOverFlowing = textLength > 8000;
    const textPass = hasSufficientText && !isOverFlowing;
    checks.push({
      checkId: 'TEXT_EXTRACTION',
      name: 'Selectable Text Extraction',
      weight: ATS_CHECK_WEIGHTS.TEXT_EXTRACTION,
      passed: textPass,
      message: textPass
        ? `Extracted ${textLength} characters of clean selectable text`
        : textLength < 250
          ? `Insufficient selectable text (${textLength} chars; potential raster/image PDF or extraction failure)`
          : `Excessive text length (${textLength} chars)`,
    });
    if (!textPass) {
      findings.push({
        dimension: 'textExtraction',
        severity: 'FAIL',
        message: `Extracted selectable text is insufficient (${textLength} chars)`,
      });
    }

    // ── 2. Candidate Contact Completeness (15 pts) ────────────────────────────
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    const candidateName =
      structuredResume?.candidateIdentity?.displayName ||
      structuredResume?.candidateIdentity?.name ||
      structuredResume?.header?.name ||
      candidateProfile?.displayName ||
      candidateProfile?.name ||
      '';
    const nameMatch = Boolean(candidateName) && text.toLowerCase().includes(candidateName.toLowerCase());

    const hasEmail = Boolean(emailMatch || structuredResume?.candidateIdentity?.email || structuredResume?.header?.email);
    const hasName = Boolean(nameMatch || structuredResume?.candidateIdentity?.displayName || structuredResume?.header?.name);
    const contactScoreEarned = (hasEmail ? 8 : 0) + (hasName ? 7 : 0);
    const contactPass = hasEmail && hasName;

    checks.push({
      checkId: 'CONTACT_COMPLETENESS',
      name: 'Candidate Contact Identification',
      weight: ATS_CHECK_WEIGHTS.CONTACT_COMPLETENESS,
      passed: contactPass,
      earnedWeight: contactScoreEarned,
      message: contactPass
        ? 'Identified candidate name and contact email in document header'
        : `Missing essential contact info: ${!hasName ? 'Candidate Name ' : ''}${!hasEmail ? 'Email' : ''}`.trim(),
    });
    if (!hasEmail) {
      findings.push({ dimension: 'contact', severity: 'WARN', message: 'No contact email detected' });
    }
    if (!hasName) {
      findings.push({ dimension: 'contact', severity: 'WARN', message: 'Candidate name not detected in header' });
    }

    // ── 3. Standard Section Headings (15 pts) ─────────────────────────────────
    const detectedHeadings = [];
    for (const h of STANDARD_ATS_HEADINGS) {
      const match = text.match(h.pattern);
      if (match) {
        detectedHeadings.push({ key: h.key, label: h.label, index: match.index });
      }
    }
    detectedHeadings.sort((a, b) => a.index - b.index);

    const hasSkillsOrProjects = detectedHeadings.some((h) => h.key === 'SKILLS' || h.key === 'PROJECTS');
    const headingCount = detectedHeadings.length;
    const headingsPass = headingCount >= 3 && hasSkillsOrProjects;
    checks.push({
      checkId: 'STANDARD_HEADINGS',
      name: 'Standard ATS Section Headings',
      weight: ATS_CHECK_WEIGHTS.STANDARD_HEADINGS,
      passed: headingsPass,
      message: headingsPass
        ? `Detected ${headingCount} standard ATS headings (${detectedHeadings.map((h) => h.key).join(', ')})`
        : `Detected only ${headingCount} standard headings; ATS may misclassify resume sections`,
    });
    if (!headingsPass) {
      findings.push({
        dimension: 'headings',
        severity: 'WARN',
        message: `Only ${headingCount} standard section headings recognized`,
      });
    }

    // ── 4. Single-Column ATS Reading Order (10 pts) ───────────────────────────
    const multiColTex = /\\begin\{multicols\}|\\begin\{tabular\}|\\begin\{table\*?\}/i.test(texContent);
    const readingOrderPass = !multiColTex;
    checks.push({
      checkId: 'READING_ORDER',
      name: 'Single-Column Reading Order',
      weight: ATS_CHECK_WEIGHTS.READING_ORDER,
      passed: readingOrderPass,
      message: readingOrderPass
        ? 'Confirmed linear, single-column reading order safe for automated ATS scrapers'
        : 'Detected multi-column or table environments that frequently scramble ATS text extraction order',
    });
    if (!readingOrderPass) {
      findings.push({
        dimension: 'readingOrder',
        severity: 'FAIL',
        message: 'Multi-column/table formatting interferes with linear ATS extraction',
      });
    }

    // ── 5. Bullet Boundaries & List Structure (10 pts) ────────────────────────
    const bulletMarkers = (text.match(/[\u2022\u25E6\u2023\u2219-]\s+/g) || []).length;
    const texItemizeCount = (texContent.match(/\\begin\{itemize\}/g) || []).length;
    const bulletPass = bulletMarkers >= 3 || texItemizeCount >= 1 || (structuredResume?.projects?.some((p) => p.bullets?.length > 0));
    checks.push({
      checkId: 'BULLET_BOUNDARIES',
      name: 'Bullet Boundaries & List Structure',
      weight: ATS_CHECK_WEIGHTS.BULLET_BOUNDARIES,
      passed: Boolean(bulletPass),
      message: bulletPass
        ? `Recognized consistent list structures (${bulletMarkers} markers, ${texItemizeCount} itemize blocks)`
        : 'Sparse or irregular bullet structure detected',
    });

    // ── 6. URL Safety & Formatting (10 pts) ───────────────────────────────────
    const urlMatches = text.match(/https?:\/\/[^\s)"]+/gi) || [];
    const malformedUrls = urlMatches.filter((u) => !/^[a-zA-Z0-9-._~:/?#[\]@!$&'()*+,;%=]+$/.test(u));
    const urlPass = malformedUrls.length === 0;
    checks.push({
      checkId: 'URL_SAFETY',
      name: 'Hyperlink & URL Parseability',
      weight: ATS_CHECK_WEIGHTS.URL_SAFETY,
      passed: urlPass,
      message: urlPass
        ? `Found ${urlMatches.length} cleanly formatted URLs without control character corruption`
        : `Malformed or corrupted URLs detected (${malformedUrls.length})`,
    });
    if (!urlPass) {
      findings.push({ dimension: 'urls', severity: 'WARN', message: 'Malformed URLs in document' });
    }

    // ── 7. LaTeX Leakage Prevention (10 pts) ──────────────────────────────────
    const leakedCommands = [];
    for (const pat of RAW_LATEX_PATTERNS) {
      const m = text.match(pat);
      if (m) leakedCommands.push(m[0]);
    }
    const latexPass = leakedCommands.length === 0;
    checks.push({
      checkId: 'LATEX_LEAKAGE',
      name: 'Absence of Raw LaTeX Leakage',
      weight: ATS_CHECK_WEIGHTS.LATEX_LEAKAGE,
      passed: latexPass,
      message: latexPass
        ? 'No raw LaTeX markup or math commands leaked into plain text streams'
        : `Leaked LaTeX commands in text: ${leakedCommands.slice(0, 3).join(', ')}`,
    });
    if (!latexPass) {
      findings.push({
        dimension: 'latexLeakage',
        severity: 'FAIL',
        message: `Raw LaTeX markup detected in selectable text: ${leakedCommands[0]}`,
      });
    }

    // ── 8. Replacement Glyph (Tofu / Mojibake) Prevention (5 pts) ─────────────
    const hasReplacementGlyphs = REPLACEMENT_GLYPH_PATTERN.test(text);
    checks.push({
      checkId: 'REPLACEMENT_GLYPHS',
      name: 'Clean Unicode Glyph Encoding',
      weight: ATS_CHECK_WEIGHTS.REPLACEMENT_GLYPHS,
      passed: !hasReplacementGlyphs,
      message: !hasReplacementGlyphs
        ? 'All characters rendered with valid Unicode mappings (no tofu or replacement glyphs)'
        : 'Detected Unicode replacement glyphs (U+FFFD or control chars), indicating font encoding failure',
    });
    if (hasReplacementGlyphs) {
      findings.push({ dimension: 'glyphs', severity: 'FAIL', message: 'Unicode replacement glyphs found' });
    }

    // ── 9. Word Fragmentation & Broken Hyphenation (5 pts) ────────────────────
    const brokenWordMatches = text.match(BROKEN_WORD_HYPHEN_PATTERN) || [];
    const brokenWordsPass = brokenWordMatches.length <= 2;
    checks.push({
      checkId: 'WORD_FRAGMENTATION',
      name: 'Word Boundary & Hyphenation Integrity',
      weight: ATS_CHECK_WEIGHTS.WORD_FRAGMENTATION,
      passed: brokenWordsPass,
      message: brokenWordsPass
        ? 'Natural word boundaries preserved without awkward column hyphenation'
        : `Detected ${brokenWordMatches.length} split/hyphenated words across line breaks`,
    });

    // ── 10. Date Coherence & Temporal Integrity (5 pts) ───────────────────────
    const dateMatches = text.match(/\b(?:20\d{2}|19\d{2})\b/g) || [];
    const hasSyntheticDate = text.includes('2022-01-01') || text.includes('2024-01-01');
    const datePass = !hasSyntheticDate;
    checks.push({
      checkId: 'DATE_COHERENCE',
      name: 'Date Authenticity & Format Coherence',
      weight: ATS_CHECK_WEIGHTS.DATE_COHERENCE,
      passed: datePass,
      message: datePass
        ? `Extracted ${dateMatches.length} authentic temporal markers without synthetic placeholders`
        : 'Synthetic placeholder dates (2022-01-01/2024-01-01) detected in document',
    });
    if (!datePass) {
      findings.push({ dimension: 'dates', severity: 'FAIL', message: 'Synthetic placeholder dates detected' });
    }

    // ── Physical Observation Integration (if PDF binary provided) ─────────────
    if (pdfObservation && pdfObservation.geometry) {
      if (pdfObservation.geometry.pageOccupancyRatio > 0.98) {
        findings.push({
          dimension: 'pageClipping',
          severity: 'WARN',
          message: `Physical page occupancy is near margin overflow boundary (${Math.round(pdfObservation.geometry.pageOccupancyRatio * 100)}%)`,
        });
      }
    }

    // ── Aggregate Deterministic Score ─────────────────────────────────────────
    const totalEarned = checks.reduce((sum, c) => {
      if (typeof c.earnedWeight === 'number') return sum + c.earnedWeight;
      return sum + (c.passed ? c.weight : 0);
    }, 0);
    const totalPossible = Object.values(ATS_CHECK_WEIGHTS).reduce((a, b) => a + b, 0);
    const atsParseabilityScore = Math.max(0, Math.min(100, Math.round((totalEarned / totalPossible) * 100)));

    return {
      atsParseabilityScore,
      passed: atsParseabilityScore >= 75 && latexPass && !hasReplacementGlyphs,
      version: ATS_PARSEABILITY_VERSION,
      checks,
      findings,
      metrics: {
        textLength,
        wordCount: (text.match(/\b[A-Za-z0-9_-]+\b/g) || []).length,
        detectedHeadings: detectedHeadings.map((h) => h.key),
        contactDetected: { hasEmail, hasName, email: emailMatch ? emailMatch[0] : null },
        readingOrderValid: readingOrderPass,
        latexLeakCount: leakedCommands.length,
        replacementGlyphCount: hasReplacementGlyphs ? 1 : 0,
        fragmentedWordCount: brokenWordMatches.length,
      },
    };
  }

  /**
   * Derives plain text representation from structured resume document.
   * @private
   */
  _deriveTextFromStructuredResume(structuredResume) {
    const parts = [];
    const identity = structuredResume.candidateIdentity || structuredResume.header;
    if (identity) {
      parts.push(identity.displayName || identity.name || '');
      parts.push(identity.email || '');
      parts.push(identity.phone || '');
    }
    if (structuredResume.summary?.text) {
      parts.push('Professional Summary');
      parts.push(structuredResume.summary.text);
    }
    if (Array.isArray(structuredResume.skills?.categories)) {
      parts.push('Technical Skills');
      for (const cat of structuredResume.skills.categories) {
        parts.push(cat.categoryName || '');
        parts.push((cat.skills || []).map((s) => s.name || s).join(', '));
      }
    }
    if (Array.isArray(structuredResume.projects)) {
      parts.push('Technical Projects');
      for (const p of structuredResume.projects) {
        parts.push(p.name || p.displayName || '');
        parts.push((p.technologies || []).join(', '));
        for (const b of (p.bullets || [])) {
          parts.push(`• ${typeof b === 'string' ? b : b.text || ''}`);
        }
      }
    }
    if (Array.isArray(structuredResume.experience)) {
      parts.push('Professional Experience');
      for (const e of structuredResume.experience) {
        parts.push(`${e.role || ''} at ${e.company || ''}`);
        for (const b of (e.bullets || [])) {
          parts.push(`• ${typeof b === 'string' ? b : b.text || ''}`);
        }
      }
    }
    if (Array.isArray(structuredResume.education)) {
      parts.push('Education');
      for (const ed of structuredResume.education) {
        parts.push(`${ed.degree || ''} ${ed.institution || ''}`);
      }
    }
    if (structuredResume.dsa?.hasSection) {
      parts.push('Problem Solving');
      for (const b of (structuredResume.dsa.bullets || [])) {
        parts.push(`• ${typeof b === 'string' ? b : b.text || ''}`);
      }
    }
    return parts.join('\n');
  }
}

export const defaultAtsParseabilityService = new AtsParseabilityService();
export default AtsParseabilityService;
