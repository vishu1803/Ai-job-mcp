/**
 * @file Deterministic Resume-Quality Assessment Service (P14-024)
 *
 * Replaces the misleading arbitrary "ATS Score" presentation with three honest,
 * auditable metrics attached to every generated resume package:
 *
 * 1. ATS PARSEABILITY (0-100) — measures whether OUR deterministic pipeline can
 *    reliably parse and structurally understand the generated resume PDF.
 *    Every point is derived from named, weighted, recorded checks. No number is
 *    ever asserted without an underlying check result, and the full check ledger
 *    is stored so the score can be audited and reproduced.
 *    This is NOT an employer ATS score. No universal ATS score exists across
 *    vendors; we never claim to predict one.
 *
 * 2. JOB MATCH — passthrough of the existing evidence-aware job-fit result
 *    (analyze_job_fit / AtsFitScoreService). Formatting quality NEVER moves this
 *    number; it represents candidate/job alignment only.
 *
 * 3. EVIDENCE-BACKED COVERAGE (0-100) — job-specific content coverage measuring
 *    which relevant job requirements are actually represented in the generated
 *    resume using evidence-grounded candidate information. Requirements are
 *    classified strictly:
 *      - EVIDENCE_BACKED: represented by VERIFIED/CORROBORATED candidate evidence
 *      - CLAIMED: represented only by candidate-claimed / self-declared skills
 *      - MISSING: not represented in the resume at all
 *    Unsupported claims never receive full credit.
 *
 * Invariants:
 * - Deterministic: identical inputs produce identical assessments (auditedAt is
 *   injected, never sampled at call time, unless explicitly requested).
 * - Fail-truthful: every failed check is recorded with details; the score is the
 *   arithmetic sum of earned weights over total possible weight.
 * - Zero fabrication: coverage is computed from the package's own truth
 *   partition (verifiedSkills / claimedSkills / selectedProjects) — never from
 *   keyword-stuffing heuristics that could inflate the score.
 */

import zlib from 'node:zlib';

const ASSESSMENT_VERSION = '1.0.0';

/**
 * Weighted deterministic check ledger for ATS parseability.
 * Each check has an id, human label, and weight. Total weight = 100.
 * Weights are frozen: changing them is a versioned scoring-model change.
 */
export const ATS_PARSEABILITY_CHECKS = Object.freeze([
  { id: 'PDF_TEXT_EXTRACTION', label: 'PDF text extraction succeeds', weight: 12 },
  { id: 'CANDIDATE_NAME_PRESENT', label: 'Candidate name detected', weight: 8 },
  { id: 'CONTACT_EMAIL_PRESENT', label: 'Email detected', weight: 8 },
  { id: 'CONTACT_PHONE_PRESENT', label: 'Phone detected', weight: 4 },
  { id: 'PROFILE_LINKS_PRESENT', label: 'Profile links detected', weight: 4 },
  { id: 'SECTION_SUMMARY', label: 'Professional Summary section detected', weight: 8 },
  { id: 'SECTION_SKILLS', label: 'Technical Skills section detected', weight: 8 },
  { id: 'SECTION_PROJECTS', label: 'Projects section detected', weight: 10 },
  { id: 'SECTION_EXPERIENCE', label: 'Experience section detected', weight: 6 },
  { id: 'SECTION_EDUCATION', label: 'Education section detected', weight: 6 },
  { id: 'SECTION_ORDER_VALID', label: 'Section ordering valid', weight: 5 },
  { id: 'PROJECT_COUNT_MATCH', label: 'Project count matches package', weight: 5 },
  { id: 'EXPERIENCE_COUNT_MATCH', label: 'Experience count matches package', weight: 3 },
  { id: 'EDUCATION_COUNT_MATCH', label: 'Education count matches package', weight: 3 },
  { id: 'HYPERLINKS_VALID', label: 'Hyperlinks valid (no malformed or placeholder URLs)', weight: 4 },
  { id: 'SINGLE_COLUMN_LAYOUT', label: 'Single-column layout (no layout tables/columns)', weight: 4 },
  { id: 'STANDARD_BULLETS', label: 'Conventional bullet points', weight: 2 },
]);

const CHECK_WEIGHT_TOTAL = ATS_PARSEABILITY_CHECKS.reduce((sum, c) => sum + c.weight, 0);
if (CHECK_WEIGHT_TOTAL !== 100) {
  throw new Error(`ATS parseability check weights must total 100, got ${CHECK_WEIGHT_TOTAL}`);
}

