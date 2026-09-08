import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import http from 'node:http';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\.tmp-chrome-profile-fresh';
const extensionDir = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';
const extensionId = 'dncmnfnoboajlbmmjigjljgnlijgkhib';
const port = 9333;
const serverPort = 3099;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!DOCTYPE html>
  <html>
  <body>
    <h1>Extension Host Page</h1>
    <iframe id="extFrame" src="chrome-extension://${extensionId}/popup/popup.html" style="width:380px; height:600px;"></iframe>
  </body>
  </html>`);
});
await new Promise(r => server.listen(serverPort, '127.0.0.1', r));

const p = spawn(chromePath, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  `--load-extension=${extensionDir}`,
  `--disable-extensions-except=${extensionDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  `http://127.0.0.1:${serverPort}/`
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
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  console.log('Targets:', list.map(t => ({ type: t.type, url: t.url, title: t.title })));

  const frameTarget = list.find(t => t.url.includes('popup.html') || t.type === 'iframe');
  console.log('Frame target in list:', frameTarget);

  // Connect to main page
  const pageTarget = list.find(t => t.url.includes(String(serverPort)));
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));

  await cdpSend(ws, 'Runtime.enable');
  await sleep(1500);

  const evalRes = await cdpSend(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const frame = document.getElementById('extFrame');
      return {
        src: frame?.src,
        contentDoc: !!frame?.contentDocument,
        href: frame?.contentWindow?.location?.href
      };
    })()`,
    returnByValue: true
  });
  console.log('Host Page Frame Eval Result:', evalRes.result?.value);

  p.kill('SIGKILL');
  server.close();
}

run().catch(e => {
  console.error(e);
  p.kill('SIGKILL');
  server.close();
});
