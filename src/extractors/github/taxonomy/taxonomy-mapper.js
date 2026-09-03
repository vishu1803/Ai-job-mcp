/**
 * @file Canonical Skill Taxonomy & Normalization Adapter (P4-003 / P5-002)
 *
 * Normalizes multi-ecosystem package dependencies, module imports, and configuration
 * artifacts to canonical global skill slugs, official display names, and approved categories.
 * Delegates to canonical domain engine (src/domain/career/skill-taxonomy.js) for unified,
 * high-performance deterministic mapping.
 */

import { SkillTaxonomyEngine } from '../../../domain/career/skill-taxonomy.js';
import { SkillWorthinessGate } from '../../../domain/career/skill-worthiness-gate.js';

export class TaxonomyMapper {
  /**
   * Precompiled alias catalog dictionary for backward-compatible ingestion.
   */
  static TAXONOMY_CATALOG = SkillTaxonomyEngine.getAliasCatalog();

  /**
   * Normalizes a raw package, dependency, or tool identifier to canonical skill metadata.
   *
   * @param {string} rawIdentifier - Raw package name, import path, or tool keyword.
   * @param {string} [categoryHint='TOOL'] - Fallback category if unmapped.
   * @returns {{ slug: string, name: string, category: 'LANGUAGE' | 'FRAMEWORK' | 'DATABASE' | 'CLOUD_DEVOPS' | 'TOOL' | 'ARCHITECTURE' | 'CONCEPT' }}
   */
  static normalize(rawIdentifier, categoryHint = 'TOOL') {
    const result = SkillTaxonomyEngine.normalizeSkill(rawIdentifier, { categoryHint });
    const gateEval = SkillWorthinessGate.evaluate(rawIdentifier);

    if (!result) {
      const fallback = {
        slug: 'unknown-tool',
        name: 'Unknown Tool',
        category: 'TOOL',
      };
      Object.defineProperties(fallback, {
        isNoise: { value: true, enumerable: false, writable: true, configurable: true },
        isSkillWorthy: { value: false, enumerable: false, writable: true, configurable: true },
        parentMappings: { value: null, enumerable: false, writable: true, configurable: true },
      });
      return fallback;
    }

    // A known catalog technology (e.g. pg -> postgresql) is skill-worthy and not noise
    const isKnownValid = result.isKnown && result.category !== 'NOISE' && !result.isNoise;
    const isRejected =
      !isKnownValid && (!gateEval.isSkillWorthy || result.isNoise || result.category === 'NOISE');
    const category = isRejected ? 'NOISE' : result.category;

    const out = {
      slug: result.canonicalSlug,
      name: result.canonicalName,
      category,
    };
    Object.defineProperties(out, {
      isNoise: {
        value: Boolean(isRejected),
        enumerable: false,
        writable: true,
        configurable: true,
      },
      isSkillWorthy: {
        value: Boolean(
          isKnownValid || (gateEval.isSkillWorthy && !result.isNoise && result.category !== 'NOISE')
        ),
        enumerable: false,
        writable: true,
        configurable: true,
      },
      parentMappings: {
        value: gateEval.parentMappings || result.parentMappings || null,
        enumerable: false,
        writable: true,
        configurable: true,
      },
    });
    return out;
  }
}
