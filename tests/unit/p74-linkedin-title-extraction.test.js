/**
 * @file P74 Unit Tests: LinkedIn Robust Title Extraction & Marketing Heading Suppression.
 *
 * Verifies:
 * 1. Dedicated Root Discovery:
 *    - Dedicated containers ([data-testid="lazy-column"], [data-view-name="job-details"],
 *      .jobs-search__job-details, .jobs-details__main-content, .job-view-layout,
 *      .job-details-jobs-unified-top-card, .details) outrank generic main containers
 *      (main#main-content, main.main, main).
 * 2. Removal of Generic Heading Extraction:
 *    - Generic querySelector('h1') or querySelector('h2') cannot pull marketing/premium headings.
 * 3. Marketing/Upsell Heading Rejection:
 *    - Headings inside aside, modal, dialog, recommendation, upsell, premium sections,
 *      or positioned below the job description are rejected by isValidLinkedInTitleCandidate.
 * 4. Company/Title Pair Validation:
 *    - A candidate title from outside the active top card is rejected when company is in the top card.
 * 5. Document Title Fallback:
 *    - When DOM title extraction yields nothing, document.title fallback activates for active job context
 *      (including pipe formats and dash formats: "Title - Company | LinkedIn").
 * 6. Diagnostics Extraction:
 *    - selectedRootSelector, selectedRootTag, selectedRootClass, titleSelectorUsed,
 *      companySelectorUsed, descriptionSelectorUsed are populated and exposed.
 * 7. Negative Regressions:
 *    - Marketing headings, LinkedIn feed, profile, ChatGPT, and GitHub do not trigger false detection.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  LinkedInAdapter,
  findActiveLinkedInJobRoot,
  isValidLinkedInTitleCandidate,
  isElementAfter,
  EXPLICIT_JOB_TITLE_SELECTORS,
  NON_JOB_CONTAINER_SELECTORS,
} from '../../extension/job-detection/adapters/linkedin.adapter.js';

import { JobPageDetector } from '../../extension/job-detection/job-page-detector.js';

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

        // Tag + attribute e.g. h1[class*="title" i]
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

        // Tag only
        if (normSel === node.tagName.toLowerCase()) return true;

        // ID only
        if (normSel.startsWith('#') && !normSel.includes(' ')) {
          return node.id.toLowerCase() === normSel.slice(1);
        }

        // Class only
        if (normSel.startsWith('.') && !normSel.includes('[') && !normSel.includes(' ') && !normSel.slice(1).includes('.')) {
          return node.classList.contains(normSel.slice(1));
        }

        // Tag with class e.g. h1.t-24
        const tagClassMatch = normSel.match(/^([a-z0-9]+)\.([a-z0-9_-]+)$/i);
        if (tagClassMatch) {
          const [, expectedTag, expectedClass] = tagClassMatch;
          return node.tagName.toLowerCase() === expectedTag.toLowerCase() && node.classList.contains(expectedClass);
        }

        // Attribute only [attr*="val"] or [attr="val"]
        const attrMatch = normSel.match(/^\[([a-z0-9_-]+)([\*~^$]?=)?["']?([^"'\]\s]+)?["']?\s*[a-z]*\]$/i);
        if (attrMatch) {
          const [, attrName, op, expectedVal] = attrMatch;
          const actualVal = (attrName === 'class' || attrName === 'className') ? node.className : node.getAttribute(attrName);
          if (actualVal === null || actualVal === undefined) return false;
          if (!op) return true;
          if (op === '=') return actualVal.toLowerCase() === expectedVal.toLowerCase();
          if (op === '*=') return actualVal.toLowerCase().includes(expectedVal.toLowerCase());
        }

        // Role heading
        if (normSel === '[role="heading"]' && node.getAttribute('role') === 'heading') return true;

        // Anchor with href match
        if (normSel.includes('a[href*="/company/"]') && node.tagName.toLowerCase() === 'a') {
          return (node.getAttribute('href') || '').includes('/company/');
        }

        // Headings query: h1, h2, h3
        if (normSel === 'h1, h2, h3' || normSel === 'h1, h2') {
          return ['h1', 'h2', 'h3'].includes(node.tagName.toLowerCase());
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
        // Attribute match in closest
        const m = normSel.match(/\[([a-z0-9_-]+)([\*~^$]?=)?["']?([^"'\]\s]+)?["']?\s*[a-z]*\]/i);
        if (m) {
          const [, attrName, op, expectedVal] = m;
          const actualVal = (attrName === 'class' || attrName === 'className') ? curr.className : curr.getAttribute(attrName);
          if (actualVal) {
            if (!op || (op === '*=' && actualVal.toLowerCase().includes(expectedVal.toLowerCase()))) {
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
    location: { href: options.url || 'https://www.linkedin.com/jobs/view/4466448213/' },
    querySelector(sel) {
      return body.querySelector(sel);
    },
    querySelectorAll(sel) {
      return body.querySelectorAll(sel);
    },
  };

  return { doc, body };
}

describe('P74: LinkedIn Robust Title Extraction & Marketing Heading Suppression', () => {
  // =========================================================================
  // 1. Dedicated Root Discovery Ranking
  // =========================================================================
  describe('1. Dedicated Root Discovery Ranking', () => {
    it('outranks generic main#main-content with dedicated [data-view-name="job-details"]', () => {
      const { doc, body } = createMockDocument();
      // Generic main has a marketing h1 and company link
      const mainContent = createMockElement('MAIN', { id: 'main-content' }, '', [
        createMockElement('H1', {}, 'Take the next step in your job search'),
        createMockElement('A', { href: '/company/quik-hire/' }, 'Quik Hire Staffing'),
      ]);
      // Dedicated job details container has actual job title and company
      const dedicatedDetails = createMockElement('DIV', { 'data-view-name': 'job-details' }, '', [
        createMockElement('H1', { class: 'job-title' }, 'Backend Software Engineer (Remote)'),
        createMockElement('A', { class: 'company-name', href: '/company/quik-hire/' }, 'Quik Hire Staffing'),
        createMockElement('DIV', { class: 'show-more-less-html__markup' }, 'Core backend responsibilities...'.repeat(5)),
      ]);
      body.children.push(mainContent, dedicatedDetails);

      const root = findActiveLinkedInJobRoot(doc);
      assert.ok(root, 'Root must be found');
      assert.equal(root.getAttribute('data-view-name'), 'job-details');
      assert.notEqual(root.id, 'main-content', 'Generic main must not be selected over dedicated container');
    });

    it('outranks generic main with dedicated [data-testid="lazy-column"]', () => {
      const { doc, body } = createMockDocument();
      const mainEl = createMockElement('MAIN', { class: 'main' }, '', [
        createMockElement('H1', {}, 'Promoted Content'),
        createMockElement('A', { href: '/company/test/' }, 'Test Corp'),
      ]);
      const lazyCol = createMockElement('DIV', { 'data-testid': 'lazy-column' }, '', [
        createMockElement('H1', { class: 'job-title' }, 'Principal Cloud Architect'),
        createMockElement('A', { class: 'company-name', href: '/company/test/' }, 'Test Corp'),
        createMockElement('DIV', { class: 'show-more-less-html__markup' }, 'Architecture responsibilities...'.repeat(5)),
      ]);
      body.children.push(mainEl, lazyCol);

      const root = findActiveLinkedInJobRoot(doc);
      assert.ok(root);
      assert.equal(root.getAttribute('data-testid'), 'lazy-column');
    });
  });

  // =========================================================================
  // 2. Primary Title Extraction Does Not Use Generic Headings
  // =========================================================================
  describe('2. Removal of Generic Headings from Primary Title Extraction', () => {
    it('does not select a bare H1 or H2 as job title when explicit selectors fail inside root', () => {
      const { doc, body } = createMockDocument();
      // Container has only a bare h1 that says marketing text and no explicit title class
      const jobRoot = createMockElement('DIV', { 'data-view-name': 'job-details' }, '', [
        createMockElement('H1', { class: 'marketing-upsell' }, 'Take the next step in your job search'),
        createMockElement('A', { href: '/company/quik-hire/' }, 'Quik Hire Staffing'),
        createMockElement('DIV', { class: 'show-more-less-html__markup' }, 'Backend engineering job description text...'.repeat(5)),
      ]);
      body.children.push(jobRoot);

      const payload = LinkedInAdapter.extract(doc, 'https://www.linkedin.com/jobs/view/4466448213/');
      // Because marketing h1 has no explicit title class and is not inside top-card,
      // it must NEVER become the job title.
      assert.notEqual(payload.title, 'Take the next step in your job search');
    });
  });

  // =========================================================================
  // 3. Marketing/Upsell Heading Suppression & Validation
  // =========================================================================
  describe('3. isValidLinkedInTitleCandidate Suppression Rules', () => {
    it('rejects headings located in marketing, upsell, and promo containers', () => {
      const { doc } = createMockDocument();
      const upsellSection = createMockElement('DIV', { class: 'premium-upsell' }, '', []);
      const heading = createMockElement('H2', {}, 'Take the next step in your job search');
      upsellSection.children.push(heading);
      heading.parentElement = upsellSection;

      const isValid = isValidLinkedInTitleCandidate(heading, null, doc);
      assert.equal(isValid, false, 'Heading inside premium upsell must be rejected');
    });

    it('rejects headings located in aside, similar jobs, and recommendation containers', () => {
      const { doc } = createMockDocument();
      const aside = createMockElement('ASIDE', {}, '', []);
      const heading = createMockElement('H2', {}, 'Similar Jobs');
      aside.children.push(heading);
      heading.parentElement = aside;

      const isValid = isValidLinkedInTitleCandidate(heading, null, doc);
      assert.equal(isValid, false, 'Heading inside aside must be rejected');
    });

    it('rejects headings located below the job description container', () => {
      const { doc, body } = createMockDocument();
      const titleCandidate = createMockElement('H2', { class: 't-24' }, 'Take the next step in your job search');
      const descEl = createMockElement('DIV', { id: 'job-details' }, 'Job description content here '.repeat(10));
      const root = createMockElement('DIV', { 'data-view-name': 'job-details' }, '', [
        descEl,
        titleCandidate, // Located below description in document order
      ]);
      body.children.push(root);

      assert.equal(isElementAfter(titleCandidate, descEl), true);
      const isValid = isValidLinkedInTitleCandidate(titleCandidate, root, doc);
      assert.equal(isValid, false, 'Candidate below description must be rejected');
    });
  });

  // =========================================================================
  // 4. Company/Title Pair Validation
  // =========================================================================
  describe('4. Company/Title Pair Validation', () => {
    it('rejects candidate title from outside top card when company is in top card', () => {
      const { doc, body } = createMockDocument();
      const companyEl = createMockElement('A', { class: 'topcard__org-name-link', href: '/company/quik-hire/' }, 'Quik Hire Staffing');
      const topCard = createMockElement('DIV', { class: 'job-details-jobs-unified-top-card' }, '', [
        companyEl,
      ]);
      const lowerCandidate = createMockElement('H2', { class: 't-24' }, 'Take the next step in your job search');
      const root = createMockElement('DIV', { class: 'jobs-details__main-content' }, '', [
        topCard,
        lowerCandidate,
      ]);
      body.children.push(root);

      const isValid = isValidLinkedInTitleCandidate(lowerCandidate, root, doc, companyEl);
      assert.equal(isValid, false, 'Candidate title outside top card must be rejected when company is in top card');
    });

    it('accepts title candidate when it resides inside the same top card as company', () => {
      const { doc, body } = createMockDocument();
      const companyEl = createMockElement('A', { class: 'topcard__org-name-link', href: '/company/quik-hire/' }, 'Quik Hire Staffing');
      const titleEl = createMockElement('H1', { class: 'job-title' }, 'Backend Software Engineer (Remote)');
      const topCard = createMockElement('DIV', { class: 'job-details-jobs-unified-top-card' }, '', [
        titleEl,
        companyEl,
      ]);
      const root = createMockElement('DIV', { class: 'jobs-details__main-content' }, '', [
        topCard,
      ]);
      body.children.push(root);

      const isValid = isValidLinkedInTitleCandidate(titleEl, root, doc, companyEl);
      assert.equal(isValid, true, 'Title inside top card with company must be accepted');
    });
  });

  // =========================================================================
  // 5. Document Title Fallback
  // =========================================================================
  describe('5. Resilient document.title Fallback', () => {
    it('extracts title and company from document.title with 3-part pipe format', () => {
      const { doc, body } = createMockDocument({
        title: 'Backend Software Engineer (Remote) | Quik Hire Staffing | LinkedIn',
      });
      // DOM contains dedicated root and description but missing explicit title element
      const root = createMockElement('DIV', { 'data-view-name': 'job-details' }, '', [
        createMockElement('DIV', { class: 'show-more-less-html__markup' }, 'Requirements and details...'.repeat(5)),
      ]);
      body.children.push(root);

      const payload = LinkedInAdapter.extract(doc, 'https://www.linkedin.com/jobs/view/4466448213/');
      assert.equal(payload.title, 'Backend Software Engineer (Remote)');
      assert.equal(payload.company, 'Quik Hire Staffing');
      assert.equal(payload.titleSelectorUsed, 'DOCUMENT_TITLE');
    });

    it('extracts title and company from document.title with dash format (Title - Company | LinkedIn)', () => {
      const { doc, body } = createMockDocument({
        title: 'Backend Software Engineer (Remote) - Quik Hire Staffing | LinkedIn',
      });
      const root = createMockElement('DIV', { 'data-view-name': 'job-details' }, '', [
        createMockElement('DIV', { class: 'show-more-less-html__markup' }, 'Requirements and details...'.repeat(5)),
      ]);
      body.children.push(root);

      const payload = LinkedInAdapter.extract(doc, 'https://www.linkedin.com/jobs/view/4466448213/');
      assert.equal(payload.title, 'Backend Software Engineer (Remote)');
      assert.equal(payload.company, 'Quik Hire Staffing');
      assert.equal(payload.titleSelectorUsed, 'DOCUMENT_TITLE');
    });
  });

  // =========================================================================
  // 6. Diagnostics Reporting on Extraction Payload & Detector
  // =========================================================================
  describe('6. Diagnostics Extraction & Detector Forwarding', () => {
    it('populates root, title, company, and description selector diagnostics on payload', () => {
      const { doc, body } = createMockDocument();
      const jobRoot = createMockElement('DIV', { 'data-view-name': 'job-details', class: 'jobs-details' }, '', [
        createMockElement('H1', { class: 'job-title' }, 'Backend Software Engineer (Remote)'),
        createMockElement('A', { class: 'company-name', href: '/company/quik-hire/' }, 'Quik Hire Staffing'),
        createMockElement('DIV', { class: 'show-more-less-html__markup' }, 'Job description content here...'.repeat(5)),
      ]);
      body.children.push(jobRoot);

      const payload = LinkedInAdapter.extract(doc, 'https://www.linkedin.com/jobs/view/4466448213/');
      assert.equal(payload.selectedRootSelector, '[data-view-name="job-details"]');
      assert.equal((payload.selectedRootTag || '').toLowerCase(), 'div');
      assert.equal(payload.selectedRootClass, 'jobs-details');
      assert.ok(payload.titleSelectorUsed);
      assert.ok(payload.companySelectorUsed);
      assert.equal(payload.descriptionSelectorUsed, '.show-more-less-html__markup');

      // Forwarded via JobPageDetector
      const detected = JobPageDetector.detect(doc, 'https://www.linkedin.com/jobs/view/4466448213/');
      assert.equal(detected.selectedRootSelector, '[data-view-name="job-details"]');
      assert.equal(detected.titleSelectorUsed, payload.titleSelectorUsed);
      assert.equal(detected.companySelectorUsed, payload.companySelectorUsed);
      assert.equal(detected.descriptionSelectorUsed, '.show-more-less-html__markup');
    });
  });

  // =========================================================================
  // 7. Proven Live Bug Scenario: Correct Title vs Marketing Heading
  // =========================================================================
  describe('7. Proven Live Bug Scenario Acceptance', () => {
    it('correctly extracts Backend Software Engineer (Remote) at Quik Hire Staffing, rejecting Take the next step', () => {
      const { doc, body } = createMockDocument();
      // Realistic LinkedIn layout structure for 4466448213:
      // Page has generic main#main-content
      // Active detail root has top-card with explicit job-title
      // Below the description, there is a promo / marketing banner
      const topCard = createMockElement('DIV', { class: 'job-details-jobs-unified-top-card' }, '', [
        createMockElement('H1', { class: 'job-title' }, 'Backend Software Engineer (Remote)'),
        createMockElement('A', { class: 'job-details-jobs-unified-top-card__company-name', href: '/company/quik-hire/' }, 'Quik Hire Staffing'),
      ]);
      const descSection = createMockElement('DIV', { class: 'show-more-less-html__markup' }, 'Backend Software Engineer role with Node.js and distributed systems '.repeat(5));
      const marketingBanner = createMockElement('DIV', { class: 'premium-upsell' }, '', [
        createMockElement('H2', {}, 'Take the next step in your job search'),
      ]);

      const jobDetailsRoot = createMockElement('DIV', { 'data-view-name': 'job-details' }, '', [
        topCard,
        descSection,
        marketingBanner,
      ]);

      const mainContent = createMockElement('MAIN', { id: 'main-content' }, '', [
        jobDetailsRoot,
      ]);
      body.children.push(mainContent);

      const payload = LinkedInAdapter.extract(doc, 'https://www.linkedin.com/jobs/view/4466448213/');
      assert.equal(payload.title, 'Backend Software Engineer (Remote)');
      assert.equal(payload.company, 'Quik Hire Staffing');
      assert.notEqual(payload.title, 'Take the next step in your job search');
      assert.equal(payload.provider, 'LINKEDIN');
      assert.equal(payload.isReady, true);
      assert.equal(payload.analysisReady, true);
    });
  });

  // =========================================================================
  // 8. Negative Tests
  // =========================================================================
  describe('8. Negative Regression Tests', () => {
    it('LinkedIn feed returns canHandle=false', () => {
      const { doc } = createMockDocument({ url: 'https://www.linkedin.com/feed/' });
      assert.equal(LinkedInAdapter.canHandle(doc, 'https://www.linkedin.com/feed/'), false);
    });

    it('LinkedIn profile returns canHandle=false', () => {
      const { doc } = createMockDocument({ url: 'https://www.linkedin.com/in/someuser/' });
      assert.equal(LinkedInAdapter.canHandle(doc, 'https://www.linkedin.com/in/someuser/'), false);
    });

    it('ChatGPT conversation returns canHandle=false', () => {
      const { doc } = createMockDocument({ url: 'https://chatgpt.com/c/1234' });
      assert.equal(LinkedInAdapter.canHandle(doc, 'https://chatgpt.com/c/1234'), false);
    });

    it('GitHub repo returns canHandle=false', () => {
      const { doc } = createMockDocument({ url: 'https://github.com/vishu1803/Ai-job-mcp' });
      assert.equal(LinkedInAdapter.canHandle(doc, 'https://github.com/vishu1803/Ai-job-mcp'), false);
    });
  });
});
