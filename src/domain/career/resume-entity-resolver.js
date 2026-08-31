/**
 * @file Multi-Stage Resume Entity Resolution & Semantic Normalization Engine (P13.5-004 / ARCH-052).
 *
 * Implements the 4-stage entity resolution pipeline:
 * 1. Deterministic Normalization (Taxonomy mapping, token sanitization, alias resolution)
 * 2. Candidate Entity Grouping (Multi-mention clustering across resume sections)
 * 3. AI Semantic Disambiguation (Task policy integration for ambiguous clusters)
 * 4. Deterministic Policy Validation & Scope Attribution (GLOBAL, PROJECT_SCOPED, EXPERIENCE_SCOPED, HYBRID)
 *
 * Enforces the 1 Entity -> N Mentions invariant across Skills, Projects, and Work Experience.
 */

import { SkillTaxonomyEngine } from './skill-taxonomy.js';

/**
 * 4-Tier Scope Taxonomy for Candidate Resume Skills.
 */
export const RESUME_SKILL_SCOPES = Object.freeze({
  GLOBAL: 'GLOBAL', // Declared explicitly in technical skills section
  PROJECT_SCOPED: 'PROJECT_SCOPED', // Mentioned only in project descriptions
  EXPERIENCE_SCOPED: 'EXPERIENCE_SCOPED', // Mentioned only in work experience roles/bullets
  HYBRID: 'HYBRID', // Declared globally AND used contextually in projects/experience
});

