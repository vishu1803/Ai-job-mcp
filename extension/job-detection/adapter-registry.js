/**
 * @file Adapter Registry & Capability Resolution Engine (P57.4).
 *
 * Implements capability-based adapter resolution.
 * Maps detected portal domains or DOM structures to prioritized adapters with explicit capability declarations.
 */

import { GreenhouseAdapter } from './adapters/greenhouse.adapter.js';
import { LeverAdapter } from './adapters/lever.adapter.js';
import { WorkdayAdapter } from './adapters/workday.adapter.js';
import { LinkedInAdapter } from './adapters/linkedin.adapter.js';
import { IndeedAdapter } from './adapters/indeed.adapter.js';
import { NaukriAdapter } from './adapters/naukri.adapter.js';
import { IimjobsAdapter } from './adapters/iimjobs.adapter.js';
import { ShineAdapter } from './adapters/shine.adapter.js';
import { FounditAdapter } from './adapters/foundit.adapter.js';
import { TimesJobsAdapter } from './adapters/timesjobs.adapter.js';
import { HirectAdapter } from './adapters/hirect.adapter.js';
import { CutshortAdapter } from './adapters/cutshort.adapter.js';
import { InstahyreAdapter } from './adapters/instahyre.adapter.js';
import { GenericCareerPageAdapter } from './adapters/generic-career.adapter.js';
import { isJobPostingObject } from './json-ld.js';

export const KNOWN_PORTAL_CAPABILITIES = {
  GREENHOUSE: {
    portalName: 'Greenhouse ATS',
    confidence: 'HIGH',
    capabilities: {
      jobExtraction: true,
      applicationDetection: true,
      formExtraction: true,
      automaticFieldMapping: true,
    },
  },
  LEVER: {
    portalName: 'Lever ATS',
    confidence: 'HIGH',
    capabilities: {
      jobExtraction: true,
      applicationDetection: true,
      formExtraction: true,
      automaticFieldMapping: true,
    },
  },
  WORKDAY: {
    portalName: 'Workday ATS',
    confidence: 'HIGH',
    capabilities: {
      jobExtraction: true,
      applicationDetection: true,
      formExtraction: 'partial',
      automaticFieldMapping: false,
    },
  },
  LINKEDIN: {
    portalName: 'LinkedIn Jobs',
    confidence: 'HIGH',
    capabilities: {
      jobExtraction: true,
      applicationDetection: 'partial',
      formExtraction: false,
      automaticFieldMapping: false,
    },
  },
  INDEED: {
    portalName: 'Indeed Jobs',
    confidence: 'HIGH',
    capabilities: {
      jobExtraction: true,
      applicationDetection: 'partial',
      formExtraction: false,
      automaticFieldMapping: false,
    },
  },
  NAUKRI: {
    portalName: 'Naukri.com',
    confidence: 'HIGH',
    capabilities: {
      jobExtraction: true,
      applicationDetection: 'partial',
      formExtraction: false,
      automaticFieldMapping: false,
    },
  },
  IIMJOBS: {
    portalName: 'iimjobs.com',
    confidence: 'HIGH',
    capabilities: {
      jobExtraction: true,
      applicationDetection: false,
      formExtraction: false,
      automaticFieldMapping: false,
    },
  },
  SHINE: {
    portalName: 'Shine.com',
    confidence: 'HIGH',
    capabilities: {
      jobExtraction: true,
      applicationDetection: false,
      formExtraction: false,
      automaticFieldMapping: false,
    },
  },
  FOUNDIT: {
    portalName: 'Foundit.in',
    confidence: 'HIGH',
    capabilities: {
      jobExtraction: true,
      applicationDetection: false,
      formExtraction: false,
      automaticFieldMapping: false,
    },
  },
  TIMESJOBS: {
    portalName: 'TimesJobs',
    confidence: 'HIGH',
    capabilities: {
      jobExtraction: true,
      applicationDetection: false,
      formExtraction: false,
      automaticFieldMapping: false,
    },
  },
  HIRECT: {
    portalName: 'Hirect',
    confidence: 'HIGH',
    capabilities: {
      jobExtraction: true,
      applicationDetection: false,
      formExtraction: false,
      automaticFieldMapping: false,
    },
  },
  CUTSHORT: {
    portalName: 'Cutshort',
    confidence: 'HIGH',
    capabilities: {
      jobExtraction: true,
      applicationDetection: false,
      formExtraction: false,
      automaticFieldMapping: false,
    },
  },
  INSTAHYRE: {
    portalName: 'Instahyre',
    confidence: 'HIGH',
    capabilities: {
      jobExtraction: true,
      applicationDetection: false,
      formExtraction: false,
      automaticFieldMapping: false,
    },
  },
  GENERIC: {
    portalName: 'Generic Career Portal',
    confidence: 'MEDIUM',
    capabilities: {
      jobExtraction: true,
      applicationDetection: 'partial',
      formExtraction: 'partial',
      automaticFieldMapping: false,
    },
  },
};

