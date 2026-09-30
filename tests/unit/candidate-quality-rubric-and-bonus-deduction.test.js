import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { candidateQualityRubricService } from '../../src/services/candidate-quality-rubric.service.js';
import { bonusDeductionEngineService } from '../../src/services/bonus-deduction-engine.service.js';

describe('Candidate Quality Rubric & Bonus/Deduction Engine (Phases 12 & 13)', () => {
  describe('Phase 12: CandidateQualityRubricService', () => {
    it('evaluates a strong senior engineer profile across all 10 dimensions', () => {
      const candidateProfile = {
        name: 'Jane Doe',
        skills: [
          'TypeScript',
          'Node.js',
          'PostgreSQL',
          'Docker',
          'Kubernetes',
          'AWS',
          'Terraform',
          'GraphQL',
        ],
        education: [{ degree: 'B.S. in Computer Science', institution: 'MIT', year: '2018' }],
        certifications: [{ name: 'AWS Certified Solutions Architect' }],
        experience: [
          {
            title: 'Senior Software Engineer',
            company: 'Stripe',
            bullets: [
              'Architected distributed payment ingestion microservices processing 15,000 req/s with 99.99% availability.',
              'Mentored 4 junior engineers on distributed consensus, code reviews, and API design.',
              'Reduced p99 latency by 35% through Redis caching and PostgreSQL query optimization.',
            ],
            startDate: '2021-01-01',
            endDate: '2024-01-01',
          },
          {
            title: 'Software Engineer',
            company: 'Lyft',
            bullets: [
              'Implemented driver dispatch algorithm using Go and Kafka streaming.',
              'Implemented CI/CD pipelines with GitHub Actions and Docker containerization.',
            ],
            startDate: '2018-06-01',
            endDate: '2020-12-31',
          },
        ],
        projects: [
          {
            name: 'Distributed Task Queue',
            description:
              'Fault-tolerant distributed task queue with raft consensus and Prometheus metrics.',
            technologies: ['Go', 'gRPC', 'Prometheus', 'Docker'],
            bullets: [
              'Designed distributed leader election using Raft consensus protocol.',
              'Added Prometheus instrumentation and unit tests achieving 90% code coverage.',
              'Engineered automated CI/CD pipeline with GitHub Actions, deploying Docker containerized services to Kubernetes.',
            ],
          },
        ],
        openSourceContributions: [
          {
            repository: 'facebook/react',
            role: 'EXTERNAL_CONTRIBUTOR',
            mergedPrCount: 1,
            description: 'Fix edge case in concurrent rendering scheduler',
            starsCount: 220000,
          },
        ],
      };

      const rubric = candidateQualityRubricService.evaluateCandidateQuality({
        candidateProfile,
      });

      assert.ok(rubric.overallQualityScore >= 70.0);
      assert.ok(rubric.overallLevel === 'STRONG' || rubric.overallLevel === 'EXCEPTIONAL');
      assert.equal(Object.keys(rubric.dimensions).length, 10);
      assert.ok(rubric.dimensions.TECHNICAL_DEPTH.score >= 7.0);
      assert.ok(rubric.dimensions.ENGINEERING_RIGOR.score >= 7.0);
      assert.ok(rubric.dimensions.PRODUCTION_IMPACT.score >= 7.0);
      assert.ok(rubric.dimensions.LEADERSHIP_COLLABORATION.score >= 5.0);
    });

    it('evaluates an entry-level candidate with tutorial projects conservatively', () => {
      const juniorProfile = {
        name: 'Alex Smith',
        skills: ['HTML', 'CSS', 'JavaScript'],
        education: [],
        certifications: [],
        experience: [],
        projects: [
          {
            name: 'Todo App',
            description: 'Simple todo list from youtube tutorial using local storage.',
            technologies: ['HTML', 'CSS', 'JavaScript'],
            bullets: ['Built a todo list to learn JavaScript basics.'],
          },
        ],
        openSourceContributions: [],
      };

      const rubric = candidateQualityRubricService.evaluateCandidateQuality({
        candidateProfile: juniorProfile,
      });

      assert.ok(rubric.overallQualityScore <= 45.0);
      assert.ok(
        rubric.overallLevel === 'DEVELOPING' || rubric.overallLevel === 'NEEDS_IMPROVEMENT'
      );
      assert.ok(rubric.criticalGaps.length >= 2);
    });
  });

  describe('Phase 13: BonusDeductionEngineService', () => {
    it('applies positive bonuses with strict maximum cap of +10.0%', () => {
      const candidateProfile = {
        certifications: [
          { name: 'AWS Certified Solutions Architect Professional' },
          { name: 'Certified Kubernetes Administrator (CKA)' },
          { name: 'HashiCorp Certified Terraform Associate' },
        ],
      };

      const experiences = [
        {
          company: 'Acme Corp',
          bullets: [
            'Scaled infrastructure serving 20M+ users with 50k req/s traffic spikes.',
            'Saved $2M+ annual cloud expenditure via spot instance migration.',
          ],
        },
      ];

      const openSourceReport = {
        openSourceScore: 85.0,
        externalPrCount: 4,
        externalPrs: [
          { repo: 'nodejs/node', prNumber: 42000, status: 'MERGED' },
          { repo: 'expressjs/express', prNumber: 5012, status: 'MERGED' },
        ],
      };

      const projectEvaluations = [
        {
          projectName: 'High-Throughput Gateway',
          complexityTier: 'PRODUCTION_GRADE',
          keywordDensityWarning: false,
        },
      ];

      const report = bonusDeductionEngineService.evaluateModifiers({
        candidateProfile,
        experiences,
        openSourceReport,
        projectEvaluations,
      });

      assert.ok(report.bonuses.length >= 3);
      assert.ok(report.totalBonus <= 10.0);
      assert.equal(report.totalDeduction, 0.0);
      assert.ok(report.netModifierPercentage > 0);
      assert.ok(report.netModifierPercentage <= 10.0);
    });

    it('applies deductions with strict maximum cap of -20.0%', () => {
      const candidateProfile = { certifications: [] };
      const experiences = [
        {
          title: 'Eng 1',
          company: 'Co A',
          startDate: '2023-01-01',
          endDate: '2023-04-01',
          bullets: [],
        },
        {
          title: 'Eng 2',
          company: 'Co B',
          startDate: '2023-04-15',
          endDate: '2023-07-15',
          bullets: [],
        },
        {
          title: 'Eng 3',
          company: 'Co C',
          startDate: '2023-08-01',
          endDate: '2023-11-01',
          bullets: [],
        },
      ];

      const parseabilityAudit = {
        issues: [{ severity: 'CRITICAL', message: 'Nested multi-column table breaks text flow' }],
      };

      const projectEvaluations = [
        {
          projectName: 'Keyword Stuffed Project',
          complexityTier: 'BASIC_CRUD',
          keywordDensityWarning: true,
        },
      ];

      const report = bonusDeductionEngineService.evaluateModifiers({
        candidateProfile,
        experiences,
        parseabilityAudit,
        projectEvaluations,
      });

      assert.ok(report.deductions.length >= 2);
      assert.ok(report.totalDeduction <= 20.0);
      assert.ok(report.netModifierPercentage < 0);
      assert.ok(report.netModifierPercentage >= -20.0);
    });
  });
});
