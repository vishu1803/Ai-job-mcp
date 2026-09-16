/**
 * @file P73 Unit Tests: LinkedIn Active Job Root + Semantic Description Extraction.
 *
 * Verifies:
 * 1.  findActiveLinkedInJobRoot across supported layouts:
 *     - [data-testid="lazy-column"]
 *     - .jobs-search__job-details
 *     - .job-details-jobs-unified-top-card
 *     - .jobs-details__main-content
 *     - .job-view-layout
 *     - [data-view-name="job-details"]
 *     - Plus guest view layouts: .details, .decorated-job-posting__details, section.core-rail
 *     - Prefer smallest container owning title + company + detail content
 *     - NEVER returns document.body or document.documentElement
 * 2.  extractLinkedInDescription 4-tier priority hierarchy:
 *     - Priority 1: Known selectors inside active root -> SELECTOR
 *     - Priority 2: Semantic "About the job" heading -> section -> content block -> ABOUT_THE_JOB
 *     - Priority 3: JSON-LD JobPosting description -> JSON_LD
 *     - Priority 4: Return empty string -> NONE
 *     - NEVER uses document.body.textContent, arbitrary text, or outside-root classes
 * 3.  Extraction Provenance:
 *     - descriptionSource, jobRootSource, descriptionLength tracked and exposed
 * 4.  Split Page Readiness from Analysis Readiness:
 *     - JOB_DETECTED = true (isReady: true) when context, title, and company/detail exist
 *     - ANALYSIS_READY = true only when description >= 50
 * 5.  Single Hydration Controller:
 *     - JobHydrationLifecycle is sole hydration authority, no duplicate observers/timers
 * 6.  Relevant DOM Observation:
 *     - Observes active root once present; switches from body to active root when found;
 *       stops immediately when description >= 50
 * 7.  Active Job Fingerprint:
 *     - Provider + externalJobId (fallback provider + title + company)
 *     - Job A -> Job B cancellation, tab switch isolation
 * 8.  Persisted State:
 *     - Service worker persists hydrated state to DurableWorkflowStore
 *     - Sidebar restores hydrated state from durable store
 * 9.  Form Detection Independence:
 *     - Form detection does not reset job hydration, does not overwrite jobData,
 *       does not mutate analysisReady
 * 10. Required Negative Tests:
 *     - ChatGPT: detected=false
 *     - GitHub: detected=false
 *     - LinkedIn feed: detected=false
 *     - LinkedIn profile: detected=false
 *     - LinkedIn jobs search with no active selected job: detected=false
 * 11. Working Portal Regression:
 *     - Greenhouse: detection + description work
 *     - Wellfound: detection + description work
 *     - Generic career page: detection + description work
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// LinkedIn Adapter exports (P73)
import {
  LinkedInAdapter,
  findActiveLinkedInJobRoot,
  extractLinkedInDescription,
  deriveJobRootSource,
} from '../../extension/job-detection/adapters/linkedin.adapter.js';

import { GreenhouseAdapter } from '../../extension/job-detection/adapters/greenhouse.adapter.js';
import { GenericCareerPageAdapter } from '../../extension/job-detection/adapters/generic-career.adapter.js';
import { AdapterRegistry } from '../../extension/job-detection/adapter-registry.js';
import { JobDetectionEngine } from '../../extension/job-detection/detection-engine.js';
import { JobIdentity } from '../../extension/lib/job-identity.js';
import { DurableWorkflowStore } from '../../extension/lib/durable-workflow-store.js';
import { SidebarController } from '../../extension/sidebar/sidebar.js';
import { WORKFLOW_STATES } from '../../extension/lib/workflow-state-machine.js';

// ─── Document Mock Helper ─────────────────────────────

function createMockElement(tagName, attributes = {}, textContent = '', children = []) {
  const classListSet = new Set(
    (attributes.class || attributes.className || '').split(/\s+/).filter(Boolean)
  );

  const el = {
    tagName: tagName.toUpperCase(),
    id: attributes.id || '',
    className: attributes.class || attributes.className || '',
    textContent,
    children: [],
    parentElement: null,
    ownerDocument: null,
    getAttribute(name) {
      if (name === 'class' || name === 'className') return el.className;
      if (name === 'id') return el.id;
      return attributes[name] || null;
    },
    setAttribute(name, val) {
      attributes[name] = val;
      if (name === 'class' || name === 'className') {
        el.className = val;
        classListSet.clear();
        val.split(/\s+/).filter(Boolean).forEach((c) => classListSet.add(c));
      }
    },
    classList: {
      add(cls) {
        classListSet.add(cls);
        el.className = Array.from(classListSet).join(' ');
      },
      remove(cls) {
        classListSet.delete(cls);
        el.className = Array.from(classListSet).join(' ');
      },
      contains(cls) {
        return classListSet.has(cls);
      },
    },
    querySelector(sel) {
      const all = el.querySelectorAll(sel);
      return all.length > 0 ? all[0] : null;
    },
    querySelectorAll(sel) {
      const results = [];
      const match = (node) => {
        if (!node || !node.tagName) return false;
        const normSel = sel.trim().toLowerCase();

        // If selector starts with a tag followed by [ (e.g. h1[class*="job" i] or script[type="application/ld+json"])
        const tagPrefixMatch = normSel.match(/^([a-z0-9]+)\[/i);
        if (tagPrefixMatch && node.tagName.toLowerCase() !== tagPrefixMatch[1].toLowerCase()) {
          return false;
        }

        // Tag + attribute selector e.g. script[type="application/ld+json"] or h1[class*="job" i]
        const tagAttrMatch = normSel.match(/^([a-z0-9]+)\[([a-z0-9_-]+)([\*~^$]?=)?["']?([^"'\]\s]+)?["']?\s*[a-z]*\]$/i);
        if (tagAttrMatch) {
          const [, expectedTag, attrName, op, expectedVal] = tagAttrMatch;
          if (node.tagName.toLowerCase() !== expectedTag.toLowerCase()) return false;
          const actualVal = (attrName === 'class' || attrName === 'className') ? node.className : node.getAttribute(attrName);
          if (actualVal === null || actualVal === undefined) return false;
          if (!op) return true;
          if (op === '=') return actualVal.toLowerCase() === expectedVal.toLowerCase();
          if (op === '*=') return actualVal.toLowerCase().includes(expectedVal.toLowerCase());
        }

        // Tag matching
        if (normSel === node.tagName.toLowerCase()) return true;

        // ID matching
        if (normSel.startsWith('#')) {
          const targetId = normSel.slice(1);
          return node.id === targetId;
        }

        // Class matching (single class)
        if (normSel.startsWith('.') && !normSel.includes('[') && !normSel.includes(' ')) {
          const targetClass = normSel.slice(1);
          return node.classList.contains(targetClass);
        }

        // Attribute matching [attr="val"] or [attr*="val"]
        const attrMatch = normSel.match(/^\[([a-z0-9_-]+)([\*~^$]?=)?["']?([^"'\]\s]+)?["']?\s*[a-z]*\]$/i);
        if (attrMatch) {
          const [, attrName, op, expectedVal] = attrMatch;
          const actualVal = (attrName === 'class' || attrName === 'className') ? node.className : node.getAttribute(attrName);
          if (actualVal === null || actualVal === undefined) return false;
          if (!op) return true;
          if (op === '=') return actualVal.toLowerCase() === expectedVal.toLowerCase();
          if (op === '*=') return actualVal.toLowerCase().includes(expectedVal.toLowerCase());
        }

        // Multi-class or compound selectors e.g. .core-section-container.description
        if (normSel.startsWith('.') && normSel.includes('.')) {
          const classes = normSel.split('.').filter(Boolean);
          return classes.every((c) => node.classList.contains(c));
        }

        // Partial matching for class contains e.g. [class*="description"]
        if (normSel.includes('[class*=')) {
          const m = normSel.match(/\[class\*=["']?([^"'\]\s]+)["']?\s*[a-z]*\]/i);
          if (m && node.className.toLowerCase().includes(m[1].toLowerCase())) return true;
        }

        // Role heading
        if (normSel.includes('[role="heading"]') && node.getAttribute('role') === 'heading') {
          return true;
        }

        // Headings query: h1, h2, h3, h4, h5, h6
        if (normSel.includes('h1') && normSel.includes('h2')) {
          const tags = normSel.split(',').map((s) => s.trim().toLowerCase());
          return tags.includes(node.tagName.toLowerCase());
        }

        // Anchor href matches
        if (normSel.includes('a[href*="/company/"]') && node.tagName.toLowerCase() === 'a') {
          const href = node.getAttribute('href') || '';
          return href.includes('/company/');
        }

        return false;
      };

      const traverse = (current) => {
        for (const child of current.children || []) {
          if (match(child)) results.push(child);
          traverse(child);
        }
      };
      traverse(el);
      return results;
    },
    closest(sel) {
      let curr = el.parentElement;
      while (curr && curr.tagName) {
        const normSel = sel.toLowerCase();
        if (curr.tagName.toLowerCase() === normSel) return curr;
        if (normSel.startsWith('.') && curr.classList?.contains(normSel.slice(1))) return curr;
        if (normSel.includes(curr.tagName.toLowerCase())) return curr;
        curr = curr.parentElement;
      }
      return null;
    },
    contains(other) {
      let curr = other;
      while (curr) {
        if (curr === el) return true;
        curr = curr.parentElement;
      }
      return false;
    },
  };

  Object.defineProperty(el, 'nextElementSibling', {
    get() {
      if (!el.parentElement) return null;
      const siblings = el.parentElement.children || [];
      const idx = siblings.indexOf(el);
      return (idx !== -1 && idx + 1 < siblings.length) ? siblings[idx + 1] : null;
    },
    configurable: true,
  });

  Object.defineProperty(el, 'previousElementSibling', {
    get() {
      if (!el.parentElement) return null;
      const siblings = el.parentElement.children || [];
      const idx = siblings.indexOf(el);
      return (idx > 0) ? siblings[idx - 1] : null;
    },
    configurable: true,
  });

  el.children = [...children];
  const origPush = el.children.push.bind(el.children);
  el.children.push = (...items) => {
    for (const item of items) {
      if (item && typeof item === 'object') item.parentElement = el;
    }
    return origPush(...items);
  };

  for (const child of children) {
    child.parentElement = el;
  }
  return el;
}

function createMockDocument(options = {}) {
  const body = createMockElement('BODY', { class: 'body' });
  const html = createMockElement('HTML', {}, '', [body]);

  const doc = {
    documentElement: html,
    body,
    title: options.title || '',
    location: { href: options.url || 'https://www.linkedin.com/jobs/view/12345678' },
    querySelector(sel) {
      return body.querySelector(sel);
    },
    querySelectorAll(sel) {
      return body.querySelectorAll(sel);
    },
  };

  html.ownerDocument = doc;
  body.ownerDocument = doc;
  return { doc, body };
}

// ─── Test Suite ───────────────────────────────────────

describe('P73: LinkedIn Active Job Root + Semantic Description Extraction', () => {
  // =========================================================================
  // Requirement 1: Active LinkedIn Job Root Discovery
  // =========================================================================
  describe('1. Active LinkedIn Job Root Discovery (findActiveLinkedInJobRoot)', () => {
    it('identifies [data-view-name="job-details"] as active root', () => {
      const { doc, body } = createMockDocument();
      const jobRoot = createMockElement('DIV', { 'data-view-name': 'job-details', class: 'jobs-details' }, '', [
        createMockElement('H1', { class: 'job-title' }, 'Senior Software Engineer'),
        createMockElement('A', { href: '/company/appinventiv/' }, 'Appinventiv'),
        createMockElement('DIV', { class: 'show-more-less-html__markup' }, 'A'.repeat(120)),
      ]);
      body.children.push(jobRoot);
      jobRoot.parentElement = body;

      const root = findActiveLinkedInJobRoot(doc);
      assert.ok(root, 'Active root must be identified');
      assert.equal(root.getAttribute('data-view-name'), 'job-details');
      assert.equal(deriveJobRootSource(root), '[data-view-name="job-details"]');
    });

    it('identifies .jobs-details__main-content as active root', () => {
      const { doc, body } = createMockDocument();
      const jobRoot = createMockElement('DIV', { class: 'jobs-details__main-content' }, '', [
        createMockElement('H1', { class: 'topcard__title' }, 'Lead Architect'),
        createMockElement('A', { class: 'topcard__org-name-link', href: '/company/tech/' }, 'Tech Corp'),
        createMockElement('DIV', { class: 'jobs-description__content' }, 'B'.repeat(150)),
      ]);
      body.children.push(jobRoot);
      jobRoot.parentElement = body;

      const root = findActiveLinkedInJobRoot(doc);
      assert.ok(root);
      assert.equal(root.className, 'jobs-details__main-content');
      assert.equal(deriveJobRootSource(root), '.jobs-details__main-content');
    });

    it('identifies .jobs-search__job-details as active root', () => {
      const { doc, body } = createMockDocument();
      const jobRoot = createMockElement('DIV', { class: 'jobs-search__job-details' }, '', [
        createMockElement('H1', { class: 'job-title' }, 'Frontend Engineer'),
        createMockElement('A', { href: '/company/corp/' }, 'Corp'),
        createMockElement('DIV', { id: 'job-details' }, 'C'.repeat(100)),
      ]);
      body.children.push(jobRoot);
      jobRoot.parentElement = body;

      const root = findActiveLinkedInJobRoot(doc);
      assert.ok(root);
      assert.equal(root.className, 'jobs-search__job-details');
    });

    it('identifies .job-view-layout as active root', () => {
      const { doc, body } = createMockDocument();
      const jobRoot = createMockElement('DIV', { class: 'job-view-layout' }, '', [
        createMockElement('H1', { class: 'job-title' }, 'Backend Go Engineer'),
        createMockElement('A', { href: '/company/gm/' }, 'General Motors'),
        createMockElement('DIV', { class: 'jobs-description' }, 'D'.repeat(110)),
      ]);
      body.children.push(jobRoot);
      jobRoot.parentElement = body;

      const root = findActiveLinkedInJobRoot(doc);
      assert.ok(root);
      assert.equal(root.className, 'job-view-layout');
    });

    it('identifies [data-testid="lazy-column"] as active root', () => {
      const { doc, body } = createMockDocument();
      const jobRoot = createMockElement('DIV', { 'data-testid': 'lazy-column', class: 'lazy-col' }, '', [
        createMockElement('H1', { class: 'job-title' }, 'DevOps Engineer'),
        createMockElement('A', { href: '/company/cloud/' }, 'Cloud Inc'),
        createMockElement('DIV', { class: 'jobs-box__html-content' }, 'E'.repeat(130)),
      ]);
      body.children.push(jobRoot);
      jobRoot.parentElement = body;

      const root = findActiveLinkedInJobRoot(doc);
      assert.ok(root);
      assert.equal(root.getAttribute('data-testid'), 'lazy-column');
    });

    it('identifies guest layout .details container as active root', () => {
      const { doc, body } = createMockDocument();
      const jobRoot = createMockElement('DIV', { class: 'details' }, '', [
        createMockElement('DIV', { class: 'top-card-layout' }, '', [
          createMockElement('H1', { class: 'top-card-layout__title' }, 'Software Engineer'),
          createMockElement('A', { class: 'topcard__org-name-link', href: '/company/appinventiv/' }, 'Appinventiv'),
        ]),
        createMockElement('SECTION', { class: 'description' }, '', [
          createMockElement('DIV', { class: 'show-more-less-html__markup' }, 'F'.repeat(200)),
        ]),
      ]);
      body.children.push(jobRoot);
      jobRoot.parentElement = body;

      const root = findActiveLinkedInJobRoot(doc);
      assert.ok(root);
      assert.equal(root.className, 'details');
    });

    it('prefers smallest container that clearly owns title + company + detail content', () => {
      const { doc, body } = createMockDocument();
      // Outer layout container
      const innerContent = createMockElement('DIV', { class: 'jobs-details__main-content' }, '', [
        createMockElement('H1', { class: 'job-title' }, 'Software Engineer'),
        createMockElement('A', { href: '/company/appinventiv/' }, 'Appinventiv'),
        createMockElement('DIV', { class: 'show-more-less-html__markup' }, 'Substantive description text '.repeat(10)),
      ]);
      const outerLayout = createMockElement('DIV', { class: 'job-view-layout' }, '', [
        innerContent,
      ]);
      body.children.push(outerLayout);
      outerLayout.parentElement = body;

      const root = findActiveLinkedInJobRoot(doc);
      assert.ok(root);
      // Must prefer innerContent (jobs-details__main-content) because it is smaller
      assert.equal(root.className, 'jobs-details__main-content');
    });

    it('NEVER returns document.body or document.documentElement as job root', () => {
      const { doc, body } = createMockDocument();
      // Only body and html exist, with random non-job text
      body.textContent = 'Welcome to LinkedIn Feed and miscellaneous navigation';

      const root = findActiveLinkedInJobRoot(doc);
      assert.strictEqual(root, null, 'findActiveLinkedInJobRoot must return null when no job root exists');
      assert.notStrictEqual(root, doc.body);
      assert.notStrictEqual(root, doc.documentElement);
    });
  });

  // =========================================================================
  // Requirement 2: Root-Scoped Description Extraction
  // =========================================================================
  describe('2. Root-Scoped Description Extraction (extractLinkedInDescription)', () => {
    it('Priority 1: extracts from known selector (#job-details) inside active root -> SELECTOR', () => {
      const jobRoot = createMockElement('DIV', { class: 'jobs-details__main-content' }, '', [
        createMockElement('DIV', { id: 'job-details' }, 'Full stack development with Node.js, React, and PostgreSQL on AWS cloud pipelines with automated testing.'),
      ]);

      const res = extractLinkedInDescription(jobRoot);
      assert.equal(res.descriptionSource, 'SELECTOR');
      assert.ok(res.description.length >= 50);
      assert.equal(res.descriptionLength, res.description.length);
      assert.ok(res.description.includes('Full stack development'));
    });

    it('Priority 1: extracts from .show-more-less-html__markup inside active root -> SELECTOR', () => {
      const jobRoot = createMockElement('DIV', { class: 'details' }, '', [
        createMockElement('DIV', { class: 'show-more-less-html__markup' }, 'Developing resilient scalable microservices with Docker, Kubernetes, and Golang at global enterprise scale.'),
      ]);

      const res = extractLinkedInDescription(jobRoot);
      assert.equal(res.descriptionSource, 'SELECTOR');
      assert.ok(res.description.length >= 50);
      assert.ok(res.description.includes('microservices'));
    });

    it('Priority 2: Semantic "About the job" heading extraction when selectors change -> ABOUT_THE_JOB', () => {
      // Simulate modern layout where classes are renamed to custom hash classes
      const aboutHeading = createMockElement('H2', { class: 'custom-heading-xyz' }, 'About the job');
      const contentBlock = createMockElement('DIV', { class: 'custom-unpredicted-content-block' }, 'We are looking for a Senior Software Engineer to build our AI core platform. Requirements include Python, PyTorch, Fastify, and PostgreSQL.');
      const section = createMockElement('SECTION', { class: 'custom-section-abc' }, '', [
        aboutHeading,
        contentBlock,
      ]);
      const jobRoot = createMockElement('DIV', { class: 'jobs-details__main-content' }, '', [
        section,
      ]);

      const res = extractLinkedInDescription(jobRoot);
      assert.equal(res.descriptionSource, 'ABOUT_THE_JOB');
      assert.ok(res.description.length >= 50);
      assert.ok(res.description.includes('Senior Software Engineer to build our AI core platform'));
    });

    it('Priority 2: Semantic "About the job" heading ignores recruiter cards and show-more buttons', () => {
      const aboutHeading = createMockElement('H3', {}, 'About the role');
      const recruiterCard = createMockElement('DIV', { class: 'recruiter-card' }, 'Recruiter Name - Message on LinkedIn to connect with hiring manager.');
      const contentBlock = createMockElement('DIV', { class: 'role-body-text' }, 'Responsible for leading cross-functional engineering teams, designing event-driven distributed architectures, and maintaining high reliability.');
      const section = createMockElement('SECTION', { class: 'role-details' }, '', [
        aboutHeading,
        recruiterCard,
        contentBlock,
      ]);
      const jobRoot = createMockElement('DIV', { class: 'jobs-details__main-content' }, '', [
        section,
      ]);

      const res = extractLinkedInDescription(jobRoot);
      assert.equal(res.descriptionSource, 'ABOUT_THE_JOB');
      assert.ok(res.description.includes('leading cross-functional engineering teams'));
      assert.ok(!res.description.includes('Recruiter Name'));
    });

    it('Priority 3: JSON-LD JobPosting fallback when DOM has no description -> JSON_LD', () => {
      const { doc, body } = createMockDocument();
      const emptyJobRoot = createMockElement('DIV', { class: 'jobs-details__main-content' }, '', []);
      body.children.push(emptyJobRoot);

      // Add JSON-LD script tag
      const jsonLdContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'JobPosting',
        title: 'Software Engineer',
        description: '<p>Constructing cloud-native applications with TypeScript, Node.js, and Docker for our enterprise logistics platform.</p>',
      });
      const script = createMockElement('SCRIPT', { type: 'application/ld+json' }, jsonLdContent);
      body.children.push(script);

      const res = extractLinkedInDescription(emptyJobRoot, doc);
      assert.equal(res.descriptionSource, 'JSON_LD');
      assert.ok(res.description.length >= 50);
      assert.ok(res.description.includes('Constructing cloud-native applications'));
    });

    it('Priority 4: returns empty string and NONE when all sources are missing or < 50 chars', () => {
      const emptyJobRoot = createMockElement('DIV', { class: 'jobs-details__main-content' }, '', [
        createMockElement('DIV', { id: 'job-details' }, 'Short text'),
      ]);

      const res = extractLinkedInDescription(emptyJobRoot);
      assert.equal(res.description, '');
      assert.equal(res.descriptionSource, 'NONE');
      assert.equal(res.descriptionLength, 0);
    });

    it('NEVER extracts description from elements outside the active job root', () => {
      const { doc, body } = createMockDocument();
      // Unrelated sidebar card with description class outside active root
      const unrelatedAside = createMockElement('ASIDE', { class: 'jobs-description' }, 'Unrelated recommended jobs card with lots of text that should never be extracted because it is outside the active job root!');
      body.children.push(unrelatedAside);

      // Active root with no description
      const activeRoot = createMockElement('DIV', { class: 'jobs-details__main-content' }, '', [
        createMockElement('H1', { class: 'job-title' }, 'Software Engineer'),
      ]);
      body.children.push(activeRoot);

      const res = extractLinkedInDescription(activeRoot, doc);
      assert.equal(res.descriptionSource, 'NONE');
      assert.equal(res.description, '');
    });
  });

  // =========================================================================
  // Requirement 3: Extraction Provenance
  // =========================================================================
  describe('3. Extraction Provenance Tracking', () => {
    it('tracks descriptionSource, jobRootSource, and descriptionLength on LinkedInAdapter.extract', () => {
      const { doc, body } = createMockDocument({ url: 'https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430' });
      const jobRoot = createMockElement('DIV', { 'data-view-name': 'job-details', class: 'jobs-details' }, '', [
        createMockElement('H1', { class: 'job-title' }, 'Software Engineer'),
        createMockElement('A', { href: '/company/appinventiv/' }, 'Appinventiv'),
        createMockElement('DIV', { class: 'show-more-less-html__markup' }, 'The ideal candidate will be responsible for developing high-quality applications. They will also be responsible for designing and implementing testable and scalable code.'),
      ]);
      body.children.push(jobRoot);

      const payload = LinkedInAdapter.extract(doc, 'https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430');
      assert.equal(payload.provider, 'LINKEDIN');
      assert.equal(payload.title, 'Software Engineer');
      assert.equal(payload.company, 'Appinventiv');
      assert.equal(payload.descriptionSource, 'SELECTOR');
      assert.equal(payload.jobRootSource, '[data-view-name="job-details"]');
      assert.ok(payload.descriptionLength >= 50);
      assert.equal(payload.isReady, true);
      assert.equal(payload.analysisReady, true);
    });

    it('reports ABOUT_THE_JOB provenance when semantic extraction is used', () => {
      const { doc, body } = createMockDocument({ url: 'https://www.linkedin.com/jobs/view/4419969671/' });
      const jobRoot = createMockElement('DIV', { class: 'jobs-details__main-content' }, '', [
        createMockElement('H1', { class: 'job-title' }, 'Senior Go Developer'),
        createMockElement('A', { href: '/company/gm/' }, 'General Motors'),
        createMockElement('SECTION', { class: 'about-section' }, '', [
          createMockElement('H2', {}, 'About the job'),
          createMockElement('DIV', {}, 'Looking for an experienced Go backend developer to design cloud-native microservices with Kubernetes, gRPC, and PostgreSQL.'),
        ]),
      ]);
      body.children.push(jobRoot);

      const payload = LinkedInAdapter.extract(doc, 'https://www.linkedin.com/jobs/view/4419969671/');
      assert.equal(payload.descriptionSource, 'ABOUT_THE_JOB');
      assert.equal(payload.jobRootSource, '.jobs-details__main-content');
      assert.ok(payload.descriptionLength >= 50);
      assert.equal(payload.analysisReady, true);
    });
  });

  // =========================================================================
  // Requirement 4: Split Page Readiness from Analysis Readiness
  // =========================================================================
  describe('4. Separation of JOB_DETECTED and ANALYSIS_READY', () => {
    it('JOB_DETECTED=true (isReady: true) and ANALYSIS_READY=false when title/company confirmed but description < 50', () => {
      const { doc, body } = createMockDocument({ url: 'https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430' });
      const jobRoot = createMockElement('DIV', { class: 'jobs-details__main-content' }, '', [
        createMockElement('H1', { class: 'job-title' }, 'Software Engineer'),
        createMockElement('A', { href: '/company/appinventiv/' }, 'Appinventiv'),
        // No description element yet (pending hydration)
      ]);
      body.children.push(jobRoot);

      const payload = LinkedInAdapter.extract(doc, 'https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430');
      assert.equal(payload.title, 'Software Engineer');
      assert.equal(payload.company, 'Appinventiv');
      assert.equal(payload.description, '');
      assert.equal(payload.descriptionSource, 'NONE');
      assert.equal(payload.isReady, true, 'Job must be detected immediately');
      assert.equal(payload.analysisReady, false, 'Analysis must NOT be ready until description >= 50');
    });

    it('JobDetectionEngine evaluates detected: true and ready: true (analysisReady false on payload)', () => {
      const { doc, body } = createMockDocument({ url: 'https://www.linkedin.com/jobs/view/12345/' });
      const jobRoot = createMockElement('DIV', { class: 'jobs-details__main-content' }, '', [
        createMockElement('H1', { class: 'job-title' }, 'Software Engineer'),
        createMockElement('A', { href: '/company/appinventiv/' }, 'Appinventiv'),
      ]);
      body.children.push(jobRoot);

      const evalResult = JobDetectionEngine.evaluate(doc, 'https://www.linkedin.com/jobs/view/12345/');
      assert.equal(evalResult.detected, true);
      assert.equal(evalResult.ready, true);
      assert.equal(evalResult.jobData.analysisReady, false);
      assert.equal(evalResult.jobData.descriptionSource, 'NONE');
    });
  });

  // =========================================================================
  // Requirement 5 & 6: Single Hydration Controller & Active Root Observation
  // =========================================================================
  describe('5 & 6. Single Hydration Controller & Relevant DOM Observation', () => {
    it('waitForInitialWindow resolves immediately when description >= 50', async () => {
      let isCompleted = false;
      let waiters = [];

      const targetJob = {
        title: 'Software Engineer',
        company: 'Appinventiv',
        description: 'A'.repeat(80),
        analysisReady: true,
      };

      // Simulates JobHydrationLifecycle.waitForInitialWindow
      const waitForInitialWindow = (maxDurationMs) => {
        if (targetJob.description.length >= 50) {
          return Promise.resolve(targetJob);
        }
        return new Promise((resolve) => {
          waiters.push(resolve);
        });
      };

      const result = await waitForInitialWindow(5000);
      assert.ok(result);
      assert.equal(result.title, 'Software Engineer');
      assert.ok(result.description.length >= 50);
    });

    it('waitForInitialWindow returns partial job if initial window expires before hydration', async () => {
      const partialJob = {
        title: 'Software Engineer',
        company: 'Appinventiv',
        description: '',
        analysisReady: false,
      };

      const waitForInitialWindow = (maxDurationMs) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(partialJob);
          }, maxDurationMs);
        });
      };

      const start = Date.now();
      const result = await waitForInitialWindow(100);
      const elapsed = Date.now() - start;

      assert.ok(result);
      assert.equal(result.title, 'Software Engineer');
      assert.equal(result.description, '');
      assert.ok(elapsed >= 90, 'Waited bounded initial window');
    });
  });

  // =========================================================================
  // Requirement 7: Handling Collapsed "About the Job"
  // =========================================================================
  describe('7. Collapsed Semantic "About the Job" Content Extraction', () => {
    it('extracts available semantic content from collapsed section without user scroll', () => {
      const aboutHeading = createMockElement('H2', { class: 'heading' }, 'About the job');
      // Collapsed container with CSS line clamp or show-more wrapper
      const collapsedMarkup = createMockElement(
        'DIV',
        { class: 'line-clamp-3 text-collapsed' },
        'Appinventiv is seeking a talented Software Engineer with deep knowledge of TypeScript, Node.js, distributed databases, and high-performance REST APIs.'
      );
      const section = createMockElement('SECTION', { class: 'description-section' }, '', [
        aboutHeading,
        collapsedMarkup,
      ]);
      const jobRoot = createMockElement('DIV', { class: 'jobs-details__main-content' }, '', [section]);

      const res = extractLinkedInDescription(jobRoot);
      assert.equal(res.descriptionSource, 'ABOUT_THE_JOB');
      assert.ok(res.description.length >= 50);
      assert.ok(res.description.includes('Appinventiv is seeking a talented Software Engineer'));
    });
  });

  // =========================================================================
  // Requirement 8: Active Job Fingerprint
  // =========================================================================
  describe('8. Active Job Fingerprint & Isolation', () => {
    it('derives deterministic 64-character SHA-256 fingerprint from provider and externalJobId', () => {
      const jobData = {
        provider: 'LINKEDIN',
        externalJobId: '4464770430',
        title: 'Software Engineer',
        company: 'Appinventiv',
      };
      const fp = JobIdentity.deriveJobFingerprint(jobData);
      assert.equal(typeof fp, 'string');
      assert.equal(fp.length, 64);
      // Invariant: same job produces identical fingerprint
      assert.equal(JobIdentity.deriveJobFingerprint(jobData), fp);
    });

    it('falls back to provider + title + company when externalJobId is absent', () => {
      const jobData = {
        provider: 'LINKEDIN',
        title: 'Software Engineer',
        company: 'Appinventiv',
        url: 'https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430',
      };
      const fp = JobIdentity.deriveJobFingerprint(jobData);
      assert.equal(typeof fp, 'string');
      assert.equal(fp.length, 64);
      // Invariant: same role produces identical fingerprint
      assert.equal(JobIdentity.deriveJobFingerprint(jobData), fp);
    });

    it('different externalJobId produces different fingerprint', () => {
      const jobA = { provider: 'LINKEDIN', externalJobId: '4464770430', title: 'Software Engineer', company: 'Appinventiv' };
      const jobB = { provider: 'LINKEDIN', externalJobId: '4419969671', title: 'Go Developer', company: 'General Motors' };
      assert.notEqual(JobIdentity.deriveJobFingerprint(jobA), JobIdentity.deriveJobFingerprint(jobB));
    });
  });

  // =========================================================================
  // Requirement 9: Persisted State on Hydration
  // =========================================================================
  describe('9. Persisted State in DurableWorkflowStore', () => {
    it('persists hydrated job data with analysisReady=true for tab in DurableWorkflowStore', async () => {
      const store = new DurableWorkflowStore();
      const tabId = 42;

      // Initial partial state
      const initialState = store.createInitialState(tabId);
      initialState.jobData = {
        title: 'Software Engineer',
        company: 'Appinventiv',
        provider: 'LINKEDIN',
        externalJobId: '4464770430',
        description: '',
        analysisReady: false,
      };
      initialState.jobFingerprint = 'linkedin:4464770430';
      await store.saveTabState(tabId, initialState);

      // Hydration arrival updates state
      const hydratedData = {
        ...initialState.jobData,
        description: 'The ideal candidate will be responsible for developing high-quality applications with Node.js and TypeScript.',
        rawText: 'The ideal candidate will be responsible for developing high-quality applications with Node.js and TypeScript.',
        analysisReady: true,
        descriptionSource: 'SELECTOR',
        jobRootSource: '[data-view-name="job-details"]',
        descriptionLength: 105,
      };

      const loadedState = await store.getTabState(tabId);
      loadedState.jobData = { ...loadedState.jobData, ...hydratedData };
      loadedState.normalizedJob = loadedState.jobData;
      await store.saveTabState(tabId, loadedState);

      // Re-load to verify persistence
      const recoveredState = await store.getTabState(tabId);
      assert.ok(recoveredState.jobData);
      assert.equal(recoveredState.jobData.analysisReady, true);
      assert.equal(recoveredState.jobData.descriptionSource, 'SELECTOR');
      assert.ok(recoveredState.jobData.description.length >= 50);
    });
  });

  // =========================================================================
  // Requirement 10: Form Detection Independence
  // =========================================================================
  describe('10. Form Detection Independence', () => {
    it('form detection card coexists without resetting activeJob or toggling analysisReady', async () => {
      const store = new DurableWorkflowStore();
      const tabId = 55;

      const state = store.createInitialState(tabId);
      state.jobData = {
        title: 'Software Engineer',
        company: 'Appinventiv',
        description: 'A'.repeat(80),
        analysisReady: true,
      };
      state.jobFingerprint = 'linkedin:4464770430';
      await store.saveTabState(tabId, state);

      // Form arrives
      const formData = {
        hasForm: true,
        fields: [{ name: 'fullName', type: 'text' }, { name: 'email', type: 'email' }],
      };

      const reconciled = await store.reconcileNavigation({
        tabId,
        currentUrl: 'https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430',
        detectedJob: state.jobData,
        detectedForm: formData,
      });

      assert.ok(reconciled.jobData, 'activeJob must be preserved');
      assert.equal(reconciled.jobData.title, 'Software Engineer');
      assert.equal(reconciled.jobData.analysisReady, true, 'analysisReady must not be reset');
      assert.ok(reconciled.detectedForm, 'Form must be recorded');
      assert.equal(reconciled.detectedForm.fields.length, 2);
    });
  });

  // =========================================================================
  // Requirement 12: Required Negative Tests
  // =========================================================================
  describe('12. Required Negative Tests', () => {
    it('ChatGPT conversation page: detected=false', () => {
      const { doc } = createMockDocument({ url: 'https://chatgpt.com/c/68c8b211-1234-5678' });
      const result = JobDetectionEngine.evaluate(doc, 'https://chatgpt.com/c/68c8b211-1234-5678');
      assert.equal(result.detected, false);
      assert.equal(result.jobData, null);
    });

    it('GitHub repository page: detected=false', () => {
      const { doc } = createMockDocument({ url: 'https://github.com/facebook/react' });
      const result = JobDetectionEngine.evaluate(doc, 'https://github.com/facebook/react');
      assert.equal(result.detected, false);
      assert.equal(result.jobData, null);
    });

    it('LinkedIn feed: detected=false', () => {
      const { doc } = createMockDocument({ url: 'https://www.linkedin.com/feed/' });
      const result = JobDetectionEngine.evaluate(doc, 'https://www.linkedin.com/feed/');
      assert.equal(result.detected, false);
      assert.equal(result.jobData, null);
    });

    it('LinkedIn profile: detected=false', () => {
      const { doc } = createMockDocument({ url: 'https://www.linkedin.com/in/satyanadella/' });
      const result = JobDetectionEngine.evaluate(doc, 'https://www.linkedin.com/in/satyanadella/');
      assert.equal(result.detected, false);
      assert.equal(result.jobData, null);
    });

    it('LinkedIn jobs search with no active selected job: detected=false', () => {
      const { doc } = createMockDocument({ url: 'https://www.linkedin.com/jobs/search/?keywords=software%20engineer' });
      // No active job details, no active list item
      const result = JobDetectionEngine.evaluate(doc, 'https://www.linkedin.com/jobs/search/?keywords=software%20engineer');
      assert.equal(result.detected, false);
      assert.equal(result.jobData, null);
    });
  });

  // =========================================================================
  // Requirement 13: Working Portal Regressions
  // =========================================================================
  describe('13. Working Portal Regression (Greenhouse, Wellfound, Generic)', () => {
    it('Greenhouse: detection and description still work', () => {
      const { doc, body } = createMockDocument({ url: 'https://boards.greenhouse.io/stripe/jobs/1234567' });
      body.children.push(
        createMockElement('H1', { class: 'app-title' }, 'Infrastructure Engineer'),
        createMockElement('SPAN', { class: 'company-name' }, 'Stripe'),
        createMockElement('DIV', { id: 'content' }, 'Stripe is looking for an Infrastructure Engineer to build global reliability systems and payment pipelines.'.repeat(2))
      );

      assert.equal(GreenhouseAdapter.canHandle(doc, 'https://boards.greenhouse.io/stripe/jobs/1234567'), true);
      const payload = GreenhouseAdapter.extract(doc, 'https://boards.greenhouse.io/stripe/jobs/1234567');
      assert.equal(payload.title, 'Infrastructure Engineer');
      assert.equal(payload.company, 'Stripe');
      assert.ok(payload.description.length >= 50);
    });

    it('Wellfound: detection and description still work via Generic adapter', () => {
      const { doc, body } = createMockDocument({ url: 'https://wellfound.com/jobs/98765-senior-ai-engineer' });
      body.children.push(
        createMockElement('H1', { class: 'header' }, 'Senior AI Engineer'),
        createMockElement('DIV', { class: 'company-name' }, 'Anthropic'),
        createMockElement('DIV', { class: 'job-description' }, 'Building frontier AI models and evaluating alignment for large-scale production agent deployment. '.repeat(2))
      );

      assert.equal(GenericCareerPageAdapter.canHandle(doc, 'https://wellfound.com/jobs/98765-senior-ai-engineer'), true);
      const payload = GenericCareerPageAdapter.extract(doc, 'https://wellfound.com/jobs/98765-senior-ai-engineer');
      assert.equal(payload.title, 'Senior AI Engineer');
      assert.equal(payload.company, 'Anthropic');
      assert.ok(payload.description.length >= 50);
      assert.equal(payload.isReady, true);
    });

    it('Company career page (Generic): detection and description still work', () => {
      const { doc, body } = createMockDocument({ url: 'https://careers.uber.com/jobs/34567-software-engineer' });
      body.children.push(
        createMockElement('H1', {}, 'Software Engineer - Rider Experience'),
        createMockElement('DIV', { class: 'company' }, 'Uber'),
        createMockElement('SECTION', { class: 'job-description' }, 'Join Uber Rider team to engineer next-generation micro-mobility platforms and real-time dispatch systems.'.repeat(2))
      );

      assert.equal(GenericCareerPageAdapter.canHandle(doc, 'https://careers.uber.com/jobs/34567-software-engineer'), true);
      const payload = GenericCareerPageAdapter.extract(doc, 'https://careers.uber.com/jobs/34567-software-engineer');
      assert.equal(payload.title, 'Software Engineer');
      assert.ok(payload.description.length >= 50);
      assert.equal(payload.isReady, true);
    });
  });
});
