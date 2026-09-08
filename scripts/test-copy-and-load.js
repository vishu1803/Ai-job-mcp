import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = 'C:\\Users\\VISHW\\AppData\\Local\\Temp\\chrome-test-profile-clean';
const sourceExt = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';
const targetExt = 'C:\\Users\\VISHW\\AppData\\Local\\Temp\\aicareershub-extension';
const port = 9333;

// Clean copy
if (fs.existsSync(profileDir)) fs.rmSync(profileDir, { recursive: true, force: true });
if (fs.existsSync(targetExt)) fs.rmSync(targetExt, { recursive: true, force: true });

fs.cpSync(sourceExt, targetExt, { recursive: true });
console.log('Copied extension to:', targetExt);

const p = spawn(chromePath, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  `--load-extension=${targetExt}`,
  `--disable-extensions-except=${targetExt}`,
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
  const t = await cdpSend(ws, 'Target.getTargets');
  console.log('Targets from clean Temp folder:');
  for (const item of t.targetInfos) {
    console.log(`- Type: ${item.type}, URL: ${item.url}, Title: "${item.title}"`);
  }
  p.kill('SIGKILL');
}

run().catch(e => {
  console.error(e);
  p.kill('SIGKILL');
});
