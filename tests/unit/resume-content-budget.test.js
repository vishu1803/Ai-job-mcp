import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HARD_CONSTRAINTS,
  SOFT_TARGETS,
  OPTIONAL_SECTIONS_POLICY,
  calculateSemanticOverlap,
  ResumeContentBudgetService,
} from '../../src/services/resume-content-budget.service.js';

describe('Central Resume Content Budget Policy Service', () => {
  it('exposes immutable HARD constraints enforcing one A4 page and quality bounds', () => {
    assert.equal(HARD_CONSTRAINTS.PAGE_MODE, 'ONE_PAGE');
    assert.equal(HARD_CONSTRAINTS.PAPER_SIZE, 'A4');
    assert.equal(HARD_CONSTRAINTS.MINIMUM_FONT_PT, 10.0);
    assert.equal(HARD_CONSTRAINTS.MINIMUM_PROJECTS_WHEN_AVAILABLE, 2);
    assert.equal(HARD_CONSTRAINTS.MAXIMUM_PROJECTS, 3);
    assert.equal(HARD_CONSTRAINTS.ZERO_FABRICATION, true);
    assert.equal(HARD_CONSTRAINTS.ALLOW_SENTENCE_TRUNCATION, false);
    assert.equal(HARD_CONSTRAINTS.MAX_PAGES, 1);
  });

  it('exposes defined SOFT targets for header, summary, skills, projects, and geometry', () => {
    assert.equal(SOFT_TARGETS.HEADER.ROWS, 4);
    assert.equal(SOFT_TARGETS.SUMMARY.PREFERRED_WORD_COUNT_MIN, 40);
    assert.equal(SOFT_TARGETS.SUMMARY.PREFERRED_WORD_COUNT_MAX, 70);
    assert.equal(SOFT_TARGETS.SUMMARY.MAX_WORD_COUNT, 80);
    assert.equal(SOFT_TARGETS.TECHNICAL_SKILLS.PREFERRED_CATEGORIES_MIN, 4);
    assert.equal(SOFT_TARGETS.TECHNICAL_SKILLS.PREFERRED_CATEGORIES_MAX, 6);
    assert.equal(SOFT_TARGETS.TECHNICAL_SKILLS.PREFERRED_VISIBLE_SKILLS_MIN, 12);
    assert.equal(SOFT_TARGETS.TECHNICAL_SKILLS.PREFERRED_VISIBLE_SKILLS_MAX, 24);
    assert.equal(SOFT_TARGETS.TECHNICAL_PROJECTS.MIN_PROJECTS, 2);
    assert.equal(SOFT_TARGETS.TECHNICAL_PROJECTS.MAX_PROJECTS, 3);
    assert.equal(SOFT_TARGETS.TECHNICAL_PROJECTS.BULLETS_PER_PROJECT_MIN, 2);
    assert.equal(SOFT_TARGETS.TECHNICAL_PROJECTS.BULLETS_PER_PROJECT_MAX, 3);
    assert.equal(SOFT_TARGETS.PROFESSIONAL_EXPERIENCE.PRESERVE_AUTHENTIC_METRICS, true);
    assert.equal(SOFT_TARGETS.PAGE_GEOMETRY.TOP_MARGIN_MM_TARGET_MIN, 12.0);
    assert.equal(SOFT_TARGETS.PAGE_GEOMETRY.TOP_MARGIN_MM_TARGET_MAX, 16.0);
    assert.equal(SOFT_TARGETS.PAGE_GEOMETRY.BOTTOM_MARGIN_MM_TARGET_MIN, 12.0);
    assert.equal(SOFT_TARGETS.PAGE_GEOMETRY.BOTTOM_MARGIN_MM_TARGET_MAX, 18.0);
  });

  it('calculates semantic Jaccard overlap between text strings', () => {
    const identical = calculateSemanticOverlap(
      'Engineered scalable REST APIs with Node.js and PostgreSQL',
      'Engineered scalable REST APIs with Node.js and PostgreSQL'
    );
    assert.equal(identical, 1.0);

    const unrelated = calculateSemanticOverlap(
      'Engineered scalable REST APIs with Node.js',
      'Completed coursework in digital signal processing and microprocessors'
    );
    assert.ok(unrelated < 0.2);

    const partial = calculateSemanticOverlap(
      'Engineered scalable REST APIs using Node.js and Express',
      'Designed and implemented robust RESTful APIs using Node.js'
    );
    assert.ok(partial > 0.3 && partial < 0.9);
  });

  it('detects cross-section redundancy when summary duplicates experience bullets', () => {
    const duplicateResume = {
      summary: {
        text: 'Optimized critical backend database queries and frontend asset loading, resulting in a 40% reduction in page load time. Designed and implemented robust RESTful APIs.',
      },
      experience: [
        {
          company: 'FTV Saloon',
          bullets: [
            {
              text: 'Optimized critical backend database queries and frontend asset loading, resulting in a 40% reduction in page load time.',
            },
            { text: 'Designed and implemented robust RESTful APIs for core salon operations.' },
          ],
        },
      ],
      projects: [],
      skills: { categories: [] },
    };

    const redundancy = ResumeContentBudgetService.detectCrossSectionRedundancy(duplicateResume);
    assert.equal(redundancy.hasRedundancy, true);
    assert.ok(redundancy.duplicatePairs.length >= 1);
    assert.ok(redundancy.duplicatePairs.some((p) => p.sectionA === 'SUMMARY'));
  });

  it('passes redundancy check when summary provides high-level profile synthesis', () => {
    const cleanResume = {
      summary: {
        text: 'Software Engineer with hands-on experience designing full-stack web applications, scalable REST APIs, and database-backed services. Skilled in TypeScript, Node.js, and PostgreSQL with a focus on code modularity and reliable system delivery.',
      },
      experience: [
        {
          company: 'FTV Saloon',
          bullets: [
            {
              text: 'Optimized critical backend database queries and frontend asset loading, resulting in a 40% reduction in page load time.',
            },
            {
              text: 'Developed a secure authentication system featuring role-based access control (RBAC).',
            },
          ],
        },
      ],
      projects: [
        {
          displayName: 'Product Data Explorer',
          bullets: [
            {
              text: 'Architected full-stack product explorer with Next.js 14 frontend and server-side rendering.',
            },
            {
              text: 'Engineered modular NestJS backend with TypeORM, PostgreSQL persistence, and Redis caching.',
            },
          ],
        },
      ],
      skills: { categories: [] },
    };

    const redundancy = ResumeContentBudgetService.detectCrossSectionRedundancy(cleanResume);
    assert.equal(redundancy.hasRedundancy, false);
    assert.equal(redundancy.duplicatePairs.length, 0);
  });

  it('generates a detailed per-section content budget report', () => {
    const resume = {
      candidateIdentity: {
        fullName: 'Vishwanath Nishad',
        headline: 'Full-Stack & Backend Developer',
      },
      summary: {
        text: 'Software Engineer with extensive experience designing full-stack web applications, scalable REST APIs, and database-backed microservices. Skilled in TypeScript, Node.js, and PostgreSQL with a strong focus on modular architecture, clean testing discipline, and high-throughput production delivery across modern cloud environments.',
      },
      skills: {
        categories: [
          {
            categoryName: 'Languages',
            skills: [{ name: 'TypeScript' }, { name: 'JavaScript' }, { name: 'Python' }],
          },
          {
            categoryName: 'Backend & APIs',
            skills: [{ name: 'Node.js' }, { name: 'NestJS' }, { name: 'Express' }],
          },
          {
            categoryName: 'Databases & ORMs',
            skills: [{ name: 'PostgreSQL' }, { name: 'Prisma' }, { name: 'Redis' }],
          },
          {
            categoryName: 'Frontend & Web',
            skills: [{ name: 'React' }, { name: 'Next.js' }, { name: 'Tailwind CSS' }],
          },
        ],
      },
      projects: [
        {
          displayName: 'Product Data Explorer',
          technologies: ['TypeScript', 'NestJS', 'PostgreSQL'],
          bullets: [
            {
              text: 'Architected full-stack product explorer with Next.js 14 frontend and server-side rendering.',
            },
            {
              text: 'Engineered modular NestJS backend with TypeORM, PostgreSQL persistence, and Redis caching.',
            },
          ],
        },
        {
          displayName: 'Collaborative Task Manager',
          technologies: ['TypeScript', 'Node.js', 'Prisma'],
          bullets: [
            {
              text: 'Built a secure full-stack task management platform with JWT authentication and role-based access control.',
            },
            {
              text: 'Designed and implemented high-performance RESTful CRUD APIs using Node.js and Prisma ORM.',
            },
          ],
        },
      ],
      experience: [
        {
          company: 'FTV Saloon',
          title: 'Full Stack Developer Intern',
          bullets: [
            {
              text: 'Designed and implemented robust RESTful APIs for core salon operations, ensuring reliable data consistency.',
            },
            {
              text: 'Developed a secure authentication system featuring role-based access control (RBAC).',
            },
            {
              text: 'Optimized critical backend database queries and frontend asset loading, resulting in a 40% reduction in page load time.',
            },
          ],
        },
      ],
      education: [
        {
          institution: 'Rajkiya Engineering College | Sonbhadra',
          degree: 'Bachelor of Technology',
          fieldOfStudy: 'Electronics Engineering',
        },
      ],
      languages: [
        { language: 'English', proficiency: 'PROFESSIONAL' },
        { language: 'Hindi', proficiency: 'PROFESSIONAL' },
      ],
    };

    const report = ResumeContentBudgetService.generateSectionBudgetReport({
      structuredResume: resume,
      pageMeasurements: {
        pageCount: 1,
        minimumFontPt: 10.0,
        topMarginMm: 13.0,
        bottomMarginMm: 15.0,
      },
    });

    assert.equal(report.hardConstraints.pageCountStatus, 'PASS');
    assert.equal(report.hardConstraints.fontFloorStatus, 'PASS');
    assert.equal(report.hardConstraints.projectCountStatus, 'PASS');
    assert.equal(report.sections.HEADER.rowsExpected, 4);
    assert.equal(report.sections.SUMMARY.status, 'PASS');
    assert.equal(report.sections.TECHNICAL_SKILLS.categoryCount, 4);
    assert.equal(report.sections.TECHNICAL_SKILLS.status, 'PASS');
    assert.equal(report.sections.TECHNICAL_SKILLS.totalSkillsCount, 12);
    assert.equal(report.sections.EXPERIENCE.roles[0].hasQuantitativeMetric, true);
    assert.equal(report.redundancyAudit.hasRedundancy, false);
  });
});
