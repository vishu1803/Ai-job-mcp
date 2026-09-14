/**
 * @file Multi-Signal Job Detection Engine (P57.3).
 *
 * Evaluates multiple signals (URL patterns, JSON-LD JobPosting, semantic DOM nodes,
 * keyword density, and application form presence) to calculate an authoritative
 * confidence score and extract normalized job data.
 */

import { AdapterRegistry } from './adapter-registry.js';
import { JobPageDetector } from './job-page-detector.js';

export class JobDetectionEngine {
  /**
   * Evaluates the current page and extracts normalized job data along with
   * adapter capabilities and detection confidence.
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {{ detected: boolean, confidence: string, confidenceScore: number, jobData: object, portalMetadata: object }}
   */
  static evaluate(doc, url) {
    if (!doc) {
      return {
        detected: false,
        confidence: 'LOW',
        confidenceScore: 0,
        jobData: null,
        portalMetadata: null,
      };
    }

    const currentUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
    const { adapterId, adapter, metadata } = AdapterRegistry.resolve(doc, currentUrl);

    // Run normalized extraction via JobPageDetector
    let normalizedPayload;
    try {
      normalizedPayload = JobPageDetector.detect(doc, currentUrl);
    } catch (err) {
      return {
        detected: false,
        confidence: 'LOW',
        confidenceScore: 0,
        jobData: null,
        portalMetadata: metadata,
        error: err.message,
      };
    }

    // Calculate multi-signal score (0 to 100)
    let score = 0;

    // Signal 1: Structured ATS, dedicated board adapter, or schema.org JSON-LD
    if (adapterId !== 'GENERIC' || normalizedPayload.provider === 'GENERIC_JSONLD') {
      score += 45;
    }

    // Signal 2: Valid Title (non-empty, not generic fallback)
    if (normalizedPayload.title && normalizedPayload.title !== 'Untitled Role') {
      score += 20;
    }

    // Signal 3: Valid Description with substance (>= 150 chars)
    if (normalizedPayload.description && normalizedPayload.description.length >= 150) {
      score += 20;
    }

    // Signal 4: Extracted Requirements or Responsibilities
    if (
      (normalizedPayload.requirements && normalizedPayload.requirements.length > 0) ||
      (normalizedPayload.responsibilities && normalizedPayload.responsibilities.length > 0)
    ) {
      score += 10;
    }

    // Signal 5: Location / Company presence
    if (normalizedPayload.company && normalizedPayload.company !== 'Company') {
      score += 5;
    }

    // Determine confidence level
    let confidence = 'LOW';
    if (score >= 70 && normalizedPayload.isConfident) {
      confidence = 'HIGH';
    } else if (score >= 40 && normalizedPayload.isConfident) {
      confidence = 'MEDIUM';
    }

    const isDetected = score >= 35 && normalizedPayload.isConfident;

    // Attach portal metadata to payload
    normalizedPayload.portalMetadata = {
      ...metadata,
      confidence,
      confidenceScore: score,
    };

    return {
      detected: isDetected,
      confidence,
      confidenceScore: score,
      jobData: isDetected ? normalizedPayload : null,
      portalMetadata: normalizedPayload.portalMetadata,
    };
  }
}
