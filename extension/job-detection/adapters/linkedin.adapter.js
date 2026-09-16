import { classifyEmploymentType } from '../employment-type.js';
import { extractJobPostingJsonLd, jsonLdToJobPayload } from '../json-ld.js';

/**
 * @file LinkedIn Job Page Extraction Adapter (P15-001 / P73).
 *
 * Extracts structured job posting metadata from LinkedIn job detail pages
 * with active job root scoping and semantic description extraction.
 */

/**
 * Identifies the currently selected job-detail region in LinkedIn.
 * Supported layouts:
 * - [data-testid="lazy-column"]
 * - .jobs-search__job-details
 * - .job-details-jobs-unified-top-card
 * - .jobs-details__main-content
 * - .job-view-layout
 * - [data-view-name="job-details"]
 * Plus guest / public layouts:
 * - .decorated-job-posting__details
 * - .details
 * - section.core-rail
 *
 * Prefer the smallest container that clearly owns:
 * title + company + job-detail content.
 * Do NOT use document.body as job root.
 *
 * @param {Document} doc
 * @returns {Element|null}
 */
/**
 * Explicit job title selectors for LinkedIn job detail views.
 * Generic h1/h2 headings are strictly excluded.
 */
export const EXPLICIT_JOB_TITLE_SELECTORS = [
  'h1.job-details-jobs-unified-top-card__job-title',
  'h2.job-details-jobs-unified-top-card__job-title',
  '.job-details-jobs-unified-top-card__job-title-link',
  '.job-details-jobs-unified-top-card__job-title-link a',
  '.job-details-jobs-unified-top-card__job-title',
  'h1.jobs-unified-top-card__job-title',
  'h2.jobs-unified-top-card__job-title',
  '.jobs-unified-top-card__job-title',
  'h1.top-card-layout__title',
  'h1.topcard__title',
  '.top-card-layout__title',
  '.topcard__title',
  '.job-details-jobs-unified-top-card h1',
  '.job-details-jobs-unified-top-card h2',
  '.jobs-unified-top-card h1',
  '.jobs-unified-top-card h2',
  '.top-card-layout h1',
  '.topcard h1',
  '.top-card-layout__entity-info h1',
  '[data-view-name="job-details"] h1.t-24',
  '[data-view-name="job-details"] h2.t-24',
  '.jobs-details__main-content h1.t-24',
  '.jobs-details__main-content h2.t-24',
  '[data-view-name="job-details"] h1',
  '[data-view-name="job-details"] h2',
  '.jobs-details__main-content h1',
  '.jobs-details__main-content h2',
  '.jobs-search__job-details h1',
  '.jobs-search__job-details h2',
  '.job-view-layout h1',
  '.job-view-layout h2',
  '[data-testid="lazy-column"] h1',
  '[data-testid="lazy-column"] h2',
  '[data-view-name="job-details"] [class*="job-title" i]',
  '.jobs-details__main-content [class*="job-title" i]',
  '.jobs-search__job-details [class*="job-title" i]',
  '.job-view-layout [class*="job-title" i]',
  '[data-testid="lazy-column"] [class*="job-title" i]',
  'h1.t-24',
  'h2.t-24',
  '[class*="job-details-jobs-unified-top-card__title" i]',
  '[class*="jobs-unified-top-card__title" i]',
  '[class*="topcard__title" i]',
  '[class*="job-title" i]',
];

export const NON_JOB_CONTAINER_SELECTORS = [
  'aside',
  '[class*="aside" i]',
  '[class*="similar" i]',
  '[class*="recommend" i]',
  '[class*="people-also" i]',
  '[class*="people_also" i]',
  '[class*="modal" i]',
  '[class*="dialog" i]',
  '[class*="sign-in" i]',
  '[class*="signin" i]',
  '[class*="upsell" i]',
  '[class*="premium" i]',
  '[class*="promo" i]',
  '[class*="marketing" i]',
  '[class*="alert" i]',
  '[class*="banner" i]',
  'nav',
  '[class*="nav" i]',
  'header.global-nav',
  'footer',
  '[role="navigation"]',
];

/**
 * Checks whether an element appears after a reference element in document order.
 * Works across both standard DOM implementations and mock element trees.
 *
 * @param {Element} el
 * @param {Element} referenceEl
 * @returns {boolean}
 */
export function isElementAfter(el, referenceEl) {
  if (!el || !referenceEl || el === referenceEl) return false;
  if (typeof el.compareDocumentPosition === 'function') {
    const pos = el.compareDocumentPosition(referenceEl);
    // Node.DOCUMENT_POSITION_PRECEDING = 2. If referenceEl precedes el, el is after referenceEl.
    if (pos & 2) return true;
  }
  // Fallback for mock/virtual element hierarchy
  let curr = el;
  while (curr && curr.parentElement) {
    const p = curr.parentElement;
    if (typeof p.contains === 'function' && p.contains(referenceEl)) {
      const children = Array.from(p.children || []);
      const refIdx = children.findIndex((c) => c === referenceEl || (typeof c.contains === 'function' && c.contains(referenceEl)));
      const elIdx = children.findIndex((c) => c === curr || (typeof c.contains === 'function' && c.contains(curr)));
      if (refIdx !== -1 && elIdx !== -1) {
        return elIdx > refIdx;
      }
    }
    curr = p;
  }
  return false;
}

