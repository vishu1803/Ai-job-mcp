/**
 * @file Deterministic professional resume composition layer (P16-001G).
 *
 * This service improves recruiter-facing phrasing and section integrity without
 * changing candidate-owned facts, job-analysis authority, project ranking, skill
 * ranking, provenance, package identity, or rendering contracts.
 *
 * Hard invariants:
 * - Never deletes, truncates, reorders, or synthesizes candidate-owned Experience,
 *   Education, or DSA records/content.
 * - Never creates metrics, tenure, employers, technologies, or achievements.
 * - Only applies deterministic wording compression that preserves meaning.
 * - Preserves all structured arrays and evidence/provenance metadata.
 */

const SAFE_PHRASE_REPLACEMENTS = Object.freeze([
  [ /\bdesigned and implemented\b/gi, 'built' ],
  [ /\bdesigned and developed\b/gi, 'built' ],
  [ /\bdeveloped and implemented\b/gi, 'built' ],
  [ /\bimplemented and developed\b/gi, 'built' ],
  [ /\bin order to\b/gi, 'to' ],
  [ /\bwith the use of\b/gi, 'using' ],
  [ /\butilizing\b/gi, 'using' ],
  [ /\bin addition to\b/gi, 'and' ],
  [ /\ba total of\b/gi, '' ],
  [ /\bfor the purpose of\b/gi, 'to' ],
  [ /\bwith a commitment to\b/gi, 'focused on' ],
  [ /\bdemonstrated practical execution in\b/gi, 'Hands-on work in' ],
  [ /\bdemonstrated practical delivery in\b/gi, 'Hands-on delivery in' ],
  [ /\balongside evidence-backed database and modular service implementation\b/gi, 'across database and modular service development' ],
]);

const WEAK_SUMMARY_ENDINGS = Object.freeze([
  [ /\bFocused on delivering reliable, maintainable code aligned with modern engineering standards\.?$/i, 'Focused on reliable, maintainable software delivery.' ],
  [ /\bCommitted to architecting accessible, performant user interfaces with verified component architecture\.?$/i, 'Focused on accessible, performant user interfaces.' ],
]);

function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013]/g, '-')
    .replace(/[\u2014]/g, '--')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Applies only deterministic, meaning-preserving wording compression.
 * It never hard-truncates text and never removes a factual clause.
 */
export function compressProfessionalBullet(text) {
  if (!text || typeof text !== 'string') return text;
  let result = normalizeWhitespace(text);
  for (const [pattern, replacement] of SAFE_PHRASE_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return normalizeWhitespace(result);
}

/**
 * Polishes the generated summary while keeping the exact factual inputs intact.
 * No new technical claims or numbers are introduced here.
 */
export function polishProfessionalSummary(text) {
  if (!text || typeof text !== 'string') return text;
  let result = compressProfessionalBullet(text);
  for (const [pattern, replacement] of WEAK_SUMMARY_ENDINGS) {
    result = result.replace(pattern, replacement);
  }
  return normalizeWhitespace(result);
}

function hasRenderableSection(sectionKey, doc) {
  switch (sectionKey) {
    case 'SUMMARY':
      return Boolean(doc.summary?.text);
    case 'SKILLS':
      return Boolean(doc.skills?.categories?.some((c) => c?.skills?.length));
    case 'PROJECTS':
      return Array.isArray(doc.projects) && doc.projects.length > 0;
    case 'DSA':
      return Boolean(doc.dsa?.hasSection || doc.dsa?.bullets?.length || doc.dsa?.profileUrl);
    case 'EXPERIENCE':
      return Array.isArray(doc.experience) && doc.experience.length > 0;
    case 'EDUCATION':
      return Array.isArray(doc.education) && doc.education.length > 0;
    case 'CERTIFICATIONS':
      return Array.isArray(doc.certifications) && doc.certifications.length > 0;
    default:
      return false;
  }
}

/**
 * Ensures user-owned mandatory sections cannot disappear from a structured
 * resume merely because section-order derivation missed an alias.
 * Existing relative order is preserved; missing sections are inserted only
 * when the corresponding data actually exists.
 */
export function ensureCandidateSectionIntegrity(doc) {
  const order = Array.isArray(doc.sectionOrder) ? [...doc.sectionOrder] : [];
  const canonical = order.map((s) => String(s).toUpperCase());

  const ensureAfter = (section, afterSection = null) => {
    if (!hasRenderableSection(section, doc) || canonical.includes(section)) return;
    const insertAt = afterSection && canonical.includes(afterSection)
      ? canonical.indexOf(afterSection) + 1
      : canonical.length;
    canonical.splice(insertAt, 0, section);
  };

  // Candidate-owned essentials must always be representable when present.
  ensureAfter('SUMMARY');
  ensureAfter('SKILLS', 'SUMMARY');
  ensureAfter('PROJECTS', 'SKILLS');
  ensureAfter('DSA', 'PROJECTS');
  ensureAfter('EXPERIENCE', canonical.includes('PROJECTS') ? 'DSA' : 'SKILLS');
  ensureAfter('EDUCATION', canonical.includes('EXPERIENCE') ? 'EXPERIENCE' : 'DSA');
  ensureAfter('CERTIFICATIONS', 'EDUCATION');

  const result = { ...doc, sectionOrder: canonical };
  if (result.tailoringPlan && typeof result.tailoringPlan === 'object') {
    result.tailoringPlan = {
      ...result.tailoringPlan,
      sectionOrder: [...canonical],
    };
  }
  return result;
}

/**
 * Composes the structured resume for recruiter readability.
 *
 * Important: Experience, Education and DSA are intentionally copied without
 * content filtering or bullet-count changes. Projects are also not reduced here;
 * any project-budget decision remains with the existing authoritative pipeline.
 */
export function composeStructuredResumeDocument(document) {
  if (!document || typeof document !== 'object') return document;

  const composed = JSON.parse(JSON.stringify(document));

  if (composed.summary?.text) {
    composed.summary = {
      ...composed.summary,
      text: polishProfessionalSummary(composed.summary.text),
    };
  }

  if (Array.isArray(composed.projects)) {
    composed.projects = composed.projects.map((project) => ({
      ...project,
      // Preserve every project bullet and its provenance; only compress safe phrasing.
      bullets: Array.isArray(project.bullets)
        ? project.bullets.map((bullet) => {
            if (typeof bullet === 'string') return compressProfessionalBullet(bullet);
            if (!bullet || typeof bullet !== 'object') return bullet;
            return {
              ...bullet,
              text: compressProfessionalBullet(bullet.text),
            };
          })
        : project.bullets,
    }));
  }

  // Explicitly preserve candidate-owned sections without filtering or truncation.
  if (Array.isArray(document.experience)) composed.experience = JSON.parse(JSON.stringify(document.experience));
  if (Array.isArray(document.education)) composed.education = JSON.parse(JSON.stringify(document.education));
  if (document.dsa && typeof document.dsa === 'object') composed.dsa = JSON.parse(JSON.stringify(document.dsa));
  if (Array.isArray(document.certifications)) composed.certifications = JSON.parse(JSON.stringify(document.certifications));

  return ensureCandidateSectionIntegrity(composed);
}

export default composeStructuredResumeDocument;