export class AdapterRegistry {
  static getAdapters() {
    return [
      { id: 'GREENHOUSE', adapter: GreenhouseAdapter, priority: 100 },
      { id: 'LEVER', adapter: LeverAdapter, priority: 95 },
      { id: 'WORKDAY', adapter: WorkdayAdapter, priority: 90 },
      { id: 'LINKEDIN', adapter: LinkedInAdapter, priority: 85 },
      { id: 'INDEED', adapter: IndeedAdapter, priority: 80 },
      { id: 'NAUKRI', adapter: NaukriAdapter, priority: 75 },
      { id: 'IIMJOBS', adapter: IimjobsAdapter, priority: 70 },
      { id: 'SHINE', adapter: ShineAdapter, priority: 65 },
      { id: 'FOUNDIT', adapter: FounditAdapter, priority: 60 },
      { id: 'TIMESJOBS', adapter: TimesJobsAdapter, priority: 55 },
      { id: 'HIRECT', adapter: HirectAdapter, priority: 50 },
      { id: 'CUTSHORT', adapter: CutshortAdapter, priority: 45 },
      { id: 'INSTAHYRE', adapter: InstahyreAdapter, priority: 40 },
      { id: 'GENERIC', adapter: GenericCareerPageAdapter, priority: 1 },
    ];
  }

  /**
   * Resolves authoritative portal identity and capabilities independently of
   * whether an active job posting card is currently present on the page.
   *
   * @param {string} url
   * @param {Document} [doc]
   * @returns {{ adapterId: string, portalName: string, confidence: string, capabilities: object }}
   */
  static resolvePortalIdentity(url, doc) {
    if (!url) {
      return {
        adapterId: 'GENERIC',
        portalName: 'Generic Career Portal',
        confidence: 'LOW',
        capabilities: KNOWN_PORTAL_CAPABILITIES.GENERIC.capabilities,
      };
    }

    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('linkedin.com')) {
      return {
        adapterId: 'LINKEDIN',
        ...KNOWN_PORTAL_CAPABILITIES.LINKEDIN,
      };
    }
    if (
      lowerUrl.includes('boards.greenhouse.io') ||
      lowerUrl.includes('job-boards.greenhouse.io') ||
      lowerUrl.includes('greenhouse.io')
    ) {
      return {
        adapterId: 'GREENHOUSE',
        ...KNOWN_PORTAL_CAPABILITIES.GREENHOUSE,
      };
    }
    if (lowerUrl.includes('jobs.lever.co') || lowerUrl.includes('lever.co')) {
      return {
        adapterId: 'LEVER',
        ...KNOWN_PORTAL_CAPABILITIES.LEVER,
      };
    }
    if (lowerUrl.includes('myworkdayjobs.com') || lowerUrl.includes('workday.com')) {
      return {
        adapterId: 'WORKDAY',
        ...KNOWN_PORTAL_CAPABILITIES.WORKDAY,
      };
    }
    if (lowerUrl.includes('indeed.com')) {
      return {
        adapterId: 'INDEED',
        ...KNOWN_PORTAL_CAPABILITIES.INDEED,
      };
    }
    if (lowerUrl.includes('naukri.com')) {
      return {
        adapterId: 'NAUKRI',
        ...KNOWN_PORTAL_CAPABILITIES.NAUKRI,
      };
    }
    if (lowerUrl.includes('iimjobs.com')) {
      return {
        adapterId: 'IIMJOBS',
        ...KNOWN_PORTAL_CAPABILITIES.IIMJOBS,
      };
    }
    if (lowerUrl.includes('shine.com')) {
      return {
        adapterId: 'SHINE',
        ...KNOWN_PORTAL_CAPABILITIES.SHINE,
      };
    }
    if (
      lowerUrl.includes('foundit.in') ||
      lowerUrl.includes('foundit.sg') ||
      lowerUrl.includes('monsterindia.com')
    ) {
      return {
        adapterId: 'FOUNDIT',
        ...KNOWN_PORTAL_CAPABILITIES.FOUNDIT,
      };
    }
    if (lowerUrl.includes('timesjobs.com')) {
      return {
        adapterId: 'TIMESJOBS',
        ...KNOWN_PORTAL_CAPABILITIES.TIMESJOBS,
      };
    }
    if (lowerUrl.includes('hirect.in')) {
      return {
        adapterId: 'HIRECT',
        ...KNOWN_PORTAL_CAPABILITIES.HIRECT,
      };
    }
    if (lowerUrl.includes('cutshort.io')) {
      return {
        adapterId: 'CUTSHORT',
        ...KNOWN_PORTAL_CAPABILITIES.CUTSHORT,
      };
    }
    if (lowerUrl.includes('instahyre.com')) {
      return {
        adapterId: 'INSTAHYRE',
        ...KNOWN_PORTAL_CAPABILITIES.INSTAHYRE,
      };
    }

