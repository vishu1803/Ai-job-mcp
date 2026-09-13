/**
 * @file Unified Semantic Job Normalization Service (P22)
 *
 * Establishes exactly ONE semantic job normalization engine consumed across:
 * - MCP tools (handleGenerateTailoredResume, recommendPortfolioProjects, etc.)
 * - Extension endpoints (/api/extension/prepare-handoff)
 * - Workflow orchestration (JobApplicationWorkflowService.prepareJobApplication)
 * - Candidate fact inventory & evidence graph matching
 * - Structured resume tailoring & LaTeX generation
 *
 * Invariants Enforced:
 * 1. Deterministic Requirement Identity:
 *    Requirement IDs are derived deterministically from canonical semantic content:
 *    `req-${sha256(`${normalizedConcept}:${requirementClass}`).slice(0, 12)}`.
 *    Zero random UUID generation. Zero sequential array-position dependencies.
 * 2. Deterministic Importance Resolution:
 *    - Explicit source importance preserved ('REQUIRED' | 'PREFERRED' | 'OPTIONAL').
 *    - Source context detection ('Requirements:' / 'Must-have' -> 'REQUIRED'; 'Preferred:' / 'Bonus' -> 'PREFERRED').
 *    - Single deterministic canonical default in one location only.
 * 3. Semantic Content Preservation:
 *    Zero dropping of concrete technologies (REST APIs, Docker, GraphQL, etc.).
 * 4. Deterministic Job Fingerprint:
 *    Computed strictly after canonical normalization over deterministically sorted
 *    canonical requirements and role metadata.
 */

import crypto from 'node:crypto';
import { JobDescriptionParser } from '../domain/career/job-parser.js';

export const GENERIC_REQUIREMENT_TOKENS = new Set([
  'software',
  'engineer',
  'engineering',
  'developer',
  'development',
  'systems',
  'system',
  'application',
  'applications',
  'technology',
  'technical',
  'experience',
  'work',
  'working',
]);

export const REQUIREMENT_ALIASES = new Map([
  ['reactjs', 'react'],
  ['react.js', 'react'],
  ['nextjs', 'next.js'],
  ['restful', 'rest api'],
  ['restfulapis', 'rest api'],
  ['restful api', 'rest api'],
  ['restful apis', 'rest api'],
  ['restapi', 'rest api'],
  ['restapis', 'rest api'],
  ['rest apis', 'rest api'],
  ['rest-api', 'rest api'],
  ['rest api', 'rest api'],
  ['httpapi', 'rest api'],
  ['postgres', 'postgresql'],
  ['k8s', 'kubernetes'],
  ['js', 'javascript'],
  ['ts', 'typescript'],
]);

export const REQUIREMENT_CLASS_BY_CATEGORY = Object.freeze({
  SKILL: 'TECHNOLOGY',
  TECHNOLOGY: 'TECHNOLOGY',
  FRAMEWORK: 'TECHNOLOGY',
  DATABASE: 'TECHNOLOGY',
  LANGUAGE: 'TECHNOLOGY',
  TOOL: 'TECHNOLOGY',
  EXPERIENCE: 'RESPONSIBILITY',
  RESPONSIBILITY: 'RESPONSIBILITY',
  DUTY: 'RESPONSIBILITY',
  DOMAIN: 'DOMAIN',
  EDUCATION: 'EDUCATION',
  CERTIFICATION: 'CERTIFICATION',
  LOCATION: 'LOCATION',
  ELIGIBILITY: 'ELIGIBILITY',
});

/**
 * Normalizes any job requirement input into a clean string.
 *
 * @param {any} req
 * @returns {string}
 */
export function normalizeJobRequirementString(req) {
  if (!req) return '';
  if (typeof req === 'string') return req.trim();
  if (typeof req === 'object') {
    return [req.text, req.keyword, req.title, req.name, req.skill, req.concept, req.description]
      .filter((s) => typeof s === 'string' && s.trim().length > 0)
      .join(' ')
      .trim();
  }
  return String(req).trim();
}

/**
 * Normalizes a requirement token using standard aliases and character scrubbing.
 *
 * @param {string} token
 * @returns {string}
 */
