// 【例】全コマの数値検査（検証 T5 フィギュアスケートで使ったもの。そのままは動かない: draw.mjs の pose(t) に依存）
//   見本として: 骨の長さの誤差・めり込み・角度の連続性（累積角）・足の浮き/滑り・NaN を、書き出す前に全コマで数値化する。
//   自分の作品では pose(t) が返す形（関節の座標）に合わせて書き換える。結果は notes に残す。
//   実績: 屈んだ間に自由足が氷の下（-32.6cm）へ出る、腕の目標が腕の長さを超えて 4.3cm 届かない、を描画前に発見した
// 全コマの数値検査: 骨の長さ・めり込み・角度の連続性・足の滑り・NaN
import { pose, _script } from './draw.mjs';
const FPS = 30, N = 300;
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const bones = [['hipR', 'kneeR', 44], ['kneeR', 'ankR', 44], ['hipL', 'kneeL', 44], ['kneeL', 'ankL', 44], ['shR', 'elbR', 28], ['elbR', 'handR', 26], ['shL', 'elbL', 28], ['elbL', 'handL', 26]];
let maxBone = 0, minBlade = 1e9, minHand = 1e9, nan = 0, maxReach = 0;
let prev = null, maxDth = 0, thMonotone = true, maxHandStep = 0, maxAnkAcc = 0, prevPrev = null;
let spinDrift = 0, maxAnkAboveInContact = 0, maxJump = 0;
const stats = { dthAt: 0, handStepAt: 0 };
const ankHist = [];
for (let i = 0; i < N; i++) {
  const t = i / FPS, P = pose(t);
  for (const [a, b, L] of bones) maxBone = Math.max(maxBone, Math.abs(d3(P[a], P[b]) - L));
  for (const k of Object.keys(P)) { const v = P[k]; if (Array.isArray(v)) for (const x of v.flat(2)) if (!Number.isFinite(x)) nan++; }
  for (const b of [...P.bladeR, ...P.bladeL]) minBlade = Math.min(minBlade, b[1]);
  for (const h of [P.handR, P.handL, P.head]) minHand = Math.min(minHand, h[1]);
  maxReach = Math.max(maxReach, ...Object.values(P.reach).map(Math.abs));
  maxJump = Math.max(maxJump, P.yj);
  if (prev) {
    const dth = P.th - prev.th;
    if (dth < -1e-9) thMonotone = false;
    if (dth > maxDth) { maxDth = dth; stats.dthAt = t; }
    for (const k of ['handR', 'handL']) { const s = d3(P[k], prev[k]); if (s > maxHandStep) { maxHandStep = s; stats.handStepAt = t; } }
    // 支え足（右）: 接地中(空中でない)に足首が氷から浮く量
    if (!P.flight && !prev.flight) maxAnkAboveInContact = Math.max(maxAnkAboveInContact, P.ankR[1] - 7);
    // スピン中の支え足の水平移動（軸の真下に固定されているか）
    if (t > 7.4 && t < 9.7) spinDrift = Math.max(spinDrift, Math.hypot(P.ankR[0] - prev.ankR[0], P.ankR[2] - prev.ankR[2]));
  }
  prevPrev = prev; prev = P;
}
const P0 = pose(0), PE = pose(299 / FPS);
console.log(JSON.stringify({
  frames: N,
  nan,
  骨の長さの最大誤差_cm: +maxBone.toExponential(2),
  IKの届かない量の最大_cm: +maxReach.toFixed(3),
  刃の最低高さ_cm_負ならめり込み: +minBlade.toFixed(3),
  手頭の最低高さ_cm: +minHand.toFixed(1),
  θは単調増加: thMonotone,
  θの1コマ最大_度: +(maxDth * 180 / Math.PI).toFixed(1), その時刻: +stats.dthAt.toFixed(2),
  θ累積_回転数: +(PE.th / (2 * Math.PI)).toFixed(3),
  手の1コマ最大移動_cm: +maxHandStep.toFixed(1), その時刻2: +stats.handStepAt.toFixed(2),
  接地中の支え足の浮き_cm: +maxAnkAboveInContact.toFixed(3),
  スピン中の支え足の水平移動_cm_コマ: +spinDrift.toExponential(2),
  最大ジャンプ高_cm: +maxJump.toFixed(1),
  ジャンプ: _script.JUMPS.map((j) => ({ rev: j.rev, T: j.T, H: +j.H.toFixed(1) })),
  スピン倍率: +_script.spinScale.toFixed(4),
}, null, 1));
