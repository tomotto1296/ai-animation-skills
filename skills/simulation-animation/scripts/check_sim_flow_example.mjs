// 【例】流れ・運搬系のシミュレーションの検査（検証 T7 アリのコロニーで使ったもの。sim.mjs に依存するので、そのままは動かない）
//   見本として: シード1〜40 の総当たり、全滅・NaN、納品数の推移、止まっている個体の割合（固まらないか）、密度（団子）、
//   道の芯の濃度の推移（太る様子が見せ場の時刻に出るか）を、書き出す前に数値で確かめる。採用基準を数値で決めて、満たすシードを選ぶ。
//   結果は notes に残す。
// 書き出し前の数値検査（全尺・シード総当たり）: 全滅/固まり/動きの継続/餌の運搬量/道の太り方
import { simulate, NEST, FOOD, GW, GH, CELL } from './sim.mjs';
const seeds = process.argv.slice(2).map(Number);
const list = seeds.length ? seeds : Array.from({ length: 40 }, (_, i) => i + 1);
const FPS = 30;
const dx = FOOD[0] - NEST[0], dy = FOOD[1] - NEST[1], L = Math.hypot(dx, dy);
const distLine = (x, y) => Math.abs((x - NEST[0]) * dy - (y - NEST[1]) * dx) / L;
const rows = [];
for (const seed of list) {
  const fr = simulate(seed);
  const nan = fr.some((s) => s.ants.some((a) => a.some((v) => !Number.isFinite(v))));
  const firstPick = fr.findIndex((s) => s.picked > 0) / FPS;
  const firstDel = fr.findIndex((s) => s.delivered > 0) / FPS;
  // 動きの継続: 1秒前との位置差が小さい（<25px）アリの割合の最大
  let stuckMax = 0, clusterMax = 0;
  for (let i = FPS; i < fr.length; i++) {
    let st = 0; const n = fr[i].ants.length;
    for (let k = 0; k < Math.min(n, fr[i - FPS].ants.length); k++) {
      const a = fr[i].ants[k], b = fr[i - FPS].ants[k];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 25) st++;
    }
    stuckMax = Math.max(stuckMax, st / n);
  }
  for (let i = 0; i < fr.length; i += 10) {
    const cnt = new Map();
    for (const a of fr[i].ants) { const key = Math.floor(a[0] / 60) + ',' + Math.floor(a[1] / 60); cnt.set(key, (cnt.get(key) || 0) + 1); }
    clusterMax = Math.max(clusterMax, Math.max(...cnt.values()));
  }
  // 道の濃さ: 回廊(線から40px以内)の平均値/ピークと、全体に占める割合を秒ごとに
  const sec = [];
  for (let s = 1; s <= 10; s++) {
    const f = fr[Math.min(fr.length - 1, s * FPS - 1)];
    let corr = 0, tot = 0, nc = 0, wideN = 0, wideSum = 0;
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const v = f.ph[gy * GW + gx] / 32, x = gx * CELL + 4, y = gy * CELL + 4;
      tot += v;
      const d = distLine(x, y);
      const along = ((x - NEST[0]) * dx + (y - NEST[1]) * dy) / L;
      if (along > 40 && along < L - 40) {
        if (d < 40) { corr += v; nc++; }
        if (d < 14) { wideSum += v; wideN++; }
      }
    }
    sec.push({ s, corrMean: +(corr / nc).toFixed(2), coreMean: +(wideSum / wideN).toFixed(2), frac: +(corr / Math.max(tot, 1e-9)).toFixed(2), carried: f.ants.filter((a) => a[3]).length, delivered: f.delivered });
  }
  const last = fr.at(-1);
  // 終盤3秒の運搬ペース(個/秒)
  const rate = (last.delivered - fr[7 * FPS].delivered) / 3;
  rows.push({ seed, nan, firstPick: +firstPick.toFixed(1), firstDel: +firstDel.toFixed(1), delivered: last.delivered, picked: last.picked, rateLast3s: +rate.toFixed(1), stuckMax: +stuckMax.toFixed(2), clusterMax, core: sec.map((x) => x.coreMean), carried: sec.map((x) => x.carried), mean3: sec[2].corrMean, mean9: sec[8].corrMean });
}
for (const r of rows) console.log(JSON.stringify(r));
