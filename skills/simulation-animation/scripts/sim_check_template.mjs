// シミュレーションを書き出す前に、全尺を数値で確かめる雛形（ブラウザなし、node だけ）。
//   node sim_check_template.mjs [seed ...]        # seed を省くと 1〜40 を総当たりする
//
// 使い方: 自分の sim.js（DOM を使わない。simulate(seed, frames) が毎コマの状態の配列を返す）に差し替える。
//   - 全滅・発散・NaN・めり込み・山の数など、「出来上がりを決める数字」を1行の JSON で出す
//   - その数字で候補（シード・パラメータ）を選んでから、はじめて描画に進む（例: シード1〜40のうち23で全滅 → 巣穴から産む形に変更、シード29を採用）
//   - 描画の下見より速い。「点が偏っている」といった見間違いも、数値で否定できる
const FPS = 30;
const SECONDS = 24;
const FRAMES = FPS * SECONDS;

// ↓ 差し替える部分（例のダミー: 増減する2つの量）
function simulate(seed, frames) {
  let s = (seed * 2654435761) >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  let a = 100, b = 20;
  const out = [];
  for (let i = 0; i < frames; i++) {
    a += 0.6 * a * (1 - a / 400) - 0.02 * a * b + (rnd() - 0.5);
    b += 0.01 * a * b * 0.1 - 0.05 * b;
    out.push({ a: Math.max(0, a), b: Math.max(0, b) });
  }
  return out;
}

// 山（移動平均で前後 win コマの最大になる点）の秒を返す
function peaks(arr, fps = FPS, smooth = 15, win = 45, gap = 60) {
  const sm = arr.map((_, i) => {
    let s = 0, n = 0;
    for (let j = i - smooth; j <= i + smooth; j++) if (arr[j] !== undefined) { s += arr[j]; n++; }
    return s / n;
  });
  const p = [];
  for (let i = win; i < sm.length - win; i++) {
    let m = true;
    for (let j = i - win; j <= i + win; j++) if (sm[j] > sm[i]) { m = false; break; }
    if (m && (p.length === 0 || i - p[p.length - 1] > gap)) p.push(i);
  }
  return p.map((i) => +(i / fps).toFixed(1));
}

const seeds = process.argv.slice(2).map(Number);
const list = seeds.length ? seeds : Array.from({ length: 40 }, (_, i) => i + 1);
for (const seed of list) {
  const r = simulate(seed, FRAMES);
  const A = r.map((x) => x.a), B = r.map((x) => x.b);
  const bad = r.some((x) => Object.values(x).some((v) => !Number.isFinite(v)));
  console.log(JSON.stringify({
    seed, nan: bad, Amin: +Math.min(...A).toFixed(1), Amax: +Math.max(...A).toFixed(1),
    Bmin: +Math.min(...B).toFixed(1), Bmax: +Math.max(...B).toFixed(1), Apeaks: peaks(A), Bpeaks: peaks(B),
    extinct: A.at(-1) < 1 || B.at(-1) < 1,
  }));
}
