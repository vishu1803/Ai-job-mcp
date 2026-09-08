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
  'chrome://extensions'
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
  await sleep(3000);
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const extPage = list.find(t => t.url.includes('chrome://extensions'));
  if (!extPage) {
    console.log('chrome://extensions tab not found, targets:', list);
    p.kill('SIGKILL');
    return;
  }
  const ws = new WebSocket(extPage.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  await cdpSend(ws, 'Runtime.enable');
  await sleep(1000);

  const evalRes = await cdpSend(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const mgr = document.querySelector('extensions-manager');
      const list = mgr?.shadowRoot?.querySelector('extensions-item-list');
      const items = list?.shadowRoot?.querySelectorAll('extensions-item') || [];
      const result = [];
      for (const item of items) {
        result.push({
          id: item.id,
          name: item.shadowRoot?.querySelector('#name')?.textContent?.trim(),
          version: item.shadowRoot?.querySelector('#version')?.textContent?.trim(),
          enabled: item.shadowRoot?.querySelector('#enableToggle')?.checked,
          inspectViews: Array.from(item.shadowRoot?.querySelectorAll('.inspectable-view') || []).map(v => v.textContent.trim())
        });
      }
      return result;
    })()`,
    returnByValue: true
  });
  console.log('Loaded extensions:', JSON.stringify(evalRes.result?.value, null, 2));
  p.kill('SIGKILL');
}

run().catch(e => { console.error(e); p.kill('SIGKILL'); });
