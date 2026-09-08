import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const chromePath = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\chrome\\win64-152.0.7977.82\\chrome-win64\\chrome.exe';
const profileDir = 'C:\\Users\\VISHW\\AppData\\Local\\Temp\\cft-profile-clean';
const extensionDir = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';
const port = 9333;

console.log('Spawning Chrome for Testing with extension...');
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
  let v = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        v = await res.json();
        break;
      }
    } catch {
      await sleep(500);
    }
  }

  if (!v) {
    console.error('Failed to connect to Chrome for Testing');
    p.kill('SIGKILL');
    process.exit(1);
  }

  console.log('Connected to Chrome for Testing:', v.Browser);
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));

  const t = await cdpSend(ws, 'Target.getTargets');
  console.log('Targets in Chrome for Testing:');
  for (const item of t.targetInfos) {
    console.log(`- Type: ${item.type}, URL: ${item.url}, Title: "${item.title}"`);
  }

  p.kill('SIGKILL');
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  p.kill('SIGKILL');
  process.exit(1);
});
