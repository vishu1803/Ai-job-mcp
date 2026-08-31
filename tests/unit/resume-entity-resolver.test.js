/**
 * @file Unit Tests for ResumeEntityResolver (P13.5-004 / ARCH-052).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ResumeEntityResolver,
  RESUME_SKILL_SCOPES,
} from '../../src/domain/career/resume-entity-resolver.js';

describe('ResumeEntityResolver', () => {
  describe('Semantic Normalization & Token Cleaning', () => {
    it('should clean raw tokens with bullets, colons, and parentheticals', () => {
      assert.equal(ResumeEntityResolver.cleanToken('● Python (ES6+)'), 'Python');
      assert.equal(ResumeEntityResolver.cleanToken('• NodeJS:'), 'NodeJS');
      assert.equal(ResumeEntityResolver.cleanToken('  React.js (Intermediate)  '), 'React.js');
    });

    it('should normalize skill variants to canonical name and slug via taxonomy', () => {
      const node1 = ResumeEntityResolver.normalizeSkill('NodeJS');
      const node2 = ResumeEntityResolver.normalizeSkill('Node.js');
      assert.ok(node1);
      assert.ok(node2);
      assert.equal(node1.slug, 'node-js');
      assert.equal(node2.slug, 'node-js');
      assert.equal(node1.name, 'Node.js');
      assert.equal(node2.name, 'Node.js');

      const fastApi = ResumeEntityResolver.normalizeSkill('FastAPI Framework');
      assert.ok(fastApi);
      assert.equal(fastApi.slug, 'fastapi');
      assert.equal(fastApi.name, 'FastAPI');
    });
  });

  describe('Technology Extraction from Text', () => {
    it('should extract known technologies mentioned in bullet points', () => {
      const text =
        'Engineered distributed backend microservices in Go using Redis, Docker, and PostgreSQL.';
      const extracted = ResumeEntityResolver.extractTechnologiesFromText(text);

      const slugs = extracted.map((t) => t.slug);
      assert.ok(slugs.includes('go'));
      assert.ok(slugs.includes('redis'));
      assert.ok(slugs.includes('docker'));
      assert.ok(slugs.includes('postgresql'));
    });
  });

  describe('Multi-Stage Entity Resolution & Scope Attribution', () => {
    it('should resolve identical skills mentioned in Skills and Projects as HYBRID with multi-mention occurrences', () => {
      const rawSections = [
        {
          sectionType: 'SKILLS',
          heading: 'Technical Skills',
          structuredData: {
            skills: ['Prisma ORM', 'PostgreSQL', 'TypeScript'],
          },
        },
        {
          sectionType: 'PROJECTS',
          heading: 'Projects',
          structuredData: {
            projects: [
              {
                title: 'Collaborative Task Manager',
                technologies: ['Prisma', 'PostgreSQL', 'Fastify'],
                bullets: [
                  'Built real-time task manager using Prisma ORM and PostgreSQL.',
                  'Implemented WebSocket synchronizer with Fastify.',
                ],
                urls: ['https://github.com/test/task-manager'],
              },
            ],
          },
        },
      ];

      const graph = ResumeEntityResolver.resolveCanonicalGraph(rawSections);

      // 1. Prisma should be 1 canonical entity with scope HYBRID and 3 occurrences (skills + project header + bullet)
      const prisma = graph.canonicalSkills.get('prisma');
      assert.ok(prisma, 'Prisma must exist in canonical skills');
      assert.equal(prisma.name, 'Prisma');
      assert.equal(prisma.scope, RESUME_SKILL_SCOPES.HYBRID);
      assert.ok(prisma.occurrenceCount >= 2);
      assert.ok(prisma.relatedEntities.some((r) => r.name === 'Collaborative Task Manager'));

      // 2. PostgreSQL should be HYBRID
      const pg = graph.canonicalSkills.get('postgresql');
      assert.ok(pg, 'PostgreSQL must exist in canonical skills');
      assert.equal(pg.scope, RESUME_SKILL_SCOPES.HYBRID);

      // 3. Fastify appears only in Project -> PROJECT_SCOPED
      const fastify = graph.canonicalSkills.get('fastify');
      assert.ok(fastify, 'Fastify must exist');
      assert.equal(fastify.scope, RESUME_SKILL_SCOPES.PROJECT_SCOPED);

      // 4. TypeScript appears only in Skills -> GLOBAL
      const ts = graph.canonicalSkills.get('typescript');
      assert.ok(ts, 'TypeScript must exist');
      assert.equal(ts.scope, RESUME_SKILL_SCOPES.GLOBAL);
    });

    it('should emit 1 cohesive project claim and 1 cohesive experience claim without duplicate bullet claim rows', () => {
      const rawSections = [
        {
          sectionType: 'WORK_EXPERIENCE',
          heading: 'Experience',
          structuredData: {
            experiences: [
              {
                role: 'Full Stack Developer Intern',
                company: 'FTV Saloon',
                dates: 'Jun 2024 - Present',
                location: 'Remote',
                bullets: [
                  'Developed RESTful APIs with Node.js and Express.',
                  'Implemented RBAC security middleware and integrated Docker containerization.',
                  'Automated CI/CD deployment pipelines using GitHub Actions.',
                ],
              },
            ],
          },
        },
        {
          sectionType: 'PROJECTS',
          heading: 'Projects',
          structuredData: {
            projects: [
              {
                title: 'AI Code Review Assistant',
                technologies: ['FastAPI', 'Python', 'Docker'],
                bullets: [
                  'Architected AI code reviewer with FastAPI.',
                  'Deployed with Docker containers.',
                ],
                urls: ['https://github.com/test/ai-reviewer'],
              },
            ],
          },
        },
      ];

      const graph = ResumeEntityResolver.resolveCanonicalGraph(rawSections);

      // Claims inspection
      const claims = graph.candidateClaims;

      // Exactly 1 EXPERIENCE claim for FTV Saloon (not 4 fragmented claims)
      const expClaims = claims.filter((c) => c.claimType === 'EXPERIENCE');
      assert.equal(expClaims.length, 1);
      assert.ok(expClaims[0].statement.includes('Full Stack Developer Intern at FTV Saloon'));
      assert.ok(expClaims[0].metadata.technologiesUsed.length > 0);

      // Exactly 1 PROJECT claim for AI Code Review Assistant (not 3 fragmented claims)
      const projClaims = claims.filter((c) => c.claimType === 'PROJECT');
      assert.equal(projClaims.length, 1);
      assert.ok(projClaims[0].statement.includes('AI Code Review Assistant'));
      assert.ok(projClaims[0].metadata.technologies.length > 0);

      // Skills used in experience should be classified as EXPERIENCE_SCOPED
      const nodejs = graph.canonicalSkills.get('node-js');
      assert.ok(nodejs);
      assert.equal(nodejs.scope, RESUME_SKILL_SCOPES.EXPERIENCE_SCOPED);
    });

    it('should resolve cohesive education and contact info', () => {
      const rawSections = [
        {
          sectionType: 'CONTACT_INFO',
          heading: 'Contact Info',
          structuredData: {
            name: 'Jane Doe',
            email: 'jane@example.com',
            github: 'github.com/janedoe',
          },
        },
        {
          sectionType: 'EDUCATION',
          heading: 'Education',
          structuredData: {
            degrees: ['B.S. Computer Science | Stanford University | 2024'],
          },
        },
      ];

      const graph = ResumeEntityResolver.resolveCanonicalGraph(rawSections);

      assert.equal(graph.canonicalContact.name, 'Jane Doe');
      assert.equal(graph.canonicalContact.email, 'jane@example.com');
      assert.equal(graph.canonicalEducation.length, 1);
      assert.equal(graph.canonicalEducation[0].institution, 'Stanford University');
      assert.equal(graph.canonicalEducation[0].degree, 'B.S. Computer Science');

      const eduClaims = graph.candidateClaims.filter((c) => c.claimType === 'EDUCATION');
      assert.equal(eduClaims.length, 1);
      assert.equal(eduClaims[0].statement, 'B.S. Computer Science — Stanford University');
    });
  });
});
