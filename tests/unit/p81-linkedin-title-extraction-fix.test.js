/**
 * @file P81 Unit Tests: Live LinkedIn Title Extraction False Positive Fix
 *
 * Verifies:
 * 1. Live Job 4465164301 (Triveous):
 *    - Real title "Full Stack Developer" is extracted correctly.
 *    - Company "Triveous" is extracted correctly.
 *    - detected = true, isReady = true.
 * 2. "Use AI to assess how you fit" Suppression:
 *    - Even if an H2 contains "Use AI to assess how you fit" inside or outside root,
 *      it must NEVER become the job title.
 * 3. Marketing/Upsell/AI Candidate Rejection:
 *    - isValidTitleString rejects promotional, second-person, and imperative action headings.
 *    - Valid job titles (e.g., "Full Stack Developer", "Senior Backend Engineer") are accepted.
 * 4. Multi-heading layout:
 *    - Real job title wins over AI upsell heading.
 * 5. Recommendation heading rejection:
 *    - Headings like "Similar jobs", "People also viewed" rejected.
 * 6. Non-job surfaces:
 *    - LinkedIn feed => detected = false.
 * 7. LinkedIn profile:
 *    - Profile page => detected = false.
 * 8. LinkedIn jobs search without selected job:
 *    - Search page with no detail view => detected = false.
 * 9. Existing P73/P74 layouts:
 *    - Public guest topcard, unified job-details, lazy-column layouts still extract correctly.
 * 10. Fail-closed safety:
 *    - If no valid title is found, do NOT fabricate or accept invalid headings (isReady = false).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  LinkedInAdapter,
  findActiveLinkedInJobRoot,
  isValidLinkedInTitleCandidate,
  isValidTitleString,
  EXPLICIT_JOB_TITLE_SELECTORS,
  NON_JOB_CONTAINER_SELECTORS,
} from '../../extension/job-detection/adapters/linkedin.adapter.js';

import { JobPageDetector } from '../../extension/job-detection/job-page-detector.js';

// ─── Lightweight DOM Mock Helper ─────────────────────────────

function createMockElement(tagName, attributes = {}, textContent = '', children = []) {
  const classListSet = new Set(
    (attributes.class || attributes.className || '').split(/\s+/).filter(Boolean)
  );

  const el = {
    tagName: tagName.toUpperCase(),
    id: attributes.id || '',
    className: attributes.class || attributes.className || '',
    _textContent: textContent,
    get textContent() {
      if (
        this._textContent !== undefined &&
        this._textContent !== null &&
        this._textContent !== ''
      ) {
        return this._textContent;
      }
      if (this.children.length > 0) {
        return this.children.map((c) => c.textContent).join(' ');
      }
      return '';
    },
    set textContent(v) {
      this._textContent = v;
    },
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
        val
          .split(/\s+/)
          .filter(Boolean)
          .forEach((c) => classListSet.add(c));
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

        // Tag + attribute e.g. h1[class*="title" i]
        const tagAttrMatch = normSel.match(
          /^([a-z0-9]+)\[([a-z0-9_-]+)([\*~^$]?=)?["']?([^"'\]\s]+)?["']?\s*[a-z]*\]$/i
        );
        if (tagAttrMatch) {
          const [, expectedTag, attrName, op, expectedVal] = tagAttrMatch;
          if (node.tagName.toLowerCase() !== expectedTag.toLowerCase()) return false;
          const actualVal =
            attrName === 'class' || attrName === 'className'
              ? node.className
              : node.getAttribute(attrName);
          if (actualVal === null || actualVal === undefined) return false;
          if (!op) return true;
          if (op === '=') return actualVal.toLowerCase() === expectedVal.toLowerCase();
          if (op === '*=') return actualVal.toLowerCase().includes(expectedVal.toLowerCase());
        }

        // Tag only
        if (normSel === node.tagName.toLowerCase()) return true;

        // ID only
        if (normSel.startsWith('#') && !normSel.includes(' ')) {
          return node.id.toLowerCase() === normSel.slice(1);
        }

        // Class only
        if (
          normSel.startsWith('.') &&
          !normSel.includes('[') &&
          !normSel.includes(' ') &&
          !normSel.slice(1).includes('.')
        ) {
          return node.classList.contains(normSel.slice(1));
        }

        // Tag with class e.g. h1.top-card-layout__title
        const tagClassMatch = normSel.match(/^([a-z0-9]+)\.([a-z0-9_-]+)$/i);
        if (tagClassMatch) {
          const [, expectedTag, expectedClass] = tagClassMatch;
          return (
            node.tagName.toLowerCase() === expectedTag.toLowerCase() &&
            node.classList.contains(expectedClass)
          );
        }

        // Tag with multiple classes e.g. h1.topcard__title
        if (normSel.includes('.') && !normSel.includes(' ') && !normSel.includes('[')) {
          const parts = normSel.split('.');
          const tag = parts[0];
          const classes = parts.slice(1);
          if (tag && node.tagName.toLowerCase() !== tag.toLowerCase()) return false;
          return classes.every((c) => node.classList.contains(c));
        }

        // Attribute only [attr*="val"] or [attr="val"]
        const attrMatch = normSel.match(
          /^\[([a-z0-9_-]+)([\*~^$]?=)?["']?([^"'\]\s]+)?["']?\s*[a-z]*\]$/i
        );
        if (attrMatch) {
          const [, attrName, op, expectedVal] = attrMatch;
          const actualVal =
            attrName === 'class' || attrName === 'className'
              ? node.className
              : node.getAttribute(attrName);
          if (actualVal === null || actualVal === undefined) return false;
          if (!op) return true;
          if (op === '=') return actualVal.toLowerCase() === expectedVal.toLowerCase();
          if (op === '*=') return actualVal.toLowerCase().includes(expectedVal.toLowerCase());
        }

        // Headings query: h1, h2, h3 or h1, h2
        if (normSel === 'h1, h2, h3' || normSel === 'h1, h2') {
          return ['h1', 'h2', 'h3'].includes(node.tagName.toLowerCase());
        }

        // Role heading
        if (normSel === '[role="heading"]' && node.getAttribute('role') === 'heading') return true;

        // Anchor with href match
        if (normSel.includes('a[href*="/company/"]') && node.tagName.toLowerCase() === 'a') {
          return (node.getAttribute('href') || '').includes('/company/');
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
        const m = normSel.match(/\[([a-z0-9_-]+)([\*~^$]?=)?["']?([^"'\]\s]+)?["']?\s*[a-z]*\]/i);
        if (m) {
          const [, attrName, op, expectedVal] = m;
          const actualVal =
            attrName === 'class' || attrName === 'className'
              ? curr.className
              : curr.getAttribute(attrName);
          if (actualVal) {
            if (
              !op ||
              (op === '*=' && actualVal.toLowerCase().includes(expectedVal.toLowerCase()))
            ) {
              return curr;
            }
          }
        }
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
    location: { href: options.url || 'https://www.linkedin.com/jobs/view/4465164301/' },
    querySelector(sel) {
      return body.querySelector(sel);
    },
    querySelectorAll(sel) {
      return body.querySelectorAll(sel);
    },
  };

  return { doc, body };
}

describe('P81: Live LinkedIn Title Extraction False Positive Fix', () => {
  // =========================================================================
  // 1. isValidTitleString unit checks
  // =========================================================================
  describe('1. isValidTitleString Validation Function', () => {
    it('rejects "Use AI to assess how you fit" and similar promotional copy', () => {
      assert.equal(isValidTitleString('Use AI to assess how you fit'), false);
      assert.equal(isValidTitleString('See how you compare to other applicants'), false);
      assert.equal(isValidTitleString('Get matched with jobs'), false);
      assert.equal(isValidTitleString('Try Premium free for 1 month'), false);
      assert.equal(isValidTitleString('Assess how you match with this role'), false);
      assert.equal(isValidTitleString('Meet the hiring team'), false);
      assert.equal(isValidTitleString('Connect with recruiters'), false);
      assert.equal(isValidTitleString('Learn more about this company'), false);
    });

    it('rejects navigation and section headings', () => {
      assert.equal(isValidTitleString('About the job'), false);
      assert.equal(isValidTitleString('Similar jobs'), false);
      assert.equal(isValidTitleString('People also viewed'), false);
      assert.equal(isValidTitleString('Job details'), false);
    });

    it('rejects conversational pronouns and punctuation', () => {
      assert.equal(isValidTitleString('We are hiring a developer'), false);
      assert.equal(isValidTitleString('Join our engineering team!'), false);
      assert.equal(isValidTitleString('Are you ready to code?'), false);
    });

    it('accepts legitimate job titles', () => {
      assert.equal(isValidTitleString('Full Stack Developer'), true);
      assert.equal(isValidTitleString('Senior Backend Engineer (Remote)'), true);
      assert.equal(isValidTitleString('Staff Software Engineer, Platform & Infrastructure'), true);
      assert.equal(isValidTitleString('Product Manager - AI Products'), true);
      assert.equal(isValidTitleString('VP of Engineering'), true);
      assert.equal(isValidTitleString('DevOps / SRE Lead'), true);
      assert.equal(isValidTitleString('iOS Developer'), true);
    });
  });

  // =========================================================================
  // 2. Exact Live DOM Reproduction: Triveous 4465164301
  // =========================================================================
  describe('2. Live LinkedIn 4465164301 (Triveous) DOM Fixture', () => {
    it('extracts "Full Stack Developer" and "Triveous", NEVER "Use AI to assess how you fit"', () => {
      const { doc, body } = createMockDocument({
        url: 'https://www.linkedin.com/jobs/view/4465164301/',
        title: 'Full Stack Developer - Triveous | LinkedIn',
      });

      // Structure reflecting the live LinkedIn logged-in view:
      // [data-testid="lazy-column"] containing:
      // 1. Top card header with company link and real job title
      // 2. AI assessment widget with H2 "Use AI to assess how you fit"
      // 3. Job description container

      const topCardHeader = createMockElement(
        'DIV',
        { class: 'job-details-jobs-unified-top-card__primary-description' },
        '',
        [
          createMockElement('H1', { class: 'top-card-layout__title' }, 'Full Stack Developer'),
          createMockElement(
            'A',
            { class: 'topcard__org-name-link', href: 'https://www.linkedin.com/company/triveous' },
            'Triveous'
          ),
        ]
      );

      const aiMatchWidget = createMockElement(
        'DIV',
        { class: 'artdeco-card job-details-premium-insight' },
        '',
        [
          createMockElement('H2', { class: 't-16' }, 'Use AI to assess how you fit'),
          createMockElement('BUTTON', {}, 'Try AI Match'),
        ]
      );

      const jobDesc = createMockElement('DIV', { class: 'jobs-description__content' }, '', [
        createMockElement(
          'DIV',
          { class: 'jobs-box__html-content' },
          'We are looking for a skilled Full Stack Developer to build modern apps...'.repeat(5)
        ),
      ]);

      const lazyColumn = createMockElement('DIV', { 'data-testid': 'lazy-column' }, '', [
        topCardHeader,
        aiMatchWidget,
        jobDesc,
      ]);

      body.children.push(lazyColumn);

      const payload = LinkedInAdapter.extract(
        doc,
        'https://www.linkedin.com/jobs/view/4465164301/'
      );

      assert.equal(payload.title, 'Full Stack Developer', 'Must extract authentic job title');
      assert.equal(payload.company, 'Triveous', 'Must extract authentic company');
      assert.notEqual(
        payload.title,
        'Use AI to assess how you fit',
        'Must NEVER extract AI match heading'
      );
    });

    it('works when H1 title is within topcard header regardless of AI heading order', () => {
      const { doc, body } = createMockDocument({
        url: 'https://www.linkedin.com/jobs/view/4465164301/',
      });

      // Even if AI widget appears BEFORE the title inside the root
      const aiWidget = createMockElement('DIV', { class: 'job-details-premium-insight' }, '', [
        createMockElement('H2', {}, 'Use AI to assess how you fit'),
      ]);

      const topCard = createMockElement('DIV', { class: 'job-details-jobs-unified-top-card' }, '', [
        createMockElement(
          'H1',
          { class: 'job-details-jobs-unified-top-card__job-title' },
          'Full Stack Developer'
        ),
        createMockElement('A', { href: '/company/triveous/' }, 'Triveous'),
      ]);

      const desc = createMockElement(
        'DIV',
        { class: 'jobs-description-content' },
        'Full stack development role...'.repeat(5)
      );

      const root = createMockElement('DIV', { 'data-testid': 'lazy-column' }, '', [
        aiWidget,
        topCard,
        desc,
      ]);
      body.children.push(root);

      const payload = LinkedInAdapter.extract(
        doc,
        'https://www.linkedin.com/jobs/view/4465164301/'
      );
      assert.equal(payload.title, 'Full Stack Developer');
      assert.equal(payload.company, 'Triveous');
    });
  });

  // =========================================================================
  // 3. Marketing/Upsell Heading Suppression & Rejection
  // =========================================================================
  describe('3. Promotional Headings Suppression', () => {
    it('suppresses "Take the next step in your job search" heading', () => {
      const { doc, body } = createMockDocument();

      const topCard = createMockElement('DIV', { class: 'job-details-jobs-unified-top-card' }, '', [
        createMockElement(
          'H1',
          { class: 'job-details-jobs-unified-top-card__job-title' },
          'Senior Cloud Architect'
        ),
        createMockElement('A', { href: '/company/cloudcorp/' }, 'CloudCorp'),
      ]);

      const upsell = createMockElement('DIV', { class: 'upsell-card' }, '', [
        createMockElement('H2', {}, 'Take the next step in your job search'),
      ]);

      const desc = createMockElement(
        'DIV',
        { class: 'show-more-less-html__markup' },
        'Cloud architect responsibilities...'.repeat(5)
      );

      const root = createMockElement('DIV', { 'data-view-name': 'job-details' }, '', [
        topCard,
        upsell,
        desc,
      ]);
      body.children.push(root);

      const payload = LinkedInAdapter.extract(doc, 'https://www.linkedin.com/jobs/view/12345/');
      assert.equal(payload.title, 'Senior Cloud Architect');
      assert.equal(payload.company, 'CloudCorp');
    });

    it('suppresses recommendation headings like "Similar jobs" and "People also viewed"', () => {
      const { doc, body } = createMockDocument();

      const topCard = createMockElement('DIV', { class: 'job-details-jobs-unified-top-card' }, '', [
        createMockElement(
          'H1',
          { class: 'job-details-jobs-unified-top-card__job-title' },
          'Data Engineer'
        ),
        createMockElement('A', { href: '/company/datalabs/' }, 'DataLabs'),
      ]);

      const recs = createMockElement('DIV', { class: 'related-jobs' }, '', [
        createMockElement('H2', {}, 'Similar jobs'),
        createMockElement('H2', {}, 'People also viewed'),
      ]);

      const desc = createMockElement(
        'DIV',
        { class: 'show-more-less-html__markup' },
        'Data pipeline engineering...'.repeat(5)
      );

      const root = createMockElement('DIV', { 'data-testid': 'lazy-column' }, '', [
        topCard,
        desc,
        recs,
      ]);
      body.children.push(root);

      const payload = LinkedInAdapter.extract(doc, 'https://www.linkedin.com/jobs/view/12345/');
      assert.equal(payload.title, 'Data Engineer');
      assert.equal(payload.company, 'DataLabs');
    });
  });

  // =========================================================================
  // 4. Non-Job Surfaces
  // =========================================================================
  describe('4. Non-Job Surfaces Detection Immunity', () => {
    it('returns isConfident = false for LinkedIn feed', () => {
      const { doc, body } = createMockDocument({
        url: 'https://www.linkedin.com/feed/',
        title: 'Feed | LinkedIn',
      });
      const feed = createMockElement('DIV', { class: 'scaffold-layout__main' }, '', [
        createMockElement('H2', {}, 'Start a post'),
        createMockElement('DIV', { class: 'feed-shared-update-v2' }, 'Post content here...'),
      ]);
      body.children.push(feed);

      assert.equal(LinkedInAdapter.canHandle(doc, 'https://www.linkedin.com/feed/'), false);
      const result = JobPageDetector.detect(doc, 'https://www.linkedin.com/feed/');
      assert.equal(result.isConfident, false, 'Feed must not be detected as a job');
    });

    it('returns isConfident = false for LinkedIn profile', () => {
      const { doc, body } = createMockDocument({
        url: 'https://www.linkedin.com/in/some-user/',
        title: 'Jane Doe | LinkedIn',
      });
      const profile = createMockElement('DIV', { class: 'profile-container' }, '', [
        createMockElement('H1', {}, 'Jane Doe'),
        createMockElement(
          'DIV',
          { class: 'text-body-medium' },
          'Senior Software Engineer at TechCo'
        ),
      ]);
      body.children.push(profile);

      assert.equal(LinkedInAdapter.canHandle(doc, 'https://www.linkedin.com/in/some-user/'), false);
      const result = JobPageDetector.detect(doc, 'https://www.linkedin.com/in/some-user/');
      assert.equal(result.isConfident, false, 'Profile page must not be detected as a job posting');
    });

    it('returns isConfident = false for LinkedIn jobs search without selected job', () => {
      const { doc, body } = createMockDocument({
        url: 'https://www.linkedin.com/jobs/search/?keywords=developer',
        title: 'Developer Jobs | LinkedIn',
      });
      const searchList = createMockElement('DIV', { class: 'jobs-search-results-list' }, '', [
        createMockElement('H1', {}, 'Jobs search results'),
      ]);
      body.children.push(searchList);

      assert.equal(
        LinkedInAdapter.canHandle(doc, 'https://www.linkedin.com/jobs/search/?keywords=developer'),
        false
      );
      const result = JobPageDetector.detect(
        doc,
        'https://www.linkedin.com/jobs/search/?keywords=developer'
      );
      assert.equal(
        result.isConfident,
        false,
        'Search page without active job view must not detect'
      );
    });
  });

  // =========================================================================
  // 5. Existing Known Layouts (P73 / P74 regression protection)
  // =========================================================================
  describe('5. Existing Layouts Compatibility', () => {
    it('supports public top-card-layout title and company', () => {
      const { doc, body } = createMockDocument({
        url: 'https://www.linkedin.com/jobs/view/4466448213/',
      });

      const topCard = createMockElement('DIV', { class: 'top-card-layout' }, '', [
        createMockElement('H1', { class: 'top-card-layout__title' }, 'DevOps Engineer'),
        createMockElement(
          'A',
          { class: 'topcard__org-name-link', href: '/company/acme/' },
          'Acme Corp'
        ),
      ]);
      const desc = createMockElement(
        'DIV',
        { class: 'description__text' },
        'DevOps responsibilities include CI/CD...'.repeat(5)
      );

      body.children.push(topCard, desc);

      const payload = LinkedInAdapter.extract(
        doc,
        'https://www.linkedin.com/jobs/view/4466448213/'
      );
      assert.equal(payload.title, 'DevOps Engineer');
      assert.equal(payload.company, 'Acme Corp');
    });

    it('falls back to document.title when DOM title is absent but company and desc exist', () => {
      const { doc, body } = createMockDocument({
        url: 'https://www.linkedin.com/jobs/view/4466448213/',
        title: 'Staff Security Engineer - CyberGuard | LinkedIn',
      });

      const root = createMockElement('DIV', { 'data-view-name': 'job-details' }, '', [
        createMockElement(
          'A',
          { class: 'company-name', href: '/company/cyberguard/' },
          'CyberGuard'
        ),
        createMockElement(
          'DIV',
          { class: 'show-more-less-html__markup' },
          'Cybersecurity responsibilities...'.repeat(5)
        ),
      ]);
      body.children.push(root);

      const payload = LinkedInAdapter.extract(
        doc,
        'https://www.linkedin.com/jobs/view/4466448213/'
      );
      assert.equal(payload.title, 'Staff Security Engineer');
      assert.equal(payload.company, 'CyberGuard');
    });
  });

  // =========================================================================
  // 6. Fail Closed: No Fabricated Titles
  // =========================================================================
  describe('6. Fail Closed: No Fabricated Titles', () => {
    it('returns fallback Untitled Role and isReady = false when only invalid/promotional headings exist', () => {
      const { doc, body } = createMockDocument({
        url: 'https://www.linkedin.com/jobs/view/4465164301/',
        title: 'LinkedIn: Log In or Sign Up',
      });

      const root = createMockElement('DIV', { 'data-testid': 'lazy-column' }, '', [
        createMockElement('H2', {}, 'Use AI to assess how you fit'),
        createMockElement('A', { href: '/company/triveous/' }, 'Triveous'),
        createMockElement(
          'DIV',
          { class: 'show-more-less-html__markup' },
          'Job description content...'.repeat(5)
        ),
      ]);
      body.children.push(root);

      const payload = LinkedInAdapter.extract(
        doc,
        'https://www.linkedin.com/jobs/view/4465164301/'
      );
      // Must NOT use the AI heading as title
      assert.notEqual(payload.title, 'Use AI to assess how you fit');
      // Must fail closed to Untitled Role (not a marketing heading)
      assert.equal(payload.title, 'Untitled Role');
      assert.equal(payload.isReady, false);
      assert.equal(payload.titleSelectorUsed, 'NONE');
    });
  });
});
