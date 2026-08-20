import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { buildApp } from '../../src/app.js';
import { validateRequest, validateResponse } from '../../src/middleware/validate.js';
import { ConflictError } from '../../src/errors/index.js';

describe('Zod Request & Response Validation Middleware (P1-005)', () => {
  const app = buildApp({ logger: false });

  // Define test schemas
  const testBodySchema = z.object({
    name: z.string().min(3),
    email: z.string().email(),
    role: z.enum(['MEMBER', 'OWNER']).default('MEMBER'),
  });

  const testQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  });

  const testParamsSchema = z.object({
    tenantId: z.string().uuid(),
  });

  const testResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
      id: z.string().uuid(),
      name: z.string(),
      email: z.string().email(),
    }),
    error: z.null(),
  });

  // Register test routes
  app.post(
    '/test-validate-request',
    {
      preHandler: validateRequest({
        body: testBodySchema,
        query: testQuerySchema,
      }),
    },
    async (request, _reply) => {
      return {
        success: true,
        data: {
          receivedBody: request.body,
          receivedQuery: request.query,
        },
        error: null,
      };
    }
  );

  app.get(
    '/test-validate-params/:tenantId',
    {
      preHandler: validateRequest({
        params: testParamsSchema,
      }),
    },
    async (request, _reply) => {
      return {
        success: true,
        data: {
          tenantId: request.params.tenantId,
        },
        error: null,
      };
    }
  );

  app.get(
    '/test-validate-response-valid',
    {
      preSerialization: validateResponse(testResponseSchema),
    },
    async (_request, _reply) => {
      return {
        success: true,
        data: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Valid User',
          email: 'valid@example.com',
        },
        error: null,
      };
    }
  );

  app.get(
    '/test-validate-response-invalid',
    {
      preSerialization: validateResponse(testResponseSchema),
    },
    async (_request, _reply) => {
      return {
        success: true,
        data: {
          id: 'not-a-uuid',
          name: 'Invalid User',
          email: 'not-an-email',
        },
        error: null,
      };
    }
  );

  app.get('/test-operational-conflict', async () => {
    throw new ConflictError('Tenant slug is already taken');
  });

  app.get('/test-unhandled-error', async () => {
    throw new Error('Database password leak attempt in unexpected exception');
  });

  after(async () => {
    await app.close();
  });

  test('1. Valid request body and query passes validation and applies defaults', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test-validate-request?limit=25',
      payload: {
        name: 'Alice',
        email: 'alice@example.com',
      },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.equal(body.success, true);
    assert.equal(body.data.receivedBody.role, 'MEMBER'); // Applied Zod default
    assert.equal(body.data.receivedQuery.page, 1); // Applied query default
    assert.equal(body.data.receivedQuery.limit, 25); // Coerced query parameter
  });

  test('2. Invalid request body returns structured 400 VALIDATION_ERROR', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test-validate-request',
      payload: {
        name: 'Al', // Too short (min 3)
        email: 'not-an-email',
      },
    });

    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.payload);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.ok(Array.isArray(body.error.details));
    assert.ok(body.error.details.length >= 2);
    assert.ok(body.error.requestId);
  });

  test('3. Invalid URL path parameter returns 400 with param location details', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test-validate-params/invalid-uuid-format',
    });

    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.payload);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.equal(body.error.details[0].field, 'tenantId');
    assert.equal(body.error.details[0].location, 'params');
  });

  test('4. Valid response payload satisfies preSerialization contract', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test-validate-response-valid',
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.equal(body.success, true);
    assert.equal(body.data.email, 'valid@example.com');
  });

  test('5. Invalid response payload triggers 500 error preventing contract breach', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test-validate-response-invalid',
    });

    assert.equal(response.statusCode, 500);
    const body = JSON.parse(response.payload);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(body.error.message, 'Response contract validation failed');
  });

  test('6. Operational ConflictError returns structured 409 envelope', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test-operational-conflict',
    });

    assert.equal(response.statusCode, 409);
    const body = JSON.parse(response.payload);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'CONFLICT');
    assert.equal(body.error.message, 'Tenant slug is already taken');
    assert.ok(body.error.requestId);
  });

  test('7. Unhandled exceptions return safe 500 without leaking stack trace or secrets', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test-unhandled-error',
    });

    assert.equal(response.statusCode, 500);
    const body = JSON.parse(response.payload);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(body.error.message, 'An unexpected internal server error occurred');
    assert.equal(response.payload.includes('password leak'), false);
    assert.equal(response.payload.includes('at async'), false);
  });
});
