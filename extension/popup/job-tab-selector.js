/**
 * @file Deterministic Job-Tab Selection for the Popup (P15-002 Batch 3).
 *
 * Replaces the arbitrary substring heuristics (`'job'`, `'cloudflare'` — the
 * latter an acceptance-runner artifact that leaked into product code) with a
 * deterministic, testable selection policy:
 *
 *  1. Preferred: a tab whose URL matches a known ATS/job-board provider host.
 *  2. Fallback: the first eligible tab in query order.
 *
 * Eligibility excludes extension pages, browser pages (chrome://,
 * edge://, about:), devtools, and blank tabs.
 */

/** Known ATS / job-board host fragments, most specific first. */
export const ATS_HOST_PATTERNS = Object.freeze([
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'greenhouse.io',
  'jobs.lever.co',
  'lever.co',
  'myworkdayjobs.com',
  'myworkdaysite.com',
  'workday',
  'linkedin.com/jobs',
  'indeed.com',
]);

/** Returns true when a tab URL is eligible for job detection. */
export function isEligibleJobTab(tab) {
  const url = String(tab?.url || '');
  if (!url) return false;
  if (url.startsWith('chrome-extension://')) return false;
  if (url.startsWith('chrome://')) return false;
  if (url.startsWith('edge://')) return false;
  if (url.startsWith('devtools://')) return false;
  if (url === 'about:blank') return false;
  return true;
}

/**
 * Deterministically selects the tab most likely to hold a job posting.
 *
 * @param {Array<{ id?: number, url?: string }>} tabs Tabs from chrome.tabs.query({})
 * @returns {{ id: number|null, url: string|null, matchedPattern: string|null }}
 */
export function selectJobTab(tabs) {
  const eligible = (Array.isArray(tabs) ? tabs : []).filter(isEligibleJobTab);
  if (eligible.length === 0) {
    return { id: null, url: null, matchedPattern: null };
  }

  for (const pattern of ATS_HOST_PATTERNS) {
    const match = eligible.find((t) => t.url.includes(pattern));
    if (match) {
      return { id: match.id ?? null, url: match.url, matchedPattern: pattern };
    }
  }

  return { id: eligible[0].id ?? null, url: eligible[0].url, matchedPattern: null };
}
