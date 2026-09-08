/**
 * @file Job Page Detector & Sanitizer (P15-001).
 *
 * Coordinates provider adapters, extracts raw job descriptions, sanitizes untrusted
 * external input, and normalizes into a uniform `NormalizedJobPayload` for downstream
 * backend MCP processing.
 */

import { GreenhouseAdapter } from './adapters/greenhouse.adapter.js';
import { LeverAdapter } from './adapters/lever.adapter.js';
import { WorkdayAdapter } from './adapters/workday.adapter.js';
import { LinkedInAdapter } from './adapters/linkedin.adapter.js';
import { IndeedAdapter } from './adapters/indeed.adapter.js';
import { GenericCareerPageAdapter } from './adapters/generic-career.adapter.js';

export class JobPageDetector {
  /**
   * Ordered list of registered provider adapters.
   * Specific ATS adapters take precedence over the generic fallback.
   */
  static adapters = [
    GreenhouseAdapter,
    LeverAdapter,
    WorkdayAdapter,
    LinkedInAdapter,
    IndeedAdapter,
    GenericCareerPageAdapter,
  ];

  /**
   * Sanitizes external job-page text to protect downstream LLM pipelines.
   * Strips prompt injection attempts, raw control markers, and excessive whitespace.
   *
   * @param {string} text
   * @returns {string} Clean, safe text
   */
  static sanitizeText(text) {
    if (!text || typeof text !== 'string') return '';

    return text
      // Remove LLM prompt injection attempts & chat tokens
      .replace(/<\|(?:im_start|im_end|endoftext|system|assistant|user)\|>/gi, '')
      .replace(/(?:ignore|disregard)\s+(?:all\s+)?(?:previous|prior)\s+instructions/gi, '[filtered instruction]')
      .replace(/you\s+are\s+now\s+a\s+(?:developer|administrator|unrestricted)/gi, '[filtered prompt]')
      // Strip control chars
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
      // Normalize line breaks and spaces
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Detects the appropriate adapter and extracts the normalized job payload.
   *
   * @param {Document} doc The page document object
   * @param {string} url The page URL
   * @returns {object} NormalizedJobPayload
   */
  static detect(doc, url) {
    if (!doc) {
      throw new Error('Document object is required for job extraction');
    }

    const currentUrl = url || (typeof window !== 'undefined' ? window.location.href : '');

    // Select matching adapter
    let matchedAdapter = GenericCareerPageAdapter;
    for (const adapter of JobPageDetector.adapters) {
      if (adapter !== GenericCareerPageAdapter && adapter.canHandle(doc, currentUrl)) {
        matchedAdapter = adapter;
        break;
      }
    }

    // Extract payload via matched adapter
    const rawPayload = matchedAdapter.extract(doc, currentUrl);

    // Sanitize all extracted textual fields
    const sanitizedTitle = JobPageDetector.sanitizeText(rawPayload.title) || 'Untitled Role';
    const sanitizedCompany = JobPageDetector.sanitizeText(rawPayload.company) || 'Company';
    const sanitizedLocation = JobPageDetector.sanitizeText(rawPayload.location) || 'Not specified';
    const sanitizedDescription = JobPageDetector.sanitizeText(rawPayload.description);
    const sanitizedRawText = JobPageDetector.sanitizeText(rawPayload.rawText || rawPayload.description);

    const sanitizedRequirements = (rawPayload.requirements || [])
      .map((r) => JobPageDetector.sanitizeText(r))
      .filter((r) => r.length > 5);

    const sanitizedResponsibilities = (rawPayload.responsibilities || [])
      .map((r) => JobPageDetector.sanitizeText(r))
      .filter((r) => r.length > 5);

    // Confidence gate: structured providers (ATS adapters, JSON-LD JobPosting)
    // carry their own provider signal, so title + description suffice. The generic
    // DOM fallback can "extract" a title/description from ANY page (blog post,
    // article, docs page), so it must additionally show real job-posting signals.
    const provider = String(rawPayload.provider || '').toUpperCase();
    const isStructuredProvider =
      provider === 'GENERIC_JSONLD' ||
      ['GREENHOUSE', 'LEVER', 'WORKDAY', 'LINKEDIN', 'INDEED'].includes(provider);

    const JOB_SIGNAL_REGEX =
      /\b(?:we[' ]?re hiring|apply now|submit (?:your )?(?:application|resume)|join our team|about the (?:role|opportunity)|job description|qualifications|responsibilities include|years of experience|full[- ]time|part[- ]time|contract(?:or)? position|benefits(?: package)?|equity|open role|open position|careers?)\b/i;

    const hasJobSignals =
      JOB_SIGNAL_REGEX.test(sanitizedDescription) ||
      sanitizedRequirements.length > 0 ||
      (rawPayload.employmentType && rawPayload.employmentType !== 'FULL_TIME');

    const isConfidentExtraction = Boolean(
      sanitizedTitle !== 'Untitled Role' &&
      sanitizedDescription.length >= 50 &&
      (isStructuredProvider || hasJobSignals)
    );

    return {
      sourceUrl: currentUrl,
      provider: rawPayload.provider,
      title: sanitizedTitle,
      company: sanitizedCompany,
      location: sanitizedLocation,
      workplace: rawPayload.workplace || 'UNKNOWN',
      employmentType: rawPayload.employmentType || 'FULL_TIME',
      description: sanitizedDescription,
      requirements: sanitizedRequirements,
      responsibilities: sanitizedResponsibilities,
      compensation: rawPayload.compensation || null,
      rawText: sanitizedRawText,
      isConfident: isConfidentExtraction,
    };
  }
}
