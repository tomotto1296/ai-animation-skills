// T1 暗い部屋の電気を点ける — DOM を使わない描画モジュール（mock_canvas_check と render の両方から使う）
import { mulberry32 } from '../_harness/runtime.js';

const W = 1920, H = 1080;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${clamp(a)})`;

// ---- 蛍光灯の生の点灯状態（管そのもの）。パルス = [開始, 長さ, 強さ]。縁は 0.04 秒 ----
const SWITCH_T = 2.2;
const PULSES = [[2.35, 0.12, 0.5], [2.6, 0.08, 0.4], [2.85, 0.3, 0.55], [3.3, 0.08, 0.35], [3.55, 0.25, 0.6]];
const FINAL_ON = [4.0, 1.0]; // 管がゆっくり温まって定常へ（開始, 長さ）
const EDGE = 0.04;
function tubeRaw(t) {
  let v = 0;
  for (const [s, d, a] of PULSES) v = Math.max(v, a * smooth(s, s + EDGE, t) * (1 - smooth(s + d, s + d + EDGE, t)));
  v = Math.max(v, smooth(FINAL_ON[0], FINAL_ON[0] + FINAL_ON[1], t));
  return v;
}
// 部屋の明るさは管の光を 0.25 秒の箱形で均した値（1コマの平均輝度差を抑える。管そのものは鋭く光る）
function roomLight(t) {
  const N = 16, win = 0.25;
  let s = 0;
  for (let k = 0; k < N; k++) s += tubeRaw(t - (k / (N - 1)) * win);
  return s / N;
}
export const _debug = { tubeRaw, roomLight };

let S = null; // setup で作る定数（星・本・ほこり）
export function setup(ctx, cfg) {
  const r = mulberry32(7);
  S = { stars: [], books: [], motes: [] };
  for (let i = 0; i < 40; i++) S.stars.push({ x: 262 + r() * 356, y: 172 + r() * 380, s: 1 + r() * 2, p: r() * 6.28 });
  const cols = [[170, 60, 50], [50, 90, 150], [60, 130, 90], [200, 160, 60], [120, 70, 140], [210, 120, 60], [80, 80, 90]];
  for (let row = 0; row < 4; row++) {
    let x = 1496;
    while (x < 1736) {
      const w = 14 + r() * 18, h = 70 + r() * 36;
      S.books.push({ row, x, w, h, c: cols[(r() * cols.length) | 0] });
      x += w + 2;
    }
  }
  for (let i = 0; i < 70; i++) S.motes.push({ x: 300 + r() * 1400, y: 120 + r() * 800, a: 10 + r() * 30, w: 0.3 + r() * 0.6, p: r() * 6.28, s: 1.2 + r() * 1.6 });
}

function rrect(ctx, x, y, w, h, rad) {
  const rr = Math.max(0, Math.min(rad, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y); ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function curtain(ctx, x0, x1, t, sign) {
  const sway = Math.sin(t * 0.9 + sign) * 7 + Math.sin(t * 1.7 + sign * 2) * 3;
  ctx.fillStyle = rgb(150, 70, 80);
  ctx.beginPath();
  ctx.moveTo(x0, 130);
  ctx.lineTo(x1, 130);
  ctx.bezierCurveTo(x1 + sway, 300, x1 - sway * 0.5, 450, x1 + sway * 0.8, 640);
  ctx.lineTo(x0 + sway * 0.8, 640);
  ctx.bezierCurveTo(x0 - sway * 0.5, 450, x0 + sway, 300, x0, 130);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgb(110, 45, 55);
  ctx.lineWidth = 3;
  for (let k = 1; k < 4; k++) {
    const u = k / 4, x = lerp(x0, x1, u);
    ctx.beginPath();
    ctx.moveTo(x, 130);
    ctx.bezierCurveTo(x + sway * u, 300, x - sway * 0.4, 450, x + sway * 0.8 * u, 640);
    ctx.stroke();
  }
}

function drawPlant(ctx, t) {
  ctx.fillStyle = rgb(160, 90, 60);
  ctx.beginPath(); ctx.moveTo(90, 690); ctx.lineTo(210, 690); ctx.lineTo(192, 784); ctx.lineTo(108, 784); ctx.closePath(); ctx.fill();
  for (let k = 0; k < 7; k++) {
    const ang = -Math.PI / 2 + (k - 3) * 0.32 + Math.sin(t * 1.1 + k) * 0.035;
    const len = 130 + (k % 3) * 25;
    const bx = 150, by = 690;
    const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
    ctx.fillStyle = rgb(60, 130 + (k % 2) * 25, 70);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo((bx + ex) / 2 + 28, (by + ey) / 2, ex, ey);
    ctx.quadraticCurveTo((bx + ex) / 2 - 28, (by + ey) / 2, bx, by);
    ctx.fill();
  }
}

function drawSofa(ctx) {
  ctx.fillStyle = rgb(60, 95, 120);
  rrect(ctx, 700, 520, 620, 150, 40); ctx.fill();              // 背もたれ
  rrect(ctx, 680, 610, 660, 150, 34); ctx.fill();              // 座面
  ctx.fillStyle = rgb(78, 118, 146);
  rrect(ctx, 720, 560, 280, 110, 24); ctx.fill();
  rrect(ctx, 1020, 560, 280, 110, 24); ctx.fill();
  ctx.fillStyle = rgb(48, 80, 104);
  rrect(ctx, 650, 580, 70, 190, 28); ctx.fill();               // ひじ掛け
  rrect(ctx, 1300, 580, 70, 190, 28); ctx.fill();
  ctx.fillStyle = rgb(60, 40, 30);
  ctx.fillRect(700, 760, 20, 30); ctx.fillRect(1300, 760, 20, 30);
}

function drawCat(ctx, t) {
  const breathe = Math.sin(t * 2.2) * 2.5;
  ctx.fillStyle = rgb(95, 80, 70);
  ctx.beginPath(); ctx.ellipse(1080, 625, 85, 48 + breathe, 0, 0, Math.PI * 2); ctx.fill(); // 体
  ctx.beginPath(); ctx.arc(1000, 585, 38, 0, Math.PI * 2); ctx.fill();                      // 頭
  ctx.beginPath(); ctx.moveTo(974, 560); ctx.lineTo(980, 520); ctx.lineTo(1000, 552); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(1026, 560); ctx.lineTo(1020, 520); ctx.lineTo(1000, 552); ctx.closePath(); ctx.fill();
  const tw = Math.sin(t * 1.6) * 0.5;
  ctx.strokeStyle = rgb(95, 80, 70); ctx.lineWidth = 16; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(1150, 640);
  ctx.bezierCurveTo(1210, 660, 1230 + tw * 30, 600, 1200 + tw * 50, 560 + tw * 20);
  ctx.stroke();
}
function drawCatEyes(ctx, t, litK) {
  const blink = (t % 3.4) > 3.25 ? 0.15 : 1;
  const a = 0.95 * (1 - 0.5 * litK);
  ctx.fillStyle = rgb(190, 255, 120, a);
  for (const x of [988, 1013]) {
    ctx.beginPath(); ctx.ellipse(x, 585, 6, Math.max(0.1, 8 * blink), 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = rgb(10, 20, 10, a);
  for (const x of [988, 1013]) ctx.fillRect(x - 1.3, 578, 2.6, Math.max(0.3, 14 * blink));
}

function drawClock(ctx, t) {
  const cx = 1010, cy = 230, R = 74;
  ctx.fillStyle = rgb(60, 45, 35); ctx.beginPath(); ctx.arc(cx, cy, R + 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = rgb(245, 242, 232); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = rgb(40, 40, 40); ctx.lineWidth = 4;
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6;
    ctx.beginPath(); ctx.moveTo(cx + Math.sin(a) * (R - 12), cy - Math.cos(a) * (R - 12)); ctx.lineTo(cx + Math.sin(a) * (R - 3), cy - Math.cos(a) * (R - 3)); ctx.stroke();
  }
  const sec = Math.floor(t) + 0.12 * Math.sin(smooth(0, 0.15, t % 1) * Math.PI);
  const hands = [[(t / 60) * 6 + 200, R - 28, 6], [(t / 3600) * 360 + 60, R - 46, 8]];
  ctx.lineCap = 'round';
  for (const [deg, len, w] of hands) {
    const a = (deg * Math.PI) / 180;
    ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len); ctx.stroke();
  }
  const a = ((sec * 6 + 90) * Math.PI) / 180;
  ctx.strokeStyle = rgb(200, 40, 40); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(a) * (R - 10), cy - Math.cos(a) * (R - 10)); ctx.stroke();
}

function drawBookshelf(ctx) {
  ctx.fillStyle = rgb(95, 62, 40); ctx.fillRect(1470, 180, 290, 580);
  ctx.fillStyle = rgb(60, 38, 25);
  for (let row = 0; row < 4; row++) ctx.fillRect(1480, 180 + row * 140 + 20, 270, 110);
  for (const b of S.books) {
    const base = 180 + b.row * 140 + 130;
    ctx.fillStyle = rgb(b.c[0], b.c[1], b.c[2]);
    ctx.fillRect(b.x, base - b.h * 0.9, b.w, b.h * 0.9);
  }
  ctx.fillStyle = rgb(120, 80, 52);
  for (let row = 0; row < 4; row++) ctx.fillRect(1470, 310 + row * 140, 290, 10); // 棚板（最下段は本体の下端 750 まで）
  ctx.fillRect(1470, 180, 290, 10);
}

function drawArm(ctx, reach) {
  if (reach <= 0.001) return;
  const wx = lerp(2040, 1486, reach), wy = lerp(640, 504, reach);   // 手首
  const ex = lerp(2160, 1840, reach), ey = lerp(820, 700, reach);   // ひじ
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = rgb(70, 88, 135); ctx.lineWidth = 104;           // そで
  ctx.beginPath(); ctx.moveTo(2300, 600); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.lineWidth = 78;
  ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(wx + 40, wy + 12); ctx.stroke();
  ctx.fillStyle = rgb(236, 192, 160);                                // 手のひら
  ctx.beginPath(); ctx.ellipse(wx, wy, 46, 34, -0.35, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = rgb(236, 192, 160); ctx.lineWidth = 22;          // 人差し指（スイッチを押す）
  ctx.beginPath(); ctx.moveTo(wx - 30, wy - 8); ctx.lineTo(1426, lerp(484, 486, reach)); ctx.stroke();
}

export function frame(ctx, i, t) {
  const raw = tubeRaw(t);
  const L = roomLight(t);
  const dark = 1 - L;

  // 壁・床
  const g = ctx.createLinearGradient(0, 0, 0, 760);
  g.addColorStop(0, rgb(214, 210, 198)); g.addColorStop(1, rgb(190, 184, 170));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 760);
  ctx.fillStyle = rgb(156, 116, 80); ctx.fillRect(0, 760, W, 320);
  ctx.strokeStyle = rgb(128, 92, 62); ctx.lineWidth = 3;
  for (let k = 0; k < 9; k++) { const y = 790 + k * 38; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.fillStyle = rgb(236, 232, 222); ctx.fillRect(0, 748, W, 22);
  // ラグ
  ctx.fillStyle = rgb(128, 62, 74); rrect(ctx, 560, 880, 800, 160, 20); ctx.fill();
  ctx.strokeStyle = rgb(210, 180, 140); ctx.lineWidth = 8; rrect(ctx, 580, 896, 760, 128, 14); ctx.stroke();

  // 窓枠・カーテン
  ctx.fillStyle = rgb(240, 238, 230); ctx.fillRect(240, 150, 400, 440);
  curtain(ctx, 205, 305, t, 1);
  curtain(ctx, 575, 675, t, -1);
  // 額
  ctx.fillStyle = rgb(90, 60, 40); ctx.fillRect(770, 330, 140, 110);
  ctx.fillStyle = rgb(90, 140, 170); ctx.fillRect(780, 340, 120, 90);
  ctx.fillStyle = rgb(70, 120, 80); ctx.beginPath(); ctx.moveTo(780, 430); ctx.lineTo(830, 380); ctx.lineTo(870, 410); ctx.lineTo(900, 395); ctx.lineTo(900, 430); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgb(90, 60, 40); ctx.fillRect(1130, 310, 110, 130);
  ctx.fillStyle = rgb(230, 190, 120); ctx.fillRect(1140, 320, 90, 110);
  ctx.fillStyle = rgb(200, 90, 60); ctx.beginPath(); ctx.arc(1185, 375, 26, 0, Math.PI * 2); ctx.fill();

  drawClock(ctx, t);
  drawBookshelf(ctx);
  drawPlant(ctx, t);
  drawSofa(ctx);
  drawCat(ctx, t);

  // スイッチ（壁）
  ctx.fillStyle = rgb(246, 244, 238); rrect(ctx, 1390, 440, 56, 92, 8); ctx.fill();
  const pressed = t > SWITCH_T;
  ctx.fillStyle = pressed ? rgb(190, 188, 180) : rgb(220, 218, 210);
  rrect(ctx, 1402, pressed ? 482 : 454, 32, 34, 4); ctx.fill();
  // 蛍光灯の器具
  ctx.fillStyle = rgb(205, 205, 200); rrect(ctx, 560, 28, 800, 56, 8); ctx.fill();

  // 腕（スイッチを押す）
  const reach = smooth(1.4, 2.1, t) * (1 - smooth(2.45, 3.1, t));
  drawArm(ctx, reach);

  // ---- 暗さ（部屋の明るさに追従）----
  ctx.fillStyle = rgb(8, 12, 30, 0.88 * dark);
  ctx.fillRect(0, 0, W, H);

  // ---- 自分で光るもの（暗さの上に描く）----
  // 窓の外（夜空・月）
  const sky = ctx.createLinearGradient(0, 160, 0, 580);
  sky.addColorStop(0, rgb(10, 18, 48)); sky.addColorStop(1, rgb(36, 58, 108));
  ctx.fillStyle = sky; ctx.fillRect(255, 165, 370, 410);
  for (const s of S.stars) {
    ctx.fillStyle = rgb(255, 255, 230, 0.5 + 0.4 * Math.sin(t * 1.3 + s.p));
    ctx.fillRect(s.x - s.s / 2, s.y - s.s / 2, s.s, s.s);
  }
  ctx.fillStyle = rgb(250, 248, 220); ctx.beginPath(); ctx.arc(520, 270, 44, 0, Math.PI * 2); ctx.fill();
  // 窓の外の地平（街の影）
  ctx.fillStyle = rgb(8, 12, 28);
  for (let k = 0; k < 8; k++) ctx.fillRect(262 + k * 46, 540 - ((k * 37) % 50), 40, 40 + ((k * 37) % 50));
  ctx.fillStyle = rgb(240, 238, 230); ctx.fillRect(432, 160, 8, 420); ctx.fillRect(250, 368, 380, 8); // 桟
  // スイッチの小さな常夜灯（暗いときだけ見える）
  ctx.fillStyle = rgb(120, 255, 160, 0.9 * dark); ctx.beginPath(); ctx.arc(1418, 452, 4, 0, Math.PI * 2); ctx.fill();
  // 月明かり（床へ）。部屋が暗いほど強い
  const mk = 0.03 + 0.21 * dark;
  const mg = ctx.createLinearGradient(440, 580, 900, 1060);
  mg.addColorStop(0, rgb(130, 160, 230, mk)); mg.addColorStop(1, rgb(130, 160, 230, 0));
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = mg;
  ctx.beginPath(); ctx.moveTo(255, 575); ctx.lineTo(625, 575); ctx.lineTo(1120, 1080); ctx.lineTo(560, 1080); ctx.closePath(); ctx.fill();
  // 管の周りの光（鋭い）
  const hg = ctx.createRadialGradient(960, 56, 0, 960, 56, 760);
  hg.addColorStop(0, rgb(230, 255, 240, 0.20 * raw)); hg.addColorStop(1, rgb(230, 255, 240, 0));
  ctx.fillStyle = hg; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  // 管（本体）
  const tc = lerp(55, 255, raw);
  ctx.fillStyle = rgb(tc, tc + 4, tc - 2);
  rrect(ctx, 600, 46, 720, 20, 10); ctx.fill();

  drawCatEyes(ctx, t, L);

  // ほこり（月明かり・電灯の中で見える）
  const mAlpha = 0.28 + 0.2 * L;
  for (const m of S.motes) {
    const x = m.x + Math.sin(t * m.w + m.p) * m.a, y = m.y + Math.cos(t * m.w * 0.7 + m.p) * m.a * 0.6 + ((t * 6 + m.p * 20) % 40);
    ctx.fillStyle = rgb(230, 235, 255, mAlpha);
    ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, m.s), 0, Math.PI * 2); ctx.fill();
  }
}