export function normalizeRequirementToken(token) {
  const normalized = String(token || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, '');
  return REQUIREMENT_ALIASES.get(normalized) || normalized;
}

/**
 * Classifies a requirement into its canonical class.
 *
 * @param {any} raw
 * @param {string} text
 * @returns {'TECHNOLOGY'|'RESPONSIBILITY'|'DOMAIN'|'EDUCATION'|'CERTIFICATION'|'LOCATION'|'ELIGIBILITY'}
 */
export function classifyRequirement(raw, text, defaultSection = null) {
  if (defaultSection === 'RESPONSIBILITIES') return 'RESPONSIBILITY';
  const category = typeof raw === 'object' ? String(raw.category || raw.type || '').toUpperCase() : '';
  if (REQUIREMENT_CLASS_BY_CATEGORY[category]) return REQUIREMENT_CLASS_BY_CATEGORY[category];
  if (/\b(certif|degree|bachelor|master|phd|education)[a-z]*\b/i.test(text)) return 'EDUCATION';
  if (/\b(lead|mentor|collaborat|communicat|own|design|debug|maintain|build|develop|operat|monitor)[a-z]*\b/i.test(text)) {
    return 'RESPONSIBILITY';
  }
  return 'TECHNOLOGY';
}

/**
 * Resolves requirement importance deterministically.
 *
 * @param {any} raw
 * @param {string} text
 * @param {'REQUIREMENTS'|'PREFERRED'|'RESPONSIBILITIES'|null} [sectionContext=null]
 * @returns {{label: 'REQUIRED'|'PREFERRED'|'OPTIONAL', weight: number}}
 */
export function resolveRequirementImportance(raw, text, sectionContext = null) {
  const explicit = typeof raw === 'object' ? String(raw.importance || raw.priority || '').toUpperCase() : '';
  if (explicit === 'REQUIRED') return { label: 'REQUIRED', weight: 1.0 };
  if (explicit === 'PREFERRED') return { label: 'PREFERRED', weight: 0.7 };
  if (explicit === 'OPTIONAL') return { label: 'OPTIONAL', weight: 0.35 };

  if (sectionContext === 'REQUIREMENTS') return { label: 'REQUIRED', weight: 1.0 };
  if (sectionContext === 'PREFERRED') return { label: 'PREFERRED', weight: 0.7 };

  if (/\b(must|required|requirements?|minimum|essential|need to)\b/i.test(text)) {
    return { label: 'REQUIRED', weight: 1.0 };
  }
  if (/\b(preferred|ideally|nice to have|bonus|plus)\b/i.test(text)) {
    return { label: 'PREFERRED', weight: 0.7 };
  }

  // Canonical default: technical requirements default to REQUIRED
  return { label: 'REQUIRED', weight: 1.0 };
}

/**
 * Generates a stable, deterministic requirement ID based on semantic identity.
 * Independent of array position, random UUIDs, or transport order.
 *
 * @param {object} params
 * @param {string} params.normalizedConcept
 * @param {string} params.requirementClass
 * @returns {string} Deterministic ID
 */
export function createDeterministicRequirementId({ normalizedConcept, requirementClass = 'TECHNOLOGY' }) {
  const normConcept = String(normalizedConcept || '').trim().toLowerCase();
  const normClass = String(requirementClass || 'TECHNOLOGY').trim().toUpperCase();
  const hash = crypto
    .createHash('sha256')
    .update(`${normConcept}:${normClass}`)
    .digest('hex')
    .slice(0, 12);
  return `req-${hash}`;
}

/**
 * Extracts candidate requirement items from raw text sections.
 *
 * @param {string} description
 * @returns {Array<{text: string, importance: 'REQUIRED'|'PREFERRED'|'OPTIONAL', category: string, sectionContext: string}>}
 */
