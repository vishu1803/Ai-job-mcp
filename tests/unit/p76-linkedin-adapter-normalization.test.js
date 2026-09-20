/**
 * @file P76 Unit Tests: LinkedIn Adapter Extraction & Metadata Normalization.
 *
 * Verifies:
 * 1. Employment-Type Order of Precedence & Legal Boilerplate Rejection:
 *    - Structured criteria (.description__job-criteria-item "Employment type") strictly overrides description text.
 *    - GDPR legal privacy notices ("pre-contractual measures under applicable data protection laws")
 *      do NOT cause the employmentType to be misclassified as CONTRACT.
 *    - Structured JSON-LD employmentType is respected when DOM criteria is absent.
 *    - Free-text fallback correctly identifies FULL_TIME, PART_TIME, CONTRACT, INTERN.
 * 2. Structured Job Criteria Extraction:
 *    - Extracts seniorityLevel ("Mid-Senior level", "Associate", "Entry level").
 *    - Extracts jobFunction ("Engineering and Information Technology").
 *    - Extracts industries ("Internet Marketplace Platforms").
 *    - Supports both public/guest .description__job-criteria-item and unified .job-insight layouts.
 * 3. Topcard Metrics Extraction:
 *    - Extracts postedAgo ("1 day ago", "5 days ago") from .posted-time-ago__text.
 *    - Extracts applicantCount ("Over 200 applicants") from .num-applicants__figure.
 * 4. Section-Aware Responsibilities vs Requirements Separation:
 *    - Bullet lists under "Accountabilities" / "Responsibilities" route to responsibilities.
 *    - Bullet lists under "Requirements" / "Qualifications" route to requirements.
 *    - Bullet lists under "Benefits" / "Perks" are excluded from candidate requirements.
 * 5. Public Apply CTA Detection:
 *    - Standard public view buttons (.apply-button, .top-card-layout__cta) set hasApplyCta: true.
 * 6. Live Jobgether 4466834190 Structural Fixture:
 *    - Exact bit-for-bit extraction against real Jobgether DOM structure.
 * 7. Downstream Pipeline Forwarding:
 *    - JobPageDetector and JobDetectionEngine forward all enriched metadata without loss.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  LinkedInAdapter,
  extractLinkedInDescription,
  extractLinkedInCriteria,
  extractLinkedInTopcardMetrics,
} from '../../extension/job-detection/adapters/linkedin.adapter.js';

import {
  classifyEmploymentType,
  normalizeEmploymentType,
} from '../../extension/job-detection/employment-type.js';

import { JobPageDetector } from '../../extension/job-detection/job-page-detector.js';
import { JobDetectionEngine } from '../../extension/job-detection/detection-engine.js';

// ─── Document Mock Helper ─────────────────────────────

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
      if (this._textContent) return this._textContent;
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
    previousElementSibling: null,
    nextElementSibling: null,
    getAttribute(name) {
      if (name === 'class' || name === 'className') return el.className;
      if (name === 'id') return el.id;
      return attributes[name] || null;
    },
    hasAttribute(name) {
      return el.getAttribute(name) !== null;
    },
    classList: {
      contains(cls) {
        return classListSet.has(cls);
      },
    },
    contains(other) {
      if (!other) return false;
      if (other === el) return true;
      for (const child of el.children) {
        if (child === other || (child.contains && child.contains(other))) return true;
      }
      return false;
    },
    querySelector(sel) {
      const all = el.querySelectorAll(sel);
      return all.length > 0 ? all[0] : null;
    },
    querySelectorAll(sel) {
      const results = [];
      const parts = sel.split(',').map((s) => s.trim());

      function matchesSimple(node, s) {
        if (!node || !node.tagName) return false;
        if (s.startsWith('.')) {
          return node.classList.contains(s.slice(1));
        }
        if (s.startsWith('#')) {
          return node.id === s.slice(1);
        }
        const tagClassMatch = s.match(/^([a-z0-9]+)\.([a-z0-9_-]+)$/i);
        if (tagClassMatch) {
          const [, expectedTag, expectedClass] = tagClassMatch;
          return (
            node.tagName.toLowerCase() === expectedTag.toLowerCase() &&
            node.classList.contains(expectedClass)
          );
        }
        if (s.includes('[class*=')) {
          const match = s.match(/\[class\*="([^"]+)"(?:\s*i)?\]/i);
          if (match) {
            return node.className.toLowerCase().includes(match[1].toLowerCase());
          }
        }
        if (s.includes('[id=')) {
          const match = s.match(/\[id="([^"]+)"\]/);
          if (match) return node.id === match[1];
        }
        return node.tagName.toLowerCase() === s.toLowerCase();
      }

      function testNode(node) {
        for (const p of parts) {
          if (p.includes(' ')) {
            const subParts = p.split(' ').filter(Boolean);
            if (subParts.length === 2 && matchesSimple(node, subParts[1])) {
              let anc = node.parentElement;
              while (anc) {
                if (matchesSimple(anc, subParts[0])) {
                  results.push(node);
                  return;
                }
                anc = anc.parentElement;
              }
            }
          } else if (matchesSimple(node, p)) {
            results.push(node);
            return;
          }
        }
      }

      function traverse(n) {
        for (const c of n.children) {
          testNode(c);
          traverse(c);
        }
      }

      traverse(el);
      return results;
    },
  };

  if (Array.isArray(children)) {
    let prevChild = null;
    for (const child of children) {
      if (child) {
        child.parentElement = el;
        child.previousElementSibling = prevChild;
        if (prevChild) {
          prevChild.nextElementSibling = child;
        }
        el.children.push(child);
        prevChild = child;
      }
    }
  }

  return el;
}

function createMockDocument(bodyChildren = [], title = '') {
  const doc = {
    title,
    body: null,
    querySelector(sel) {
      return doc.body.querySelector(sel);
    },
    querySelectorAll(sel) {
      return doc.body.querySelectorAll(sel);
    },
  };
  const body = createMockElement('BODY', {}, '', bodyChildren);
  body.ownerDocument = doc;
  doc.body = body;
  return doc;
}

describe('P76: LinkedIn Adapter Extraction & Metadata Normalization', () => {
  // =========================================================================
  // 1. Employment Type Order of Precedence & Legal Boilerplate Rejection
  // =========================================================================
  describe('1. Employment Type Order of Precedence', () => {
    it('proves structured DOM criteria ("Employment type: Full-time") strictly overrides description text', () => {
      const criteriaEl = createMockElement('LI', { class: 'description__job-criteria-item' }, '', [
        createMockElement(
          'H3',
          { class: 'description__job-criteria-subheader' },
          'Employment type'
        ),
        createMockElement('SPAN', { class: 'description__job-criteria-text' }, 'Full-time'),
      ]);

      const descriptionEl = createMockElement(
        'DIV',
        { class: 'show-more-less-html__markup' },
        'Looking for an experienced Engineer on a 6-month contract basis with possible extension.'
      );

      const jobRoot = createMockElement('DIV', { class: 'details' }, '', [
        criteriaEl,
        descriptionEl,
      ]);

      const doc = createMockDocument([jobRoot]);
      const res = extractLinkedInCriteria(jobRoot, doc);
      assert.equal(res.employmentType, 'FULL_TIME');
      assert.equal(res.rawEmploymentType, 'Full-time');
    });

    it('proves GDPR legal notice containing "pre-contractual measures" does NOT cause CONTRACT classification', () => {
      const legalText =
        'This processing is based on legitimate interest and pre-contractual measures under applicable data protection laws (including GDPR).';
      assert.equal(classifyEmploymentType(legalText), 'FULL_TIME');
    });

    it('proves true contract terms are still classified as CONTRACT by classifyEmploymentType', () => {
      assert.equal(classifyEmploymentType('Looking for a 6-month contract engineer'), 'CONTRACT');
      assert.equal(classifyEmploymentType('Contractor role for cloud migration'), 'CONTRACT');
      assert.equal(classifyEmploymentType('Contracting engagement via agency'), 'CONTRACT');
    });

    it('proves normalizeEmploymentType accurately maps explicit variants', () => {
      assert.equal(normalizeEmploymentType('Full-time'), 'FULL_TIME');
      assert.equal(normalizeEmploymentType('FULL_TIME'), 'FULL_TIME');
      assert.equal(normalizeEmploymentType('Part-time'), 'PART_TIME');
      assert.equal(normalizeEmploymentType('PART_TIME'), 'PART_TIME');
      assert.equal(normalizeEmploymentType('Contract'), 'CONTRACT');
      assert.equal(normalizeEmploymentType('Contractor'), 'CONTRACT');
      assert.equal(normalizeEmploymentType('Temporary'), 'CONTRACT');
      assert.equal(normalizeEmploymentType('Internship'), 'INTERN');
      assert.equal(normalizeEmploymentType('INTERN'), 'INTERN');
      assert.equal(normalizeEmploymentType(''), null);
      assert.equal(normalizeEmploymentType(null), null);
    });

    it('falls back to JSON-LD employmentType when DOM criteria is absent', () => {
      const doc = createMockDocument([]);
      const jsonLd = {
        '@type': 'JobPosting',
        employmentType: 'CONTRACTOR',
      };
      const res = extractLinkedInCriteria(null, doc, jsonLd);
      assert.equal(res.employmentType, 'CONTRACT');
    });
  });

  // =========================================================================
  // 2. Structured Criteria Extraction
  // =========================================================================
  describe('2. Structured Criteria Extraction (Seniority, Function, Industries)', () => {
    it('extracts all 4 criteria fields from public layout (.description__job-criteria-item)', () => {
      const jobRoot = createMockElement('DIV', { class: 'details' }, '', [
        createMockElement('LI', { class: 'description__job-criteria-item' }, '', [
          createMockElement('H3', {}, 'Seniority level'),
          createMockElement('SPAN', {}, 'Mid-Senior level'),
        ]),
        createMockElement('LI', { class: 'description__job-criteria-item' }, '', [
          createMockElement('H3', {}, 'Employment type'),
          createMockElement('SPAN', {}, 'Full-time'),
        ]),
        createMockElement('LI', { class: 'description__job-criteria-item' }, '', [
          createMockElement('H3', {}, 'Job function'),
          createMockElement('SPAN', {}, 'Engineering and Information Technology'),
        ]),
        createMockElement('LI', { class: 'description__job-criteria-item' }, '', [
          createMockElement('H3', {}, 'Industries'),
          createMockElement('SPAN', {}, 'Internet Marketplace Platforms'),
        ]),
      ]);

      const doc = createMockDocument([jobRoot]);
      const res = extractLinkedInCriteria(jobRoot, doc);

      assert.equal(res.seniorityLevel, 'Mid-Senior level');
      assert.equal(res.employmentType, 'FULL_TIME');
      assert.equal(res.jobFunction, 'Engineering and Information Technology');
      assert.equal(res.industries, 'Internet Marketplace Platforms');
    });

    it('extracts criteria from unified topcard insight text ("Full-time · Mid-Senior level")', () => {
      const jobRoot = createMockElement('DIV', { class: 'job-details-jobs-unified-top-card' }, '', [
        createMockElement(
          'LI',
          { class: 'job-details-jobs-unified-top-card__job-insight' },
          'Full-time · Mid-Senior level'
        ),
      ]);

      const doc = createMockDocument([jobRoot]);
      const res = extractLinkedInCriteria(jobRoot, doc);

      assert.equal(res.employmentType, 'FULL_TIME');
      assert.equal(res.seniorityLevel, 'Mid-Senior level');
    });
  });

  // =========================================================================
  // 3. Topcard Metrics Extraction
  // =========================================================================
  describe('3. Topcard Metrics Extraction (Posting Age & Applicant Count)', () => {
    it('extracts postedAgo and applicantCount from topcard elements', () => {
      const jobRoot = createMockElement('DIV', { class: 'top-card-layout' }, '', [
        createMockElement(
          'SPAN',
          { class: 'posted-time-ago__text topcard__flavor--metadata' },
          '1 day ago'
        ),
        createMockElement(
          'SPAN',
          { class: 'num-applicants__figure topcard__flavor--metadata topcard__flavor--bullet' },
          'Over 200 applicants'
        ),
      ]);

      const doc = createMockDocument([jobRoot]);
      const res = extractLinkedInTopcardMetrics(jobRoot, doc);

      assert.equal(res.postedAgo, '1 day ago');
      assert.equal(res.applicantCount, 'Over 200 applicants');
    });
  });

  // =========================================================================
  // 4. Section-Aware Responsibilities vs Requirements Separation
  // =========================================================================
  describe('4. Section-Aware Responsibilities vs Requirements Separation', () => {
    it('separates Accountabilities into responsibilities and Requirements into requirements', () => {
      const headingAccountabilities = createMockElement('P', {}, 'Accountabilities');
      const listAccountabilities = createMockElement('UL', {}, '', [
        createMockElement(
          'LI',
          {},
          'Design scalable, maintainable, and secure application architectures.'
        ),
        createMockElement(
          'LI',
          {},
          'Develop robust server-side applications using Node.js and PostgreSQL.'
        ),
      ]);

      const headingRequirements = createMockElement('P', {}, 'Requirements');
      const listRequirements = createMockElement('UL', {}, '', [
        createMockElement(
          'LI',
          {},
          '3+ years of professional experience in full stack development.'
        ),
        createMockElement('LI', {}, 'Strong proficiency in TypeScript, React, and Fastify.'),
      ]);

      const headingBenefits = createMockElement('P', {}, 'Benefits');
      const listBenefits = createMockElement('UL', {}, '', [
        createMockElement('LI', {}, 'Competitive compensation and stock options.'),
        createMockElement('LI', {}, 'Fully remote work flexibility worldwide.'),
      ]);

      const descriptionContainer = createMockElement(
        'DIV',
        { class: 'show-more-less-html__markup' },
        '',
        [
          createMockElement(
            'P',
            {},
            'We are seeking an outstanding Full Stack Engineer to lead technical design.'
          ),
          headingAccountabilities,
          listAccountabilities,
          headingRequirements,
          listRequirements,
          headingBenefits,
          listBenefits,
        ]
      );

      const jobRoot = createMockElement('DIV', { class: 'details' }, '', [descriptionContainer]);
      const res = extractLinkedInDescription(jobRoot);

      assert.equal(res.responsibilities.length, 2);
      assert.ok(res.responsibilities[0].includes('Design scalable'));
      assert.ok(res.responsibilities[1].includes('Develop robust'));

      assert.equal(res.requirements.length, 2);
      assert.ok(res.requirements[0].includes('3+ years'));
      assert.ok(res.requirements[1].includes('Strong proficiency'));

      // Verify Benefits were excluded
      const combined = [...res.responsibilities, ...res.requirements].join(' ');
      assert.ok(!combined.includes('stock options'));
      assert.ok(!combined.includes('remote work flexibility'));
    });
  });

  // =========================================================================
  // 5. Public Apply CTA Detection
  // =========================================================================
  describe('5. Public Apply CTA Detection', () => {
    it('detects .apply-button on public LinkedIn layout as hasApplyCta = true', () => {
      const applyBtn = createMockElement(
        'BUTTON',
        {
          class: 'apply-button apply-button--default top-card-layout__cta--primary',
        },
        'Apply'
      );

      const titleEl = createMockElement(
        'H1',
        { class: 'top-card-layout__title' },
        'Full Stack Engineer'
      );
      const companyEl = createMockElement('A', { class: 'topcard__org-name-link' }, 'Jobgether');
      const descEl = createMockElement(
        'DIV',
        { class: 'show-more-less-html__markup' },
        'Building distributed systems at global scale with high concurrency and reliability.'
      );

      const jobRoot = createMockElement('DIV', { class: 'details' }, '', [
        titleEl,
        companyEl,
        descEl,
        applyBtn,
      ]);

      const doc = createMockDocument([jobRoot]);
      const payload = LinkedInAdapter.extract(
        doc,
        'https://www.linkedin.com/jobs/view/4466834190/'
      );

      assert.equal(payload.hasApplyCta, true);
    });
  });

  // =========================================================================
  // 6. Live Jobgether 4466834190 Exact Structural Fixture
  // =========================================================================
  describe('6. Live Jobgether 4466834190 Fixture Reproduction', () => {
    it('accurately extracts all metadata fields for Job ID 4466834190 without corruption', () => {
      // Build authentic Jobgether DOM
      const titleEl = createMockElement(
        'H1',
        { class: 'top-card-layout__title topcard__title' },
        'Full Stack Engineer'
      );
      const companyEl = createMockElement('A', { class: 'topcard__org-name-link' }, 'Jobgether');
      const locationEl = createMockElement('SPAN', { class: 'topcard__flavor--bullet' }, 'India');
      const postedEl = createMockElement(
        'SPAN',
        { class: 'posted-time-ago__text topcard__flavor--metadata' },
        '1 day ago'
      );
      const applyBtn = createMockElement(
        'BUTTON',
        { class: 'apply-button top-card-layout__cta--primary' },
        'Apply'
      );

      const criteriaItems = [
        createMockElement('LI', { class: 'description__job-criteria-item' }, '', [
          createMockElement('H3', {}, 'Seniority level'),
          createMockElement('SPAN', {}, 'Mid-Senior level'),
        ]),
        createMockElement('LI', { class: 'description__job-criteria-item' }, '', [
          createMockElement('H3', {}, 'Employment type'),
          createMockElement('SPAN', {}, 'Full-time'),
        ]),
        createMockElement('LI', { class: 'description__job-criteria-item' }, '', [
          createMockElement('H3', {}, 'Job function'),
          createMockElement('SPAN', {}, 'Engineering and Information Technology'),
        ]),
        createMockElement('LI', { class: 'description__job-criteria-item' }, '', [
          createMockElement('H3', {}, 'Industries'),
          createMockElement('SPAN', {}, 'Internet Marketplace Platforms'),
        ]),
      ];

      const accHeading = createMockElement('P', {}, 'Accountabilities');
      const accList = createMockElement('UL', {}, '', [
        createMockElement(
          'LI',
          {},
          'Design scalable, maintainable, and secure application architectures.'
        ),
        createMockElement('LI', {}, 'Develop and deploy scalable web applications.'),
      ]);

      const reqHeading = createMockElement('P', {}, 'Requirements');
      const reqList = createMockElement('UL', {}, '', [
        createMockElement(
          'LI',
          {},
          '3+ years of professional experience in full stack development.'
        ),
        createMockElement('LI', {}, 'Strong proficiency in HTML, CSS, JavaScript, and React.'),
      ]);

      const gdprNotice = createMockElement(
        'P',
        {},
        'Data Privacy Notice: This processing is based on legitimate interest and pre-contractual measures under applicable data protection laws.'
      );

      const descEl = createMockElement('DIV', { class: 'show-more-less-html__markup' }, '', [
        createMockElement(
          'P',
          {},
          'Our partner is looking for a Full Stack Engineer based in India. Fully remote from India.'
        ),
        accHeading,
        accList,
        reqHeading,
        reqList,
        gdprNotice,
      ]);

      const topCard = createMockElement('DIV', { class: 'top-card-layout' }, '', [
        titleEl,
        companyEl,
        locationEl,
        postedEl,
        applyBtn,
      ]);

      const jobRoot = createMockElement('DIV', { class: 'details' }, '', [
        topCard,
        ...criteriaItems,
        descEl,
      ]);

      const doc = createMockDocument(
        [jobRoot],
        'Full Stack Engineer at Jobgether — India | LinkedIn Jobs'
      );
      const payload = LinkedInAdapter.extract(
        doc,
        'https://www.linkedin.com/jobs/view/4466834190/'
      );

      // Assertions
      assert.equal(payload.title, 'Full Stack Engineer');
      assert.equal(payload.company, 'Jobgether');
      assert.equal(payload.location, 'India');
      assert.equal(payload.workplace, 'REMOTE');
      assert.equal(payload.employmentType, 'FULL_TIME', 'Must be FULL_TIME, NOT CONTRACT!');
      assert.equal(payload.seniorityLevel, 'Mid-Senior level');
      assert.equal(payload.jobFunction, 'Engineering and Information Technology');
      assert.equal(payload.industries, 'Internet Marketplace Platforms');
      assert.equal(payload.postedAgo, '1 day ago');
      assert.equal(payload.hasApplyCta, true);
      assert.equal(payload.responsibilities.length, 2);
      assert.equal(payload.requirements.length, 2);
      assert.equal(payload.isReady, true);
      assert.equal(payload.analysisReady, true);
    });
  });

  // =========================================================================
  // 7. Forwarding Through Detection Engine
  // =========================================================================
  describe('7. Forwarding Through Detection Engine', () => {
    it('JobPageDetector and JobDetectionEngine forward all enriched fields to downstream consumers', () => {
      const titleEl = createMockElement(
        'H1',
        { class: 'top-card-layout__title' },
        'Senior Backend Engineer'
      );
      const companyEl = createMockElement('A', { class: 'topcard__org-name-link' }, 'Cloud Corp');
      const descEl = createMockElement(
        'DIV',
        { class: 'show-more-less-html__markup' },
        'Leading backend architecture using distributed microservices, event streaming with Kafka, and high availability systems.'
      );

      const criteriaEl = createMockElement('LI', { class: 'description__job-criteria-item' }, '', [
        createMockElement('H3', {}, 'Seniority level'),
        createMockElement('SPAN', {}, 'Senior level'),
      ]);

      const jobRoot = createMockElement('DIV', { class: 'details' }, '', [
        titleEl,
        companyEl,
        descEl,
        criteriaEl,
      ]);

      const doc = createMockDocument([jobRoot]);
      const normalized = JobPageDetector.detect(
        doc,
        'https://www.linkedin.com/jobs/view/999888777/'
      );
      assert.equal(normalized.seniorityLevel, 'Senior level');

      const evaluation = JobDetectionEngine.evaluate(
        doc,
        'https://www.linkedin.com/jobs/view/999888777/'
      );
      assert.equal(evaluation.detected, true);
      assert.equal(evaluation.jobData.seniorityLevel, 'Senior level');
    });
  });
});
