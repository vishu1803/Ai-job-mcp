/**
 * @file Step 1: Forensic Live DOM Inspection for LinkedIn Job 4465164301 (Triveous)
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME_PATH =
  'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\chrome\\win64-152.0.7977.82\\chrome-win64\\chrome.exe';
const PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cft-inspect-triveous-'));
const EXTENSION_DIR = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';
const SCREENSHOT_DIR =
  'C:\\Users\\VISHW\\.gemini\\antigravity-ide\\brain\\7c255938-ff51-431c-ad8d-b46eb1e7d510';
const CDP_PORT = 9477;

const TARGET_URL =
  'https://www.linkedin.com/jobs/search-results/?currentJobId=4465164301&eBP=NOT_ELIGIBLE_FOR_CHARGING&refId=vjoxbQhpD6d2Ctrioeoo%2BA%3D%3D&trackingId=vQGl23XF3Y5oVEO2QyfVNg%3D%3D&keywords=Back%20End%20Developer%20or%20Frontend%20Developer%20or%20Software%20Developer%20or%20Full-stack%20Developer%2C%20on-site%20or%20hybrid%20or%20remote&origin=PREFERENCES_LANDING&geoId=107102089';

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    const WebSocket = (await import('ws')).default;
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });

    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }

  async send(method, params = {}, timeoutMs = 25000) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    const effectiveTimeout =
      method === 'Page.navigate' || method === 'Page.reload' ? 15000 : timeoutMs;
    return new Promise((resolve, reject) => {
      const tid = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          if (method === 'Page.navigate' || method === 'Page.reload') {
            resolve({ timedOut: true });
          } else {
            reject(new Error(`CDP command ${method} timed out after ${effectiveTimeout}ms`));
          }
        }
      }, effectiveTimeout);
      this.pending.set(id, {
        resolve: (val) => {
          clearTimeout(tid);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(tid);
          reject(err);
        },
      });
      this.ws.send(payload);
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res?.result?.value;
  }

  async captureScreenshot(outputPath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    if (res?.data) {
      fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    }
  }

  close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }
  }
}

async function main() {
  console.log('=== FORENSIC LIVE DOM INSPECTION: TRIVEOUS JOB 4465164301 ===\n');

  console.log('1. Launching Chrome for Testing with extension...');
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${PROFILE_DIR}`,
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let browserCdp = null;
  let tabCdp = null;

  try {
    await sleep(3000);
    const versionRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    const versionData = await versionRes.json();
    browserCdp = new CDPClient(versionData.webSocketDebuggerUrl);
    await browserCdp.connect();

    console.log('2. Navigating to live target job: ' + TARGET_URL);
    const newTarget = await browserCdp.send('Target.createTarget', { url: TARGET_URL });
    const targetList = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const tabInfo = targetList.find((item) => item.id === newTarget.targetId);
    tabCdp = new CDPClient(tabInfo.webSocketDebuggerUrl);
    await tabCdp.connect();
    await tabCdp.send('Runtime.enable');
    await tabCdp.send('Page.enable');
    await tabCdp.send('DOM.enable');

    console.log('3. Waiting for page to load content...');
    await sleep(7000);

    // Take screenshot of live page
    await tabCdp.captureScreenshot(path.join(SCREENSHOT_DIR, 'p81-forensic-live-page.png'));
    console.log('   Saved screenshot to brain artifact directory');

    // Run in-depth DOM forensics in the live LinkedIn tab context
    const forensics = await tabCdp.evaluate(`
      (() => {
        const results = {
          documentTitle: document.title,
          url: window.location.href,
        };

        // 1. Check active job root candidates
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
          'main#main-content',
          'main'
        ];

        results.rootMatches = dedicatedLayoutSelectors.map(sel => {
          const el = document.querySelector(sel);
          return {
            selector: sel,
            found: Boolean(el),
            tagName: el?.tagName,
            className: el?.className,
            childrenCount: el?.children?.length
          };
        }).filter(r => r.found);

        // 2. Search for "Use AI to assess how you fit" element in DOM
        const allElements = Array.from(document.querySelectorAll('*'));
        const aiMatchEls = allElements.filter(el => {
          const t = el.textContent || '';
          return t.includes('Use AI to assess how you fit') && el.children.length === 0;
        });

        results.aiMatchOccurrences = aiMatchEls.map(el => {
          const parents = [];
          let cur = el;
          while (cur && cur !== document.body && parents.length < 8) {
            parents.push({
              tagName: cur.tagName,
              className: cur.className,
              id: cur.id,
              dataViewName: cur.getAttribute('data-view-name'),
              dataTestId: cur.getAttribute('data-testid')
            });
            cur = cur.parentElement;
          }
          return {
            tagName: el.tagName,
            className: el.className,
            textContent: el.textContent?.trim(),
            parents
          };
        });

        // 3. Search for "Triveous" element in DOM
        const triveousEls = allElements.filter(el => {
          const t = (el.textContent || '').trim();
          return t === 'Triveous' && el.children.length === 0;
        });

        results.triveousOccurrences = triveousEls.map(el => {
          const parents = [];
          let cur = el;
          while (cur && cur !== document.body && parents.length < 8) {
            parents.push({
              tagName: cur.tagName,
              className: cur.className,
              id: cur.id,
              dataViewName: cur.getAttribute('data-view-name')
            });
            cur = cur.parentElement;
          }
          return {
            tagName: el.tagName,
            className: el.className,
            parents
          };
        });

        // 4. Search for real job title (Full Stack Developer or similar) in DOM
        const titleRegex = /full\\s*stack\\s*developer/i;
        const jobTitleEls = allElements.filter(el => {
          const t = (el.textContent || '').trim();
          return titleRegex.test(t) && t.length < 50 && el.children.length === 0;
        });

        results.realTitleOccurrences = jobTitleEls.map(el => {
          const parents = [];
          let cur = el;
          while (cur && cur !== document.body && parents.length < 8) {
            parents.push({
              tagName: cur.tagName,
              className: cur.className,
              id: cur.id,
              dataViewName: cur.getAttribute('data-view-name')
            });
            cur = cur.parentElement;
          }
          return {
            tagName: el.tagName,
            className: el.className,
            textContent: el.textContent?.trim(),
            parents
          };
        });

        // 5. Evaluate all selectors in EXPLICIT_JOB_TITLE_SELECTORS currently present in DOM
        const titleSelectors = [
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

        results.titleSelectorMatches = titleSelectors.map(sel => {
          const els = Array.from(document.querySelectorAll(sel));
          return {
            selector: sel,
            count: els.length,
            matches: els.map(el => ({
              tagName: el.tagName,
              className: el.className,
              text: (el.textContent || '').trim().replace(/\\s+/g, ' ')
            }))
          };
        }).filter(r => r.count > 0);

        return results;
      })()
    `);

    console.log('=== FORENSIC LIVE DOM INSPECTION RESULTS ===');
    console.log(JSON.stringify(forensics, null, 2));
  } catch (err) {
    console.error('Error during forensics:', err);
  } finally {
    if (tabCdp) tabCdp.close();
    if (browserCdp) browserCdp.close();
    try {
      chromeProcess.kill('SIGTERM');
    } catch {}
  }
}

main().catch(console.error);
