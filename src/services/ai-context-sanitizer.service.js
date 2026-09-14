/**
 * @file Canonical AI Context Sanitizer & Privacy Validator (ARCH-026 / ADR-047 / Part 55)
 *
 * Enforces strict AI privacy boundaries and content grounding:
 * 1. Sanitizes AI context upstream so personal identity information NEVER reaches the model:
 *    - Excludes candidate full name, email, phone, location, personal URLs, LinkedIn/GitHub
 *      profile URLs, portfolio URLs, application/candidate/tenant/user/database IDs,
 *      session identifiers, internal storage keys, and authentication data.
 *    - Strips repo owner prefixes (e.g. "vishu1803/") from project names and descriptions.
 *    - Assigns transient reference tokens (e.g. "fact-1", "fact-2") to shield database UUIDs.
 * 2. Provides post-generation privacy validator (defense-in-depth):
 *    - Dynamically builds forbidden PII token set from candidate profile.
 *    - Rejects any generated text containing candidate name, email, phone, location, URLs, or IDs.
 * 3. Guarantees MCP and Extension parity through a single authoritative builder.
 */

import { sanitizeGroundedAccomplishment } from './resume-composition-primitives.js';

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
const URL_REGEX = /https?:\/\/[^\s]+/gi;

/**
 * Strips repository owner usernames and personal URLs from text or project names.
 * Example: "vishu1803/Ai-powered-code-review-assistant" -> "Ai-powered-code-review-assistant"
 * Example: "https://github.com/vishu1803/repo" -> "repo"
 *
 * @param {string} rawName
 * @returns {string} Clean project or entity name
 */
