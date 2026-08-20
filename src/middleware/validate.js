/**
 * @file Zod Request and Response Validation Utilities
 *
 * Provides reusable Fastify preHandler and preSerialization middleware for validating
 * request bodies, query parameters, URL path parameters, headers, and outgoing responses.
 */

import { ValidationError, InternalServerError } from '../errors/index.js';

/**
 * Formats Zod validation issues into a clean, safe array of field errors.
 *
 * @param {import('zod').ZodError} zodError
 * @returns {Array<{ field: string, message: string, code: string }>}
 */
export function formatZodIssues(zodError) {
  return zodError.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Creates a Fastify preHandler hook that validates incoming request segments against Zod schemas.
 * Applies parsed defaults, coercions, and strips unpermitted properties.
 *
 * @param {object} schemas
 * @param {import('zod').ZodSchema} [schemas.body] Schema for request.body
 * @param {import('zod').ZodSchema} [schemas.query] Schema for request.query
 * @param {import('zod').ZodSchema} [schemas.params] Schema for request.params
 * @param {import('zod').ZodSchema} [schemas.headers] Schema for request.headers
 * @returns {import('fastify').preHandlerHookHandler} Fastify preHandler hook
 */
export function validateRequest(schemas = {}) {
  return async (request, _reply) => {
    const errors = [];

    if (schemas.params) {
      const result = schemas.params.safeParse(request.params);
      if (!result.success) {
        errors.push(...formatZodIssues(result.error).map((e) => ({ ...e, location: 'params' })));
      } else {
        request.params = result.data;
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(request.query);
      if (!result.success) {
        errors.push(...formatZodIssues(result.error).map((e) => ({ ...e, location: 'query' })));
      } else {
        request.query = result.data;
      }
    }

    if (schemas.headers) {
      const result = schemas.headers.safeParse(request.headers);
      if (!result.success) {
        errors.push(...formatZodIssues(result.error).map((e) => ({ ...e, location: 'headers' })));
      } else {
        request.headers = result.data;
      }
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(request.body);
      if (!result.success) {
        errors.push(...formatZodIssues(result.error).map((e) => ({ ...e, location: 'body' })));
      } else {
        request.body = result.data;
      }
    }

    if (errors.length > 0) {
      throw new ValidationError('Request validation failed', errors);
    }
  };
}

/**
 * Creates a Fastify preSerialization hook that validates the outgoing response payload against a Zod schema.
 * Prevents internal schema leaks or invalid API contracts.
 *
 * @param {import('zod').ZodSchema} schema Zod schema for response payload
 * @returns {import('fastify').preSerializationHookHandler<any>} Fastify preSerialization hook
 */
export function validateResponse(schema) {
  return async (request, reply, payload) => {
    // Only validate 2xx successful responses with content
    if (reply.statusCode >= 200 && reply.statusCode < 300 && payload !== undefined) {
      const result = schema.safeParse(payload);
      if (!result.success) {
        request.log.error(
          {
            err: result.error,
            issues: formatZodIssues(result.error),
            route: request.url,
          },
          'Response payload schema validation failed'
        );
        throw new InternalServerError('Response contract validation failed');
      }
      return result.data;
    }
    return payload;
  };
}
