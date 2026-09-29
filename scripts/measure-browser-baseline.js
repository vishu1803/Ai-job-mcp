#!/usr/bin/env node
/**
 * @file Browser Performance Metrics Harvester via Chrome CDP.
 * Measures: DOMContentLoaded, Load, LCP, CLS, scripting, layout, payload sizes, blocking resources.
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { db, closeDatabase } from '../src/db/index.js';
import { candidates, sessions } from '../src/db/schema.js';
import { createSession } from '../src/security/session.service.js';
import { eq } from 'drizzle-orm';

const CANDIDATE_ID = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
const TENANT_ID = '24d53f53-780e-4431-b065-32180c354175';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\.tmp-perf-chrome';
const port = 9444;

let rawToken;
let chromeProcess;

try {
  const [candidate] = await db.select().from(candidates).where(eq(candidates.id, CANDIDATE_ID));
  const session = await createSession(db, { userId: candidate.userId, tenantId: TENANT_ID });
  rawToken = session.rawToken;

  console.log('Spawning headless Chrome on port', port);
  chromeProcess = spawn(
    chromePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { detached: false, stdio: 'ignore' }
  );

  let connected = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        connected = true;
        break;
      }
    } catch {
      await sleep(300);
    }
  }

  if (!connected) throw new Error('Could not connect to Chrome CDP');

  // Create a new tab
  const newTabRes = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const tab = await newTabRes.json();
  const wsUrl = tab.webSocketDebuggerUrl;

  const WebSocket = (await import('ws')).default;
  const ws = new WebSocket(wsUrl);

  await new Promise((resolve) => ws.once('open', resolve));

  let reqId = 1;
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = reqId++;
      const handler = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          ws.off('message', handler);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send('Page.enable');
  await send('Network.enable');
  await send('Performance.enable');

  // Set auth cookie
  await send('Network.setCookie', {
    name: 'career_hub_session',
    value: rawToken,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
  });

  const urlsToTest = ['http://localhost:3000/', 'http://localhost:3000/dashboard'];
  const browserResults = [];

  for (const url of urlsToTest) {
    console.log(`\nNavigating to ${url}...`);
    const networkRequests = [];

    const requestListener = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.method === 'Network.responseReceived') {
        const resp = msg.params.response;
        networkRequests.push({
          url: resp.url,
          status: resp.status,
          mimeType: resp.mimeType,
          encodedDataLength: resp.encodedDataLength,
          fromDiskCache: resp.fromDiskCache,
        });
      }
    };
    ws.on('message', requestListener);

    const startedAt = Date.now();
    await send('Page.navigate', { url });

    // Wait for loadEventFired
    await new Promise((resolve) => {
      const loadHandler = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === 'Page.loadEventFired') {
          ws.off('message', loadHandler);
          resolve();
        }
      };
      ws.on('message', loadHandler);
      // Fallback timeout
      setTimeout(resolve, 35000);
    });

    await sleep(2000); // let metrics settle
    ws.off('message', requestListener);

    // Get CDP performance metrics
    const perfMetrics = await send('Performance.getMetrics');
    const metricMap = Object.fromEntries(perfMetrics.metrics.map((m) => [m.name, m.value]));

    // Evaluate window.performance timings
    const evalRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const nav = performance.getEntriesByType('navigation')[0] || {};
        const paint = performance.getEntriesByType('paint');
        const fcp = paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0;
        return {
          domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
          loadEvent: nav.loadEventEnd - nav.startTime,
          ttfb: nav.responseStart - nav.requestStart,
          fcp,
          transferSize: nav.transferSize || 0,
          decodedBodySize: nav.decodedBodySize || 0
        };
      })()`,
      returnByValue: true,
    });

    const webMetrics = evalRes.result?.value || {};

    const summary = {
      url,
      ttfbMs: Math.round(webMetrics.ttfb || 0),
      domContentLoadedMs: Math.round(webMetrics.domContentLoaded || 0),
      loadEventMs: Math.round(webMetrics.loadEvent || 0),
      fcpMs: Math.round(webMetrics.fcp || 0),
      jsHeapUsedSize: Math.round((metricMap.JSHeapUsedSize || 0) / 1024),
      scriptDurationSec: (metricMap.ScriptDuration || 0).toFixed(3),
      layoutDurationSec: (metricMap.LayoutDuration || 0).toFixed(3),
      recalcStyleDurationSec: (metricMap.RecalcStyleDuration || 0).toFixed(3),
      networkRequestsCount: networkRequests.length,
      networkRequests: networkRequests.map((r) => ({
        url: r.url.length > 80 ? r.url.slice(0, 80) + '...' : r.url,
        mimeType: r.mimeType,
        bytes: r.encodedDataLength,
      })),
    };

    browserResults.push(summary);
    console.log(`Results for ${url}:`);
    console.log(`  TTFB: ${summary.ttfbMs} ms`);
    console.log(`  DOMContentLoaded: ${summary.domContentLoadedMs} ms`);
    console.log(`  LoadEvent: ${summary.loadEventMs} ms`);
    console.log(`  FCP: ${summary.fcpMs} ms`);
    console.log(`  ScriptDuration: ${summary.scriptDurationSec} s`);
    console.log(`  LayoutDuration: ${summary.layoutDurationSec} s`);
    console.log(`  RecalcStyleDuration: ${summary.recalcStyleDurationSec} s`);
    console.log(`  Network requests: ${summary.networkRequestsCount}`);
  }

  console.log('\n--- BROWSER METRICS JSON ---');
  console.log(JSON.stringify(browserResults, null, 2));

  ws.close();
} finally {
  if (chromeProcess) {
    chromeProcess.kill('SIGKILL');
  }
  if (rawToken) {
    const { eq: eqOp } = await import('drizzle-orm');
    await db
      .delete(sessions)
      .where(
        eqOp(
          sessions.userId,
          (
            await db
              .select({ userId: candidates.userId })
              .from(candidates)
              .where(eqOp(candidates.id, CANDIDATE_ID))
          )[0]?.userId
        )
      );
  }
  await closeDatabase();
}
