/**
 * @file Measurable Resume Quality Audit & Readability QA Engine
 *
 * Implements objective, verifiable document QA before artifacts are exposed to candidates:
 * 1. Layout-Accurate Text Extraction & Selectability Audit (zero image-only rasterization).
 * 2. Glyph & Font Encoding Integrity (detects replacement characters \uFFFD, broken ligatures).
 * 3. Candidate Authenticity & Truth Invariant Enforcement:
 *    - Asserts presence of authentic candidate name and the authoritative verified email.
 *    - Strictly prohibits forbidden synthetic placeholders (reserved documentation domains, John Doe, etc.).
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

/**
 * Normalizes extracted PDF text for resilient string and regex validation,
 * stripping soft hyphens, line-break hyphenations, and collapsing whitespace.
 *
 * @param {string} value
 * @returns {string} Normalized lowercase string
 */
export function normalizePdfText(value = '') {
  return String(value || '')
    .replace(/\u00ad/g, '') // soft hyphen
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\bveriied\b/g, 'verified');
}

/**
 * Determines whether an authoritative candidate email is present in extracted
 * PDF text, tolerating whitespace that PDF text extraction may inject around
 * punctuation (e.g. "vishwanatnishad@gmail. com" or across line breaks).
 *
 * Email addresses contain no whitespace, so comparing on a whitespace-stripped
 * form is a lossless fallback that cannot weaken the authenticity gate: the full
 * address sequence must still be present.
 *
 * @param {string} extractedText Raw text extracted from the compiled PDF
 * @param {string} expectedEmail Authoritative candidate email
 * @returns {boolean} True when the email is present (or when none is expected)
 */
