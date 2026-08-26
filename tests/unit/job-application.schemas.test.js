/**
 * @file Unit Tests: Job Application Domain Schemas (Phase 12 / P12-001)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  ApplicationStatusEnum,
  StageTypeEnum,
  StageOutcomeEnum,
  TailoredDocumentTypeEnum,
  WorkplaceTypeEnum,
  EmploymentTypeEnum,
  CompensationSchema,
  DocumentCitationRefSchema,
  CreateJobApplicationInputSchema,
  UpdateJobApplicationInputSchema,
  CreateApplicationStageInputSchema,
  UpdateApplicationStageInputSchema,
  CreateTailoredDocumentInputSchema,
} from '../../src/domain/career/job-application.schemas.js';

describe('Job Application Domain Schemas Unit Tests (P12-001)', () => {
  describe('1. Enums Validation', () => {
    it('validates all 9 canonical ApplicationStatus values', () => {
      const validStatuses = [
        'SAVED',
        'APPLIED',
        'SCREENING',
        'INTERVIEWING',
        'OFFER_RECEIVED',
        'OFFER_ACCEPTED',
        'REJECTED',
        'WITHDRAWN',
        'ARCHIVED',
      ];
      for (const status of validStatuses) {
        assert.strictEqual(ApplicationStatusEnum.parse(status), status);
      }
      assert.throws(() => ApplicationStatusEnum.parse('PENDING'));
      assert.throws(() => ApplicationStatusEnum.parse('HIRED'));
    });

    it('validates all 10 canonical StageType values', () => {
      const validTypes = [
        'DISCOVERY',
        'RESUME_SUBMITTED',
        'RECRUITER_SCREEN',
        'TECHNICAL_ASSESSMENT',
        'SYSTEM_DESIGN',
        'BEHAVIORAL',
        'ONSITE_LOOP',
        'OFFER_NEGOTIATION',
        'POST_OFFER',
        'OTHER',
      ];
      for (const type of validTypes) {
        assert.strictEqual(StageTypeEnum.parse(type), type);
      }
      assert.throws(() => StageTypeEnum.parse('PHONE_CALL'));
    });

    it('validates all 5 StageOutcome values', () => {
      const validOutcomes = ['PENDING', 'PASSED', 'FAILED', 'SKIPPED', 'RESCHEDULED'];
      for (const outcome of validOutcomes) {
        assert.strictEqual(StageOutcomeEnum.parse(outcome), outcome);
      }
      assert.throws(() => StageOutcomeEnum.parse('SUCCESS'));
    });

    it('validates all 4 TailoredDocumentType values', () => {
      const validDocs = [
        'TAILORED_RESUME',
        'TAILORED_COVER_LETTER',
        'PORTFOLIO_RECOMMENDATION',
        'CUSTOM_NOTE',
      ];
      for (const doc of validDocs) {
        assert.strictEqual(TailoredDocumentTypeEnum.parse(doc), doc);
      }
      assert.throws(() => TailoredDocumentTypeEnum.parse('GENERIC_RESUME'));
    });

    it('validates WorkplaceType and EmploymentType enums', () => {
      assert.strictEqual(WorkplaceTypeEnum.parse('REMOTE'), 'REMOTE');
      assert.strictEqual(WorkplaceTypeEnum.parse('HYBRID'), 'HYBRID');
      assert.strictEqual(WorkplaceTypeEnum.parse('ONSITE'), 'ONSITE');
      assert.throws(() => WorkplaceTypeEnum.parse('FLEXIBLE'));

      assert.strictEqual(EmploymentTypeEnum.parse('FULL_TIME'), 'FULL_TIME');
      assert.strictEqual(EmploymentTypeEnum.parse('PART_TIME'), 'PART_TIME');
      assert.strictEqual(EmploymentTypeEnum.parse('CONTRACT'), 'CONTRACT');
      assert.strictEqual(EmploymentTypeEnum.parse('INTERNSHIP'), 'INTERNSHIP');
      assert.throws(() => EmploymentTypeEnum.parse('TEMPORARY'));
    });
  });

  describe('2. Compensation Schema Validation', () => {
    it('accepts valid compensation object', () => {
      const parsed = CompensationSchema.parse({
        currency: 'USD',
        minSalary: 150000,
        maxSalary: 180000,
        targetSalary: 170000,
        equity: '0.1% RSUs',
        notes: 'Annual performance bonus 15%',
      });
      assert.strictEqual(parsed.currency, 'USD');
      assert.strictEqual(parsed.minSalary, 150000);
      assert.strictEqual(parsed.maxSalary, 180000);
    });

    it('defaults currency to USD when omitted', () => {
      const parsed = CompensationSchema.parse({
        minSalary: 120000,
      });
      assert.strictEqual(parsed.currency, 'USD');
    });

    it('rejects negative salary values', () => {
      assert.throws(() =>
        CompensationSchema.parse({
          minSalary: -5000,
        })
      );
    });

    it('rejects invalid currency code length', () => {
      assert.throws(() =>
        CompensationSchema.parse({
          currency: 'US_DOLLARS',
        })
      );
    });
  });

  describe('3. Document Citation Reference Schema Validation', () => {
    it('accepts valid citation reference with commit SHA and line range', () => {
      const parsed = DocumentCitationRefSchema.parse({
        evidenceId: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
        commitSha: '5fe4bec9cc62f6445fd7f7b433f811f631e4b6d3',
        filePath: 'src/services/auth.service.js',
        lineRange: {
          start: 10,
          end: 25,
        },
      });
      assert.strictEqual(parsed.evidenceId, 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d');
      assert.strictEqual(parsed.filePath, 'src/services/auth.service.js');
    });

    it('rejects invalid commitSha format (non-40-hex)', () => {
      assert.throws(() =>
        DocumentCitationRefSchema.parse({
          evidenceId: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
          commitSha: 'invalid-sha-123',
          filePath: 'src/index.js',
        })
      );
    });

    it('rejects missing or empty filePath', () => {
      assert.throws(() =>
        DocumentCitationRefSchema.parse({
          evidenceId: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
          filePath: '',
        })
      );
    });
  });

  describe('4. CreateJobApplicationInputSchema Validation', () => {
    const validCandidateId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

    it('parses valid minimal application payload', () => {
      const parsed = CreateJobApplicationInputSchema.parse({
        candidateId: validCandidateId,
        companyName: 'Acme Corp',
        jobTitle: 'Senior Backend Engineer',
      });
      assert.strictEqual(parsed.companyName, 'Acme Corp');
      assert.strictEqual(parsed.jobTitle, 'Senior Backend Engineer');
      assert.strictEqual(parsed.status, 'SAVED');
      assert.strictEqual(parsed.source, 'MANUAL');
    });

    it('parses full application payload with JD and compensation', () => {
      const parsed = CreateJobApplicationInputSchema.parse({
        candidateId: validCandidateId,
        companyName: 'Stripe',
        jobTitle: 'Staff Infrastructure Engineer',
        jobUrl: 'https://stripe.com/jobs/12345',
        source: 'LINKEDIN',
        location: 'San Francisco, CA',
        workplaceType: 'HYBRID',
        employmentType: 'FULL_TIME',
        rawJobDescription: 'We are looking for a Staff Engineer experienced with PostgreSQL...',
        status: 'APPLIED',
        appliedAt: new Date().toISOString(),
        compensation: {
          currency: 'USD',
          minSalary: 220000,
          maxSalary: 280000,
        },
        notes: 'Referred by Alice from payments team.',
      });
      assert.strictEqual(parsed.companyName, 'Stripe');
      assert.strictEqual(parsed.workplaceType, 'HYBRID');
      assert.strictEqual(parsed.status, 'APPLIED');
    });

    it('rejects empty company name or job title', () => {
      assert.throws(() =>
        CreateJobApplicationInputSchema.parse({
          candidateId: validCandidateId,
          companyName: '',
          jobTitle: 'Engineer',
        })
      );
      assert.throws(() =>
        CreateJobApplicationInputSchema.parse({
          candidateId: validCandidateId,
          companyName: 'Acme',
          jobTitle: '',
        })
      );
    });

    it('rejects company name or job title exceeding 200 chars', () => {
      const longString = 'a'.repeat(201);
      assert.throws(() =>
        CreateJobApplicationInputSchema.parse({
          candidateId: validCandidateId,
          companyName: longString,
          jobTitle: 'Engineer',
        })
      );
      assert.throws(() =>
        CreateJobApplicationInputSchema.parse({
          candidateId: validCandidateId,
          companyName: 'Acme',
          jobTitle: longString,
        })
      );
    });

    it('rejects invalid job URL', () => {
      assert.throws(() =>
        CreateJobApplicationInputSchema.parse({
          candidateId: validCandidateId,
          companyName: 'Acme',
          jobTitle: 'Engineer',
          jobUrl: 'not-a-valid-url',
        })
      );
    });

    it('rejects rawJobDescription exceeding 100 KB', () => {
      const oversizedJd = 'x'.repeat(102401);
      assert.throws(() =>
        CreateJobApplicationInputSchema.parse({
          candidateId: validCandidateId,
          companyName: 'Acme',
          jobTitle: 'Engineer',
          rawJobDescription: oversizedJd,
        })
      );
    });

    it('parses partial updates via UpdateJobApplicationInputSchema', () => {
      const parsed = UpdateJobApplicationInputSchema.parse({
        status: 'INTERVIEWING',
        notes: 'Passed recruiter screen with flying colors.',
        compensation: {
          minSalary: 180000,
        },
      });
      assert.strictEqual(parsed.status, 'INTERVIEWING');
      assert.strictEqual(parsed.notes, 'Passed recruiter screen with flying colors.');
      assert.strictEqual(parsed.compensation.minSalary, 180000);
    });
  });

  describe('5. Application Stage Schemas Validation', () => {
    it('parses valid stage input', () => {
      const parsed = CreateApplicationStageInputSchema.parse({
        stageType: 'TECHNICAL_ASSESSMENT',
        title: 'System Design Interview (Distributed Systems)',
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        outcome: 'PENDING',
        interviewerNames: ['Jane Doe (Staff Architect)', 'John Smith (EM)'],
        feedback: 'Covered caching, replication, and CDC.',
        orderIndex: 2,
      });
      assert.strictEqual(parsed.stageType, 'TECHNICAL_ASSESSMENT');
      assert.strictEqual(parsed.outcome, 'PENDING');
      assert.strictEqual(parsed.interviewerNames.length, 2);
      assert.strictEqual(parsed.orderIndex, 2);
    });

    it('parses partial stage updates via UpdateApplicationStageInputSchema', () => {
      const parsed = UpdateApplicationStageInputSchema.parse({
        outcome: 'PASSED',
        feedback: 'Excellent design of distributed cache and consistency model.',
      });
      assert.strictEqual(parsed.outcome, 'PASSED');
      assert.strictEqual(
        parsed.feedback,
        'Excellent design of distributed cache and consistency model.'
      );
    });

    it('rejects empty stage title', () => {
      assert.throws(() =>
        CreateApplicationStageInputSchema.parse({
          stageType: 'RECRUITER_SCREEN',
          title: '',
        })
      );
    });

    it('rejects negative orderIndex', () => {
      assert.throws(() =>
        CreateApplicationStageInputSchema.parse({
          stageType: 'RECRUITER_SCREEN',
          title: 'Initial Screen',
          orderIndex: -1,
        })
      );
    });
  });

  describe('6. Tailored Document Snapshot Schemas Validation', () => {
    const validCandidateId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

    it('parses valid tailored resume snapshot input', () => {
      const parsed = CreateTailoredDocumentInputSchema.parse({
        candidateId: validCandidateId,
        documentType: 'TAILORED_RESUME',
        version: 1,
        title: 'Senior Backend Engineer Tailored Resume',
        content: {
          headline: 'Senior Backend Engineer | Distributed Systems & Node.js',
          skills: [{ slug: 'nodejs', name: 'Node.js', status: 'VERIFIED' }],
        },
        citationRefs: [
          {
            evidenceId: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
            filePath: 'package.json',
          },
        ],
        integrityScore: 0.98,
        atsFitScore: 88.5,
      });
      assert.strictEqual(parsed.documentType, 'TAILORED_RESUME');
      assert.strictEqual(parsed.version, 1);
      assert.strictEqual(parsed.integrityScore, 0.98);
      assert.strictEqual(parsed.atsFitScore, 88.5);
    });

    it('rejects non-positive version number', () => {
      assert.throws(() =>
        CreateTailoredDocumentInputSchema.parse({
          candidateId: validCandidateId,
          documentType: 'TAILORED_RESUME',
          version: 0,
          title: 'Resume',
          content: {},
        })
      );
    });

    it('rejects integrity score outside 0..1 range', () => {
      assert.throws(() =>
        CreateTailoredDocumentInputSchema.parse({
          candidateId: validCandidateId,
          documentType: 'TAILORED_RESUME',
          title: 'Resume',
          content: {},
          integrityScore: 1.5,
        })
      );
    });
  });
});