export function parseJobDescriptionSections(description) {
  if (!description || typeof description !== 'string') return [];
  const lines = description.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items = [];
  let currentSection = null;

  const hasSectionHeaders = lines.some((l) =>
    /^(?:requirements?|qualifications?|must[\s-]have|skills?|preferred|nice[\s-]to[\s-]have|bonus|responsibilities|duties):?/i.test(l)
  );
  const hasBullets = lines.some((l) => /^[-*•]\s*/.test(l));

  if (!hasSectionHeaders && !hasBullets) {
    for (const line of lines) {
      const clean = line.replace(/\.$/, '').trim();
      if (clean) {
        items.push({ text: clean, importance: 'REQUIRED', category: 'SKILL', sectionContext: 'REQUIREMENTS' });
      }
    }
    return items;
  }

  for (const line of lines) {
    const inlineReq = line.match(/^(?:requirements?|qualifications?|must[\s-]have|skills?):\s*(.+)$/i);
    const inlinePref = line.match(/^(?:preferred(?:\s+qualifications?)?|nice[\s-]to[\s-]have|bonus):\s*(.+)$/i);
    const inlineResp = line.match(/^(?:responsibilities|duties):\s*(.+)$/i);

    if (inlineReq) {
      const parts = inlineReq[1].split(/[,;]/).map((p) => p.trim().replace(/\.$/, '')).filter(Boolean);
      for (const p of parts) {
        items.push({ text: p, importance: 'REQUIRED', category: 'SKILL', sectionContext: 'REQUIREMENTS' });
      }
      currentSection = 'REQUIREMENTS';
      continue;
    }
    if (inlinePref) {
      const parts = inlinePref[1].split(/[,;]/).map((p) => p.trim().replace(/\.$/, '')).filter(Boolean);
      for (const p of parts) {
        items.push({ text: p, importance: 'PREFERRED', category: 'SKILL', sectionContext: 'PREFERRED' });
      }
      currentSection = 'PREFERRED';
      continue;
    }
    if (inlineResp) {
      const cleanResp = inlineResp[1].trim().replace(/\.$/, '');
      if (cleanResp) {
        items.push({ text: cleanResp, importance: 'REQUIRED', category: 'EXPERIENCE', sectionContext: 'RESPONSIBILITIES' });
      }
      currentSection = 'RESPONSIBILITIES';
      continue;
    }

    if (/^(?:requirements?|qualifications?|must[\s-]have|skills?):?$/i.test(line)) {
      currentSection = 'REQUIREMENTS';
      continue;
    }
    if (/^(?:preferred(?:\s+qualifications?)?|nice[\s-]to[\s-]have|bonus):?$/i.test(line)) {
      currentSection = 'PREFERRED';
      continue;
    }
    if (/^(?:responsibilities|duties):?$/i.test(line)) {
      currentSection = 'RESPONSIBILITIES';
      continue;
    }

    const isBullet = /^[-*•]\s*/.test(line);
    const cleanLine = line.replace(/^[-*•]\s*/, '').replace(/\.$/, '').trim();
    if (!cleanLine) continue;

    if (currentSection === 'REQUIREMENTS') {
      items.push({ text: cleanLine, importance: 'REQUIRED', category: 'SKILL', sectionContext: 'REQUIREMENTS' });
    } else if (currentSection === 'PREFERRED') {
      items.push({ text: cleanLine, importance: 'PREFERRED', category: 'SKILL', sectionContext: 'PREFERRED' });
    } else if (currentSection === 'RESPONSIBILITIES') {
      items.push({ text: cleanLine, importance: 'REQUIRED', category: 'EXPERIENCE', sectionContext: 'RESPONSIBILITIES' });
    } else if (isBullet) {
      items.push({ text: cleanLine, importance: 'REQUIRED', category: 'SKILL', sectionContext: 'REQUIREMENTS' });
    }
  }

  if (items.length === 0) {
    for (const line of lines) {
      const clean = line.replace(/^[-*•]\s*/, '').replace(/\.$/, '').trim();
      if (clean) {
        items.push({ text: clean, importance: 'REQUIRED', category: 'SKILL', sectionContext: 'REQUIREMENTS' });
      }
    }
  }

  return items;
}

/**
 * Derives normalized concept tokens from raw requirement string.
 *
 * @param {string} text
 * @returns {{key: string, uniqueTokens: string[]}}
 */
