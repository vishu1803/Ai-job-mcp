/**
 * @file Requirement Decomposer & Normalizer
 *
 * Deterministically decomposes natural-language job requirement sentences into
 * atomic, structured, matchable requirement objects while preserving original
 * source text and accurately distinguishing SKILL, EXPERIENCE, EDUCATION, LOCATION,
 * ELIGIBILITY, DOMAIN, and qualitative CONCEPT requirements.
 */

import crypto from 'node:crypto';
import { SkillTaxonomyEngine } from './skill-taxonomy.js';
import { TaxonomyMapper } from '../../extractors/github/taxonomy/taxonomy-mapper.js';

/**
 * Common boilerplate prefixes in job descriptions that wrap technical requirements.
 */
const BOILERPLATE_PREFIXES = [
  /^(?:strong\s+)?proficiency\s+(?:in|with)\s+/i,
  /^(?:strong|in-depth|deep|solid)\s+knowledge\s+of\s+/i,
  /^(?:strong|deep)\s+expertise\s+(?:in|with)\s+/i,
  /^(?:working|solid|deep|thorough)\s+understanding\s+of\s+/i,
  /^familiarity\s+with\s+(?:access\s+control\s+models\s+such\s+as\s+)?/i,
  /^(?:practical|hands-on|demonstrated|proven|direct)\s+experience\s+(?:developing|building|improving|designing|architecting|with|in|using)\s+/i,
  /^(?:experience|skills?)\s+(?:with|in|using)\s+/i,
  /^(?:working|practical)\s+knowledge\s+of\s+/i,
  /^(?:ability|capability)\s+to\s+(?:build|architect|develop|design|deploy)\s+(?:with|using|in)\s+/i,
  /^background\s+(?:in|with)\s+/i,
  /^comfort(?:able)?\s+with\s+/i,
  /^must\s+have\s+(?:experience\s+with\s+|strong\s+skills?\s+in\s+)?/i,
  /^good\s+to\s+have\s+(?:experience\s+with\s+)?/i,
  /^plus\s+if\s+you\s+have\s+/i,
];

/**
 * Known multi-word technical concepts to preserve before tokenization.
 */
const MULTI_WORD_TECH_PHRASES = [
  { pattern: /\bactive\s+directory\b/i, slug: 'active-directory', name: 'Active Directory', category: 'TOOL' },
  { pattern: /\bsecurity\s+architecture\b/i, slug: 'security-architecture', name: 'Security Architecture', category: 'ARCHITECTURE' },
  { pattern: /\baccess\s+control\s+models?\b/i, slug: 'access-control', name: 'Access Control', category: 'CONCEPT' },
  { pattern: /\brole[- ]based\s+access\s+control\b/i, slug: 'rbac', name: 'Role-Based Access Control', category: 'CONCEPT' },
  { pattern: /\bdistributed\s+systems?\b/i, slug: 'distributed-systems', name: 'Distributed Systems', category: 'ARCHITECTURE' },
  { pattern: /\bevent[- ]driven\s+architecture\b/i, slug: 'event-driven-architecture', name: 'Event-Driven Architecture', category: 'ARCHITECTURE' },
  { pattern: /\bmicroservices?\s+architecture\b/i, slug: 'microservices', name: 'Microservices', category: 'ARCHITECTURE' },
  { pattern: /\brest(?:ful)?\s+apis?\b/i, slug: 'rest-api', name: 'REST API', category: 'ARCHITECTURE' },
  { pattern: /\bgraphql\s+apis?\b/i, slug: 'graphql', name: 'GraphQL', category: 'ARCHITECTURE' },
  { pattern: /\binfrastructure\s+as\s+code\b/i, slug: 'infrastructure-as-code', name: 'Infrastructure as Code', category: 'ARCHITECTURE' },
  { pattern: /\bcontainer\s+orchestration\b/i, slug: 'container-orchestration', name: 'Container Orchestration', category: 'ARCHITECTURE' },
  { pattern: /\bcontinuous\s+integration\b/i, slug: 'ci-cd', name: 'CI/CD', category: 'CLOUD_DEVOPS' },
  { pattern: /\bserver[- ]side\s+rendering\b/i, slug: 'server-side-rendering', name: 'Server-Side Rendering', category: 'ARCHITECTURE' },
  { pattern: /\bopen\s*telemetry\b/i, slug: 'opentelemetry', name: 'OpenTelemetry', category: 'TOOL' },
];

