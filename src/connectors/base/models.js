/**
 * @file Normalized Connector Domain Models & Pagination Contracts
 *
 * Defines factory validators and contracts for provider-neutral entities:
 * 1. NormalizedAccount
 * 2. NormalizedResource
 * 3. ConnectorOperationResult
 * 4. PaginationOptions & PaginatedResult
 */

import { ValidationError } from '../../errors/index.js';

/**
 * Validates and creates a NormalizedAccount.
 *
 * @param {Object} params
 * @param {string} params.id - Provider's immutable external account ID
 * @param {string} params.name - Human-readable handle or account name
 * @param {string} [params.displayName] - Human name
 * @param {string} [params.avatarUrl] - Avatar URL
 * @param {string} params.provider - Resource provider enum value
 * @param {string} [params.accountType='USER'] - 'USER' | 'ORGANIZATION' | 'WORKSPACE'
 * @param {Record<string, unknown>} [params.metadata={}] - Non-sensitive metadata
 * @returns {Readonly<{id: string, name: string, displayName: string|null, avatarUrl: string|null, provider: string, accountType: string, metadata: Readonly<Record<string, unknown>>}>}
 */
export function createNormalizedAccount({
  id,
  name,
  displayName = null,
  avatarUrl = null,
  provider,
  accountType = 'USER',
  metadata = {},
}) {
  if (!id || typeof id !== 'string') {
    throw new ValidationError('Account id must be a non-empty string');
  }
  if (!name || typeof name !== 'string') {
    throw new ValidationError('Account name must be a non-empty string');
  }
  if (!provider || typeof provider !== 'string') {
    throw new ValidationError('Account provider must be a non-empty string');
  }

  return Object.freeze({
    id: String(id),
    name: String(name),
    displayName: displayName ? String(displayName) : null,
    avatarUrl: avatarUrl ? String(avatarUrl) : null,
    provider: String(provider),
    accountType: String(accountType),
    metadata: Object.freeze({ ...metadata }),
  });
}

/**
 * Validates and creates a NormalizedResource.
 *
 * @param {Object} params
 * @param {string} params.id - Provider's resource ID
 * @param {string} params.name - Resource short name
 * @param {string} [params.fullName] - Namespaced full name
 * @param {string} params.type - Resource classification ('REPOSITORY', 'DOCUMENT', etc.)
 * @param {string} [params.url] - Resource web URL
 * @param {string} [params.defaultBranch] - Default branch (for code repositories)
 * @param {boolean} [params.isPrivate=false] - Visibility flag
 * @param {string[]} [params.languages=[]] - Programming languages / formats
 * @param {Date|string} [params.updatedAt] - Upstream updated timestamp
 * @param {Record<string, unknown>} [params.metadata={}] - Non-sensitive metadata
 * @returns {Readonly<{id: string, name: string, fullName: string, type: string, url: string|null, defaultBranch: string|null, isPrivate: boolean, languages: readonly string[], updatedAt: Date|null, metadata: Readonly<Record<string, unknown>>}>}
 */
export function createNormalizedResource({
  id,
  name,
  fullName,
  type = 'REPOSITORY',
  url = null,
  defaultBranch = null,
  isPrivate = false,
  languages = [],
  updatedAt = null,
  metadata = {},
}) {
  if (!id || typeof id !== 'string') {
    throw new ValidationError('Resource id must be a non-empty string');
  }
  if (!name || typeof name !== 'string') {
    throw new ValidationError('Resource name must be a non-empty string');
  }

  const finalFullName = fullName && typeof fullName === 'string' ? fullName : name;
  const parsedDate = updatedAt ? new Date(updatedAt) : null;

  return Object.freeze({
    id: String(id),
    name: String(name),
    fullName: String(finalFullName),
    type: String(type),
    url: url ? String(url) : null,
    defaultBranch: defaultBranch ? String(defaultBranch) : null,
    isPrivate: Boolean(isPrivate),
    languages: Object.freeze(Array.isArray(languages) ? [...languages] : []),
    updatedAt: parsedDate instanceof Date && !isNaN(parsedDate.getTime()) ? parsedDate : null,
    metadata: Object.freeze({ ...metadata }),
  });
}

/**
 * Creates a standard operation result envelope.
 *
 * @template T
 * @param {Object} params
 * @param {boolean} params.success
 * @param {T} [params.data=null]
 * @param {any} [params.error=null]
 * @returns {Readonly<{success: boolean, data: T|null, error: any}>}
 */
export function createOperationResult({ success, data = null, error = null }) {
  return Object.freeze({
    success: Boolean(success),
    data: success ? data : null,
    error: success ? null : error,
  });
}

/**
 * Validates and normalizes pagination options.
 *
 * @param {Object} [options={}]
 * @param {string|null} [options.cursor=null] - Opaque cursor token
 * @param {number} [options.limit=50] - Requested page size (1..100)
 * @returns {Readonly<{cursor: string|null, limit: number}>}
 */
export function createPaginationOptions(options = {}) {
  const cursor =
    options.cursor && typeof options.cursor === 'string' && options.cursor.trim().length > 0
      ? options.cursor.trim()
      : null;

  let limit = 50;
  if (options.limit !== undefined && options.limit !== null) {
    const parsed = Number(options.limit);
    if (isNaN(parsed) || !Number.isInteger(parsed) || parsed < 1) {
      throw new ValidationError('Pagination limit must be a positive integer between 1 and 100');
    }
    limit = Math.min(100, parsed);
  }

  return Object.freeze({
    cursor,
    limit,
  });
}

/**
 * Creates a normalized paginated result.
 *
 * @template T
 * @param {Object} params
 * @param {T[]} params.items - Array of items
 * @param {string|null} [params.nextCursor=null] - Next page cursor
 * @param {boolean} [params.hasMore=false] - Whether more items exist
 * @param {number} [params.totalCount] - Optional total count
 * @returns {Readonly<{items: readonly T[], nextCursor: string|null, hasMore: boolean, totalCount?: number}>}
 */
export function createPaginatedResult({
  items = [],
  nextCursor = null,
  hasMore = false,
  totalCount = undefined,
}) {
  if (!Array.isArray(items)) {
    throw new ValidationError('Paginated items must be an array');
  }

  return Object.freeze({
    items: Object.freeze([...items]),
    nextCursor: nextCursor && typeof nextCursor === 'string' ? nextCursor : null,
    hasMore: Boolean(hasMore || (nextCursor && nextCursor.length > 0)),
    ...(totalCount !== undefined && typeof totalCount === 'number' ? { totalCount } : {}),
  });
}
