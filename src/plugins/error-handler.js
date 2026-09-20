/**
 * @file Centralized Fastify Error Handler Plugin
 *
 * Catches all operational and unhandled exceptions, sanitizes sensitive data,
 * formats structured error responses with request IDs, and logs to Pino.
 */

import { AppError } from '../errors/index.js';
import {
  sanitizeUserFacingError,
  sanitizeErrorMessage,
} from '../services/user-facing-error.sanitizer.js';
import { renderErrorPage } from '../views/error.page.js';
import { UserFacingStateEnum } from '../domain/ui/user-facing-states.js';

/**
 * Global Fastify error handler.
 *
 * @param {Error | import('fastify').FastifyError | AppError} error
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
export function errorHandler(error, request, reply) {
  const requestId = request.id || 'req-unknown';

  // Helper: detect request content/accept types
  const contentType = request.headers['content-type'] || '';
  const accept = request.headers['accept'] || '';
  const isBrowserForm =
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data');
  const prefersHtml = accept.includes('text/html') && !accept.includes('application/json');

  // Sanitize the error into our user-facing presentation model
  const userFacing = sanitizeUserFacingError(error, {
    requestId,
    referer: request.headers['referer'] || '/',
  });

  // Log internal details to Pino for operational visibility without exposing to end-user
  if (userFacing.statusCode >= 500) {
    request.log.error(
      { err: error, requestId, code: error?.code, statusCode: userFacing.statusCode },
      error?.message || 'Server error'
    );
  } else {
    request.log.warn(
      { requestId, code: error?.code, statusCode: userFacing.statusCode, details: error?.details },
      error?.message || 'Client error'
    );
  }

  // 1. Handle browser form POST failures (redirect with sanitized error query)
  if (isBrowserForm && userFacing.statusCode < 500 && error?.code !== 'CSRF_DETECTED') {
    if (userFacing.statusCode === 401) {
      return reply
        .code(302)
        .redirect('/login?error=' + encodeURIComponent(sanitizeErrorMessage(userFacing.message)));
    }

    const referer = request.headers['referer'] || request.url || '/';
    try {
      const refUrl = new URL(referer, 'http://localhost');
      refUrl.searchParams.set('error', sanitizeErrorMessage(userFacing.message));
      const target = `${refUrl.pathname}${refUrl.search}${refUrl.hash}`;
      return reply.code(302).redirect(target);
    } catch {
      return reply
        .code(302)
        .redirect('/?error=' + encodeURIComponent(sanitizeErrorMessage(userFacing.message)));
    }
  }

  // 2. Handle HTML browser navigation requests (Render dedicated, accessible Error Page)
  if (prefersHtml) {
    if (userFacing.statusCode === 401) {
      return reply
        .code(302)
        .redirect('/login?error=' + encodeURIComponent(sanitizeErrorMessage(userFacing.message)));
    }

    const html = renderErrorPage({
      user: /** @type {any} */ (request).sessionContext?.user || null,
      statusCode: userFacing.statusCode,
      state: userFacing.state,
      title: userFacing.title,
      message: userFacing.message,
      supportId: userFacing.supportId,
      recoveryAction: userFacing.recoveryAction,
      fieldErrors: userFacing.fieldErrors,
    });

    return reply.code(userFacing.statusCode).type('text/html; charset=utf-8').send(html);
  }

  // 3. API / JSON requests: Safe, structured JSON response adhering to contracts
  const isInternal = userFacing.statusCode >= 500;
  const isOperational = error instanceof AppError && error.isOperational;
  const message = isOperational
    ? error.message
    : isInternal
      ? error?.message === 'Response contract validation failed'
        ? error.message
        : 'An unexpected internal server error occurred'
      : userFacing.message;

  const code = error?.code || (isInternal ? 'INTERNAL_ERROR' : userFacing.state);
  const details =
    Array.isArray(error?.details) && error.details.length > 0
      ? error.details
      : userFacing.fieldErrors.length > 0
        ? userFacing.fieldErrors
        : null;

  return reply.code(userFacing.statusCode).send({
    success: false,
    data: null,
    error: {
      code,
      state: userFacing.state,
      title: userFacing.title,
      message,
      details,
      supportId: userFacing.supportId,
      recoveryAction: userFacing.recoveryAction,
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
  const accept = request.headers['accept'] || '';
  const prefersHtml = accept.includes('text/html') && !accept.includes('application/json');

  request.log.info({ requestId, method: request.method, url: request.url }, 'Route not found');

  if (prefersHtml) {
    const html = renderErrorPage({
      user: /** @type {any} */ (request).sessionContext?.user || null,
      statusCode: 404,
      state: UserFacingStateEnum.NOT_FOUND,
      title: "We couldn't find that page",
      message: 'The page or resource you requested may have moved, been deleted, or never existed.',
      supportId: requestId,
      recoveryAction: {
        type: 'navigate',
        label: 'Go to Dashboard',
        href: '/dashboard',
      },
    });
    return reply.code(404).type('text/html; charset=utf-8').send(html);
  }

  return reply.code(404).send({
    success: false,
    data: null,
    error: {
      code: 'NOT_FOUND',
      state: UserFacingStateEnum.NOT_FOUND,
      title: "We couldn't find that page",
      message: 'The requested resource was not found.',
      details: null,
      supportId: requestId,
      recoveryAction: {
        type: 'navigate',
        label: 'Go to Dashboard',
        href: '/dashboard',
      },
      requestId,
    },
  });
}