/**
 * Qualitative / subjective soft-skill indicators that should not be mapped to mechanical code skills.
 */
const SUBJECTIVE_PATTERNS = [
  /\b(?:communication\s+skills?|strong\s+communicator)\b/i,
  /\b(?:team\s+player|collaborative\s+mindset|cross-functional\s+collaboration)\b/i,
  /\b(?:problem[- ]solving\s+abilities?|analytical\s+thinking)\b/i,
  /\b(?:fast\s+learner|quick\s+study|growth\s+mindset)\b/i,
  /\b(?:passion\s+for|passionate\s+about|curiosity|curious)\b/i,
  /\b(?:mentorship|mentoring\s+junior\s+engineers)\b/i,
  /\b(?:work\s+ethic|self-starter|high\s+ownership)\b/i,
  /\b(?:interpersonal\s+skills?)\b/i,
];

export class RequirementDecomposer {
  /**
   * Decomposes raw requirements (array of strings or multiline text) into atomic, categorized requirement objects.
   *
   * @param {string | string[]} rawInput - Raw requirement text or array of requirement bullet lines.
   * @param {object} [options={}] - Options for decomposition.
   * @param {string} [options.tenantId] - Optional tenant ID.
   * @param {string} [options.jobDescriptionId] - Optional job description ID.
   * @param {'REQUIRED' | 'PREFERRED' | 'OPTIONAL'} [options.defaultImportance='REQUIRED'] - Default importance.
   * @returns {Array<object>} Decomposed atomic requirement objects.
   */
  static decompose(rawInput, options = {}) {
    const {
      tenantId = null,
      jobDescriptionId = null,
      defaultImportance = 'REQUIRED',
    } = options;

    if (!rawInput) return [];

    let rawLines = [];
    if (Array.isArray(rawInput)) {
      rawLines = rawInput
        .map((r) => (typeof r === 'string' ? r : r?.description || r?.rawSnippet || r?.extractedValue || ''))
        .filter(Boolean);
    } else if (typeof rawInput === 'string') {
      rawLines = rawInput
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 3);
    }

    const decomposedRequirements = [];
    const seenRequirementSignatures = new Set();

