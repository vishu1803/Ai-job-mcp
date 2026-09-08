import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\.tmp-chrome-profile';
const extensionDir = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';
const port = 9333;

console.log('Spawning Chrome...');
const chromeProcess = spawn(chromePath, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  `--load-extension=${extensionDir}`,
  `--disable-extensions-except=${extensionDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank'
], { detached: false, stdio: 'ignore' });

chromeProcess.on('error', (err) => {
  console.error('Failed to spawn Chrome:', err);
  process.exit(1);
});

async function main() {
  let connected = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        const ver = await res.json();
        console.log('Connected to Chrome!', ver);
        connected = true;
        break;
      }
    } catch (e) {
      await sleep(500);
    }
  }

  if (!connected) {
    console.error('Timed out waiting for Chrome CDP');
    chromeProcess.kill();
    process.exit(1);
  }

  const listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
  const targets = await listRes.json();
  console.log('Targets:', targets.map(t => ({ type: t.type, title: t.title, url: t.url })));

  chromeProcess.kill('SIGKILL');
  console.log('Cleaned up Chrome.');
}

main().catch((err) => {
  console.error(err);
  chromeProcess.kill('SIGKILL');
  process.exit(1);
});
