/**
 * @file Resume Keyword Coverage Service
 *
 * Deterministic analysis of target job keywords vs resume text and structure:
 * 1. Categorizes matches strictly into:
 *    - EXACT: Literal string or canonical casing match (e.g. PostgreSQL -> PostgreSQL)
 *    - TAXONOMY_EQUIVALENT: Authorized alias in canonical taxonomy (e.g. Postgres -> PostgreSQL, JS -> JavaScript)
 *    - RELATED: Adjacent/ecosystem technology in relationship graph (e.g. SQL -> PostgreSQL)
 *    - MISSING: Required or preferred JD term absent from resume
 *    - UNSUPPORTED_CANDIDATE: Skill on resume without candidate evidence
 * 2. Enforces Rule 27: RELATED semantic matches CANNOT satisfy exact required technologies.
 * 3. Enforces Rule 4: Contextual placement tracking across sections (Summary, Skills, Experience, Projects, Education, Certifications).
 * 4. Enforces Rule 28: Heuristic explainable keyword stuffing detection (density and clustering vs paragraph size).
 * 5. Deterministic, auditable output validated against ResumeKeywordCoverageReportSchema.
 */

import { SkillTaxonomyEngine, CANONICAL_SKILLS } from '../domain/career/skill-taxonomy.js';
import { CANONICAL_TECH_MAP, normalizeTechnologyName } from '../utils/technology-normalizer.js';
import { ResumeKeywordCoverageReportSchema } from '../domain/career/resume-keyword-coverage.schemas.js';
import { defaultAtsParseabilityService } from './resume-ats-parseability.service.js';

