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
export function findActiveLinkedInJobRoot(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null;

  const layoutSelectors = [
    '[data-view-name="job-details"]',
    '.jobs-details__main-content',
    '.jobs-search__job-details',
    '.job-view-layout',
    '[data-testid="lazy-column"]',
    '.job-details-jobs-unified-top-card',
    '.decorated-job-posting__details',
    '.details',
    'section.core-rail',
    'main#main-content',
    'main.main',
  ];

  const hasTitleElement = (el) => {
    return Boolean(
      el.querySelector(
        'h1.job-details-jobs-unified-top-card__job-title, h2.job-details-jobs-unified-top-card__job-title, .job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1.top-card-layout__title, h1.topcard__title, h1, h2.t-24, h1.t-24, [class*="job-title" i]'
      )
    );
  };

  const hasCompanyElement = (el) => {
    return Boolean(
      el.querySelector(
        '.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, a.topcard__org-name-link, a[href*="/company/"], [data-tracking-control-name*="company"], [class*="company" i]'
      )
    );
  };

  const hasDetailContent = (el) => {
    if (
      el.querySelector(
        '#job-details, .jobs-description__content, .show-more-less-html__markup, .jobs-box__html-content, .jobs-description, article.jobs-description__container, .description__text, div[class*="description__text"], [data-job-description]'
      )
    ) {
      return true;
    }
    // Check for "About the job" heading
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

  const candidateContainers = [];
  for (const selector of layoutSelectors) {
    try {
      const elements = doc.querySelectorAll(selector);
      for (const el of elements) {
        if (!el || el === doc.body || el === doc.documentElement) continue;
        candidateContainers.push({ el, selector });
      }
    } catch {}
  }

  // Tier 1: Containers that clearly own all three: title + company + detail content
  const tier1 = candidateContainers.filter(
    ({ el }) => hasTitleElement(el) && hasCompanyElement(el) && hasDetailContent(el)
  );
  if (tier1.length > 0) {
    tier1.sort((a, b) => {
      const countA = a.el.querySelectorAll('*').length;
      const countB = b.el.querySelectorAll('*').length;
      return countA - countB;
    });
    return tier1[0].el;
  }

  // Tier 2: Containers that own title + detail content
  const tier2 = candidateContainers.filter(({ el }) => hasTitleElement(el) && hasDetailContent(el));
  if (tier2.length > 0) {
    tier2.sort((a, b) => {
      const countA = a.el.querySelectorAll('*').length;
      const countB = b.el.querySelectorAll('*').length;
      return countA - countB;
    });
    return tier2[0].el;
  }

  // Tier 3: Containers that clearly own title + company (detail content might still be loading)
  const tier3 = candidateContainers.filter(({ el }) => hasTitleElement(el) && hasCompanyElement(el));
  if (tier3.length > 0) {
    tier3.sort((a, b) => {
      const countA = a.el.querySelectorAll('*').length;
      const countB = b.el.querySelectorAll('*').length;
      return countA - countB;
    });
    return tier3[0].el;
  }

  // Tier 4: Containers that have title or detail content
  const tier4 = candidateContainers.filter(({ el }) => hasTitleElement(el) || hasDetailContent(el));
  if (tier4.length > 0) {
    tier4.sort((a, b) => {
      const countA = a.el.querySelectorAll('*').length;
      const countB = b.el.querySelectorAll('*').length;
      return countA - countB;
    });
    return tier4[0].el;
  }

  // If top card exists, check its enclosing layout container
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
    requirements: [],
  };
}

export class LinkedInAdapter {
  static provider = 'LINKEDIN';
  static findActiveLinkedInJobRoot = findActiveLinkedInJobRoot;
  static extractLinkedInDescription = extractLinkedInDescription;
  static deriveJobRootSource = deriveJobRootSource;

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

    // Title candidates organized by priority, checked in active root first
    const titleScope = root || doc;
    const titleEl =
      titleScope?.querySelector?.('h1.job-details-jobs-unified-top-card__job-title') ||
      titleScope?.querySelector?.('h2.job-details-jobs-unified-top-card__job-title') ||
      titleScope?.querySelector?.('.job-details-jobs-unified-top-card__job-title-link') ||
      titleScope?.querySelector?.('.job-details-jobs-unified-top-card__job-title-link a') ||
      titleScope?.querySelector?.('.job-details-jobs-unified-top-card__job-title') ||
      titleScope?.querySelector?.('.jobs-unified-top-card__job-title') ||
      titleScope?.querySelector?.('h1.top-card-layout__title') ||
      titleScope?.querySelector?.('h1.topcard__title') ||
      titleScope?.querySelector?.('.job-details-jobs-unified-top-card h1') ||
      titleScope?.querySelector?.('.job-details-jobs-unified-top-card h2') ||
      titleScope?.querySelector?.('[data-view-name="job-details"] h1') ||
      titleScope?.querySelector?.('[data-view-name="job-details"] h2') ||
      titleScope?.querySelector?.('.jobs-details__main-content h1') ||
      titleScope?.querySelector?.('.jobs-details__main-content h2') ||
      titleScope?.querySelector?.('.job-view-layout h1') ||
      titleScope?.querySelector?.('.jobs-search__job-details h1') ||
      titleScope?.querySelector?.('h1.t-24') ||
      titleScope?.querySelector?.('h2.t-24') ||
      titleScope?.querySelector?.('.top-card-layout__title') ||
      titleScope?.querySelector?.('[data-view-name="job-details"] [class*="title" i]') ||
      titleScope?.querySelector?.('.jobs-details__main-content [class*="title" i]') ||
      titleScope?.querySelector?.('h1') ||
      titleScope?.querySelector?.('h2') ||
      (doc && doc !== titleScope
        ? doc.querySelector(
            'h1.job-details-jobs-unified-top-card__job-title, h2.job-details-jobs-unified-top-card__job-title, h1.top-card-layout__title, h1.topcard__title'
          )
        : null);

