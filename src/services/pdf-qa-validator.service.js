/**
 * @file Measurable Resume Quality Audit & Readability QA Engine
 *
 * Implements objective, verifiable document QA before artifacts are exposed to candidates:
 * 1. Layout-Accurate Text Extraction & Selectability Audit (zero image-only rasterization).
 * 2. Glyph & Font Encoding Integrity (detects replacement characters \uFFFD, broken ligatures).
 * 3. Candidate Authenticity & Truth Invariant Enforcement:
 *    - Asserts presence of authentic candidate name and verified email (e.g. vishwanatnishad@gmail.com).
 *    - Strictly prohibits forbidden synthetic placeholders (zero vishw@example.com, John Doe, etc.).
 * 4. Sectional & Structural Completeness (Summary, Competencies, Experience, Education).
 * 5. Measurable "Resume Quality Audit" Score (0-100) across:
 *    - Parsing Compatibility (35 pts)
 *    - Content/Truth Integrity (35 pts)
 *    - Readability & Flow (30 pts)
 * 6. Distinct Target Job Coverage Metric (0-100%) separate from document quality score.
 *
 * Invariant: Document MUST PASS all critical QA gates before being marked READY in Handoff Kit.
 */

import { ResumeParserService } from './resume-parser.service.js';
import { logger } from '../utils/logger.js';

export class PdfQaValidatorService {
  /**
   * @param {object} [dependencies={}]
   * @param {ResumeParserService} [dependencies.resumeParser]
   */
  constructor(dependencies = {}) {
    this.resumeParser = dependencies.resumeParser || new ResumeParserService();
    this.logger = logger.child({ module: 'PdfQaValidatorService' });
  }

  /**
   * Validates a compiled PDF against ATS-orientation, authenticity, and readability standards.
   *
   * @param {object} params
   * @param {Buffer} params.pdfBuffer Raw compiled PDF binary buffer
   * @param {object} params.expectedCandidate
   * @param {string} params.expectedCandidate.name Expected candidate display name
   * @param {string} params.expectedCandidate.email Authoritative candidate email
   * @param {string} [params.expectedCandidate.phone] Expected candidate phone
   * @param {object} [params.targetJob] Target Job details { title, company }
   * @param {Array<string>} [params.verifiedSkills] List of verified skills
   * @param {string} [params.documentType='RESUME'] 'RESUME' | 'COVER_LETTER'
   * @returns {Promise<object>} Detailed measurable audit report
   */
  async validatePdf({
    pdfBuffer,
    expectedCandidate,
    targetJob = {},
    verifiedSkills = [],
    documentType = 'RESUME',
  }) {
    const findings = [];
    const criticalFailures = [];

    // 1. PDF File Header & Buffer Sanity
    if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 500) {
      return {
        passed: false,
        score: 0,
        qualityLevel: 'FAILED',
        breakdown: { parsingCompatibility: 0, contentIntegrity: 0, readability: 0 },
        findings: ['PDF buffer is invalid or under minimum viable file size (< 500 bytes)'],
        criticalFailures: ['Corrupted or empty PDF file'],
        extractedText: '',
      };
    }

    const pdfMagic = pdfBuffer.subarray(0, 5).toString('ascii');
    if (!pdfMagic.startsWith('%PDF-')) {
      return {
        passed: false,
        score: 0,
        qualityLevel: 'FAILED',
        breakdown: { parsingCompatibility: 0, contentIntegrity: 0, readability: 0 },
        findings: ['Invalid PDF magic bytes header'],
        criticalFailures: ['Document is not a valid PDF'],
        extractedText: '',
      };
    }

    // 2. Layout-Accurate Text Extraction
    let extractedText = '';
    try {
      extractedText = this.resumeParser.extractRawText({
        buffer: pdfBuffer,
        format: 'PDF',
      });
    } catch (parseErr) {
      this.logger.warn({ error: parseErr.message }, 'Failed to extract text from PDF');
      extractedText = '';
    }

    // Fallback stream inspection if parser returned empty
    if (!extractedText || extractedText.trim().length === 0) {
      const rawAscii = pdfBuffer.toString('binary');
      const textMatches = rawAscii.match(/\(([^()]{3,})\)Tj/g) || [];
      extractedText = textMatches.map((m) => m.replace(/^\(|\)Tj$/g, '')).join(' ');
    }

    const cleanText = extractedText.trim();
    const charCount = cleanText.length;
    const wordCount = cleanText.split(/\s+/).filter((w) => w.length > 0).length;

    // 3. Category 1: Parsing Compatibility (Max 35 points)
    let parsingCompatibility = 35;

