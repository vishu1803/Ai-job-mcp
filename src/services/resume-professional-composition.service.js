/**
 * @file Deterministic Professional Resume Composition Layer (Backward-Compatible Adapter)
 *
 * Re-exports and delegates to the unified authoritative composition service:
 * `src/services/resume-accomplishment-composer.service.js`
 *
 * Preserves all existing exported function signatures:
 * - compressProfessionalBullet
 * - polishProfessionalSummary
 * - ensureCandidateSectionIntegrity
 * - composeStructuredResumeDocument
 */

export {
  compressProfessionalBullet,
  polishProfessionalSummary,
  ensureCandidateSectionIntegrity,
  composeStructuredResumeDocument,
} from './resume-accomplishment-composer.service.js';

import { composeStructuredResumeDocument } from './resume-accomplishment-composer.service.js';
export default composeStructuredResumeDocument;
