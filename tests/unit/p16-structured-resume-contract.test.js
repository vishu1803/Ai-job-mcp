/**
 * @file Unit Tests for Structured Resume Contracts and Immutability Boundary (P16-001A).
 *
 * Verifies:
 * 1. Production Zod schemas: ResumeTailoringPlan, StructuredResumeDocument, EvidenceReference, EvidenceValidationReceipt
 * 2. Immutability guarantees: Source candidate records are never mutated during resume construction
 * 3. Zero synthetic defaults: Missing fields remain null/empty; no defaults (2022-01-01, University, etc.) are injected
 * 4. Detection & rejection of forbidden synthetic placeholders
 * 5. Snapshot boundary & deterministic JSON serialization
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  StructuredResumeDocumentSchema,
  ResumeTailoringPlanSchema,
  EvidenceReferenceSchema,
  EvidenceValidationReceiptSchema,
} from '../../src/domain/career/resume.schemas.js';
import {
  buildStructuredResumeDocument,
  validateStructuredResumeIntegrity,
  buildStructuredResumeSnapshot,
  FORBIDDEN_SYNTHETIC_DEFAULTS,
  FORBIDDEN_FABRICATED_DSA_BULLETS,
} from '../../src/services/structured-resume.service.js';

/**
 * Recursively freezes an object to guarantee immutability testing.
 *
 * @param {object} obj
 * @returns {object}
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

describe('P16-001A: Structured Resume Contracts & Immutability Suite', () => {
  // ---------------------------------------------------------------------------
  // 1. Production Schema Validation
  // ---------------------------------------------------------------------------
  describe('1. Zod Schema Conformance', () => {
    it('validates EvidenceReferenceSchema with valid provenance', () => {
      const validRef = {
        sourceType: 'VERIFIED',
        evidenceId: crypto.randomUUID(),
        resourceId: 'res-101',
        resourceName: 'cloud-storage-engine',
        filePath: 'src/storage/engine.go',
        commitSha: 'a1b2c3d4e5f6',
        evidenceType: 'CODE_COMMIT',
        matchedRequirementId: 'req-dist-systems',
        confidenceScore: 0.95,
        provenanceTrustClass: 'HIGH_TRUST',
        notes: 'Verified from primary repository commit',
      };

      const parsed = EvidenceReferenceSchema.parse(validRef);
      assert.equal(parsed.sourceType, 'VERIFIED');
      assert.equal(parsed.confidenceScore, 0.95);
      assert.equal(parsed.commitSha, 'a1b2c3d4e5f6');
    });

    it('validates ResumeTailoringPlanSchema with strict structure', () => {
      const validPlan = {
        planId: crypto.randomUUID(),
        targetJobId: 'job-xyz-456',
        targetRoleTitle: 'Senior Distributed Systems Engineer',
        targetCompany: 'Acme Cloud',
        candidateArchetype: 'EXPERIENCED',
        pageTarget: 'ONE_PAGE_STRICT',
        sectionOrder: ['HEADER', 'SUMMARY', 'EXPERIENCE', 'PROJECTS', 'SKILLS', 'EDUCATION'],
        selectedProjectIds: ['proj-1', 'proj-2'],
        selectedSkillSlugs: ['go', 'distributed-systems', 'grpc', 'postgresql'],
        skillCategoryOrder: ['Languages', 'Distributed Systems', 'Databases'],
        optionalSections: {
          includeDsa: false,
          includeCertifications: true,
          includeCoursework: false,
          includePublications: false,
          includeAchievements: false,
          includeAdditionalSkills: false,
          includeAwards: false,
        },
        summaryDirectives: {
          focusAreas: ['High-throughput consensus protocols', 'Fault-tolerant replication'],
          keyHighlightedProjectIds: ['proj-1'],
          keyMatchedSkillSlugs: ['go', 'grpc'],
        },
      };

      const parsed = ResumeTailoringPlanSchema.parse(validPlan);
      assert.equal(parsed.targetRoleTitle, 'Senior Distributed Systems Engineer');
      assert.equal(parsed.candidateArchetype, 'EXPERIENCED');
      assert.deepEqual(parsed.selectedProjectIds, ['proj-1', 'proj-2']);
    });

    it('rejects ResumeTailoringPlanSchema when required sectionOrder is missing or empty', () => {
      assert.throws(() => {
        ResumeTailoringPlanSchema.parse({
          planId: crypto.randomUUID(),
          targetRoleTitle: 'Staff Engineer',
          sectionOrder: [], // empty array violates .min(1)
        });
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Immutability Boundary Guarantees
  // ---------------------------------------------------------------------------
  describe('2. Authoritative Candidate-Owned Data Immutability Boundary', () => {
    const rawCandidate = {
      id: crypto.randomUUID(),
      displayName: 'Jane Candidate',
      headline: 'Staff Infrastructure Architect',
      canonicalEmail: 'jane.candidate@example.com',
      phone: '+1-555-0199',
      location: 'Seattle, WA',
      summary: 'Experienced infrastructure architect with deep background in high-scale systems.',
      profileMetadata: {
        experience: [
          {
            id: 'exp-1',
            company: 'Pioneer Networks',
            title: 'Lead Systems Architect',
            startDate: '2020-03-01',
            endDate: null,
            isCurrent: true,
            location: 'Seattle, WA',
            bullets: [
              'Architected distributed messaging queue sustaining 2M msgs/sec.',
              'Spearheaded zero-downtime database migration for 50TB data store.',
            ],
          },
          {
            id: 'exp-2',
            company: 'Global Fintech LLC',
            title: 'Senior Software Engineer',
            startDate: '2016-08-01',
            endDate: '2020-02-28',
            isCurrent: false,
            location: 'New York, NY',
            bullets: [
              'Engineered multi-currency ledger engine handling $500M daily turnover.',
            ],
          },
        ],
        education: [
          {
            id: 'edu-1',
            institution: 'University of Washington',
            degree: 'Master of Science in Computer Engineering',
            fieldOfStudy: 'Computer Systems',
            startDate: '2014-09-01',
            endDate: '2016-06-15',
            grade: '3.92 GPA',
            coursework: ['Distributed Systems', 'Advanced Operating Systems'],
          },
        ],
        certifications: [
          {
            id: 'cert-1',
            name: 'AWS Certified Solutions Architect - Professional',
            issuingOrganization: 'Amazon Web Services',
            issueDate: '2022-04-10',
            expirationDate: '2025-04-10',
            credentialId: 'AWS-PSA-99201',
            credentialUrl: 'https://aws.amazon.com/verify?id=AWS-PSA-99201',
          },
        ],
        dsa: {
          hasSection: true,
          profileUrl: 'https://leetcode.com/u/janearchitect',
          bullets: [
            'Solved 750+ algorithmic problems focusing on graphs, DP, and trees.',
          ],
        },
        projects: [
          {
            id: 'proj-raft-engine',
            name: 'raft-consensus-engine',
            displayName: 'Raft Consensus Engine',
            repositoryUrl: 'https://github.com/janearchitect/raft-consensus-engine',
            liveUrl: null,
            technologies: ['Go', 'gRPC', 'Protobuf'],
            bullets: [
              {
                text: 'Implemented Raft consensus algorithm with leader election and log replication.',
                provenanceStatus: 'VERIFIED',
                evidenceRefs: [
                  {
                    sourceType: 'VERIFIED',
                    evidenceId: crypto.randomUUID(),
                    commitSha: 'f3e2d1c0b9a8',
                  },
                ],
              },
            ],
          },
        ],
        skills: [
          {
            name: 'Go',
            slug: 'go',
            verified: true,
            provenanceStatus: 'VERIFIED',
            evidenceId: crypto.randomUUID(),
          },
          {
            name: 'Kubernetes',
            slug: 'kubernetes',
            verified: false,
            provenanceStatus: 'USER_PROVIDED',
          },
        ],
      },
    };

    it('guarantees source candidate records are completely immutable even when frozen', () => {
      // Deep freeze the candidate profile object
      const frozenCandidate = deepFreeze(JSON.parse(JSON.stringify(rawCandidate)));

      const jobPosting = {
        id: 'job-999',
        title: 'Principal Systems Engineer',
        company: 'Cloud Scale Corp',
      };

      // Execution must not throw mutation error against frozen object
      const structuredDoc = buildStructuredResumeDocument({
        candidateProfile: frozenCandidate,
        jobPosting,
      });

      // Assert document conforms to schema
      assert.ok(structuredDoc);
      assert.equal(structuredDoc.targetRole, 'Principal Systems Engineer');

      // Assert exact source facts were preserved without changes
      assert.equal(structuredDoc.experience.length, 2);
      assert.equal(structuredDoc.experience[0].company, 'Pioneer Networks');
      assert.equal(structuredDoc.experience[0].title, 'Lead Systems Architect');
      assert.equal(structuredDoc.experience[0].startDate, '2020-03-01');
      assert.equal(structuredDoc.experience[0].endDate, null);
      assert.equal(structuredDoc.experience[0].isCurrent, true);
      assert.deepEqual(structuredDoc.experience[0].bullets, frozenCandidate.profileMetadata.experience[0].bullets);

      assert.equal(structuredDoc.education.length, 1);
      assert.equal(structuredDoc.education[0].institution, 'University of Washington');
      assert.equal(structuredDoc.education[0].degree, 'Master of Science in Computer Engineering');

      assert.equal(structuredDoc.certifications.length, 1);
      assert.equal(structuredDoc.certifications[0].name, 'AWS Certified Solutions Architect - Professional');
      assert.equal(structuredDoc.certifications[0].issuingOrganization, 'Amazon Web Services');

      assert.equal(structuredDoc.dsa.hasSection, true);
      assert.equal(structuredDoc.dsa.profileUrl, 'https://leetcode.com/u/janearchitect');
      assert.deepEqual(structuredDoc.dsa.bullets, frozenCandidate.profileMetadata.dsa.bullets);

      assert.equal(structuredDoc.projects.length, 1);
      assert.equal(structuredDoc.projects[0].displayName, 'Raft Consensus Engine');
      assert.equal(structuredDoc.projects[0].bullets[0].evidenceRefs.length, 1);
    });

    it('verifies baseline candidate object is deep-strictly identical before and after document construction', () => {
      const candidateCopy = JSON.parse(JSON.stringify(rawCandidate));
      const snapshotBefore = JSON.stringify(candidateCopy);

      buildStructuredResumeDocument({
        candidateProfile: candidateCopy,
        jobPosting: { title: 'Architect' },
      });

      const snapshotAfter = JSON.stringify(candidateCopy);
      assert.equal(snapshotBefore, snapshotAfter, 'Candidate object was mutated during buildStructuredResumeDocument');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Zero Synthetic Default Injection & Missing Fields Preservation
  // ---------------------------------------------------------------------------
  describe('3. Missing Fields Preservation & Zero Synthetic Default Injection', () => {
    const candidateWithMissingFields = {
      id: crypto.randomUUID(),
      displayName: 'Sparse Candidate',
      headline: 'Software Engineer',
      canonicalEmail: 'sparse@example.com',
      profileMetadata: {
        experience: [
          {
            // Missing company, title, dates
            id: 'exp-sparse-1',
            bullets: ['Contributed to backend services.'],
          },
        ],
        education: [
          {
            // Missing institution, degree, dates
            id: 'edu-sparse-1',
            fieldOfStudy: 'Computer Science',
          },
        ],
        certifications: [
          {
            // Missing name, issuer
            id: 'cert-sparse-1',
            issueDate: '2023-01-01',
          },
        ],
        // Missing DSA entirely
      },
    };

    it('preserves null/empty states for missing fields and does NOT insert synthetic placeholders', () => {
      const doc = buildStructuredResumeDocument({
        candidateProfile: candidateWithMissingFields,
      });

      // Experience: dates, company, title must be null/empty, NOT defaults
      assert.equal(doc.experience[0].company, null);
      assert.equal(doc.experience[0].title, null);
      assert.equal(doc.experience[0].startDate, null);
      assert.equal(doc.experience[0].endDate, null);

      // Education: institution and degree must be null, NOT defaults
      assert.equal(doc.education[0].institution, null);
      assert.equal(doc.education[0].degree, null);
      assert.equal(doc.education[0].startDate, null);

      // Certifications: name and issuer must be null, NOT defaults
      assert.equal(doc.certifications[0].name, null);
      assert.equal(doc.certifications[0].issuingOrganization, null);

      // DSA: null or empty bullets, NEVER synthetic LeetCode text
      assert.equal(doc.dsa, null);

      // Verify forbidden synthetic strings are nowhere in the output document
      const serialized = JSON.stringify(doc);
      for (const forbidden of FORBIDDEN_SYNTHETIC_DEFAULTS) {
        assert.ok(
          !serialized.includes(`"${forbidden}"`),
          `Forbidden synthetic default '${forbidden}' was unexpectedly injected into the document`
        );
      }
      for (const forbiddenDsa of FORBIDDEN_FABRICATED_DSA_BULLETS) {
        assert.ok(
          !serialized.includes(forbiddenDsa),
          `Forbidden fabricated DSA bullet was unexpectedly injected: ${forbiddenDsa}`
        );
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Synthetic Placeholder Detection & Evidence Validation Receipt
  // ---------------------------------------------------------------------------
  describe('4. Synthetic Placeholder Detection & Evidence Validation Receipt', () => {
    it('produces PASS status with 0 violations for clean structured document', () => {
      const cleanCandidate = {
        displayName: 'Real Candidate',
        headline: 'Senior Backend Engineer',
        canonicalEmail: 'real@example.com',
        profileMetadata: {
          experience: [
            {
              company: 'Real Tech Corp',
              title: 'Senior Engineer',
              startDate: '2019-01-01',
              bullets: ['Developed services in Go and PostgreSQL.'],
            },
          ],
        },
      };

      const doc = buildStructuredResumeDocument({ candidateProfile: cleanCandidate });
      const receipt = validateStructuredResumeIntegrity(doc);

      assert.equal(receipt.overallStatus, 'PASS');
      assert.equal(receipt.violations.length, 0);
      assert.ok(receipt.summary.totalClaimsAudited >= 1);
      assert.ok(receipt.receiptId);
      assert.equal(receipt.documentId, doc.documentId);
    });

    it('detects and rejects forbidden synthetic placeholder values', () => {
      // Artificially contaminated document
      const contaminatedCandidate = {
        displayName: 'Contaminated Candidate',
        headline: 'Engineer',
        canonicalEmail: 'contaminated@example.com',
        profileMetadata: {
          experience: [
            {
              company: 'Acme Corp',
              title: 'Engineer',
              startDate: '2022-01-01', // Forbidden synthetic default
              endDate: '2024-01-01',   // Forbidden synthetic default
              bullets: ['Built APIs.'],
            },
          ],
          education: [
            {
              institution: 'University',            // Forbidden synthetic default
              degree: 'Bachelor of Science',        // Forbidden synthetic default
            },
          ],
          certifications: [
            {
              name: 'Professional Certification',   // Forbidden synthetic default
              issuingOrganization: 'Issuing Authority', // Forbidden synthetic default
            },
          ],
          dsa: {
            hasSection: true,
            bullets: [
              'Solved 500+ problems across LeetCode, Codeforces, and HackerRank.', // Forbidden fabricated DSA bullet
            ],
          },
        },
      };

      const doc = buildStructuredResumeDocument({ candidateProfile: contaminatedCandidate });
      const receipt = validateStructuredResumeIntegrity(doc);

      assert.equal(receipt.overallStatus, 'FAIL');
      assert.ok(receipt.violations.length >= 6);

      const violationTypes = receipt.violations.map((v) => v.violationType);
      assert.ok(violationTypes.every((t) => t === 'SYNTHETIC_PLACEHOLDER_DETECTED'));

      const contaminatedFields = receipt.violations.map((v) => `${v.section}.${v.field}`);
      assert.ok(contaminatedFields.includes('EXPERIENCE.startDate'));
      assert.ok(contaminatedFields.includes('EXPERIENCE.endDate'));
      assert.ok(contaminatedFields.includes('EDUCATION.institution'));
      assert.ok(contaminatedFields.includes('EDUCATION.degree'));
      assert.ok(contaminatedFields.includes('CERTIFICATIONS.name'));
      assert.ok(contaminatedFields.includes('CERTIFICATIONS.issuingOrganization'));
      assert.ok(contaminatedFields.includes('DSA.bullets'));
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Snapshot Boundary & Deterministic JSON Serialization
  // ---------------------------------------------------------------------------
  describe('5. Snapshot Boundary & Determinism', () => {
    it('produces a snapshot bundle that is 100% JSON-serializable and self-contained', () => {
      const candidate = {
        displayName: 'Snapshot Candidate',
        headline: 'Systems Architect',
        canonicalEmail: 'snapshot@example.com',
        profileMetadata: {
          experience: [
            { company: 'Cloud Storage Co', title: 'Architect', bullets: ['Engineered storage tier.'] },
          ],
        },
      };

      const bundle = buildStructuredResumeSnapshot({
        candidateProfile: candidate,
        jobPosting: { title: 'Senior Cloud Architect', company: 'HyperScale' },
      });

      assert.ok(bundle.structuredResume);
      assert.ok(bundle.tailoringPlan);
      assert.ok(bundle.evidenceValidationReceipt);

      // JSON roundtrip test: No circular references, no missing required fields
      const jsonString = JSON.stringify(bundle);
      const deserialized = JSON.parse(jsonString);

      // Schema verification of deserialized snapshot
      const reParsedDoc = StructuredResumeDocumentSchema.parse(deserialized.structuredResume);
      assert.equal(reParsedDoc.targetRole, 'Senior Cloud Architect');
      assert.equal(reParsedDoc.candidateIdentity.displayName, 'Snapshot Candidate');

      const reParsedReceipt = EvidenceValidationReceiptSchema.parse(deserialized.evidenceValidationReceipt);
      assert.equal(reParsedReceipt.overallStatus, 'PASS');
    });

    it('guarantees deterministic output across multiple invocations with same inputs', () => {
      const candidate = {
        displayName: 'Deterministic Candidate',
        headline: 'Backend Lead',
        canonicalEmail: 'det@example.com',
        profileMetadata: {
          experience: [
            { id: 'exp-1', company: 'Fast Corp', title: 'Lead', bullets: ['High velocity backend.'] },
          ],
        },
      };

      const plan = {
        planId: 'b943265b-014c-4e89-897e-128a1c97a871',
        targetRoleTitle: 'Backend Lead',
        sectionOrder: ['HEADER', 'SUMMARY', 'EXPERIENCE'],
        selectedProjectIds: [],
        selectedSkillSlugs: [],
        skillCategoryOrder: [],
      };

      const doc1 = buildStructuredResumeDocument({ candidateProfile: candidate, tailoringPlan: plan });
      const doc2 = buildStructuredResumeDocument({ candidateProfile: candidate, tailoringPlan: plan });

      // Core content must be identical
      assert.deepEqual(doc1.experience, doc2.experience);
      assert.deepEqual(doc1.candidateIdentity, doc2.candidateIdentity);
      assert.equal(doc1.targetRole, doc2.targetRole);
      assert.deepEqual(doc1.sectionOrder, doc2.sectionOrder);
    });
  });
});