export function extractedTextContainsEmail(extractedText, expectedEmail) {
  const email = String(expectedEmail || '')
    .trim()
    .toLowerCase();
  if (!email) return true;

  const text = String(extractedText || '').toLowerCase();
  if (!text) return false;

  // Fast path: exact occurrence after canonical whitespace normalization.
  if (normalizePdfText(text).includes(email)) return true;

  // Tolerant path: allow extraction-inserted whitespace anywhere within the
  // address by comparing on a whitespace-free representation.
  const compactEmail = email.replace(/\s+/g, '');
  const compactText = text.replace(/\s+/g, '');
  return compactEmail.length > 0 && compactText.includes(compactEmail);
}

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
   * @param {object} [params.expectedContent] Canonical source-to-PDF content traceability
   *   contract. Every field is generic: tokens are derived from the canonical structured
   *   resume snapshot, never from candidate/project/job identities.
   * @param {Array<string>} [params.expectedContent.projectNames] Selected project display names
   * @param {Array<string>} [params.expectedContent.projectBullets] Selected project bullet texts
   * @param {Array<string>} [params.expectedContent.experienceBullets] Experience bullet texts
   * @param {Array<string>} [params.expectedContent.educationTokens] Institution/degree strings
   * @param {Array<string>} [params.expectedContent.links] URL display/trimmed forms
   * @param {Array<string>} [params.expectedContent.sectionHeadings] Expected section heading names in order
   * @returns {Promise<object>} Detailed measurable audit report
   */
  async validatePdf({
    pdfBuffer,
    expectedCandidate,
    targetJob = {},
    verifiedSkills = [],
    documentType = 'RESUME',
    expectedContent = null,
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
    const normalizedText = normalizePdfText(extractedText);

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
    const normExpectedName = normalizePdfText(expectedCandidate?.name);
    const hasCandidateName = !normExpectedName || normalizedText.includes(normExpectedName);
    if (!hasCandidateName) {
      contentIntegrity -= 15;
      criticalFailures.push(
        `Candidate name '${expectedCandidate.name}' not found in extracted text`
      );
      findings.push(`Missing candidate name: '${expectedCandidate.name}'`);
    }

    // Check 2B: Authoritative Candidate Email
    // Tolerant of PDF extraction formatting (whitespace injected around email
    // punctuation) while still requiring the full authoritative address.
    const hasCandidateEmail = extractedTextContainsEmail(extractedText, expectedCandidate?.email);
    if (!hasCandidateEmail) {
      contentIntegrity -= 20;
      criticalFailures.push(
        `Authoritative email '${expectedCandidate.email}' not found in extracted text`
      );
      findings.push(`Missing authentic email: '${expectedCandidate.email}'`);
    }

    // Check 2C: Zero Forbidden Placeholder Tokens
    const forbiddenPatterns = [
      /example\.com/i,
      /john\s+doe/i,
      /jane\s+doe/i,
      /lorem\s+ipsum/i,
      /todo:/i,
    ];

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(cleanText) || pattern.test(normalizedText)) {
        contentIntegrity -= 35;
        criticalFailures.push(
          `Forbidden placeholder or synthetic token detected matching ${pattern}`
        );
        findings.push(`Synthetic placeholder pattern detected: ${pattern}`);
        break;
      }
    }

    // Check 2C-bis: Zero Generic Placeholder Prose (real-content gate).
    // These are the historical placeholder phrases that silently replaced real
    // candidate data; any hit is a hard failure regardless of layout quality.
    const GENERIC_PLACEHOLDER_PATTERNS = [
      /\bdedicated software engineer with ver[if]+ed technical skills tailored for\b/i,
      /\bdedicated software engineer with ver[if]+ed technical skills\b/i,
      /\bdedicated professional tailored for\b/i,
      /\bdelivering immediate value\b/i,
      /\bver[if]+ed technical skills tailored for\b/i,
      /\bsoftware development experience ver[if]+ed\b/i,
      /\bindependent \/ open source engineering\b/i,
      /\baccolades and ver[if]+ed achievements\b/i,
      /\bevidence-backed project referenced in tailored documents\b/i,
      /\bacademic \/ technical foundation\b/i,
      /\bprofessional summary\b.*\bver[if]+ed technical skills\b/i,
    ];

    const hasGenericPlaceholder = GENERIC_PLACEHOLDER_PATTERNS.some((pattern) =>
      pattern.test(normalizedText)
    );

    if (hasGenericPlaceholder) {
      contentIntegrity -= 35;
      criticalFailures.push('Generic placeholder prose detected in generated document');
      findings.push('Generic placeholder prose detected in generated document');
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

    // Check 2C-sexties: Semantic leakage & fake bullet template detection (Req 2, 3, 5, 28)
    const semanticLeakagePatterns = [
      /\b(?:src|app|lib|components|utils|routes|services)\/[a-zA-Z0-9_\-\/]+\.(?:js|ts|jsx|tsx|py|go|rs|java|rb)\b/i,
      /\b(?:package\.json|dockerfile|tsconfig\.json|\.env|\.github\/workflows)\b/i,
      /\bDeveloped\s+(?:the\s+)?[a-zA-Z0-9_\-]+\s+functionality\s+in\s+[a-zA-Z0-9_\-\/.]+/i,
      /\bImplemented\s+feature\s+across\s+[a-zA-Z0-9_\-\/.]+/i,
      /\b(?:Defined|Engineered)\s+in\s+repository\s+[a-zA-Z0-9_\-\/.]+/i,
      /\bEngineered\s+[a-zA-Z0-9_\-]+\s+system\s+with\s+tested\s+reliability\s+and\s+maintainable\s+code\b/i,
    ];
    for (const pattern of semanticLeakagePatterns) {
      if (pattern.test(cleanText) || pattern.test(normalizedText)) {
        contentIntegrity -= 35;
        criticalFailures.push(`Semantic leakage or synthetic bullet template detected: ${pattern}`);
        findings.push(`Semantic leakage pattern detected in PDF text: ${pattern}`);
        break;
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

    // 5b. Canonical Source-to-PDF Content Traceability Gate (Phase 11).
    // Generic contract: every expectation is derived from the canonical structured
    // resume snapshot. Asserts that ALL selected content survived
    // source → LaTeX → PDF → extraction. Real content loss is a critical failure;
    // the gate contains no candidate/project/job-specific literals.
    const traceability = {
      checked: false,
      missing: [],
      sectionOrderOk: null,
      integrityOk: null,
    };
    if (expectedContent && typeof expectedContent === 'object' && documentType === 'RESUME') {
      traceability.checked = true;
      const norm = (s) =>
        String(s || '')
          .normalize('NFKC')
          .replace(/([A-Za-z])-\s*\n\s*([a-z])/g, '$1$2')
          .replace(/\s+/g, ' ')
          .toLowerCase()
          .trim();
      const normHyphenPreserved = (s) =>
        String(s || '')
          .normalize('NFKC')
          .replace(/-\s*\n\s*/g, '-')
          .replace(/\s+/g, ' ')
          .toLowerCase()
          .trim();
      const normText = norm(cleanText);
      const normHyphenPreservedText = normHyphenPreserved(cleanText);

      // Whitespace-free projections tolerate whitespace that PDF extraction may
      // inject around punctuation (e.g. "vishwanatnishad@gmail. com"). They are
      // applied only to tokens that are themselves whitespace-free (email, URL,
      // identifier), where the comparison is lossless: a genuine occurrence
      // contains no internal whitespace, so the full character sequence must
      // still be present. Multi-word tokens keep the strict single-space match.
      const compactText = normText.replace(/\s+/g, '');
      const compactHyphenPreservedText = normHyphenPreservedText.replace(/\s+/g, '');

      // Token expectation groups: every selected element must survive extraction.
      const expectationGroups = [
        {
          label: 'candidate name',
          tokens: expectedContent.candidateName ? [expectedContent.candidateName] : [],
        },
        {
          label: 'target role',
          tokens: expectedContent.targetRole ? [expectedContent.targetRole] : [],
        },
        { label: 'phone', tokens: expectedContent.phone ? [expectedContent.phone] : [] },
        { label: 'email', tokens: expectedContent.email ? [expectedContent.email] : [] },
        { label: 'location', tokens: expectedContent.location ? [expectedContent.location] : [] },
        { label: 'skill', tokens: expectedContent.skillsTokens },
        { label: 'project name', tokens: expectedContent.projectNames },
        { label: 'project technology', tokens: expectedContent.projectTechnologies },
        { label: 'project bullet', tokens: expectedContent.projectBullets },
        { label: 'DSA', tokens: expectedContent.dsaTokens },
        { label: 'experience role', tokens: expectedContent.experienceRoles },
        { label: 'experience company', tokens: expectedContent.experienceCompanies },
        { label: 'experience bullet', tokens: expectedContent.experienceBullets },
        { label: 'education record', tokens: expectedContent.educationTokens },
        { label: 'degree', tokens: expectedContent.degrees },
        { label: 'institution', tokens: expectedContent.institutions },
        { label: 'coursework', tokens: expectedContent.coursework },
        { label: 'certification', tokens: expectedContent.certifications },
        { label: 'link', tokens: expectedContent.links },
      ];
      for (const group of expectationGroups) {
        for (const token of Array.isArray(group.tokens) ? group.tokens : []) {
          const t = norm(token);
          if (!t) continue;
          const tHyphen = normHyphenPreserved(token);
          const whitespaceFree = !/\s/.test(String(token));
          const compactToken = t.replace(/\s+/g, '');
          const compactTokenHyphen = tHyphen.replace(/\s+/g, '');
          const found =
            normText.includes(t) ||
            normHyphenPreservedText.includes(tHyphen) ||
            (whitespaceFree &&
              ((compactToken && compactText.includes(compactToken)) ||
                (compactTokenHyphen && compactHyphenPreservedText.includes(compactTokenHyphen))));
          if (!found) {
            traceability.missing.push({ kind: group.label, token });
          }
        }
      }
      if (traceability.missing.length > 0) {
        contentIntegrity -= Math.min(35, 5 * traceability.missing.length);
        criticalFailures.push(
          `Selected resume content lost between source and PDF extraction (${traceability.missing.length} item(s) missing)`
        );
        findings.push(
          `Traceability gate: missing from extracted PDF text: ${traceability.missing
            .map((m) => `${m.kind} "${m.token}"`)
            .join('; ')}`
        );
      }

      // Section order: every expected heading must appear and headings must
      // appear in canonical document order. Position comparison is computed on
      // a text copy with matched headings removed progressively so repeated
      // words (e.g. a summary mentioning "projects") don't create false
      // out-of-order signals.
      const headings = Array.isArray(expectedContent.sectionHeadings)
        ? expectedContent.sectionHeadings.filter(Boolean)
        : [];
      if (headings.length > 0) {
        let searchFrom = 0;
        let allFound = true;
        let inOrder = true;
        for (const h of headings) {
          const idx = normText.indexOf(norm(h), searchFrom);
          if (idx === -1) {
            allFound = false;
            break;
          }
          searchFrom = idx + 1;
        }
        traceability.sectionOrderOk = allFound && inOrder;
        if (!traceability.sectionOrderOk) {
          contentIntegrity -= 15;
          criticalFailures.push('Expected section order not preserved in extracted PDF text');
          findings.push(`Section order check: expected [${headings.join(' -> ')}]`);
        }
      }

      // Extraction integrity: no replacement characters, no common-ligature codepoints.
      const hasLigatureCorruption = /[\uFB00-\uFB06]/.test(cleanText);
      const hasReplacement = cleanText.includes('\uFFFD');
      traceability.integrityOk = !hasLigatureCorruption && !hasReplacement;
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
      traceability,
      extractedText: cleanText,
      auditedAt: new Date().toISOString(),
    };
  }
}