const EXPECTED_SECTION_ORDER = Object.freeze([
  'SUMMARY',
  'SKILLS',
  'PROJECTS',
  'EXPERIENCE',
  'EDUCATION',
]);

/** Canonical heading variants recognized in extracted resume text. */
const SECTION_HEADING_PATTERNS = Object.freeze({
  SUMMARY: /^(professional\s+summary|summary|profile|objective)\b/i,
  SKILLS: /^(technical\s+skills|core\s+competencies|skills|technologies)\b/i,
  PROJECTS: /^(technical\s+projects|projects|key\s+projects|featured\s+projects)\b/i,
  PROBLEM_SOLVING: /^(problem\s+solving(?!.*(?:&|\band\b)\s*algorithmic).*)$/i,
  DSA: /^(problem\s+solving\s*(?:&|and)?\s*algorithmic\s+practice|algorithmic\s+practice)\b/i,
  EXPERIENCE: /^(professional\s+experience|work\s+experience|experience|employment)\b/i,
  EDUCATION: /^(education|academic\s+background)\b/i,
  CERTIFICATIONS: /^(certifications?|licenses?)\b/i,
});

/**
 * Normalizes extracted text for structural matching: collapses whitespace and
 * repairs hyphenated line breaks introduced by PDF extraction.
 *
 * @param {string} text Raw extracted PDF text
 * @returns {string} Normalized text
 */
function normalizeExtractedText(text) {
  return String(text || '')
    .replace(/([A-Za-z])-\s*\n\s*([a-z])/g, '$1$2')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Case/whitespace-insensitive containment probe. PDF text extraction can
 * fragment lines and shift casing, so exact substring checks are unreliable.
 * Falls back to an all-significant-tokens-present check for multi-word names.
 *
 * @param {string} haystack Lowercased normalized text
 * @param {string} needle Expected string
 * @returns {boolean}
 */
function textContains(haystack, needle) {
  const n = String(needle || '').toLowerCase().trim();
  if (!n) return false;
  // Canonical form: all non-alphanumerics become spaces so hyphenated slugs
  // ("Product-Data-Explorer") match rendered titles ("Product Data Explorer").
  const canon = (s) => s.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const canonHay = canon(haystack);
  const canonNeedle = canon(n);
  if (canonHay.includes(canonNeedle)) return true;
  const tokens = canonNeedle.split(' ').filter((t) => t.length >= 3);
  if (tokens.length < 2) return false;
  return tokens.every((t) => canonHay.includes(t));
}

/**
 * Splits extracted text into lines, dropping empty lines.
 *
 * @param {string} text Normalized extracted text
 * @returns {string[]} Non-empty lines
 */
function toLines(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * Detects which canonical sections appear in the extracted text and in what order.
 *
 * @param {string[]} lines Extracted text lines
 * @returns {{ found: Array<{ type: string, lineIndex: number }>, order: string[] }}
 */
function detectSections(lines) {
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const [type, pattern] of Object.entries(SECTION_HEADING_PATTERNS)) {
      if (type === 'PROBLEM_SOLVING') continue; // superseded by DSA pattern
      if (pattern.test(line) && line.length <= 60) {
        found.push({ type, lineIndex: i });
        break;
      }
    }
  }
  // Keep only the FIRST detection of each section type (headings, not prose mentions)
  const seen = new Set();
  const firstOnly = [];
  for (const f of found) {
    if (seen.has(f.type)) continue;
    seen.add(f.type);
    firstOnly.push(f);
  }
  return { found: firstOnly, order: firstOnly.map((f) => f.type) };
}

/**
 * Validates that detected sections appear in the canonical resume order.
 * Problem Solving (DSA) and Certifications may appear anywhere after SKILLS.
 *
 * @param {string[]} order Detected section types in document order
 * @returns {boolean}
 */
function isSectionOrderValid(order, expectedOrder = null) {
  const reference = Array.isArray(expectedOrder) && expectedOrder.length > 0
    ? expectedOrder.map((s) => String(s).toUpperCase()).filter((s) => s !== 'HEADER')
    : EXPECTED_SECTION_ORDER;
  // DSA/Problem Solving and Certifications are optional interleaves and may
  // appear anywhere after SKILLS without breaking canonical ordering.
  const relevant = order.filter((s) => s !== 'DSA' && s !== 'CERTIFICATIONS');
  const present = reference.filter((s) => relevant.includes(s));
  if (present.length < 2) return relevant.length > 0;
  const positions = present.map((s) => relevant.indexOf(s));
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] <= positions[i - 1]) return false;
  }
  return true;
}

