/**
 * @file Unit Tests for Job Description & Requirement Domain Zod Schemas (P5-001)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  JobDescriptionInputSchema,
  JobDescriptionSchema,
  JobCompensationSchema,
  JobRequirementSchema,
  JobRequirementSourceSpanSchema,
  JobClassificationResultSchema,
  MAX_RAW_JD_BYTES,
} from '../../src/domain/career/index.js';

describe('Job Description Domain Zod Schemas (P5-001)', () => {
  const tenantId = crypto.randomUUID();
  const jobDescriptionId = crypto.randomUUID();

  // -------------------------------------------------------------------------
  // 1. Job Description Input Schema Tests
  // -------------------------------------------------------------------------
  describe('1. JobDescriptionInputSchema Validation', () => {
    it('accepts valid input with default source', () => {
      const input = {
        rawText: 'We are seeking a Senior Backend Engineer proficient in Node.js and PostgreSQL.',
      };
      const parsed = JobDescriptionInputSchema.parse(input);
      assert.equal(parsed.source, 'PASTE');
      assert.equal(parsed.rawText, input.rawText);
      assert.deepEqual(parsed.metadata, {});
    });

    it('accepts valid input with all explicit fields', () => {
      const input = {
        rawText: 'Looking for a Rust systems developer with Tokio experience.',
        source: 'URL',
        title: 'Senior Systems Engineer',
        company: 'Rust Corp',
        url: 'https://careers.rustcorp.example/job/123',
        location: 'Remote, US',
        workplaceType: 'REMOTE',
        employmentType: 'FULL_TIME',
        seniorityLevel: 'SENIOR',
        compensation: {
          min: 160000,
          max: 200000,
          currency: 'USD',
          interval: 'YEARLY',
        },
        metadata: { department: 'Core Infrastructure' },
      };
      const parsed = JobDescriptionInputSchema.parse(input);
      assert.equal(parsed.source, 'URL');
      assert.equal(parsed.title, 'Senior Systems Engineer');
      assert.equal(parsed.compensation.min, 160000);
      assert.equal(parsed.compensation.max, 200000);
      assert.equal(parsed.workplaceType, 'REMOTE');
    });

    it('rejects empty rawText or text below 10 characters', () => {
      assert.throws(
        () => JobDescriptionInputSchema.parse({ rawText: '' }),
        /at least 10 characters/
      );
      assert.throws(
        () => JobDescriptionInputSchema.parse({ rawText: 'Too short' }),
        /at least 10 characters/
      );
      assert.throws(() => JobDescriptionInputSchema.parse({}), /rawText is mandatory/);
    });

    it('rejects rawText exceeding 50 KB (51,200 bytes)', () => {
      const oversizedText = 'A'.repeat(MAX_RAW_JD_BYTES + 10);
      assert.throws(
        () => JobDescriptionInputSchema.parse({ rawText: oversizedText }),
        /exceeds maximum allowed size of 51200 bytes/
      );
    });

    it('rejects invalid source enum value', () => {
      assert.throws(
        () =>
          JobDescriptionInputSchema.parse({
            rawText: 'Valid job description text for testing',
            source: 'INVALID_SOURCE',
          }),
        /Invalid enum value/
      );
    });

    it('rejects malformed compensation where min > max', () => {
      assert.throws(
        () =>
          JobCompensationSchema.parse({
            min: 200000,
            max: 150000,
            currency: 'USD',
          }),
        /Minimum compensation cannot exceed maximum compensation/
      );
    });

    it('rejects metadata containing forbidden secret keys', () => {
      assert.throws(
        () =>
          JobDescriptionInputSchema.parse({
            rawText: 'Valid job description text for testing',
            metadata: { apiKey: 'secret-leaked-key' },
          }),
        /Secret or credential key 'apiKey' is strictly forbidden in metadata/
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. Canonical Job Description Schema Tests
  // -------------------------------------------------------------------------
  describe('2. JobDescriptionSchema Validation', () => {
    it('validates a complete JobDescription entity', () => {
      const validJob = {
        id: jobDescriptionId,
        tenantId,
        source: 'PASTE',
        title: 'Lead Platform Architect',
        company: 'Cloud Corp',
        rawText: 'We are seeking a Lead Platform Architect to scale distributed services.',
        normalizedSummary: 'Seeking a Lead Platform Architect to scale distributed services.',
        location: 'San Francisco, CA',
        employmentType: 'FULL_TIME',
        workplaceType: 'HYBRID',
        seniorityLevel: 'LEAD',
        compensation: {
          min: 220000,
          max: 275000,
          currency: 'USD',
          interval: 'YEARLY',
        },
        status: 'ACTIVE',
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const parsed = JobDescriptionSchema.parse(validJob);
      assert.equal(parsed.id, jobDescriptionId);
      assert.equal(parsed.status, 'ACTIVE');
      assert.equal(parsed.seniorityLevel, 'LEAD');
    });

    it('rejects invalid UUIDs for id and tenantId', () => {
      assert.throws(
        () =>
          JobDescriptionSchema.parse({
            id: 'not-a-uuid',
            tenantId,
            source: 'PASTE',
            title: 'Engineer',
            rawText: 'Valid text',
            normalizedSummary: 'Valid summary',
          }),
        /JobDescription ID must be a valid UUIDv4/
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. Job Requirement Schema Tests
  // -------------------------------------------------------------------------
  describe('3. JobRequirementSchema Validation', () => {
    it('validates a canonical SKILL requirement', () => {
      const skillReq = {
        id: crypto.randomUUID(),
        tenantId,
        jobDescriptionId,
        category: 'SKILL',
        importance: 'REQUIRED',
        weight: 1.0,
        skillSlug: 'postgresql',
        rawSnippet: 'Must possess strong experience with PostgreSQL and database indexing.',
        extractedValue: 'PostgreSQL',
        normalizedCriteria: {
          skillSlug: 'postgresql',
          skillName: 'PostgreSQL',
          skillCategory: 'DATABASE',
          minYears: 3,
        },
        confidenceScore: 0.95,
        sourceSpan: {
          section: 'REQUIREMENTS',
          startOffset: 120,
          endOffset: 200,
          snippet: 'Must possess strong experience with PostgreSQL and database indexing.',
        },
        createdAt: new Date().toISOString(),
      };

      const parsed = JobRequirementSchema.parse(skillReq);
      assert.equal(parsed.category, 'SKILL');
      assert.equal(parsed.importance, 'REQUIRED');
      assert.equal(parsed.skillSlug, 'postgresql');
      assert.equal(parsed.weight, 1.0);
    });

    it('validates a canonical EXPERIENCE requirement', () => {
      const expReq = {
        id: crypto.randomUUID(),
        tenantId,
        jobDescriptionId,
        category: 'EXPERIENCE',
        importance: 'REQUIRED',
        weight: 1.0,
        skillSlug: 'python',
        rawSnippet: '5+ years of experience in Python distributed systems.',
        extractedValue: '5+ years experience in Python',
        normalizedCriteria: {
          minYears: 5,
          target: 'Python distributed systems',
          associatedSkillSlug: 'python',
        },
        confidenceScore: 0.9,
        sourceSpan: {
          section: 'EXPERIENCE',
          startOffset: 50,
          endOffset: 105,
          snippet: '5+ years of experience in Python distributed systems.',
        },
      };

      const parsed = JobRequirementSchema.parse(expReq);
      assert.equal(parsed.category, 'EXPERIENCE');
      assert.equal(parsed.normalizedCriteria.minYears, 5);
    });

    it('validates a canonical EDUCATION requirement', () => {
      const eduReq = {
        id: crypto.randomUUID(),
        tenantId,
        jobDescriptionId,
        category: 'EDUCATION',
        importance: 'PREFERRED',
        weight: 0.5,
        skillSlug: null,
        rawSnippet: "Master's degree in Computer Science or related quantitative field preferred.",
        extractedValue: 'MASTER degree in Computer Science',
        normalizedCriteria: {
          degreeLevel: 'MASTER',
          field: 'Computer Science',
        },
        confidenceScore: 0.85,
        sourceSpan: {
          section: 'PREFERRED_QUALIFICATIONS',
          snippet: "Master's degree in Computer Science or related quantitative field preferred.",
        },
      };

      const parsed = JobRequirementSchema.parse(eduReq);
      assert.equal(parsed.category, 'EDUCATION');
      assert.equal(parsed.importance, 'PREFERRED');
      assert.equal(parsed.normalizedCriteria.degreeLevel, 'MASTER');
    });

    it('rejects invalid confidence score outside [0.0, 1.0]', () => {
      assert.throws(
        () =>
          JobRequirementSchema.parse({
            id: crypto.randomUUID(),
            tenantId,
            jobDescriptionId,
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            rawSnippet: 'Some snippet',
            extractedValue: 'Test',
            confidenceScore: 1.5, // Invalid
            sourceSpan: {
              section: 'REQUIREMENTS',
              snippet: 'Some snippet',
            },
          }),
        /less than or equal to 1.0/
      );
    });

    it('rejects invalid source span with startOffset > endOffset', () => {
      assert.throws(
        () =>
          JobRequirementSourceSpanSchema.parse({
            section: 'REQUIREMENTS',
            startOffset: 200,
            endOffset: 100, // Invalid
            snippet: 'Snippet',
          }),
        /startOffset cannot exceed endOffset/
      );
    });
  });

  // -------------------------------------------------------------------------
  // 4. Job Classification Result Schema Tests
  // -------------------------------------------------------------------------
  describe('4. JobClassificationResultSchema Validation', () => {
    it('validates complete classification result envelope', () => {
      const result = {
        jobDescription: {
          id: jobDescriptionId,
          tenantId,
          source: 'PASTE',
          title: 'Full Stack Engineer',
          company: 'Acme Corp',
          rawText: 'We need React and Node.js skills.',
          normalizedSummary: 'We need React and Node.js skills.',
          employmentType: 'FULL_TIME',
          workplaceType: 'REMOTE',
          seniorityLevel: 'MID',
          status: 'ACTIVE',
          metadata: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        requirements: [
          {
            id: crypto.randomUUID(),
            tenantId,
            jobDescriptionId,
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            skillSlug: 'react',
            rawSnippet: 'Proficiency in React.',
            extractedValue: 'React',
            normalizedCriteria: {
              skillSlug: 'react',
              skillName: 'React',
              skillCategory: 'FRAMEWORK',
            },
            confidenceScore: 0.95,
            sourceSpan: { section: 'REQUIREMENTS', snippet: 'Proficiency in React.' },
          },
        ],
        sections: [
          {
            name: 'REQUIREMENTS',
            heading: 'Requirements',
            rawText: 'Proficiency in React.',
            startOffset: 0,
            endOffset: 21,
          },
        ],
        stats: {
          totalRequirements: 1,
          requiredCount: 1,
          preferredCount: 0,
          optionalCount: 0,
          skillCount: 1,
          experienceCount: 0,
          educationCount: 0,
          domainCount: 0,
          locationCount: 0,
        },
        extractionMetadata: {
          mode: 'DETERMINISTIC',
          extractionDurationMs: 15,
          parserVersion: '1.0.0',
        },
      };

      const parsed = JobClassificationResultSchema.parse(result);
      assert.equal(parsed.stats.totalRequirements, 1);
      assert.equal(parsed.extractionMetadata.mode, 'DETERMINISTIC');
      assert.equal(parsed.requirements[0].skillSlug, 'react');
    });
  });
});