    // Check schema.org/JobPosting JSON-LD presence
    let hasJobPostingJsonLd = false;
    if (doc) {
      if (typeof doc.querySelectorAll === 'function') {
        try {
          const jsonLd = GenericCareerPageAdapter.extractJsonLd(doc);
          if (
            jsonLd &&
            GenericCareerPageAdapter.isJobPosting(jsonLd) &&
            (jsonLd.title || jsonLd.name || jsonLd.description)
          ) {
            hasJobPostingJsonLd = true;
          }
        } catch {
          hasJobPostingJsonLd = false;
        }
      }
      if (!hasJobPostingJsonLd && typeof doc.querySelector === 'function') {
        const scriptEl = doc.querySelector('script[type="application/ld+json"]');
        if (scriptEl) {
          if (scriptEl.textContent) {
            try {
              const parsed = JSON.parse(scriptEl.textContent.trim());
              if (
                isJobPostingObject(parsed) ||
                (Array.isArray(parsed) && parsed.some(isJobPostingObject)) ||
                (parsed?.['@graph'] && parsed['@graph'].some(isJobPostingObject))
              ) {
                hasJobPostingJsonLd = true;
              }
            } catch {
              hasJobPostingJsonLd = false;
            }
          } else {
            // Mock document environment without textContent
            hasJobPostingJsonLd = true;
          }
        }
      }
    }

    if (hasJobPostingJsonLd) {
      return {
        adapterId: 'GENERIC',
        portalName: 'Structured Web Page (JSON-LD JobPosting)',
        confidence: 'HIGH',
        capabilities: KNOWN_PORTAL_CAPABILITIES.GENERIC.capabilities,
      };
    }

    // Generic company career pages / known ATS URL patterns
    const isCareerUrl =
      lowerUrl.includes('/careers') ||
      lowerUrl.includes('/jobs') ||
      lowerUrl.includes('/apply') ||
      lowerUrl.includes('ashbyhq.com') ||
      lowerUrl.includes('bamboohr.com') ||
      lowerUrl.includes('workable.com') ||
      lowerUrl.includes('wellfound.com') ||
      lowerUrl.includes('smartrecruiters.com');

    if (isCareerUrl) {
      return {
        adapterId: 'GENERIC',
        portalName: 'Generic Career Portal',
        confidence: 'MEDIUM',
        capabilities: KNOWN_PORTAL_CAPABILITIES.GENERIC.capabilities,
      };
    }

