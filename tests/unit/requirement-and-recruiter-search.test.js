import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requirementSemanticsService } from '../../src/services/requirement-semantics.service.js';
import { recruiterSearchSimulationService } from '../../src/services/recruiter-search-simulation.service.js';

describe('Requirement Semantics & Recruiter Search Simulation (Phases 10 & 11)', () => {
  describe('Phase 10: RequirementSemanticsService', () => {
    it('evaluates AND logic requiring all requirements', () => {
      const group = {
        id: 'grp-frontend',
        name: 'Core Frontend Stack',
        operator: 'AND',
        requirements: [
          { id: 'r1', name: 'React', importance: 'REQUIRED' },
          { id: 'r2', name: 'TypeScript', importance: 'REQUIRED' },
        ],
      };

      // Both present
      const fullMatch = requirementSemanticsService.evaluateRequirementGroup(group, [
        'React',
        'TypeScript',
      ]);
      assert.equal(fullMatch.status, 'MATCHED');
      assert.equal(fullMatch.earnedScoreRatio, 1.0);
      assert.equal(fullMatch.missingRequirements.length, 0);

      // Only one present
      const partialMatch = requirementSemanticsService.evaluateRequirementGroup(group, ['React']);
      assert.equal(partialMatch.status, 'PARTIAL');
      assert.equal(partialMatch.earnedScoreRatio, 0.5);
      assert.deepEqual(partialMatch.missingRequirements, ['TypeScript']);

      // None present
      const noneMatch = requirementSemanticsService.evaluateRequirementGroup(group, ['Python']);
      assert.equal(noneMatch.status, 'MISSING');
      assert.equal(noneMatch.earnedScoreRatio, 0.0);
    });

    it('evaluates OR logic requiring only one requirement', () => {
      const group = {
        id: 'grp-framework',
        name: 'Modern Web Framework',
        operator: 'OR',
        requirements: [
          { id: 'r1', name: 'React', importance: 'REQUIRED' },
          { id: 'r2', name: 'Vue', importance: 'REQUIRED' },
          { id: 'r3', name: 'Angular', importance: 'REQUIRED' },
        ],
      };

      const match = requirementSemanticsService.evaluateRequirementGroup(group, ['Vue']);
      assert.equal(match.status, 'MATCHED');
      assert.equal(match.earnedScoreRatio, 1.0);
      assert.deepEqual(match.matchedRequirements, ['Vue']);

      const miss = requirementSemanticsService.evaluateRequirementGroup(group, ['Django', 'Flask']);
      assert.equal(miss.status, 'MISSING');
      assert.equal(miss.earnedScoreRatio, 0.0);
    });

    it('handles EQUIVALENT logic only when explicitly declared', () => {
      const group = {
        id: 'grp-db',
        name: 'Relational Database',
        operator: 'AND',
        requirements: [
          {
            id: 'r1',
            name: 'PostgreSQL',
            importance: 'REQUIRED',
            allowsEquivalent: true,
            approvedEquivalents: ['MySQL', 'CockroachDB'],
          },
          {
            id: 'r2',
            name: 'Redis',
            importance: 'REQUIRED',
            allowsEquivalent: false, // Does not allow Memcached
          },
        ],
      };

      // Candidate has MySQL (approved equivalent for PostgreSQL) and Memcached (not approved for Redis)
      const evaluation = requirementSemanticsService.evaluateRequirementGroup(group, [
        'MySQL',
        'Memcached',
      ]);
      assert.equal(evaluation.status, 'PARTIAL');
      assert.equal(evaluation.earnedScoreRatio, 0.5);
      assert.ok(
        evaluation.matchedRequirements.some((r) => r.includes('PostgreSQL (via equivalent)'))
      );
      assert.ok(evaluation.missingRequirements.includes('Redis'));
    });

    it('enforces hard safety gates (LOCATION, AUTHORIZATION, EXPERIENCE)', () => {
      const locationGatedGroup = {
        id: 'grp-loc',
        name: 'Onsite Requirement',
        operator: 'AND',
        requirements: [
          { id: 'r1', name: 'New York', importance: 'LOCATION_GATED' },
          { id: 'r2', name: 'Node.js', importance: 'REQUIRED' },
        ],
      };

      const gateFail = requirementSemanticsService.evaluateRequirementGroup(
        locationGatedGroup,
        ['Node.js'],
        { location: 'London, UK' }
      );
      assert.equal(gateFail.status, 'UNSATISFIED_GATE');
      assert.equal(gateFail.earnedScoreRatio, 0.0);
      assert.match(gateFail.reason, /Location gate unsatisfied/);

      const expGatedGroup = {
        id: 'grp-exp',
        name: 'Senior Experience Gate',
        operator: 'AND',
        requirements: [{ id: 'r1', name: '5+ years experience', importance: 'EXPERIENCE_GATED' }],
      };

      const expFail = requirementSemanticsService.evaluateRequirementGroup(expGatedGroup, [], {
        tenureYears: 2,
      });
      assert.equal(expFail.status, 'UNSATISFIED_GATE');
      assert.match(expFail.reason, /Experience gate unsatisfied/);
    });
  });

  describe('Phase 11: RecruiterSearchSimulationService', () => {
    it('simulates complex Boolean search query matching', () => {
      const resumeText = `
        Senior Software Engineer with 6 years experience building distributed systems.
        Proficient in TypeScript, Node.js, and PostgreSQL.
        Experienced with Kubernetes and Docker in AWS environments.
      `;
      const candidateSkills = [
        'TypeScript',
        'Node.js',
        'PostgreSQL',
        'Docker',
        'Kubernetes',
        'AWS',
      ];

      // Query: "TypeScript AND (Node.js OR Python) AND PostgreSQL"
      const resultPass = recruiterSearchSimulationService.evaluateRecruiterQuery({
        query: 'TypeScript AND (Node.js OR Python) AND PostgreSQL',
        documentText: resumeText,
        candidateSkills,
      });

      assert.equal(resultPass.searchFound, true);
      assert.ok(resultPass.coverage >= 75.0);
      assert.ok(resultPass.matchedKeywords.includes('TypeScript'));
      assert.ok(resultPass.matchedKeywords.includes('Node.js'));
      assert.ok(resultPass.matchedKeywords.includes('PostgreSQL'));

      // Query: "TypeScript AND Go AND DynamoDB"
      const resultFail = recruiterSearchSimulationService.evaluateRecruiterQuery({
        query: 'TypeScript AND Go AND DynamoDB',
        documentText: resumeText,
        candidateSkills,
      });

      assert.equal(resultFail.searchFound, false);
      assert.ok(resultFail.missingKeywords.includes('Go'));
      assert.ok(resultFail.missingKeywords.includes('DynamoDB'));
    });

    it('matches aliased technologies deterministically', () => {
      const resumeText = 'Hands-on production container orchestration with K8s and Postgres.';
      const candidateSkills = ['K8s', 'Postgres'];

      const result = recruiterSearchSimulationService.evaluateRecruiterQuery({
        query: 'kubernetes AND postgresql',
        documentText: resumeText,
        candidateSkills,
      });

      assert.equal(result.searchFound, true);
    });

    it('handles empty query gracefully', () => {
      const result = recruiterSearchSimulationService.evaluateRecruiterQuery({
        query: '',
        documentText: 'Some resume text',
      });
      assert.equal(result.searchFound, true);
      assert.equal(result.coverage, 100.0);
    });
  });
});
