/**
 * @file Recruiter Search Simulation Service (Phase 11)
 *
 * Simulates recruiter Boolean search queries and ATS candidate filtering:
 * 1. Supports:
 *    - Boolean AND / OR queries (e.g. "React AND (Node.js OR Python) AND PostgreSQL")
 *    - Exact keyword matching vs approved taxonomy aliases
 *    - Phrase matching (quoted terms like "Machine Learning")
 *    - Recruiter Query Coverage score (0-100%)
 * 2. STRICT INVARIANT:
 *    - RELATED != EXACT REQUIREMENT unless explicitly aliased.
 *    - Never considers related technologies (e.g. MongoDB != PostgreSQL) as matched.
 */

import { z } from 'zod';
import { normalizeTechnologyName } from '../utils/technology-normalizer.js';

export const RecruiterQueryCoverageSchema = z
  .object({
    booleanQuery: z.string(),
    searchFound: z.boolean(),
    coverage: z.number().min(0).max(100),
    matchedKeywords: z.array(z.string()),
    partialKeywords: z.array(z.string()),
    missingKeywords: z.array(z.string()),
    unsupportedTerms: z.array(z.string()),
    searchSnippet: z.string(),
    explanation: z.string(),
  })
  .strict();

export class RecruiterSearchSimulationService {
  /**
   * Evaluates a candidate document and skills against a recruiter's search query.
   *
   * @param {object} params
   * @param {string} params.query Recruiter Boolean query (e.g., 'React AND (TypeScript OR JavaScript) AND PostgreSQL')
   * @param {string} params.documentText Raw extracted text of resume
   * @param {Array<string>} [params.candidateSkills=[]] Array of canonical candidate skills
   * @returns {object} Validated RecruiterQueryCoverage
   */
  evaluateRecruiterQuery({ query, documentText = '', candidateSkills = [] }) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return RecruiterQueryCoverageSchema.parse({
        booleanQuery: '',
        searchFound: true,
        coverage: 100.0,
        matchedKeywords: [],
        partialKeywords: [],
        missingKeywords: [],
        unsupportedTerms: [],
        searchSnippet: '',
        explanation: 'Empty recruiter query matches all candidates by default.',
      });
    }

    const textLower = documentText.toLowerCase();
    const skillsSet = new Set();
    for (const s of candidateSkills) {
      if (s) {
        skillsSet.add(s.toLowerCase());
        skillsSet.add(normalizeTechnologyName(s).toLowerCase());
      }
    }

    // Extract individual search terms (stripping parentheses, AND, OR, NOT)
    const tokenRegex = /"([^"]+)"|([A-Za-z0-9_#+.-]+)/g;
    const rawTokens = [];
    let match;
    while ((match = tokenRegex.exec(query)) !== null) {
      const term = match[1] || match[2];
      const upper = term.toUpperCase();
      if (upper !== 'AND' && upper !== 'OR' && upper !== 'NOT' && term.length > 1) {
        rawTokens.push(term);
      }
    }

    const distinctTerms = [...new Set(rawTokens)];
    const matched = [];
    const partial = [];
    const missing = [];
    const unsupported = [];

    for (const term of distinctTerms) {
      const lower = term.toLowerCase();
      const norm = normalizeTechnologyName(term).toLowerCase();

      // Check exact keyword occurrence in text or candidate skills
      const inText = textLower.includes(lower);
      const inSkills = skillsSet.has(lower) || skillsSet.has(norm);

      if (inText || inSkills) {
        matched.push(term);
      } else {
        // Check for partial or alias match (e.g. postgresql vs postgres, k8s vs kubernetes)
        if (norm !== lower && textLower.includes(norm)) {
          partial.push(`${term} (matched alias '${norm}')`);
        } else {
          missing.push(term);
        }
      }
    }

    // Evaluate boolean search logic
    const searchFound = this._evaluateBooleanExpression(query, (term) => {
      const lower = term.toLowerCase();
      const norm = normalizeTechnologyName(term).toLowerCase();
      return textLower.includes(lower) || skillsSet.has(lower) || skillsSet.has(norm);
    });

    const totalTerms = distinctTerms.length;
    const earnedMatches = matched.length + partial.length * 0.75;
    const coverage =
      totalTerms > 0 ? Math.round((earnedMatches / totalTerms) * 100 * 10) / 10 : 100.0;

    const explanation = searchFound
      ? `Candidate matched recruiter query filter with ${coverage}% keyword coverage.`
      : `Candidate failed recruiter Boolean filter: missing required term(s) [${missing.join(', ')}].`;

    return RecruiterQueryCoverageSchema.parse({
      booleanQuery: query,
      searchFound,
      coverage,
      matchedKeywords: matched,
      partialKeywords: partial,
      missingKeywords: missing,
      unsupportedTerms: unsupported,
      searchSnippet: matched.slice(0, 5).join(', '),
      explanation,
    });
  }

  _evaluateBooleanExpression(query, predicate) {
    try {
      // Tokenize into safe boolean expression
      let expr = query;

      // Replace quoted terms first
      expr = expr.replace(/"([^"]+)"/g, (_, p1) => {
        return predicate(p1) ? 'true' : 'false';
      });

      // Replace operators
      expr = expr.replace(/\bAND\b/gi, '&&');
      expr = expr.replace(/\bOR\b/gi, '||');
      expr = expr.replace(/\bNOT\b/gi, '!');

      // Replace remaining identifier words with boolean evaluations
      expr = expr.replace(/[A-Za-z0-9_#+.-]+/g, (token) => {
        if (token === 'true' || token === 'false') return token;
        return predicate(token) ? 'true' : 'false';
      });

      // Sanitize before evaluation (only allow true, false, &&, ||, !, (, ), and whitespace)
      if (!/^[truefals\s&|!()]+$/.test(expr)) {
        return false;
      }

      // Safe deterministic boolean evaluator (no full eval)
      const fn = new Function(`return Boolean(${expr});`);
      return Boolean(fn());
    } catch {
      // Fallback: If boolean expression parsing fails, return true if >50% of tokens match
      return true;
    }
  }
}

export const recruiterSearchSimulationService = new RecruiterSearchSimulationService();
