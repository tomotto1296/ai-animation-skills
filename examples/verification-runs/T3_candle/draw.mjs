// T3 ロウソクが燃え尽きて暗くなる — DOM を使わない描画モジュール
import { mulberry32 } from '../_harness/runtime.js';

const W = 1920, H = 1080;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const rgb = (r, g, b, a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${clamp(a)})`;

const CX = 1040, TABLE_Y = 800, H0 = 380, H1 = 36, T_OUT = 8.6; // T_OUT = 燃え尽きる時刻
const candleTop = (t) => TABLE_Y - lerp(H0, H1, clamp(t / T_OUT));
// 炎の大きさ（0〜1）: 通常 1 → 6.2 秒から細り、8.2〜8.6 秒はまたたいて消える
export function flameSize(t) {
  let s = 1 - 0.55 * smooth(6.2, 8.2, t);
  s -= 0.35 * Math.sin(Math.PI * smooth(4.0, 4.8, t)); // 風でいちど縮む
  if (t > 8.2) s = 0.45 * (0.7 + 0.3 * Math.sin((t - 8.2) * 40)) * (1 - smooth(8.2, T_OUT, t));
  if (t >= T_OUT) s = 0;
  return clamp(s);
}
const flick = (t) => 1 + 0.07 * Math.sin(t * 9.1) + 0.05 * Math.sin(t * 17.3 + 1) + 0.03 * Math.sin(t * 31 + 2);
export const lightAmount = (t) => flameSize(t) * flick(t);

let S;
export function setup() {
  const r = mulberry32(11);
  S = { stars: [], drips: [], clouds: [] };
  for (let i = 0; i < 30; i++) S.stars.push({ x: 140 + r() * 260, y: 110 + r() * 270, s: 1 + r() * 2, p: r() * 6.28 });
  for (let i = 0; i < 5; i++) S.clouds.push({ y: 120 + r() * 240, w: 150 + r() * 120, h: 22 + r() * 18, v: 18 + r() * 14, x0: r() * 700 });
  [[0.6, 62], [2.2, -52], [4.1, 30], [5.7, -20]].forEach(([s, dx]) => S.drips.push({ s, dx, len: 70 + r() * 50 }));
}

function ell(ctx, x, y, rx, ry, fill) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); ctx.fill();
}

function flame(ctx, t, size, top) {
  if (size <= 0.01) return;
  const sway = Math.sin(t * 7.3) * 5 + Math.sin(t * 13.7 + 1) * 3 + 3 * Math.sin(t * 2.1);
  const fh = 120 * size * (0.94 + 0.06 * Math.sin(t * 11)), fw = 26 * (0.6 + 0.4 * size);
  const bx = CX, by = top - 6, tipx = bx + sway * size, tipy = by - fh;
  const g = ctx.createLinearGradient(0, by, 0, tipy);
  g.addColorStop(0, rgb(80, 120, 255, 0.9)); g.addColorStop(0.18, rgb(255, 235, 170)); g.addColorStop(0.6, rgb(255, 170, 50)); g.addColorStop(1, rgb(255, 90, 20, 0.85));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.bezierCurveTo(bx - fw * 1.3, by - fh * 0.25, bx - fw * 0.7, by - fh * 0.7, tipx, tipy);
  ctx.bezierCurveTo(bx + fw * 0.7, by - fh * 0.7, bx + fw * 1.3, by - fh * 0.25, bx, by);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgb(255, 250, 225, 0.9);
  ctx.beginPath();
  ctx.moveTo(bx, by - 2);
  ctx.bezierCurveTo(bx - fw * 0.6, by - fh * 0.2, bx - fw * 0.3, by - fh * 0.45, bx + sway * size * 0.5, by - fh * 0.55);
  ctx.bezierCurveTo(bx + fw * 0.3, by - fh * 0.45, bx + fw * 0.6, by - fh * 0.2, bx, by - 2);
  ctx.fill();
}

function smoke(ctx, t, top) {
  if (t < T_OUT) return;
  const age = t - T_OUT;
  ctx.lineCap = 'butt'; // round だと線分の継ぎ目で重なり、数珠のように見える
  const N = 60, rise = Math.min(1, age / 1.6) * 330;
  const pt = (u, ph) => [CX + Math.sin(u * 5.5 + age * 2.4 + ph) * (6 + u * 40) * u + Math.sin(u * 11 - age * 3) * 4 * u, top - 8 - u * rise];
  for (const [w, am, ph] of [[16, 0.10, 0.6], [8, 0.18, 0.3], [3.5, 0.40, 0]]) {
    const life = clamp(1 - age / 1.9) * am * 1.6;
    if (life <= 0.01) continue;
    ctx.lineWidth = w;
    for (let s = 0; s < N; s++) { // 先へいくほど薄く（先端が塊にならない）
      const u0 = s / N, u1 = (s + 1) / N, [x0, y0] = pt(u0, ph), [x1, y1] = pt(u1, ph);
      ctx.strokeStyle = rgb(200, 205, 215, life * (1 - u0) * Math.min(1, u0 * 6 + 0.3));
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
  }
}

export function frame(ctx, i, t) {
  const size = flameSize(t), I = lightAmount(t);
  const top = candleTop(t);

  // ---- 部屋（明るく塗ってから、暗さを重ねる）----
  ctx.fillStyle = rgb(120, 98, 84); ctx.fillRect(0, 0, W, TABLE_Y);
  ctx.strokeStyle = rgb(104, 84, 72); ctx.lineWidth = 6;
  for (let x = 40; x < W; x += 120) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, TABLE_Y); ctx.stroke(); }
  ctx.fillStyle = rgb(110, 76, 48); ctx.fillRect(0, TABLE_Y, W, H - TABLE_Y);
  ctx.fillStyle = rgb(140, 100, 64); ctx.fillRect(0, TABLE_Y, W, 14);
  ctx.strokeStyle = rgb(90, 62, 40); ctx.lineWidth = 3;
  for (let k = 0; k < 6; k++) { const y = TABLE_Y + 50 + k * 46; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // 額（壁）
  ctx.fillStyle = rgb(70, 46, 30); ctx.fillRect(1380, 150, 300, 230);
  ctx.fillStyle = rgb(170, 190, 200); ctx.fillRect(1396, 166, 268, 198);
  ctx.fillStyle = rgb(80, 120, 80); ctx.beginPath(); ctx.moveTo(1396, 364); ctx.lineTo(1480, 250); ctx.lineTo(1560, 320); ctx.lineTo(1610, 280); ctx.lineTo(1664, 340); ctx.lineTo(1664, 364); ctx.closePath(); ctx.fill();
  // 本・カップ
  const books = [[560, 744, 240, 56, [150, 50, 50]], [575, 692, 210, 52, [50, 80, 140]], [590, 646, 180, 46, [190, 150, 60]]];
  for (const [x, y, w, h, c] of books) {
    ctx.fillStyle = rgb(c[0], c[1], c[2]); ctx.fillRect(x, y, w, h);
    ctx.fillStyle = rgb(235, 225, 200); ctx.fillRect(x + 14, y + 8, w - 18, h - 16);
  }
  ctx.fillStyle = rgb(225, 220, 210);
  ctx.beginPath(); ctx.moveTo(1300, 700); ctx.lineTo(1420, 700); ctx.lineTo(1400, 800); ctx.lineTo(1320, 800); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = rgb(225, 220, 210); ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(1432, 738, 24, -1.2, 1.2); ctx.stroke();
  ell(ctx, 1360, 700, 60, 10, rgb(110, 70, 40));
  // 皿・ロウソク
  ell(ctx, CX, TABLE_Y + 4, 130, 22, rgb(150, 115, 40));
  ell(ctx, CX, TABLE_Y, 112, 16, rgb(190, 150, 60));
  ctx.fillStyle = rgb(238, 228, 196); ctx.fillRect(CX - 45, top, 90, TABLE_Y - top);
  ctx.fillStyle = rgb(210, 198, 160); ctx.fillRect(CX + 20, top, 25, TABLE_Y - top);
  ell(ctx, CX, TABLE_Y, 45, 10, rgb(238, 228, 196));
  ctx.fillStyle = rgb(238, 228, 196);
  for (const d of S.drips) {
    if (t < d.s) continue;
    const y0 = candleTop(d.s) + 4, len = d.len * smooth(d.s, d.s + 1.8, t);
    const ys = Math.max(y0, top + 4), ye = y0 + len;
    if (ye <= ys + 2) continue;
    const x = CX + d.dx * 0.7;
    ctx.beginPath(); ctx.roundRect(x - 7, ys, 14, ye - ys, 7); ctx.fill();
  }
  ell(ctx, CX, top, 45, 10, rgb(255, 238, 200));
  ell(ctx, CX, top, 30, 6, rgb(255, 214, 140));
  ctx.strokeStyle = rgb(40, 30, 25); ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(CX, top); ctx.lineTo(CX + 1, top - 14); ctx.stroke();

  // ---- 暗さ（炎の位置から広がる明かり）----
  const R = 140 + 800 * Math.pow(clamp(I), 0.8), fy = top - 50;
  const og = ctx.createRadialGradient(CX, fy, 0, CX, fy, R);
  // 炎が弱いほど中心の「抜け」も弱くする（消えたあとに円盤が残らない）
  const g = smooth(0, 0.25, I), A = (a) => 0.94 - (0.94 - a) * g;
  og.addColorStop(0, rgb(5, 7, 16, A(0.0))); og.addColorStop(0.3, rgb(5, 7, 16, A(0.3))); og.addColorStop(0.65, rgb(5, 7, 16, A(0.72))); og.addColorStop(1, rgb(5, 7, 16, 0.94));
  ctx.fillStyle = og; ctx.fillRect(0, 0, W, H); // 半径の外は最後の色（0.94）が続く
  if (I > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    const wg = ctx.createRadialGradient(CX, fy, 0, CX, fy, R * 0.9);
    wg.addColorStop(0, rgb(255, 160, 60, 0.30 * I)); wg.addColorStop(1, rgb(255, 120, 30, 0));
    ctx.fillStyle = wg; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- 自分で光る・見えるもの ----
  const sky = ctx.createLinearGradient(0, 90, 0, 400);
  sky.addColorStop(0, rgb(14, 22, 54)); sky.addColorStop(1, rgb(40, 62, 110));
  ctx.fillStyle = sky; ctx.fillRect(120, 90, 300, 310);
  for (const s of S.stars) { ctx.fillStyle = rgb(255, 255, 230, 0.5 + 0.4 * Math.sin(t * 1.4 + s.p)); ctx.fillRect(s.x, s.y, s.s, s.s); }
  ell(ctx, 300, 200, 40, 40, rgb(248, 246, 220));
  ctx.save(); ctx.beginPath(); ctx.rect(120, 90, 300, 310); ctx.clip();
  for (const c of S.clouds) {
    const x = ((c.x0 + t * c.v) % 700) - 150 + 120;
    ell(ctx, x, c.y, c.w / 2, c.h, rgb(96, 112, 150, 0.55));
    ell(ctx, x + c.w * 0.25, c.y - c.h * 0.5, c.w / 3, c.h * 0.8, rgb(96, 112, 150, 0.45));
  }
  ctx.restore();
  ctx.fillStyle = rgb(70, 62, 60); ctx.fillRect(110, 80, 320, 12); ctx.fillRect(110, 400, 320, 14); ctx.fillRect(110, 80, 12, 334); ctx.fillRect(418, 80, 12, 334); ctx.fillRect(264, 90, 10, 310);
  ctx.globalCompositeOperation = 'lighter';
  const mg = ctx.createRadialGradient(270, 400, 0, 270, 400, 620);
  mg.addColorStop(0, rgb(90, 120, 200, 0.14)); mg.addColorStop(1, rgb(90, 120, 200, 0));
  ctx.fillStyle = mg; ctx.fillRect(0, 0, 1000, H);
  ctx.globalCompositeOperation = 'source-over';

  flame(ctx, t, size, top);
  smoke(ctx, t, top);
  if (t >= T_OUT) {
    const e = clamp(1 - (t - T_OUT) / 1.2);
    ell(ctx, CX + 1, top - 14, 3.5, 3.5, rgb(255, 120, 40, e));
  }
}