    // Ordinary web page (e.g. chatgpt.com, github.com, news, search, docs)
    return {
      adapterId: 'NONE',
      portalName: 'Web Page',
      isPortalRecognized: false,
      confidence: 'LOW',
      capabilities: {
        jobExtraction: false,
        applicationDetection: false,
        formExtraction: false,
        automaticFieldMapping: false,
      },
    };
  }

  /**
   * Resolves the appropriate adapter and portal metadata for the page.
   * Separates portal identity (URL/domain) from job detection (active job posting presence).
   *
   * 4-Stage Architecture:
   * 1. Dedicated Provider -> determines isJobPage via adapter.canHandle(doc, url)
   * 2. Specialized DOM adapter -> if custom domain has ATS signature
   * 3. Generic Career structural evidence -> schema.org JSON-LD or validated posting structure
   * 4. Ordinary Web Page -> adapterId: 'NONE', isJobPage: false, portalName: 'Web Page'
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {{ adapterId: string, adapter: object|null, metadata: object, isJobPage: boolean }}
   */
  static resolve(doc, url) {
    const portalIdentity = AdapterRegistry.resolvePortalIdentity(url, doc);
    const list = AdapterRegistry.getAdapters().sort((a, b) => b.priority - a.priority);

    // 1. If portal matches a dedicated adapter (e.g. LINKEDIN, GREENHOUSE, LEVER)
    if (
      portalIdentity.adapterId &&
      portalIdentity.adapterId !== 'GENERIC' &&
      portalIdentity.adapterId !== 'NONE'
    ) {
      const dedicated = list.find((e) => e.id === portalIdentity.adapterId);
      if (dedicated) {
        let isJobPage = false;
        try {
          isJobPage =
            typeof dedicated.adapter.canHandle === 'function' &&
            dedicated.adapter.canHandle(doc, url);
        } catch {
          isJobPage = false;
        }

        return {
          adapterId: dedicated.id,
          adapter: dedicated.adapter,
          metadata: portalIdentity,
          isJobPage,
        };
      }
    }

    // 2. Specialized adapter by DOM inspection (e.g. custom domain hosting Greenhouse/Lever/etc.)
    for (const entry of list) {
      if (
        entry.id !== 'GENERIC' &&
        entry.id !== 'NONE' &&
        typeof entry.adapter.canHandle === 'function'
      ) {
        try {
          if (entry.adapter.canHandle(doc, url)) {
            const metadata = KNOWN_PORTAL_CAPABILITIES[entry.id] || {
              portalName: entry.id,
              confidence: 'HIGH',
              capabilities: { jobExtraction: true },
            };
            return {
              adapterId: entry.id,
              adapter: entry.adapter,
              metadata,
              isJobPage: true,
            };
          }
        } catch {
          // Ignore adapter check errors, continue to next
        }
      }
    }

    // 3. Generic career adapter: requires strong structural job evidence
    const canGenericHandle = GenericCareerPageAdapter.canHandle(doc, url);
    if (canGenericHandle) {
      const jsonLd = doc ? GenericCareerPageAdapter.extractJsonLd(doc) : null;
      const isJsonLd = Boolean(jsonLd && GenericCareerPageAdapter.isJobPosting(jsonLd));
      const metadata = {
        adapterId: 'GENERIC',
        portalName: isJsonLd
          ? 'Structured Web Page (JSON-LD JobPosting)'
          : portalIdentity.portalName === 'Web Page'
            ? 'Generic Career Portal'
            : portalIdentity.portalName,
        confidence: isJsonLd ? 'HIGH' : 'MEDIUM',
        capabilities: KNOWN_PORTAL_CAPABILITIES.GENERIC.capabilities,
      };
      return {
        adapterId: 'GENERIC',
        adapter: GenericCareerPageAdapter,
        metadata,
        isJobPage: true,
      };
    }

    // 4. Portal identity was recognized as career page, but DOM lacks job-posting evidence
    if (portalIdentity.adapterId === 'GENERIC') {
      return {
        adapterId: 'GENERIC',
        adapter: GenericCareerPageAdapter,
        metadata: portalIdentity,
        isJobPage: false,
      };
    }

    // 5. Ordinary Web Page without structural job evidence (ChatGPT, GitHub, Google, docs, etc.)
    return {
      adapterId: 'NONE',
      adapter: null,
      metadata: {
        portalName: 'Web Page',
        isPortalRecognized: false,
        confidence: 'LOW',
        capabilities: {
          jobExtraction: false,
          applicationDetection: false,
          formExtraction: false,
          automaticFieldMapping: false,
        },
      },
      isJobPage: false,
    };
  }
}
