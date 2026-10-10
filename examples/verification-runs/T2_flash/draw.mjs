// T2 夜の廊下でカメラのフラッシュを焚く — 一点透視の廊下（ワールド座標 m）。DOM なし。
import { mulberry32 } from '../_harness/runtime.js';

const DW = 1920, DH = 1080;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;

// ---- フラッシュの台本と包絡 ----
export const FLASHES = [[1.4, 1.0], [3.1, 0.85], [3.45, 1.0], [5.9, 0.9], [7.7, 0.75]]; // [開始秒, 強さ]
export const CFG = { rise: 2 / 30, tau1: 0.24, tau2: 0.9, w1: 0.7, gain: 1.0 };
export function flash(t) {
  let f = 0;
  for (const [ts, pk] of FLASHES) {
    const u = t - ts;
    if (u < 0) continue;
    const up = smooth(0, CFG.rise, u);
    const dn = CFG.w1 * Math.exp(-Math.max(0, u - CFG.rise) / CFG.tau1) + (1 - CFG.w1) * Math.exp(-Math.max(0, u - CFG.rise) / CFG.tau2);
    f = Math.max(f, pk * up * dn);
  }
  return f * CFG.gain;
}

// ---- 透視 ----
const F = 1000, VPX = 960, VPY = 500, HALF_W = 1.5, CEIL = 2.6, EYE = 1.5, BACK = 9;
const camZ = (t) => 0.12 * t;
let S;
export function setup(ctx, cfg) {
  if (cfg && cfg.params) Object.assign(CFG, cfg.params);
  const r = mulberry32(3);
  S = { motes: [] };
  for (let i = 0; i < 46; i++) S.motes.push({ x: -1.4 + r() * 1.0, y: 0.3 + r() * 1.9, z: 5 + r() * 2.6, p: r() * 6.28, a: 0.05 + r() * 0.1, s: 1 + r() * 1.4 });
}

