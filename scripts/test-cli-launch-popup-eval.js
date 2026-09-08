import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\.tmp-chrome-profile';
const extensionDir = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';
const extensionId = 'fignfifoniblkonapihmkfakmlgkbkcf';
const port = 9333;

const p = spawn(chromePath, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  `--load-extension=${extensionDir}`,
  `--disable-extensions-except=${extensionDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  `chrome-extension://${extensionId}/popup/popup.html`,
  'https://boards.greenhouse.io/cloudflare/jobs/8102350?gh_jid=8102350'
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
  let version = null;
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) {
        version = await r.json();
        break;
      }
    } catch {
      await sleep(500);
    }
  }

  if (!version) {
    console.error('Failed to connect to Chrome');
    p.kill('SIGKILL');
    process.exit(1);
  }

  console.log('Connected to Chrome:', version.Browser);
  await sleep(2000);

  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  console.log('All targets:', list.map(t => ({ type: t.type, url: t.url, title: t.title })));

  const popupTarget = list.find(t => t.url.includes('popup.html'));
  if (!popupTarget) {
    console.error('Popup target not found');
    p.kill('SIGKILL');
    process.exit(1);
  }

  const ws = new WebSocket(popupTarget.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));

  await cdpSend(ws, 'Runtime.enable');
  await cdpSend(ws, 'Page.enable');

  const evalRes = await cdpSend(ws, 'Runtime.evaluate', {
    expression: '({ title: document.title, authStatus: document.getElementById("authStatusText")?.textContent, url: location.href })',
    returnByValue: true
  });
  console.log('Popup DOM Eval Result:', evalRes.result?.value);

  p.kill('SIGKILL');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  p.kill('SIGKILL');
  process.exit(1);
});
