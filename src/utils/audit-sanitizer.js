/**
 * @file Audit Data Sanitization Module
 *
 * Dedicated security boundary for audit ledger persistence.
 * Enforces strict redaction of credentials, secrets, PII, and oversized payloads
 * before records enter the audit_logs table.
 */

import { z } from 'zod';

/** Maximum permitted size of audit JSONB payload (16 KB) */
export const MAX_AUDIT_PAYLOAD_BYTES = 16 * 1024;

/**
 * Normalized set of strictly prohibited key names.
 */
export const PROHIBITED_KEYS = new Set([
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'secret',
  'clientsecret',
  'password',
  'passwd',
  'privatekey',
  'encryptedcredentials',
  'authorization',
  'cookie',
  'setcookie',
  'sessionsecret',
  'encryptionkey',
  'resume',
  'rawresume',
  'sourcecode',
  'filecontent',
  'code',
  'ssn',
  'socialsecuritynumber',
  'creditcard',
]);

/** Regex pattern for detecting sensitive and credential keys */
const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|passwd|private.*key|auth.*header|api.*key|cookie|bearer|ssn|social_security|source_?code|raw_?resume)/i;

/**
 * Recursively cleans an object or value by stripping prohibited keys and redacting sensitive values.
 *
 * @param {any} value Raw value
 * @param {number} [depth=0] Recursion depth
 * @returns {any} Sanitized value
 */
function sanitizeValue(value, depth = 0) {
  if (depth > 10) {
    return '[MAX_DEPTH_REACHED]';
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    const cleaned = {};
    for (const [key, val] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
      if (PROHIBITED_KEYS.has(normalizedKey) || SENSITIVE_KEY_PATTERN.test(key)) {
        continue; // Strip prohibited key completely from audit metadata
      }
      cleaned[key] = sanitizeValue(val, depth + 1);
    }
    return cleaned;
  }

  return String(value);
}

/**
 * Zod schema for validating the audit payload structure.
 */
export const auditDetailsSchema = z.record(z.string(), z.any());

/**
 * Sanitizes and validates audit event metadata before database insertion.
 *
 * @param {Record<string, any>} [details={}] Raw metadata object
 * @returns {Record<string, any>} Sanitized, safe JSONB object
 * @throws {TypeError} If details is not a plain object
 * @throws {Error} If details exceeds the 16 KB size limit
 */
export function sanitizeAuditDetails(details = {}) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    throw new TypeError('Audit details must be a plain JSON object');
  }

  // Enforce size limit on raw input
  const rawSerialized = JSON.stringify(details);
  const rawByteLength = Buffer.byteLength(rawSerialized, 'utf8');

  if (rawByteLength > MAX_AUDIT_PAYLOAD_BYTES) {
    throw new Error(
      `Audit payload exceeds maximum permitted size of 16 KB (size: ${rawByteLength} bytes)`
    );
  }

  const sanitized = sanitizeValue(details);
  const serialized = JSON.stringify(sanitized);
  const byteLength = Buffer.byteLength(serialized, 'utf8');

  if (byteLength > MAX_AUDIT_PAYLOAD_BYTES) {
    throw new Error(
      `Audit payload exceeds maximum permitted size of 16 KB (size: ${byteLength} bytes)`
    );
  }

  return sanitized;
}
