/**
 * @file GitHub Evidence Extractor Module Exports (P4-003)
 */

export { GitHubEvidenceExtractorService } from './github-evidence-extractor.js';
export { SecretScrubber } from './security/secret-scrubber.js';
export { TaxonomyMapper } from './taxonomy/taxonomy-mapper.js';
export { NodeManifestParser } from './manifest-parsers/node-manifest-parser.js';
export { PythonManifestParser } from './manifest-parsers/python-manifest-parser.js';
export { GoManifestParser } from './manifest-parsers/go-manifest-parser.js';
export { RustManifestParser } from './manifest-parsers/rust-manifest-parser.js';
export { ImportScanner } from './code-scanners/import-scanner.js';
export { computeEvidenceFingerprint } from './fingerprint.js';
export { SkillRollupCalculator } from './skill-rollup.js';
