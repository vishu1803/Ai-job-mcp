/**
 * @file Unit Test Suite for P16-001F-3A: Version-Bound Package Identity & Artifact Reuse
 *
 * Covers:
 * A. Legacy package hash calculation
 * B. Structured package hash calculation
 * C. Legacy package vs structured package with identical text produce different hashes
 * D. Changing structuredResume internal fields without changing contract or markdown preserves hash
 * E. Changing generationContractVersion changes packageHash
 * F. Changing structuredResumeSchemaVersion changes packageHash
 * G. Missing structuredResumeSchemaVersion on structured package defaults safely to 2.0.0
 * H. Missing structuredResumeSchemaVersion on legacy package resolves safely to null
 * I. Tracking service recordApplicationPackage: first legacy package => version 1, isReused: false
 * J. Tracking service recordApplicationPackage: subsequent identical legacy package => version 1, isReused: true
 * K. Tracking service recordApplicationPackage: subsequent structured package => version 2, isReused: false, archives v1
 * L. Tracking service recordApplicationPackage: subsequent identical structured package => version 2, isReused: true
 * M. Handoff service: legacy handoff kit reused by legacy package
 * N. Handoff service: legacy handoff kit rejected by structured package (triggers compilation)
 * O. Handoff service: structured handoff kit reused by identical structured package
 * P. ApplicationPackageSchema: validates package containing contract fields
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  computeApplicationPackageHash,
} from '../../src/services/job-application-workflow.service.js';
import {
  ApplicationPackageSchema,
  RESUME_GENERATION_CONTRACT_VERSION,
  LEGACY_GENERATION_CONTRACT_VERSION,
  DEFAULT_STRUCTURED_RESUME_SCHEMA_VERSION,
} from '../../src/domain/job/job-workflow.schemas.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { ApplicationHandoffService } from '../../src/services/application-handoff.service.js';

describe('P16-001F-3A: Version-Bound Package Identity & Artifact Reuse', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';
  const candidateId = '33333333-3333-3333-3333-333333333333';
  const applicationId = '44444444-4444-4444-4444-444444444444';
  const context = { tenantId, userId, role: 'MEMBER' };

  const basePackagePayload = {
    candidateId,
    candidateName: 'Jordan Miller',
    candidateEmail: 'jordan.miller@example.com',
    targetJob: {
      id: 'job-cf-001',
      title: 'Full Stack Engineer - AI & Observability',
      company: 'Cloudflare',
      location: 'Remote',
      source: 'GREENHOUSE',
      applicationUrl: 'https://boards.greenhouse.io/cloudflare/jobs/001',
      description: 'Full stack engineer with Node.js and distributed systems experience.',
      retrievedAt: '2026-09-09T09:00:00.000Z',
    },
    tailoredResume: {
      title: 'Tailored Resume - Cloudflare',
      markdownContent: '# Jordan Miller\n\nFull Stack Engineer with deep Node.js and distributed systems experience.',
      contentHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      fitScore: 92,
    },
    coverLetter: {
      title: 'Cover Letter - Cloudflare',
      markdownContent: 'Dear Cloudflare Hiring Team,\n\nI am excited to apply...',
      contentHash: 'b1c2d3e4f5061728394a5b6c7d8e9f01b1c2d3e4f5061728394a5b6c7d8e9f01',
    },
    verifiedSkills: [
      { name: 'Node.js', category: 'Backend', confidence: 0.95, truthCategory: 'VERIFIED' },
    ],
    claimedSkills: [],
    portfolioLinks: [
      { projectName: 'Telemetry Service', highlights: ['High throughput metric pipeline'] },
    ],
    answers: {
      workAuthorization: 'Authorized to work in the US',
    },
    preparedAt: '2026-09-09T10:00:00.000Z',
  };

  // ---------------------------------------------------------------------------
  // A. Legacy package hash calculation
  // ---------------------------------------------------------------------------
  it('A. Legacy package hash calculation uses contract LEGACY and schemaVersion null', () => {
    const legacyPkg = {
      ...basePackagePayload,
      generationContractVersion: LEGACY_GENERATION_CONTRACT_VERSION,
      structuredResumeSchemaVersion: null,
    };

    const hash = computeApplicationPackageHash(legacyPkg);
    assert.strictEqual(typeof hash, 'string');
    assert.strictEqual(hash.length, 64, 'Must be a 64-char hex SHA-256 hash');

    // Canonical representation must match explicit LEGACY contract
    const expectedCanonical = {
      candidateId: legacyPkg.candidateId,
      candidateName: legacyPkg.candidateName,
      candidateEmail: legacyPkg.candidateEmail,
      jobId: legacyPkg.targetJob.id,
      jobTitle: legacyPkg.targetJob.title,
      company: legacyPkg.targetJob.company,
      resumeContent: legacyPkg.tailoredResume.markdownContent,
      coverLetterContent: legacyPkg.coverLetter.markdownContent,
      answers: legacyPkg.answers,
      generationContractVersion: 'LEGACY',
      structuredResumeSchemaVersion: null,
    };
    const expectedHash = crypto.createHash('sha256').update(JSON.stringify(expectedCanonical), 'utf8').digest('hex');
    assert.strictEqual(hash, expectedHash);
  });

  // ---------------------------------------------------------------------------
  // B. Structured package hash calculation
  // ---------------------------------------------------------------------------
  it('B. Structured package hash calculation uses contract P16-001F and schemaVersion 2.0.0', () => {
    const structuredPkg = {
      ...basePackagePayload,
      generationContractVersion: RESUME_GENERATION_CONTRACT_VERSION,
      structuredResumeSchemaVersion: DEFAULT_STRUCTURED_RESUME_SCHEMA_VERSION,
      structuredResume: {
        schemaVersion: '2.0.0',
        metadata: { schemaVersion: '2.0.0' },
        candidateProfile: { name: 'Jordan Miller' },
      },
    };

    const hash = computeApplicationPackageHash(structuredPkg);
    assert.strictEqual(typeof hash, 'string');
    assert.strictEqual(hash.length, 64);

    const expectedCanonical = {
      candidateId: structuredPkg.candidateId,
      candidateName: structuredPkg.candidateName,
      candidateEmail: structuredPkg.candidateEmail,
      jobId: structuredPkg.targetJob.id,
      jobTitle: structuredPkg.targetJob.title,
      company: structuredPkg.targetJob.company,
      resumeContent: structuredPkg.tailoredResume.markdownContent,
      coverLetterContent: structuredPkg.coverLetter.markdownContent,
      answers: structuredPkg.answers,
      generationContractVersion: 'P16-001F',
      structuredResumeSchemaVersion: '2.0.0',
    };
    const expectedHash = crypto.createHash('sha256').update(JSON.stringify(expectedCanonical), 'utf8').digest('hex');
    assert.strictEqual(hash, expectedHash);
  });

  // ---------------------------------------------------------------------------
  // C. Legacy vs Structured with identical text produce different hashes
  // ---------------------------------------------------------------------------
  it('C. Legacy package vs structured package with identical text produce different package hashes', () => {
    const legacyPkg = {
      ...basePackagePayload,
      generationContractVersion: 'LEGACY',
      structuredResumeSchemaVersion: null,
    };

    const structuredPkg = {
      ...basePackagePayload,
      generationContractVersion: 'P16-001F',
      structuredResumeSchemaVersion: '2.0.0',
      structuredResume: { schemaVersion: '2.0.0' },
    };

    const legacyHash = computeApplicationPackageHash(legacyPkg);
    const structuredHash = computeApplicationPackageHash(structuredPkg);

    assert.notStrictEqual(legacyHash, structuredHash, 'Structured package must produce a distinct hash from legacy package');
  });

  // ---------------------------------------------------------------------------
  // D. Changing structuredResume internal fields preserves packageHash
  // ---------------------------------------------------------------------------
  it('D. Changing structuredResume internal fields without changing contract or markdown preserves packageHash', () => {
    const pkg1 = {
      ...basePackagePayload,
      generationContractVersion: 'P16-001F',
      structuredResumeSchemaVersion: '2.0.0',
      structuredResume: {
        schemaVersion: '2.0.0',
        projects: [{ name: 'Project A', bullets: ['Built telemetry API'] }],
      },
    };

    const pkg2 = {
      ...basePackagePayload,
      generationContractVersion: 'P16-001F',
      structuredResumeSchemaVersion: '2.0.0',
      structuredResume: {
        schemaVersion: '2.0.0',
        projects: [{ name: 'Project A', bullets: ['Built telemetry API with Prometheus exporter'] }],
      },
    };

    const hash1 = computeApplicationPackageHash(pkg1);
    const hash2 = computeApplicationPackageHash(pkg2);

    assert.strictEqual(hash1, hash2, 'Package hash must be contract-bound and invariant to internal structuredResume object edits when markdown is unchanged');
  });

  // ---------------------------------------------------------------------------
  // E. Changing generationContractVersion changes packageHash
  // ---------------------------------------------------------------------------
  it('E. Changing generationContractVersion changes packageHash', () => {
    const pkg1 = {
      ...basePackagePayload,
      generationContractVersion: 'P16-001F',
      structuredResumeSchemaVersion: '2.0.0',
    };

    const pkg2 = {
      ...basePackagePayload,
      generationContractVersion: 'P16-001F-NEXT',
      structuredResumeSchemaVersion: '2.0.0',
    };

    const hash1 = computeApplicationPackageHash(pkg1);
    const hash2 = computeApplicationPackageHash(pkg2);

    assert.notStrictEqual(hash1, hash2, 'Package hash must change when generationContractVersion changes');
  });

  // ---------------------------------------------------------------------------
  // F. Changing structuredResumeSchemaVersion changes packageHash
  // ---------------------------------------------------------------------------
  it('F. Changing structuredResumeSchemaVersion changes packageHash', () => {
    const pkg1 = {
      ...basePackagePayload,
      generationContractVersion: 'P16-001F',
      structuredResumeSchemaVersion: '2.0.0',
    };

    const pkg2 = {
      ...basePackagePayload,
      generationContractVersion: 'P16-001F',
      structuredResumeSchemaVersion: '2.1.0',
    };

    const hash1 = computeApplicationPackageHash(pkg1);
    const hash2 = computeApplicationPackageHash(pkg2);

    assert.notStrictEqual(hash1, hash2, 'Package hash must change when structuredResumeSchemaVersion changes');
  });

  // ---------------------------------------------------------------------------
  // G. Missing structuredResumeSchemaVersion on structured package defaults safely
  // ---------------------------------------------------------------------------
  it('G. Missing structuredResumeSchemaVersion on structured package defaults safely to 2.0.0', () => {
    const pkgWithoutSchemaVer = {
      ...basePackagePayload,
      generationContractVersion: 'P16-001F',
      // structuredResumeSchemaVersion omitted
      structuredResume: {
        // schemaVersion omitted
        metadata: {},
      },
    };

    const pkgWithExplicitSchemaVer = {
      ...basePackagePayload,
      generationContractVersion: 'P16-001F',
      structuredResumeSchemaVersion: '2.0.0',
      structuredResume: {
        schemaVersion: '2.0.0',
        metadata: {},
      },
    };

    const hashDefaulted = computeApplicationPackageHash(pkgWithoutSchemaVer);
    const hashExplicit = computeApplicationPackageHash(pkgWithExplicitSchemaVer);

    assert.strictEqual(hashDefaulted, hashExplicit, 'Missing schema version on structured contract must default safely to 2.0.0');
  });

  // ---------------------------------------------------------------------------
  // H. Missing structuredResumeSchemaVersion on legacy package resolves to null
  // ---------------------------------------------------------------------------
  it('H. Missing structuredResumeSchemaVersion on legacy package resolves safely to null', () => {
    const legacyPkgOmitted = {
      ...basePackagePayload,
      // generationContractVersion omitted, structuredResume omitted => legacy default
    };

    const legacyPkgExplicitNull = {
      ...basePackagePayload,
      generationContractVersion: 'LEGACY',
      structuredResumeSchemaVersion: null,
    };

    const hashOmitted = computeApplicationPackageHash(legacyPkgOmitted);
    const hashExplicit = computeApplicationPackageHash(legacyPkgExplicitNull);

    assert.strictEqual(hashOmitted, hashExplicit, 'Unspecified legacy package must hash with schemaVersion null');
  });

  // ---------------------------------------------------------------------------
  // Helpers for In-Memory Stateful Tracking DB Mock
  // ---------------------------------------------------------------------------
  function createMockTrackingDatabase() {
    const appRecord = {
      id: applicationId,
      tenantId,
      candidateId,
      status: 'SAVED',
      appliedAt: null,
      metadata: {},
      notes: '',
    };
    const packages = [];
    const auditEvents = [];

    const mockDb = {
      transaction: async (cb) => {
        const tx = {
          select: (fields) => ({
            from: (_table) => ({
              where: (condition) => ({
                for: () => {
                  // If fields specifies id/candidateId or notes/metadata, it's querying jobApplications
                  if (fields?.notes !== undefined || fields?.id !== undefined) {
                    return [{ ...appRecord }];
                  }
                  // Otherwise querying applicationPackages
                  const findHash = (obj, visited = new Set()) => {
                    if (!obj || typeof obj !== 'object' || visited.has(obj)) return null;
                    visited.add(obj);
                    if (typeof obj.value === 'string' && /^[a-f0-9]{64}$/i.test(obj.value)) {
                      return obj.value;
                    }
                    if (Array.isArray(obj)) {
                      for (const item of obj) {
                        const found = findHash(item, visited);
                        if (found) return found;
                      }
                    } else {
                      for (const key of Object.keys(obj)) {
                        if (key === 'table') continue;
                        const found = findHash(obj[key], visited);
                        if (found) return found;
                      }
                    }
                    return null;
                  };

                  const hash = findHash(condition);
                  if (hash) {
                    return packages.filter((p) => p.packageHash === hash);
                  }
                  return [...packages];
                },
                // For maxVer query
                then: (resolve) => {
                  const maxVer = packages.length > 0 ? Math.max(...packages.map((p) => p.version)) : 0;
                  return resolve([{ maxVer }]);
                },
              }),
            }),
          }),
          insert: (_table) => ({
            values: (val) => ({
              returning: () => {
                const inserted = {
                  id: crypto.randomUUID(),
                  createdAt: new Date(),
                  preparedAt: new Date(),
                  ...val,
                };
                packages.push(inserted);
                return [inserted];
              },
              then: (resolve) => {
                auditEvents.push(val);
                return resolve([val]);
              },
            }),
          }),
          update: (_table) => ({
            set: (fields) => ({
              where: (_condition) => ({
                returning: () => {
                  // Promoted package
                  const idx = packages.findIndex((p) => p.packageHash === fields.packageHash || p.lifecycleState === 'CURRENT' || p.version);
                  if (idx !== -1) {
                    packages[idx] = { ...packages[idx], ...fields };
                    return [packages[idx]];
                  }
                  return [{ ...fields }];
                },
                then: (resolve) => {
                  if (fields.lifecycleState === 'ARCHIVED') {
                    // Archive all packages except the latest CURRENT one
                    const currentPkg = [...packages].reverse().find((p) => p.lifecycleState === 'CURRENT');
                    for (const p of packages) {
                      if (p !== currentPkg) {
                        p.lifecycleState = 'ARCHIVED';
                      }
                    }
                  } else if (fields.notes !== undefined || fields.metadata !== undefined) {
                    Object.assign(appRecord, fields);
                  }
                  return resolve([]);
                },
              }),
            }),
          }),
        };
        return cb(tx);
      },
    };

    return { mockDb, appRecord, packages, auditEvents };
  }

  // ---------------------------------------------------------------------------
  // I. Tracking service: first legacy package => version 1, CREATED
  // ---------------------------------------------------------------------------
  it('I. Tracking service recordApplicationPackage: first legacy package creates version 1 (isReused: false)', async () => {
    const { mockDb, packages } = createMockTrackingDatabase();
    const service = new ApplicationTrackingService({ database: mockDb });

    const legacyPkg = {
      ...basePackagePayload,
      generationContractVersion: 'LEGACY',
      structuredResumeSchemaVersion: null,
      packageHash: computeApplicationPackageHash({
        ...basePackagePayload,
        generationContractVersion: 'LEGACY',
        structuredResumeSchemaVersion: null,
      }),
    };

    const recorded = await service.recordApplicationPackage(context, applicationId, legacyPkg);

    assert.strictEqual(recorded.version, 1, 'First package must be version 1');
    assert.strictEqual(recorded.lifecycleState, 'CURRENT');
    assert.strictEqual(recorded.isReused, false, 'First package must not be marked reused');
    assert.strictEqual(packages.length, 1);
  });

  // ---------------------------------------------------------------------------
  // J. Tracking service: subsequent identical legacy package => version 1, REUSED
  it('J. Tracking service recordApplicationPackage: subsequent identical legacy package reuses version 1 (isReused: true)', async () => {
    const { mockDb } = createMockTrackingDatabase();
    const service = new ApplicationTrackingService({ database: mockDb });

    const legacyPkg = {
      ...basePackagePayload,
      generationContractVersion: 'LEGACY',
      structuredResumeSchemaVersion: null,
      packageHash: computeApplicationPackageHash({
        ...basePackagePayload,
        generationContractVersion: 'LEGACY',
        structuredResumeSchemaVersion: null,
      }),
    };

    // First record
    await service.recordApplicationPackage(context, applicationId, legacyPkg);

    // Second record with identical packageHash
    const secondRecorded = await service.recordApplicationPackage(context, applicationId, legacyPkg);

    assert.strictEqual(secondRecorded.version, 1, 'Must remain version 1');
    assert.strictEqual(secondRecorded.isReused, true, 'Subsequent identical package must be marked isReused: true');
  });

  // ---------------------------------------------------------------------------
  // K. Tracking service: subsequent structured package => version 2, archives v1
  // ---------------------------------------------------------------------------
  it('K. Tracking service recordApplicationPackage: subsequent structured package creates version 2 and archives v1', async () => {
    const { mockDb, packages } = createMockTrackingDatabase();
    const service = new ApplicationTrackingService({ database: mockDb });

    const legacyPkg = {
      ...basePackagePayload,
      generationContractVersion: 'LEGACY',
      structuredResumeSchemaVersion: null,
      packageHash: computeApplicationPackageHash({
        ...basePackagePayload,
        generationContractVersion: 'LEGACY',
        structuredResumeSchemaVersion: null,
      }),
    };

    // 1. Record legacy v1
    await service.recordApplicationPackage(context, applicationId, legacyPkg);
    assert.strictEqual(packages[0].version, 1);
    assert.strictEqual(packages[0].lifecycleState, 'CURRENT');

    // 2. Prepare structured package with new hash
    const structuredPkg = {
      ...basePackagePayload,
      generationContractVersion: 'P16-001F',
      structuredResumeSchemaVersion: '2.0.0',
      structuredResume: { schemaVersion: '2.0.0' },
      packageHash: computeApplicationPackageHash({
        ...basePackagePayload,
        generationContractVersion: 'P16-001F',
        structuredResumeSchemaVersion: '2.0.0',
      }),
    };

    const structuredRecorded = await service.recordApplicationPackage(context, applicationId, structuredPkg);

    assert.strictEqual(structuredRecorded.version, 2, 'Structured package must increment to version 2');
    assert.strictEqual(structuredRecorded.isReused, false, 'New structured version is not reused');
    assert.strictEqual(structuredRecorded.lifecycleState, 'CURRENT');
    assert.strictEqual(packages[0].lifecycleState, 'ARCHIVED', 'Legacy v1 must be archived');
  });

  // ---------------------------------------------------------------------------
  // L. Tracking service: subsequent identical structured package => version 2, REUSED
  // ---------------------------------------------------------------------------
  it('L. Tracking service recordApplicationPackage: subsequent identical structured package reuses version 2', async () => {
    const { mockDb } = createMockTrackingDatabase();
    const service = new ApplicationTrackingService({ database: mockDb });

    const structuredPkg = {
      ...basePackagePayload,
      generationContractVersion: 'P16-001F',
      structuredResumeSchemaVersion: '2.0.0',
      structuredResume: { schemaVersion: '2.0.0' },
      packageHash: computeApplicationPackageHash({
        ...basePackagePayload,
        generationContractVersion: 'P16-001F',
        structuredResumeSchemaVersion: '2.0.0',
      }),
    };

    // First record: version 1 (or version 2 if preceded by legacy)
    const first = await service.recordApplicationPackage(context, applicationId, structuredPkg);
    assert.strictEqual(first.isReused, false);

    // Second record: identical structured package
    const second = await service.recordApplicationPackage(context, applicationId, structuredPkg);
    assert.strictEqual(second.version, first.version);
    assert.strictEqual(second.isReused, true, 'Identical structured preparation must be idempotent/reused');
  });

  // ---------------------------------------------------------------------------
  // M. Handoff service: legacy handoff kit reused by legacy package
  // ---------------------------------------------------------------------------
  it('M. Handoff service: legacy handoff kit reused only by matching legacy package', async () => {
    const legacyHash = computeApplicationPackageHash({
      ...basePackagePayload,
      generationContractVersion: 'LEGACY',
      structuredResumeSchemaVersion: null,
    });

    const mockLegacyKit = {
      status: 'HANDOFF_READY',
      packageHash: legacyHash,
      generationContractVersion: 'LEGACY',
      structuredResumeSchemaVersion: null,
      applicationId,
      resume: {
        filename: 'tailored-resume.pdf',
        mimeType: 'application/pdf',
        storageKey: 'storage-legacy-key-1',
        contentHash: 'pdfhash1',
        generationContractVersion: 'LEGACY',
        structuredResumeSchemaVersion: null,
      },
      coverLetter: {
        filename: 'tailored-cover-letter.pdf',
        mimeType: 'application/pdf',
        storageKey: 'storage-legacy-cl-1',
        contentHash: 'pdfhashcl1',
        generationContractVersion: 'LEGACY',
        structuredResumeSchemaVersion: null,
      },
    };

    let compileCalled = false;
    const handoffService = new ApplicationHandoffService({
      applicationTrackingService: {
        getApplication: async () => ({
          id: applicationId,
          metadata: { handoffKit: mockLegacyKit, currentPackageHash: legacyHash },
        }),
        getApplicationDetails: async () => ({
          root: { id: applicationId },
          stages: [],
          tailoredDocuments: [],
        }),
        attachTailoredDocument: async () => {},
      },
      candidateProfileService: {
        getProfile: async () => ({ displayName: 'Jordan Miller' }),
      },
      latexCompiler: {
        compileLatexToPdf: async () => {
          compileCalled = true;
          return { pdfBuffer: Buffer.from('%PDF-1.4') };
        },
      },
    });

    const legacyPkg = {
      ...basePackagePayload,
      generationContractVersion: 'LEGACY',
      structuredResumeSchemaVersion: null,
      packageHash: legacyHash,
    };

    const kit = await handoffService.buildApplicationHandoffKit({
      tenantId,
      userId,
      candidateId,
      applicationPackage: legacyPkg,
      applicationId,
    });

    assert.strictEqual(compileCalled, false, 'Latex compilation must NOT be called when legacy kit matches');
    assert.strictEqual(kit.packageHash, legacyHash);
    assert.strictEqual(kit.generationContractVersion, 'LEGACY');
  });

  // ---------------------------------------------------------------------------
  // N. Handoff service: legacy handoff kit rejected by structured package
  // ---------------------------------------------------------------------------
  it('N. Handoff service: legacy handoff kit rejected by structured package and triggers regeneration', async () => {
    const legacyHash = 'legacy-hash-00000000000000000000000000000000000000000000000000000000';
    const structuredHash = computeApplicationPackageHash({
      ...basePackagePayload,
      generationContractVersion: 'P16-001F',
      structuredResumeSchemaVersion: '2.0.0',
    });

    const mockLegacyKit = {
      status: 'HANDOFF_READY',
      packageHash: legacyHash,
      generationContractVersion: 'LEGACY',
      structuredResumeSchemaVersion: null,
      applicationId,
      resume: {
        filename: 'tailored-resume.pdf',
        mimeType: 'application/pdf',
        storageKey: 'storage-legacy-key-1',
        contentHash: 'pdfhash1',
        generationContractVersion: 'LEGACY',
        structuredResumeSchemaVersion: null,
      },
      coverLetter: {
        filename: 'tailored-cover-letter.pdf',
        storageKey: 'storage-legacy-cl-1',
        contentHash: 'clhash1',
        generationContractVersion: 'LEGACY',
        structuredResumeSchemaVersion: null,
      },
    };

    let compileCalled = 0;
    const handoffService = new ApplicationHandoffService({
      applicationTrackingService: {
        getApplication: async () => ({
          id: applicationId,
          metadata: { handoffKit: mockLegacyKit, currentPackageHash: legacyHash },
        }),
        getApplicationDetails: async () => ({
          root: { id: applicationId },
          stages: [],
          tailoredDocuments: [],
        }),
        attachTailoredDocument: async () => {},
        setApplicationHandoffKit: async () => {},
      },
      candidateProfileService: {
        getProfile: async () => ({ displayName: 'Jordan Miller' }),
      },
      latexGenerator: {
        generateTailoredResumeLatex: () => ({ texContent: '\\documentclass{article}\nJordan Miller\n' }),
        generateTailoredCoverLetterLatex: () => ({ texContent: '\\documentclass{article}\nJordan Miller\n' }),
      },
      latexCompiler: {
        compileLatexToPdf: async () => {
          compileCalled++;
          return { pdfBuffer: Buffer.from('%PDF-1.4') };
        },
      },
      qaValidator: {
        validatePdf: async () => ({ passed: true, score: 95, findings: [], breakdown: {}, metrics: {} }),
        validateResumePdf: async () => ({ passed: true, score: 95, findings: [] }),
        validateCoverLetterPdf: async () => ({ passed: true, score: 95, findings: [] }),
      },
      documentStorage: {
        storeEncryptedDocument: async ({ originalFileName }) => ({
          storageKey: `new-storage-key-${originalFileName}`,
          contentHash: 'newpdfhash',
          fileSizeBytes: 1024,
        }),
      },
    });

    const structuredPkg = {
      ...basePackagePayload,
      generationContractVersion: 'P16-001F',
      structuredResumeSchemaVersion: '2.0.0',
      structuredResume: { schemaVersion: '2.0.0' },
      packageHash: structuredHash,
    };

    const kit = await handoffService.buildApplicationHandoffKit({
      tenantId,
      userId,
      candidateId,
      applicationPackage: structuredPkg,
      applicationId,
    });

    assert.ok(compileCalled >= 1, 'Latex compilation must be triggered because legacy kit contract does not match structured contract');
    assert.strictEqual(kit.generationContractVersion, 'P16-001F', 'Generated kit must carry structured contract version');
    assert.strictEqual(kit.structuredResumeSchemaVersion, '2.0.0');
  });

  // ---------------------------------------------------------------------------
  // O. Handoff service: structured handoff kit reused by identical structured package
  // ---------------------------------------------------------------------------
  it('O. Handoff service: structured handoff kit reused by identical structured package', async () => {
    const structuredHash = computeApplicationPackageHash({
      ...basePackagePayload,
      generationContractVersion: 'P16-001F',
      structuredResumeSchemaVersion: '2.0.0',
    });

    const mockStructuredKit = {
      status: 'HANDOFF_READY',
      packageHash: structuredHash,
      generationContractVersion: 'P16-001F',
      structuredResumeSchemaVersion: '2.0.0',
      applicationId,
      resume: {
        filename: 'tailored-resume.pdf',
        mimeType: 'application/pdf',
        storageKey: 'storage-structured-key-1',
        contentHash: 'pdfhash-struct-1',
        generationContractVersion: 'P16-001F',
        structuredResumeSchemaVersion: '2.0.0',
      },
      coverLetter: {
        filename: 'tailored-cover-letter.pdf',
        mimeType: 'application/pdf',
        storageKey: 'storage-structured-cl-1',
        contentHash: 'pdfhash-cl-struct-1',
        generationContractVersion: 'P16-001F',
        structuredResumeSchemaVersion: '2.0.0',
      },
    };

    let compileCalled = false;
    const handoffService = new ApplicationHandoffService({
      applicationTrackingService: {
        getApplication: async () => ({
          id: applicationId,
          metadata: { handoffKit: mockStructuredKit, currentPackageHash: structuredHash },
        }),
        getApplicationDetails: async () => ({
          root: { id: applicationId },
          stages: [],
          tailoredDocuments: [],
        }),
        attachTailoredDocument: async () => {},
      },
      candidateProfileService: {
        getProfile: async () => ({ displayName: 'Jordan Miller' }),
      },
      latexCompiler: {
        compileLatexToPdf: async () => {
          compileCalled = true;
          return { pdfBuffer: Buffer.from('%PDF-1.4') };
        },
      },
    });

    const structuredPkg = {
      ...basePackagePayload,
      generationContractVersion: 'P16-001F',
      structuredResumeSchemaVersion: '2.0.0',
      structuredResume: { schemaVersion: '2.0.0' },
      packageHash: structuredHash,
    };

    const kit = await handoffService.buildApplicationHandoffKit({
      tenantId,
      userId,
      candidateId,
      applicationPackage: structuredPkg,
      applicationId,
    });

    assert.strictEqual(compileCalled, false, 'Structured kit must be reused without compilation for identical package');
    assert.strictEqual(kit.packageHash, structuredHash);
    assert.strictEqual(kit.generationContractVersion, 'P16-001F');
  });

  // ---------------------------------------------------------------------------
  // P. ApplicationPackageSchema validates package containing contract fields
  // ---------------------------------------------------------------------------
  it('P. ApplicationPackageSchema validates package containing generationContractVersion and structuredResumeSchemaVersion', () => {
    const pkg = {
      ...basePackagePayload,
      generationContractVersion: 'P16-001F',
      structuredResumeSchemaVersion: '2.0.0',
      tailoredResume: {
        ...basePackagePayload.tailoredResume,
        generationContractVersion: 'P16-001F',
        structuredResumeSchemaVersion: '2.0.0',
      },
      packageHash: computeApplicationPackageHash({
        ...basePackagePayload,
        generationContractVersion: 'P16-001F',
        structuredResumeSchemaVersion: '2.0.0',
      }),
    };

    const parsed = ApplicationPackageSchema.parse(pkg);
    assert.strictEqual(parsed.generationContractVersion, 'P16-001F');
    assert.strictEqual(parsed.structuredResumeSchemaVersion, '2.0.0');
    assert.strictEqual(parsed.tailoredResume.generationContractVersion, 'P16-001F');
    assert.strictEqual(parsed.tailoredResume.structuredResumeSchemaVersion, '2.0.0');
  });
});