    // Company candidates organized by priority, checked in active root first
    const companyScope = root || doc;
    const companyEl =
      companyScope?.querySelector?.('.job-details-jobs-unified-top-card__company-name a') ||
      companyScope?.querySelector?.('.job-details-jobs-unified-top-card__company-name') ||
      companyScope?.querySelector?.('.jobs-unified-top-card__company-name a') ||
      companyScope?.querySelector?.('.jobs-unified-top-card__company-name') ||
      companyScope?.querySelector?.('.job-details-jobs-unified-top-card__subtitle-primary-grouping a') ||
      companyScope?.querySelector?.('.job-details-jobs-unified-top-card__subtitle-grouping a') ||
      companyScope?.querySelector?.('.jobs-unified-top-card__subtitle-primary-grouping a') ||
      companyScope?.querySelector?.('a.topcard__org-name-link') ||
      companyScope?.querySelector?.('a[data-tracking-control-name*="org-name"]') ||
      companyScope?.querySelector?.('.topcard__flavor--black-link') ||
      companyScope?.querySelector?.('.job-details-jobs-unified-top-card__primary-description a[href*="/company/"]') ||
      companyScope?.querySelector?.('.jobs-details__main-content a[href*="/company/"]') ||
      companyScope?.querySelector?.('[data-view-name="job-details"] a[href*="/company/"]') ||
      companyScope?.querySelector?.('.jobs-details__main-content [data-tracking-control-name*="company"]') ||
      companyScope?.querySelector?.('[data-view-name="job-details"] [class*="company" i]') ||
      (doc && doc !== companyScope
        ? doc.querySelector(
            '.job-details-jobs-unified-top-card__company-name, a.topcard__org-name-link, a[href*="/company/"]'
          )
        : null);

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

    let title = titleEl ? titleEl.textContent.trim() : '';
    let company = companyEl ? companyEl.textContent.trim() : '';

    if (company) {
      if (company.includes('\n')) {
        company = company.split('\n')[0].trim();
      }
      if (company.length > 80) {
        company = '';
      }
    }

    // JSON-LD upfront fallbacks
    if (!title && jsonLd && (jsonLd.title || jsonLd.name)) {
      title = (jsonLd.title || jsonLd.name).trim();
    }
    if ((!company || company === 'Company') && jsonLd?.hiringOrganization?.name) {
      company = jsonLd.hiringOrganization.name.trim();
    }

    // Resilient document.title fallback (Pipe format, Hiring format, At format)
    if ((!title || !company) && doc?.title && typeof doc.title === 'string') {
      const docTitle = doc.title.trim();

      // Pattern 1: Title | Company | LinkedIn (Standard 3-part desktop LinkedIn pipe format)
      const pipeParts = docTitle.split('|').map((s) => s.trim()).filter(Boolean);
      if (pipeParts.length >= 3 && pipeParts[pipeParts.length - 1].toLowerCase().includes('linkedin')) {
        if (!title) title = pipeParts[0];
        if (!company || company === 'Company') company = pipeParts[1];
      }

      // Pattern 2: Company hiring Title in Location | LinkedIn
      if (!title || !company) {
        const hiringMatch = docTitle.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+([^|]+?))?\s*\|\s*LinkedIn/i);
        if (hiringMatch) {
          if (!company || company === 'Company') company = hiringMatch[1].trim();
          if (!title) title = hiringMatch[2].trim();
          if (hiringMatch[3] && (!locationEl || !locationEl.textContent.trim())) {
            location = hiringMatch[3].trim();
          }
        }
      }

      // Pattern 3: Title at Company | LinkedIn
      if (!title || !company) {
        const atMatch = docTitle.match(/^(.+?)\s+at\s+([^|]+?)\s*\|\s*LinkedIn/i);
        if (atMatch) {
          if (!title) title = atMatch[1].trim();
          if (!company || company === 'Company') {
            let matchedCompany = atMatch[2].trim();
            matchedCompany = matchedCompany.replace(/\s*[\u2014\u2013-]\s*.*$/, '').trim();
            company = matchedCompany;
          }
        }
      }

      // Pattern 4: Title | LinkedIn (2-part fallback)
      if (!title && pipeParts.length === 2 && pipeParts[pipeParts.length - 1].toLowerCase().includes('linkedin')) {
        title = pipeParts[0];
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
    };
  }
}
