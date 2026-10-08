import crypto from 'node:crypto';
import { ValidationError } from '../../errors/index.js';

export const APPLICATION_APPROVAL_FORMAT = 'application-package-approval/v1';

// These are transport/ledger bookkeeping, NEVER adapter input. Every other
// package field (including unknown extension fields) is approval-sensitive.
const BOOKKEEPING_FIELDS = new Set([
  'packageHash',
  'preparedAt',
  'applicationId',
  'packageVersion',
  'packageStatus',
  'lifecycleAction',
]);

/** Canonical JSON: lexically ordered object keys, ordered arrays, JSON primitives.
 * Undefined object properties are omitted, as in PostgreSQL JSONB persistence.
 * Reject non-JSON values rather than allowing lossy/coercive hashing.
 */
export function canonicalPackageJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) {
        throw new ValidationError('Sparse arrays are not package JSON', 'INVALID_PACKAGE_CONTENT');
      }
    }
    return `[${value.map(canonicalPackageJson).join(',')}]`;
  }
  if (
    value &&
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  ) {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalPackageJson(value[key])}`)
      .join(',')}}`;
  }
  throw new ValidationError(
    'Application package must contain only JSON values',
    'INVALID_PACKAGE_CONTENT'
  );
}

export function applicationExecutionPayload(pkg) {
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    throw new ValidationError('Application package is required', 'INVALID_PACKAGE_CONTENT');
  }
  const fields = Object.fromEntries(
    Object.entries(pkg).filter(([key]) => !BOOKKEEPING_FIELDS.has(key))
  );
  return JSON.parse(canonicalPackageJson(fields));
}

export function computeApplicationPackageHash(pkg) {
  // Fixed envelope order; nested JSON ordering is independent of insertion order.
  const content = `{"format":${JSON.stringify(APPLICATION_APPROVAL_FORMAT)},"package":${canonicalPackageJson(applicationExecutionPayload(pkg))}}`;
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export function freezeApplicationPackage(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeApplicationPackage);
    Object.freeze(value);
  }
  return value;
}