function extractConceptTokens(text) {
  const clean = String(text || '').trim();
  const lowerClean = clean.toLowerCase();
  // Check direct alias matches (e.g. 'rest apis', 'restful apis')
  if (REQUIREMENT_ALIASES.has(lowerClean)) {
    const alias = REQUIREMENT_ALIASES.get(lowerClean);
    const tokens = alias.split(/\s+/).filter(Boolean);
    return { key: alias, uniqueTokens: tokens };
  }

  const rawTokens = clean
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !GENERIC_REQUIREMENT_TOKENS.has(token))
    .map(normalizeRequirementToken)
    .filter((token) => token && !GENERIC_REQUIREMENT_TOKENS.has(token));

  const uniqueTokens = [...new Set(rawTokens)];
  const key = uniqueTokens.join(' ');
  return { key, uniqueTokens };
}

/**
 * Computes deterministic SHA-256 fingerprint for canonical job requirements.
 *
 * @param {object} role
 * @param {Array<object>} normalizedRequirements
 * @returns {string} SHA-256 hex digest
 */
export function computeCanonicalJobFingerprint(role, normalizedRequirements) {
  const normTitle = String(role?.rawTitle || '').trim().toLowerCase();
  const sortedReqs = [...normalizedRequirements]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => ({
      id: r.id,
      normalizedConcept: r.normalizedConcept,
      class: r.class,
      importance: r.importance,
      weight: r.weight,
    }));
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ title: normTitle, requirements: sortedReqs }))
    .digest('hex');
}

/**
 * Master Job Normalization Function.
 *
 * Takes any job input (MCP structured, MCP raw, Extension payload, direct workflow DTO)
 * and produces the unified CanonicalJobRequirements contract with deterministic IDs,
 * consistent importance classification, content preservation, and deterministic fingerprint.
 *
 * @param {object|null} jobInput
 * @returns {{
 *   jobFingerprint: string,
 *   role: {
 *     rawTitle: string,
 *     normalizedOccupation: string|null,
 *     seniority: string|null,
 *     function: string|null,
 *     specialization: string|null,
 *     domain: string|null
 *   },
 *   normalizedRequirements: Array<{
 *     id: string,
 *     text: string,
 *     normalizedConcept: string,
 *     aliases: string[],
 *     class: string,
 *     importance: 'REQUIRED'|'PREFERRED'|'OPTIONAL',
 *     weight: number,
 *     confidence: number,
 *     source: string
 *   }>
 * }}
 */
