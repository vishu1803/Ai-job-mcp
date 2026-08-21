/**
 * @file Resource Connection API Request and Response Zod Schemas
 *
 * Enforces contract validation for /connections endpoints:
 * - Query and path parameter validation
 * - Response serialization envelopes strictly omitting sensitive credential material
 */

import { z } from 'zod';
import {
  resourceProviderEnum,
  connectionAuthTypeEnum,
  resourceConnectionStatusEnum,
} from '../db/schema.js';

// ---------------------------------------------------------------------------
// Request Parameter Schemas
// ---------------------------------------------------------------------------

export const ConnectionParamsSchema = z.object({
  id: z.string().uuid({ message: 'Connection ID must be a valid UUID' }),
});

export const ConnectionListQuerySchema = z.object({
  provider: z.enum(resourceProviderEnum.enumValues).optional(),
  status: z.enum(resourceConnectionStatusEnum.enumValues).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ---------------------------------------------------------------------------
// Response Schemas (Strictly Zero Plaintext or Encrypted Credentials)
// ---------------------------------------------------------------------------

/**
 * Summary schema for connection list items.
 */
export const ConnectionSummarySchema = z.object({
  id: z.string().uuid(),
  provider: z.enum(resourceProviderEnum.enumValues),
  authType: z.enum(connectionAuthTypeEnum.enumValues),
  displayName: z.string(),
  externalAccountId: z.string(),
  externalAccountName: z.string().nullable().optional(),
  installationId: z.string().nullable().optional(),
  status: z.enum(resourceConnectionStatusEnum.enumValues),
  scopes: z.array(z.string()),
  expiresAt: z.union([z.date(), z.string()]).nullable().optional(),
  refreshedAt: z.union([z.date(), z.string()]).nullable().optional(),
  lastValidatedAt: z.union([z.date(), z.string()]).nullable().optional(),
  lastErrorCode: z.string().nullable().optional(),
  lastErrorAt: z.union([z.date(), z.string()]).nullable().optional(),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]),
});

/**
 * Detailed schema for single connection retrieval.
 */
export const ConnectionDetailSchema = ConnectionSummarySchema.extend({
  userId: z.string().uuid(),
  metadata: z.record(z.unknown()),
});

/**
 * Paginated list response schema.
 */
export const ConnectionListResponseSchema = z.object({
  items: z.array(ConnectionSummarySchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
    limit: z.number().int(),
    totalCount: z.number().int().optional(),
  }),
});

/**
 * Health check test result envelope schema.
 */
export const ConnectionTestResultSchema = z.object({
  connectionId: z.string().uuid(),
  provider: z.string(),
  healthy: z.boolean(),
  status: z.enum(resourceConnectionStatusEnum.enumValues),
  message: z.string(),
  validatedAt: z.union([z.date(), z.string()]),
  errorCode: z.string().nullable().optional(),
});

/**
 * Mutation result schema for disconnect and delete actions.
 */
export const ConnectionMutationResultSchema = z.object({
  connectionId: z.string().uuid(),
  provider: z.string(),
  status: z.string(),
  message: z.string(),
  updatedAt: z.union([z.date(), z.string()]),
});
