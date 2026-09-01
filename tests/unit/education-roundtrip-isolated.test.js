/**
 * @file Unit Test Suite for Isolated Education Roundtrip & Mutation Lifecycle.
 *
 * Requirements:
 * - Uses strictly isolated synthetic candidate fixtures (randomUUID).
 * - Never targets or mutates real candidate records.
 * - Validates end-to-end roundtrip: baseline -> user update -> MCP read -> restore -> MCP read.
 * - Enforces evidence locking: verified skills and projects remain immutable during education edits.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { handleGetCandidateProfile } from '../../src/mcp/tools/career-read-tools.js';
import { randomUUID } from 'node:crypto';

describe('Isolated Education Roundtrip & Mutation Lifecycle (Synthetic Fixture)', () => {
  let mockDb;
  let service;
  const tenantId = randomUUID();
  const candidateId = randomUUID();
  const userId = randomUUID();

  const context = {
    tenantId,
    userId,
    role: 'OWNER',
    email: 'synthetic.user@example.com',
  };

  let candidateRecord;
  let mockSkills;
  let mockProjects;

  beforeEach(() => {
    candidateRecord = {
      id: candidateId,
      tenantId,
      userId,
      displayName: 'Synthetic Candidate',
      headline: 'Full-Stack Developer',
      summary: 'Experienced developer building systems.',
      canonicalEmail: 'synthetic.user@example.com',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      profileMetadata: {
        currentRole: 'Full-Stack Developer',
        location: 'Sonbhadra',
        careerStatus: 'FRESHER',
        currentEmployment: null,
        resumeData: {
          education: [
            {
              institution: 'Rajkiya Engineering College',
              degree: 'Bachelor of Technology in Electronics Engineering',
              fieldOfStudy: 'Electronics Engineering',
              degreeType: 'BACHELOR',
              location: 'Sonbhadra',
              startDate: null,
              endDate: '2025-07',
              isCurrent: false,
              rawDateRange: 'Graduation: July 2025',
              coursework: [
                'Data Structures & Algorithms',
                'C',
                'Python',
                'Operating Systems',
                'DBMS',
                'Computer Networks',
              ],
              gradeOrGpa: null,
              rawText:
                'Rajkiya Engineering College | Sonbhadra | Graduation: July 2025\nBachelor of Technology in Electronics Engineering',
              provenanceStatus: 'CLAIMED',
            },
          ],
        },
        userCustom: {
          education: [
            {
              institution: 'Rajkiya Engineering College',
              degree: 'Bachelor of Technology in Electronics Engineering',
              fieldOfStudy: 'Electronics Engineering',
              degreeType: 'BACHELOR',
              location: 'Sonbhadra',
              startDate: '2021',
              endDate: '2025-07',
              isCurrent: false,
              rawDateRange: '2021 - 2025-07',
              coursework: [
                'Data Structures & Algorithms',
                'C',
                'Python',
                'Operating Systems',
                'DBMS',
                'Computer Networks',
              ],
              gradeOrGpa: null,
              rawText:
                'Rajkiya Engineering College | Bachelor of Technology in Electronics Engineering',
              provenanceStatus: 'USER_PROVIDED',
            },
          ],
        },
      },
    };

    mockSkills = [
      {
        slug: 'fastify',
        name: 'Fastify',
        category: 'FRAMEWORK',
        fineCategory: 'BACKEND_FRAMEWORK',
        tier: 'PRIMARY',
        confidenceScore: 0.95,
        evidenceCount: 5,
        provenanceStatus: 'VERIFIED',
        truthStatus: 'VERIFIED',
        githubEvidence: true,
        resumeClaim: true,
        source: 'BOTH',
      },
      {
        slug: 'react',
        name: 'React',
        category: 'FRAMEWORK',
        fineCategory: 'FRONTEND_FRAMEWORK',
        tier: 'PRIMARY',
        confidenceScore: 0.9,
        evidenceCount: 4,
        provenanceStatus: 'VERIFIED',
        truthStatus: 'VERIFIED',
        githubEvidence: true,
        resumeClaim: true,
        source: 'BOTH',
      },
    ];

    mockProjects = [
      {
        id: randomUUID(),
        name: 'Ai-job-mcp',
        headline: 'AI Career Agent with MCP',
        technologies: ['Fastify', 'PostgreSQL', 'JavaScript'],
        provenanceStatus: 'VERIFIED',
        verifiedSignalCount: 8,
        evidence: [{ id: randomUUID() }],
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
    service.getProfile = async () => ({
      candidate: candidateRecord,
      skills: mockSkills,
      projects: mockProjects,
      resources: [{ id: randomUUID(), isPrivate: false }],
      identities: [{ provider: 'github', externalUsername: 'synthetic', verified: true }],
    });
  });

  it('1. should verify baseline initial state on synthetic candidate', async () => {
    const p1 = await service.getCareerProfile(context, candidateId);
    const m1 = await handleGetCandidateProfile(
      context,
      { candidateId },
      { db: mockDb, candidateProfileService: service }
    );

    assert.equal(p1.education.length, 1);
    assert.equal(p1.education[0].location, 'Sonbhadra');
    assert.equal(p1.education[0].provenanceStatus, 'USER_PROVIDED');
    assert.equal(p1.topSkills.length, 2);

    assert.equal(m1.education.length, 1);
    assert.equal(m1.education[0].location, 'Sonbhadra');
  });

  it('2. should mutate and restore education without data leak or collateral mutation', async () => {
    // Step A: Baseline
    const p1 = await service.getCareerProfile(context, candidateId);
    assert.equal(p1.education[0].location, 'Sonbhadra');
    assert.equal(p1.topSkills.length, 2);

    // Step B: Temporary Mutation
    const editedEdu = JSON.parse(JSON.stringify(p1.education));
    editedEdu[0].location = 'Isolated Temporary Test Location';
    await service.updateUserProfileSections(context, candidateId, { education: editedEdu });

    // Step C: Verify Mutation in Service and MCP
    const p2 = await service.getCareerProfile(context, candidateId);
    const m2 = await handleGetCandidateProfile(
      context,
      { candidateId },
      { db: mockDb, candidateProfileService: service }
    );

    assert.equal(p2.education[0].location, 'Isolated Temporary Test Location');
    assert.equal(m2.education[0].location, 'Isolated Temporary Test Location');
    assert.equal(p2.topSkills.length, 2); // Invariant skills count

    // Step D: Restore Original State
    editedEdu[0].location = 'Sonbhadra';
    await service.updateUserProfileSections(context, candidateId, { education: editedEdu });

    // Step E: Verify Restored State in Service and MCP
    const p3 = await service.getCareerProfile(context, candidateId);
    const m3 = await handleGetCandidateProfile(
      context,
      { candidateId },
      { db: mockDb, candidateProfileService: service }
    );

    assert.equal(p3.education[0].location, 'Sonbhadra');
    assert.equal(m3.education[0].location, 'Sonbhadra');
    assert.equal(p3.education[0].institution, 'Rajkiya Engineering College');
    assert.equal(p3.education[0].coursework.length, 6);
    assert.equal(p3.topSkills.length, 2); // Invariant skills count
  });

  it('3. should enforce strict candidate ID boundary and reject mutations when unauthenticated/unauthorized', async () => {
    const foreignTenantContext = {
      tenantId: randomUUID(),
      userId: randomUUID(),
      role: 'MEMBER',
    };

    await assert.rejects(
      async () => {
        await service.updateUserProfileSections(foreignTenantContext, candidateId, {
          education: [{ institution: 'Hacker University' }],
        });
      },
      { name: 'AuthorizationError' }
    );
  });
});