export class ResumeKeywordCoverageService {
  /**
   * Analyzes keyword coverage between a target job and structured resume document.
   *
   * @param {object} params
   * @param {object} params.jobDescription Target job description or requirement model
   * @param {object} params.structuredResume Structured resume document or snapshot
   * @param {object} [params.candidateProfile] Optional candidate profile for verification audit
   * @returns {object} Validated ResumeKeywordCoverageReport
   */
  static analyzeKeywordCoverage({
    jobDescription,
    structuredResume,
    candidateProfile = null,
    pdfBuffer = null,
    extractedText = null,
    analyzedAt = null,
  }) {
    if (!jobDescription || typeof jobDescription !== 'object') {
      throw new Error('jobDescription must be a valid object');
    }
    if (!structuredResume || typeof structuredResume !== 'object') {
      throw new Error('structuredResume must be a valid object');
    }

    // 1. Extract and canonicalize job requirements and skills
    const jobTerms = ResumeKeywordCoverageService._extractJobTerms(jobDescription);

    // 2. Extract plain text and explicit term sets partitioned by section
    const sectionData = ResumeKeywordCoverageService._extractSectionData(structuredResume);

    // 2b. Extract artifact text if PDF buffer or extracted text provided
    let artifactText = extractedText || '';
    if (!artifactText && Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 50) {
      if (typeof defaultAtsParseabilityService?.pdfObserver?._extractTextStreams === 'function') {
        artifactText = defaultAtsParseabilityService.pdfObserver._extractTextStreams(pdfBuffer);
      }
    }

    // 2c. Candidate profile verified skill inventory
    const candidateSkills = new Set();
    if (candidateProfile) {
      const profSkills = candidateProfile.profileMetadata?.skills || candidateProfile.skills || [];
      for (const s of profSkills) {
        const sName = typeof s === 'string' ? s : s.name;
        if (sName) {
          const norm = SkillTaxonomyEngine.normalizeSkill(sName);
          if (norm?.canonicalSlug) candidateSkills.add(norm.canonicalSlug);
        }
      }
      const profProjects =
        candidateProfile.profileMetadata?.projects || candidateProfile.projects || [];
      for (const p of profProjects) {
        for (const t of p.technologies || []) {
          const norm = SkillTaxonomyEngine.normalizeSkill(t);
          if (norm?.canonicalSlug) candidateSkills.add(norm.canonicalSlug);
        }
      }
    }

    // 3. Evaluate each job term against the section data
    const termBreakdown = [];
    const stuffingWarnings = [];
    const placementMap = new Map();
    const unrenderedTerms = [];

    let exactMatches = 0;
    let taxonomyMatches = 0;
    let semanticMatches = 0;
    let missingTerms = 0;
    let criticalMissingTerms = 0;

    let requiredTerms = 0;
    let preferredTerms = 0;
    let totalPossibleWeight = 0;
    let intendedSatisfiedWeight = 0;
    let renderedSatisfiedWeight = 0;

    for (const jobTerm of jobTerms) {
      const isRequired = jobTerm.importance === 'REQUIRED';
      if (isRequired) requiredTerms++;
      else preferredTerms++;

      const termWeight = isRequired ? 2.0 : 1.0;
      totalPossibleWeight += termWeight;

      const evalResult = ResumeKeywordCoverageService._evaluateTermAgainstSections(
        jobTerm,
        sectionData
      );

      // Candidate authorization check: skill claimed on resume must have backing in candidate profile
      let candidateAuthorization = 'UNKNOWN';
      if (candidateProfile) {
        const isAuthorizedByCandidate =
          candidateSkills.has(evalResult.canonicalSlug) ||
          candidateSkills.has(jobTerm.canonicalSlug);
        if (isAuthorizedByCandidate) {
          candidateAuthorization = 'AUTHORIZED';
        } else {
          candidateAuthorization = 'EVIDENCE_MISSING';
          if (evalResult.matchType === 'EXACT' || evalResult.matchType === 'TAXONOMY_EQUIVALENT') {
            evalResult.matchType = 'UNSUPPORTED_CANDIDATE';
            evalResult.satisfiesRequirement = false;
            evalResult.explanation = `Claimed in resume without backing evidence in candidate profile for technology '${jobTerm.term}'.`;
          }
        }
      }
      evalResult.candidateAuthorization = candidateAuthorization;

      // Dual-Property Visibility Tracking (Rules 25 & 27)
      const intendedPresence = evalResult.occurrences > 0;
      evalResult.intendedPresence = intendedPresence;

      let artifactPresence = intendedPresence;
      let isRendered = true;
      const intendedSatisfies = evalResult.intendedPresence && evalResult.satisfiesRequirement;

      if (artifactText) {
        const cleanArtifact = artifactText.toLowerCase();
        const rawCheck = (str) => {
          const escaped = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(`(?:^|[^a-zA-Z0-9+#.])${escaped}(?:$|[^a-zA-Z0-9+#.])`, 'i').test(
            cleanArtifact
          );
        };

        artifactPresence = rawCheck(jobTerm.term) || rawCheck(evalResult.canonicalName);
        if (!artifactPresence && evalResult.matchedResumeTerm) {
          artifactPresence = rawCheck(evalResult.matchedResumeTerm);
        }
        isRendered = artifactPresence;
        evalResult.artifactPresence = artifactPresence;
        evalResult.isRendered = isRendered;

        if (intendedPresence && !artifactPresence) {
          unrenderedTerms.push(jobTerm.term);
          evalResult.explanation += ` [KEYWORD_NOT_RENDERED: Planned in structured resume but missing from compiled PDF artifact]`;
          evalResult.satisfiesRequirement = false;
        }
      } else {
        evalResult.artifactPresence = intendedPresence;
        evalResult.isRendered = true;
      }

      const renderedSatisfies = evalResult.isRendered && evalResult.satisfiesRequirement;

      termBreakdown.push(evalResult);

      if (evalResult.matchType === 'EXACT') {
        exactMatches++;
        if (intendedSatisfies) intendedSatisfiedWeight += termWeight;
        if (renderedSatisfies) renderedSatisfiedWeight += termWeight;
      } else if (evalResult.matchType === 'TAXONOMY_EQUIVALENT') {
        taxonomyMatches++;
        if (intendedSatisfies) intendedSatisfiedWeight += termWeight;
        if (renderedSatisfies) renderedSatisfiedWeight += termWeight;
      } else if (evalResult.matchType === 'RELATED') {
        semanticMatches++;
        // Rule 27: RELATED semantic matches cannot satisfy exact required technologies!
        if (!isRequired) {
          if (intendedSatisfies) intendedSatisfiedWeight += termWeight * 0.5;
          if (renderedSatisfies) renderedSatisfiedWeight += termWeight * 0.5;
        }
      } else if (
        evalResult.matchType === 'MISSING' ||
        evalResult.matchType === 'UNSUPPORTED_CANDIDATE'
      ) {
        missingTerms++;
        if (isRequired) {
          criticalMissingTerms++;
        }
      }

      // Track placements for terms that were found in the resume
      if (evalResult.occurrences > 0) {
        placementMap.set(evalResult.canonicalSlug, {
          keyword: jobTerm.term,
          canonicalSkill: evalResult.canonicalName,
          category: jobTerm.category || 'TOOL',
          occurrences: evalResult.occurrences,
          sections: evalResult.placements,
          contextualBreadthScore: Math.min(
            1.0,
            evalResult.placements.filter((p) => p !== 'header').length / 3.0
          ),
          isNaturalUsage: true,
          stuffingWarning: null,
        });
      }
    }

    // 4. Rule 28: Heuristic explainable keyword stuffing detection
    // Restricted strictly to target job terms or canonical technology definitions
    for (const [sectionKey, sData] of Object.entries(sectionData.sections)) {
      const wordCount = sData.wordCount;
      if (wordCount < 15) continue; // Too short for statistical density check

      for (const [token, count] of sData.termCounts.entries()) {
        if (count >= 4) {
          const isJdTermOrTech =
            jobTerms.some(
              (jt) =>
                jt.canonicalSlug === token ||
                jt.term.toLowerCase() === token ||
                jt.canonicalName.toLowerCase() === token
            ) ||
            CANONICAL_SKILLS[token] !== undefined ||
            CANONICAL_TECH_MAP[token] !== undefined;

          if (!isJdTermOrTech) continue;

          const density = (count * token.split(/\s+/).length) / wordCount;
          if (density > 0.15 && wordCount >= 15) {
            const warning = {
              term: token,
              section: sectionKey,
              occurrences: count,
              densityScore: Math.min(1.0, Math.round(density * 100) / 100),
              reason: `Term '${token}' appears ${count} times in the ${sectionKey} section (${Math.round(density * 100)}% word density), indicating potential keyword stuffing without complementary engineering mechanisms.`,
            };
            stuffingWarnings.push(warning);

            const placement = placementMap.get(token.toLowerCase().replace(/[^a-z0-9]/g, '-'));
            if (placement) {
              placement.isNaturalUsage = false;
              placement.stuffingWarning = warning.reason;
            }
          }
        }
      }
    }

    const keywordPlacements = Array.from(placementMap.values());

    // 5. Compute intended and rendered coverage percentages
    const intendedCoveragePercent =
      totalPossibleWeight > 0
        ? Math.min(
            100,
            Math.max(0, Math.round((intendedSatisfiedWeight / totalPossibleWeight) * 100))
          )
        : 100;

    const renderedCoveragePercent =
      totalPossibleWeight > 0
        ? Math.min(
            100,
            Math.max(0, Math.round((renderedSatisfiedWeight / totalPossibleWeight) * 100))
          )
        : 100;

    // The rendered PDF is the final ground truth (Rule 25)
    const overallCoveragePercent = artifactText ? renderedCoveragePercent : intendedCoveragePercent;

    // Inspectable Multi-Factor Confidence (Weakness 1)
    const pdfExtractionQuality =
      Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 50
        ? artifactText && artifactText.length >= 250 && !/[\uFFFD]/.test(artifactText)
          ? 0.98
          : 0.88
        : extractedText
          ? 0.85
          : 0.75;

    const requirementExtractionQuality =
      jobTerms.length > 0
        ? Math.round(
            (jobTerms.filter((t) => CANONICAL_SKILLS[t.canonicalSlug] !== undefined).length /
              jobTerms.length) *
              100
          ) / 100
        : 1.0;

    const taxonomyResolution =
      termBreakdown.length > 0
        ? Math.round(
            (termBreakdown.filter(
              (t) => t.matchType !== 'MISSING' && t.matchType !== 'UNSUPPORTED_CANDIDATE'
            ).length /
              Math.max(1, termBreakdown.length)) *
              100
          ) / 100
        : 1.0;

    const nonMissingMatches = termBreakdown.filter((t) => t.matchType !== 'MISSING');
    const authorizedMatches = nonMissingMatches.filter(
      (t) => t.candidateAuthorization === 'AUTHORIZED'
    );
    const rawEvidenceCoverage =
      candidateSkills.size > 0
        ? nonMissingMatches.length > 0
          ? Math.round((authorizedMatches.length / nonMissingMatches.length) * 100) / 100
          : 0.85
        : candidateProfile
          ? 0.7
          : 1.0;

    const evidenceCoverage = Math.min(1.0, Math.max(0.5, rawEvidenceCoverage));

    const confidenceFactors = {
      pdfExtractionQuality: Math.min(1.0, Math.max(0.5, pdfExtractionQuality)),
      requirementExtractionQuality: Math.min(1.0, Math.max(0.5, requirementExtractionQuality)),
      taxonomyResolution: Math.min(1.0, Math.max(0.6, taxonomyResolution)),
      evidenceCoverage,
    };

    const compositeConfidence = Math.min(
      1.0,
      Math.max(
        0.5,
        Math.round(
          (0.35 * confidenceFactors.pdfExtractionQuality +
            0.25 * confidenceFactors.requirementExtractionQuality +
            0.2 * confidenceFactors.taxonomyResolution +
            0.2 * confidenceFactors.evidenceCoverage) *
            100
        ) / 100
      )
    );

    const report = {
      overallCoveragePercent,
      intendedCoveragePercent,
      renderedCoveragePercent,
      totalJobTerms: jobTerms.length,
      requiredTerms,
      preferredTerms,
      exactMatches,
      taxonomyMatches,
      semanticMatches,
      missingTerms,
      criticalMissingTerms,
      unrenderedTerms,
      termBreakdown,
      keywordPlacements,
      stuffingWarnings,
      confidence: compositeConfidence,
      confidenceFactors,
      analyzedAt: analyzedAt ? new Date(analyzedAt).toISOString() : new Date().toISOString(),
    };

    return ResumeKeywordCoverageReportSchema.parse(report);
  }

