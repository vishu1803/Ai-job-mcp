/**
 * @file Pre-Render Document Quality Gate (Phase 12)
 *
 * Generic, content-only quality assessment executed BEFORE LaTeX rendering.
 * It operates exclusively on the canonical StructuredResumeDocument snapshot and
 * (optionally) the layout engine's page budget. It contains NO candidate-specific,
 * project-specific, job-specific, or site-specific logic: every check is a
 * structural invariant over document shape and evidence density.
 *
 * Detected defects (Phase 12 spec):
 * 1. Too few project bullets while the page budget allows more (remediable:
 *    backfill from the candidate-owned bullet pool).
 * 2. Weak/generic optional sections that should have been omitted (DSA without
 *    substantive candidate-owned evidence).
 * 3. Contradictory role positioning (headline/summary stack qualifier vs the
 *    target role's classified focus, using the shared generic role-focus
 *    taxonomy — never hardcoded employer titles).
 * 4. Sparse content when strong evidence exists (remediable: backfill first —
 *    never solve sparse pages with excessive whitespace).
 * 5. Duplicate skills across categories.
 * 6. Low-information bullets (below minimal informative length).
 *
 * Fail-closed posture: if no truthful content is available the document may
 * remain sparse; the gate reports findings but never suggests fabricated
 * content. `passed` is false only for hard (FAIL-severity) defects.
 */

export const GATE_SEVERITY = Object.freeze({
  OK: 'OK',
  WARN: 'WARN',
  FAIL: 'FAIL',
});

export const GATE_FINDING_CODES = Object.freeze({
  TOO_FEW_PROJECT_BULLETS: 'TOO_FEW_PROJECT_BULLETS',
  WEAK_OPTIONAL_SECTION: 'WEAK_OPTIONAL_SECTION',
  CONTRADICTORY_ROLE_POSITIONING: 'CONTRADICTORY_ROLE_POSITIONING',
  SPARSE_WITH_AVAILABLE_EVIDENCE: 'SPARSE_WITH_AVAILABLE_EVIDENCE',
  DUPLICATE_SKILLS: 'DUPLICATE_SKILLS',
  LOW_INFORMATION_BULLET: 'LOW_INFORMATION_BULLET',
});

/** Minimum informative length (chars) for a rendered bullet. */
const MIN_BULLET_LENGTH = 25;

/** Minimum substantive length (chars) for an optional-section (DSA) bullet. */
const MIN_OPTIONAL_BULLET_LENGTH = 30;

/** A selected project should carry at least this many bullets when available. */
const MIN_BULLETS_PER_PROJECT = 2;

/** Page-budget utilization below which the document is considered sparse. */
const SPARSE_UTILIZATION_THRESHOLD = 0.55;

/**
 * Shared generic role-focus classifier (single-source taxonomy rule over role
 * text). This is a generic normalization/taxonomy rule — the same one used by
 * summary synthesis — NOT a literal identity match. Returns one of
 * 'backend' | 'frontend' | 'fullstack' | 'ai-ml' | 'data' | 'general'.
 *
 * @param {string} text
 * @returns {string}
 */
export function classifyRoleFocus(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return 'general';
  const has = (...tokens) => tokens.some((k) => t.includes(k));
  const aiMl = has('machine learning', 'ml engineer', 'deep learning', 'nlp', 'computer vision', 'ai engineer', 'mlops', 'data scientist');
  const data = has('data engineer', 'analytics engineer', 'bi engineer', 'data platform', 'database engineer');
  const backend = has('backend', 'back-end', 'server-side', 'systems engineer', 'infrastructure', 'distributed systems', 'platform engineer', 'api engineer');
  const frontend = has('frontend', 'front-end', 'client-side', 'ui engineer', 'web engineer', 'react', 'ui/ux engineer');
  const fullstack = has('full-stack', 'fullstack', 'full stack');
  if (fullstack && !backend && !frontend) return 'fullstack';
  if (aiMl) return 'ai-ml';
  if (data && !backend && !frontend && !fullstack) return 'data';
  if (backend && frontend) return 'fullstack';
  if (backend) return 'backend';
  if (frontend) return 'frontend';
  if (fullstack) return 'fullstack';
  return 'general';
}

/** Focus qualifiers that contradict each other when mixed across identity vs role. */
const OPPOSING_FOCUS = Object.freeze({
  backend: 'frontend',
  frontend: 'backend',
});

/**
 * Extracts stack-qualifier tokens ("backend", "frontend", ...) present in a
 * text, using the generic taxonomy classifier over segments of the text.
 *
 * @private
 * @param {string} text
 * @returns {Set<string>} focus values found
 */
