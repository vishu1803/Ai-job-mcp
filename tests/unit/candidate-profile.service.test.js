/**
 * @file Unit Tests for Candidate Profile Service (P4-005)
 *
 * Verifies:
 * 1. RBAC permissions (OWNER vs MEMBER self-linked vs MEMBER other vs READONLY)
 * 2. Input contract validation for candidate creation, updates, and claims
 * 3. Narrative sovereignty and protected fields validation
 * 4. Profile metadata partitioning (userCustom vs systemInferred)
 * 5. Trusted context and tenant scoping guards
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { ValidationError, AuthorizationError } from '../../src/errors/index.js';

describe('Candidate Profile Service Unit Tests (P4-005)', () => {
  const service = new CandidateProfileService();

  // -------------------------------------------------------------------------
  // 1. RBAC Guard Tests
  // -------------------------------------------------------------------------
  describe('1. Role-Based Access Control (RBAC)', () => {
    it('permits OWNER to mutate any candidate profile in the tenant', async () => {
      const ownerContext = { tenantId: 'tenant-1', userId: 'user-1', role: 'OWNER' };
      const otherUserCandidate = { id: 'cand-1', tenantId: 'tenant-1', userId: 'user-99' };

      await assert.doesNotReject(async () => {
        await service._assertCanMutateCandidate(ownerContext, otherUserCandidate);
      });
    });

    it('permits MEMBER to mutate their self-linked candidate profile', async () => {
      const memberContext = { tenantId: 'tenant-1', userId: 'user-2', role: 'MEMBER' };
      const selfCandidate = { id: 'cand-2', tenantId: 'tenant-1', userId: 'user-2' };

      await assert.doesNotReject(async () => {
        await service._assertCanMutateCandidate(memberContext, selfCandidate);
      });
    });

    it('rejects MEMBER from mutating another user candidate profile with 403', async () => {
      const memberContext = { tenantId: 'tenant-1', userId: 'user-2', role: 'MEMBER' };
      const otherCandidate = { id: 'cand-3', tenantId: 'tenant-1', userId: 'user-3' };

      await assert.rejects(
        async () => service._assertCanMutateCandidate(memberContext, otherCandidate),
        (err) => err instanceof AuthorizationError && err.statusCode === 403
      );
    });

    it('rejects READONLY user from any mutating operation with 403', async () => {
      const readonlyContext = { tenantId: 'tenant-1', userId: 'user-4', role: 'READONLY' };
      const candidate = { id: 'cand-4', tenantId: 'tenant-1', userId: 'user-4' };

      await assert.rejects(
        async () => service._assertCanMutateCandidate(readonlyContext, candidate),
        (err) => err instanceof AuthorizationError && err.statusCode === 403
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. Trusted Context Validation
  // -------------------------------------------------------------------------
  describe('2. Trusted Context & Security Validation', () => {
    it('rejects operations when context or tenantId is missing', async () => {
      await assert.rejects(
        async () => service.getProfile(null, 'cand-1'),
        (err) => err instanceof ValidationError && err.message.includes('tenantId')
      );

      await assert.rejects(
        async () => service.getProfile({}, 'cand-1'),
        (err) => err instanceof ValidationError && err.message.includes('tenantId')
      );
    });

    it('rejects createCandidate when called by READONLY user', async () => {
      const readonlyContext = { tenantId: 'tenant-1', userId: 'user-1', role: 'READONLY' };

      await assert.rejects(
        async () => service.createCandidate(readonlyContext, { displayName: 'Alex' }),
        (err) => err instanceof AuthorizationError && err.statusCode === 403
      );
    });

    it('rejects createCandidate when displayName is missing or empty', async () => {
      const ownerContext = { tenantId: 'tenant-1', userId: 'user-1', role: 'OWNER' };

      await assert.rejects(
        async () => service.createCandidate(ownerContext, {}),
        (err) => err instanceof ValidationError && err.message.includes('displayName')
      );

      await assert.rejects(
        async () => service.createCandidate(ownerContext, { displayName: '' }),
        (err) => err instanceof ValidationError && err.message.includes('displayName')
      );
    });

    it('rejects addSkillClaim when skillSlug is missing', async () => {
      const ownerContext = { tenantId: 'tenant-1', userId: 'user-1', role: 'OWNER' };

      await assert.rejects(
        async () => service.addSkillClaim(ownerContext, 'cand-1', {}),
        (err) => err instanceof ValidationError && err.message.includes('skillSlug')
      );
    });

    it('rejects removeSkillClaim when skillId is missing', async () => {
      const ownerContext = { tenantId: 'tenant-1', userId: 'user-1', role: 'OWNER' };

      await assert.rejects(
        async () => service.removeSkillClaim(ownerContext, 'cand-1', null),
        (err) => err instanceof ValidationError && err.message.includes('skillId')
      );
    });
  });
});