export function frame(ctx, i, t) {
  const f = flash(t);
  const cz = camZ(t);
  const proj = (X, Y, Z) => { const d = Math.max(0.35, Z - cz); return [VPX + (F * X) / d, VPY - (F * (Y - EYE)) / d]; };
  // 色: 環境（青い月明かり）＋フラッシュ（手前ほど強い・暖かい白）
  const fall = (z) => { const d = Math.max(0.5, z - cz); return 1 / (1 + 0.07 * d * d); };
  const shade = (base, z, extra = 0) => {
    const fl = f * fall(z);
    const amb = 0.14 + extra;
    const r = base[0] * (amb * 0.62 + fl * 1.0), g = base[1] * (amb * 0.72 + fl * 0.97), b = base[2] * (amb * 1.0 + fl * 0.92);
    return `rgb(${Math.min(236, r) | 0},${Math.min(236, g) | 0},${Math.min(236, b) | 0})`;
  };
  const quad = (pts, fill) => {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.closePath(); ctx.fill();
  };
  ctx.fillStyle = 'rgb(6,8,16)'; ctx.fillRect(0, 0, DW, DH);

  const z0 = cz + 0.7, STEP = 0.25;
  // 床・天井・左右の壁（奥行きの帯ごとに塗る）
  for (let z = z0; z < BACK; z += STEP) {
    const za = z, zb = Math.min(BACK, z + STEP + 0.02), zm = (za + zb) / 2;
    const band = Math.floor(za / 0.5) % 2;
    quad([proj(-HALF_W, 0, za), proj(HALF_W, 0, za), proj(HALF_W, 0, zb), proj(-HALF_W, 0, zb)], shade(band ? [96, 78, 62] : [104, 84, 68], zm));
    quad([proj(-0.5, 0.001, za), proj(0.5, 0.001, za), proj(0.5, 0.001, zb), proj(-0.5, 0.001, zb)], shade([130, 36, 46], zm));
    quad([proj(-HALF_W, CEIL, za), proj(HALF_W, CEIL, za), proj(HALF_W, CEIL, zb), proj(-HALF_W, CEIL, zb)], shade([196, 194, 186], zm));
    quad([proj(-HALF_W, 0, za), proj(-HALF_W, CEIL, za), proj(-HALF_W, CEIL, zb), proj(-HALF_W, 0, zb)], shade([186, 180, 166], zm));
    quad([proj(HALF_W, 0, za), proj(HALF_W, CEIL, za), proj(HALF_W, CEIL, zb), proj(HALF_W, 0, zb)], shade([186, 180, 166], zm));
    // 巾木
    quad([proj(-HALF_W, 0, za), proj(-HALF_W, 0.12, za), proj(-HALF_W, 0.12, zb), proj(-HALF_W, 0, zb)], shade([225, 222, 214], zm));
    quad([proj(HALF_W, 0, za), proj(HALF_W, 0.12, za), proj(HALF_W, 0.12, zb), proj(HALF_W, 0, zb)], shade([225, 222, 214], zm));
  }
  // 突き当たり: ドア（下から光が漏れる）
  quad([proj(-HALF_W, 0, BACK), proj(HALF_W, 0, BACK), proj(HALF_W, CEIL, BACK), proj(-HALF_W, CEIL, BACK)], shade([170, 166, 154], BACK));
  quad([proj(-0.55, 0, BACK - 0.01), proj(0.55, 0, BACK - 0.01), proj(0.55, 2.1, BACK - 0.01), proj(-0.55, 2.1, BACK - 0.01)], shade([90, 56, 36], BACK));

  // 壁の物（side: -1 左 / +1 右、z0..z1、y0..y1）。4 分割して奥行きの陰影を付ける
  const onWall = (side, za, zb, y0, y1, base, extra = 0) => {
    const X = side * HALF_W, n = 4;
    for (let k = 0; k < n; k++) {
      const a = lerp(za, zb, k / n), b = lerp(za, zb, (k + 1) / n);
      quad([proj(X, y0, a), proj(X, y1, a), proj(X, y1, b + 0.005), proj(X, y0, b + 0.005)], shade(base, (a + b) / 2, extra));
    }
  };
  // 左: ドア・窓・絵 / 右: 絵・ドア・絵
  onWall(-1, 2.4, 3.4, 0.0, 2.1, [88, 56, 36]);
  onWall(-1, 2.5, 3.3, 0.15, 0.95, [74, 46, 30]); onWall(-1, 2.5, 3.3, 1.15, 1.95, [74, 46, 30]);
  onWall(1, 2.2, 3.0, 1.15, 2.0, [60, 44, 34]); onWall(1, 2.27, 2.93, 1.22, 1.93, [150, 170, 150]);
  onWall(1, 4.0, 5.0, 0.0, 2.1, [96, 62, 40]);
  onWall(1, 6.0, 6.8, 1.2, 1.9, [60, 44, 34]); onWall(1, 6.06, 6.74, 1.26, 1.84, [190, 150, 110]);
  onWall(-1, 6.6, 7.4, 1.15, 1.95, [60, 44, 34]); onWall(-1, 6.66, 7.34, 1.21, 1.89, [140, 150, 180]);
  // 窓（左壁 z 5.0〜6.3）: 月明かりで自ら光る。雲が流れる
  {
    const X = -HALF_W, za = 4.2, zb = 5.6, y0 = 0.9, y1 = 2.2;
    onWall(-1, za - 0.1, zb + 0.1, y0 - 0.1, y1 + 0.1, [222, 220, 212]);
    const sky = 0.55 + 0.25 * Math.sin(t * 0.5) ;
    for (let k = 0; k < 6; k++) {
      const a = lerp(za, zb, k / 6), b = lerp(za, zb, (k + 1) / 6);
      const cloud = 0.5 + 0.5 * Math.sin(t * 0.6 + k * 1.3);
      const c = [50 + 40 * cloud * sky, 82 + 40 * cloud * sky, 150 + 40 * cloud * sky];
      quad([proj(X, y0, a), proj(X, y1, a), proj(X, y1, b + 0.005), proj(X, y0, b + 0.005)], `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`);
    }
    // 月: 壁の面に貼る楕円（窓の枠の中に収まる大きさ）
    ctx.fillStyle = 'rgb(248,246,220)'; ctx.beginPath();
    for (let k = 0; k <= 24; k++) {
      const ang = (k / 24) * Math.PI * 2, zc = 4.65 + Math.cos(ang) * 0.17, yc = 1.75 + Math.sin(ang) * 0.17;
      const [px, py] = proj(X, yc, zc); if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    const mid = lerp(za, zb, 0.5), bar = proj(X, 1.55, mid);
    quad([proj(X, y0, mid - 0.025), proj(X, y1, mid - 0.025), proj(X, y1, mid + 0.025), proj(X, y0, mid + 0.025)], shade([226, 224, 216], mid));
    void bar;
    // 窓の下の月明かりの床
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(...proj(-HALF_W, 0, 4.6), ...proj(0.0, 0, 6.0));
    g.addColorStop(0, 'rgba(90,120,200,0.20)'); g.addColorStop(1, 'rgba(90,120,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); const P = [proj(-HALF_W, 0, 4.2), proj(-HALF_W, 0, 5.6), proj(0.2, 0, 6.8), proj(0.2, 0, 5.6)];
    ctx.moveTo(P[0][0], P[0][1]); for (let k = 1; k < 4; k++) ctx.lineTo(P[k][0], P[k][1]); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // ドアの下の光（ゆっくり揺れる）
  {
    const a = 0.35 + 0.15 * Math.sin(t * 1.7) + 0.08 * Math.sin(t * 4.1);
    const [x0, y0] = proj(-0.5, 0.0, BACK - 0.02), [x1, y1] = proj(0.5, 0.04, BACK - 0.02);
    ctx.fillStyle = `rgba(255,210,130,${a})`; ctx.fillRect(x0, y1, x1 - x0, y0 - y1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gg = ctx.createRadialGradient((x0 + x1) / 2, y0, 0, (x0 + x1) / 2, y0, 130);
    gg.addColorStop(0, `rgba(255,190,100,${a * 0.35})`); gg.addColorStop(1, 'rgba(255,190,100,0)');
    ctx.fillStyle = gg; ctx.fillRect((x0 + x1) / 2 - 130, y0 - 130, 260, 260); ctx.restore();
  }
  // ほこり（月明かりの中）
  ctx.fillStyle = 'rgba(200,215,255,0.5)';
  for (const m of S.motes) {
    const [x, y] = proj(m.x + Math.sin(t * 0.4 + m.p) * m.a, m.y + Math.cos(t * 0.3 + m.p) * m.a + ((t * 0.04 + m.p) % 0.3), m.z);
    ctx.beginPath(); ctx.arc(x, y, Math.max(0.6, m.s * 0.8), 0, Math.PI * 2); ctx.fill();
  }
  // フラッシュの光: 全体のにじみ＋ガラス面の反射のきらめき
  if (f > 0.003) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const bl = ctx.createRadialGradient(VPX, VPY + 60, 0, VPX, VPY + 60, 1100);
    bl.addColorStop(0, `rgba(255,252,240,${0.22 * f})`); bl.addColorStop(1, 'rgba(255,252,240,0)');
    ctx.fillStyle = bl; ctx.fillRect(0, 0, DW, DH);
    for (const [side, zz, yy] of [[1, 2.6, 1.55], [1, 6.4, 1.55], [-1, 7.0, 1.55]]) {
      const [gx, gy] = proj(side * HALF_W, yy, zz);
      const r = (22 + 70 * f) * Math.min(1, 6 / Math.max(1, zz - cz));
      const sg = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
      sg.addColorStop(0, `rgba(255,255,255,${0.9 * f})`); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg; ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
    }
    ctx.restore();
  }
}
