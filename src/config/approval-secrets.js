import crypto from 'node:crypto';
import { CryptoError } from '../errors/index.js';

export const APPROVAL_SECRET_NAMES = ['ACTION_APPROVAL_HMAC_SECRET', 'CAREER_HUB_APPROVAL_SECRET'];

/**
 * Approval keys are independently generated 32-byte CSPRNG values, encoded as
 * 64 hex or canonical padded base64. Format/weak-pattern checks are a baseline,
 * NOT proof of entropy. Never include the supplied value in an error.
 */
export function normalizeApprovalSecret(value, name) {
  const invalid = () =>
    new CryptoError(
      `${name} must be an independently generated random 32-byte key encoded as 64 hex or 44 base64 characters`,
      'INVALID_APPROVAL_SECRET'
    );
  if (typeof value !== 'string') throw invalid();
  let key;
  if (/^[a-f0-9]{64}$/i.test(value)) {
    key = Buffer.from(value, 'hex');
  } else if (/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    key = Buffer.from(value, 'base64');
    if (key.toString('base64') !== value) throw invalid();
  } else {
    throw invalid();
  }
  const decoded = key.toString('utf8');
  const step = (key[1] - key[0] + 256) % 256;
  const sequential = key.every(
    (byte, index) => index === 0 || (byte - key[index - 1] + 256) % 256 === step
  );
  if (
    key.length !== 32 ||
    new Set(key).size < 16 ||
    sequential ||
    /example|placeholder|change.?me|test.?only|default|replace.?me|development.?secret/i.test(
      decoded
    )
  ) {
    throw invalid();
  }
  return key;
}

/** Pure policy shared by startup validation and signer defense in depth. */
export function approvalSecretIssues(configuration) {
  const issues = [];
  const keys = [];
  for (const name of APPROVAL_SECRET_NAMES) {
    const value = configuration[name];
    // A test process may boot without a key, but cannot sign/verify without one.
    if (configuration.NODE_ENV === 'test' && value === undefined) continue;
    try {
      keys.push({ name, key: normalizeApprovalSecret(value, name) });
    } catch (error) {
      issues.push({ name, message: error.message });
    }
  }
  if (keys.length === 2 && crypto.timingSafeEqual(keys[0].key, keys[1].key)) {
    issues.push({
      name: 'CAREER_HUB_APPROVAL_SECRET',
      message: 'CAREER_HUB_APPROVAL_SECRET must be independent of ACTION_APPROVAL_HMAC_SECRET',
    });
  }
  return issues;
}

export function assertApprovalSecrets(configuration) {
  const issues = approvalSecretIssues(configuration);
  if (issues.length) {
    throw new CryptoError(
      issues.map(({ message }) => message).join('; '),
      'INVALID_APPROVAL_SECRET'
    );
  }
}

/** Explicit key overrides are test-only; production always uses validated config. */
export function getApprovalSecret(configuration, name, explicitKey) {
  if (!APPROVAL_SECRET_NAMES.includes(name)) {
    throw new CryptoError('Unknown approval signing domain', 'INVALID_APPROVAL_DOMAIN');
  }
  if (explicitKey !== undefined) {
    if (configuration.NODE_ENV !== 'test') {
      throw new CryptoError(
        'Explicit approval key overrides are test-only',
        'INVALID_APPROVAL_SECRET'
      );
    }
    return normalizeApprovalSecret(explicitKey, name);
  }
  assertApprovalSecrets(configuration);
  return normalizeApprovalSecret(configuration[name], name);
}