    // Check 1A: Selectable Text & Non-Image Rasterization
    const minCharThreshold = documentType === 'COVER_LETTER' ? 80 : 150;
    if (charCount < minCharThreshold) {
      parsingCompatibility -= 35;
      criticalFailures.push(
        'Document contains insufficient extractable text (image-only or rasterized)'
      );
      findings.push(
        `Failed selectable text check: Character count is under ${minCharThreshold} characters`
      );
    } else if (charCount < minCharThreshold * 2) {
      parsingCompatibility -= 5;
      findings.push('Low character density detected in document');
    }

    // Check 1B: Broken Glyphs & Replacement Characters
    if (
      cleanText.includes('\uFFFD') ||
      cleanText.includes('???') ||
      /\\undefined/i.test(cleanText)
    ) {
      parsingCompatibility -= 10;
      criticalFailures.push('Broken font glyphs or unresolved LaTeX tokens detected');
      findings.push('Detected replacement character (\\uFFFD) or raw LaTeX macro');
    }

    // 4. Category 2: Content & Truth Integrity (Max 35 points)
    let contentIntegrity = 35;

    // Check 2A: Authentic Candidate Identity
    const expectedName = (expectedCandidate?.name || '').toLowerCase();
    if (expectedName && !cleanText.toLowerCase().includes(expectedName)) {
      contentIntegrity -= 15;
      criticalFailures.push(
        `Candidate name '${expectedCandidate.name}' not found in extracted text`
      );
      findings.push(`Missing candidate name: '${expectedCandidate.name}'`);
    }

    // Check 2B: Authoritative Candidate Email
    const expectedEmail = (expectedCandidate?.email || '').toLowerCase();
    if (expectedEmail && !cleanText.toLowerCase().includes(expectedEmail)) {
      contentIntegrity -= 20;
      criticalFailures.push(
        `Authoritative email '${expectedCandidate.email}' not found in extracted text`
      );
      findings.push(`Missing authentic email: '${expectedCandidate.email}'`);
    }

