// ブラウザ描画のアニメーションを1コマずつ PNG にする書き出しハーネス（汎用版）
//
//   node render.mjs --root <作品のフォルダ> --entry index.html --out <出力フォルダ> --width 1920 --height 1080 --fps 30 --duration 12 --seed 1
//        [--frames 0:30 | --frames 100,150,205] [--stateless] [--workers N] [--hash-only] [--no-gpu] [--params '{"k":1}']
//
// 前提: `npm install`（このフォルダの package.json で playwright-core が入る。`python doctor.py --fix` でも可）と、Microsoft Edge か Google Chrome
//       （Edge を先に試し、なければ Chrome。環境変数 RENDER_BROWSER=msedge|chrome で指定）。ページは runtime.js の startWork({ defaults, setup, frame }) を呼ぶこと。
//
// 仕組み: 乱数・Date.now・performance.now・requestAnimationFrame を固定して、frame(i) を1コマずつ呼び canvas#c を PNG で保存する。
//   - 描画は frame 番号から決まること。Math.random は使わない（runtime.js の mulberry32）。状態を持つ作品（前のコマの結果で次を計算する）は
//     --stateless を付けない。その場合 --frames 359 は 0 から 359 まで全部計算して、指定のコマだけ保存する（遅い）
//   - --workers N（並列）は --stateless の作品だけ
//   - ページが '[metric] {...}' と console.log すると、render_meta.json の metrics に入る
//   - ページの例外・console.error・HTTP 400 以上があれば error.log を書いて終了コード 1（setup の例外も runtime.js が拾う）
//   - 各コマの SHA-256 を hashes.json に（再現性の確認用: 同じ入力で2回書き出して比べる）
import { chromium } from 'playwright-core';
import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.glsl': 'text/plain',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.wav': 'audio/wav',
};

function parseArgs(argv) {
  const a = { root: null, entry: 'index.html', out: null, width: 1920, height: 1080, fps: 30, duration: 10, seed: 1, quality: 'final',
    params: {}, frames: null, frameList: null, workers: 1, stateless: false, hashOnly: false, gpu: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--root') a.root = argv[++i];
    else if (k === '--entry') a.entry = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--width') a.width = Number(argv[++i]);
    else if (k === '--height') a.height = Number(argv[++i]);
    else if (k === '--fps') a.fps = Number(argv[++i]);
    else if (k === '--duration') a.duration = Number(argv[++i]);
    else if (k === '--seed') a.seed = Number(argv[++i]);
    else if (k === '--quality') a.quality = argv[++i];
    else if (k === '--params') a.params = JSON.parse(argv[++i]);
    else if (k === '--workers') a.workers = Number(argv[++i]);
    else if (k === '--stateless') a.stateless = true;
    else if (k === '--hash-only') a.hashOnly = true;
    else if (k === '--no-gpu') a.gpu = false;
    else if (k === '--frames') {
      const v = argv[++i];
      if (v.includes(':')) a.frames = v.split(':').map(Number);
      else a.frameList = v.split(',').map(Number).sort((x, y) => x - y);
    } else throw new Error(`unknown arg ${k}`);
  }
  if (!a.root || !a.out) throw new Error('usage: render.mjs --root <dir> --entry index.html --out <dir> [--width W --height H --fps F --duration S --seed N]');
  if (a.workers > 1 && !a.stateless) throw new Error('--workers > 1 は --stateless の作品だけ（状態を持つ作品を分割すると結果が変わる）');
  return a;
}

