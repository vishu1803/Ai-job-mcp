/**
 * @file Unit Tests: Application State Machine & Content Hash Engine (Phase 12 / P12-001)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  VALID_STATUS_TRANSITIONS,
  TERMINAL_STATUSES,
  isValidStatusTransition,
  assertValidStatusTransition,
  isTerminalStatus,
  sortObjectKeys,
  computeDocumentContentHash,
} from '../../src/domain/career/application-state-machine.js';
import { ValidationError } from '../../src/errors/index.js';

describe('Application State Machine & Content Integrity Unit Tests (P12-001)', () => {
  describe('1. Valid State Transitions', () => {
    it('exposes frozen transition graph and terminal status list', () => {
      assert.ok(Object.isFrozen(VALID_STATUS_TRANSITIONS));
      assert.ok(Object.isFrozen(TERMINAL_STATUSES));
      assert.strictEqual(Object.keys(VALID_STATUS_TRANSITIONS).length, 9);
      assert.strictEqual(TERMINAL_STATUSES.length, 4);
    });

    it('allows standard forward progression: SAVED -> APPLIED -> SCREENING -> INTERVIEWING -> OFFER_RECEIVED -> OFFER_ACCEPTED', () => {
      assert.ok(isValidStatusTransition('SAVED', 'APPLIED'));
      assert.ok(isValidStatusTransition('APPLIED', 'SCREENING'));
      assert.ok(isValidStatusTransition('SCREENING', 'INTERVIEWING'));
      assert.ok(isValidStatusTransition('INTERVIEWING', 'OFFER_RECEIVED'));
      assert.ok(isValidStatusTransition('OFFER_RECEIVED', 'OFFER_ACCEPTED'));
      assert.ok(isValidStatusTransition('OFFER_ACCEPTED', 'ARCHIVED'));
    });

    it('allows direct progression from APPLIED -> INTERVIEWING (skipping recruiter screen for technical referral)', () => {
      assert.ok(isValidStatusTransition('APPLIED', 'INTERVIEWING'));
    });

    it('allows direct progression from SCREENING -> OFFER_RECEIVED (for flat structure or direct offer)', () => {
      assert.ok(isValidStatusTransition('SCREENING', 'OFFER_RECEIVED'));
    });

    it('allows rejection from any active state', () => {
      assert.ok(isValidStatusTransition('APPLIED', 'REJECTED'));
      assert.ok(isValidStatusTransition('SCREENING', 'REJECTED'));
      assert.ok(isValidStatusTransition('INTERVIEWING', 'REJECTED'));
      assert.ok(isValidStatusTransition('OFFER_RECEIVED', 'REJECTED')); // Rescinded
    });

    it('allows voluntary withdrawal from any active state', () => {
      assert.ok(isValidStatusTransition('SAVED', 'WITHDRAWN'));
      assert.ok(isValidStatusTransition('APPLIED', 'WITHDRAWN'));
      assert.ok(isValidStatusTransition('SCREENING', 'WITHDRAWN'));
      assert.ok(isValidStatusTransition('INTERVIEWING', 'WITHDRAWN'));
      assert.ok(isValidStatusTransition('OFFER_RECEIVED', 'WITHDRAWN')); // Declined
    });

    it('allows archiving from any active or terminal state', () => {
      assert.ok(isValidStatusTransition('SAVED', 'ARCHIVED'));
      assert.ok(isValidStatusTransition('APPLIED', 'ARCHIVED'));
      assert.ok(isValidStatusTransition('SCREENING', 'ARCHIVED'));
      assert.ok(isValidStatusTransition('INTERVIEWING', 'ARCHIVED'));
      assert.ok(isValidStatusTransition('OFFER_RECEIVED', 'ARCHIVED'));
      assert.ok(isValidStatusTransition('OFFER_ACCEPTED', 'ARCHIVED'));
      assert.ok(isValidStatusTransition('REJECTED', 'ARCHIVED'));
      assert.ok(isValidStatusTransition('WITHDRAWN', 'ARCHIVED'));
    });

    it('allows reopening of REJECTED, WITHDRAWN, or ARCHIVED applications', () => {
      assert.ok(isValidStatusTransition('REJECTED', 'APPLIED'));
      assert.ok(isValidStatusTransition('WITHDRAWN', 'APPLIED'));
      assert.ok(isValidStatusTransition('WITHDRAWN', 'SAVED'));
      assert.ok(isValidStatusTransition('ARCHIVED', 'SAVED'));
      assert.ok(isValidStatusTransition('ARCHIVED', 'APPLIED'));
      assert.ok(isValidStatusTransition('ARCHIVED', 'SCREENING'));
      assert.ok(isValidStatusTransition('ARCHIVED', 'INTERVIEWING'));
    });

    it('allows idempotent self-transitions', () => {
      assert.ok(isValidStatusTransition('SAVED', 'SAVED'));
      assert.ok(isValidStatusTransition('APPLIED', 'APPLIED'));
      assert.ok(isValidStatusTransition('INTERVIEWING', 'INTERVIEWING'));
      assert.ok(isValidStatusTransition('OFFER_ACCEPTED', 'OFFER_ACCEPTED'));
    });
  });

  describe('2. Illegal State Transitions (Violations)', () => {
    it('rejects illegal leap from SAVED directly to OFFER_ACCEPTED', () => {
      assert.strictEqual(isValidStatusTransition('SAVED', 'OFFER_ACCEPTED'), false);
      assert.throws(
        () => assertValidStatusTransition('SAVED', 'OFFER_ACCEPTED'),
        (err) =>
          err instanceof ValidationError && err.message.includes('Illegal application status')
      );
    });

    it('rejects illegal leap from SAVED directly to INTERVIEWING', () => {
      assert.strictEqual(isValidStatusTransition('SAVED', 'INTERVIEWING'), false);
      assert.throws(() => assertValidStatusTransition('SAVED', 'INTERVIEWING'), ValidationError);
    });

    it('rejects illegal leap from SAVED directly to OFFER_RECEIVED', () => {
      assert.strictEqual(isValidStatusTransition('SAVED', 'OFFER_RECEIVED'), false);
      assert.throws(() => assertValidStatusTransition('SAVED', 'OFFER_RECEIVED'), ValidationError);
    });

    it('rejects illegal regression from APPLIED back to SAVED', () => {
      assert.strictEqual(isValidStatusTransition('APPLIED', 'SAVED'), false);
      assert.throws(() => assertValidStatusTransition('APPLIED', 'SAVED'), ValidationError);
    });

    it('rejects illegal transition from OFFER_ACCEPTED to active interview states', () => {
      assert.strictEqual(isValidStatusTransition('OFFER_ACCEPTED', 'APPLIED'), false);
      assert.strictEqual(isValidStatusTransition('OFFER_ACCEPTED', 'SCREENING'), false);
      assert.strictEqual(isValidStatusTransition('OFFER_ACCEPTED', 'INTERVIEWING'), false);
      assert.strictEqual(isValidStatusTransition('OFFER_ACCEPTED', 'OFFER_RECEIVED'), false);
    });

    it('rejects unknown or null status transitions gracefully', () => {
      assert.strictEqual(isValidStatusTransition(null, 'APPLIED'), false);
      assert.strictEqual(isValidStatusTransition('SAVED', null), false);
      assert.strictEqual(isValidStatusTransition('UNKNOWN_STATUS', 'APPLIED'), false);
      assert.strictEqual(isValidStatusTransition('SAVED', 'UNKNOWN_STATUS'), false);
    });
  });

  describe('3. Terminal Status Classifications', () => {
    it('correctly identifies terminal statuses', () => {
      assert.strictEqual(isTerminalStatus('OFFER_ACCEPTED'), true);
      assert.strictEqual(isTerminalStatus('REJECTED'), true);
      assert.strictEqual(isTerminalStatus('WITHDRAWN'), true);
      assert.strictEqual(isTerminalStatus('ARCHIVED'), true);
    });

    it('correctly identifies non-terminal active statuses', () => {
      assert.strictEqual(isTerminalStatus('SAVED'), false);
      assert.strictEqual(isTerminalStatus('APPLIED'), false);
      assert.strictEqual(isTerminalStatus('SCREENING'), false);
      assert.strictEqual(isTerminalStatus('INTERVIEWING'), false);
      assert.strictEqual(isTerminalStatus('OFFER_RECEIVED'), false);
    });
  });

  describe('4. Deterministic Content Hashing & Key Sorting', () => {
    it('sorts object keys recursively to ensure deterministic serialization', () => {
      const objA = { z: 1, a: 2, m: { y: 10, b: 20 } };
      const objB = { a: 2, z: 1, m: { b: 20, y: 10 } };

      const sortedA = sortObjectKeys(objA);
      const sortedB = sortObjectKeys(objB);

      assert.strictEqual(JSON.stringify(sortedA), JSON.stringify(sortedB));
    });

    it('produces identical SHA-256 hash for objects with different key ordering', () => {
      const payload1 = {
        title: 'Backend Resume',
        skills: ['nodejs', 'postgresql', 'fastify'],
        metadata: { version: 1, author: 'Antigravity' },
      };

      const payload2 = {
        metadata: { author: 'Antigravity', version: 1 },
        skills: ['nodejs', 'postgresql', 'fastify'],
        title: 'Backend Resume',
      };

      const hash1 = computeDocumentContentHash(payload1);
      const hash2 = computeDocumentContentHash(payload2);

      assert.strictEqual(hash1.length, 64);
      assert.strictEqual(hash2.length, 64);
      assert.strictEqual(hash1, hash2);
    });

    it('produces different SHA-256 hashes for different content payloads', () => {
      const payloadA = { title: 'Backend Resume v1', score: 85 };
      const payloadB = { title: 'Backend Resume v2', score: 95 };

      const hashA = computeDocumentContentHash(payloadA);
      const hashB = computeDocumentContentHash(payloadB);

      assert.notStrictEqual(hashA, hashB);
    });
  });
});
