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
  await sleep(2000);
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const sw = list.find(t => t.type === 'service_worker');
  const ws = new WebSocket(sw.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));

  console.log('Calling chrome.windows.create from service worker...');
  const res = await cdpSend(ws, 'Runtime.evaluate', {
    expression: 'chrome.windows.create({ url: chrome.runtime.getURL("popup/popup.html"), type: "popup", width: 400, height: 620 })',
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Result:', res.result?.value);

  await sleep(1500);
  const updatedList = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  console.log('Updated targets:', updatedList.map(t => ({ type: t.type, url: t.url, title: t.title })));

  p.kill('SIGKILL');
}

run().catch(err => {
  console.error(err);
  p.kill('SIGKILL');
});
