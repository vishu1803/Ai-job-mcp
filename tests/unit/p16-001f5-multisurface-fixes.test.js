/**
 * @file Unit Tests: P16-001F-5 Multi-Surface Fixes
 *
 * Regression coverage for the four P16-001F-5 diagnostic findings:
 *
 * Fix 1 — Requirement matches: extension.routes serializer maps the MCP
 *         `requirementMatches` contract (matchStatus/normalizedRequirement)
 *         onto the extension's consumer fields (matches/partialMatches/
 *         missingRequirements) instead of reading fields that never existed.
 * Fix 2 — Greenhouse title extraction: current Greenhouse boards nest
 *         div.job__location INSIDE the title block; the wrapper textContent
 *         glued location into the title. A detached clone is used so the
 *         live DOM is never mutated.
 * Fix 3 — Project URLs: profile view resolves linked resource URLs
 *         (REPOSITORY → repositoryUrl, PORTFOLIO_SITE/DOCUMENT → liveUrl)
 *         and reconcileCandidateProjects() propagates them end-to-end.
 * Fix 4 — Metadata fallbacks: profile-only reconcile branch prefers
 *         candidate-owned metadata bullets/technologies/description over
 *         evidence-derived synthesis.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GreenhouseAdapter } from '../../extension/job-detection/adapters/greenhouse.adapter.js';
import { serializeRequirementMatchesForExtension } from '../../src/routes/extension.routes.js';
import { reconcileCandidateProjects } from '../../src/services/candidate-artifact-content.service.js';

// ============================================================================
// Fix 1 — Requirement matches serialization
// ============================================================================

describe('P16-001F-5 Fix 1: requirement matches serialization', () => {
  const MCP_SHAPE = {
    overallFit: { atsScore: 78, fitGrade: 'B', recommendation: 'MODERATE_FIT' },
    requirementMatches: [
      {
        normalizedRequirement: '5+ years building backend services',
        matchStatus: 'MATCHED',
        category: 'EXPERIENCE',
        explanation: '6 years verified from repository history',
        matchConfidence: 0.92,
      },
      {
        normalizedRequirement: 'Experience with distributed systems',
        matchStatus: 'PARTIAL',
        category: 'SKILL',
        explanation: 'Single-service production experience only',
        matchConfidence: 0.55,
      },
      {
        normalizedRequirement: 'Kubernetes production experience',
        matchStatus: 'MISSING',
        category: 'SKILL',
        explanation: 'No evidence found',
        matchConfidence: 0.1,
      },
    ],
  };

  it('maps requirementMatches onto matches/partialMatches/missingRequirements', () => {
    const out = serializeRequirementMatchesForExtension(MCP_SHAPE);
    assert.equal(out.matches.length, 1);
    assert.equal(out.matches[0].requirement, '5+ years building backend services');
    assert.equal(out.matches[0].status, 'MATCHED');
    assert.equal(out.partialMatches.length, 1);
    assert.equal(out.partialMatches[0].requirement, 'Experience with distributed systems');
    assert.equal(out.missingRequirements.length, 1);
    assert.equal(out.missingRequirements[0].requirement, 'Kubernetes production experience');
  });

  it('maps consumer-facing fields (requirement/status/category/explanation/confidence)', () => {
    const out = serializeRequirementMatchesForExtension(MCP_SHAPE);
    const m = out.matches[0];
    assert.equal(m.status, 'MATCHED');
    assert.equal(m.category, 'EXPERIENCE');
    assert.equal(m.explanation, '6 years verified from repository history');
    assert.equal(m.matchConfidence, 0.92);
  });

  it('returns empty arrays for null/absent fitAnalysis (no throw)', () => {
    for (const input of [null, undefined, {}]) {
      const out = serializeRequirementMatchesForExtension(input);
      assert.deepEqual(out, {
        matches: [],
        partialMatches: [],
        missingRequirements: [],
        hardBlockers: [],
      });
    }
  });

  it('does not surface UNKNOWN statuses as missing or blocking', () => {
    const out = serializeRequirementMatchesForExtension({
      requirementMatches: [{ normalizedRequirement: 'Ambiguous', matchStatus: 'UNKNOWN' }],
    });
    assert.equal(out.matches.length, 0);
    assert.equal(out.partialMatches.length, 0);
    assert.equal(out.missingRequirements.length, 0);
    assert.equal(out.hardBlockers.length, 0);
  });
});

// ============================================================================
// Fix 2 — Greenhouse title/location separation
// ============================================================================

describe('P16-001F-5 Fix 2: greenhouse title extraction', () => {
  /**
   * Builds a minimal DOM-like element graph replicating the current
   * Greenhouse structure: div.job__title CONTAINS h1 + div.job__location.
   * textContent is computed from children (like a real DOM), so removal on a
   * detached clone is observable while the live wrapper stays untouched.
   */
  function buildNestedTitleDocument() {
    const h1 = {
      textContent: 'Software Engineer, Agent',
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    const location = {
      textContent: 'Hybrid - New York City',
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    const liveChildren = [h1, location];
    const joinText = (children) => children.map((c) => c.textContent).join('');
    let cloneStripped = false;

    const titleWrapper = {
      get textContent() {
        return joinText(liveChildren);
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      cloneNode: () => {
        const cloneChildren = liveChildren.slice();
        return {
          get textContent() {
            return joinText(cloneChildren);
          },
          querySelectorAll: (selector) => {
            if (selector === '.job__location, .location') {
              return [
                {
                  remove() {
                    const idx = cloneChildren.indexOf(location);
                    if (idx >= 0) cloneChildren.splice(idx, 1);
                    cloneStripped = true;
                  },
                },
              ];
            }
            return [];
          },
        };
      },
    };
    return { doc: titleWrapper, isStripped: () => cloneStripped };
  }

  it('extracts clean title when location is nested inside the title block', () => {
    const { doc } = buildNestedTitleDocument();
    const payload = GreenhouseAdapter.extract(
      {
        body: { textContent: '' },
        querySelector: (selector) => (selector === '.job__title' ? doc : null),
        querySelectorAll: () => [],
      },
      'https://job-boards.greenhouse.io/vercel/jobs/5704320004'
    );
    assert.equal(payload.title, 'Software Engineer, Agent');
    assert.ok(!payload.title.includes('Hybrid'), 'title must not contain location text');
  });

  it('does not mutate the live DOM', () => {
    const { doc, isStripped } = buildNestedTitleDocument();
    GreenhouseAdapter.extract(
      {
        body: { textContent: '' },
        querySelector: (selector) => (selector === '.job__title' ? doc : null),
        querySelectorAll: () => [],
      },
      'https://job-boards.greenhouse.io/vercel/jobs/5704320004'
    );
    assert.equal(
      doc.textContent,
      'Software Engineer, AgentHybrid - New York City',
      'live wrapper textContent must remain untouched'
    );
    assert.ok(isStripped(), 'stripping must occur on the detached clone only');
  });

  it('legacy flat title element (no nested location) still extracts verbatim', () => {
    const flatTitle = {
      textContent: 'Senior Backend Engineer',
      cloneNode: () => ({
        textContent: 'Senior Backend Engineer',
        querySelectorAll: () => [],
      }),
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    const payload = GreenhouseAdapter.extract(
      {
        body: { textContent: '' },
        querySelector: (selector) => (selector === '.job__title' ? flatTitle : null),
        querySelectorAll: () => [],
      },
      'https://boards.greenhouse.io/acmecorp/jobs/1'
    );
    assert.equal(payload.title, 'Senior Backend Engineer');
  });

  it('mock element without cloneNode support still extracts (back-compat)', () => {
    const stubTitle = { textContent: 'Plain Title' };
    const payload = GreenhouseAdapter.extract(
      {
        body: { textContent: '' },
        querySelector: (selector) => (selector === '.job__title' ? stubTitle : null),
        querySelectorAll: () => [],
      },
      'https://boards.greenhouse.io/acmecorp/jobs/2'
    );
    assert.equal(payload.title, 'Plain Title');
  });
});

// ============================================================================
// Fix 3 — Project URL propagation through reconciliation
// ============================================================================

describe('P16-001F-5 Fix 3: project URL propagation', () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const PDE_ID = '95a13c93-a198-4473-bf64-5b8a50cbd3b9';

  it('profile project top-level repositoryUrl flows through reconciliation', () => {
    const reconciled = reconcileCandidateProjects({
      profileProjects: [
        {
          id: PDE_ID,
          name: 'Product-Data-Explorer',
          repositoryUrl: 'https://github.com/vishu1803/Product-Data-Explorer',
          liveUrl: 'https://product-data-explorer.vercel.app',
          technologies: ['JavaScript', 'React'],
        },
      ],
    });
    assert.equal(reconciled.length, 1);
    assert.equal(reconciled[0].repositoryUrl, 'https://github.com/vishu1803/Product-Data-Explorer');
    assert.equal(reconciled[0].liveUrl, 'https://product-data-explorer.vercel.app');
  });

  it('metadata.sourceUrl remains a valid fallback for repositoryUrl', () => {
    const reconciled = reconcileCandidateProjects({
      profileProjects: [
        {
          name: 'Metadata Sourced Project',
          metadata: { sourceUrl: 'https://github.com/vishu1803/some-repo' },
        },
      ],
    });
    assert.equal(reconciled[0].repositoryUrl, 'https://github.com/vishu1803/some-repo');
  });

  it('merge branch propagates liveUrl into a curated resumeData entry', () => {
    const reconciled = reconcileCandidateProjects({
      resumeDataProjects: [
        {
          title: 'Collaborative Task Manager',
          bullets: ['Built real-time task sync'],
          technologies: ['Node.js'],
        },
      ],
      profileProjects: [
        {
          name: 'Collaborative-Task-Manager',
          liveUrl: 'https://collab-task-manager.demo.app',
        },
      ],
    });
    const ctm = reconciled.find((p) => p.slug === 'collaborativetaskmanager');
    assert.ok(ctm, 'merged entry must exist');
    assert.equal(ctm.liveUrl, 'https://collab-task-manager.demo.app');
  });

  it('project identity (id) is still preserved alongside URLs', () => {
    const reconciled = reconcileCandidateProjects({
      profileProjects: [
        {
          id: PDE_ID,
          name: 'Product-Data-Explorer',
          repositoryUrl: 'https://github.com/vishu1803/Product-Data-Explorer',
        },
      ],
    });
    assert.ok(UUID_RE.test(reconciled[0].id || ''), 'P16-001F-3B id propagation must not regress');
  });
});

// ============================================================================
// Fix 4 — Candidate-owned metadata over synthesis
// ============================================================================

describe('P16-001F-5 Fix 4: candidate-owned metadata fallbacks', () => {
  it('metadata.bullets are used when top-level bullets are absent', () => {
    const reconciled = reconcileCandidateProjects({
      profileProjects: [
        {
          name: 'Metadata Bullets Project',
          metadata: {
            bullets: ['Authored the ingestion pipeline', 'Shipped the React dashboard'],
          },
        },
      ],
    });
    assert.equal(reconciled[0].bullets.length, 2);
    assert.equal(reconciled[0].bullets[0], 'Authored the ingestion pipeline');
    assert.equal(reconciled[0].bullets[1], 'Shipped the React dashboard');
  });

  it('top-level bullets win over metadata bullets (candidate-owned first)', () => {
    const reconciled = reconcileCandidateProjects({
      profileProjects: [
        {
          name: 'Precedence Project',
          bullets: ['Top-level curated bullet'],
          metadata: { bullets: ['Metadata fallback bullet'] },
        },
      ],
    });
    assert.deepEqual(reconciled[0].bullets, ['Top-level curated bullet']);
  });

  it('metadata.technologies are used when top-level technologies are absent', () => {
    const reconciled = reconcileCandidateProjects({
      profileProjects: [
        {
          name: 'Metadata Tech Project',
          metadata: { technologies: ['Rust', 'Raft'] },
        },
      ],
    });
    const lowered = reconciled[0].technologies.map((t) => String(t).toLowerCase());
    assert.ok(lowered.includes('rust'), 'Rust must reach the tech line');
    assert.ok(lowered.includes('raft'), 'Raft must reach the tech line');
  });

  it('metadata.description is used as summary when summary/headline absent', () => {
    const reconciled = reconcileCandidateProjects({
      profileProjects: [
        {
          name: 'Metadata Summary Project',
          metadata: { description: 'Candidate-authored project description' },
        },
      ],
    });
    assert.equal(reconciled[0].summary, 'Candidate-authored project description');
  });

  it('bullet-less projects with candidate highlights collect authentic bullets', () => {
    const reconciled = reconcileCandidateProjects({
      profileProjects: [
        {
          name: 'Synthesis Only Project',
          technologies: ['NestJS', 'PostgreSQL', 'TypeORM', 'Redis'],
          highlights: ['Engineered scalable backend services with NestJS, PostgreSQL, TypeORM, and Redis.'],
        },
      ],
    });
    const proj = reconciled[0];
    assert.ok(
      (proj.bullets || []).length > 0,
      'groundAndSanitizeProject must collect candidate highlights for bullet-less projects'
    );
    assert.ok(
      proj.bullets[0].includes('NestJS'),
      'collected bullets must preserve the authentic tech stack'
    );
  });
});