export class ResumeEntityResolver {
  /**
   * Cleans a raw technology or skill token.
   *
   * @param {string} token
   * @returns {string}
   */
  static cleanToken(token) {
    if (!token || typeof token !== 'string') return '';
    return token
      .replace(/^[●•\-*–—\t\r\n]+\s*/, '')
      .replace(/\s*\([^)]*\)/g, '') // remove parenthetical notes like (ES6+) or (Intermediate)
      .replace(/\s+(?:Framework|Libraries?|Library|ORM|Engine|Server|Client)\b/gi, '')
      .replace(/[,;:]+$/, '')
      .trim();
  }

  /**
   * Normalizes a raw skill string to canonical metadata using the SkillTaxonomyEngine.
   *
   * @param {string} rawInput
   * @param {object} [options={}]
   * @param {string} [options.context='']
   * @param {string} [options.categoryHint='TOOL']
   * @returns {{ name: string, slug: string, category: string, tier: 'PRIMARY' | 'SIGNAL', confidence: number } | null}
   */
  static normalizeSkill(rawInput, options = {}) {
    const rawCleaned = String(rawInput || '')
      .replace(/^[●•\-*–—\t\r\n]+\s*/, '')
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/[,;:]+$/, '')
      .trim();
    if (!rawCleaned || rawCleaned.length < 2) return null;

    // 1. First try raw cleaned against taxonomy
    let norm = SkillTaxonomyEngine.normalizeSkill(rawCleaned, {
      context: options.context || '',
      categoryHint: options.categoryHint || 'TOOL',
    });

    // 2. If unmapped or generic, try stripped cleaned token (e.g. Prisma ORM -> Prisma)
    if (!norm || norm.canonicalSlug.startsWith('unknown-')) {
      const strippedCleaned = ResumeEntityResolver.cleanToken(rawInput);
      if (strippedCleaned && strippedCleaned !== rawCleaned) {
        const normStripped = SkillTaxonomyEngine.normalizeSkill(strippedCleaned, {
          context: options.context || '',
          categoryHint: options.categoryHint || 'TOOL',
        });
        if (normStripped && !normStripped.canonicalSlug.startsWith('unknown-')) {
          norm = normStripped;
        }
      }
    }

    if (!norm) return null;

    const slug = norm.canonicalSlug || rawCleaned.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const name = norm.canonicalName || rawCleaned;
    const category = norm.fineCategory || norm.category || 'TOOL';
    const tier = norm.tier || SkillTaxonomyEngine.classifyTier(slug, category);

    return {
      name,
      slug,
      category,
      tier,
      confidence: norm.normalizationConfidence || 0.9,
    };
  }

  /**
   * Extracts technology mentions from free-form text (e.g. project or experience bullet points).
   *
   * @param {string} text
   * @param {Map<string, object>} [knownSkillsMap=null] Optional existing skills map for prioritized lookup
   * @returns {Array<{ name: string, slug: string, category: string, tier: 'PRIMARY' | 'SIGNAL' }>}
   */
  static extractTechnologiesFromText(text, knownSkillsMap = null) {
    if (!text || typeof text !== 'string') return [];

    const discovered = new Map();

    // 1. Check against known skills from resume first
    if (knownSkillsMap) {
      for (const [slug, skill] of knownSkillsMap.entries()) {
        const regex = new RegExp(`\\b${skill.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(text)) {
          discovered.set(slug, {
            name: skill.name,
            slug,
            category: skill.category,
            tier: skill.tier,
          });
        }
      }
    }

    // 2. Scan for common tech keyword tokens
    const commonKeywords = [
      'JavaScript',
      'TypeScript',
      'Python',
      'Node.js',
      'NodeJS',
      'React',
      'Next.js',
      'FastAPI',
      'Fastify',
      'Express',
      'PostgreSQL',
      'Postgres',
      'Docker',
      'Kubernetes',
      'AWS',
      'GCP',
      'Azure',
      'Git',
      'GitHub',
      'GitHub Actions',
      'REST',
      'RESTful APIs',
      'GraphQL',
      'Redis',
      'Drizzle ORM',
      'Prisma',
      'SQLAlchemy',
      'HTML',
      'CSS',
      'Tailwind CSS',
      'Linux',
      'Microservices',
      'CI/CD',
      'OAuth',
      'MCP',
      'Model Context Protocol',
      'Go',
      'Golang',
      'Rust',
      'Java',
      'C++',
      'MongoDB',
      'RBAC',
      'Jest',
      'Cypress',
      'Vitest',
      'WebSockets',
    ];

    for (const kw of commonKeywords) {
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(text)) {
        const norm = ResumeEntityResolver.normalizeSkill(kw, { context: text });
        if (norm && !discovered.has(norm.slug)) {
          discovered.set(norm.slug, norm);
        }
      }
    }

    return Array.from(discovered.values());
  }

  /**
   * Resolves the entire RawStructuredExtraction into a validated CanonicalResumeGraph.
   *
   * @param {Array<object>} rawSections Parsed sections from ResumeParserService
   * @param {object} [options={}]
   * @param {object} [options.llmAdapter=null] Optional AI adapter for ambiguous semantic disambiguation
   * @param {string} [options.requestId=null]
   * @returns {{
   *   canonicalSkills: Map<string, object>,
   *   canonicalProjects: Array<object>,
   *   canonicalExperiences: Array<object>,
   *   canonicalEducation: Array<object>,
   *   canonicalCertifications: Array<string>,
   *   canonicalContact: object,
   *   canonicalSummary: string,
   *   candidateClaims: Array<object>
   * }}
   */
  static resolveCanonicalGraph(rawSections = [], _options = {}) {
    const skillsMap = new Map(); // slug -> CanonicalSkillEntity
    const projectsList = [];
    const experiencesList = [];
    const educationList = [];
    const certsList = [];
    const contactInfo = {
      name: null,
      email: null,
      phone: null,
      github: null,
      linkedin: null,
      leetcode: null,
      urls: [],
    };
    let summaryText = '';

    /**
     * Helper to record or update a canonical skill mention.
     *
     * @param {string} rawToken
     * @param {object} mentionDetails
     * @param {'GLOBAL' | 'PROJECT_SCOPED' | 'EXPERIENCE_SCOPED'} mentionScope
     */
    const recordSkillMention = (rawToken, mentionDetails, mentionScope) => {
      const norm = ResumeEntityResolver.normalizeSkill(rawToken, {
        context: mentionDetails.context || '',
        categoryHint: mentionDetails.categoryHint || 'TOOL',
      });
      if (!norm) return null;

      const slug = norm.slug;
      if (!skillsMap.has(slug)) {
        skillsMap.set(slug, {
          name: norm.name,
          slug,
          category: norm.category,
          tier: norm.tier,
          scope: mentionScope,
          occurrenceCount: 1,
          occurrences: [
            {
              section: mentionDetails.section,
              rawText: rawToken,
              context: mentionDetails.context || '',
              entityRef: mentionDetails.entityRef || null,
            },
          ],
          relatedEntities: mentionDetails.entityRef ? [mentionDetails.entityRef] : [],
          confidence: norm.confidence,
        });
      } else {
        const existing = skillsMap.get(slug);
        existing.occurrenceCount += 1;
        existing.occurrences.push({
          section: mentionDetails.section,
          rawText: rawToken,
          context: mentionDetails.context || '',
          entityRef: mentionDetails.entityRef || null,
        });

        if (
          mentionDetails.entityRef &&
          !existing.relatedEntities.some(
            (r) =>
              r.type === mentionDetails.entityRef.type && r.name === mentionDetails.entityRef.name
          )
        ) {
          existing.relatedEntities.push(mentionDetails.entityRef);
        }

        // Scope transition rules:
        // GLOBAL + PROJECT_SCOPED -> HYBRID
        // GLOBAL + EXPERIENCE_SCOPED -> HYBRID
        // PROJECT_SCOPED + EXPERIENCE_SCOPED -> HYBRID
        if (existing.scope !== mentionScope) {
          existing.scope = RESUME_SKILL_SCOPES.HYBRID;
        }
      }

      return skillsMap.get(slug);
    };

    // Stage 1: Ingest Sections in Order
    for (const sec of rawSections) {
      const sd = sec.structuredData || {};
      const heading = sec.heading || sec.sectionType;

      // Contact Info
      if (sd.name && !contactInfo.name) contactInfo.name = sd.name;
      if (sd.email && !contactInfo.email) contactInfo.email = sd.email;
      if (sd.phone && !contactInfo.phone) contactInfo.phone = sd.phone;
      if (sd.github && !contactInfo.github) contactInfo.github = sd.github;
      if (sd.linkedin && !contactInfo.linkedin) contactInfo.linkedin = sd.linkedin;
      if (sd.leetcode && !contactInfo.leetcode) contactInfo.leetcode = sd.leetcode;
      if (Array.isArray(sd.urls)) {
        for (const u of sd.urls) {
          if (!contactInfo.urls.includes(u)) contactInfo.urls.push(u);
        }
      }

      // Summary
      if (sec.sectionType === 'SUMMARY') {
        const text =
          typeof sd.content === 'string' && sd.content.trim()
            ? sd.content.trim()
            : sec.rawText?.trim() || '';
        if (text && !summaryText) {
          summaryText = text;
        }
      }

      // Global Skills Section (Declared Core Competencies)
      if (sec.sectionType === 'SKILLS' && Array.isArray(sd.skills)) {
        for (const rawSkill of sd.skills) {
          recordSkillMention(
            rawSkill,
            {
              section: 'SKILLS',
              context: `Declared in ${heading}`,
            },
            RESUME_SKILL_SCOPES.GLOBAL
          );
        }
      }

      // Projects Section
      if (sec.sectionType === 'PROJECTS' && Array.isArray(sd.projects)) {
        for (const rawProj of sd.projects) {
          const title = (rawProj.title || '').trim();
          if (!title) continue;

          const projEntityRef = { type: 'PROJECT', name: title };
          const resolvedTechs = [];

          // 1. Process technologies explicitly declared in project header
          if (Array.isArray(rawProj.technologies)) {
            for (const tech of rawProj.technologies) {
              const registered = recordSkillMention(
                tech,
                {
                  section: 'PROJECTS',
                  context: `Used in project "${title}"`,
                  entityRef: projEntityRef,
                },
                RESUME_SKILL_SCOPES.PROJECT_SCOPED
              );
              if (registered && !resolvedTechs.some((t) => t.slug === registered.slug)) {
                resolvedTechs.push({
                  name: registered.name,
                  slug: registered.slug,
                  category: registered.category,
                  tier: registered.tier,
                });
              }
            }
          }

          // 2. Extract any inline technology mentions in project bullets
          if (Array.isArray(rawProj.bullets)) {
            for (const b of rawProj.bullets) {
              const inlineTechs = ResumeEntityResolver.extractTechnologiesFromText(b, skillsMap);
              for (const it of inlineTechs) {
                const registered = recordSkillMention(
                  it.name,
                  {
                    section: 'PROJECTS',
                    context: `Used in project "${title}" bullet: "${b.slice(0, 60)}..."`,
                    entityRef: projEntityRef,
                  },
                  RESUME_SKILL_SCOPES.PROJECT_SCOPED
                );
                if (registered && !resolvedTechs.some((t) => t.slug === registered.slug)) {
                  resolvedTechs.push({
                    name: registered.name,
                    slug: registered.slug,
                    category: registered.category,
                    tier: registered.tier,
                  });
                }
              }
            }
          }

          projectsList.push({
            canonicalName: title,
            title,
            description: (rawProj.bullets || []).join(' ') || title,
            bullets: rawProj.bullets || [],
            urls: rawProj.urls || [],
            technologies: resolvedTechs,
            sourceMentions: [{ section: 'PROJECTS', rawHeading: heading }],
          });
        }
      }

      // Work Experience Section
      if (sec.sectionType === 'WORK_EXPERIENCE' && Array.isArray(sd.experiences)) {
        for (const rawExp of sd.experiences) {
          const role = (rawExp.role || 'Role').trim();
          const company = (rawExp.company || 'Company').trim();
          const expLabel = `${role} at ${company}`;
          const expEntityRef = { type: 'EXPERIENCE', name: expLabel };
          const resolvedTechs = [];

          // Scan bullet points for technology mentions
          if (Array.isArray(rawExp.bullets)) {
            for (const b of rawExp.bullets) {
              const inlineTechs = ResumeEntityResolver.extractTechnologiesFromText(b, skillsMap);
              for (const it of inlineTechs) {
                const registered = recordSkillMention(
                  it.name,
                  {
                    section: 'WORK_EXPERIENCE',
                    context: `Applied at ${expLabel}`,
                    entityRef: expEntityRef,
                  },
                  RESUME_SKILL_SCOPES.EXPERIENCE_SCOPED
                );
                if (registered && !resolvedTechs.some((t) => t.slug === registered.slug)) {
                  resolvedTechs.push({
                    name: registered.name,
                    slug: registered.slug,
                    category: registered.category,
                    tier: registered.tier,
                  });
                }
              }
            }
          }

          experiencesList.push({
            role,
            company,
            location: rawExp.location || null,
            startDate: rawExp.dates || null,
            endDate: null,
            isCurrent: /present|current|now/i.test(rawExp.dates || ''),
            bullets: rawExp.bullets || [],
            technologiesUsed: resolvedTechs,
            sourceMentions: [{ section: 'WORK_EXPERIENCE', rawHeading: heading }],
          });
        }
      }

      // Education Section
      if (sec.sectionType === 'EDUCATION' && Array.isArray(sd.degrees)) {
        for (const rawDeg of sd.degrees) {
          const raw = String(rawDeg || '').trim();
          if (!raw) continue;
          const parts = raw
            .split(/[|,]/)
            .map((p) => p.trim())
            .filter(Boolean);
          if (parts.length >= 2) {
            educationList.push({
              institution: parts[1],
              degree: parts[0],
              fieldOfStudy: parts[2] || null,
              rawText: raw,
            });
          } else {
            educationList.push({
              institution: raw,
              degree: null,
              fieldOfStudy: null,
              rawText: raw,
            });
          }
        }
      }

      // Certifications
      if (sec.sectionType === 'CERTIFICATIONS' && Array.isArray(sd.certs)) {
        for (const c of sd.certs) {
          const trimmed = String(c || '').trim();
          if (trimmed && !certsList.includes(trimmed)) {
            certsList.push(trimmed);
          }
        }
      }
    }

    // Fallback: If no explicit SKILLS section or project skills produced skill claims, extract known tech skills mentioned in text
    if (skillsMap.size === 0) {
      for (const sec of rawSections) {
        const text = sec.rawText || '';
        const found = ResumeEntityResolver.extractTechnologiesFromText(text);
        for (const tech of found) {
          recordSkillMention(
            tech.name,
            {
              section: sec.sectionType || 'SUMMARY',
              context: `Mentioned in resume text: "${tech.name}"`,
            },
            RESUME_SKILL_SCOPES.GLOBAL
          );
        }
      }
    }

    // Stage 2: Generate Cohesive Canonical Claims (1 Entity -> 1 Cohesive Claim with N Mentions)
    const candidateClaims = [];
    const withUnverified = (ctx) => `${ctx} [Unverified User Claim]`;

    // 1. Contact Claims
    if (contactInfo.github) {
      candidateClaims.push({
        claimType: 'CONTACT',
        statement: `GitHub Profile: ${contactInfo.github}`,
        context: withUnverified('Extracted from Resume Header'),
        provenanceStatus: 'CLAIMED',
        isCorroborated: false,
        metadata: { contactType: 'GITHUB', url: contactInfo.github },
      });
    }
    if (contactInfo.linkedin) {
      candidateClaims.push({
        claimType: 'CONTACT',
        statement: `LinkedIn Profile: ${contactInfo.linkedin}`,
        context: withUnverified('Extracted from Resume Header'),
        provenanceStatus: 'CLAIMED',
        isCorroborated: false,
        metadata: { contactType: 'LINKEDIN', url: contactInfo.linkedin },
      });
    }
    if (contactInfo.leetcode) {
      candidateClaims.push({
        claimType: 'CONTACT',
        statement: `LeetCode Profile: ${contactInfo.leetcode}`,
        context: withUnverified('Extracted from Resume Header'),
        provenanceStatus: 'CLAIMED',
        isCorroborated: false,
        metadata: { contactType: 'LEETCODE', url: contactInfo.leetcode },
      });
    }
    if (contactInfo.email) {
      candidateClaims.push({
        claimType: 'CONTACT',
        statement: `Email: ${contactInfo.email}`,
        context: withUnverified('Extracted from Resume Header'),
        provenanceStatus: 'CLAIMED',
        isCorroborated: false,
        metadata: { contactType: 'EMAIL', value: contactInfo.email },
      });
    }
    if (contactInfo.phone) {
      candidateClaims.push({
        claimType: 'CONTACT',
        statement: `Phone: ${contactInfo.phone}`,
        context: withUnverified('Extracted from Resume Header'),
        provenanceStatus: 'CLAIMED',
        isCorroborated: false,
        metadata: { contactType: 'PHONE', value: contactInfo.phone },
      });
    }
    if (Array.isArray(contactInfo.urls)) {
      for (const u of contactInfo.urls) {
        if (
          !u.includes('github.com') &&
          !u.includes('linkedin.com') &&
          !u.includes('leetcode.com')
        ) {
          candidateClaims.push({
            claimType: 'CONTACT',
            statement: `Project/Portfolio URL: ${u}`,
            context: withUnverified('Extracted from Resume Header'),
            provenanceStatus: 'CLAIMED',
            isCorroborated: false,
            metadata: { contactType: 'PORTFOLIO_URL', url: u },
          });
        }
      }
    }

    // 2. Canonical Skill Claims (1 per unique canonical skill)
    for (const [slug, skill] of skillsMap.entries()) {
      let contextDesc = '';
      if (skill.scope === RESUME_SKILL_SCOPES.HYBRID) {
        const projectRefs = skill.relatedEntities
          .filter((r) => r.type === 'PROJECT')
          .map((r) => r.name);
        const expRefs = skill.relatedEntities
          .filter((r) => r.type === 'EXPERIENCE')
          .map((r) => r.name);
        const refParts = [];
        if (projectRefs.length > 0) refParts.push(`Projects: "${projectRefs.join('", "')}"`);
        if (expRefs.length > 0) refParts.push(`Experience: ${expRefs.join(', ')}`);
        contextDesc = `Declared in Skills & Demonstrated in ${refParts.join('; ')} (${skill.occurrenceCount} occurrences)`;
      } else if (skill.scope === RESUME_SKILL_SCOPES.GLOBAL) {
        contextDesc = `Declared in Technical Skills (${skill.occurrenceCount} mention${skill.occurrenceCount === 1 ? '' : 's'})`;
      } else if (skill.scope === RESUME_SKILL_SCOPES.PROJECT_SCOPED) {
        const projectNames = skill.relatedEntities.map((r) => r.name).join('", "');
        contextDesc = `Used in project "${projectNames}" (${skill.occurrenceCount} mention${skill.occurrenceCount === 1 ? '' : 's'})`;
      } else {
        const expNames = skill.relatedEntities.map((r) => r.name).join(', ');
        contextDesc = `Applied in work experience: ${expNames} (${skill.occurrenceCount} mention${skill.occurrenceCount === 1 ? '' : 's'})`;
      }

      candidateClaims.push({
        claimType: 'SKILL',
        statement: skill.name,
        context: withUnverified(contextDesc),
        provenanceStatus: 'CLAIMED',
        isCorroborated: false,
        metadata: {
          canonicalSlug: slug,
          canonicalName: skill.name,
          category: skill.category,
          tier: skill.tier,
          scope: skill.scope,
          occurrenceCount: skill.occurrenceCount,
          occurrences: skill.occurrences,
          relatedEntities: skill.relatedEntities,
        },
      });
    }

    // 3. Canonical Project Claims (1 per project entity)
    for (const proj of projectsList) {
      const techNames = proj.technologies.map((t) => t.name).join(', ');
      const statement = techNames ? `${proj.canonicalName} (${techNames})` : proj.canonicalName;
      const context = `Project highlighting ${proj.technologies.length} technologies and ${proj.bullets.length} achievements`;

      candidateClaims.push({
        claimType: 'PROJECT',
        statement,
        context: withUnverified(context),
        provenanceStatus: 'CLAIMED',
        isCorroborated: false,
        metadata: {
          projectName: proj.canonicalName,
          urls: proj.urls,
          technologies: proj.technologies,
          bullets: proj.bullets,
        },
      });
    }

    // 4. Canonical Work Experience Claims (1 per position entity)
    for (const exp of experiencesList) {
      const header = `${exp.role} at ${exp.company}${exp.startDate ? ' (' + exp.startDate + ')' : ''}`;
      const techNames = exp.technologiesUsed.map((t) => t.name).join(', ');
      const context = techNames
        ? `Work experience utilizing ${techNames} across ${exp.bullets.length} responsibilities`
        : `Work experience role with ${exp.bullets.length} responsibilities`;

      candidateClaims.push({
        claimType: 'EXPERIENCE',
        statement: header,
        context: withUnverified(context),
        provenanceStatus: 'CLAIMED',
        isCorroborated: false,
        metadata: {
          role: exp.role,
          company: exp.company,
          location: exp.location,
          dates: exp.startDate,
          bullets: exp.bullets,
          technologiesUsed: exp.technologiesUsed,
        },
      });
    }

    // 5. Canonical Education Claims (1 per degree/institution)
    for (const edu of educationList) {
      const stmt = edu.degree ? `${edu.degree} — ${edu.institution}` : edu.institution;
      candidateClaims.push({
        claimType: 'EDUCATION',
        statement: stmt,
        context: withUnverified('Extracted from Education section'),
        provenanceStatus: 'CLAIMED',
        isCorroborated: false,
        metadata: {
          institution: edu.institution,
          degree: edu.degree,
          fieldOfStudy: edu.fieldOfStudy,
        },
      });
    }

    // 6. Canonical Certification Claims
    for (const cert of certsList) {
      candidateClaims.push({
        claimType: 'CERTIFICATION',
        statement: cert,
        context: withUnverified('Extracted from Certifications section'),
        provenanceStatus: 'CLAIMED',
        isCorroborated: false,
        metadata: { certificationName: cert },
      });
    }

    // 7. Canonical Summary Claim
    if (summaryText) {
      candidateClaims.push({
        claimType: 'SUMMARY',
        statement: summaryText.slice(0, 500),
        context: withUnverified('Extracted from Professional Summary'),
        provenanceStatus: 'CLAIMED',
        isCorroborated: false,
        metadata: { fullLength: summaryText.length },
      });
    }

    return {
      canonicalSkills: skillsMap,
      canonicalProjects: projectsList,
      canonicalExperiences: experiencesList,
      canonicalEducation: educationList,
      canonicalCertifications: certsList,
      canonicalContact: contactInfo,
      canonicalSummary: summaryText,
      candidateClaims,
    };
  }
}
