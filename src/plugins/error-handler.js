/**
 * @file Centralized Fastify Error Handler Plugin
 *
 * Catches all operational and unhandled exceptions, sanitizes sensitive data,
 * formats structured error responses with request IDs, and logs to Pino.
 */

import { AppError } from '../errors/index.js';

/**
 * Global Fastify error handler.
 *
 * @param {Error | import('fastify').FastifyError | AppError} error
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
export function errorHandler(error, request, reply) {
  const requestId = request.id || 'req-unknown';

  // 1. If error is an AppError instance (known operational domain error)
  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      request.log.error(
        { err: error, requestId, code: error.code, statusCode: error.statusCode },
        error.message
      );
    } else {
      request.log.warn(
        { requestId, code: error.code, statusCode: error.statusCode, details: error.details },
        error.message
      );
    }

    return reply.code(error.statusCode).send({
      success: false,
      data: null,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        requestId,
      },
    });
  }

  // 2. Fastify built-in schema validation error (e.g. invalid JSON schema)
  if (/** @type {any} */ (error).validation) {
    const details = /** @type {any} */ (error).validation.map((v) => ({
      field: v.instancePath || v.params?.missingProperty || '',
      message: v.message || 'Validation error',
      keyword: v.keyword,
    }));

    request.log.warn(
      { requestId, code: 'VALIDATION_ERROR', statusCode: 400, details },
      'Request validation failed'
    );

    return reply.code(400).send({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message || 'Request validation failed',
        details,
        requestId,
      },
    });
  }

  // 3. Fastify syntax/malformed body parsing error (400)
  if (/** @type {any} */ (error).statusCode === 400) {
    request.log.warn({ requestId, err: error }, 'Bad request syntax');
    return reply.code(400).send({
      success: false,
      data: null,
      error: {
        code: 'BAD_REQUEST',
        message: 'Malformed or invalid JSON request syntax',
        details: null,
        requestId,
      },
    });
  }

  // 4. Unexpected / Unhandled Server Error (500)
  request.log.error(
    {
      err: error,
      requestId,
      statusCode: 500,
    },
    'Unhandled server exception'
  );

  return reply.code(500).send({
    success: false,
    data: null,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal server error occurred',
      details: null,
      requestId,
    },
  });
}

/**
 * Global Fastify 404 Not Found handler.
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
export function notFoundHandler(request, reply) {
  const requestId = request.id || 'req-unknown';
  const message = `Route ${request.method} ${request.url} not found`;

  request.log.info({ requestId, method: request.method, url: request.url }, 'Route not found');

  return reply.code(404).send({
    success: false,
    data: null,
    error: {
      code: 'NOT_FOUND',
      message,
      details: null,
      requestId,
    },
  });
}