function serve(root) {
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const p = path.normalize(path.join(root, pathname));
    if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
    try {
      const data = await fsp.readFile(p);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function renderChunk({ url, cfg, a, b, w, launchArgs, framesDir, hashOnly, idx = null, keep = null }) {
  // Microsoft Edge を試し、なければ Google Chrome を使う（どちらも無ければ、分かるエラーにする）
  let browser = null, lastErr = null, usedChannel = null;
  for (const channel of (process.env.RENDER_BROWSER ? [process.env.RENDER_BROWSER] : ['msedge', 'chrome'])) {
    try { browser = await chromium.launch({ channel, headless: true, args: launchArgs }); usedChannel = channel; break; } catch (e) { lastErr = e; }
  }
  if (!browser) throw new Error(`ブラウザを起動できない（Microsoft Edge か Google Chrome を入れる。RENDER_BROWSER=msedge|chrome で指定）: ${lastErr && lastErr.message}`);
  const errors = [];
  const metrics = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.stack || e}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    else if (m.text().startsWith('[metric] ')) { try { metrics.push(JSON.parse(m.text().slice(9))); } catch { /* 無視 */ } }
  });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });

  await page.addInitScript((c) => {
    window.__RENDER__ = c;
    let s = (c.seed ^ 0x9e3779b9) >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let vt = 0;
    window.__setVirtualTime = (ms) => { vt = ms; };
    performance.now = () => vt;
    Date.now = () => 1767225600000 + vt;
    window.requestAnimationFrame = () => 0;
  }, cfg);

  await page.goto(url);
  try {
    await page.waitForFunction(() => window.__work && (window.__work.ready || window.__work.error), null, { timeout: 120000 });
  } catch (e) {
    await browser.close();
    throw new Error(`setup did not finish: ${e.message}\npage errors:\n${errors.join('\n') || '(none)'}`);
  }
  const setupErr = await page.evaluate(() => window.__work.error || null);
  if (setupErr) { await browser.close(); throw new Error(`setup failed: ${setupErr}`); }
  const browserVersion = browser.version();

  const hashes = {};
  const frameMs = [];
  const writes = [];
  const order = idx ?? Array.from({ length: b - a }, (_, k) => a + k);
  for (const i of order) {
    const ts = performance.now();
    const dataUrl = await page.evaluate(async ({ i, fps }) => {
      window.__setVirtualTime((i * 1000) / fps);
      await window.__work.frame(i);
      return document.getElementById('c').toDataURL('image/png');
    }, { i, fps: cfg.fps });
    const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    hashes[i] = crypto.createHash('sha256').update(buf).digest('hex');
    if (!hashOnly && (!keep || keep.has(i))) writes.push(fsp.writeFile(path.join(framesDir, `${String(i).padStart(6, '0')}.png`), buf));
    if (writes.length > 16) await Promise.all(writes.splice(0));
    frameMs.push(performance.now() - ts);
    if (errors.length) break;
    if ((i - a) % 30 === 0) process.stdout.write(`[w${w}] frame ${i} (${a}-${b}) ${(frameMs.at(-1) / 1000).toFixed(2)}s\n`);
  }
  await Promise.all(writes);
  await browser.close();
  return { hashes, frameMs, errors, browserVersion, metrics, usedChannel };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root);
  const cfg = { width: args.width, height: args.height, fps: args.fps, duration: args.duration, seed: args.seed, quality: args.quality, params: args.params };
  const total = Math.round(args.duration * args.fps);
  const [f0, f1] = args.frameList ? [0, args.frameList.at(-1) + 1] : (args.frames ?? [0, total]);
  const outDir = path.resolve(args.out);
  const framesDir = path.join(outDir, 'frames');
  if (!args.hashOnly) await fsp.mkdir(framesDir, { recursive: true });
  await fsp.mkdir(outDir, { recursive: true });

  const server = await serve(root);
  const url = `http://127.0.0.1:${server.address().port}/${args.entry}`;
  const workers = args.stateless ? Math.max(1, args.workers) : 1;
  const launchArgs = ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none', '--ignore-gpu-blocklist'];
  if (!args.gpu) launchArgs.push('--disable-gpu');

  const started = new Date();
  const t0 = performance.now();
  const n = f1 - f0;
  let results;
  if (args.frameList) {
    const keep = new Set(args.frameList);
    const idx = args.stateless ? args.frameList : Array.from({ length: f1 }, (_, k) => k);
    results = [await renderChunk({ url, cfg, a: 0, b: f1, w: 0, launchArgs, framesDir, hashOnly: args.hashOnly, idx, keep })];
  } else {
    const chunks = [];
    for (let w = 0; w < workers; w++) {
      const a = f0 + Math.floor((n * w) / workers), b = f0 + Math.floor((n * (w + 1)) / workers);
      if (b > a) chunks.push([a, b]);
    }
    results = await Promise.all(chunks.map(([a, b], w) => renderChunk({ url, cfg, a, b, w, launchArgs, framesDir, hashOnly: args.hashOnly })));
  }
  const seconds = (performance.now() - t0) / 1000;
  server.close();

  const hashes = {}, frameMs = [], errors = [], metrics = [];
  let browserVersion = '', browserName = '';
  for (const r of results) {
    Object.assign(hashes, r.hashes); frameMs.push(...r.frameMs); errors.push(...r.errors); metrics.push(...r.metrics);
    browserVersion = r.browserVersion; browserName = r.usedChannel;
  }
  const meta = {
    quality: args.quality, width: cfg.width, height: cfg.height, fps: cfg.fps, frames: frameMs.length, frame_range: [f0, f1],
    frame_list: args.frameList, seconds_total: +seconds.toFixed(1), sec_per_frame: +(seconds / Math.max(1, frameMs.length)).toFixed(3),
    started: started.toISOString(), finished: new Date().toISOString(), browser: `${browserName} ${browserVersion}`, gpu: args.gpu,
    workers, hash_only: args.hashOnly, metrics, errors,
  };
  await fsp.writeFile(path.join(outDir, 'hashes.json'), JSON.stringify(hashes, null, 0));
  await fsp.writeFile(path.join(outDir, 'render_meta.json'), JSON.stringify(meta, null, 2));
  if (errors.length) {
    await fsp.writeFile(path.join(outDir, 'error.log'), errors.join('\n'));
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log(JSON.stringify(meta));
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
