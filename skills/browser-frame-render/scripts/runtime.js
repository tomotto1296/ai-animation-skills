// 共通ランタイム（ブラウザ描画）
//
// 作品側は startWork({ setup, frame }) を呼ぶだけでよい。
// - 書き出しモード: render.mjs が window.__RENDER__ を注入し、frame(i) を1コマずつ呼ぶ
// - プレビューモード: ブラウザで直接開くと requestAnimationFrame でループ再生する
//   （URL パラメータ ?w=960&h=540&quality=draft&seed=1 で上書き可能）
//
// 描画は必ず frame 番号から決まること（時刻 = i / fps）。Math.random は使わず mulberry32 を使う。

export function getConfig(defaults) {
  const injected = window.__RENDER__;
  if (injected) return { ...defaults, ...injected, mode: 'render' };
  const q = new URLSearchParams(location.search);
  const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
  return {
    ...defaults,
    width: num('w', defaults.width),
    height: num('h', defaults.height),
    seed: num('seed', defaults.seed),
    quality: q.get('quality') || defaults.quality || 'draft',
    mode: 'preview',
  };
}

export function startWork({ defaults, setup, frame }) {
  const cfg = getConfig(defaults);
  const canvas = document.getElementById('c');
  canvas.width = cfg.width;
  canvas.height = cfg.height;
  const totalFrames = Math.round(cfg.duration * cfg.fps);
  const work = { ready: false, cfg, totalFrames };
  window.__work = work;

  // setup はモジュールの評価が終わってから呼ぶ。同期的な例外も work.error に載せる
  Promise.resolve().then(() => setup(canvas, cfg)).then(() => {
    work.frame = async (i) => {
      await frame(i, i / cfg.fps);
    };
    work.ready = true;
    if (cfg.mode === 'preview') runPreview(work, canvas);
  }).catch((e) => {
    work.error = String(e && e.stack || e);
    console.error(work.error);
  });
}

function runPreview(work, canvas) {
  const fit = () => {
    const s = Math.min(innerWidth / canvas.width, innerHeight / canvas.height);
    canvas.style.width = `${canvas.width * s}px`;
    canvas.style.height = `${canvas.height * s}px`;
  };
  addEventListener('resize', fit);
  fit();
  // 実時間で cfg.fps のペースで進める（画面のリフレッシュレートに依存しない）。
  // フレームは必ず順番に1つずつ描く（状態を持つ作品のため）。遅れたときの追いつきは1回あたり2コマまで
  const { fps, interactive } = work.cfg;
  let i = 0;
  let busy = false;
  let start = null;
  const step = async (now) => {
    if (start === null) start = now;
    if (!busy) {
      busy = true;
      const due = Math.floor(((now - start) / 1000) * fps);
      for (let k = 0; k < 2 && i <= due; k++) {
        await work.frame(interactive ? i : i % work.totalFrames);
        i++;
      }
      if (i < due - 2) { start = now - (i / fps) * 1000; } // 大きく遅れたら基準時刻をずらす
      busy = false;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---- 乱数 ----
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- 3D シンプレックスノイズ（Gustavson の方式を自前実装。出力はおよそ -1..1）----
const GRAD3 = new Float64Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

export function createSimplex3(rand) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }
  const F3 = 1 / 3;
  const G3 = 1 / 6;

  return function noise3(xin, yin, zin) {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
      const g = permMod12[ii + perm[jj + perm[kk]]] * 3;
      t0 *= t0;
      n += t0 * t0 * (GRAD3[g] * x0 + GRAD3[g + 1] * y0 + GRAD3[g + 2] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) {
      const g = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
      t1 *= t1;
      n += t1 * t1 * (GRAD3[g] * x1 + GRAD3[g + 1] * y1 + GRAD3[g + 2] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) {
      const g = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
      t2 *= t2;
      n += t2 * t2 * (GRAD3[g] * x2 + GRAD3[g + 1] * y2 + GRAD3[g + 2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) {
      const g = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
      t3 *= t3;
      n += t3 * t3 * (GRAD3[g] * x3 + GRAD3[g + 1] * y3 + GRAD3[g + 2] * z3);
    }
    return 32 * n;
  };
}

// ---- イージングと補間 ----
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

// ---- 色（OKLab で補間する）----
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => x / 255);
}

function rgbToOklab([r, g, b]) {
  r = srgbToLinear(r); g = srgbToLinear(g); b = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]) {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => clamp(linearToSrgb(clamp(c))));
}

// hex 同士を OKLab で混ぜて [r,g,b]（0..1）を返す
export function mixHex(h1, h2, t) {
  const a = rgbToOklab(hexToRgb(h1));
  const b = rgbToOklab(hexToRgb(h2));
  return oklabToRgb([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]);
}

export function mixRgb(c1, c2, t) {
  const a = rgbToOklab(c1);
  const b = rgbToOklab(c2);
  return oklabToRgb([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]);
}

// OKLCh で補間する（彩度を保ったまま色相を回す）。hueDir: 0=近い方向、+1=色相が増える向き、-1=減る向き
export function mixHexLch(h1, h2, t, hueDir = 0) {
  const [L1, a1, b1] = rgbToOklab(hexToRgb(h1));
  const [L2, a2, b2] = rgbToOklab(hexToRgb(h2));
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const H1 = Math.atan2(b1, a1), H2 = Math.atan2(b2, a2);
  let d = H2 - H1;
  if (hueDir > 0) { while (d < 0) d += 2 * Math.PI; }
  else if (hueDir < 0) { while (d > 0) d -= 2 * Math.PI; }
  else { d = Math.atan2(Math.sin(d), Math.cos(d)); }
  // 無彩色に近い色は色相が不安定なので、彩度の高い側の色相を使う
  const H =C1 < 0.02 ? H2 : C2 < 0.02 ? H1 : H1 + d * t;
  const C = lerp(C1, C2, t);
  return oklabToRgb([lerp(L1, L2, t), C * Math.cos(H), C * Math.sin(H)]);
}

export const rgbCss = ([r, g, b], alpha = 1) =>
  `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${alpha})`;
