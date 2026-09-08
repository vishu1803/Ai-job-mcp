import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\.tmp-chrome-profile';
const extensionDir = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';
const extensionId = 'fignfifoniblkonapihmkfakmlgkbkcf';
const port = 9333;

console.log('Spawning Chrome with popup URL on command line...');
const p = spawn(chromePath, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  `--load-extension=${extensionDir}`,
  `--disable-extensions-except=${extensionDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  `chrome-extension://${extensionId}/popup/popup.html`
], { detached: false, stdio: 'ignore' });

async function run() {
  await sleep(2500);
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  console.log('Targets after CLI launch:', list.map(t => ({ type: t.type, url: t.url, title: t.title })));
  p.kill('SIGKILL');
}

run().catch(err => {
  console.error(err);
  p.kill('SIGKILL');
});
