import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\.tmp-chrome-profile-fresh';
const extensionDir = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';

console.log('Spawning Chrome with logging enabled...');
const p = spawn(chromePath, [
  `--user-data-dir=${profileDir}`,
  `--load-extension=${extensionDir}`,
  `--disable-extensions-except=${extensionDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--enable-logging=stderr',
  '--v=1',
  'about:blank'
], { detached: false });

p.stdout.on('data', (d) => console.log('[Chrome stdout]', d.toString()));
p.stderr.on('data', (d) => console.error('[Chrome stderr]', d.toString()));

async function run() {
  await sleep(4000);
  p.kill('SIGKILL');
}

run();
