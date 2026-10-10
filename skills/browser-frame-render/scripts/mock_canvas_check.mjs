// 全コマの数値チェック（書き出しの前に回す）: モックの Canvas2D コンテキストで、描画コードが渡す値の異常を全コマ検出する。
//   node mock_canvas_check.mjs <draw.mjs> [frames=360] [width=1920] [height=1080]
//
// <draw.mjs> は DOM を使わない描画モジュールで、次を export する（作品の frame(i) の中身を ctx だけで描く形）:
//   export function setup(ctx, cfg) {}                // 任意。cfg = { width, height, fps }
//   export function frame(ctx, i, t) {}               // i = コマ番号、t = 秒
// 検出するもの: 負の半径（arc/ellipse/radialGradient/roundRect）、NaN・Infinity の引数、addColorStop の範囲外（0〜1 の外）、
//   globalAlpha の範囲外、例外。最初の発生コマと呼び出し名・引数を出し、1件でもあれば終了コード 1。
// 実績: 360コマで 1〜8 秒。#124 の「easeOutBack(0) = -2.2e-15 で半径が負 → arc() が IndexSizeError」を事前に検出できる。
//   このチェックを回すようにしてから、実行時エラーで試行が無駄になった件数は 0 になった。
const [, , modPath, framesArg, wArg, hArg] = process.argv;
if (!modPath) { console.error('usage: node mock_canvas_check.mjs <draw.mjs> [frames] [width] [height]'); process.exit(2); }
const FRAMES = Number(framesArg || 360), W = Number(wArg || 1920), H = Number(hArg || 1080);

const problems = [];
let curFrame = -1;
const note = (kind, call, args) => {
  if (problems.length < 200) problems.push({ frame: curFrame, kind, call, args: args.map((a) => (typeof a === 'number' ? +a.toPrecision(6) : String(a))).slice(0, 8) });
};
const bad = (v) => typeof v === 'number' && !Number.isFinite(v);

const RADIUS_ARGS = { arc: [2], ellipse: [2, 3], createRadialGradient: [2, 5], roundRect: [] };
function check(name, args) {
  if (args.some(bad)) note('nan-or-inf', name, args);
  for (const k of RADIUS_ARGS[name] || []) if (typeof args[k] === 'number' && args[k] < 0) note('negative-radius', name, args);
  if ((name === 'fillRect' || name === 'strokeRect') && (args[2] < 0 || args[3] < 0)) note('negative-size', name, args);
  if (name === 'roundRect' && Array.isArray(args[4]) === false && typeof args[4] === 'number' && args[4] < 0) note('negative-radius', name, args);
}

const gradient = () => new Proxy({}, {
  get: (_, k) => (k === 'addColorStop' ? (off, col) => { if (!(off >= 0 && off <= 1)) note('colorstop-out-of-range', 'addColorStop', [off, col]); } : undefined),
});

const state = {};
const ctx = new Proxy(state, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'canvas') return { width: W, height: H };
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient') {
      return (...a) => { check(String(k), a); return gradient(); };
    }
    if (k === 'measureText') return (s) => ({ width: String(s).length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(0, w * h * 4)), width: w, height: h });
    if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
    return (...a) => { check(String(k), a); };      // 描画メソッドは全部「検査して何もしない」
  },
  set(t, k, v) {
    if (k === 'globalAlpha' && !(v >= 0 && v <= 1)) note('alpha-out-of-range', 'globalAlpha', [v]);
    if ((k === 'lineWidth') && (bad(v) || v < 0)) note('bad-linewidth', 'lineWidth', [v]);
    t[k] = v;
    return true;
  },
});

import { pathToFileURL } from 'node:url';
import path from 'node:path';
const mod = await import(pathToFileURL(path.resolve(modPath)).href);
const cfg = { width: W, height: H, fps: 30 };
let thrown = null;
try {
  if (mod.setup) await mod.setup(ctx, cfg);
  for (let i = 0; i < FRAMES; i++) {
    curFrame = i;
    await mod.frame(ctx, i, i / cfg.fps);
  }
} catch (e) {
  thrown = `frame ${curFrame}: ${e.stack || e}`;
}
const first = new Map();
for (const p of problems) { const key = `${p.kind} ${p.call}`; if (!first.has(key)) first.set(key, { ...p, count: 0 }); first.get(key).count++; }
for (const v of first.values()) console.log(`${v.kind} ${v.call} 初回 frame ${v.frame} 引数 ${JSON.stringify(v.args)}（${v.count}件）`);
if (thrown) console.log('例外:', thrown);
console.log(problems.length || thrown ? `NG: ${problems.length} 件の異常${thrown ? ' ＋例外' : ''}` : `OK: ${FRAMES} コマ、異常なし`);
process.exit(problems.length || thrown ? 1 : 0);