  /**
   * Extracts distinct required and preferred skill/technology terms from job description.
   * @private
   */
  static _extractJobTerms(jobDescription) {
    const termsMap = new Map();

    // 1. Structured requirements
    if (Array.isArray(jobDescription.requirements)) {
      for (const req of jobDescription.requirements) {
        const raw =
          typeof req === 'string'
            ? req
            : req.text || req.concept || req.term || req.extractedValue || req.name || req.skill;
        if (!raw || typeof raw !== 'string') continue;
        const norm = SkillTaxonomyEngine.normalizeSkill(raw);
        if (!norm || norm.isNoise) continue;

        const importance =
          typeof req === 'object' && (req.importance === 'PREFERRED' || req.isPreferred)
            ? 'PREFERRED'
            : 'REQUIRED';

        termsMap.set(norm.canonicalSlug, {
          term: raw.trim(),
          canonicalSlug: norm.canonicalSlug,
          canonicalName: norm.canonicalName,
          category: norm.category,
          importance,
          relationships: norm.relationships || { builtOn: [], ecosystemOf: [], implements: [] },
        });
      }
    }

    // 2. Structured skills array
    if (Array.isArray(jobDescription.skills)) {
      for (const s of jobDescription.skills) {
        const raw =
          typeof s === 'string'
            ? s
            : s.text || s.name || s.skillName || s.extractedValue || s.skill || s.term;
        if (!raw || typeof raw !== 'string') continue;
        const norm = SkillTaxonomyEngine.normalizeSkill(raw);
        if (!norm || norm.isNoise) continue;

        if (!termsMap.has(norm.canonicalSlug)) {
          const importance =
            typeof s === 'object' && (s.importance === 'PREFERRED' || s.optional)
              ? 'PREFERRED'
              : 'REQUIRED';

          termsMap.set(norm.canonicalSlug, {
            term: raw.trim(),
            canonicalSlug: norm.canonicalSlug,
            canonicalName: norm.canonicalName,
            category: norm.category,
            importance,
            relationships: norm.relationships || { builtOn: [], ecosystemOf: [], implements: [] },
          });
        }
      }
    }

    // 3. Fallback: Parse description if 0 structured terms found
    if (termsMap.size === 0 && jobDescription.description) {
      const words = String(jobDescription.description).match(/[a-zA-Z0-9+#.]+/g) || [];
      for (const w of words) {
        if (w.length < 2) continue;
        const norm = SkillTaxonomyEngine.normalizeSkill(w);
        if (norm && norm.isKnown && !norm.isNoise) {
          if (!termsMap.has(norm.canonicalSlug)) {
            termsMap.set(norm.canonicalSlug, {
              term: norm.canonicalName,
              canonicalSlug: norm.canonicalSlug,
              canonicalName: norm.canonicalName,
              category: norm.category,
              importance: 'REQUIRED',
              relationships: norm.relationships || { builtOn: [], ecosystemOf: [], implements: [] },
            });
          }
        }
      }
    }

    return Array.from(termsMap.values());
  }

  /**
   * Extracts text, tokens, and counts partitioned by resume section.
   * @private
   */
  static _extractSectionData(structuredResume) {
    const doc = structuredResume.structuredResume || structuredResume;

    const sections = {
      header: {
        text:
          typeof doc.header === 'string'
            ? doc.header
            : [
                doc.header?.name,
                doc.header?.email,
                doc.header?.phone,
                doc.header?.headline,
                doc.candidateIdentity?.displayName,
                doc.candidateIdentity?.name,
                doc.candidateIdentity?.headline,
              ]
                .filter(Boolean)
                .join(' '),
        termCounts: new Map(),
        wordCount: 0,
      },
      summary: {
        text: typeof doc.summary === 'string' ? doc.summary : doc.summary?.text || '',
        termCounts: new Map(),
        wordCount: 0,
      },
      skills: { text: '', termCounts: new Map(), wordCount: 0 },
      experience: { text: '', termCounts: new Map(), wordCount: 0 },
      projects: { text: '', termCounts: new Map(), wordCount: 0 },
      education: { text: '', termCounts: new Map(), wordCount: 0 },
      certifications: { text: '', termCounts: new Map(), wordCount: 0 },
      dsa: { text: '', termCounts: new Map(), wordCount: 0 },
    };

    // Skills
    if (Array.isArray(doc.skills?.categories)) {
      const skillTokens = [];
      for (const cat of doc.skills.categories) {
        if (Array.isArray(cat.skills)) {
          for (const s of cat.skills) {
            const name = typeof s === 'string' ? s : s.name;
            if (name) skillTokens.push(name);
          }
        }
      }
      sections.skills.text = skillTokens.join(' ');
    } else if (Array.isArray(doc.skills)) {
      sections.skills.text = doc.skills.map((s) => (typeof s === 'string' ? s : s.name)).join(' ');
    }

    // Experience
    if (Array.isArray(doc.experience)) {
      const expParts = [];
      for (const exp of doc.experience) {
        if (exp.title) expParts.push(exp.title);
        if (exp.company) expParts.push(exp.company);
        if (Array.isArray(exp.bullets)) {
          for (const b of exp.bullets) {
            expParts.push(typeof b === 'string' ? b : b.text || '');
          }
        }
      }
      sections.experience.text = expParts.join(' ');
    }

    // Projects
    if (Array.isArray(doc.projects)) {
      const projParts = [];
      for (const p of doc.projects) {
        if (p.name) projParts.push(p.name);
        if (p.displayName) projParts.push(p.displayName);
        if (Array.isArray(p.technologies)) projParts.push(p.technologies.join(' '));
        if (Array.isArray(p.bullets)) {
          for (const b of p.bullets) {
            projParts.push(typeof b === 'string' ? b : b.text || '');
          }
        }
      }
      sections.projects.text = projParts.join(' ');
    }

    // Education
    if (Array.isArray(doc.education)) {
      const eduParts = [];
      for (const ed of doc.education) {
        if (ed.institution) eduParts.push(ed.institution);
        if (ed.degree) eduParts.push(ed.degree);
        if (ed.fieldOfStudy) eduParts.push(ed.fieldOfStudy);
        if (Array.isArray(ed.coursework)) eduParts.push(ed.coursework.join(' '));
      }
      sections.education.text = eduParts.join(' ');
    }

    // Certifications
    if (Array.isArray(doc.certifications)) {
      const certParts = [];
      for (const c of doc.certifications) {
        if (c.name) certParts.push(c.name);
        if (c.issuingOrganization) certParts.push(c.issuingOrganization);
      }
      sections.certifications.text = certParts.join(' ');
    }

    // DSA
    if (doc.dsa?.hasSection) {
      const dsaParts = [];
      if (doc.dsa.profileUrl) dsaParts.push(doc.dsa.profileUrl);
      if (Array.isArray(doc.dsa.bullets)) {
        for (const b of doc.dsa.bullets) {
          dsaParts.push(typeof b === 'string' ? b : b.text || '');
        }
      }
      sections.dsa.text = dsaParts.join(' ');
    }

    // Index terms and word counts for each section
    for (const s of Object.values(sections)) {
      const words = s.text.match(/[a-zA-Z0-9+#.]+/g) || [];
      s.wordCount = words.length;
      for (const w of words) {
        const lower = w.toLowerCase();
        s.termCounts.set(lower, (s.termCounts.get(lower) || 0) + 1);
      }
    }

    return { sections };
  }

  /**
   * Evaluates a single job term against all resume sections to find exact, taxonomy, or related matches.
   * @private
   */
  static _evaluateTermAgainstSections(jobTerm, sectionData) {
    const rawTerm = jobTerm.term;
    const slug = jobTerm.canonicalSlug;
    const canonicalDef = CANONICAL_SKILLS[slug] || null;

    // Gather aliases for taxonomy equivalence
    const taxonomyAliases = new Set();
    taxonomyAliases.add(slug);
    taxonomyAliases.add(rawTerm.toLowerCase());
    if (canonicalDef && Array.isArray(canonicalDef.aliases)) {
      for (const alias of canonicalDef.aliases) {
        taxonomyAliases.add(alias.toLowerCase());
      }
    }
    // Also check CANONICAL_TECH_MAP
    for (const [aliasKey, canonName] of Object.entries(CANONICAL_TECH_MAP)) {
      if (canonName.toLowerCase() === jobTerm.canonicalName.toLowerCase()) {
        taxonomyAliases.add(aliasKey.toLowerCase());
      }
    }

    // Gather related technologies (builtOn, ecosystemOf, implements)
    const relatedSlugs = new Set();
    if (canonicalDef?.relationships) {
      const rels = canonicalDef.relationships;
      const candidates = [
        ...(Array.isArray(rels.builtOn) ? rels.builtOn : []),
        ...(Array.isArray(rels.ecosystemOf) ? rels.ecosystemOf : []),
        ...(Array.isArray(rels.implements) ? rels.implements : []),
      ];
      for (const cand of candidates) {
        const candDef = CANONICAL_SKILLS[cand];
        if (!candDef) continue;
        // An implementation language (e.g. Go for Kubernetes, or C for PostgreSQL) is NOT a related user skill
        if (candDef.category === 'LANGUAGE' && jobTerm.category !== 'LANGUAGE') continue;
        if (candDef.category === jobTerm.category || cand === 'sql') {
          relatedSlugs.add(cand);
        }
      }
    }

    // Look for occurrences across sections
    let exactFound = false;
    let taxonomyFound = false;
    let relatedFound = false;
    let matchedResumeTerm = null;
    let relationshipType = null;
    let totalOccurrences = 0;
    const matchedSections = new Set();

    const checkRegex = (termStr) => {
      // Escape regex special chars except + and #
      const escaped = termStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:^|[^a-zA-Z0-9+#.])${escaped}(?:$|[^a-zA-Z0-9+#.])`, 'i');
    };

    const exactRegex = checkRegex(rawTerm);

    for (const [secKey, sec] of Object.entries(sectionData.sections)) {
      if (!sec.text) continue;

      // 1. Check exact match
      const exactMatch = exactRegex.test(sec.text);
      if (exactMatch) {
        exactFound = true;
        matchedResumeTerm = rawTerm;
        matchedSections.add(secKey);
        // Count exact occurrences in this section
        const mCount = (sec.text.match(new RegExp(exactRegex.source, 'gi')) || []).length;
        totalOccurrences += mCount;
        continue;
      }

      // 2. Check taxonomy equivalent aliases
      let aliasMatchedInSec = false;
      for (const alias of taxonomyAliases) {
        const aRegex = checkRegex(alias);
        if (aRegex.test(sec.text)) {
          taxonomyFound = true;
          aliasMatchedInSec = true;
          if (!matchedResumeTerm) matchedResumeTerm = alias;
          matchedSections.add(secKey);
          const mCount = (sec.text.match(new RegExp(aRegex.source, 'gi')) || []).length;
          totalOccurrences += mCount;
          break;
        }
      }
      if (aliasMatchedInSec) continue;

      // 3. Check related technologies in relationship graph
      for (const relSlug of relatedSlugs) {
        const relDef = CANONICAL_SKILLS[relSlug];
        const relTerms = [relSlug, relDef?.name].filter(Boolean);
        for (const rt of relTerms) {
          const rRegex = checkRegex(rt);
          if (rRegex.test(sec.text)) {
            relatedFound = true;
            if (!matchedResumeTerm) {
              matchedResumeTerm = rt;
              relationshipType = 'BUILT_ON/ECOSYSTEM';
            }
            matchedSections.add(secKey);
            const mCount = (sec.text.match(new RegExp(rRegex.source, 'gi')) || []).length;
            totalOccurrences += mCount;
            break;
          }
        }
      }
    }

    const placements = Array.from(matchedSections);

    // Detect polarity across matched sections
    let overallPolarity = 'POSITIVE';
    if (exactFound || taxonomyFound || relatedFound) {
      const termToTest = matchedResumeTerm || rawTerm;
      const polarities = [];
      for (const sKey of matchedSections) {
        const p = ResumeKeywordCoverageService.detectKeywordPolarity(
          sectionData.sections[sKey]?.text,
          termToTest
        );
        polarities.push(p);
      }
      if (polarities.includes('POSITIVE')) {
        overallPolarity = 'POSITIVE';
      } else if (polarities.includes('NEGATED')) {
        overallPolarity = 'NEGATED';
      } else if (polarities.includes('ASPIRATIONAL')) {
        overallPolarity = 'ASPIRATIONAL';
      } else if (polarities.includes('CONTEXT_ONLY')) {
        overallPolarity = 'CONTEXT_ONLY';
      }
    }

    let matchType = 'MISSING';
    let satisfiesRequirement = false;
    let explanation = `Requirement '${rawTerm}' is missing from the resume.`;

    if (exactFound) {
      matchType = 'EXACT';
      satisfiesRequirement = true;
      explanation = `Exact match for '${rawTerm}' found in ${placements.join(', ')}.`;
    } else if (taxonomyFound) {
      matchType = 'TAXONOMY_EQUIVALENT';
      satisfiesRequirement = true;
      explanation = `Taxonomy equivalent '${matchedResumeTerm}' for '${rawTerm}' found in ${placements.join(', ')}.`;
    } else if (relatedFound) {
      matchType = 'RELATED';
      // Rule 27: RELATED cannot satisfy exact required technologies
      if (jobTerm.importance === 'REQUIRED') {
        satisfiesRequirement = false;
        explanation = `Related technology '${matchedResumeTerm}' found in ${placements.join(', ')}, but cannot satisfy required skill '${rawTerm}' (Rule 27).`;
      } else {
        satisfiesRequirement = true;
        explanation = `Related technology '${matchedResumeTerm}' found in ${placements.join(', ')} for preferred requirement.`;
      }
    }

    // Check polarity: Negated, Aspirational, and Context-Only cannot satisfy requirements!
    if (overallPolarity !== 'POSITIVE') {
      satisfiesRequirement = false;
      explanation = `Term '${rawTerm}' detected with ${overallPolarity} intent (e.g. disclaimed, aspirational, or external context) and does not satisfy requirement.`;
    }

    // Check Attack F: Keywords occurring ONLY in header/contact details cannot satisfy technical requirements
    const nonHeaderPlacements = placements.filter((p) => p !== 'header');
    if (placements.length > 0 && nonHeaderPlacements.length === 0) {
      satisfiesRequirement = false;
      explanation = `Term '${rawTerm}' found only in header/contact details; technical skills must be substantiated in substantive sections (Skills, Projects, Experience).`;
    }

    return {
      term: rawTerm,
      canonicalSlug: slug,
      canonicalName: jobTerm.canonicalName,
      importance: jobTerm.importance,
      matchType,
      satisfiesRequirement,
      polarity: overallPolarity,
      matchedResumeTerm,
      placements,
      occurrences: totalOccurrences,
      relationshipType,
      explanation,
    };
  }

  /**
   * Detects semantic polarity and candidate intent for a keyword mention.
   * Recognizes POSITIVE (active competence), NEGATED (disclaims skill),
   * ASPIRATIONAL (desire to learn), and CONTEXT_ONLY (external comparison).
   */
  static detectKeywordPolarity(sectionText, termStr) {
    if (!sectionText || !termStr) return 'POSITIVE';
    const escaped = termStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|[^a-zA-Z0-9+#.])(${escaped})(?:$|[^a-zA-Z0-9+#.])`, 'gi');

    const negationPattern =
      /\b(?:no\s+experience(?:\s+with|\s+in)?|not\s+(?:familiar|experienced)(?:\s+with)?|never\s+used|haven't\s+used|have\s+not\s+used|without\s+using|zero\s+knowledge\s+of|lack(?:\s+of)?|neither|nor|was\s+not\s+used|was\s+not\s+required|not\s+allowed|not\s+supported|not\s+used)\b/i;
    const aspirationalPattern =
      /\b(?:interested\s+in\s+learning|eager\s+to\s+learn|looking\s+to\s+learn|aspiring\s+to|currently\s+(?:studying|learning|exploring)|hoping\s+to|aiming\s+to|plan(?:\s+to)?\s+learn)\b/i;
    const contextOnlyPattern =
      /\b(?:migrated\s+away\s+from|replaced\s+.*\s+with|evaluated\s+.*\s+but|was\s+not\s+required|not\s+needed|in\s+contrast\s+to|alternative\s+to)\b/i;

    let match;
    let hasPositive = false;
    let nonPositivePolarity = null;

    while ((match = regex.exec(sectionText)) !== null) {
      const idx = match.index;
      const start = Math.max(0, idx - 80);
      const end = Math.min(sectionText.length, idx + match[0].length + 60);
      const windowText = sectionText.slice(start, end);

      if (negationPattern.test(windowText)) {
        nonPositivePolarity = 'NEGATED';
      } else if (aspirationalPattern.test(windowText)) {
        if (!nonPositivePolarity) nonPositivePolarity = 'ASPIRATIONAL';
      } else if (contextOnlyPattern.test(windowText)) {
        if (!nonPositivePolarity) nonPositivePolarity = 'CONTEXT_ONLY';
      } else {
        hasPositive = true;
      }
    }

    if (hasPositive) return 'POSITIVE';
    return nonPositivePolarity || 'POSITIVE';
  }
}

export default ResumeKeywordCoverageService;