export function normalizeJobInput(jobInput) {
  const jp = jobInput || {};

  // If already normalized with canonical contract, return it idempotently
  if (
    typeof jp.jobFingerprint === 'string' &&
    Array.isArray(jp.normalizedRequirements) &&
    jp.normalizedRequirements.length > 0 &&
    jp.role
  ) {
    return {
      jobFingerprint: jp.jobFingerprint,
      role: jp.role,
      normalizedRequirements: jp.normalizedRequirements,
    };
  }

  const rawTitle = String(jp.title || jp.jobTitle || 'Target Role').trim();
  const role = {
    rawTitle,
    normalizedOccupation: jp.normalizedOccupation || null,
    seniority: jp.seniority || null,
    function: jp.function || null,
    specialization: jp.specialization || null,
    domain: jp.domain || null,
  };

  const rawRequirements = Array.isArray(jp.requirements) ? jp.requirements : [];
  const rawSkills = Array.isArray(jp.skills) ? jp.skills : [];
  const rawResponsibilities = Array.isArray(jp.responsibilities) ? jp.responsibilities : [];
  const rawPreferred = Array.isArray(jp.preferredQualifications) ? jp.preferredQualifications : [];

  let itemsToProcess = [];

  const hasExplicitCollections =
    rawRequirements.length > 0 ||
    rawSkills.length > 0 ||
    rawResponsibilities.length > 0 ||
    rawPreferred.length > 0;

  if (hasExplicitCollections) {
    for (const req of rawRequirements) {
      const text = typeof req === 'string' ? req : req?.text || '';
      const foundSkills = text.includes(' ') && text.length > 20 ? JobDescriptionParser.extractSkillsFromLine(text) : [];
      if (foundSkills.length > 1) {
        for (const sk of foundSkills) {
          itemsToProcess.push({
            raw: { text: sk.name, category: 'SKILL', slug: sk.slug },
            defaultSection: 'REQUIREMENTS',
          });
        }
      } else {
        itemsToProcess.push({ raw: req, defaultSection: 'REQUIREMENTS' });
      }
    }
    for (const skill of rawSkills) {
      itemsToProcess.push({ raw: skill, defaultSection: 'REQUIREMENTS' });
    }
    for (const resp of rawResponsibilities) {
      itemsToProcess.push({ raw: resp, defaultSection: 'RESPONSIBILITIES' });
    }
    for (const pref of rawPreferred) {
      itemsToProcess.push({ raw: pref, defaultSection: 'PREFERRED' });
    }
  } else {
    // Extract from description or rawText
    const descText = String(jp.description || jp.jobDescriptionText || jp.rawText || '').trim();
    const extracted = parseJobDescriptionSections(descText);
    for (const item of extracted) {
      const isProse = item.text.includes(' ') && item.text.length > 20;
      const foundSkills = isProse ? JobDescriptionParser.extractSkillsFromLine(item.text) : [];
      if (foundSkills.length > 0) {
        for (const sk of foundSkills) {
          itemsToProcess.push({
            raw: {
              text: sk.name,
              category: 'SKILL',
              slug: sk.slug,
              importance: item.importance || (item.sectionContext === 'PREFERRED' ? 'PREFERRED' : 'REQUIRED'),
            },
            defaultSection: item.sectionContext,
          });
        }
      } else {
        itemsToProcess.push({ raw: item, defaultSection: item.sectionContext });
      }
    }
  }

  const concepts = [];
  const seenConcepts = new Set();

  for (const entry of itemsToProcess) {
    const raw = entry.raw;
    const text = normalizeJobRequirementString(raw);
    if (!text) continue;

    const { key, uniqueTokens } = extractConceptTokens(text);
    if (!key || uniqueTokens.length === 0) continue;

    if (seenConcepts.has(key)) continue;
    seenConcepts.add(key);

    const requirementClass = classifyRequirement(raw, text, entry.defaultSection);
    const importance = resolveRequirementImportance(raw, text, entry.defaultSection);
    const isProvidedIdValid =
      typeof raw === 'object' &&
      raw?.id &&
      typeof raw.id === 'string' &&
      raw.id.trim().length > 0 &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw.id);

    const deterministicId = isProvidedIdValid
      ? raw.id.trim()
      : createDeterministicRequirementId({
          normalizedConcept: key,
          requirementClass,
        });

    concepts.push({
      id: deterministicId,
      text,
      normalizedConcept: key,
      aliases: [...uniqueTokens],
      class: requirementClass,
      importance: importance.label,
      weight: importance.weight,
      confidence: 1.0,
      source: 'JOB_POSTING',
    });
  }

  const fingerprint = computeCanonicalJobFingerprint(role, concepts);

  return {
    jobFingerprint: fingerprint,
    role,
    normalizedRequirements: concepts,
  };
}

/**
 * Returns concept objects formatted for candidate fact inventory and evidence graph.
 *
 * @param {object|null} jobPosting
 * @returns {Array<{id: string, text: string, importance: number, importanceLabel: string, requirementClass: string, normalizedName: string, tokens: Set<string>}>}
 */
export function getJobRequirementConceptsUnified(jobPosting) {
  const normalized = normalizeJobInput(jobPosting);
  return normalized.normalizedRequirements.map((requirement) => ({
    id: requirement.id,
    text: requirement.text,
    importance: requirement.weight,
    importanceLabel: requirement.importance,
    requirementClass: requirement.class,
    normalizedName: requirement.normalizedConcept,
    tokens: new Set([
      ...String(requirement.normalizedConcept || '').split(' ').filter(Boolean),
      ...(Array.isArray(requirement.aliases) ? requirement.aliases : []).map(normalizeRequirementToken),
    ]),
  }));
}

export const buildCanonicalJobRequirements = normalizeJobInput;
export const getJobRequirementConcepts = getJobRequirementConceptsUnified;