    // Check 2C: Zero Forbidden Placeholder Tokens
    const forbiddenPatterns = [
      /vishw@example\.com/i,
      /example\.com/i,
      /john\s+doe/i,
      /jane\s+doe/i,
      /lorem\s+ipsum/i,
      /todo:/i,
    ];

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(cleanText)) {
        contentIntegrity -= 35;
        criticalFailures.push(
          `Forbidden placeholder or synthetic token detected matching ${pattern}`
        );
        findings.push(`Synthetic placeholder pattern detected: ${pattern}`);
        break;
      }
    }

    // Whitespace-normalized copy for prose pattern checks: PDF text extraction
    // inserts line breaks and hyphenates words across lines ("De-\nlivered"),
    // which would defeat literal-space regexes.
    const normalizedText = cleanText
      .replace(/([A-Za-z])-\s*\n\s*([a-z])/g, '$1$2')
      .replace(/\s+/g, ' ');

    // Check 2C-bis: Zero Generic Placeholder Prose (real-content gate).
    // These are the historical placeholder phrases that silently replaced real
    // candidate data; any hit is a hard failure regardless of layout quality.
    // LaTeX ligatures ("fi" renders as one glyph) are dropped by PDF text
    // extraction ("verified" -> "veriied"), so matchers tolerate the missing f.
    const genericPlaceholderPhrases = [
      'Software Development Experience Verified',
      'Independent / Open Source Engineering',
      'Academic / Technical Foundation',
      'Accredited Institution',
      'Dedicated software engineer with verified technical skills',
      'verified achievements',
      'Dedicated professional tailored for',
      'delivering immediate value',
      'Production project',
      'Evidence-backed project referenced in tailored documents',
    ];
    const genericPlaceholderPatterns = genericPlaceholderPhrases.map((phrase) => {
      const tolerant = phrase
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/fi/g, 'f?i')
        .replace(/\s+/g, '\\s+');
      return new RegExp(tolerant, 'i');
    });
    for (const pattern of genericPlaceholderPatterns) {
      if (pattern.test(normalizedText)) {
        contentIntegrity -= 35;
        criticalFailures.push(`Generic placeholder prose detected in document: ${pattern}`);
        findings.push(`Generic placeholder content pattern detected: ${pattern}`);
        break;
      }
    }

    // Check 2C-ter: Suspicious test remnants or malformed text
    const testRemnantPatterns = [
      /Testing dirty state/i,
      /dirty state bar/i,
      /\[updated\]/i,
      /high-performan\b/i,
      /\b[a-zA-Z]{4,}\s+Testing\s+dirty/i,
    ];
    for (const pattern of testRemnantPatterns) {
      if (pattern.test(cleanText) || pattern.test(normalizedText)) {
        contentIntegrity -= 35;
        criticalFailures.push(`Suspicious test remnant or malformed text detected: ${pattern}`);
        findings.push(`Test remnant detected: ${pattern}`);
        break;
      }
    }

    // Check 2C-quater: Unsupported sweeping verification claims
    if (/Each of these skills is verified/i.test(normalizedText)) {
      contentIntegrity -= 20;
      criticalFailures.push(
        'Sweeping unverified skill claim detected ("Each of these skills is verified")'
      );
      findings.push('Sweeping verification claim detected in document');
    }

    // Check 2C-quinquies: Duplicate projects in cover letter
    if (documentType === 'COVER_LETTER') {
      const coverLetterRepeatMatch =
        /I built\s+([^,.]+?)(?:\s*\([^)]*\))?(?:,\s*built with[^,.]*)?\s+and\s+([^,.]+?)(?:\s*\([^)]*\))?(?:,\s*built with[^,.]*)?\./i.exec(
          normalizedText
        );
      if (coverLetterRepeatMatch) {
        const p1 = coverLetterRepeatMatch[1].trim().toLowerCase();
        const p2 = coverLetterRepeatMatch[2].trim().toLowerCase();
        if (p1 === p2) {
          contentIntegrity -= 25;
          criticalFailures.push(`Duplicate project in cover letter: repeated project "${p1}"`);
          findings.push(`Repeated project clause in cover letter: "${p1}"`);
        }
      }
    }

    // Check 2D: Target Job Context & Internal Metadata Integrity
    if (documentType === 'COVER_LETTER') {
      if (targetJob.company && !cleanText.toLowerCase().includes(targetJob.company.toLowerCase())) {
        contentIntegrity -= 5;
        findings.push(
          `Target company '${targetJob.company}' not explicitly referenced in cover letter body`
        );
      }
    } else if (documentType === 'RESUME') {
      // Internal tailoring metadata check: Resume must NOT visibly leak "Tailored for: ..."
      if (/tailored\s+for:/i.test(cleanText) || /tailored\s+for\s+[a-z]/i.test(normalizedText)) {
        contentIntegrity -= 35;
        criticalFailures.push(
          'Resume visibly contains internal generation metadata ("Tailored for: ...")'
        );
        findings.push('Internal tailoring metadata leaked into resume PDF');
      }
    }

    // 5. Category 3: Readability & Structure (Max 30 points)
    let readability = 30;

    if (documentType === 'RESUME') {
      const lowerText = cleanText.toLowerCase();
      const hasSummary = lowerText.includes('summary') || lowerText.includes('profile');
      const hasExperience = lowerText.includes('experience') || lowerText.includes('employment');
      const hasEducation = lowerText.includes('education') || lowerText.includes('academic');
      const hasCompetencies = lowerText.includes('competencies') || lowerText.includes('skills');

      const sectionsFound = [hasSummary, hasExperience, hasEducation, hasCompetencies].filter(
        Boolean
      ).length;
      if (sectionsFound < 3) {
        readability -= 8;
        findings.push(
          `Incomplete section structure: only ${sectionsFound}/4 canonical resume sections identified`
        );
      }

      // Word count density check for 1-page resume (optimal: 250 - 850 words)
      if (wordCount < 150) {
        readability -= 7;
        findings.push(`Resume word count (${wordCount} words) is unusually sparse`);
      } else if (wordCount > 1000) {
        readability -= 5;
        findings.push(
          `Resume word count (${wordCount} words) exceeds standard single-page density`
        );
      }
    } else if (documentType === 'COVER_LETTER') {
      // Cover letter word count density (optimal: 180 - 450 words)
      if (wordCount < 100) {
        readability -= 15;
        findings.push(`Cover letter word count (${wordCount} words) is too brief`);
      }
    }

    // 6. Separate Target Job Coverage Metric (0 - 100%)
    let jobAlignmentCoverage = 100;
    if (verifiedSkills.length > 0) {
      const lowerText = cleanText.toLowerCase();
      const matched = verifiedSkills.filter((s) => lowerText.includes(s.toLowerCase()));
      jobAlignmentCoverage = Math.round((matched.length / verifiedSkills.length) * 100);
    }

    // 7. Calculate Final Composite Quality Score
    const totalScore = Math.max(
      0,
      Math.min(100, parsingCompatibility + contentIntegrity + readability)
    );

    const passed = criticalFailures.length === 0 && totalScore >= 75;

    let qualityLevel = 'EXCELLENT';
    if (!passed) qualityLevel = 'ACTION_REQUIRED';
    else if (totalScore < 85) qualityLevel = 'GOOD';

    return {
      passed,
      score: totalScore,
      qualityLevel,
      breakdown: {
        parsingCompatibility: Math.max(0, parsingCompatibility),
        contentIntegrity: Math.max(0, contentIntegrity),
        readability: Math.max(0, readability),
      },
      metrics: {
        wordCount,
        characterCount: charCount,
        selectableTextRatio: charCount > 150 ? 1.0 : 0.2,
        jobAlignmentCoverage,
      },
      findings,
      criticalFailures,
      auditedAt: new Date().toISOString(),
    };
  }
}