/**
 * Extracts http(s) URLs and mailto links from LaTeX source.
 *
 * @param {string} texContent LaTeX source
 * @returns {string[]} Raw URL strings
 */
function extractTexUrls(texContent) {
  const urls = [];
  const hrefRegex = /\\href\{([^}]+)\}/g;
  let m;
  while ((m = hrefRegex.exec(texContent)) !== null) {
    urls.push(m[1]);
  }
  return urls;
}

/**
 * Checks whether a URL is a real, non-placeholder link.
 * Mirrors isRealUrl semantics without importing the content service (keeps this
 * module dependency-light and deterministic).
 *
 * @param {string} url Raw URL
 * @returns {boolean}
 */
function isPlausibleUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return true;
  if (!/^https?:\/\/[a-z0-9]/i.test(trimmed)) return false;
  if (
    /example\.(com|org|net)|placeholder|dummy|test\.com|localhost|127\.0\.0\.1|sample\.com|yourdomain\.com|foo\.bar|fake/i.test(
      trimmed
    )
  ) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname || !parsed.hostname.includes('.')) return false;
    const hostParts = parsed.hostname.toLowerCase().split('.');
    if (['example', 'test', 'placeholder', 'dummy', 'sample', 'fake'].includes(hostParts[0])) {
      return false;
    }
    const tld = hostParts[hostParts.length - 1];
    if (['example', 'test', 'invalid', 'localhost'].includes(tld)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds one audit check record.
 *
 * @param {string} id Check id
 * @param {boolean} passed Whether the check passed
 * @param {string} details Human-readable audit detail
 * @returns {{ id: string, label: string, weight: number, passed: boolean, details: string }}
 */
function buildCheck(id, passed, details) {
  const def = ATS_PARSEABILITY_CHECKS.find((c) => c.id === id);
  if (!def) throw new Error(`Unknown ATS parseability check id: ${id}`);
  return {
    id,
    label: def.label,
    weight: def.weight,
    passed: Boolean(passed),
    details: String(details || ''),
  };
}

/**
 * Counts pages in a PDF buffer. Handles both classic plaintext page objects and
 * PDF 1.5+ object streams (tectonic/chrome output) by inflating all
 * FlateDecode streams and searching inside them.
 *
 * @param {Buffer} pdfBuffer Raw PDF bytes
 * @returns {number} Page count (0 when undeterminable)
 */
export function countPdfPages(pdfBuffer) {
  if (!Buffer.isBuffer(pdfBuffer)) return 0;
  const pageRegex = /\/Type\s*\/Page(?![sXw])/g;

  const latin1 = pdfBuffer.toString('latin1');
  let count = (latin1.match(pageRegex) || []).length;
  if (count > 0) return count;

  // Object-stream fallback: inflate every FlateDecode stream and recount.
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = streamRegex.exec(latin1)) !== null) {
    try {
      const inflated = zlib.inflateSync(Buffer.from(m[1], 'binary')).toString('latin1');
      count += (inflated.match(pageRegex) || []).length;
    } catch {
      // Not a zlib stream (font/binary payload); skip.
    }
  }
  if (count > 0) return count;

  // Pages-tree /Count fallback (plain or inflated).
  const countRegex = /\/Type\s*\/Pages[\s\S]{0,400}?\/Count\s+(\d+)/;
  const plain = latin1.match(countRegex);
  if (plain) return parseInt(plain[1], 10);
  while ((m = streamRegex.exec(latin1)) !== null) {
    try {
      const inflated = zlib.inflateSync(Buffer.from(m[1], 'binary')).toString('latin1');
      const hit = inflated.match(countRegex);
      if (hit) return parseInt(hit[1], 10);
    } catch {
      // skip
    }
  }
  return 0;
}

/**
 * Normalizes a skill name to a comparable token.
 *
 * @param {string} name Raw skill name
 * @returns {string} Lowercase alphanumeric token
 */
