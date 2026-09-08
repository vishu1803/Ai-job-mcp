import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\.tmp-chrome-profile-fresh';
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
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find(t => t.type === 'page');

  const bws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise(r => bws.addEventListener('open', r));
  const tInfo = await cdpSend(bws, 'Target.getTargets');
  console.log('All Target.getTargets:', tInfo.targetInfos.map(x => ({ type: x.type, url: x.url, title: x.title })));

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));

  await cdpSend(ws, 'Page.enable');
  await cdpSend(ws, 'Runtime.enable');

  console.log('Navigating page to deterministic popup URL...');
  const navRes = await cdpSend(ws, 'Page.navigate', {
    url: `chrome-extension://${extensionId}/popup/popup.html`
  });
  console.log('Nav result:', navRes);

  await sleep(2000);
  const evalRes = await cdpSend(ws, 'Runtime.evaluate', {
    expression: '({ url: location.href, title: document.title, authStatus: document.getElementById("authStatusText")?.textContent })',
    returnByValue: true
  });
  console.log('Eval after navigation:', evalRes.result?.value);

  p.kill('SIGKILL');
}

run().catch(e => {
  console.error(e);
  p.kill('SIGKILL');
});
