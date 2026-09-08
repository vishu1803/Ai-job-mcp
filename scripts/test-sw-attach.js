import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\.tmp-chrome-profile';
const extensionDir = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';
const port = 9333;

const p = spawn(chromePath, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  `--load-extension=${extensionDir}`,
  `--disable-extensions-except=${extensionDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  'https://boards.greenhouse.io/'
], { detached: false, stdio: 'ignore' });

async function cdpSend(ws, method, params = {}, sessionId = null) {
  const id = Math.floor(Math.random() * 1000000);
  return new Promise((resolve, reject) => {
    const handler = (evt) => {
      const msg = JSON.parse(evt.data.toString());
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    ws.send(JSON.stringify(payload));
  });
}

async function run() {
  await sleep(2000);
  const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));

  const targets = await cdpSend(ws, 'Target.getTargets');
  const sw = targets.targetInfos.find(t => t.type === 'service_worker');
  console.log('SW target found:', sw.targetId);

  const attachRes = await cdpSend(ws, 'Target.attachToTarget', { targetId: sw.targetId, flatten: true });
  console.log('Attached to SW! Session ID:', attachRes.sessionId);

  const evalRes = await cdpSend(ws, 'Runtime.evaluate', {
    expression: 'chrome.windows.create({ url: chrome.runtime.getURL("popup/popup.html"), type: "popup", width: 380, height: 600 }).then(w => ({ id: w.id, tabs: w.tabs }))',
    awaitPromise: true,
    returnByValue: true
  }, attachRes.sessionId);

  console.log('chrome.windows.create result:', evalRes.result?.value);

  await sleep(2000);
  const updatedTargets = await cdpSend(ws, 'Target.getTargets');
  console.log('All targets after window create:', updatedTargets.targetInfos.map(t => ({ type: t.type, url: t.url })));

  p.kill('SIGKILL');
}

run().catch(err => {
  console.error('Error:', err);
  p.kill('SIGKILL');
});