export function sanitizeProjectName(rawName) {
  if (!rawName || typeof rawName !== 'string') return '';
  let cleaned = rawName.trim();
  // Strip URL prefix
  cleaned = cleaned.replace(/^https?:\/\/[^/]+\//i, '');
  // Strip github.com/ prefix
  cleaned = cleaned.replace(/^github\.com\//i, '');
  // Strip repo owner prefix e.g. "vishu1803/" or "user/"
  if (/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/.test(cleaned)) {
    cleaned = cleaned.replace(/^[a-zA-Z0-9_-]+\//, '');
  }
  return cleaned.trim();
}

/**
 * Scrubs known personal identifiers, URLs, and repository owners from arbitrary text.
 *
 * @param {string} text
 * @param {Array<string>} [additionalTokens=[]]
 * @returns {string} Sanitized text
 */
export function scrubTextPii(text, additionalTokens = []) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;

  // Scrub URLs
  cleaned = cleaned.replace(URL_REGEX, '[LINK]');

  // Scrub Emails
  cleaned = cleaned.replace(EMAIL_REGEX, '[EMAIL]');

  // Scrub repository owner patterns like "vishu1803/project" -> "project"
  cleaned = cleaned.replace(/\b[a-zA-Z0-9_-]+\/([a-zA-Z0-9_-]+)\b/g, '$1');

  // Scrub additional explicit tokens
  for (const token of additionalTokens) {
    if (!token || token.length < 3) continue;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '[REDACTED]');
  }

  return cleaned;
}

/**
 * Dynamically builds a forbidden PII token set from an arbitrary candidate profile.
 * Ensures zero hardcoding so the privacy boundary works for all candidates.
 *
 * @param {object} candidateProfile
 * @returns {{ names: Array<string>, emails: Array<string>, phones: Array<string>, locations: Array<string>, urls: Array<string>, ids: Array<string> }}
 */
export function buildForbiddenPiiTokens(candidateProfile = {}) {
  const cand = candidateProfile || {};
  const meta = cand.profileMetadata || {};
  const userCustom = meta.userCustom || {};

  const names = new Set();
  const emails = new Set();
  const phones = new Set();
  const locations = new Set();
  const urls = new Set();
  const ids = new Set();

  // 1. Names
  const rawNames = [
    cand.displayName,
    cand.fullName,
    cand.name,
    userCustom.name,
    meta.name,
    cand.firstName,
    cand.lastName,
  ].filter(Boolean);

  for (const n of rawNames) {
    const trimmed = String(n).trim();
    if (trimmed.length >= 2) {
      names.add(trimmed);
      // Split into parts (first name, last name)
      const parts = trimmed.split(/[\s,.-]+/).filter((p) => p.length >= 3);
      for (const p of parts) {
        names.add(p);
      }
    }
  }

  // 2. Emails
  const rawEmails = [
    cand.email,
    userCustom.email,
    meta.email,
    cand.candidateEmail,
  ].filter(Boolean);

  for (const e of rawEmails) {
    const trimmed = String(e).trim().toLowerCase();
    if (trimmed) {
      emails.add(trimmed);
      const userPart = trimmed.split('@')[0];
      if (userPart && userPart.length >= 3) {
        names.add(userPart);
      }
    }
  }

  // 3. Phones
  const rawPhones = [
    cand.phone,
    cand.phoneNumber,
    userCustom.phone,
    meta.phone,
    userCustom.phoneNumber,
    meta.phoneNumber,
  ].filter(Boolean);

  for (const p of rawPhones) {
    const str = String(p).trim();
    if (str) {
      phones.add(str);
      const digits = str.replace(/\D/g, '');
      if (digits.length >= 7) {
        phones.add(digits);
        if (digits.length > 10) {
          phones.add(digits.slice(-10));
        }
        if (digits.length > 7) {
          phones.add(digits.slice(-7));
        }
      }
    }
  }

  // 4. Locations / Addresses
  const rawLocations = [
    cand.location,
    userCustom.location,
    meta.location,
    cand.address,
    userCustom.address,
    meta.address,
    cand.city,
    cand.state,
  ].filter(Boolean);

  for (const loc of rawLocations) {
    const trimmed = String(loc).trim();
    if (trimmed.length >= 3) {
      locations.add(trimmed);
      const parts = trimmed.split(/[\s,.-]+/).filter((p) => p.length >= 4);
      for (const p of parts) {
        // Skip common generic geographical terms
        if (!/^(remote|hybrid|onsite|north|south|east|west|city|state|country)$/i.test(p)) {
          locations.add(p);
        }
      }
    }
  }

  // 5. Personal URLs & GitHub Handles
  const rawUrls = [
    cand.githubUrl,
    userCustom.githubUrl,
    meta.githubUrl,
    cand.linkedinUrl,
    userCustom.linkedinUrl,
    meta.linkedinUrl,
    cand.portfolioUrl,
    userCustom.portfolioUrl,
    meta.portfolioUrl,
    cand.website,
    userCustom.website,
    meta.website,
  ].filter(Boolean);

  for (const u of rawUrls) {
    const trimmed = String(u).trim();
    if (trimmed) {
      urls.add(trimmed);
      // Extract GitHub username if present
      const ghMatch = trimmed.match(/github\.com\/([a-zA-Z0-9_-]+)/i);
      if (ghMatch && ghMatch[1] && ghMatch[1].length >= 3) {
        names.add(ghMatch[1]);
      }
    }
  }

  // Also check projects for owner prefixes to extract GitHub username
  const projects = cand.projects || [];
  for (const p of projects) {
    const pName = p.name || p.title || '';
    const match = pName.match(/^([a-zA-Z0-9_-]+)\//);
    if (match && match[1] && match[1].length >= 3) {
      names.add(match[1]);
    }
    if (p.metadata?.sourceUrl) {
      const urlMatch = p.metadata.sourceUrl.match(/github\.com\/([a-zA-Z0-9_-]+)/i);
      if (urlMatch && urlMatch[1] && urlMatch[1].length >= 3) {
        names.add(urlMatch[1]);
      }
    }
  }

  // 6. Internal IDs
  const rawIds = [
    cand.id,
    cand.candidateId,
    cand.tenantId,
    cand.userId,
    cand.applicationId,
  ].filter(Boolean);

  for (const id of rawIds) {
    const trimmed = String(id).trim();
    if (trimmed) {
      ids.add(trimmed);
    }
  }

  return {
    names: Array.from(names),
    emails: Array.from(emails),
    phones: Array.from(phones),
    locations: Array.from(locations),
    urls: Array.from(urls),
    ids: Array.from(ids),
  };
}

/**
 * Validates generated AI text against dynamically extracted candidate PII.
 * Rejects text containing candidate name, email, phone, location, personal URLs, or internal IDs.
 *
 * @param {object} params
 * @param {string} params.text Generated AI text
 * @param {object} params.candidateProfile Candidate profile
 * @param {Array<string>} [params.customForbiddenTokens=[]] Additional forbidden strings
 * @returns {{ valid: boolean, violations: Array<{ code: string, token: string, message: string }> }}
 */
export function validateAiPrivacy({ text, candidateProfile = {}, customForbiddenTokens = [] }) {
  const violations = [];
  if (!text || typeof text !== 'string') {
    return { valid: true, violations: [] };
  }

  const forbidden = buildForbiddenPiiTokens(candidateProfile);
  const normalizedText = text.toLowerCase();

  // 1. Check Candidate Names
  for (const name of forbidden.names) {
    if (!name || name.length < 3) continue;
    // Word boundary check (case-insensitive)
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(text)) {
      violations.push({
        code: 'PII_CANDIDATE_NAME_DETECTED',
        token: name,
        message: `Generated text contains candidate personal name or username "${name}"`,
      });
    }
  }

  // 2. Check Candidate Emails
  for (const email of forbidden.emails) {
    if (normalizedText.includes(email.toLowerCase())) {
      violations.push({
        code: 'PII_EMAIL_DETECTED',
        token: email,
        message: `Generated text contains candidate email "${email}"`,
      });
    }
  }
  // Generic email detector
  if (EMAIL_REGEX.test(text)) {
    violations.push({
      code: 'PII_EMAIL_DETECTED',
      token: text.match(EMAIL_REGEX)[0],
      message: 'Generated text contains an email address',
    });
  }

  // 3. Check Phone Numbers
  const textDigits = text.replace(/\D/g, '');
  for (const phone of forbidden.phones) {
    const cleanPhoneDigits = phone.replace(/\D/g, '');
    if (cleanPhoneDigits.length >= 7) {
      if (
        textDigits.includes(cleanPhoneDigits) ||
        (textDigits.length >= 7 && cleanPhoneDigits.includes(textDigits))
      ) {
        violations.push({
          code: 'PII_PHONE_DETECTED',
          token: phone,
          message: `Generated text contains candidate phone number "${phone}"`,
        });
        break;
      }
    }
    if (phone.length >= 7 && text.includes(phone)) {
      violations.push({
        code: 'PII_PHONE_DETECTED',
        token: phone,
        message: `Generated text contains candidate phone number "${phone}"`,
      });
      break;
    }
  }

  // 4. Check Personal Locations
  for (const loc of forbidden.locations) {
    if (!loc || loc.length < 4) continue;
    const escaped = loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(text)) {
      violations.push({
        code: 'PII_LOCATION_DETECTED',
        token: loc,
        message: `Generated text contains candidate location/address "${loc}"`,
      });
    }
  }

  // 5. Check Personal URLs
  for (const u of forbidden.urls) {
    if (normalizedText.includes(u.toLowerCase())) {
      violations.push({
        code: 'PII_PERSONAL_URL_DETECTED',
        token: u,
        message: `Generated text contains candidate personal URL "${u}"`,
      });
    }
  }

  // 6. Check Internal IDs & UUIDs
  for (const id of forbidden.ids) {
    if (text.includes(id)) {
      violations.push({
        code: 'PII_INTERNAL_ID_DETECTED',
        token: id,
        message: `Generated text contains internal identifier "${id}"`,
      });
    }
  }
  const rawUuids = text.match(UUID_REGEX);
  if (rawUuids && rawUuids.length > 0) {
    violations.push({
      code: 'PII_UUID_DETECTED',
      token: rawUuids[0],
      message: `Generated text contains raw UUID "${rawUuids[0]}"`,
    });
  }

  // 7. Check Custom Forbidden Tokens
  for (const token of customForbiddenTokens) {
    if (!token || token.length < 2) continue;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(text)) {
      violations.push({
        code: 'PII_CUSTOM_TOKEN_DETECTED',
        token,
        message: `Generated text contains forbidden token "${token}"`,
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Builds canonical privacy-safe AI context for resume generation tasks.
 *
 * Excludes:
 * - candidate full name
 * - email address
 * - phone number
 * - country code
 * - physical location/address
 * - personal URLs, LinkedIn URL, GitHub profile URL, portfolio URL
 * - application IDs, candidate IDs, tenant IDs, user IDs, database IDs
 * - session identifiers, internal storage keys, authentication data
 *
 * @param {object} params
 * @param {object} params.job Target job posting
 * @param {object} [params.candidateProfile] Candidate profile
 * @param {Array<object>} [params.selectedProjects=[]] Selected projects
 * @param {Array<object|string>} [params.selectedSkills=[]] Selected skills
 * @param {Array<object>} [params.factInventory=[]] Canonical facts
 * @param {string} [params.taskType='RESUME_SUMMARY_SYNTHESIS'] Generation task type
 * @returns {{
 *   context: object,
 *   transientToCanonicalFactId: Map<string, string>,
 *   canonicalToTransientFactId: Map<string, string>,
 *   resolveFactId: (transientId: string) => string,
 *   resolveFactIds: (transientIds: Array<string>) => Array<string>
 * }}
 */
export function buildResumeAiContext({
  job = {},
  candidateProfile = {},
  selectedProjects = [],
  selectedSkills = [],
  factInventory = [],
  taskType = 'RESUME_SUMMARY_SYNTHESIS',
}) {
  const forbidden = buildForbiddenPiiTokens(candidateProfile);
  const additionalScrubTokens = [
    ...forbidden.names,
    ...forbidden.locations,
  ];

  const targetTitle = String(job.title || job.targetRole || 'Software Engineer').trim();
  const targetDesc = scrubTextPii(String(job.description || '').trim().slice(0, 3000), additionalScrubTokens);
  const targetReqs = (Array.isArray(job.requirements) ? job.requirements : [])
    .map((r) => (typeof r === 'string' ? r : r.text || r.concept || ''))
    .filter(Boolean)
    .map((r) => scrubTextPii(r, additionalScrubTokens));

  // Bidirectional Fact ID mapping to protect database UUIDs
  const transientToCanonicalFactId = new Map();
  const canonicalToTransientFactId = new Map();

  let factCounter = 1;
  const getTransientFactId = (canonicalId) => {
    const rawId = String(canonicalId || '').trim();
    if (!rawId) return `fact-${factCounter++}`;
    if (!canonicalToTransientFactId.has(rawId)) {
      const tId = `fact-${factCounter++}`;
      canonicalToTransientFactId.set(rawId, tId);
      transientToCanonicalFactId.set(tId, rawId);
    }
    return canonicalToTransientFactId.get(rawId);
  };

  const resolveFactId = (transientId) => {
    return transientToCanonicalFactId.get(transientId) || transientId;
  };

  const resolveFactIds = (transientIds) => {
    if (!Array.isArray(transientIds)) return [];
    return transientIds.map(resolveFactId);
  };

  // Clean verified skills (no candidate names or URLs)
  const sanitizedSkills = (
    Array.isArray(selectedSkills) && selectedSkills.length > 0
      ? selectedSkills
      : candidateProfile.skills || []
  )
    .map((s) => (typeof s === 'string' ? s : s.name || s.skillName || s.slug || ''))
    .filter(Boolean)
    .map((s) => scrubTextPii(s, additionalScrubTokens));

  // Task-specific context partitioning
  if (taskType === 'RESUME_ACCOMPLISHMENT_SYNTHESIS') {
    // Project-scoped context: send ONLY selected project name, technologies, and grounded facts
    const proj = selectedProjects[0] || {};
    const sanitizedProjName = sanitizeProjectName(proj.displayName || proj.name || proj.title || 'Engineering Project');

    const rawFacts = Array.isArray(factInventory) ? factInventory : [];
    const sanitizedFacts = rawFacts.slice(0, 10).map((f) => {
      const canonicalId = f.factId || f.id;
      const tId = getTransientFactId(canonicalId);
      const rawText = scrubTextPii(f.text || f.claim || '', additionalScrubTokens);
      const text = sanitizeGroundedAccomplishment(rawText);
      return {
        factId: tId,
        text,
        technologies: (f.technologies || proj.technologies || []).map((t) => scrubTextPii(t, additionalScrubTokens)),
        metrics: f.metrics || [],
      };
    });

    const context = {
      taskType: 'RESUME_ACCOMPLISHMENT_SYNTHESIS',
      projectName: sanitizedProjName,
      technologies: (proj.technologies || []).map((t) => scrubTextPii(t, additionalScrubTokens)),
      facts: sanitizedFacts,
      targetJob: {
        targetTitle,
        requirements: targetReqs,
      },
    };

    return {
      context,
      transientToCanonicalFactId,
      canonicalToTransientFactId,
      resolveFactId,
      resolveFactIds,
    };
  }

  // Summary Task Context (Target title, requirements, skills, sanitized projects, sanitized facts)
  const sanitizedProjects = selectedProjects.map((p) => ({
    name: sanitizeProjectName(p.displayName || p.name || p.title || 'Engineering Project'),
    technologies: (p.technologies || []).map((t) => scrubTextPii(t, additionalScrubTokens)),
  }));

  const availableFacts = Array.isArray(factInventory) ? factInventory : [];
  const sanitizedFacts = availableFacts.slice(0, 25).map((f) => {
    const canonicalId = f.factId || f.id;
    const tId = getTransientFactId(canonicalId);
    const rawText = scrubTextPii(f.text || '', additionalScrubTokens);
    const text = sanitizeGroundedAccomplishment(rawText);
    return {
      factId: tId,
      text,
      technologies: (f.technologies || []).map((t) => scrubTextPii(t, additionalScrubTokens)),
      metrics: f.metrics || [],
    };
  });

  const context = {
    taskType: 'RESUME_SUMMARY_SYNTHESIS',
    targetJob: {
      targetTitle,
      requirements: targetReqs,
      description: targetDesc,
    },
    skills: sanitizedSkills,
    projects: sanitizedProjects,
    facts: sanitizedFacts,
  };

  return {
    context,
    transientToCanonicalFactId,
    canonicalToTransientFactId,
    resolveFactId,
    resolveFactIds,
  };
}

export default {
  sanitizeProjectName,
  scrubTextPii,
  buildForbiddenPiiTokens,
  validateAiPrivacy,
  buildResumeAiContext,
};