/**
 * Validates whether a candidate heading or title element belongs to the authentic active job context.
 * Rejects elements inside marketing/upsell sections, lower recommendation sections, modals,
 * and elements positioned below the job description.
 *
 * @param {Element|null} titleEl
 * @param {Element|null} root
 * @param {Document|null} doc
 * @param {Element|null} [companyEl]
 * @returns {boolean}
 */
export function isValidLinkedInTitleCandidate(titleEl, root, doc, companyEl = null) {
  if (!titleEl) return false;
  const text = (titleEl.textContent || '').trim().replace(/\s+/g, ' ');
  if (!text || text.length < 2) return false;

  const lower = text.toLowerCase();
  if (lower === 'untitled role' || lower === 'linkedin') return false;

  // 1. Structural context: reject if titleEl is inside an obvious non-job section
  if (typeof titleEl.closest === 'function') {
    for (const sel of NON_JOB_CONTAINER_SELECTORS) {
      try {
        if (titleEl.closest(sel)) {
          return false;
        }
      } catch {}
    }
  }

  // 2. Reject if titleEl is located BELOW the job description container
  const descSelectors = [
    '#job-details',
    '.jobs-description__content',
    '.show-more-less-html__markup',
    '.jobs-box__html-content',
    '.jobs-description',
    'article.jobs-description__container',
  ];
  let descEl = null;
  const searchScope = root || doc;
  if (searchScope && typeof searchScope.querySelector === 'function') {
    for (const dSel of descSelectors) {
      try {
        const found = searchScope.querySelector(dSel);
        if (found) {
          descEl = found;
          break;
        }
      } catch {}
    }
  }
  if (descEl && titleEl !== descEl) {
    if (typeof descEl.contains === 'function' && descEl.contains(titleEl)) {
      return false;
    }
    if (isElementAfter(titleEl, descEl)) {
      return false;
    }
  }

  // 3. Company/Title Pair Validation (Prompt Section 5)
  if (companyEl) {
    const topCardSelectors = [
      '.job-details-jobs-unified-top-card',
      '.jobs-unified-top-card',
      '.top-card-layout',
      '.topcard',
      '.top-card-layout__entity-info',
    ];
    let topCard = null;
    const tcScope = root || doc;
    if (tcScope && typeof tcScope.querySelector === 'function') {
      for (const tcSel of topCardSelectors) {
        try {
          const found = tcScope.querySelector(tcSel);
          if (found) {
            topCard = found;
            break;
          }
        } catch {}
      }
    }
    if (topCard && typeof topCard.contains === 'function') {
      const companyInTopCard = topCard.contains(companyEl);
      const titleInTopCard = topCard.contains(titleEl);
      // Reject candidates where title is from outside top card while company is in top card
      if (companyInTopCard && !titleInTopCard) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Identifies the currently selected job-detail region in LinkedIn.
 * Dedicated container priority ranking (P74):
 * 1. [data-testid="lazy-column"]
 * 2. [data-view-name="job-details"]
 * 3. .jobs-search__job-details
 * 4. .jobs-details__main-content
 * 5. .job-view-layout
 * 6. .job-details-jobs-unified-top-card
 * 7. verified public job-detail containers (.decorated-job-posting__details, .details, section.core-rail)
 *
 * Generic main containers (main#main-content, main.main, main) are evaluated
 * ONLY as a last-resort fallback when dedicated containers fail, and NEVER merely
 * because they contain an arbitrary h1/h2.
 *
 * Strictly never returns document.body or document.documentElement.
 *
 * @param {Document} doc
 * @returns {Element|null}
 */
export function findActiveLinkedInJobRoot(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null;

  const dedicatedLayoutSelectors = [
    '[data-testid="lazy-column"]',
    '[data-view-name="job-details"]',
    '.jobs-search__job-details',
    '.jobs-details__main-content',
    '.job-view-layout',
    '.job-details-jobs-unified-top-card',
    '.decorated-job-posting__details',
    '.details',
    'section.core-rail',
  ];

  const genericMainSelectors = [
    'main#main-content',
    'main.main',
    'main',
  ];

  const hasExplicitTitle = (el) => {
    if (!el || typeof el.querySelector !== 'function') return false;
    for (const sel of EXPLICIT_JOB_TITLE_SELECTORS) {
      try {
        if (el.querySelector(sel)) return true;
      } catch {}
    }
    // Also check if el contains a verified top card with an h1 or h2
    const topCardSelectors = [
      '.job-details-jobs-unified-top-card',
      '.jobs-unified-top-card',
      '.top-card-layout',
      '.topcard',
      '.top-card-layout__entity-info',
    ];
    for (const tcSel of topCardSelectors) {
      try {
        const topCard = el.querySelector(tcSel);
        if (topCard && (topCard.querySelector('h1') || topCard.querySelector('h2'))) return true;
      } catch {}
    }
    return false;
  };

  const companyCheckSelectors = [
    '.job-details-jobs-unified-top-card__company-name',
    '.jobs-unified-top-card__company-name',
    'a.topcard__org-name-link',
    '.topcard__flavor--black-link',
    'a[href*="/company/"]',
    '[data-tracking-control-name*="org-name"]',
    '[data-tracking-control-name*="company"]',
    '.job-details-jobs-unified-top-card__subtitle-primary-grouping a',
    '.job-details-jobs-unified-top-card__subtitle-grouping a',
    '.jobs-unified-top-card__subtitle-primary-grouping a',
    '[class*="company-name" i]',
    '[class*="topcard__org" i]',
    '[class*="company" i]',
  ];

  const hasCompany = (el) => {
    if (!el || typeof el.querySelector !== 'function') return false;
    for (const sel of companyCheckSelectors) {
      try {
        if (el.querySelector(sel)) return true;
      } catch {}
    }
    return false;
  };

  const hasDetail = (el) => {
    if (!el || typeof el.querySelector !== 'function') return false;
    const detailSelectors = [
      '#job-details',
      '.jobs-description__content',
      '.show-more-less-html__markup',
      '.jobs-box__html-content',
      '.jobs-description',
      'article.jobs-description__container',
      '.description__text',
      '[data-job-description]',
    ];
    for (const sel of detailSelectors) {
      try {
        if (el.querySelector(sel)) return true;
      } catch {}
    }
    try {
      const headings = el.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"], strong, b, div, p, span');
      for (const h of headings) {
        const text = (h.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase();
        if (text === 'about the job' || text === 'about the role' || text.startsWith('about the job')) {
          return true;
        }
      }
    } catch {}
    return false;
  };

  const dedicatedCandidates = [];
  for (let i = 0; i < dedicatedLayoutSelectors.length; i++) {
    const selector = dedicatedLayoutSelectors[i];
    try {
      const elements = doc.querySelectorAll(selector);
      for (const el of elements) {
        if (!el || el === doc.body || el === doc.documentElement) continue;
        dedicatedCandidates.push({ el, selector, priorityIndex: i });
      }
    } catch {}
  }

  const sortCandidates = (list) => {
    return list.sort((a, b) => {
      // If one container contains the other, prefer the contained (smallest / most localized) container
      if (a.el !== b.el) {
        if (typeof a.el.contains === 'function' && a.el.contains(b.el)) return 1;
        if (typeof b.el.contains === 'function' && b.el.contains(a.el)) return -1;
      }
      // If priority index differs, prefer higher selector priority (lower index)
      if (a.priorityIndex !== b.priorityIndex) {
        return a.priorityIndex - b.priorityIndex;
      }
      const countA = a.el.querySelectorAll('*').length;
      const countB = b.el.querySelectorAll('*').length;
      return countA - countB;
    });
  };

  // Tier 1: Concrete dedicated job-detail root containing: explicit job title + company + detail content
  const tier1 = dedicatedCandidates.filter(
    ({ el }) => hasExplicitTitle(el) && hasCompany(el) && hasDetail(el)
  );
  if (tier1.length > 0) {
    return sortCandidates(tier1)[0].el;
  }

  // Tier 2: Concrete dedicated job-detail root containing: explicit job title + company
  const tier2 = dedicatedCandidates.filter(
    ({ el }) => hasExplicitTitle(el) && hasCompany(el)
  );
  if (tier2.length > 0) {
    return sortCandidates(tier2)[0].el;
  }

  // Tier 3: Concrete dedicated job-detail root containing: explicit job title
  const tier3 = dedicatedCandidates.filter(
    ({ el }) => hasExplicitTitle(el)
  );
  if (tier3.length > 0) {
    return sortCandidates(tier3)[0].el;
  }

  // Tier 4: Semantic job-detail container (has detail content and company or top card)
  const tier4 = dedicatedCandidates.filter(({ el }) => {
    if (!hasDetail(el)) return false;
    if (hasCompany(el)) return true;
    const topCardSelectors = [
      '.job-details-jobs-unified-top-card',
      '.jobs-unified-top-card',
      '.top-card-layout',
      '.topcard',
      '.top-card-layout__entity-info',
    ];
    for (const tcSel of topCardSelectors) {
      try {
        if (el.querySelector(tcSel)) return true;
      } catch {}
    }
    return false;
  });
  if (tier4.length > 0) {
    return sortCandidates(tier4)[0].el;
  }

  // Tier 5: Dedicated job container with detail content
  const tier5 = dedicatedCandidates.filter(({ el }) => hasDetail(el));
  if (tier5.length > 0) {
    return sortCandidates(tier5)[0].el;
  }

  // Generic main container fallback: ONLY after all dedicated containers fail
  // Must strictly contain explicit job title AND company. Never select merely for h1/h2.
  for (const selector of genericMainSelectors) {
    try {
      const elements = doc.querySelectorAll(selector);
      for (const el of elements) {
        if (!el || el === doc.body || el === doc.documentElement) continue;
        if (hasExplicitTitle(el) && hasCompany(el)) {
          return el;
        }
      }
    } catch {}
  }

  // Top-card enclosing layout fallback
  const topCard = doc.querySelector('.job-details-jobs-unified-top-card, .top-card-layout');
  if (topCard) {
    const parentLayout = topCard.closest(
      '[data-view-name="job-details"], .jobs-details__main-content, .jobs-search__job-details, .job-view-layout, [data-testid="lazy-column"], .decorated-job-posting__details, .details, section.core-rail'
    );
    if (parentLayout && parentLayout !== doc.body && parentLayout !== doc.documentElement) {
      return parentLayout;
    }
    return topCard;
  }

  return null;
}

/**
 * Derives a human-readable identifier of the active root element source.
 *
 * @param {Element|null} root
 * @returns {string|null}
 */
export function deriveJobRootSource(root) {
  if (!root) return null;
  if (root.getAttribute?.('data-view-name')) return `[data-view-name="${root.getAttribute('data-view-name')}"]`;
  if (root.getAttribute?.('data-testid')) return `[data-testid="${root.getAttribute('data-testid')}"]`;
  if (root.id) return `#${root.id}`;
  if (root.className) {
    const firstClass = root.className.toString().trim().split(/\s+/)[0];
    if (firstClass) return `.${firstClass}`;
  }
  return root.tagName ? root.tagName.toLowerCase() : null;
}

/**
 * Extracts job description scoped to the active LinkedIn job root.
 *
 * Priority:
 * 1. Known LinkedIn description containers INSIDE active root:
 *    - #job-details
 *    - .jobs-description__content
 *    - .show-more-less-html__markup
 *    - .jobs-box__html-content
 *    - .jobs-description
 *    - article.jobs-description__container
 * 2. SEMANTIC "ABOUT THE JOB" EXTRACTION:
 *    - find heading whose normalized text is "About the job"
 *    - locate the associated containing section
 *    - extract the first substantial sibling/content block belonging to that section
 *    - do not include unrelated cards or navigation
 * 3. JSON-LD JobPosting description.
 * 4. Return empty string.
 *
 * NEVER use:
 * - document.body.textContent
 * - arbitrary page-wide text
 * - unrelated description classes outside the active job root
 *
 * @param {Element|null} root
 * @param {Document} [doc]
 * @returns {{ description: string, descriptionSource: string, descriptionLength: number, requirements: string[] }}
 */
export function extractLinkedInDescription(root, doc = null) {
  const cleanText = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const extractRequirementsFromEl = (el) => {
    const reqs = [];
    if (el && typeof el.querySelectorAll === 'function') {
      el.querySelectorAll('li').forEach((li) => {
        const t = cleanText(li.textContent);
        if (t.length > 5) reqs.push(t);
      });
    }
    return reqs;
  };

  const searchScope = (root && typeof root.querySelector === 'function')
    ? root
    : (doc && typeof doc.querySelector === 'function' && doc !== doc?.body ? doc : null);

  // Priority 1: Known LinkedIn description containers INSIDE active root (or doc when root is absent)
  if (searchScope) {
    const knownSelectors = [
      '#job-details',
      '.jobs-description__content',
      '.show-more-less-html__markup',
      '.jobs-box__html-content',
      '.jobs-description',
      'article.jobs-description__container',
      '[data-view-name="job-details"] article',
      '[data-view-name="job-details"] [class*="description" i]',
      '.jobs-details__main-content article',
      '.jobs-details__main-content [class*="description" i]',
      '.jobs-description-content__text',
      '.jobs-search__job-details article',
      '.jobs-search__job-details [class*="description" i]',
      '.job-view-layout [class*="description" i]',
      '.description__text',
      'div[class*="jobs-description"]',
      'div[class*="description__text"]',
      'section[class*="description" i]',
      '[class*="description" i]',
      '[data-job-description]',
      'article',
    ];

    for (const sel of knownSelectors) {
      try {
        let el = searchScope.querySelector(sel);
        // If searchScope is root itself and selector is compound (e.g. ".job-view-layout [class*=\"description\" i]")
        if (!el && sel.includes(' ') && searchScope !== doc) {
          const parts = sel.split(' ');
          const subSel = parts.slice(1).join(' ');
          el = searchScope.querySelector(subSel);
        }
        if (el) {
          const text = cleanText(el.textContent);
          if (text.length >= 50) {
            return {
              description: text,
              descriptionSource: 'SELECTOR',
              descriptionLength: text.length,
              descriptionSelectorUsed: sel,
              requirements: extractRequirementsFromEl(el),
            };
          }
        }
      } catch {}
    }
  }

  // Priority 2: SEMANTIC "ABOUT THE JOB" EXTRACTION
  const headingScope = (root && typeof root.querySelectorAll === 'function')
    ? root
    : (doc && typeof doc.querySelectorAll === 'function' && doc !== doc?.body ? doc : null);
  if (headingScope) {
    let aboutHeading = null;
    try {
      const candidateHeadings = headingScope.querySelectorAll(
        'h1, h2, h3, h4, h5, h6, [role="heading"], strong, b, div, p, span'
      );
      for (const h of candidateHeadings) {
        const norm = cleanText(h.textContent).toLowerCase();
        if (norm === 'about the job' || norm === 'about the role' || norm.startsWith('about the job')) {
          if (h.children.length === 0 || cleanText(h.firstElementChild?.textContent || norm) === norm) {
            aboutHeading = h;
            break;
          }
        }
      }
    } catch {}

    if (aboutHeading) {
      const section =
        aboutHeading.closest?.(
          'section, article, [class*="description" i], div.jobs-description, div.core-section-container, div'
        ) || aboutHeading.parentElement;

      if (section) {
        let contentEl = null;

        const isUnrelated = (el) => {
          if (!el) return true;
          const tag = (el.tagName || '').toLowerCase();
          const cls = (el.className || '').toString().toLowerCase();
          return (
            tag === 'button' ||
            tag === 'nav' ||
            cls.includes('button') ||
            cls.includes('nav') ||
            cls.includes('header') ||
            cls.includes('recruiter') ||
            cls.includes('similar') ||
            cls.includes('sign-in') ||
            cls.includes('modal')
          );
        };

        // Substantial sibling of heading
        let sib = aboutHeading.nextElementSibling;
        while (sib) {
          if (!isUnrelated(sib)) {
            const txt = cleanText(sib.textContent);
            if (txt.length >= 50) {
              contentEl = sib;
              break;
            }
          }
          sib = sib.nextElementSibling;
        }

        // Substantial sibling of heading wrapper
        if (!contentEl && aboutHeading.parentElement && aboutHeading.parentElement !== section) {
          let pSib = aboutHeading.parentElement.nextElementSibling;
          while (pSib) {
            if (!isUnrelated(pSib)) {
              const txt = cleanText(pSib.textContent);
              if (txt.length >= 50) {
                contentEl = pSib;
                break;
              }
            }
            pSib = pSib.nextElementSibling;
          }
        }

        // Section content block fallback
        if (!contentEl) {
          try {
            const blocks = section.querySelectorAll(
              '.show-more-less-html__markup, [class*="content" i], [class*="text" i], div, p, span'
            );
            for (const b of blocks) {
              if (b === aboutHeading || b.contains(aboutHeading)) continue;
              if (!isUnrelated(b)) {
                const txt = cleanText(b.textContent);
                if (txt.length >= 50) {
                  contentEl = b;
                  break;
                }
              }
            }
          } catch {}
        }

        if (contentEl) {
          const text = cleanText(contentEl.textContent);
          if (text.length >= 50) {
            return {
              description: text,
              descriptionSource: 'ABOUT_THE_JOB',
              descriptionLength: text.length,
              descriptionSelectorUsed: 'ABOUT_THE_JOB',
              requirements: extractRequirementsFromEl(contentEl),
            };
          }
        }
      }
    }
  }

  // Priority 3: JSON-LD JobPosting description
  const targetDoc = doc || (root?.ownerDocument || null);
  if (targetDoc && typeof targetDoc.querySelectorAll === 'function') {
    try {
      const jsonLd = extractJobPostingJsonLd(targetDoc);
      if (jsonLd?.description) {
        const cleanJsonLdDesc = cleanText(
          jsonLd.description.replace(/<[^>]+>/g, ' ')
        );
        if (cleanJsonLdDesc.length >= 50) {
          return {
            description: cleanJsonLdDesc,
            descriptionSource: 'JSON_LD',
            descriptionLength: cleanJsonLdDesc.length,
            descriptionSelectorUsed: 'JSON_LD',
            requirements: [],
          };
        }
      }
    } catch {}
  }

  // Priority 4: Return empty string
  return {
    description: '',
    descriptionSource: 'NONE',
    descriptionLength: 0,
    descriptionSelectorUsed: 'NONE',
    requirements: [],
  };
}

export class LinkedInAdapter {
  static provider = 'LINKEDIN';
  static findActiveLinkedInJobRoot = findActiveLinkedInJobRoot;
  static extractLinkedInDescription = extractLinkedInDescription;
  static deriveJobRootSource = deriveJobRootSource;
  static EXPLICIT_JOB_TITLE_SELECTORS = EXPLICIT_JOB_TITLE_SELECTORS;
  static isValidLinkedInTitleCandidate = isValidLinkedInTitleCandidate;

  /**
   * Determines whether this adapter can handle the given page.
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {boolean}
   */
  static canHandle(doc, url) {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    if (!lowerUrl.includes('linkedin.com')) return false;

    // Explicit non-job sections on LinkedIn
    if (
      lowerUrl.includes('/feed') ||
      lowerUrl.includes('/in/') ||
      lowerUrl.includes('/messaging') ||
      lowerUrl.includes('/notifications') ||
      lowerUrl.includes('/mynetwork') ||
      lowerUrl.includes('/settings') ||
      lowerUrl.includes('/learning') ||
      lowerUrl.includes('/pulse') ||
      lowerUrl.includes('/groups')
    ) {
      return false;
    }

    // Company homepages / posts (unless specifically viewing job details)
    if (lowerUrl.includes('/company/') && !lowerUrl.includes('/jobs') && !lowerUrl.includes('currentjobid=')) {
      return false;
    }

    // Priority 1 — Canonical URL identity
    const hasCanonicalUrl =
      lowerUrl.includes('/jobs/view/') ||
      /[?&]currentjobid=\d+/i.test(url);

    if (hasCanonicalUrl) {
      return true;
    }

    // Priority 2 — Structured data (JSON-LD JobPosting)
    if (doc && typeof doc.querySelectorAll === 'function') {
      const jsonLd = extractJobPostingJsonLd(doc);
      if (jsonLd && (jsonLd.title || jsonLd.name || jsonLd.description)) {
        return true;
      }
    }

    // Priority 3 — Active Job-specific DOM structure
    if (doc && typeof doc.querySelector === 'function') {
      const activeRoot = findActiveLinkedInJobRoot(doc);
      if (activeRoot) {
        return true;
      }

      const hasActiveTopCard = Boolean(
        doc.querySelector('.job-details-jobs-unified-top-card') ||
        doc.querySelector('.jobs-details__main-content') ||
        doc.querySelector('.jobs-search__job-details') ||
        doc.querySelector('.job-view-layout') ||
        doc.querySelector('[data-view-name="job-details"]') ||
        doc.querySelector('h1.top-card-layout__title')
      );

      const hasJobDescription = Boolean(
        doc.querySelector('.show-more-less-html__markup') ||
        doc.querySelector('#job-details') ||
        doc.querySelector('.jobs-description__content') ||
        doc.querySelector('.jobs-box__html-content') ||
        doc.querySelector('.jobs-description') ||
        doc.querySelector('article.jobs-description__container')
      );

      if (hasActiveTopCard || hasJobDescription) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extracts and normalizes job payload from the document.
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {object} Normalized job payload
   */
  static extract(doc, url) {
    const root = findActiveLinkedInJobRoot(doc);
    const jobRootSource = deriveJobRootSource(root);

    let externalJobId = null;
    const urlMatch = url.match(/\/jobs\/view\/(\d+)/i) || url.match(/[?&]currentJobId=(\d+)/i);
    if (urlMatch) {
      externalJobId = urlMatch[1];
    } else if (root && typeof root.querySelector === 'function') {
      const elWithId =
        root.querySelector('[data-occludable-job-id]') ||
        root.querySelector('[data-current-job-id]') ||
        root.querySelector('[data-job-id]') ||
        root.querySelector('[data-job-runner-job-id]');
      if (elWithId) {
        externalJobId =
          elWithId.getAttribute?.('data-occludable-job-id') ||
          elWithId.getAttribute?.('data-current-job-id') ||
          elWithId.getAttribute?.('data-job-id') ||
          elWithId.getAttribute?.('data-job-runner-job-id');
      }
    } else if (doc && typeof doc.querySelector === 'function') {
      const activeRailItem =
        doc.querySelector('.jobs-search-results-list__list-item--active') ||
        doc.querySelector('[data-occludable-job-id]');
      const elWithId =
        activeRailItem ||
        doc.querySelector('.jobs-search-results-list__list-item--active[data-occludable-job-id]') ||
        doc.querySelector('.jobs-search-results-list__list-item--active[data-job-id]') ||
        doc.querySelector('[data-view-name="job-details"] [data-job-id]') ||
        doc.querySelector('.job-details-jobs-unified-top-card [data-job-id]') ||
        doc.querySelector('[data-current-job-id]') ||
        doc.querySelector('[data-job-id], [data-job-runner-job-id]');
      if (elWithId) {
        externalJobId =
          elWithId.getAttribute?.('data-occludable-job-id') ||
          elWithId.getAttribute?.('data-current-job-id') ||
          elWithId.getAttribute?.('data-job-id') ||
          elWithId.getAttribute?.('data-job-runner-job-id');
      }
    }

    // Company candidates organized by priority, checked in active root first
    const companyScope = root || doc;
    let companyEl = null;
    let companySelectorUsed = null;
    const companySelectors = [
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name',
      '.job-details-jobs-unified-top-card__subtitle-primary-grouping a',
      '.job-details-jobs-unified-top-card__subtitle-grouping a',
      '.jobs-unified-top-card__subtitle-primary-grouping a',
      'a.topcard__org-name-link',
      'a[data-tracking-control-name*="org-name"]',
      '.topcard__flavor--black-link',
      '.job-details-jobs-unified-top-card__primary-description a[href*="/company/"]',
      '.jobs-details__main-content a[href*="/company/"]',
      '[data-view-name="job-details"] a[href*="/company/"]',
      '.jobs-details__main-content [data-tracking-control-name*="company"]',
      '[data-view-name="job-details"] [class*="company" i]',
      'a[href*="/company/"]',
    ];

    for (const sel of companySelectors) {
      try {
        const el = companyScope?.querySelector?.(sel) || (doc && doc !== companyScope ? doc.querySelector(sel) : null);
        if (el) {
          let txt = (el.textContent || '').trim().replace(/\s+/g, ' ');
          if (txt.includes('\n')) txt = txt.split('\n')[0].trim();
          if (txt && txt !== 'Company' && txt.length <= 80) {
            companyEl = el;
            companySelectorUsed = sel;
            break;
          }
        }
      } catch {}
    }

    // Title extraction (P74):
    // Priority 1: Explicit job-title selectors checked in active root first
    const titleScope = root || doc;
    let titleEl = null;
    let titleSelectorUsed = null;

    for (const sel of EXPLICIT_JOB_TITLE_SELECTORS) {
      try {
        let el = titleScope?.querySelector?.(sel);
        if (!el && doc && doc !== titleScope) {
          el = doc.querySelector(sel);
        }
        if (el && isValidLinkedInTitleCandidate(el, root, doc, companyEl)) {
          titleEl = el;
          titleSelectorUsed = sel;
          break;
        }
      } catch {}
    }

    // Priority 2: Generic heading fallback ONLY inside a verified active job top card
    if (!titleEl) {
      const topCardSelectors = [
        '.job-details-jobs-unified-top-card',
        '.jobs-unified-top-card',
        '.top-card-layout',
        '.topcard',
        '.top-card-layout__entity-info',
      ];
      let topCard = null;
      for (const tcSel of topCardSelectors) {
        try {
          topCard = titleScope?.querySelector?.(tcSel) || (doc && doc !== titleScope ? doc.querySelector(tcSel) : null);
          if (topCard) break;
        } catch {}
      }

      if (topCard && typeof topCard.querySelectorAll === 'function') {
        const candidateHeadings = topCard.querySelectorAll('h1, h2, h3');
        for (const h of candidateHeadings) {
          if (isValidLinkedInTitleCandidate(h, root, doc, companyEl)) {
            titleEl = h;
            titleSelectorUsed = 'topcard:' + h.tagName.toLowerCase();
            break;
          }
        }
      }
    }

    const locationScope = root || doc;
    const locationEl =
      locationScope?.querySelector?.('.job-details-jobs-unified-top-card__bullet') ||
      locationScope?.querySelector?.('.jobs-unified-top-card__bullet') ||
      locationScope?.querySelector?.('.job-details-jobs-unified-top-card__primary-description-container span.tvm__text') ||
      locationScope?.querySelector?.('span.topcard__flavor--bullet') ||
      locationScope?.querySelector?.('.topcard__flavor--bullet') ||
      locationScope?.querySelector?.('[data-view-name="job-details"] [class*="bullet" i]') ||
      (doc && doc !== locationScope
        ? doc.querySelector('.topcard__flavor--bullet, .job-details-jobs-unified-top-card__bullet')
        : null);

    let location = locationEl ? locationEl.textContent.trim() : '';

    const jsonLd = doc && typeof doc.querySelectorAll === 'function' ? extractJobPostingJsonLd(doc) : null;

    let title = titleEl ? titleEl.textContent.trim().replace(/\s+/g, ' ') : '';
    let company = companyEl ? companyEl.textContent.trim().replace(/\s+/g, ' ') : '';

    if (company) {
      if (company.includes('\n')) {
        company = company.split('\n')[0].trim();
      }
      if (company.length > 80 || company === 'Company') {
        company = '';
      }
    }

    // JSON-LD upfront fallbacks (if title or company is missing)
    if (!title && jsonLd && (jsonLd.title || jsonLd.name)) {
      title = (jsonLd.title || jsonLd.name).trim();
      titleSelectorUsed = 'JSON_LD';
    }
    if ((!company || company === 'Company') && jsonLd?.hiringOrganization?.name) {
      company = jsonLd.hiringOrganization.name.trim();
      if (!companySelectorUsed) companySelectorUsed = 'JSON_LD';
    }

    // Resilient document.title fallback (Prompt Section 6)
    // Runs ONLY when:
    // - explicit title selector is absent (!title)
    // - active job context is confirmed (root exists, or company exists, or jsonLd exists)
    // - parsed title/company pair is coherent
    // Does NOT override a valid explicit LinkedIn job title.
    if (!title && doc?.title && typeof doc.title === 'string') {
      const docTitle = doc.title.trim();
      const hasJobUrl = Boolean(url && (url.toLowerCase().includes('/jobs/view/') || url.toLowerCase().includes('currentjobid=')));
      const hasActiveJobContext = Boolean(root || company || jsonLd || hasJobUrl);

      if (hasActiveJobContext) {
        // Pattern 1: Title | Company | LinkedIn (Standard 3-part desktop LinkedIn pipe format)
        const pipeParts = docTitle.split('|').map((s) => s.trim()).filter(Boolean);
        if (pipeParts.length >= 3 && pipeParts[pipeParts.length - 1].toLowerCase().includes('linkedin')) {
          const candTitle = pipeParts[0];
          const candCompany = pipeParts[1];
          if (candTitle && candTitle.toLowerCase() !== 'jobs') {
            title = candTitle;
            titleSelectorUsed = 'DOCUMENT_TITLE';
            if (!company || company === 'Company') {
              company = candCompany;
              if (!companySelectorUsed) companySelectorUsed = 'DOCUMENT_TITLE';
            }
          }
        }

        // Pattern 2: Company hiring Title in Location | LinkedIn
        if (!title) {
          const hiringMatch = docTitle.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+([^|]+?))?\s*\|\s*LinkedIn/i);
          if (hiringMatch) {
            const candCompany = hiringMatch[1].trim();
            const candTitle = hiringMatch[2].trim();
            if (candTitle) {
              title = candTitle;
              titleSelectorUsed = 'DOCUMENT_TITLE';
              if (!company || company === 'Company') {
                company = candCompany;
                if (!companySelectorUsed) companySelectorUsed = 'DOCUMENT_TITLE';
              }
              if (hiringMatch[3] && !location) {
                location = hiringMatch[3].trim();
              }
            }
          }
        }

        // Pattern 3: Title at Company | LinkedIn
        if (!title) {
          const atMatch = docTitle.match(/^(.+?)\s+at\s+([^|]+?)(?:\s*[\u2014\u2013-]\s*.*)?\s*\|\s*LinkedIn/i);
          if (atMatch) {
            const candTitle = atMatch[1].trim();
            const candCompany = atMatch[2].replace(/\s*[\u2014\u2013-]\s*.*$/, '').trim();
            if (candTitle) {
              title = candTitle;
              titleSelectorUsed = 'DOCUMENT_TITLE';
              if (!company || company === 'Company') {
                company = candCompany;
                if (!companySelectorUsed) companySelectorUsed = 'DOCUMENT_TITLE';
              }
            }
          }
        }

        // Pattern 4: Title - Company | LinkedIn (2-part pipe with dash-separated title and company)
        if (!title && pipeParts.length >= 2 && pipeParts[pipeParts.length - 1].toLowerCase().includes('linkedin')) {
          const firstPart = pipeParts[0];
          if (!firstPart.toLowerCase().includes(' hiring ') && !firstPart.toLowerCase().includes(' at ')) {
            const dashParts = firstPart.split(/\s+[\u2014\u2013-]\s+/);
            if (dashParts.length >= 2) {
              const candTitle = dashParts[0].trim();
              const candCompany = dashParts[1].trim();
              if (candTitle && candTitle.toLowerCase() !== 'jobs') {
                title = candTitle;
                titleSelectorUsed = 'DOCUMENT_TITLE';
                if (!company || company === 'Company') {
                  company = candCompany;
                  if (!companySelectorUsed) companySelectorUsed = 'DOCUMENT_TITLE';
                }
              }
            }
          }
        }

        // Pattern 5: Title | LinkedIn (2-part fallback)
        if (!title && pipeParts.length === 2 && pipeParts[pipeParts.length - 1].toLowerCase().includes('linkedin')) {
          if (pipeParts[0] && pipeParts[0].toLowerCase() !== 'jobs') {
            title = pipeParts[0];
            titleSelectorUsed = 'DOCUMENT_TITLE';
          }
        }
      }
    }

    if (company && company.length > 80) {
      company = '';
    }
    if (company === 'Company') {
      company = '';
    }

    if (!location && jsonLd?.jobLocation) {
      const locObj = jsonLd.jobLocation;
      const addr = locObj.address || locObj;
      location = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(', ');
    }
    if (!location && doc?.title && typeof doc.title === 'string') {
      const inMatch = doc.title.match(/\s+in\s+([^|]+)\s*\|\s*LinkedIn/i);
      if (inMatch) {
        location = inMatch[1].trim();
      }
    }

    // Root-scoped description extraction with 4-tier priority hierarchy (P73)
    const {
      description,
      descriptionSource,
      descriptionLength,
      descriptionSelectorUsed,
      requirements,
    } = extractLinkedInDescription(root, doc);

    // Optional supporting signal: Easy Apply / Apply button presence
    const applyScope = root || doc;
    const hasApplyCta = Boolean(
      applyScope?.querySelector?.(
        '.jobs-apply-button, button[class*="jobs-apply-button" i], button[data-job-id], [data-view-name="job-apply-button"], [aria-label*="Easy Apply" i], [aria-label*="Apply to" i]'
      )
    );

    const hasMeaningfulCompany = Boolean(company && company !== 'Company');
    const hasMeaningfulDescription = Boolean(description && description.length >= 50);
    const hasValidTitle = Boolean(title && title !== 'Untitled Role');

    // Readiness gate: strong job-detail context + valid title + substantive content.
    // Detection readiness: valid identity, title, and company or description.
    const isReady = Boolean(hasValidTitle && (hasMeaningfulCompany || hasMeaningfulDescription));
    // Analysis readiness (P70/P73): valid detected job with substantive description >= 50 chars.
    const analysisReady = Boolean(hasValidTitle && hasMeaningfulDescription);

    let workplace = 'UNKNOWN';
    const combinedText = `${title} ${location} ${description}`.toLowerCase();
    if (combinedText.includes('remote')) {
      workplace = 'REMOTE';
    } else if (combinedText.includes('hybrid')) {
      workplace = 'HYBRID';
    } else if (location) {
      workplace = 'ON_SITE';
    }

    const selectedRootSelector = jobRootSource;
    const selectedRootTag = root ? (root.tagName ? root.tagName.toLowerCase() : null) : null;
    const selectedRootClass = root ? (root.className ? root.className.toString().trim() : null) : null;

    return {
      sourceUrl: url,
      provider: LinkedInAdapter.provider,
      externalJobId: externalJobId || null,
      title: title || 'Untitled Role',
      company: company || '',
      location: location || 'Not specified',
      workplace,
      employmentType: classifyEmploymentType(combinedText),
      description,
      requirements: requirements.slice(0, 30),
      responsibilities: [],
      compensation: null,
      rawText: description,
      hasApplyCta,
      isReady,
      analysisReady,
      descriptionSource,
      jobRootSource,
      descriptionLength,
      selectedRootSelector,
      selectedRootTag,
      selectedRootClass,
      titleSelectorUsed: titleSelectorUsed || 'NONE',
      companySelectorUsed: companySelectorUsed || 'NONE',
      descriptionSelectorUsed: descriptionSelectorUsed || descriptionSource,
    };
  }
}
