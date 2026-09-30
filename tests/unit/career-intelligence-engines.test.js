/**
 * @file Unit Tests for Advanced Career Intelligence Engines (Phases 6, 7, 8, 9)
 *
 * Verifies:
 * 1. Role Scoring Profiles (Phase 6):
 *    - All 10 canonical role profiles have weights summing to exactly 100.0
 *    - Rejects invalid weight configurations with ValidationError
 *    - Correctly resolves role from job title
 * 2. Open Source Intelligence (Phase 7):
 *    - Distinguishes external open source PRs from personal repositories
 *    - Enforces score cap on personal-only repositories (cannot exceed 30.0)
 * 3. Project Quality Engine (Phase 8):
 *    - Distinguishes Tutorial, Basic CRUD, and Production-Grade tiers
 *    - Enforces hard score ceiling on Tutorial projects (<= 35.0)
 *    - Enforces Keyword Stuffing penalty when >8 technologies lack architectural depth
 * 4. Production Experience Intelligence (Phase 9):
 *    - Never counts GitHub/Open-Source activity as employment tenure
 *    - Accurately weights full-time vs internship vs contract
 *    - Extracts production scale and leadership signals
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_ROLE_PROFILES,
  getRoleProfile,
  registerRoleProfile,
  resolveRoleFromJobTitle,
  RoleScoringProfileSchema,
} from '../../src/domain/career/role-scoring-profiles.js';
import { openSourceIntelligenceService } from '../../src/services/open-source-intelligence.service.js';
import { projectQualityEngineService } from '../../src/services/project-quality-engine.service.js';
import { productionExperienceIntelligenceService } from '../../src/services/production-experience-intelligence.service.js';

describe('Advanced Career Intelligence Engines (Phases 6 - 9)', () => {
  // =========================================================================
  // Phase 6: Role Scoring Profiles
  // =========================================================================
  describe('Phase 6: Role Scoring Profiles', () => {
    it('verifies every canonical role profile weights sum to exactly 100.0', () => {
      for (const [roleKey, profile] of Object.entries(CANONICAL_ROLE_PROFILES)) {
        const validated = RoleScoringProfileSchema.parse(profile);
        assert.ok(validated);
        const w = validated.weights;
        const sum =
          w.requiredSkills +
          w.preferredSkills +
          w.projectRelevance +
          w.experience +
          w.openSource +
          w.technicalDepth +
          w.education +
          w.location +
          w.certification +
          w.evidenceConfidence;

        assert.strictEqual(
          Math.round(sum * 100) / 100,
          100.0,
          `${roleKey} weights must sum to 100.0`
        );
      }
    });

    it('rejects invalid role profile whose weights do not sum to 100.0', () => {
      assert.throws(() => {
        RoleScoringProfileSchema.parse({
          role: 'custom',
          name: 'Invalid Profile',
          description: 'Sum is 90 instead of 100',
          weights: {
            requiredSkills: 30,
            preferredSkills: 10,
            projectRelevance: 10,
            experience: 10,
            openSource: 10,
            technicalDepth: 10,
            education: 5,
            location: 2.5,
            certification: 0,
            evidenceConfidence: 2.5, // Total = 90.0
          },
        });
      }, /must sum to exactly 100.0/);
    });

    it('infers role profile from job title accurately', () => {
      assert.strictEqual(resolveRoleFromJobTitle('Lead ML Research Engineer'), 'ml_engineer');
      assert.strictEqual(
        resolveRoleFromJobTitle('DevOps & Cloud SRE Specialist'),
        'devops_engineer'
      );
      assert.strictEqual(
        resolveRoleFromJobTitle('Senior Backend Go Developer'),
        'backend_engineer'
      );
      assert.strictEqual(
        resolveRoleFromJobTitle('React UI Frontend Engineer'),
        'frontend_engineer'
      );
      assert.strictEqual(
        resolveRoleFromJobTitle('Firmware RTOS Embedded Engineer'),
        'embedded_engineer'
      );
    });
  });

  // =========================================================================
  // Phase 7: Open Source Contribution Intelligence
  // =========================================================================
  describe('Phase 7: Open Source Intelligence', () => {
    it('distinguishes external open source PRs from personal repositories', () => {
      const externalCandidate = {
        openSourceContributions: [
          {
            repository: 'facebook/react',
            role: 'EXTERNAL_CONTRIBUTOR',
            mergedPrCount: 4,
            description: 'Fixed concurrent mode hydration edge cases',
            technologies: ['JavaScript', 'React'],
            starsCount: 220000,
          },
        ],
      };

      const report = openSourceIntelligenceService.evaluateOpenSourceContributions({
        canonicalProfile: externalCandidate,
      });

      assert.ok(report.score >= 40.0, 'External contributor should score well');
      assert.strictEqual(report.totalExternalContributionsCount, 1);
      assert.strictEqual(report.contributionTier, 'ACTIVE_CONTRIBUTOR');
      assert.ok(report.keyAchievements.some((a) => a.includes('Merged 4 pull requests')));
    });

    it('caps open-source score at 30.0 for candidates with only personal repositories', () => {
      const personalOnly = {
        openSourceContributions: [
          {
            repository: 'my-personal-blog',
            role: 'MAINTAINER',
            mergedPrCount: 0,
            description: 'Personal portfolio website with 300 stars',
            technologies: ['HTML', 'CSS'],
            starsCount: 300,
          },
        ],
      };

      const report = openSourceIntelligenceService.evaluateOpenSourceContributions({
        canonicalProfile: personalOnly,
        githubActivities: [
          {
            repository: 'my-personal-blog',
            isExternal: false,
            isMaintainer: true,
            commits: 80,
            stars: 300,
            summary: 'Personal blog repository',
          },
          {
            repository: 'my-personal-tool',
            isExternal: false,
            isMaintainer: true,
            commits: 50,
            stars: 150,
            summary: 'Personal tool repository',
          },
        ],
      });

      assert.ok(report.score <= 30.0, 'Personal-only score must be capped <= 30.0');
      assert.strictEqual(report.contributionTier, 'PERSONAL_ONLY');
      assert.ok(report.warnings.some((w) => w.includes('capped at 30.0')));
    });
  });

  // =========================================================================
  // Phase 8: Project Quality Engine
  // =========================================================================
  describe('Phase 8: Project Quality Engine', () => {
    it('rates production-grade projects highly while capping tutorial projects', () => {
      const prodProject = {
        name: 'Distributed Event Broker',
        description:
          'High-throughput event streaming platform with Raft consensus and Kubernetes deployment.',
        bullets: [
          'Engineered microservices architecture with Kafka event streaming and Redis caching.',
          'Containerized with Docker and orchestrated automated CI/CD pipeline via GitHub Actions with Prometheus observability.',
        ],
        technologies: ['Go', 'Kafka', 'Redis', 'Docker', 'Kubernetes', 'CI/CD'],
        url: 'https://event-broker.example.com',
        githubUrl: 'https://github.com/example/event-broker',
      };

      const tutorialProject = {
        name: 'Todo List App',
        description: 'Simple todo list application with React and local storage.',
        bullets: ['Created basic todo item adder and remover.'],
        technologies: ['React', 'JavaScript', 'HTML', 'CSS'],
      };

      const report = projectQualityEngineService.evaluateProjects([prodProject, tutorialProject]);

      assert.strictEqual(report.topProjectTier, 'PRODUCTION_GRADE');
      const prodEval = report.evaluations.find((e) => e.projectName === 'Distributed Event Broker');
      assert.ok(prodEval.score >= 70.0, 'Production-grade project must score >= 70');
      assert.strictEqual(prodEval.tier, 'PRODUCTION_GRADE');

      const tutEval = report.evaluations.find((e) => e.projectName === 'Todo List App');
      assert.strictEqual(tutEval.tier, 'TUTORIAL');
      assert.ok(tutEval.score <= 35.0, 'Tutorial project must be capped <= 35.0');
    });

    it('penalizes keyword-stuffed projects that lack architectural depth', () => {
      const stuffedProject = {
        name: 'Simple Web Page',
        description: 'Basic landing page.',
        technologies: [
          'React',
          'Vue',
          'Angular',
          'Svelte',
          'Node.js',
          'Python',
          'Java',
          'C++',
          'Kubernetes',
          'Docker',
        ],
      };

      const evalResult = projectQualityEngineService.evaluateSingleProject(stuffedProject);
      assert.ok(evalResult.penalties.some((p) => p.includes('Keyword Stuffing Penalty')));
    });
  });

  // =========================================================================
  // Phase 9: Production Experience Intelligence
  // =========================================================================
  describe('Phase 9: Production Experience Intelligence', () => {
    it('never counts GitHub activity or open source as professional employment tenure', () => {
      const candidate = {
        experience: [
          {
            company: 'TechCorp',
            title: 'Senior Software Engineer',
            employmentType: 'FULL_TIME',
            startDate: '2021-01-01',
            endDate: '2024-01-01',
            durationMonths: 36,
            bullets: [
              'Architected high-throughput payment processing microservice handling 10,000 req/sec.',
            ],
          },
          {
            company: 'Open Source Contributor',
            title: 'GitHub Maintainer',
            employmentType: 'OPEN_SOURCE', // Must be excluded from employment tenure
            startDate: '2018-01-01',
            endDate: '2024-01-01',
            durationMonths: 72,
            bullets: ['Maintained public libraries.'],
          },
        ],
      };

      const report = productionExperienceIntelligenceService.evaluateExperience({
        canonicalProfile: candidate,
      });

      // Total professional tenure must ONLY include the 36 months of TechCorp, NOT the 72 months of open source
      assert.strictEqual(report.totalProfessionalTenureMonths, 36);
      assert.strictEqual(report.totalProfessionalYears, 3.0);
      assert.strictEqual(report.fullTimeTenureMonths, 36);
      assert.strictEqual(report.productionSystemsVerifiedCount, 1);
    });

    it('weights full-time, contract, and internship appropriately', () => {
      const candidate = {
        experience: [
          {
            company: 'BigCorp',
            title: 'Software Engineer',
            employmentType: 'FULL_TIME',
            durationMonths: 24, // 24 * 1.0 = 24
          },
          {
            company: 'Startup',
            title: 'Contract Engineer',
            employmentType: 'CONTRACT',
            durationMonths: 10, // 10 * 0.8 = 8
          },
          {
            company: 'EarlyLabs',
            title: 'Software Intern',
            employmentType: 'INTERNSHIP',
            durationMonths: 6, // 6 * 0.5 = 3
          },
        ],
      };

      const report = productionExperienceIntelligenceService.evaluateExperience({
        canonicalProfile: candidate,
      });

      // Weighted tenure = 24 + 8 + 3 = 35 months = ~2.9 years
      assert.strictEqual(report.totalProfessionalYears, 2.9);
      assert.strictEqual(report.seniorityLevel, 'MID_LEVEL');
    });
  });
});
