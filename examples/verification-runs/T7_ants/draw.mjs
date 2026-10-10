// T7 アリのコロニーが餌を運ぶ — 上から見た図。シミュレーションは sim.mjs で先に全尺を計算して表にする。
import { mulberry32 } from '../_harness/runtime.js';
import { simulate, NEST, FOOD, GW, GH } from './sim.mjs';

export const SEED = 2;               // 総当たり(1〜40)の数値検査で採用
const DW = 1920, DH = 1080;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const rgb = (r, g, b, a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${clamp(a)})`;

let SIM = null, off = null, offCtx = null, img = null, DEC = null;
export function setup() {
  SIM = simulate(SEED);
  if (typeof document !== 'undefined') {
    off = document.createElement('canvas'); off.width = GW; off.height = GH;
    offCtx = off.getContext('2d'); img = offCtx.createImageData(GW, GH);
  }
  const r = mulberry32(21);
  DEC = { specks: [], pebbles: [], blades: [], crumbs: [], heap: [] };
  for (let i = 0; i < 900; i++) DEC.specks.push({ x: r() * DW, y: r() * DH, s: 1 + r() * 2.2, l: r() < 0.5 });
  for (let i = 0; i < 16; i++) {
    let x, y;
    do { x = 80 + r() * (DW - 160); y = 80 + r() * (DH - 160); }
    while (Math.hypot(x - NEST[0], y - NEST[1]) < 130 || Math.hypot(x - FOOD[0], y - FOOD[1]) < 130 || distToLine(x, y) < 70);
    DEC.pebbles.push({ x, y, rx: 10 + r() * 22, ry: 8 + r() * 16, a: r() * 3, c: 100 + r() * 50 });
  }
  for (let i = 0; i < 26; i++) {
    const side = r();
    const x = side < 0.5 ? r() * 90 : DW - r() * 90, y = r() * DH;
    DEC.blades.push({ x, y, h: 30 + r() * 40, a: (r() - 0.5) * 1.2 });
  }
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    DEC.crumbs.push({ a, d, c: r() < 0.5 ? [250, 214, 110] : [244, 170, 90], s: 5 + r() * 4, rot: r() * 3 });
  }
  DEC.crumbs.sort((p, q) => p.d - q.d);                       // 外側から先になくなる
  for (let i = 0; i < 60; i++) { const a = r() * Math.PI * 2, d = 40 + r() * 28; DEC.heap.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.9, c: r() < 0.5 ? [250, 214, 110] : [244, 170, 90] }); }
}
function distToLine(x, y) {
  const dx = FOOD[0] - NEST[0], dy = FOOD[1] - NEST[1];
  return Math.abs((x - NEST[0]) * dy - (y - NEST[1]) * dx) / Math.hypot(dx, dy);
}

function ell(ctx, x, y, rx, ry, rot, fill) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2); ctx.fill();
}

function drawAnt(ctx, a) {
  const [x, y, h, carry, dist] = a;
  const c = Math.cos(h), s = Math.sin(h);
  const P = (f, l) => [x + c * f - s * l, y + s * f + c * l];   // 体の座標(前, 横) → 画面
  // 影
  ell(ctx, x + 3, y + 4, 14, 7, h, rgb(20, 12, 6, 0.22));
  // 脚（歩幅は進んだ距離に合わせる）
  ctx.strokeStyle = rgb(30, 20, 15); ctx.lineWidth = 1.7; ctx.lineCap = 'round';
  const ph = dist * 0.32;
  for (let k = 0; k < 3; k++) {
    for (const side of [-1, 1]) {
      const sw = Math.sin(ph + k * 2.1 + (side > 0 ? 0 : Math.PI)) * 4;
      const [bx, by] = P(3 - k * 3.6, side * 3);
      const [kx, ky] = P(3 - k * 3.6 + sw * 0.5 + (k - 1) * 2, side * 10);
      const [fx, fy] = P(3 - k * 3.6 + sw + (k - 1) * 5, side * 15);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    }
  }
  // 触角
  const wig = Math.sin(dist * 0.21) * 2;
  ctx.lineWidth = 1.3;
  for (const side of [-1, 1]) {
    const [bx, by] = P(13, side * 2), [mx, my] = P(19, side * (5 + wig * 0.4)), [tx, ty] = P(24, side * (9 + wig));
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(mx, my); ctx.lineTo(tx, ty); ctx.stroke();
  }
  // 体: 腹・胸・頭
  const [ax, ay] = P(-9, 0), [tx, ty] = P(2, 0), [hx, hy] = P(10, 0);
  ell(ctx, ax, ay, 9.5, 6.6, h, rgb(52, 34, 26));
  ell(ctx, tx, ty, 6, 4.4, h, rgb(66, 44, 32));
  ell(ctx, hx, hy, 5.2, 4.6, h, rgb(58, 38, 28));
  ell(ctx, ax - c * 1, ay - s * 1 - 1, 4, 2.2, h, rgb(110, 80, 60, 0.45));       // つや
  if (carry) {
    const [fx, fy] = P(19, 0);
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(h + 0.6);
    ctx.fillStyle = rgb(250, 214, 110); ctx.fillRect(-4.5, -4.5, 9, 9);
    ctx.fillStyle = rgb(255, 240, 180); ctx.fillRect(-4.5, -4.5, 4, 4);
    ctx.restore();
  }
}

export function frame(ctx, i, t) {
  const S = SIM[Math.min(SIM.length - 1, i)];
  // 土
  const g = ctx.createRadialGradient(DW / 2, DH / 2, 200, DW / 2, DH / 2, 1250);
  g.addColorStop(0, rgb(124, 96, 68)); g.addColorStop(1, rgb(76, 58, 40));
  ctx.fillStyle = g; ctx.fillRect(0, 0, DW, DH);
  for (const p of DEC.specks) { ctx.fillStyle = p.l ? rgb(150, 122, 92, 0.55) : rgb(60, 44, 30, 0.5); ctx.fillRect(p.x, p.y, p.s, p.s); }
  for (const p of DEC.pebbles) {
    ell(ctx, p.x + 4, p.y + 5, p.rx, p.ry, p.a, rgb(30, 20, 12, 0.3));
    ell(ctx, p.x, p.y, p.rx, p.ry, p.a, rgb(p.c, p.c - 6, p.c - 14));
    ell(ctx, p.x - p.rx * 0.2, p.y - p.ry * 0.25, p.rx * 0.5, p.ry * 0.4, p.a, rgb(p.c + 30, p.c + 24, p.c + 14, 0.5));
  }
  ctx.strokeStyle = rgb(70, 110, 50); ctx.lineWidth = 4; ctx.lineCap = 'round';
  for (const b of DEC.blades) { ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.sin(b.a) * b.h, b.y - Math.cos(b.a) * b.h * 0.5); ctx.stroke(); }

  // フェロモンの道（低解像度の濃度を拡大して柔らかく）
  if (off) {
    const d = img.data, q = S.ph;
    for (let k = 0; k < q.length; k++) {
      const v = q[k] / 32;
      const e = 1 - Math.exp(-v / 2.0);
      const j = k * 4;
      d[j] = 255; d[j + 1] = 150 + 100 * e; d[j + 2] = 60 + 110 * e * e; d[j + 3] = 215 * e;
    }
    offCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, GW, GH, 0, 0, DW, DH);
  }

  // 巣穴と運ばれた餌の山
  const ng = ctx.createRadialGradient(NEST[0], NEST[1], 6, NEST[0], NEST[1], 62);
  ng.addColorStop(0, rgb(18, 10, 6)); ng.addColorStop(0.55, rgb(40, 26, 16)); ng.addColorStop(0.62, rgb(150, 118, 84)); ng.addColorStop(1, rgb(150, 118, 84, 0));
  ctx.fillStyle = ng; ctx.beginPath(); ctx.arc(NEST[0], NEST[1], 62, 0, Math.PI * 2); ctx.fill();
  const heapN = Math.min(DEC.heap.length, S.delivered);
  for (let k = 0; k < heapN; k++) {
    const p = DEC.heap[k]; ctx.fillStyle = rgb(p.c[0], p.c[1], p.c[2]);
    ctx.fillRect(NEST[0] + p.x - 4, NEST[1] + p.y - 4, 8, 8);
  }
  // 餌（減るほど小さく）
  const frac = clamp(S.food / 200, 0, 1);
  const rad = 22 + 36 * Math.sqrt(frac);
  const fg = ctx.createRadialGradient(FOOD[0], FOOD[1], 6, FOOD[0], FOOD[1], rad + 22);
  fg.addColorStop(0, rgb(255, 230, 150, 0.35)); fg.addColorStop(1, rgb(255, 230, 150, 0));
  ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(FOOD[0], FOOD[1], rad + 22, 0, Math.PI * 2); ctx.fill();
  const nShow = Math.ceil(DEC.crumbs.length * frac);
  for (let k = 0; k < nShow; k++) {
    const c = DEC.crumbs[k];
    const x = FOOD[0] + Math.cos(c.a) * c.d * rad, y = FOOD[1] + Math.sin(c.a) * c.d * rad * 0.9;
    ctx.save(); ctx.translate(x, y); ctx.rotate(c.rot);
    ctx.fillStyle = rgb(c.c[0], c.c[1], c.c[2]); ctx.fillRect(-c.s, -c.s, c.s * 2, c.s * 2);
    ctx.fillStyle = rgb(255, 245, 200, 0.7); ctx.fillRect(-c.s, -c.s, c.s * 0.8, c.s * 0.8);
    ctx.restore();
  }
  // アリ
  for (const a of S.ants) drawAnt(ctx, a);
}
