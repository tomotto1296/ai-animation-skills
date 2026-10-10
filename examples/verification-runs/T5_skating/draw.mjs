// T5 フィギュアスケートの連続ジャンプとスピン — 3D の骨格（cm）を回して正射影する。DOM なし。
import { mulberry32 } from '../_harness/runtime.js';

const DW = 1920, DH = 1080;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const rgb = (r, g, b, a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${clamp(a)})`;
const D2R = Math.PI / 180;

// ---- 寸法（cm）----
const THIGH = 44, SHANK = 44, UARM = 28, FARM = 26, SPINE = 46, HIPW = 8, SHW = 19, ANKLE_H = 7;
const LEG = THIGH + SHANK;         // 88
const STAND = 84;                  // 腰から足首までの標準の鉛直距離（脚を伸ばしきらない）
const S = 3.2;                     // px / cm
const GROUND_Y = 900;              // 刃の底の画面 y
const VIEW_YAW = 0.55;             // 斜め前から見る

// ---- 台本 ----
const JUMPS = [{ t0: 1.6, T: 0.55, rev: 1 }, { t0: 3.2, T: 0.65, rev: 2 }, { t0: 4.9, T: 0.85, rev: 3 }];
const G = 981;
for (const j of JUMPS) j.H = (G * j.T * j.T) / 8; // 滞空時間から高さ（cm）
const SPIN = { t0: 6.6, t1: 9.8 };

// ---- キーフレーム（区間ごとに smoothstep。端は C1）----
function keyed(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [ta, va] = keys[i], [tb, vb] = keys[i + 1];
    if (t < tb) return lerp(va, vb, smooth(ta, tb, t));
  }
  return keys[keys.length - 1][1];
}
const K = { c: [[0, 0.10]], psi: [[0, -28]], phi: [[0, 72]], aF: [[0, 0]], tuck: [[0, 0]] };
for (const { t0, T } of JUMPS) {
  const te = t0 + T;
  K.c.push([t0 - 0.4, 0.12], [t0 - 0.05, 0.5], [t0 + 0.12, 0.0], [te - 0.03, 0.0], [te + 0.1, 0.5], [te + 0.5, 0.12]);
  K.psi.push([t0 - 0.4, -28], [t0 + 0.05, -10], [t0 + 0.2, 0], [te - 0.2, 0], [te + 0.1, -55], [te + 0.7, -28]);
  K.phi.push([t0 - 0.4, 72], [t0 - 0.05, 45], [t0 + 0.2, 10], [te - 0.2, 10], [te + 0.05, 100], [te + 0.6, 72]);
  K.aF.push([t0 - 0.4, 0], [t0 - 0.05, -22], [t0 + 0.2, 10], [te - 0.2, 10], [te + 0.05, 0]);
  K.tuck.push([t0 + 0.05, 0], [t0 + 0.2, 1], [te - 0.2, 1], [te - 0.04, 0]);
}
K.c.push([6.2, 0.12], [6.6, 0.85], [8.0, 0.85], [8.7, 0.0]);
K.psi.push([6.2, -28], [6.6, 80], [8.0, 80], [8.7, -40], [9.4, -40], [9.8, 0]);
K.phi.push([6.2, 72], [6.6, 35], [8.0, 35], [8.7, 170], [9.4, 170], [9.8, 100]);
K.aF.push([6.2, 0], [6.6, 30], [8.0, 30], [8.7, 0]);
for (const k of Object.keys(K)) K[k].sort((a, b) => a[0] - b[0]);

// ---- 回転角 θ（巻き戻しなし・累積）と並進 x を細かく積分して表にする ----
const TAB_DT = 1 / 1920, TAB_N = Math.round(10 / TAB_DT) + 1;
const thetaTab = new Float64Array(TAB_N), xTab = new Float64Array(TAB_N);
const spinProfile = (t) => (2.5 * smooth(6.6, 7.3, t) + 1.1 * smooth(8.2, 9.0, t)) * (1 - smooth(9.2, 9.8, t));
function omegaJump(t) {
  for (const { t0, T, rev } of JUMPS) if (t > t0 && t < t0 + T) { const u = (t - t0) / T; return (rev * 2 * Math.PI / T) * 6 * u * (1 - u); }
  return 0;
}
let spinScale = 1;
{
  let A = 0;
  for (let k = 0; k < TAB_N; k++) A += 2 * Math.PI * spinProfile(k * TAB_DT) * TAB_DT;
  const target = Math.round(A / (2 * Math.PI)) + 0.25;   // 最後は少し横を向いて止まる
  spinScale = (target * 2 * Math.PI) / A;
}
const speed = (t) => 380 * (1 + 0.04 * Math.sin(t * 2.3)) * (1 - smooth(5.9, 6.7, t));
{
  let th = 0, x = 0;
  for (let k = 0; k < TAB_N; k++) {
    thetaTab[k] = th; xTab[k] = x;
    const t = k * TAB_DT;
    th += (omegaJump(t) + 2 * Math.PI * spinProfile(t) * spinScale) * TAB_DT;
    x += speed(t) * TAB_DT;
  }
}
const tab = (arr, t) => { const f = clamp(t / TAB_DT, 0, TAB_N - 1.001), i = Math.floor(f); return lerp(arr[i], arr[i + 1], f - i); };

// ---- 2 関節 IK（膝・ひじ）----
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function ik(A, T, L1, L2, pole) {
  const v = sub(T, A);
  const dRaw = len(v), d = clamp(dRaw, 1e-3, L1 + L2 - 1e-3);
  const dir = mul(v, 1 / (dRaw || 1));
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  let perp = sub(pole, mul(dir, dot(pole, dir)));
  if (len(perp) < 1e-6) perp = [0, 0, 1];
  perp = norm(perp);
  return { mid: add(add(A, mul(dir, a)), mul(perp, h)), end: add(A, mul(dir, d)), reach: dRaw - d };
}

// ---- 姿勢（世界座標 cm。X=右, Y=上, Z=手前）----
export function pose(t) {
  const th = tab(thetaTab, t), px = tab(xTab, t);
  const yaw = th + VIEW_YAW;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const W = (f, y, l) => [f * cy + l * sy, y, -f * sy + l * cy]; // 体の座標(前,上,横) → 回転後
  const c = keyed(K.c, t), psi = keyed(K.psi, t) * D2R, phi = keyed(K.phi, t) * D2R, aF = keyed(K.aF, t), tuck = keyed(K.tuck, t);
  let yj = 0, flight = false;
  for (const { t0, T, H } of JUMPS) if (t > t0 && t < t0 + T) { const u = (t - t0) / T; yj = H * 4 * u * (1 - u); flight = true; }
  const lean = (5 + 30 * c) * D2R;
  const pelvis = [px, ANKLE_H + yj + STAND * (1 - 0.55 * c), 0];
  const at = (f, y, l) => add(pelvis, W(f, y, l));
  const spineDir = [Math.sin(lean), Math.cos(lean)];
  const chest = at(SPINE * spineDir[0], SPINE * spineDir[1], 0);
  const neckTop = at((SPINE + 10) * spineDir[0], (SPINE + 10) * spineDir[1], 0);
  const head = at((SPINE + 24) * spineDir[0] + 1.5, (SPINE + 24) * spineDir[1], 0);
  // 脚: 支え足(R,横+)の足首は軸の真下（スピンで足が滑らない）。自由足(L,横-)は psi で前後に振る
  const hipR = at(0, 0, HIPW), hipL = at(0, 0, -HIPW);
  const ankR = [px, ANKLE_H + yj, 0];
  const Lf = STAND;
  const ankLtarget = add(hipL, W(Lf * Math.sin(psi), -Lf * Math.cos(psi), 0));
  ankLtarget[1] = Math.max(ankLtarget[1], ANKLE_H + yj); // 氷より下へ出さない（かがんだ間は両足が氷に着く）
  const poleLeg = W(1, 0.2, 0);
  const legR = ik(hipR, ankR, THIGH, SHANK, poleLeg);
  const legL = ik(hipL, ankLtarget, THIGH, SHANK, W(1, psi > 1 ? 1.0 : 0.2, 0));
  // 腕: 外転角 phi（0=体側, 90=真横, 180=真上）。tuck 中は胸の前でたたむ
  const shR = at(SPINE * spineDir[0] * 0.92, SPINE * spineDir[1] * 0.92, SHW), shL = at(SPINE * spineDir[0] * 0.92, SPINE * spineDir[1] * 0.92, -SHW);
  const armLen = 50;
  const handT = (sh, side) => {
    const out = Math.sin(phi) * armLen, up = -Math.cos(phi) * armLen;
    const v = [aF + (tuck > 0.5 ? 6 : 0), up, side * out * (1 - 0.85 * tuck)];
    const k = Math.min(1, armLen / (len(v) || 1));        // 腕の長さを超えない
    return add(sh, W(v[0] * k, v[1] * k, v[2] * k));
  };
  const armR = ik(shR, handT(shR, 1), UARM, FARM, W(-0.5, -1, 0.35));
  const armL = ik(shL, handT(shL, -1), UARM, FARM, W(-0.5, -1, -0.35));
  const blade = (ank) => [add(ank, W(-14, -ANKLE_H, 0)), add(ank, W(20, -ANKLE_H, 0))];
  return {
    t, th, px, yaw, pelvis, chest, neckTop, head, hipR, hipL, shR, shL,
    kneeR: legR.mid, ankR: legR.end, kneeL: legL.mid, ankL: legL.end,
    elbR: armR.mid, handR: armR.end, elbL: armL.mid, handL: armL.end,
    bladeR: blade(legR.end), bladeL: blade(legL.end), yj, flight, c, psi, phi,
    reach: { legR: legR.reach, legL: legL.reach, armR: armR.reach, armL: armL.reach },
    W,
  };
}
export const _script = { JUMPS, SPIN, spinScale };

// ---- 背景の定数 ----
let SC;
export function setup() {
  const r = mulberry32(5);
  SC = { scratches: [], crowd: [], ads: [] };
  for (let i = 0; i < 260; i++) SC.scratches.push({ x: -500 + r() * 3600, y: 700 + r() * 360, l: 60 + r() * 220, c: (r() - 0.5) * 30, a: 0.18 + r() * 0.25, d: r() < 0.5 });
  for (let i = 0; i < 160; i++) SC.crowd.push({ x: r() * 2400, y: 40 + r() * 400, c: [60 + r() * 120, 60 + r() * 110, 80 + r() * 140], s: 5 + r() * 4 });
  const cols = [[190, 50, 60], [40, 90, 160], [230, 190, 50], [50, 150, 110]];
  for (let i = 0; i < 12; i++) SC.ads.push(cols[i % cols.length]);
}

const rrectPath = (ctx, x, y, w, h, r) => {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
};

export function frame(ctx, i, t) {
  const P = pose(t);
  const camX = P.px;
  const sx = (X) => DW / 2 + (X - camX) * S;
  const sy = (Y) => GROUND_Y - Y * S;

  // 背景: 客席・フェンス
  const bg = ctx.createLinearGradient(0, 0, 0, 640);
  bg.addColorStop(0, rgb(18, 22, 44)); bg.addColorStop(1, rgb(52, 60, 96));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, DW, 640);
  for (const p of SC.crowd) {
    const x = ((p.x - camX * 0.25) % 2400 + 2400) % 2400 - 240;
    ctx.fillStyle = rgb(p.c[0], p.c[1], p.c[2], 0.55);
    ctx.beginPath(); ctx.arc(x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
  }
  // 照明（ゆっくり揺れる光の筋）
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 3; k++) {
    const cx = 480 + k * 480 + Math.sin(t * 0.7 + k * 2) * 80;
    const g = ctx.createLinearGradient(cx, 0, cx, 700);
    g.addColorStop(0, rgb(120, 150, 230, 0.16)); g.addColorStop(1, rgb(120, 150, 230, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx - 20, 0); ctx.lineTo(cx + 20, 0); ctx.lineTo(cx + 190, 700); ctx.lineTo(cx - 190, 700); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // フェンス（広告）
  const adW = 300, off = ((camX * 0.55 * 1) % (adW * SC.ads.length) + adW * SC.ads.length) % (adW * SC.ads.length);
  for (let k = -1; k < 8; k++) {
    const idx = (Math.floor(off / adW) + k + 120) % SC.ads.length;
    const x = k * adW - (off % adW);
    const c = SC.ads[idx];
    ctx.fillStyle = rgb(c[0], c[1], c[2]); ctx.fillRect(x + 4, 520, adW - 8, 110);
    ctx.fillStyle = rgb(255, 255, 255, 0.85); ctx.fillRect(x + 40, 560, adW - 80, 10); ctx.fillRect(x + 60, 584, adW - 120, 8);
  }
  ctx.fillStyle = rgb(236, 238, 244); ctx.fillRect(0, 510, DW, 12);
  // 氷
  const ice = ctx.createLinearGradient(0, 630, 0, DH);
  ice.addColorStop(0, rgb(170, 196, 220)); ice.addColorStop(0.5, rgb(200, 222, 238)); ice.addColorStop(1, rgb(176, 202, 224));
  ctx.fillStyle = ice; ctx.fillRect(0, 630, DW, DH - 630);
  ctx.lineCap = 'round';
  for (const sc of SC.scratches) {
    const wx = DW / 2 + (sc.x - camX) * S * 0.33;
    if (wx < -300 || wx > DW + 300) continue;
    ctx.strokeStyle = sc.d ? rgb(120, 150, 180, sc.a) : rgb(240, 248, 255, sc.a + 0.15);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(wx, sc.y); ctx.quadraticCurveTo(wx + sc.l / 2, sc.y + sc.c, wx + sc.l, sc.y + sc.c * 0.3); ctx.stroke();
  }

  // 影
  const sh = clamp(1 - P.yj / 140, 0.3, 1);
  ctx.fillStyle = rgb(30, 50, 80, 0.30 * sh);
  ctx.beginPath(); ctx.ellipse(sx(P.px), GROUND_Y + 8, 70 * (0.8 + 0.2 * sh), 12 * sh, 0, 0, Math.PI * 2); ctx.fill();

  // 体: 部位ごとに奥行き順に描く
  const pt = (p) => [sx(p[0]), sy(p[1])];
  const limb = (a, b, w, col) => {
    const [ax, ay] = pt(a), [bx, by] = pt(b);
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, w * S); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  };
  const SKIN = rgb(240, 200, 170), DRESS = rgb(205, 40, 78), TIGHT = rgb(238, 224, 228), BOOT = rgb(250, 250, 250), HAIR = rgb(70, 40, 30);
  const parts = [];
  const shade = (c, z) => { const k = 0.86 + 0.14 * clamp((z + 60) / 120); return c.replace(/rgba\((\d+),(\d+),(\d+)/, (m, r, g, b) => `rgba(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)}`); };
  const bladeDraw = (bl, ank) => () => {
    limb(ank, add(ank, P.W(14, -3, 0)), 6.5, BOOT);
    limb(bl[0], bl[1], 1.6, rgb(150, 160, 175));
    limb(add(ank, P.W(-2, -ANKLE_H + 1, 0)), add(ank, P.W(-2, -ANKLE_H + 4, 0)), 1.2, rgb(150, 160, 175));
  };
  const addPart = (z, fn) => parts.push([z, fn]);
  addPart(P.ankR[2], () => { limb(P.hipR, P.kneeR, 11, shade(TIGHT, P.kneeR[2])); limb(P.kneeR, P.ankR, 9, shade(TIGHT, P.ankR[2])); bladeDraw(P.bladeR, P.ankR)(); });
  addPart(P.ankL[2], () => { limb(P.hipL, P.kneeL, 11, shade(TIGHT, P.kneeL[2])); limb(P.kneeL, P.ankL, 9, shade(TIGHT, P.ankL[2])); bladeDraw(P.bladeL, P.ankL)(); });
  addPart(P.handR[2], () => { limb(P.shR, P.elbR, 8, shade(SKIN, P.elbR[2])); limb(P.elbR, P.handR, 6.5, shade(SKIN, P.handR[2])); const [x, y] = pt(P.handR); ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(x, y, 3.6 * S, 0, Math.PI * 2); ctx.fill(); });
  addPart(P.handL[2], () => { limb(P.shL, P.elbL, 8, shade(SKIN, P.elbL[2])); limb(P.elbL, P.handL, 6.5, shade(SKIN, P.handL[2])); const [x, y] = pt(P.handL); ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(x, y, 3.6 * S, 0, Math.PI * 2); ctx.fill(); });
  addPart(0, () => {
    // 胴＋スカート
    limb(P.pelvis, P.chest, 20, DRESS);
    const [hx, hy] = pt(P.pelvis);
    ctx.fillStyle = DRESS; ctx.beginPath();
    ctx.moveTo(hx - 17 * S, hy - 4 * S); ctx.quadraticCurveTo(hx - 30 * S, hy + 12 * S, hx - 26 * S, hy + 20 * S);
    ctx.lineTo(hx + 26 * S, hy + 20 * S); ctx.quadraticCurveTo(hx + 30 * S, hy + 12 * S, hx + 17 * S, hy - 4 * S); ctx.closePath(); ctx.fill();
    limb(P.neckTop, P.chest, 6, SKIN);
    // 頭・髪・鼻（向きが読めるよう）
    const [cx, cy] = pt(P.head);
    const nose = pt(add(P.head, P.W(11, -1, 0)));
    const tail = pt(add(P.head, P.W(-13, -2, 0)));
    ctx.fillStyle = HAIR; ctx.beginPath(); ctx.arc(tail[0], tail[1], 5.5 * S, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(cx, cy, 11 * S, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = HAIR; ctx.beginPath(); ctx.arc(cx, cy - 1 * S, 11 * S, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    ctx.fillStyle = rgb(210, 150, 130); ctx.beginPath(); ctx.arc(nose[0], nose[1], 1.8 * S, 0, Math.PI * 2); ctx.fill();
  });
  // 奥の部位から描く（胴は Z=0 の位置）
  parts.sort((a, b) => a[0] - b[0]);
  for (const [, fn] of parts) fn();
}
