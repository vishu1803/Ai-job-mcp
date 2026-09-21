/**
 * @file Unit Tests for Web Route Abuse Rate Limiting (P13.5-004).
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { McpRateLimiter } from '../../src/security/mcp-rate-limiter.js';

describe('Web Application Abuse Rate Limiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new McpRateLimiter();
  });

  test('enforces upload rate limit tier (default 10 uploads / window)', () => {
    const userId = 'user-test-upload-1';

    // 10 uploads should succeed
    for (let i = 0; i < 10; i++) {
      assert.doesNotThrow(() => {
        limiter.checkUploadLimit(userId, 10, 60000);
      });
    }

    // 11th upload must throw RATE_LIMITED AppError
    assert.throws(
      () => {
        limiter.checkUploadLimit(userId, 10, 60000);
      },
      (err) => {
        assert.equal(err.name, 'AppError');
        assert.equal(err.statusCode, 429);
        assert.equal(err.code, 'RATE_LIMITED');
        assert.ok(err.message.includes('Upload rate limit exceeded'));
        return true;
      }
    );
  });

  test('enforces generation rate limit tier (LaTeX / Tailoring)', () => {
    const tenantId = 'tenant-test-gen-1';

    // 5 generations with limit=5
    for (let i = 0; i < 5; i++) {
      assert.doesNotThrow(() => {
        limiter.checkGenerationLimit(tenantId, 5, 60000);
      });
    }

    // 6th generation throws
    assert.throws(
      () => {
        limiter.checkGenerationLimit(tenantId, 5, 60000);
      },
      (err) => {
        assert.equal(err.name, 'AppError');
        assert.equal(err.statusCode, 429);
        assert.equal(err.code, 'RATE_LIMITED');
        assert.ok(err.message.includes('Generation rate limit exceeded'));
        return true;
      }
    );
  });

  test('enforces AI message copilot rate limit tier', () => {
    const userId = 'user-test-msg-1';

    // 3 messages with limit=3
    for (let i = 0; i < 3; i++) {
      assert.doesNotThrow(() => {
        limiter.checkAiMessageLimit(userId, 3, 60000);
      });
    }

    // 4th message throws
    assert.throws(
      () => {
        limiter.checkAiMessageLimit(userId, 3, 60000);
      },
      (err) => {
        assert.equal(err.name, 'AppError');
        assert.equal(err.statusCode, 429);
        assert.equal(err.code, 'RATE_LIMITED');
        assert.ok(err.message.includes('Message rate limit exceeded'));
        return true;
      }
    );
  });

  test('isolates different users on upload limits', () => {
    const userA = 'user-a';
    const userB = 'user-b';

    for (let i = 0; i < 2; i++) {
      limiter.checkUploadLimit(userA, 2, 60000);
    }

    // userA is blocked
    assert.throws(() => limiter.checkUploadLimit(userA, 2, 60000));

    // userB is not affected
    assert.doesNotThrow(() => limiter.checkUploadLimit(userB, 2, 60000));
  });
});
