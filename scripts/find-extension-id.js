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
  'about:blank'
], { detached: false, stdio: 'ignore' });

async function run() {
  await sleep(1500);
  const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ id: 1, method: 'Target.getTargets' }));
  });
  
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data.toString());
    if (msg.id === 1) {
      console.log('Targets count:', msg.result.targetInfos.length);
      for (const t of msg.result.targetInfos) {
        console.log(`- Type: ${t.type}, Title: "${t.title}", URL: ${t.url}, TargetId: ${t.targetId}`);
      }
      p.kill('SIGKILL');
      process.exit(0);
    }
  });
}

run().catch(err => {
  console.error(err);
  p.kill('SIGKILL');
  process.exit(1);
});
