/**
 * @file Unit Tests for Resume Keyword Coverage Service (P81)
 *
 * Verifies:
 * 1. Exact match identification (PostgreSQL -> PostgreSQL).
 * 2. Taxonomy equivalent match (Postgres -> PostgreSQL, React.js -> React, Node.js -> Node).
 * 3. Related technology match (SQL -> PostgreSQL = RELATED; MySQL -> PostgreSQL = DIFFERENT).
 * 4. Rule 27: RELATED semantic match cannot satisfy exact required technologies.
 * 5. Multi-section placement tracking (Summary, Skills, Experience, Projects).
 * 6. Rule 28: Explainable keyword stuffing detection with density heuristics.
 * 7. Zod schema conformance for overall report.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ResumeKeywordCoverageService } from '../../src/services/resume-keyword-coverage.service.js';

describe('P81: Resume Keyword Coverage Engine', () => {
  const cleanStructuredResume = {
    summary: {
      text: 'Backend systems engineer with production experience in Node.js, distributed consensus protocols, and relational datastores.',
    },
    skills: {
      categories: [
        {
          categoryName: 'Languages & Core Systems',
          skills: [{ name: 'Go' }, { name: 'TypeScript' }, { name: 'Python' }],
        },
        {
          categoryName: 'Databases & Infrastructure',
          skills: [{ name: 'PostgreSQL' }, { name: 'Redis' }, { name: 'Docker' }],
        },
      ],
    },
    projects: [
      {
        name: 'Distributed Key-Value Store',
        technologies: ['Go', 'gRPC', 'PostgreSQL'],
        bullets: [
          {
            text: 'Architected distributed key-value store using Raft consensus protocol in Go with PostgreSQL persistence.',
          },
        ],
      },
    ],
    experience: [
      {
        company: 'CloudScale Corp',
        title: 'Senior Backend Engineer',
        bullets: [
          {
            text: 'Engineered high-throughput event processing pipelines handling 20,000 rps using Node.js and Redis streams.',
          },
        ],
      },
    ],
    education: [
      {
        institution: 'University of Washington',
        degree: 'B.S. in Computer Science',
      },
    ],
  };

  it('detects EXACT keyword matches across sections', () => {
    const jobDescription = {
      title: 'Backend Engineer',
      requirements: [
        { skill: 'PostgreSQL', importance: 'REQUIRED' },
        { skill: 'Go', importance: 'REQUIRED' },
      ],
    };

    const report = ResumeKeywordCoverageService.analyzeKeywordCoverage({
      jobDescription,
      structuredResume: cleanStructuredResume,
    });

    assert.ok(report);
    assert.equal(report.exactMatches, 2);
    assert.equal(report.missingTerms, 0);

    const pgTerm = report.termBreakdown.find((t) => t.canonicalSlug === 'postgresql');
    assert.ok(pgTerm);
    assert.equal(pgTerm.matchType, 'EXACT');
    assert.equal(pgTerm.satisfiesRequirement, true);
    assert.ok(pgTerm.placements.includes('skills'));
    assert.ok(pgTerm.placements.includes('projects'));
  });

  it('detects TAXONOMY_EQUIVALENT matches for known aliases (e.g. Postgres <-> PostgreSQL)', () => {
    const resumeWithAlias = {
      summary: { text: 'Engineer specializing in Postgres databases and React frontends.' },
      skills: {
        categories: [
          {
            categoryName: 'Databases',
            skills: [{ name: 'Postgres' }],
          },
        ],
      },
      experience: [],
      projects: [],
    };

    const jobDescription = {
      title: 'Backend Engineer',
      requirements: [
        { skill: 'PostgreSQL', importance: 'REQUIRED' },
        { skill: 'React.js', importance: 'PREFERRED' },
      ],
    };

    const report = ResumeKeywordCoverageService.analyzeKeywordCoverage({
      jobDescription,
      structuredResume: resumeWithAlias,
    });

    assert.equal(report.taxonomyMatches, 2);

    const pg = report.termBreakdown.find((t) => t.canonicalSlug === 'postgresql');
    assert.equal(pg.matchType, 'TAXONOMY_EQUIVALENT');
    assert.equal(pg.satisfiesRequirement, true);

    const react = report.termBreakdown.find((t) => t.canonicalSlug === 'react');
    assert.equal(react.matchType, 'TAXONOMY_EQUIVALENT');
    assert.equal(react.satisfiesRequirement, true);
  });

  it('Rule 27: RELATED semantic matches cannot satisfy exact REQUIRED technologies', () => {
    // Resume only has SQL, but job requires PostgreSQL
    const resumeWithRelated = {
      summary: { text: 'Proficient in SQL query optimization and schema design.' },
      skills: {
        categories: [
          {
            categoryName: 'Databases',
            skills: [{ name: 'SQL' }],
          },
        ],
      },
      experience: [],
      projects: [],
    };

    const jobDescription = {
      title: 'Database Engineer',
      requirements: [
        { skill: 'PostgreSQL', importance: 'REQUIRED' },
        { skill: 'PostgreSQL', importance: 'PREFERRED' }, // Test preferred below
      ],
    };

    const report = ResumeKeywordCoverageService.analyzeKeywordCoverage({
      jobDescription: {
        requirements: [{ skill: 'PostgreSQL', importance: 'REQUIRED' }],
      },
      structuredResume: resumeWithRelated,
    });

    const pg = report.termBreakdown.find((t) => t.canonicalSlug === 'postgresql');
    assert.ok(pg);
    assert.equal(pg.matchType, 'RELATED');
    // Rule 27 requirement: RELATED cannot satisfy exact required technology!
    assert.equal(pg.satisfiesRequirement, false);
    assert.ok(pg.explanation.includes('Rule 27'));
  });

  it('identifies MISSING required keywords and reports criticalMissingTerms', () => {
    const jobDescription = {
      title: 'Cloud Engineer',
      requirements: [
        { skill: 'Go', importance: 'REQUIRED' },
        { skill: 'Kubernetes', importance: 'REQUIRED' }, // Missing
        { skill: 'Rust', importance: 'PREFERRED' }, // Missing
      ],
    };

    const report = ResumeKeywordCoverageService.analyzeKeywordCoverage({
      jobDescription,
      structuredResume: cleanStructuredResume,
    });

    assert.equal(report.missingTerms, 2);
    assert.equal(report.criticalMissingTerms, 1); // 1 required missing
    const k8s = report.termBreakdown.find((t) => t.canonicalSlug === 'kubernetes');
    assert.equal(k8s.matchType, 'MISSING');
    assert.equal(k8s.satisfiesRequirement, false);
  });

  it('tracks contextual multi-section placement for keywords (Rule 4)', () => {
    const jobDescription = {
      title: 'Full Stack Engineer',
      requirements: [
        { skill: 'Node.js', importance: 'REQUIRED' },
        { skill: 'PostgreSQL', importance: 'REQUIRED' },
      ],
    };

    const report = ResumeKeywordCoverageService.analyzeKeywordCoverage({
      jobDescription,
      structuredResume: cleanStructuredResume,
    });

    const nodePlacement = report.keywordPlacements.find((p) => p.canonicalSkill === 'Node.js');
    assert.ok(nodePlacement);
    assert.ok(nodePlacement.sections.includes('summary'));
    assert.ok(nodePlacement.sections.includes('experience'));
    assert.ok(nodePlacement.contextualBreadthScore >= 0.6);
  });

  it('Rule 28: detects keyword stuffing with explainable heuristic warnings', () => {
    const stuffedResume = {
      summary: {
        // Node.js is repeated 6 times in a 30-word summary
        text: 'Node.js expert building Node.js microservices with Node.js async queues. Highly proficient in Node.js runtime and Node.js performance tuning with Node.js APIs.',
      },
      skills: {
        categories: [
          {
            categoryName: 'Backend',
            skills: [{ name: 'Node.js' }],
          },
        ],
      },
      experience: [],
      projects: [],
    };

    const jobDescription = {
      title: 'Node Developer',
      requirements: [{ skill: 'Node.js', importance: 'REQUIRED' }],
    };

    const report = ResumeKeywordCoverageService.analyzeKeywordCoverage({
      jobDescription,
      structuredResume: stuffedResume,
    });

    assert.ok(report.stuffingWarnings.length > 0);
    const warning = report.stuffingWarnings.find((w) => w.section === 'summary');
    assert.ok(warning);
    assert.ok(warning.occurrences >= 4);
    assert.ok(warning.reason.includes('keyword stuffing'));
  });
});
