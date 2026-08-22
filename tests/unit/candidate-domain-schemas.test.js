/**
 * @file Unit Tests for Domain Zod Schemas (Task P4-001)
 *
 * Tests:
 * 1. CandidateProfileSchema validation, status enums, UUID integrity, and secret rejection
 * 2. CandidateIdentitySchema validation, providers, and verification timestamp handling
 * 3. SkillSchema & SkillWithEvidenceSchema confidence ranges [0.0, 1.0], categories, and evidence references
 * 4. ProjectSchema & ProjectEvidenceSchema slug safety, resource linking, and confidence bounds
 * 5. EvidenceNodeSchema, EvidenceSourceLocationSchema (path traversal, Git SHA, line ranges), and excerpt security
 * 6. ResourceSummarySchema provider-neutral modeling and credential stripping
 * 7. Security injection tests (rejects encryptedCredentials, accessToken, privateKey, tokens, passwords)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CandidateProfileSchema,
  CandidateIdentitySchema,
  SkillSchema,
  SkillWithEvidenceSchema,
  ProjectSchema,
  ProjectEvidenceSchema,
  ResourceSummarySchema,
  EvidenceSourceLocationSchema,
  EvidenceNodeSchema,
  CandidateStatusEnum,
  ResourceProviderEnum,
  ResourceTypeEnum,
  ResourceStatusEnum,
  SkillCategoryEnum,
  ProvenanceStatusEnum,
  EvidenceTypeEnum,
} from '../../src/domain/candidate/candidate.schemas.js';

describe('Domain Zod Schemas Unit Tests (P4-001)', () => {
  const validUUID1 = 'a1b2c3d4-e5f6-4a1b-9c8d-1e2f3a4b5c6d';
  const validUUID2 = 'b2c3d4e5-f6a1-4b2c-8d1e-2f3a4b5c6d7e';
  const validUUID3 = 'c3d4e5f6-a1b2-4c3d-9e1f-3a4b5c6d7e8f';
  const validGitSha = '5017539ddb5d8d616b5fbfa2682dba7d4910b039';

  // -------------------------------------------------------------------------
  // 1. CandidateProfileSchema
  // -------------------------------------------------------------------------
  describe('1. CandidateProfileSchema', () => {
    it('validates a complete, valid candidate profile successfully', () => {
      const payload = {
        id: validUUID1,
        tenantId: validUUID2,
        userId: validUUID3,
        displayName: 'Vishw Sharma',
        headline: 'Lead Distributed Systems Architect',
        summary: 'Experienced engineer with expertise in Node.js, Fastify, and PostgreSQL.',
        canonicalEmail: 'vishw@example.com',
        status: 'ACTIVE',
        profileMetadata: {
          preferredRole: 'Staff Software Engineer',
          yearsOfExperience: 8,
        },
        identities: [
          {
            provider: 'GITHUB_APP',
            externalAccountId: '97516061',
            externalUsername: 'vishu1803',
            verified: true,
          },
        ],
        skills: [],
        projects: [],
      };

      const parsed = CandidateProfileSchema.parse(payload);
      assert.strictEqual(parsed.displayName, 'Vishw Sharma');
      assert.strictEqual(parsed.status, 'ACTIVE');
      assert.strictEqual(parsed.canonicalEmail, 'vishw@example.com');
      assert.strictEqual(parsed.identities.length, 1);
    });

    it('rejects invalid candidate status', () => {
      const payload = {
        id: validUUID1,
        displayName: 'Test Candidate',
        status: 'NON_EXISTENT_STATUS',
      };

      assert.throws(
        () => CandidateProfileSchema.parse(payload),
        (err) => {
          assert.ok(err.issues.some((i) => i.path.includes('status')));
          return true;
        }
      );
    });

    it('rejects malformed UUID for candidate ID', () => {
      const payload = {
        id: 'not-a-valid-uuid',
        displayName: 'Test Candidate',
      };

      assert.throws(
        () => CandidateProfileSchema.parse(payload),
        (err) => {
          assert.ok(err.issues.some((i) => i.path.includes('id')));
          return true;
        }
      );
    });

    it('rejects malformed canonical email address', () => {
      const payload = {
        id: validUUID1,
        displayName: 'Test Candidate',
        canonicalEmail: 'invalid-email-string',
      };

      assert.throws(
        () => CandidateProfileSchema.parse(payload),
        (err) => {
          assert.ok(err.issues.some((i) => i.path.includes('canonicalEmail')));
          return true;
        }
      );
    });

    it('rejects injection of unexpected top-level secret fields (strictObject)', () => {
      const payload = {
        id: validUUID1,
        displayName: 'Test Candidate',
        password: 'SuperSecretPassword123!',
        encryptedCredentials: 'evil_payload_here',
      };

      assert.throws(
        () => CandidateProfileSchema.parse(payload),
        (err) => {
          assert.ok(err.issues.some((i) => i.code === 'unrecognized_keys'));
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. CandidateIdentitySchema
  // -------------------------------------------------------------------------
  describe('2. CandidateIdentitySchema', () => {
    it('accepts valid supported providers (GITHUB_APP, GITLAB, LINKEDIN, GOOGLE, MANUAL)', () => {
      for (const provider of ['GITHUB_APP', 'GITLAB', 'LINKEDIN', 'GOOGLE', 'MANUAL']) {
        const parsed = CandidateIdentitySchema.parse({
          provider,
          externalAccountId: 'ext-12345',
          externalUsername: 'extuser',
          profileUrl: 'https://example.com/profile',
          verified: true,
          verifiedAt: new Date(),
        });
        assert.strictEqual(parsed.provider, provider);
        assert.strictEqual(parsed.verified, true);
      }
    });

    it('rejects unsupported provider strings', () => {
      assert.throws(() => {
        CandidateIdentitySchema.parse({
          provider: 'FACEBOOK_UNKNOWN',
          externalAccountId: '12345',
          externalUsername: 'user',
        });
      });
    });

    it('rejects secret injection in identity metadata', () => {
      const payload = {
        provider: 'GITHUB_APP',
        externalAccountId: '12345',
        externalUsername: 'testuser',
        metadata: {
          publicRepos: 10,
          accessToken: 'gho_secret_token_leaked',
        },
      };

      assert.throws(
        () => CandidateIdentitySchema.parse(payload),
        (err) => {
          assert.ok(err.issues.some((i) => i.message.includes('accessToken')));
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. SkillSchema & SkillWithEvidenceSchema
  // -------------------------------------------------------------------------
  describe('3. SkillSchema & SkillWithEvidenceSchema', () => {
    it('validates canonical skill taxonomy definition with slug and aliases', () => {
      const skill = SkillSchema.parse({
        slug: 'postgresql',
        name: 'PostgreSQL',
        category: 'DATABASE',
        aliases: ['postgres', 'pgsql', 'postgresql-db'],
        description: 'Open-source object-relational database system',
      });

      assert.strictEqual(skill.slug, 'postgresql');
      assert.strictEqual(skill.category, 'DATABASE');
      assert.strictEqual(skill.aliases.length, 3);
    });

    it('accepts confidence scores at boundaries 0.00 and 1.00', () => {
      const skillZero = SkillWithEvidenceSchema.parse({
        name: 'Rust',
        category: 'LANGUAGE',
        confidenceScore: 0.0,
      });
      assert.strictEqual(skillZero.confidenceScore, 0.0);

      const skillOne = SkillWithEvidenceSchema.parse({
        name: 'JavaScript',
        category: 'LANGUAGE',
        confidenceScore: 1.0,
      });
      assert.strictEqual(skillOne.confidenceScore, 1.0);
    });

    it('rejects confidence score > 1.00 or < 0.00', () => {
      assert.throws(() => {
        SkillWithEvidenceSchema.parse({
          name: 'JavaScript',
          category: 'LANGUAGE',
          confidenceScore: 1.05,
        });
      });

      assert.throws(() => {
        SkillWithEvidenceSchema.parse({
          name: 'JavaScript',
          category: 'LANGUAGE',
          confidenceScore: -0.1,
        });
      });
    });

    it('rejects arbitrary skill categories not defined in taxonomy', () => {
      assert.throws(() => {
        SkillWithEvidenceSchema.parse({
          name: 'Agile',
          category: 'ARBITRARY_NON_EXISTENT_CATEGORY',
        });
      });
    });

    it('defaults provenanceStatus to CLAIMED and confidenceScore to 0.0', () => {
      const parsed = SkillWithEvidenceSchema.parse({
        name: 'Docker',
        category: 'CLOUD_DEVOPS',
      });

      assert.strictEqual(parsed.provenanceStatus, 'CLAIMED');
      assert.strictEqual(parsed.confidenceScore, 0.0);
      assert.strictEqual(parsed.evidenceCount, 0);
      assert.deepStrictEqual(parsed.evidence, []);
    });
  });

  // -------------------------------------------------------------------------
  // 4. ProjectSchema & ProjectEvidenceSchema
  // -------------------------------------------------------------------------
  describe('4. ProjectSchema & ProjectEvidenceSchema', () => {
    it('validates a complete project with linked resources and safe slug', () => {
      const project = ProjectSchema.parse({
        id: validUUID1,
        candidateId: validUUID2,
        name: 'Antigravity Career Hub',
        slug: 'antigravity-career-hub',
        headline: 'Universal AI Career MCP Platform',
        summary: 'Decentralized MCP platform for evidence-backed career progression.',
        role: 'Architect & Lead Developer',
        isHighlighted: true,
        resources: [
          {
            id: validUUID3,
            provider: 'GITHUB_APP',
            resourceType: 'REPOSITORY',
            externalResourceId: '1338724502',
            name: 'Ai-job-mcp',
            displayName: 'vishu1803/Ai-job-mcp',
          },
        ],
      });

      assert.strictEqual(project.slug, 'antigravity-career-hub');
      assert.strictEqual(project.resources.length, 1);
      assert.strictEqual(project.isHighlighted, true);
    });

    it('validates a ProjectEvidenceSchema structure containing linked evidence nodes', () => {
      const projectEvidence = ProjectEvidenceSchema.parse({
        id: validUUID1,
        candidateId: validUUID2,
        name: 'Antigravity Hub',
        slug: 'antigravity-hub',
        headline: 'AI Career Agent',
        isHighlighted: true,
        resources: [
          {
            id: validUUID3,
            provider: 'GITHUB_APP',
            resourceType: 'REPOSITORY',
            externalResourceId: '1338724502',
            name: 'Ai-job-mcp',
            displayName: 'vishu1803/Ai-job-mcp',
          },
        ],
        evidence: [
          {
            id: validUUID1,
            candidateId: validUUID2,
            resourceId: validUUID3,
            evidenceType: 'README_SPECIFICATION',
            sourceProvider: 'GITHUB_APP',
            sourceLocation: { filePath: 'README.md' },
            confidenceScore: 0.95,
          },
        ],
        confidenceScore: 0.95,
        provenanceStatus: 'VERIFIED',
      });

      assert.strictEqual(projectEvidence.confidenceScore, 0.95);
      assert.strictEqual(projectEvidence.provenanceStatus, 'VERIFIED');
      assert.strictEqual(projectEvidence.evidence.length, 1);
    });

    it('rejects unsafe slugs with uppercase, spaces, or special characters', () => {
      const invalidSlugs = [
        'Invalid Slug',
        'slug_with_underscore',
        'slug!',
        'slug--double',
        '-leadingslug',
        'trailingslug-',
      ];

      for (const slug of invalidSlugs) {
        assert.throws(() => {
          ProjectSchema.parse({
            id: validUUID1,
            candidateId: validUUID2,
            name: 'Project',
            slug,
          });
        }, `Slug '${slug}' should have been rejected`);
      }
    });

    it('validates all domain enumeration options', () => {
      assert.deepStrictEqual(CandidateStatusEnum.options, ['ACTIVE', 'ARCHIVED', 'SUSPENDED']);
      assert.ok(ResourceProviderEnum.options.includes('GITHUB_APP'));
      assert.ok(ResourceProviderEnum.options.includes('GITLAB'));
      assert.ok(ResourceProviderEnum.options.includes('LINKEDIN'));
      assert.deepStrictEqual(ResourceTypeEnum.options, [
        'REPOSITORY',
        'DOCUMENT',
        'PROFILE',
        'PORTFOLIO_SITE',
      ]);
      assert.deepStrictEqual(ResourceStatusEnum.options, [
        'ACTIVE',
        'DISCONNECTED',
        'DELETED',
        'ERROR',
      ]);
      assert.ok(SkillCategoryEnum.options.includes('LANGUAGE'));
      assert.ok(SkillCategoryEnum.options.includes('FRAMEWORK'));
      assert.deepStrictEqual(ProvenanceStatusEnum.options, [
        'VERIFIED',
        'INFERRED',
        'CLAIMED',
        'MISSING',
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // 5. EvidenceSourceLocationSchema
  // -------------------------------------------------------------------------
  describe('5. EvidenceSourceLocationSchema (Path Traversal, SHA, Line Range)', () => {
    it('validates clean relative POSIX paths with commit SHA and line range', () => {
      const loc = EvidenceSourceLocationSchema.parse({
        filePath: 'src/connectors/github/auth.js',
        commitSha: validGitSha,
        lineRange: { start: 10, end: 35 },
        astContext: { symbol: 'generateAppJwt', type: 'FunctionDeclaration' },
      });

      assert.strictEqual(loc.filePath, 'src/connectors/github/auth.js');
      assert.strictEqual(loc.commitSha, validGitSha);
      assert.strictEqual(loc.lineRange.start, 10);
      assert.strictEqual(loc.lineRange.end, 35);
    });

    it('rejects path traversal attempts (..) in file paths', () => {
      const traversalPaths = ['../etc/passwd', 'src/../../secret.env', 'sub/dir/../..'];

      for (const path of traversalPaths) {
        assert.throws(() => {
          EvidenceSourceLocationSchema.parse({ filePath: path });
        }, `Path '${path}' should be rejected for path traversal`);
      }
    });

    it('rejects leading slashes, Windows backslashes, and null bytes in file paths', () => {
      assert.throws(() => EvidenceSourceLocationSchema.parse({ filePath: '/etc/shadow' }));
      assert.throws(() =>
        EvidenceSourceLocationSchema.parse({ filePath: 'src\\connectors\\auth.js' })
      );
      assert.throws(() => EvidenceSourceLocationSchema.parse({ filePath: 'src/auth.js\0.txt' }));
      assert.throws(() => EvidenceSourceLocationSchema.parse({ filePath: 'src/auth.js%00.txt' }));
    });

    it('rejects malformed Git commit SHAs (non-hex or length != 40)', () => {
      assert.throws(() =>
        EvidenceSourceLocationSchema.parse({ filePath: 'file.js', commitSha: 'not-a-sha' })
      );
      assert.throws(() =>
        EvidenceSourceLocationSchema.parse({ filePath: 'file.js', commitSha: '5017539' })
      ); // short sha
      assert.throws(() =>
        EvidenceSourceLocationSchema.parse({ filePath: 'file.js', commitSha: 'g'.repeat(40) })
      ); // non-hex
    });

    it('rejects line range where end < start or non-positive integers', () => {
      assert.throws(() =>
        EvidenceSourceLocationSchema.parse({
          filePath: 'file.js',
          lineRange: { start: 50, end: 10 },
        })
      );
      assert.throws(() =>
        EvidenceSourceLocationSchema.parse({
          filePath: 'file.js',
          lineRange: { start: -5, end: 10 },
        })
      );
      assert.throws(() =>
        EvidenceSourceLocationSchema.parse({
          filePath: 'file.js',
          lineRange: { start: 0, end: 10 },
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // 6. EvidenceNodeSchema & Excerpt Safety
  // -------------------------------------------------------------------------
  describe('6. EvidenceNodeSchema & Excerpt Bounds', () => {
    it('validates every approved evidence type', () => {
      for (const evidenceType of EvidenceTypeEnum.options) {
        const node = EvidenceNodeSchema.parse({
          id: validUUID1,
          candidateId: validUUID2,
          resourceId: validUUID3,
          evidenceType,
          sourceProvider: 'GITHUB_APP',
          sourceLocation: {
            filePath: 'package.json',
            commitSha: validGitSha,
          },
          excerpt: '"fastify": "^5.0.0"',
          confidenceScore: 1.0,
        });

        assert.strictEqual(node.evidenceType, evidenceType);
        assert.strictEqual(node.confidenceScore, 1.0);
      }
    });

    it('rejects evidence excerpts exceeding 1024 characters', () => {
      const oversizedExcerpt = 'a'.repeat(1025);

      assert.throws(() => {
        EvidenceNodeSchema.parse({
          id: validUUID1,
          candidateId: validUUID2,
          resourceId: validUUID3,
          evidenceType: 'CODE_IMPORT_USAGE',
          sourceProvider: 'GITHUB_APP',
          sourceLocation: { filePath: 'test.js' },
          excerpt: oversizedExcerpt,
        });
      });
    });

    it('rejects evidence excerpts containing private key material', () => {
      const secretExcerpt =
        '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----';

      assert.throws(
        () => {
          EvidenceNodeSchema.parse({
            id: validUUID1,
            candidateId: validUUID2,
            resourceId: validUUID3,
            evidenceType: 'CODE_IMPORT_USAGE',
            sourceProvider: 'GITHUB_APP',
            sourceLocation: { filePath: 'test.js' },
            excerpt: secretExcerpt,
          });
        },
        (err) => {
          assert.ok(err.issues.some((i) => i.message.includes('private key')));
          return true;
        }
      );
    });

    it('rejects evidence excerpts containing GitHub access tokens or Bearer tokens', () => {
      const tokenExcerpt = 'const token = "ghs_1234567890abcdefghijklmnopqrstuvwxyz";';

      assert.throws(
        () => {
          EvidenceNodeSchema.parse({
            id: validUUID1,
            candidateId: validUUID2,
            resourceId: validUUID3,
            evidenceType: 'CODE_IMPORT_USAGE',
            sourceProvider: 'GITHUB_APP',
            sourceLocation: { filePath: 'test.js' },
            excerpt: tokenExcerpt,
          });
        },
        (err) => {
          assert.ok(err.issues.some((i) => i.message.includes('GitHub token')));
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 7. ResourceSummarySchema
  // -------------------------------------------------------------------------
  describe('7. ResourceSummarySchema', () => {
    it('validates a clean resource summary with metadata', () => {
      const res = ResourceSummarySchema.parse({
        id: validUUID1,
        provider: 'GITHUB_APP',
        resourceType: 'REPOSITORY',
        externalResourceId: '1338724502',
        name: 'Ai-job-mcp',
        displayName: 'vishu1803/Ai-job-mcp',
        url: 'https://github.com/vishu1803/Ai-job-mcp',
        isPrivate: false,
        status: 'ACTIVE',
        metadata: {
          defaultBranch: 'main',
          stargazersCount: 5,
        },
      });

      assert.strictEqual(res.name, 'Ai-job-mcp');
      assert.strictEqual(res.provider, 'GITHUB_APP');
      assert.strictEqual(res.status, 'ACTIVE');
    });

    it('rejects credential and secret properties on resource summary (strictObject)', () => {
      const payload = {
        id: validUUID1,
        provider: 'GITHUB_APP',
        externalResourceId: '1338724502',
        name: 'Ai-job-mcp',
        displayName: 'vishu1803/Ai-job-mcp',
        encryptedCredentials: 'secret_bytes',
        installationToken: 'ghs_token_here',
      };

      assert.throws(
        () => ResourceSummarySchema.parse(payload),
        (err) => {
          assert.ok(err.issues.some((i) => i.code === 'unrecognized_keys'));
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 8. Global Security Injection Tests
  // -------------------------------------------------------------------------
  describe('8. Security Injection Defensive Tests', () => {
    it('rejects attempts to inject secret fields into SafeMetadataSchema across all domain models', () => {
      const secretKeys = [
        'encryptedCredentials',
        'accessToken',
        'refreshToken',
        'privateKey',
        'appJwt',
        'installationToken',
        'webhookSecret',
        'authorizationHeader',
        'password',
        'clientSecret',
      ];

      for (const secretKey of secretKeys) {
        assert.throws(() => {
          SkillWithEvidenceSchema.parse({
            name: 'Node.js',
            category: 'LANGUAGE',
            metadata: {
              [secretKey]: 'leaked_secret_val',
            },
          });
        }, `Model should have rejected secret key '${secretKey}' in metadata`);
      }
    });
  });
});
