import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const chromePath = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\chrome\\win64-152.0.7977.82\\chrome-win64\\chrome.exe';
const profileDir = 'C:\\Users\\VISHW\\AppData\\Local\\Temp\\cft-profile-clean';
const extensionDir = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';
const extensionId = 'dncmnfnoboajlbmmjigjljgnlijgkhib';
const port = 9333;

const p = spawn(chromePath, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  `--load-extension=${extensionDir}`,
  `--disable-extensions-except=${extensionDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank'
], { detached: false, stdio: 'ignore' });

async function cdpSend(ws, method, params = {}) {
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
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function run() {
  await sleep(2500);
  const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));

  console.log('Creating target for popup.html...');
  const newTarget = await cdpSend(ws, 'Target.createTarget', {
    url: `chrome-extension://${extensionId}/popup/popup.html`
  });
  console.log('New target result:', newTarget);

  await sleep(2000);
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const popupTarget = list.find(t => t.id === newTarget.targetId || t.url.includes('popup.html'));
  console.log('Popup target in list:', popupTarget);

  const popupWs = new WebSocket(popupTarget.webSocketDebuggerUrl);
  await new Promise(r => popupWs.addEventListener('open', r));
  await cdpSend(popupWs, 'Runtime.enable');

  const evalRes = await cdpSend(popupWs, 'Runtime.evaluate', {
    expression: '({ title: document.title, authStatus: document.getElementById("authStatusText")?.textContent, url: location.href })',
    returnByValue: true
  });
  console.log('Popup DOM in Chrome for Testing:', evalRes.result?.value);

  p.kill('SIGKILL');
  process.exit(0);
}

run().catch(e => {
  console.error('Error:', e);
  p.kill('SIGKILL');
  process.exit(1);
});
