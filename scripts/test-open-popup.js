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
  const versionRes = await fetch(`http://127.0.0.1:${port}/json/version`);
  const v = await versionRes.json();
  const listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
  const list = await listRes.json();
  console.log('Targets:', list.map(t => ({ type: t.type, url: t.url })));

  const swTarget = list.find(t => t.type === 'service_worker');
  if (!swTarget) {
    console.error('No service worker target found');
    p.kill('SIGKILL');
    process.exit(1);
  }

  const ws = new WebSocket(swTarget.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve));

  try {
    const evalRes = await cdpSend(ws, 'Runtime.evaluate', {
      expression: 'chrome.action.openPopup ? typeof chrome.action.openPopup : "undefined"',
      returnByValue: true
    });
    console.log('chrome.action.openPopup type:', evalRes.result.value);

    // Let's call chrome.action.openPopup()
    const openRes = await cdpSend(ws, 'Runtime.evaluate', {
      expression: 'chrome.action.openPopup().then(() => "OPENED").catch(err => "ERR: " + err.message)',
      awaitPromise: true,
      returnByValue: true
    });
    console.log('chrome.action.openPopup() result:', openRes.result.value);

    await sleep(1000);
    const updatedList = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    console.log('Updated targets after openPopup:', updatedList.map(t => ({ type: t.type, url: t.url })));
  } catch (err) {
    console.error('Error during CDP eval:', err);
  }

  p.kill('SIGKILL');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  p.kill('SIGKILL');
  process.exit(1);
});
