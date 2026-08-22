/**
 * @file Canonical Skill Taxonomy & Normalization Adapter (P4-003 / P5-002)
 *
 * Normalizes multi-ecosystem package dependencies, module imports, and configuration
 * artifacts to canonical global skill slugs, official display names, and approved categories.
 * Delegates to canonical domain engine (src/domain/career/skill-taxonomy.js) for unified,
 * high-performance deterministic mapping.
 */

import { SkillTaxonomyEngine } from '../../../domain/career/skill-taxonomy.js';

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
    if (!result) {
      return {
        slug: 'unknown-tool',
        name: 'Unknown Tool',
        category: 'TOOL',
      };
    }
    return {
      slug: result.canonicalSlug,
      name: result.canonicalName,
      category: result.category,
    };
  }
}
