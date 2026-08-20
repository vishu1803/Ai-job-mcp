import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DependencyError,
  InternalServerError,
} from '../../src/errors/index.js';

describe('Centralized Error Model (P1-005)', () => {
  test('1. AppError base class assigns expected properties', () => {
    const err = new AppError('Custom base error', 418, 'I_AM_A_TEAPOT', { extra: 'info' });
    assert.equal(err.message, 'Custom base error');
    assert.equal(err.statusCode, 418);
    assert.equal(err.code, 'I_AM_A_TEAPOT');
    assert.deepEqual(err.details, { extra: 'info' });
    assert.equal(err.isOperational, true);
    assert.ok(err.stack);
  });

  test('2. ValidationError defaults to 400 and VALIDATION_ERROR', () => {
    const issues = [{ field: 'email', message: 'Invalid email' }];
    const err = new ValidationError('Payload invalid', issues);
    assert.equal(err.statusCode, 400);
    assert.equal(err.code, 'VALIDATION_ERROR');
    assert.equal(err.message, 'Payload invalid');
    assert.deepEqual(err.details, issues);
  });

  test('3. AuthenticationError defaults to 401 and AUTHENTICATION_ERROR', () => {
    const err = new AuthenticationError();
    assert.equal(err.statusCode, 401);
    assert.equal(err.code, 'AUTHENTICATION_ERROR');
    assert.equal(err.message, 'Authentication required');
  });

  test('4. AuthorizationError defaults to 403 and AUTHORIZATION_ERROR', () => {
    const err = new AuthorizationError('Insufficient permissions');
    assert.equal(err.statusCode, 403);
    assert.equal(err.code, 'AUTHORIZATION_ERROR');
    assert.equal(err.message, 'Insufficient permissions');
  });

  test('5. NotFoundError defaults to 404 and NOT_FOUND', () => {
    const err = new NotFoundError('Candidate not found');
    assert.equal(err.statusCode, 404);
    assert.equal(err.code, 'NOT_FOUND');
    assert.equal(err.message, 'Candidate not found');
  });

  test('6. ConflictError defaults to 409 and CONFLICT', () => {
    const err = new ConflictError('Slug already exists');
    assert.equal(err.statusCode, 409);
    assert.equal(err.code, 'CONFLICT');
    assert.equal(err.message, 'Slug already exists');
  });

  test('7. RateLimitError defaults to 429 and RATE_LIMITED', () => {
    const err = new RateLimitError();
    assert.equal(err.statusCode, 429);
    assert.equal(err.code, 'RATE_LIMITED');
    assert.ok(err.message.includes('Rate limit exceeded'));
  });

  test('8. DependencyError defaults to 503 and DEPENDENCY_ERROR', () => {
    const err = new DependencyError('PostgreSQL unavailable');
    assert.equal(err.statusCode, 503);
    assert.equal(err.code, 'DEPENDENCY_ERROR');
    assert.equal(err.message, 'PostgreSQL unavailable');
  });

  test('9. InternalServerError defaults to 500 and INTERNAL_ERROR', () => {
    const err = new InternalServerError();
    assert.equal(err.statusCode, 500);
    assert.equal(err.code, 'INTERNAL_ERROR');
    assert.equal(err.message, 'An unexpected internal server error occurred');
  });
});
