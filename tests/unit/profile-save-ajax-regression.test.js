/**
 * @file Regression Tests for JSON Profile Save (Phase A - Performance Fix).
 *
 * Tests:
 * 1. JSON profile save returns 200 with minimal confirmation (no full profile rebuild).
 * 2. getCareerProfile is NOT called as part of the minimal save response.
 * 3. DB mutation persists correctly.
 * 4. Skills remain evidence-locked (cannot be modified via save).
 * 5. Projects remain evidence-locked (cannot be modified via save).
 * 6. Authorization remains enforced (non-owner cannot mutate).
 * 7. Tenant isolation remains enforced (cross-tenant mutation blocked).
 * 8. Legacy form submit path still works (backward compatibility).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { randomUUID } from 'node:crypto';

describe('JSON Profile Save - Phase A Regression', () => {
  let mockDb;
  let service;
  let getCareerProfileCallCount;
  const tenantId = randomUUID();
  const candidateId = randomUUID();
  const userId = randomUUID();

  const baseContext = {
    tenantId,
    userId,
    role: 'OWNER',
  };

  let candidateRecord;

  beforeEach(() => {
    getCareerProfileCallCount = 0;

    candidateRecord = {
      id: candidateId,
      tenantId,
      userId,
      displayName: 'Test Candidate',
      headline: 'Backend Developer',
      summary: 'Building scalable systems.',
      canonicalEmail: 'test@example.com',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      profileMetadata: {
        currentRole: 'Backend Developer',
        location: 'Test City',
        careerStatus: 'EMPLOYED',
        currentEmployment: null,
        userCustom: {
          experience: [],
          education: [],
          certifications: [],
          languages: [],
          portfolioLinks: [],
        },
        careerPreferences: {
          targetRoles: ['Backend Engineer'],
          preferredLocations: ['Remote'],
          remotePreference: 'FLEXIBLE',
          employmentTypes: ['FULL_TIME'],
        },
      },
    };

    const mockSkills = [
      {
        slug: 'nodejs',
        name: 'Node.js',
        category: 'LANGUAGE',
        fineCategory: 'CORE_LANGUAGE',
        tier: 'PRIMARY',
        confidenceScore: 0.9,
        evidenceCount: 5,
        provenanceStatus: 'VERIFIED',
        truthStatus: 'VERIFIED',
        githubEvidence: true,
        resumeClaim: false,
        source: 'GITHUB',
      },
    ];

    mockDb = {
      select: () => ({
        from: () => ({
          where: () => {
            const res = Promise.resolve([candidateRecord]);
            res.limit = () => Promise.resolve([candidateRecord]);
            res.orderBy = () => Promise.resolve([candidateRecord]);
            return res;
          },
          leftJoin() {
            return this;
          },
        }),
      }),
      update: () => ({
        set: (updates) => {
          const applyUpdates = () => {
            if (updates.displayName) candidateRecord.displayName = updates.displayName;
            if (updates.headline !== undefined) candidateRecord.headline = updates.headline;
            if (updates.summary !== undefined) candidateRecord.summary = updates.summary;
            if (updates.profileMetadata) candidateRecord.profileMetadata = updates.profileMetadata;
            candidateRecord.updatedAt = new Date().toISOString();
          };
          return {
            where: () => {
              applyUpdates();
              const result = Promise.resolve([candidateRecord]);
              result.returning = () => Promise.resolve([candidateRecord]);
              return result;
            },
          };
        },
      }),
    };

    service = new CandidateProfileService(mockDb);

    // Mock getProfile (used by getCareerProfile)
    service.getProfile = async () => {
      getCareerProfileCallCount++;
      return {
        candidate: candidateRecord,
        skills: mockSkills,
        projects: [],
        resources: [],
        identities: [],
      };
    };

    // Spy on getCareerProfile
    const originalGetCareerProfile = service.getCareerProfile.bind(service);
    service.getCareerProfile = async (...args) => {
      getCareerProfileCallCount++;
      return originalGetCareerProfile(...args);
    };
  });

  describe('1. Minimal Response Mode', () => {
    it('returns minimal confirmation when minimalResponse is true', async () => {
      const result = await service.updateUserProfileSections(
        baseContext,
        candidateId,
        { displayName: 'Updated Name', headline: 'New Headline' },
        { minimalResponse: true }
      );

      assert.equal(result.ok, true);
      assert.ok(result.updatedAt);
      assert.ok(result.candidateId);
      assert.equal(result.candidateId, candidateId);
      assert.equal(result.displayName, 'Updated Name');
    });

    it('does NOT call getCareerProfile when minimalResponse is true', async () => {
      getCareerProfileCallCount = 0;

      await service.updateUserProfileSections(
        baseContext,
        candidateId,
        { displayName: 'Minimal Test' },
        { minimalResponse: true }
      );

      assert.equal(
        getCareerProfileCallCount,
        0,
        'getCareerProfile should not be called in minimal mode'
      );
    });

    it('calls getCareerProfile when minimalResponse is NOT set (legacy path)', async () => {
      getCareerProfileCallCount = 0;

      await service.updateUserProfileSections(baseContext, candidateId, {
        displayName: 'Legacy Test',
      });

      assert.ok(getCareerProfileCallCount > 0, 'getCareerProfile should be called in legacy mode');
    });
  });

  describe('2. DB Mutation Persistence', () => {
    it('persists displayName update in the database', async () => {
      await service.updateUserProfileSections(
        baseContext,
        candidateId,
        { displayName: 'Persisted Name' },
        { minimalResponse: true }
      );

      assert.equal(candidateRecord.displayName, 'Persisted Name');
    });

    it('persists headline update in the database', async () => {
      await service.updateUserProfileSections(
        baseContext,
        candidateId,
        { headline: 'Senior Engineer' },
        { minimalResponse: true }
      );

      assert.equal(candidateRecord.headline, 'Senior Engineer');
    });

    it('persists summary update in the database', async () => {
      await service.updateUserProfileSections(
        baseContext,
        candidateId,
        { summary: 'Updated summary text' },
        { minimalResponse: true }
      );

      assert.equal(candidateRecord.summary, 'Updated summary text');
    });

    it('persists experience records in profileMetadata', async () => {
      await service.updateUserProfileSections(
        baseContext,
        candidateId,
        {
          experience: [
            {
              company: 'Test Corp',
              title: 'Engineer',
              employmentType: 'FULL_TIME',
              startDate: '2024-01',
              endDate: '2024-12',
              isCurrent: false,
              bullets: ['Built things'],
            },
          ],
        },
        { minimalResponse: true }
      );

      const exp = candidateRecord.profileMetadata.userCustom.experience;
      assert.equal(exp.length, 1);
      assert.equal(exp[0].company, 'Test Corp');
      assert.equal(exp[0].provenanceStatus, 'USER_PROVIDED');
    });

    it('persists education records via EducationNormalizer', async () => {
      await service.updateUserProfileSections(
        baseContext,
        candidateId,
        {
          education: [
            {
              institution: 'Test University',
              degree: 'B.Tech',
              degreeType: 'BACHELOR',
              fieldOfStudy: 'CS',
              startDate: '2020-06',
              endDate: '2024-06',
              isCurrent: false,
            },
          ],
        },
        { minimalResponse: true }
      );

      const edu = candidateRecord.profileMetadata.userCustom.education;
      assert.ok(edu.length >= 1);
      assert.equal(edu[0].institution, 'Test University');
    });

    it('persists career preferences', async () => {
      await service.updateUserProfileSections(
        baseContext,
        candidateId,
        {
          jobPreferences: {
            targetRoles: ['Frontend Engineer', 'Full Stack'],
            preferredLocations: ['Remote', 'Berlin'],
            remotePreference: 'REMOTE_ONLY',
            employmentTypes: ['FULL_TIME'],
          },
        },
        { minimalResponse: true }
      );

      const prefs = candidateRecord.profileMetadata.careerPreferences;
      assert.deepEqual(prefs.targetRoles, ['Frontend Engineer', 'Full Stack']);
      assert.deepEqual(prefs.preferredLocations, ['Remote', 'Berlin']);
      assert.equal(prefs.remotePreference, 'REMOTE_ONLY');
    });
  });

  describe('3. Evidence-Locked Invariants', () => {
    it('discards manual skill tampering attempts', async () => {
      const result = await service.updateUserProfileSections(
        baseContext,
        candidateId,
        {
          displayName: 'Tamper Test',
          skills: [
            {
              slug: 'fake-skill',
              name: 'Fake Skill',
              provenanceStatus: 'VERIFIED',
              confidenceScore: 1.0,
              evidenceCount: 999,
            },
          ],
        },
        { minimalResponse: true }
      );

      // The minimal response doesn't include skills, but verify the DB wasn't corrupted
      assert.equal(result.ok, true);
      // Skills are NOT in profileMetadata.userCustom - they come from candidate_skills table
      assert.ok(
        !candidateRecord.profileMetadata.userCustom.skills,
        'skills should not be stored in userCustom'
      );
    });

    it('discards manual project tampering attempts', async () => {
      const result = await service.updateUserProfileSections(
        baseContext,
        candidateId,
        {
          displayName: 'Project Tamper Test',
          projects: [
            {
              name: 'Fake Project',
              provenanceStatus: 'VERIFIED',
            },
          ],
        },
        { minimalResponse: true }
      );

      assert.equal(result.ok, true);
      // Projects are NOT in profileMetadata.userCustom - they come from projects table
      assert.ok(
        !candidateRecord.profileMetadata.userCustom.projects,
        'projects should not be stored in userCustom'
      );
    });

    it('preserves USER_PROVIDED provenance on user-edited records', async () => {
      await service.updateUserProfileSections(
        baseContext,
        candidateId,
        {
          experience: [
            {
              company: 'User Corp',
              title: 'Developer',
              employmentType: 'FULL_TIME',
              startDate: '2024-01',
              isCurrent: true,
            },
          ],
        },
        { minimalResponse: true }
      );

      const exp = candidateRecord.profileMetadata.userCustom.experience;
      assert.equal(exp[0].provenanceStatus, 'USER_PROVIDED');
    });
  });

  describe('4. Authorization Enforcement', () => {
    it('rejects mutation from READONLY role', async () => {
      const readonlyContext = { tenantId, userId, role: 'READONLY' };

      try {
        await service.updateUserProfileSections(
          readonlyContext,
          candidateId,
          { displayName: 'Readonly Hack' },
          { minimalResponse: true }
        );
        assert.fail('Should have thrown AuthorizationError');
      } catch (err) {
        assert.ok(
          err.message.includes('Cannot modify') || err.constructor.name === 'AuthorizationError'
        );
      }
    });

    it('allows mutation from OWNER role', async () => {
      const result = await service.updateUserProfileSections(
        baseContext,
        candidateId,
        { displayName: 'Owner Edit' },
        { minimalResponse: true }
      );

      assert.equal(result.ok, true);
    });

    it('allows mutation from MEMBER role on self-linked candidate', async () => {
      const memberContext = { tenantId, userId, role: 'MEMBER' };

      const result = await service.updateUserProfileSections(
        memberContext,
        candidateId,
        { displayName: 'Member Edit' },
        { minimalResponse: true }
      );

      assert.equal(result.ok, true);
    });
  });

  describe('5. Tenant Isolation', () => {
    it('rejects cross-tenant mutation', async () => {
      const foreignTenantId = randomUUID();
      const foreignContext = { tenantId: foreignTenantId, userId, role: 'OWNER' };

      // Override mock to return null for cross-tenant queries
      const originalSelect = mockDb.select;
      mockDb.select = () => ({
        from: () => ({
          where: () => {
            const res = Promise.resolve([]);
            res.limit = () => Promise.resolve([]);
            res.orderBy = () => Promise.resolve([]);
            return res;
          },
          leftJoin() {
            return this;
          },
        }),
      });

      try {
        await service.updateUserProfileSections(
          foreignContext,
          candidateId,
          { displayName: 'Cross-Tenant Hack' },
          { minimalResponse: true }
        );
        assert.fail('Should have thrown NotFoundError');
      } catch (err) {
        assert.ok(
          err.message.includes('not found') ||
            err.message.includes('Not found') ||
            err.constructor.name === 'NotFoundError'
        );
      } finally {
        mockDb.select = originalSelect;
      }
    });
  });

  describe('6. Response Shape Contract', () => {
    it('returns correct JSON shape for minimal response', async () => {
      const result = await service.updateUserProfileSections(
        baseContext,
        candidateId,
        { displayName: 'Shape Test' },
        { minimalResponse: true }
      );

      // Verify exact shape
      assert.equal(typeof result.ok, 'boolean');
      assert.equal(result.ok, true);
      assert.equal(typeof result.updatedAt, 'string');
      assert.ok(
        new Date(result.updatedAt).toISOString() === result.updatedAt,
        'updatedAt should be ISO string'
      );
      assert.equal(typeof result.candidateId, 'string');
      assert.equal(typeof result.displayName, 'string');
      assert.equal(result.candidateId, candidateId);
    });

    it('updatedAt reflects the actual DB write time', async () => {
      const before = new Date().toISOString();
      const result = await service.updateUserProfileSections(
        baseContext,
        candidateId,
        { displayName: 'Timestamp Test' },
        { minimalResponse: true }
      );
      const after = new Date().toISOString();

      assert.ok(result.updatedAt >= before, 'updatedAt should be after start time');
      assert.ok(result.updatedAt <= after, 'updatedAt should be before end time');
    });
  });
});
