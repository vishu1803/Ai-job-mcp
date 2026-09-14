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
   * Resolves the highest-priority adapter that can handle the page.
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {{ adapterId: string, adapter: object, metadata: object }}
   */
  static resolve(doc, url) {
    const list = AdapterRegistry.getAdapters().sort((a, b) => b.priority - a.priority);

    for (const entry of list) {
      if (entry.id !== 'GENERIC' && typeof entry.adapter.canHandle === 'function') {
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
            };
          }
        } catch {
          // Ignore adapter check errors, continue to next
        }
      }
    }

    // Default to generic career adapter
    const genericMeta = { ...KNOWN_PORTAL_CAPABILITIES.GENERIC };

    // Check if JSON-LD JobPosting is present on the page
    const hasJsonLd = Boolean(doc?.querySelector?.('script[type="application/ld+json"]'));
    if (hasJsonLd) {
      genericMeta.confidence = 'HIGH';
      genericMeta.portalName = 'Structured Web Page (JSON-LD JobPosting)';
    }

    return {
      adapterId: 'GENERIC',
      adapter: GenericCareerPageAdapter,
      metadata: genericMeta,
    };
  }
}
