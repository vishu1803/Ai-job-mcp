/**
 * @file P15-002 Batch 3 unit tests: deterministic job-tab selection.
 *
 * Locks in:
 *  - ATS-provider hosts win over arbitrary eligible tabs (priority order).
 *  - Extension/browser/devtools/blank tabs are never selected.
 *  - Fallback is the FIRST eligible tab in query order (deterministic).
 *  - The `'cloudflare'` and generic `'job'` substring heuristics are gone —
 *    a non-ATS URL containing 'cloudflare' or 'job' must NOT outrank an
 *    ATS host, and must not outrank earlier query order.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectJobTab,
  isEligibleJobTab,
  ATS_HOST_PATTERNS,
} from '../../extension/popup/job-tab-selector.js';

describe('P15-002 Batch 3: deterministic job-tab selection', () => {
  it('prefers a Greenhouse tab over other eligible tabs', () => {
    const tabs = [
      { id: 1, url: 'https://example.com/blog/post' },
      { id: 2, url: 'https://boards.greenhouse.io/cloudflare/jobs/8102350' },
      { id: 3, url: 'https://docs.example.com/guide' },
    ];
    const picked = selectJobTab(tabs);
    assert.equal(picked.id, 2);
    assert.equal(picked.matchedPattern, 'boards.greenhouse.io');
  });

  it('prefers Lever / Workday / LinkedIn / Indeed hosts by priority order', () => {
    const lever = selectJobTab([
      { id: 1, url: 'https://example.com' },
      { id: 2, url: 'https://jobs.lever.co/acme/123' },
    ]);
    assert.equal(lever.matchedPattern, 'jobs.lever.co');

    const workday = selectJobTab([
      { id: 1, url: 'https://example.com' },
      { id: 2, url: 'https://acme.wd5.myworkdayjobs.com/en-US/careers' },
    ]);
    assert.equal(workday.matchedPattern, 'myworkdayjobs.com');

    const linkedin = selectJobTab([
      { id: 1, url: 'https://example.com' },
      { id: 2, url: 'https://www.linkedin.com/jobs/view/12345' },
    ]);
    assert.equal(linkedin.matchedPattern, 'linkedin.com/jobs');

    const indeed = selectJobTab([
      { id: 1, url: 'https://example.com' },
      { id: 2, url: 'https://www.indeed.com/viewjob?jk=abc' },
    ]);
    assert.equal(indeed.matchedPattern, 'indeed.com');
  });

  it('is deterministic: with NO ATS tab, picks the FIRST eligible tab (query order)', () => {
    const tabs = [
      { id: 7, url: 'https://zebra.example.com/page' },
      { id: 3, url: 'https://alpha.example.com/page' },
    ];
    const picked = selectJobTab(tabs);
    assert.equal(picked.id, 7);
    assert.equal(picked.matchedPattern, null);
  });

  it("does NOT rank a 'cloudflare' substring over a non-ATS earlier tab (artifact heuristic removed)", () => {
    const tabs = [
      { id: 1, url: 'https://example.com/team' },
      { id: 2, url: 'https://www.cloudflare.com/products' },
    ];
    const picked = selectJobTab(tabs);
    assert.equal(picked.id, 1, 'cloudflare.com marketing page is not an ATS host');
    assert.equal(picked.matchedPattern, null);
  });

  it("does NOT rank a generic 'job' substring over a non-ATS earlier tab", () => {
    const tabs = [
      { id: 1, url: 'https://example.com/careers' },
      { id: 2, url: 'https://blog.example.com/my-job-search-story' },
    ];
    const picked = selectJobTab(tabs);
    assert.equal(picked.id, 1);
  });

  it('never selects extension, browser, devtools, or blank tabs', () => {
    const tabs = [
      { id: 1, url: 'chrome-extension://abc/popup/popup.html' },
      { id: 2, url: 'chrome://newtab' },
      { id: 3, url: 'edge://settings' },
      { id: 4, url: 'devtools://devtools/bundled/inspector.html' },
      { id: 5, url: 'about:blank' },
      { id: 6, url: 'https://real.example.com/page' },
    ];
    const picked = selectJobTab(tabs);
    assert.equal(picked.id, 6);
    for (const t of tabs.slice(0, 5)) {
      assert.equal(isEligibleJobTab(t), false, `${t.url} must be ineligible`);
    }
  });

  it('returns null selection when no eligible tabs exist', () => {
    const picked = selectJobTab([
      { id: 1, url: 'chrome-extension://abc/popup.html' },
      { id: 2, url: 'about:blank' },
    ]);
    assert.equal(picked.id, null);
    assert.equal(picked.url, null);
  });

  it('handles empty/undefined input safely', () => {
    assert.equal(selectJobTab([]).id, null);
    assert.equal(selectJobTab(undefined).id, null);
  });

  it('exposes the authoritative ATS host pattern list', () => {
    assert.ok(ATS_HOST_PATTERNS.includes('boards.greenhouse.io'));
    assert.ok(ATS_HOST_PATTERNS.includes('jobs.lever.co'));
    assert.ok(!ATS_HOST_PATTERNS.includes('cloudflare'));
    assert.ok(!ATS_HOST_PATTERNS.includes('job'));
  });
});