    for (const rawLine of rawLines) {
      const cleanLine = rawLine
        .replace(/^[-*•>]\s*|^\d+\.\s*/, '')
        .trim();
      if (!cleanLine || cleanLine.length < 3) continue;

      const importance = RequirementDecomposer.classifyImportance(cleanLine, defaultImportance);
      const weight = importance === 'REQUIRED' ? 1.0 : importance === 'PREFERRED' ? 0.5 : 0.25;
      const confidenceScore = importance === 'REQUIRED' ? 0.95 : 0.85;

      // 1. Check for Experience Requirement
      const expMatch = cleanLine.match(
        /(?:^|\s|\b)(?:(\d+)(?:\s*[-–—to]\s*(\d+))?|\b(\d+)\+?)\s*(?:years?|yrs?)(?:\s+(?:of\s+)?experience)?(?:\s+(?:in|with|using|building|developing|of)\s+([A-Za-z0-9_#.+ /,-]{1,80}))?\b/i
      );
      if (expMatch) {
        const minYears = parseInt(expMatch[1] || expMatch[3], 10);
        const maxYears = expMatch[2] ? parseInt(expMatch[2], 10) : undefined;
        const targetDomain = expMatch[4] ? expMatch[4].trim() : undefined;

        if (!Number.isNaN(minYears)) {
          const expSig = `EXPERIENCE:${minYears}:${targetDomain || 'general'}`;
          if (!seenRequirementSignatures.has(expSig)) {
            seenRequirementSignatures.add(expSig);
            decomposedRequirements.push({
              id: crypto.randomUUID(),
              tenantId,
              jobDescriptionId,
              originalText: cleanLine,
              rawSnippet: cleanLine,
              category: 'EXPERIENCE',
              importance,
              weight,
              skillSlug: null,
              extractedValue: `${minYears}+ years experience${targetDomain ? ` in ${targetDomain}` : ''}`,
              normalizedCriteria: {
                minYears,
                ...(maxYears !== undefined ? { maxYears } : {}),
                ...(targetDomain ? { target: targetDomain } : {}),
              },
              confidenceScore: 0.9,
              source: 'PARSED_REQUIREMENT',
              createdAt: new Date().toISOString(),
            });
          }

          // Extract any explicit technologies mentioned in the experience clause (e.g. "in Node.js, Go, or Java")
          if (targetDomain) {
            const domainSkills = RequirementDecomposer.extractAtomicSkillsFromClause(targetDomain, cleanLine);
            for (const skill of domainSkills) {
              const skillSig = `SKILL:${skill.slug}`;
              if (!seenRequirementSignatures.has(skillSig)) {
                seenRequirementSignatures.add(skillSig);
                decomposedRequirements.push({
                  id: crypto.randomUUID(),
                  tenantId,
                  jobDescriptionId,
                  originalText: cleanLine,
                  rawSnippet: cleanLine,
                  category: 'SKILL',
                  importance,
                  weight,
                  skillSlug: skill.slug,
                  extractedValue: skill.name,
                  normalizedCriteria: {
                    skillSlug: skill.slug,
                    skillName: skill.name,
                    skillCategory: skill.category,
                  },
                  confidenceScore,
                  source: 'PARSED_REQUIREMENT',
                  createdAt: new Date().toISOString(),
                });
              }
            }
          }
          continue; // Handled as experience
        }
      }

      // 2. Check for Education Requirement
      const eduCriteria = RequirementDecomposer.extractEducationCriteria(cleanLine);
      if (eduCriteria) {
        const eduSig = `EDUCATION:${eduCriteria.degreeLevel}:${eduCriteria.field || 'general'}`;
        if (!seenRequirementSignatures.has(eduSig)) {
          seenRequirementSignatures.add(eduSig);
          decomposedRequirements.push({
            id: crypto.randomUUID(),
            tenantId,
            jobDescriptionId,
            originalText: cleanLine,
            rawSnippet: cleanLine,
            category: 'EDUCATION',
            importance,
            weight: importance === 'REQUIRED' ? 0.75 : 0.4,
            skillSlug: null,
            extractedValue: `${eduCriteria.degreeLevel} degree${eduCriteria.field ? ` in ${eduCriteria.field}` : ''}`,
            normalizedCriteria: eduCriteria,
            confidenceScore: 0.9,
            source: 'PARSED_REQUIREMENT',
            createdAt: new Date().toISOString(),
          });
        }
        continue;
      }

      // 3. Check for Location / Workplace Requirement
      const locationCriteria = RequirementDecomposer.extractLocationCriteria(cleanLine);
      if (locationCriteria) {
        const locSig = `LOCATION:${locationCriteria.workplaceType}:${locationCriteria.region || 'any'}`;
        if (!seenRequirementSignatures.has(locSig)) {
          seenRequirementSignatures.add(locSig);
          decomposedRequirements.push({
            id: crypto.randomUUID(),
            tenantId,
            jobDescriptionId,
            originalText: cleanLine,
            rawSnippet: cleanLine,
            category: 'LOCATION',
            importance,
            weight: 0.5,
            skillSlug: null,
            extractedValue: locationCriteria.display,
            normalizedCriteria: locationCriteria,
            confidenceScore: 0.9,
            source: 'PARSED_REQUIREMENT',
            createdAt: new Date().toISOString(),
          });
        }
        continue;
      }

      // 4. Check for Work Authorization / Eligibility Requirement
      const eligibilityCriteria = RequirementDecomposer.extractEligibilityCriteria(cleanLine);
      if (eligibilityCriteria) {
        const eligSig = `ELIGIBILITY:${eligibilityCriteria.type}`;
        if (!seenRequirementSignatures.has(eligSig)) {
          seenRequirementSignatures.add(eligSig);
          decomposedRequirements.push({
            id: crypto.randomUUID(),
            tenantId,
            jobDescriptionId,
            originalText: cleanLine,
            rawSnippet: cleanLine,
            category: 'ELIGIBILITY',
            importance,
            weight: 0.5,
            skillSlug: null,
            extractedValue: eligibilityCriteria.display,
            normalizedCriteria: eligibilityCriteria,
            confidenceScore: 0.9,
            source: 'PARSED_REQUIREMENT',
            createdAt: new Date().toISOString(),
          });
        }
        continue;
      }

      // 5. Check for Qualitative Subjective Requirement
      if (RequirementDecomposer.isSubjectiveRequirement(cleanLine)) {
        const subjSig = `CONCEPT:${cleanLine.slice(0, 40).toLowerCase()}`;
        if (!seenRequirementSignatures.has(subjSig)) {
          seenRequirementSignatures.add(subjSig);
          decomposedRequirements.push({
            id: crypto.randomUUID(),
            tenantId,
            jobDescriptionId,
            originalText: cleanLine,
            rawSnippet: cleanLine,
            category: 'CONCEPT',
            importance: 'PREFERRED',
            weight: 0.25,
            skillSlug: null,
            extractedValue: cleanLine,
            normalizedCriteria: { isSubjective: true },
            confidenceScore: 0.8,
            source: 'PARSED_REQUIREMENT',
            createdAt: new Date().toISOString(),
          });
        }
        continue;
      }

      // 6. Technical Skill / Architecture / Protocol Requirement (Decompose Compound Clauses)
      const extractedAtomicSkills = RequirementDecomposer.extractAtomicSkillsFromSentence(cleanLine);

      if (extractedAtomicSkills.length > 0) {
        for (const skill of extractedAtomicSkills) {
          const skillSig = `SKILL:${skill.slug}`;
          if (!seenRequirementSignatures.has(skillSig)) {
            seenRequirementSignatures.add(skillSig);
            decomposedRequirements.push({
              id: crypto.randomUUID(),
              tenantId,
              jobDescriptionId,
              originalText: cleanLine,
              rawSnippet: cleanLine,
              category: 'SKILL',
              importance,
              weight,
              skillSlug: skill.slug,
              extractedValue: skill.name,
              normalizedCriteria: {
                skillSlug: skill.slug,
                skillName: skill.name,
                skillCategory: skill.category,
              },
              confidenceScore,
              source: 'PARSED_REQUIREMENT',
              createdAt: new Date().toISOString(),
            });
          }
        }
      } else {
        // Fallback for general unparsed technical sentences (e.g. "Practical experience developing and improving applications")
        const stripped = RequirementDecomposer.stripBoilerplate(cleanLine);
        const norm = SkillTaxonomyEngine.normalizeSkill(stripped);
        const slug = norm?.canonicalSlug && norm.canonicalSlug !== 'unknown-tool' ? norm.canonicalSlug : null;
        const name = norm?.canonicalName || stripped;

        const genericSig = `GENERIC:${cleanLine.slice(0, 40).toLowerCase()}`;
        if (!seenRequirementSignatures.has(genericSig)) {
          seenRequirementSignatures.add(genericSig);
          decomposedRequirements.push({
            id: crypto.randomUUID(),
            tenantId,
            jobDescriptionId,
            originalText: cleanLine,
            rawSnippet: cleanLine,
            category: slug ? 'SKILL' : 'CONCEPT',
            importance,
            weight: 0.5,
            skillSlug: slug,
            extractedValue: name,
            normalizedCriteria: { originalClause: stripped },
            confidenceScore: 0.75,
            source: 'PARSED_REQUIREMENT',
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    return decomposedRequirements;
  }

  /**
   * Decomposes a technical sentence into individual atomic skills.
   *
   * @param {string} sentence - Cleaned requirement sentence.
   * @returns {Array<{ slug: string, name: string, category: string }>}
   */
  static extractAtomicSkillsFromSentence(sentence) {
    const matchedSkills = [];
    const seenSlugs = new Set();

    // 1. Scan for Multi-word phrases first to preserve cohesive concepts
    for (const phrase of MULTI_WORD_TECH_PHRASES) {
      if (phrase.pattern.test(sentence)) {
        if (!seenSlugs.has(phrase.slug)) {
          seenSlugs.add(phrase.slug);
          matchedSkills.push({
            slug: phrase.slug,
            name: phrase.name,
            category: phrase.category,
          });
        }
      }
    }

    // 2. Strip standard boilerplate prefixes
    const coreText = RequirementDecomposer.stripBoilerplate(sentence);

    // 3. Decompose by list delimiters: commas, "and", "or", slashes, semicolons
    const clauses = RequirementDecomposer.splitCompoundClauses(coreText);

    for (const clause of clauses) {
      const skillsInClause = RequirementDecomposer.extractAtomicSkillsFromClause(clause, sentence);
      for (const sk of skillsInClause) {
        if (!seenSlugs.has(sk.slug)) {
          seenSlugs.add(sk.slug);
          matchedSkills.push(sk);
        }
      }
    }

    // 4. Secondary catalog keyword scan across entire sentence for any boundary-isolated skills
    const directScanSkills = RequirementDecomposer.scanCatalogSkills(sentence);
    for (const sk of directScanSkills) {
      if (!seenSlugs.has(sk.slug)) {
        seenSlugs.add(sk.slug);
        matchedSkills.push(sk);
      }
    }

    return matchedSkills;
  }

  /**
   * Splits a compound phrase across list delimiters (, / and / or / ;).
   *
   * @param {string} text
   * @returns {string[]}
   */
  static splitCompoundClauses(text) {
    if (!text) return [];

    // Replace parenthetical aliases like "RBAC (Role-Based Access Control)" with separated tokens
    const unparenthesized = text
      .replace(/\(([^)]+)\)/g, ', $1, ')
      .replace(/\s+as\s+well\s+as\s+/gi, ', ')
      .replace(/\s+and\/or\s+/gi, ', ')
      .replace(/\s+(?:and|or|&)\s+/gi, ', ')
      .replace(/[\n;•]+/g, ', ');

    return unparenthesized
      .split(/,\s*|\s*\/\s*/)
      .map((c) => c.replace(/^[.,;:\s]+|[.,;:\s]+$/g, '').trim())
      .filter((c) => c.length >= 2);
  }

  /**
   * Extracts atomic skills from a single clause.
   *
   * @param {string} clause
   * @param {string} context
   * @returns {Array<{ slug: string, name: string, category: string }>}
   */
  static extractAtomicSkillsFromClause(clause, context = '') {
    const results = [];
    const seen = new Set();

    // Check direct taxonomy normalization
    const norm = SkillTaxonomyEngine.normalizeSkill(clause, { context });
    if (norm && !norm.isNoise && norm.category !== 'NOISE') {
      if (norm.isKnown || norm.canonicalSlug !== 'unknown-tool') {
        seen.add(norm.canonicalSlug);
        results.push({
          slug: norm.canonicalSlug,
          name: norm.canonicalName,
          category: norm.category,
        });
      }
    }

    return results;
  }

  /**
   * Scans a line directly for exact catalog skill matches with word boundaries.
   *
   * @param {string} line
   * @returns {Array<{ slug: string, name: string, category: string }>}
   */
  static scanCatalogSkills(line) {
    const matches = [];
    const seenSlugs = new Set();

    // Scan TaxonomyMapper precompiled catalog
    for (const [key, skillMeta] of Object.entries(TaxonomyMapper.TAXONOMY_CATALOG)) {
      if (!key || key.length < 2) continue;
      // Escaping special characters for regex
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?:^|[^a-zA-Z0-9_#.-])${escaped}(?:$|[^a-zA-Z0-9_#.-])`, 'i');

      if (regex.test(line)) {
        if (!seenSlugs.has(skillMeta.slug)) {
          seenSlugs.add(skillMeta.slug);
          matches.push({
            slug: skillMeta.slug,
            name: skillMeta.name,
            category: skillMeta.category,
          });
        }
      }
    }

    // Specific short language checks (C++, C#, Go, SQL)
    if (/\bC\+\+\b/i.test(line) && !seenSlugs.has('cpp')) {
      seenSlugs.add('cpp');
      matches.push({ slug: 'cpp', name: 'C++', category: 'LANGUAGE' });
    }
    if (/\bC#\b/i.test(line) && !seenSlugs.has('c-sharp')) {
      seenSlugs.add('c-sharp');
      matches.push({ slug: 'c-sharp', name: 'C#', category: 'LANGUAGE' });
    }
    if (/\b(?:golang|go\s+programming|go\s+developer|in\s+go)\b/i.test(line) && !seenSlugs.has('go')) {
      seenSlugs.add('go');
      matches.push({ slug: 'go', name: 'Go', category: 'LANGUAGE' });
    }
    if (/\bSQL\b/i.test(line) && !seenSlugs.has('sql')) {
      seenSlugs.add('sql');
      matches.push({ slug: 'sql', name: 'SQL', category: 'DATABASE' });
    }
    if (/\bRBAC\b/i.test(line) && !seenSlugs.has('rbac')) {
      seenSlugs.add('rbac');
      matches.push({ slug: 'rbac', name: 'Role-Based Access Control', category: 'CONCEPT' });
    }
    if (/\bLDAP\b/i.test(line) && !seenSlugs.has('ldap')) {
      seenSlugs.add('ldap');
      matches.push({ slug: 'ldap', name: 'LDAP', category: 'TOOL' });
    }

    return matches;
  }

  /**
   * Strips common boilerplate lead-in phrases from a requirement line.
   *
   * @param {string} line
   * @returns {string}
   */
  static stripBoilerplate(line) {
    let current = line.trim();
    for (const prefix of BOILERPLATE_PREFIXES) {
      if (prefix.test(current)) {
        current = current.replace(prefix, '').trim();
      }
    }
    return current;
  }

  /**
   * Classifies requirement importance from cues.
   *
   * @param {string} line
   * @param {'REQUIRED' | 'PREFERRED' | 'OPTIONAL'} defaultImportance
   * @returns {'REQUIRED' | 'PREFERRED' | 'OPTIONAL'}
   */
  static classifyImportance(line, defaultImportance = 'REQUIRED') {
    const lower = line.toLowerCase();
    if (/\b(?:bonus|plus|optional|a\s+plus\s+if\s+you\s+have|nice\s+to\s+have)\b/i.test(lower)) {
      return 'OPTIONAL';
    }
    if (/\b(?:preferred|desired|advantageous|ideal\s+candidate\s+has|good\s+to\s+have)\b/i.test(lower)) {
      return 'PREFERRED';
    }
    if (/\b(?:must\s+have|must\s+possess|required|essential|minimum|mandatory|proven\s+track\s+record)\b/i.test(lower)) {
      return 'REQUIRED';
    }
    return defaultImportance;
  }

  /**
   * Checks if requirement is qualitative or subjective.
   *
   * @param {string} line
   * @returns {boolean}
   */
  static isSubjectiveRequirement(line) {
    return SUBJECTIVE_PATTERNS.some((p) => p.test(line));
  }

  /**
   * Extracts education criteria if present.
   *
   * @param {string} line
   * @returns {object | null}
   */
  static extractEducationCriteria(line) {
    const lower = line.toLowerCase();

    let degreeLevel = null;
    if (/\b(?:doctorate|ph\.?d\.?)\b/i.test(lower)) {
      degreeLevel = 'DOCTORATE';
    } else if (/\b(?:master'?s?|m\.?s\.?|m\.?tech|m\.?sc)\b/i.test(lower)) {
      degreeLevel = 'MASTER';
    } else if (/\b(?:bachelor'?s?|b\.?s\.?|b\.?tech|b\.?sc|b\.?e\.?|undergraduate)\b/i.test(lower)) {
      degreeLevel = 'BACHELOR';
    } else if (/\b(?:associate'?s?)\b/i.test(lower)) {
      degreeLevel = 'ASSOCIATE';
    } else if (/\bdegree\b/i.test(lower)) {
      degreeLevel = 'BACHELOR';
    }

    if (!degreeLevel) return null;

    let field = null;
    const fieldMatch = line.match(
      /\b(?:in|of)\s+((?:computer\s+science|software\s+engineering|information\s+technology|data\s+science|electrical\s+engineering|electronics(?:\s+engineering)?|mathematics|stem|related(?:\s+technical)?\s+field)[a-zA-Z0-9, /]*)/i
    );
    if (fieldMatch) {
      field = fieldMatch[1].trim();
    }

    return {
      degreeLevel,
      ...(field ? { field } : {}),
    };
  }

  /**
   * Extracts location criteria if present.
   *
   * @param {string} line
   * @returns {object | null}
   */
  static extractLocationCriteria(line) {
    const lower = line.toLowerCase();

    if (/\b(?:remote\s*(?:-|in)?\s*(?:us|united\s+states|usa))\b/i.test(lower)) {
      return { workplaceType: 'REMOTE', region: 'UNITED_STATES', display: 'Remote - United States' };
    }
    if (/\b(?:remote\s*(?:-|in)?\s*(?:india))\b/i.test(lower)) {
      return { workplaceType: 'REMOTE', region: 'INDIA', display: 'Remote - India' };
    }
    if (/\b(?:remote\s*(?:-|in)?\s*(?:worldwide|global))\b/i.test(lower)) {
      return { workplaceType: 'REMOTE', region: 'GLOBAL', display: 'Remote - Worldwide' };
    }
    if (/\b(?:remote|work\s+from\s+home)\b/i.test(lower)) {
      return { workplaceType: 'REMOTE', region: 'ANY', display: 'Remote' };
    }
    if (/\b(?:hybrid\s+in|hybrid\s+work)\b/i.test(lower)) {
      return { workplaceType: 'HYBRID', region: 'LOCAL', display: 'Hybrid Workplace' };
    }
    if (/\b(?:on-site|in-office)\b/i.test(lower)) {
      return { workplaceType: 'ON_SITE', region: 'LOCAL', display: 'On-site' };
    }

    return null;
  }

  /**
   * Extracts eligibility / work authorization criteria if present.
   *
   * @param {string} line
   * @returns {object | null}
   */
  static extractEligibilityCriteria(line) {
    const lower = line.toLowerCase();
    if (/\b(?:us\s+work\s+authorization|authorized\s+to\s+work\s+in\s+the\s+(?:us|united\s+states))\b/i.test(lower)) {
      return { type: 'US_WORK_AUTHORIZATION', display: 'US Work Authorization' };
    }
    if (/\b(?:visa\s+sponsorship(?:\s+is\s+not\s+available|\s+not\s+offered)?)\b/i.test(lower)) {
      return { type: 'VISA_SPONSORSHIP_POLICY', display: 'Visa Sponsorship Policy' };
    }
    if (/\b(?:security\s+clearance)\b/i.test(lower)) {
      return { type: 'SECURITY_CLEARANCE', display: 'Security Clearance' };
    }
    return null;
  }
}