function skillToken(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9.#+]/g, '')
    .replace(/^[.#+]+|[.#+]+$/g, '');
}

/**
 * Maps a provenance/truth category to the strict coverage status taxonomy.
 * VERIFIED and CORROBORATED map to EVIDENCE_BACKED; CLAIMED, USER_PROVIDED,
 * SELF_DECLARED and LEARNING map to CLAIMED (partial credit); anything else is
 * treated as CLAIMED at most.
 *
 * @param {string} truthCategory Raw truth category
 * @returns {'EVIDENCE_BACKED'|'CLAIMED'}
 */
function provenanceToStatus(truthCategory) {
  const cat = String(truthCategory || '').toUpperCase();
  if (cat === 'VERIFIED' || cat === 'CORROBORATED') return 'EVIDENCE_BACKED';
  return 'CLAIMED';
}

/**
 * Aggregates coverage status across multiple evidence sources for one
 * requirement: EVIDENCE_BACKED wins over CLAIMED; nothing yields MISSING.
 *
 * @param {string[]} statuses Candidate statuses
 * @returns {'EVIDENCE_BACKED'|'CLAIMED'|'MISSING'}
 */
function aggregateStatus(statuses) {
  if (statuses.includes('EVIDENCE_BACKED')) return 'EVIDENCE_BACKED';
  if (statuses.includes('CLAIMED')) return 'CLAIMED';
  return 'MISSING';
}

export class ResumeQualityAssessmentService {
  /**
   * Computes the deterministic ATS parseability assessment for a generated
   * resume from ACTUAL rendered artifacts (extracted PDF text + LaTeX source).
   *
   * @param {object} params
   * @param {string} params.extractedText Text extracted from the compiled PDF
   * @param {string} params.texContent LaTeX source used to compile the PDF
   * @param {object} params.applicationPackage Canonical application package
   * @param {object} [params.candidateProfile] Candidate profile used for rendering
   * @param {string} [params.analyzedAt] ISO timestamp (inject for determinism)
   * @returns {{ score: number, version: string, passed: boolean, maxScore: number, checks: Array<object>, metrics: object, auditedAt: string }}
   */
  assessAtsParseability({
    extractedText,
    texContent,
    applicationPackage,
    candidateProfile = null,
    analyzedAt = null,
  }) {
    const text = normalizeExtractedText(extractedText);
    const lines = toLines(text);
    const lowerText = text.toLowerCase();
    const tex = String(texContent || '');
    const pkg = applicationPackage || {};

    const checks = [];
    const metrics = {
      extractedCharacterCount: text.length,
      extractedLineCount: lines.length,
      pageCountEstimate: null,
    };

    // 1. PDF_TEXT_EXTRACTION
    const extractionOk = text.length >= 150;
    checks.push(
      buildCheck(
        'PDF_TEXT_EXTRACTION',
        extractionOk,
        extractionOk
          ? `Extracted ${text.length} characters of selectable text`
          : `Insufficient selectable text extracted (${text.length} chars; image-only or broken encoding suspected)`
      )
    );

    const structuredResume =
      pkg.structuredResume ||
      pkg.tailoredResume?.structuredResume ||
      null;

    // 2. Identity checks
    const candidateName =
      structuredResume?.candidateIdentity?.displayName ||
      pkg.candidateName ||
      candidateProfile?.displayName ||
      '';
    const nameOk = Boolean(candidateName) && textContains(lowerText, candidateName);
    checks.push(
      buildCheck(
        'CANDIDATE_NAME_PRESENT',
        nameOk,
        nameOk ? `Name "${candidateName}" found in extracted text` : 'Candidate name not found in extracted text'
      )
    );

    const email =
      structuredResume?.candidateIdentity?.email ||
      pkg.candidateEmail ||
      candidateProfile?.canonicalEmail ||
      candidateProfile?.primaryEmail ||
      '';
    const emailOk = Boolean(email) && lowerText.includes(String(email).toLowerCase());
    checks.push(
      buildCheck(
        'CONTACT_EMAIL_PRESENT',
        emailOk,
        emailOk ? 'Email found in extracted text' : 'Email not found in extracted text'
      )
    );

    const phone =
      structuredResume?.candidateIdentity?.phone ||
      pkg.candidatePhone ||
      candidateProfile?.candidatePhone ||
      '';
    const phoneDigits = String(phone).replace(/\D/g, '');
    const phoneOk = phoneDigits.length >= 7 && phoneDigits.split('').some((d) => d !== '0')
      ? lowerText.replace(/\D/g, '').includes(phoneDigits)
      : false;
    checks.push(
      buildCheck(
        'CONTACT_PHONE_PRESENT',
        phoneOk,
        phoneOk
          ? 'Phone number found in extracted text'
          : phone
            ? 'Stored phone number not found in extracted text'
            : 'No phone number stored in candidate profile (check not applicable, scored as failed for auditability)'
      )
    );

    // 3. PROFILE_LINKS_PRESENT (from LaTeX hrefs, which are the rendered links)
    const texUrls = extractTexUrls(tex);
    const webUrls = texUrls.filter((u) => /^https?:\/\//i.test(u));
    const validUrls = webUrls.filter((u) => isPlausibleUrl(u));
    const linksOk = webUrls.length > 0 && validUrls.length === webUrls.length;
    checks.push(
      buildCheck(
        'PROFILE_LINKS_PRESENT',
        linksOk,
        linksOk
          ? `${validUrls.length} valid web link(s) rendered (${validUrls.length === webUrls.length ? 'no malformed or placeholder URLs' : 'some invalid'})`
          : 'No valid web profile links rendered in document'
      )
    );

    // 4. Section detection
    const { found: sectionsFound, order } = detectSections(lines);
    const sectionTypeOf = (type) => sectionsFound.find((s) => s.type === type);
    const has = (type) => Boolean(sectionTypeOf(type));

    checks.push(
      buildCheck(
        'SECTION_SUMMARY',
        has('SUMMARY'),
        has('SUMMARY') ? 'Professional Summary heading detected' : 'Professional Summary heading not detected'
      )
    );
    checks.push(
      buildCheck(
        'SECTION_SKILLS',
        has('SKILLS'),
        has('SKILLS') ? 'Technical Skills heading detected' : 'Technical Skills heading not detected'
      )
    );
    checks.push(
      buildCheck(
        'SECTION_PROJECTS',
        has('PROJECTS'),
        has('PROJECTS') ? 'Technical Projects heading detected' : 'Technical Projects heading not detected'
      )
    );
    // Experience: a rendered Professional Experience section OR an explicit
    // truthful omission (no stored records) both keep the document parseable;
    // the check records which case applied.
    const experienceRecords =
      structuredResume?.experience ||
      candidateProfile?.experience ||
      candidateProfile?.profileMetadata?.experience ||
      candidateProfile?.candidate?.profileMetadata?.userCustom?.experience ||
      [];
    const educationRecords =
      structuredResume?.education ||
      candidateProfile?.education ||
      candidateProfile?.profileMetadata?.education ||
      candidateProfile?.candidate?.profileMetadata?.userCustom?.education ||
      [];
    const experienceRendered = has('EXPERIENCE');
    const experienceOmitted = !experienceRendered && experienceRecords.length === 0;
    checks.push(
      buildCheck(
        'SECTION_EXPERIENCE',
        experienceRendered || experienceOmitted,
        experienceRendered
          ? 'Professional Experience heading detected'
          : experienceOmitted
            ? 'Experience section truthfully omitted (no stored experience records)'
            : 'Experience records exist but no Experience heading detected'
      )
    );
    const educationRendered = has('EDUCATION');
    const educationOmitted = !educationRendered && educationRecords.length === 0;
    checks.push(
      buildCheck(
        'SECTION_EDUCATION',
        educationRendered || educationOmitted,
        educationRendered
          ? 'Education heading detected'
          : educationOmitted
            ? 'Education section truthfully omitted (no stored education records)'
            : 'Education records exist but no Education heading detected'
      )
    );

    // 5. SECTION_ORDER_VALID
    const packageOrder =
      pkg.structuredResume?.sectionOrder ||
      pkg.tailoringPlan?.sectionOrder ||
      pkg.tailoredResume?.sectionOrder ||
      null;
    const orderOk = isSectionOrderValid(order, packageOrder);
    checks.push(
      buildCheck(
        'SECTION_ORDER_VALID',
        orderOk,
        orderOk
          ? `Section order valid: ${order.join(' → ') || 'single-section document'}`
          : `Section order invalid or interleaved: ${order.join(' → ')}`
      )
    );

    // 6. Count consistency checks against the package contract
    const selectedProjects =
      structuredResume?.projects ||
      pkg.tailoredResume?.selectedProjects ||
      pkg.selectedProjects ||
      [];
    const _projectHeadingCount = (lowerText.match(/\bprojects?\b/g) || []).length; // not used for counting; headings only
    const renderedProjectNames = selectedProjects.map(
      (p) => String(p.name || p.projectName || p.title || '')
    );
    const projectsInText = renderedProjectNames.filter(
      (n) => n && textContains(lowerText, n)
    );
    const projectCountOk =
      selectedProjects.length === 0 ||
      (projectsInText.length === selectedProjects.length && has('PROJECTS'));
    checks.push(
      buildCheck(
        'PROJECT_COUNT_MATCH',
        projectCountOk,
        projectCountOk
          ? `${projectsInText.length}/${selectedProjects.length} packaged project(s) rendered and detected`
          : `Project count mismatch: package declares ${selectedProjects.length}, detected ${projectsInText.length} in PDF text`
      )
    );

    const experienceNames = experienceRecords.map((e) =>
      String(e.company || e.employer || e.title || '')
    );
    const experienceInText = experienceNames.filter((n) => n && textContains(lowerText, n));
    const experienceCountOk =
      experienceRecords.length === 0 ||
      (experienceInText.length === experienceRecords.length && (experienceRendered || experienceOmitted));
    checks.push(
      buildCheck(
        'EXPERIENCE_COUNT_MATCH',
        experienceCountOk,
        experienceCountOk
          ? `${experienceInText.length}/${experienceRecords.length} stored experience record(s) rendered`
          : `Experience count mismatch: ${experienceRecords.length} stored, ${experienceInText.length} detected`
      )
    );

    const educationNames = educationRecords.map((e) =>
      String(e.institution || e.degree || '')
    );
    const educationInText = educationNames.filter((n) => n && textContains(lowerText, n));
    const educationCountOk =
      educationRecords.length === 0 ||
      (educationInText.length === educationRecords.length && (educationRendered || educationOmitted));
    checks.push(
      buildCheck(
        'EDUCATION_COUNT_MATCH',
        educationCountOk,
        educationCountOk
          ? `${educationInText.length}/${educationRecords.length} stored education record(s) rendered`
          : `Education count mismatch: ${educationRecords.length} stored, ${educationInText.length} detected`
      )
    );

    // 7. HYPERLINKS_VALID
    const mailtos = texUrls.filter((u) => /^mailto:/i.test(u));
    const malformed = texUrls.filter((u) => !isPlausibleUrl(u));
    const hyperlinksOk = texUrls.length > 0 ? malformed.length === 0 : webUrls.length === 0;
    checks.push(
      buildCheck(
        'HYPERLINKS_VALID',
        hyperlinksOk,
        hyperlinksOk
          ? `${webUrls.length} web link(s) + ${mailtos.length} mailto link(s), all structurally valid`
          : `Malformed or placeholder URLs detected: ${malformed.join(', ')}`
      )
    );

    // 8. SINGLE_COLUMN_LAYOUT (structural: LaTeX source must not introduce
    // multicols or tabular layout for the resume body)
    const usesMultiColumn = /\\begin\{multicols\}|\\begin\{tabular\}|\\begin{table\*?\}/i.test(tex);
    checks.push(
      buildCheck(
        'SINGLE_COLUMN_LAYOUT',
        !usesMultiColumn,
        usesMultiColumn
          ? 'Layout tables or multi-column environments detected in LaTeX source'
          : 'Single-column layout confirmed (no multicols/tabular environments)'
      )
    );

    // 9. STANDARD_BULLETS (itemize environments with conventional rendering)
    const bulletEnvCount = (tex.match(/\\begin\{itemize\}/g) || []).length;
    const bulletsOk = bulletEnvCount === 0 || /\\item /.test(tex);
    checks.push(
      buildCheck(
        'STANDARD_BULLETS',
        bulletsOk,
        bulletsOk
          ? `Conventional \\item bullets across ${bulletEnvCount} list environment(s)`
          : 'No conventional bullet structure detected'
      )
    );

    // Deterministic scoring: sum of earned weights / total weight (100)
    const earned = checks.reduce((sum, c) => sum + (c.passed ? c.weight : 0), 0);
    const score = Math.round((earned / CHECK_WEIGHT_TOTAL) * 100);

    return {
      score,
      version: ASSESSMENT_VERSION,
      passed: score >= 85 && checks.every((c) => c.passed || c.weight <= 4),
      maxScore: 100,
      checks,
      metrics,
      auditedAt: analyzedAt || new Date().toISOString(),
    };
  }

  /**
   * Computes the job-specific Evidence-Backed Coverage assessment: which
   * relevant job requirements are represented in the generated resume, and with
   * what provenance strength. Scoring: EVIDENCE_BACKED = full credit (1.0),
   * CLAIMED = partial credit (0.4), MISSING = zero credit.
   *
   * @param {object} params
   * @param {object} params.applicationPackage Canonical application package
   * @param {object} [params.candidateProfile] Candidate profile (for self-declared skills)
   * @param {string} [params.analyzedAt] ISO timestamp (inject for determinism)
   * @returns {{ score: number, version: string, requirements: Array<object>, summary: object, auditedAt: string }}
   */
  assessEvidenceBackedCoverage({ applicationPackage, candidateProfile = null, analyzedAt = null }) {
    const pkg = applicationPackage || {};
    const targetJob = pkg.targetJob || {};

    // Collect job requirements from the structured posting when available.
    const requirementEntries = [];
    const seen = new Set();
    const pushRequirement = (name, importance) => {
      const label = String(name || '').trim();
      if (!label) return;
      const key = skillToken(label);
      if (!key || seen.has(key)) return;
      seen.add(key);
      requirementEntries.push({ label, token: key, importance: importance || 'REQUIRED' });
    };
    for (const req of targetJob.requirements || []) {
      if (typeof req === 'string') pushRequirement(req, 'REQUIRED');
      else if (req?.title) pushRequirement(req.title, req.importance);
    }
    for (const skill of targetJob.skills || []) {
      if (typeof skill === 'string') pushRequirement(skill, 'REQUIRED');
      else if (skill?.name) pushRequirement(skill.name, skill.importance);
    }

    // If no structured requirements exist, fall back to the curated skill
    // categories actually rendered in the resume so coverage remains measurable.
    if (requirementEntries.length === 0) {
      const categorized = pkg.tailoredResume?.categorizedSkills || {};
      for (const list of Object.values(categorized)) {
        for (const s of Array.isArray(list) ? list : []) pushRequirement(s, 'REQUIRED');
      }
    }

    // Evidence pools from the package's own truth partition (never mutated here)
    const verifiedSkills = (pkg.verifiedSkills || []).map((s) => ({
      name: typeof s === 'string' ? s : s.name,
      truthCategory: typeof s === 'string' ? 'CLAIMED' : s.truthCategory,
    }));
    const claimedSkills = (pkg.claimedSkills || []).map((s) => ({
      name: typeof s === 'string' ? s : s.name,
      truthCategory: typeof s === 'string' ? 'CLAIMED' : s.truthCategory,
    }));
    const selectedProjects = pkg.tailoredResume?.selectedProjects || pkg.selectedProjects || [];

    const verifiedTokens = new Map();
    for (const s of verifiedSkills) {
      verifiedTokens.set(skillToken(s.name), provenanceToStatus(s.truthCategory));
    }
    const claimedTokens = new Map();
    for (const s of claimedSkills) {
      const status = provenanceToStatus(s.truthCategory);
      if (!verifiedTokens.has(skillToken(s.name))) {
        claimedTokens.set(skillToken(s.name), status);
      }
    }
    // Candidate-provided additional skills (self-declared) count as CLAIMED
    const additionalSkills = candidateProfile?.additionalSkills || [];
    for (const s of Array.isArray(additionalSkills) ? additionalSkills : []) {
      const name = typeof s === 'string' ? s : s.name;
      const key = skillToken(name);
      if (key && !verifiedTokens.has(key) && !claimedTokens.has(key)) {
        claimedTokens.set(key, 'CLAIMED');
      }
    }

    // Project technologies are evidence-aware: technologies of projects that
    // carry repository/verification evidence count as EVIDENCE_BACKED.
    const projectTechTokens = new Map();
    for (const p of selectedProjects) {
      const techs = Array.isArray(p.technologies) ? p.technologies : [];
      const hasEvidence = Boolean(
        p.repositoryUrl || p.evidenceCount > 0 || p.provenanceStatus === 'CORROBORATED' || p.provenanceStatus === 'VERIFIED'
      );
      for (const t of techs) {
        const key = skillToken(t);
        if (!key) continue;
        const status = hasEvidence ? 'EVIDENCE_BACKED' : 'CLAIMED';
        const existing = projectTechTokens.get(key);
        if (existing !== 'EVIDENCE_BACKED') projectTechTokens.set(key, status);
      }
    }

    const requirements = requirementEntries.map((req) => {
      const statuses = [];
      const evidence = [];

      if (verifiedTokens.has(req.token)) {
        statuses.push(verifiedTokens.get(req.token));
        evidence.push({ source: 'SKILL_EVIDENCE', provenance: verifiedTokens.get(req.token), detail: `Stored verified skill: ${req.label}` });
      }
      if (claimedTokens.has(req.token)) {
        statuses.push(claimedTokens.get(req.token));
        evidence.push({ source: 'SKILL_CLAIM', provenance: 'CLAIMED', detail: `Candidate-claimed skill: ${req.label}` });
      }
      if (projectTechTokens.has(req.token)) {
        statuses.push(projectTechTokens.get(req.token));
        evidence.push({
          source: 'PROJECT_TECHNOLOGY',
          provenance: projectTechTokens.get(req.token),
          detail: `Rendered in evidence-backed project technology stack: ${req.label}`,
        });
      }

      const status = aggregateStatus(statuses);
      return {
        requirement: req.label,
        importance: req.importance,
        status,
        evidence,
      };
    });

    // Weighted scoring: EVIDENCE_BACKED = 1.0, CLAIMED = 0.4, MISSING = 0.
    // PREFERRED/OPTIONAL requirements count at half weight so required skills
    // dominate the metric honestly.
    const STATUS_CREDIT = { EVIDENCE_BACKED: 1.0, CLAIMED: 0.4, MISSING: 0.0 };
    let totalWeight = 0;
    let earnedWeight = 0;
    for (const r of requirements) {
      const weight = r.importance === 'REQUIRED' ? 1.0 : 0.5;
      totalWeight += weight;
      earnedWeight += weight * (STATUS_CREDIT[r.status] ?? 0);
    }
    const score =
      totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

    const summary = {
      total: requirements.length,
      evidenceBacked: requirements.filter((r) => r.status === 'EVIDENCE_BACKED').length,
      claimed: requirements.filter((r) => r.status === 'CLAIMED').length,
      missing: requirements.filter((r) => r.status === 'MISSING').length,
    };

    return {
      score,
      version: ASSESSMENT_VERSION,
      requirements,
      summary,
      auditedAt: analyzedAt || new Date().toISOString(),
    };
  }

  /**
   * Builds the complete RESUME QUALITY assessment payload for a Hand-off Kit.
   * Job Match is a strict passthrough of the existing evidence-aware fit result:
   * this service NEVER recomputes, adjusts, or inflates it.
   *
   * @param {object} params
   * @param {object} params.atsParseability Result of assessAtsParseability()
   * @param {object} params.evidenceCoverage Result of assessEvidenceBackedCoverage()
   * @param {object} [params.jobFit] Existing analyze_job_fit result (overallFit.atsScore)
   * @param {number} [params.tailoredResumeFitScore] Legacy package fitScore fallback
   * @returns {object} resumeQuality payload for the handoff kit
   */
  buildResumeQuality({ atsParseability, evidenceCoverage, jobFit = null, tailoredResumeFitScore: _tailoredResumeFitScore = null }) {
    const jobMatchScore =
      jobFit && typeof jobFit.overallFit?.atsScore === 'number'
        ? jobFit.overallFit.atsScore
        : null;

    return {
      atsParseability: {
        score: atsParseability.score,
        version: atsParseability.version,
        passed: atsParseability.passed,
        maxScore: atsParseability.maxScore,
        checks: atsParseability.checks,
        metrics: atsParseability.metrics,
        auditedAt: atsParseability.auditedAt,
        disclaimer:
          'Measures whether this system can reliably parse the generated resume. Not an employer ATS score; no universal ATS score exists.',
      },
      jobMatch: {
        score: jobMatchScore,
        source: jobFit ? 'analyze_job_fit' : 'unavailable',
        fitBand: jobFit?.overallFit?.fitBand || null,
        note: jobFit
          ? 'Candidate/job alignment from the existing evidence-aware fit engine (analyze_job_fit). Independent of resume formatting quality.'
          : 'No analyze_job_fit assessment available for this application.',
      },
      evidenceBackedCoverage: {
        score: evidenceCoverage.score,
        version: evidenceCoverage.version,
        summary: evidenceCoverage.summary,
        requirements: evidenceCoverage.requirements,
        auditedAt: evidenceCoverage.auditedAt,
        scoringModel:
          'EVIDENCE_BACKED = full credit, CLAIMED (candidate-provided/self-declared) = partial credit (0.4), MISSING = zero credit.',
      },
    };
  }

  /**
   * Convenience: runs both assessments and assembles the full resumeQuality payload.
   *
   * @param {object} params
   * @param {string} params.extractedText Text extracted from the compiled resume PDF
   * @param {string} params.texContent LaTeX source of the resume
   * @param {object} params.applicationPackage Canonical application package
   * @param {object} [params.candidateProfile] Candidate profile
   * @param {object} [params.jobFit] Existing analyze_job_fit result
   * @param {string} [params.analyzedAt] ISO timestamp (inject for determinism)
   * @returns {object} Full resumeQuality payload
   */
  assessResumeQuality({
    extractedText,
    texContent,
    applicationPackage,
    candidateProfile = null,
    jobFit = null,
    analyzedAt = null,
  }) {
    const atsParseability = this.assessAtsParseability({
      extractedText,
      texContent,
      applicationPackage,
      candidateProfile,
      analyzedAt,
    });
    const evidenceCoverage = this.assessEvidenceBackedCoverage({
      applicationPackage,
      candidateProfile,
      analyzedAt,
    });
    return this.buildResumeQuality({
      atsParseability,
      evidenceCoverage,
      jobFit,
      tailoredResumeFitScore: applicationPackage?.tailoredResume?.fitScore ?? null,
    });
  }
}
