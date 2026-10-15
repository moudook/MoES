/* ============================================================
   tools/screenshot.mjs — real viewport screenshots
   ------------------------------------------------------------
   Why this exists: `chrome --headless --window-size=390,844`
   does not give you a 390px viewport on Windows. Both Chrome and Edge
   clamp the window to roughly 485px and then hand you a crop, which
   looks exactly like a layout bug. This drives the DevTools protocol
   instead, so the page really is the size you asked for.

   Usage:
     node tools/screenshot.mjs --url http://localhost:3000/ \
       --out shot.png --width 390 --height 844 --wait 2500

   No dependencies. Node 20+ (needs the global WebSocket, Node 22+).
   ============================================================ */

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url = arg('url', 'http://localhost:3000/');
const out = arg('out', 'screenshot.png');
const width = Number(arg('width', 390));
const height = Number(arg('height', 844));
const settle = Number(arg('wait', 2500));
const mobile = arg('mobile', 'true') !== 'false';
const port = 9222 + Math.floor(Math.random() * 400);

function findBrowser() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv) return fromEnv;
  return CHROME_CANDIDATES.find((p) => existsSync(p)) || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForJson(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error(`devtools endpoint never came up: ${url}`);
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        this.listeners.forEach((fn) => fn(msg.method, msg.params));
      }
    });
  }

  send(method, params = {}) {
    this.id += 1;
    const id = this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  once(method, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), timeoutMs);
      const fn = (name, params) => {
        if (name !== method) return;
        clearTimeout(timer);
        this.listeners = this.listeners.filter((l) => l !== fn);
        resolve(params);
      };
      this.listeners.push(fn);
    });
  }
}

const browser = findBrowser();
if (!browser) {
  console.error('No Chrome or Edge found. Set CHROME_PATH to the executable.');
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), 'weathergpt-shot-'));
const child = spawn(browser, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' });

let cdp;
try {
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  cdp = new Cdp(ws);

  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });

  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url });
  await loaded;
  await sleep(settle);

  const metrics = await cdp.send('Runtime.evaluate', {
    expression: 'JSON.stringify({vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth})',
    returnByValue: true,
  });
  const { vw, sw } = JSON.parse(metrics.result.value);
  if (sw > vw + 1) {
    console.error(`WARNING: horizontal overflow — viewport ${vw}px, content ${sw}px (${sw - vw}px too wide)`);
  } else {
    console.log(`viewport ${vw}px, content ${sw}px — no horizontal overflow`);
  }

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(`wrote ${out}`);
} catch (error) {
  console.error(`screenshot failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  try { child.kill(); } catch { /* already gone */ }
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
}