function extractFocusTokens(text) {
  const found = new Set();
  if (!text) return found;
  const segments = String(text).split(/[,/&|]| and | full-stack | fullstack /i).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const focus = classifyRoleFocus(seg);
    if (focus !== 'general') found.add(focus);
  }
  return found;
}

/**
 * Normalizes a skill display string to a comparable key (case/punctuation
 * insensitive, alias-collapsed at the separator level only).
 *
 * @private
 * @param {string} s
 * @returns {string}
 */
function skillKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\.[a-z]+$/i, '') // strip e.g. "js." trailing punctuation only
    .replace(/[^a-z0-9+#.]/g, '')
    .trim();
}

/**
 * Assesses the canonical structured resume snapshot for pre-render content
 * quality. Fully generic: all findings derive from document structure.
 *
 * @param {object} params
 * @param {object} params.structuredResume Canonical StructuredResumeDocument snapshot
 * @param {object} [params.pageBudget] Layout-engine PageBudget (utilizationRatio, pageStrategy)
 * @param {object} [params.targetRole] Target role title text (used only via the generic taxonomy)
 * @returns {{ passed: boolean, severity: string, findings: Array<object>, metrics: object }}
 */
export function assessPreRenderQuality({ structuredResume, pageBudget = null, targetRole = null }) {
  const findings = [];
  const doc = structuredResume || {};

  const projects = Array.isArray(doc.projects) ? doc.projects : [];
  const experience = Array.isArray(doc.experience) ? doc.experience : [];

  // ── Check 1: Too few project bullets when more are available ──
  let backfillAvailableCount = 0;
  for (const p of projects) {
    const bullets = (Array.isArray(p.bullets) ? p.bullets : [])
      .map((b) => (typeof b === 'string' ? b : b?.text || '').trim())
      .filter(Boolean);
    if (bullets.length > 0 && bullets.length < MIN_BULLETS_PER_PROJECT) {
      // Remediable only when the snapshot itself carries no additional bullets
      // (the dynamic budget already exhausted the candidate-owned pool).
      backfillAvailableCount += 1;
      findings.push({
        code: GATE_FINDING_CODES.TOO_FEW_PROJECT_BULLETS,
        severity: GATE_SEVERITY.WARN,
        remediable: false,
        message: `Selected project '${p.displayName || p.name || 'unnamed'}' renders with ${bullets.length} bullet(s); page budget may allow ${MIN_BULLETS_PER_PROJECT}.`,
      });
    }
  }

  // ── Check 2: Weak/generic optional sections (DSA without real evidence) ──
  const dsa = doc.dsa;
  if (dsa && dsa.hasSection) {
    const dsaBullets = (Array.isArray(dsa.bullets) ? dsa.bullets : [])
      .map((b) => String(b || '').trim())
      .filter(Boolean);
    const hasSubstantive = dsaBullets.some((b) => b.length >= MIN_OPTIONAL_BULLET_LENGTH);
    const hasUrl = Boolean(dsa.profileUrl && typeof dsa.profileUrl === 'string' && dsa.profileUrl.startsWith('http'));
    if (!hasSubstantive && !hasUrl) {
      findings.push({
        code: GATE_FINDING_CODES.WEAK_OPTIONAL_SECTION,
        severity: GATE_SEVERITY.FAIL,
        remediable: true,
        suggestion: 'OMIT_SECTION',
        message: 'Optional problem-solving section is present but carries no substantive candidate-owned evidence; omit it instead of rendering boilerplate.',
      });
    }
  }

  // ── Check 3: Contradictory role positioning (generic taxonomy only) ──
  const headline = doc.candidateIdentity?.headline || doc.targetRole || '';
  const summaryText = doc.summary?.text || '';
  const roleFocus = classifyRoleFocus(targetRole || doc.targetRole || '');
  if (roleFocus === 'backend' || roleFocus === 'frontend') {
    const opposing = OPPOSING_FOCUS[roleFocus];
    const identityFocus = extractFocusTokens(headline);
    if (identityFocus.has(opposing)) {
      findings.push({
        code: GATE_FINDING_CODES.CONTRADICTORY_ROLE_POSITIONING,
        severity: GATE_SEVERITY.WARN,
        remediable: true,
        message: `Canonical headline carries a '${opposing}' stack qualifier while the target role classifies as '${roleFocus}' — align the headline via the generic role taxonomy.`,
      });
    }
  }
  // Summary must not contradict the headline focus.
  const summaryFocus = extractFocusTokens(summaryText);
  const headlineFocus = extractFocusTokens(headline);
  for (const [a, b] of Object.entries(OPPOSING_FOCUS)) {
    if (headlineFocus.has(a) && summaryFocus.has(b) && !summaryFocus.has(a)) {
      findings.push({
        code: GATE_FINDING_CODES.CONTRADICTORY_ROLE_POSITIONING,
        severity: GATE_SEVERITY.WARN,
        remediable: true,
        message: `Summary positions the candidate as '${b}' while the headline is '${a}' — resolve contradictory positioning.`,
      });
      break;
    }
  }

  // ── Check 4: Sparse content with unused page capacity ──
  const utilization = Number(pageBudget?.utilizationRatio);
  const hasEvidenceBackedContent = projects.some((p) =>
    (Array.isArray(p.evidenceRefs) && p.evidenceRefs.length > 0) ||
    (Array.isArray(p.bullets) && p.bullets.length > 0)
  );
  if (
    Number.isFinite(utilization) &&
    utilization < SPARSE_UTILIZATION_THRESHOLD &&
    hasEvidenceBackedContent
  ) {
    findings.push({
      code: GATE_FINDING_CODES.SPARSE_WITH_AVAILABLE_EVIDENCE,
      severity: GATE_SEVERITY.WARN,
      remediable: true,
      suggestion: 'BACKFILL_EVIDENCE_BACKED_CONTENT',
      message: `Document occupies ~${Math.round(utilization * 100)}% of the page budget while evidence-backed content exists; backfill stronger relevant content before rendering (never pad with whitespace or boilerplate).`,
    });
  }

  // ── Check 5: Duplicate skills across categories ──
  const skillCategories = Array.isArray(doc.skills?.categories) ? doc.skills.categories : [];
  const seenSkills = new Map();
  const duplicates = [];
  for (const cat of skillCategories) {
    const items = Array.isArray(cat?.skills) ? cat.skills : [];
    for (const item of items) {
      const display = typeof item === 'string' ? item : item?.displayName || item?.name || '';
      const key = skillKey(display);
      if (!key) continue;
      if (seenSkills.has(key)) {
        duplicates.push({ skill: display, categories: [seenSkills.get(key), cat.categoryName || cat.name || ''] });
      } else {
        seenSkills.set(key, cat.categoryName || cat.name || '');
      }
    }
  }
  if (duplicates.length > 0) {
    findings.push({
      code: GATE_FINDING_CODES.DUPLICATE_SKILLS,
      severity: GATE_SEVERITY.WARN,
      remediable: true,
      suggestion: 'DEDUPE_SKILLS',
      duplicates,
      message: `${duplicates.length} duplicate skill entr(ies) across categories (e.g. '${duplicates[0].skill}'); deduplicate before rendering.`,
    });
  }

  // ── Check 6: Low-information bullets ──
  const lowInfoBullets = [];
  for (const p of projects) {
    for (const b of Array.isArray(p.bullets) ? p.bullets : []) {
      const t = (typeof b === 'string' ? b : b?.text || '').trim();
      if (t && t.length < MIN_BULLET_LENGTH) lowInfoBullets.push({ section: 'projects', text: t });
    }
  }
  for (const e of experience) {
    for (const b of Array.isArray(e.bullets) ? e.bullets : []) {
      const t = (typeof b === 'string' ? b : b?.text || '').trim();
      if (t && t.length < MIN_BULLET_LENGTH) lowInfoBullets.push({ section: 'experience', text: t });
    }
  }
  if (lowInfoBullets.length > 0) {
    findings.push({
      code: GATE_FINDING_CODES.LOW_INFORMATION_BULLET,
      severity: GATE_SEVERITY.WARN,
      remediable: false,
      count: lowInfoBullets.length,
      message: `${lowInfoBullets.length} bullet(s) fall below the minimum informative length (${MIN_BULLET_LENGTH} chars); prefer merging with richer bullets or omitting over thin content.`,
    });
  }

  const hasFail = findings.some((f) => f.severity === GATE_SEVERITY.FAIL);
  const hasWarn = findings.some((f) => f.severity === GATE_SEVERITY.WARN);
  const severity = hasFail ? GATE_SEVERITY.FAIL : hasWarn ? GATE_SEVERITY.WARN : GATE_SEVERITY.OK;

  return {
    passed: !hasFail,
    severity,
    findings,
    metrics: {
      projectCount: projects.length,
      projectBulletTotal: projects.reduce((n, p) => n + (Array.isArray(p.bullets) ? p.bullets.length : 0), 0),
      experienceCount: experience.length,
      experienceBulletTotal: experience.reduce((n, e) => n + (Array.isArray(e.bullets) ? e.bullets.length : 0), 0),
      pageUtilization: Number.isFinite(utilization) ? utilization : null,
      roleFocus,
    },
    assessedAt: new Date().toISOString(),
  };
}
