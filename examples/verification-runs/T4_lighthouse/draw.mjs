// T4 吹雪の中の灯台 — 設計座標 1920×1080。雪は時刻の関数（風の積分表）なので stateless。DOM なし。
import { mulberry32 } from '../_harness/runtime.js';

const DW = 1920, DH = 1080;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const rgb = (r, g, b, a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${clamp(a)})`;

const LX = 1380, LY = 222, HORIZON = 600;
export const CFG = { period: 5.0, flakes: 5200, haze: 0.5, snowMax: 236 };
// 吹雪の強さ（0〜1）: 弱 → 強 → 弱
export const strength = (t) => 0.22 + 0.78 * Math.exp(-(((t - 5.0) / 2.7) ** 2));

// 風の積分（雪の位置は時刻の関数にする）
const TAB_DT = 1 / 240, TAB_N = Math.round(10 / TAB_DT) + 2;
const WX = new Float64Array(TAB_N), FY = new Float64Array(TAB_N);
{
  let x = 0, y = 0;
  for (let k = 0; k < TAB_N; k++) {
    WX[k] = x; FY[k] = y;
    const s = strength(k * TAB_DT);
    x += 220 + 1500 * s; y += 150 + 220 * s;
  }
}
const tab = (a, t) => { const f = clamp(t / TAB_DT, 0, TAB_N - 1.001), i = Math.floor(f); return lerp(a[i], a[i + 1], f - i); };

let S;
export function setup(ctx, cfg) {
  if (cfg && cfg.params) Object.assign(CFG, cfg.params);
  const r = mulberry32(17);
  S = { flakes: [], stars: [], rocks: [], waves: [] };
  for (let i = 0; i < CFG.flakes; i++) {
    const layer = r() < 0.55 ? 0 : r() < 0.7 ? 1 : 2;       // 0 遠 / 1 中 / 2 近
    S.flakes.push({
      layer, th: i / CFG.flakes, x0: r() * DW, y0: r() * DH, ph: r() * 6.28,
      sz: [1.1 + r() * 1.0, 1.8 + r() * 1.4, 3.4 + r() * 2.6][layer], wob: 8 + r() * 26, sp: [0.55, 0.9, 1.45][layer],
    });
  }
  S.flakes.sort((a, b) => a.th - b.th);
  for (let i = 0; i < 50; i++) S.stars.push({ x: r() * DW, y: r() * 420, s: 0.8 + r() * 1.6, p: r() * 6.28 });
  for (let i = 0; i < 9; i++) S.waves.push({ y: HORIZON + 14 + i * i * 5.2 + i * 18, a: 3 + i * 2.2, k: 0.012 - i * 0.0007, v: 0.8 + i * 0.35, p: r() * 6.28 });
}

function beamState(t, s) {
  const phi = (2 * Math.PI * t) / CFG.period + 0.9;
  const out = [];
  for (const k of [0, 1]) {
    const a = phi + k * Math.PI, cx = Math.cos(a), sz = Math.sin(a);
    const L = (1500 * Math.abs(cx) + 90) / (1 + 1.2 * s);
    out.push({ dx: cx >= 0 ? 1 : -1, sz, L, I: 0.35 + 0.65 * smooth(-0.3, 0.8, sz), slope: 0.12 * sz });
  }
  const G = Math.pow(Math.abs(Math.sin(phi)), 6);
  return { beams: out, G };
}
const halfW = (u, b) => 6 + 0.075 * u * (1 + 0.5 * Math.max(0, b.sz));

export function frame(ctx, i, t) {
  const s = strength(t);
  const { beams, G } = beamState(t, s);

  // ---- 空と海 ----
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, rgb(8, 12, 28)); sky.addColorStop(0.7, rgb(20, 30, 58)); sky.addColorStop(1, rgb(70, 62, 92));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, DW, HORIZON);
  for (const st of S.stars) { ctx.fillStyle = rgb(210, 220, 255, (0.35 + 0.25 * Math.sin(t * 1.5 + st.p)) * (1 - s * 0.8)); ctx.fillRect(st.x, st.y, st.s, st.s); }
  const sea = ctx.createLinearGradient(0, HORIZON, 0, DH);
  sea.addColorStop(0, rgb(34, 46, 74)); sea.addColorStop(1, rgb(10, 16, 30));
  ctx.fillStyle = sea; ctx.fillRect(0, HORIZON, DW, DH - HORIZON);
  // 波
  ctx.lineCap = 'round';
  for (const w of S.waves) {
    const amp = w.a * (0.6 + 0.9 * s);
    ctx.strokeStyle = rgb(120, 140, 175, 0.18 + 0.12 * s); ctx.lineWidth = 2 + w.a * 0.18;
    ctx.beginPath();
    for (let x = -20; x <= DW + 20; x += 24) {
      const y = w.y + Math.sin(x * w.k + t * w.v * (1 + s) + w.p) * amp + Math.sin(x * w.k * 2.3 - t * w.v * 1.7) * amp * 0.35;
      if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // 光線が海に落とす光（遠くの水面のきらめき）
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const b of beams) {
    const gx = LX + b.dx * b.L * 0.92, a = 0.28 * b.I * (1 - s * 0.5);
    const gg = ctx.createRadialGradient(gx, HORIZON + 24, 0, gx, HORIZON + 24, 160);
    gg.addColorStop(0, rgb(255, 240, 200, a)); gg.addColorStop(1, rgb(255, 240, 200, 0));
    ctx.fillStyle = gg; ctx.fillRect(gx - 160, HORIZON - 120, 320, 300);
  }
  ctx.restore();

  // ---- 前景の岩と灯台 ----
  const tower = (c) => rgb(c[0] * 0.42, c[1] * 0.45, c[2] * 0.55);
  // 岩（灯台の立つ崖）
  ctx.fillStyle = rgb(20, 24, 36);
  ctx.beginPath(); ctx.moveTo(1040, DH); ctx.lineTo(1120, 820); ctx.lineTo(1230, 720); ctx.lineTo(1340, 690); ctx.lineTo(1480, 692); ctx.lineTo(1620, 740); ctx.lineTo(1760, 800); ctx.lineTo(DW, 830); ctx.lineTo(DW, DH); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgb(30, 36, 52);
  ctx.beginPath(); ctx.moveTo(0, DH); ctx.lineTo(0, 880); ctx.lineTo(120, 850); ctx.lineTo(260, 900); ctx.lineTo(380, 960); ctx.lineTo(520, DH); ctx.closePath(); ctx.fill();
  // 塔: 赤白の縞
  const topW = 30, botW = 50, y0 = 692, y1 = 262;
  for (let k = 0; k < 6; k++) {
    const ya = lerp(y0, y1, k / 6), yb = lerp(y0, y1, (k + 1) / 6);
    const wa = lerp(botW, topW, k / 6), wb = lerp(botW, topW, (k + 1) / 6);
    ctx.fillStyle = tower(k % 2 ? [205, 50, 50] : [220, 224, 230]);
    ctx.beginPath(); ctx.moveTo(LX - wa, ya); ctx.lineTo(LX + wa, ya); ctx.lineTo(LX + wb, yb); ctx.lineTo(LX - wb, yb); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = tower([60, 60, 70]); ctx.fillRect(LX - 44, 252, 88, 12);       // 回廊
  ctx.fillStyle = rgb(255, 238, 180); ctx.fillRect(LX - 28, 190, 56, 62);        // 灯室
  ctx.fillStyle = tower([90, 30, 30]);
  ctx.beginPath(); ctx.moveTo(LX - 36, 190); ctx.lineTo(LX, 140); ctx.lineTo(LX + 36, 190); ctx.closePath(); ctx.fill();
  ctx.fillStyle = tower([40, 40, 50]); ctx.fillRect(LX - 28, 186, 56, 6); ctx.fillRect(LX - 2, 192, 4, 60);

  // ---- 光線と光のにじみ（加算）----
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const b of beams) {
    const a0 = 0.55 * b.I;
    const ex = LX + b.dx * b.L, ey = LY + b.slope * b.L;
    for (const [wk, ak] of [[1.0, 0.07], [0.86, 0.08], [0.72, 0.09], [0.58, 0.1], [0.44, 0.11], [0.3, 0.12], [0.16, 0.13]]) {
      const g = ctx.createLinearGradient(LX, LY, ex, ey);
      g.addColorStop(0, rgb(255, 244, 215, a0 * ak * 1.6)); g.addColorStop(1, rgb(255, 244, 215, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(LX, LY - 3); ctx.lineTo(ex, ey - halfW(b.L, b) * wk); ctx.lineTo(ex, ey + halfW(b.L, b) * wk); ctx.lineTo(LX, LY + 3); ctx.closePath(); ctx.fill();
    }
  }
  const gr = 70 + 620 * G;
  const glow = ctx.createRadialGradient(LX, LY, 0, LX, LY, gr);
  glow.addColorStop(0, rgb(255, 244, 215, 0.12 + 0.5 * G)); glow.addColorStop(0.3, rgb(255, 236, 190, 0.05 + 0.18 * G)); glow.addColorStop(1, rgb(255, 230, 180, 0));
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(LX, LY, gr, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // ---- 雪 ----
  const nVis = Math.floor(S.flakes.length * clamp(0.1 + 0.9 * s));
  const streak = (220 + 1500 * s) / 30 * 0.55;   // 風が強いほど雪が横に流れて見える
  const wx = tab(WX, t), fy = tab(FY, t);
  const cap = CFG.snowMax;
  for (let n = 0; n < nVis; n++) {
    const f = S.flakes[n];
    let x = (f.x0 - wx * f.sp + Math.sin(t * 1.7 + f.ph) * f.wob) % DW; if (x < 0) x += DW;
    let y = (f.y0 + fy * f.sp * 0.8 + Math.cos(t * 2.1 + f.ph * 1.3) * f.wob * 0.6) % DH; if (y < 0) y += DH;
    // 光線・灯の光を受けて明るく
    let B = 0;
    for (const b of beams) {
      const u = (x - LX) * b.dx;
      if (u > 0 && u < b.L) {
        const ay = LY + b.slope * u, w = halfW(u, b) * 1.1;
        const d = Math.abs(y - ay);
        if (d < w) B = Math.max(B, b.I * (1 - u / b.L) * (1 - d / w));
      }
    }
    const dl = Math.hypot(x - LX, y - LY), sig = 260 + 120 * s;
    B = Math.max(B, G * Math.exp(-(dl * dl) / (2 * sig * sig)) * 0.9);
    const base = 0.30 + 0.12 * f.layer;
    const v = clamp(base + B * (1 - base));
    const R = lerp(110, cap, v), Gc = lerp(124, cap + 4, v), Bc = lerp(156, 250, v);
    const al = (f.layer === 2 ? 0.55 : 0.75) * (0.55 + 0.45 * v);
    const L = streak * f.sp;
    ctx.strokeStyle = rgb(R, Gc, Bc, al); ctx.lineWidth = Math.max(0.8, f.sz * 0.9);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + L, y - L * 0.22); ctx.stroke();
  }
  // 雪の霞（強いほど視界が白く）
  const hz = ctx.createLinearGradient(0, 0, 0, DH);
  hz.addColorStop(0, rgb(120, 134, 160, 0.04 + CFG.haze * 0.5 * s)); hz.addColorStop(1, rgb(150, 164, 188, 0.06 + CFG.haze * s));
  ctx.fillStyle = hz; ctx.fillRect(0, 0, DW, DH);
  // 周辺減光
  const vg = ctx.createRadialGradient(DW / 2, DH / 2, 420, DW / 2, DH / 2, 1180);
  vg.addColorStop(0, rgb(0, 0, 8, 0)); vg.addColorStop(1, rgb(0, 0, 8, 0.45));
  ctx.fillStyle = vg; ctx.fillRect(0, 0, DW, DH);
}
