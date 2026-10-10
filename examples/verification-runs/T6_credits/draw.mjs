// T6 映画のエンドロール — 黒い背景に下から上へ流れるスタッフロール。文字は measureText で幅を測って縮める／折り返す。DOM なし。
import { mulberry32 } from '../_harness/runtime.js';

const DW = 1920, DH = 1080;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;

const FONT = '"Yu Gothic UI", "Segoe UI", sans-serif';
const MAXW = 1500, MIN_SIZE = 40, ROLE_SIZE = 32, NAME_SIZE = 58, SIDE_MARGIN_MIN = 150;
// 架空の名前だけ
const BLOCKS = [
  ['監督', ['篠宮 カイ']],
  ['脚本', ['霧島 ミナト', '久遠寺 エレナ']],
  ['撮影監督', ['ヴィルヘルミナ・アレクサンドラ・フォン・ブラウンシュタイン＝ホーエンツォレルン']],
  ['音楽', ['Bartholomew Cornelius Featherstonehaugh-Wetherington III']],
  ['第二班 水中撮影・特殊機材運用および海上安全管理統括 兼 現場進行責任者', ['波多野 ルイ']],
  ['美術', ['白鳥沢 ツムギ', '氷室 ソラ', 'Anouk Lindqvist-Okonkwo']],
  ['編集', ['常盤木 ハルカ']],
  ['製作', ['ポポロ星間映像社', '月待ち坂映画製作委員会']],
];
const T_SCROLL = 6.2, T_STOP = 8.0;           // 等速 → 減速して止まる
let L = null, STARS = null;

function fit(ctx, text, base, weight) {
  let size = base;
  const set = (s) => { ctx.font = `${weight} ${s}px ${FONT}`; return ctx.measureText(text).width; };
  let w = set(size);
  while (w > MAXW && size > MIN_SIZE) { size -= 2; w = set(size); }
  return { size, w };
}
function wrapLine(ctx, text, base, weight) {
  const f = fit(ctx, text, base, weight);
  if (f.w <= MAXW) return [{ text, ...f }];
  // 縮めても入らない: 区切り（＝ ・ 空白）の近い中央で2行に折る
  const cuts = [];
  for (let i = 1; i < text.length; i++) if ('＝ '.includes(text[i - 1])) cuts.push(i);
  let best = Math.floor(text.length / 2), d = 1e9;
  for (const c of cuts) if (Math.abs(c - text.length / 2) < d) { d = Math.abs(c - text.length / 2); best = c; }
  return [text.slice(0, best), text.slice(best)].map((s) => ({ text: s.trim(), ...fit(ctx, s.trim(), base, weight) }));
}

export function setup(ctx) {
  const lines = [];                 // {text, size, weight, color, y(中心), w, kind}
  let y = 300;                      // 最初のブロックは 0 秒のコマから見える位置
  const metrics = { lines: [], minSize: 1e9, maxW: 0, minGap: 1e9, wrapped: 0 };
  let prevBottom = null;
  const push = (text, size, weight, color, kind, w, h) => {
    const cy = y + h / 2;
    if (prevBottom !== null) metrics.minGap = Math.min(metrics.minGap, y - prevBottom);
    lines.push({ text, size, weight, color, y: cy, w, kind, top: y, bottom: y + h });
    prevBottom = y + h; y += h;
    metrics.lines.push({ text: text.slice(0, 14), size, w: Math.round(w), kind });
    metrics.minSize = Math.min(metrics.minSize, size); metrics.maxW = Math.max(metrics.maxW, w);
  };
  for (const [role, names] of BLOCKS) {
    const r = wrapLine(ctx, role, ROLE_SIZE, '600');
    if (r.length > 1) metrics.wrapped++;
    for (const l of r) push(l.text, l.size, '600', 'rgb(150,168,200)', 'role', l.w, l.size * 1.5);
    y += 6;
    for (const nm of names) {
      const ls = wrapLine(ctx, nm, NAME_SIZE, '700');
      if (ls.length > 1) metrics.wrapped++;
      for (const l of ls) push(l.text, l.size, '700', 'rgb(236,238,242)', 'name', l.w, l.size * 1.4);
      y += 10;
    }
    y += 70;
  }
  const endCenter = y + 540;   // 直前の名前が END の止まる位置では画面の外にある距離
  const D = endCenter - DH / 2;
  const v = D / (T_SCROLL + 0.5 * (T_STOP - T_SCROLL));
  L = { lines, endCenter, D, v };
  metrics.scrollSpeed = Math.round(v); metrics.endCenter = Math.round(endCenter); metrics.scrollDistance = Math.round(D);
  metrics.sideMarginMin = Math.round((DW - metrics.maxW) / 2);
  metrics.holdSeconds = +(10 - T_STOP).toFixed(2);
  console.log('[metric] ' + JSON.stringify(metrics));
  const r = mulberry32(9);
  STARS = [];
  for (let i = 0; i < 70; i++) STARS.push({ x: r() * DW, y: r() * DH, s: 0.8 + r() * 1.8, p: r() * 6.28, f: 0.6 + r() * 1.4 });
}

function scrollY(t) {
  if (t < T_SCROLL) return L.v * t;
  const u = Math.min(1, (t - T_SCROLL) / (T_STOP - T_SCROLL));
  return L.v * T_SCROLL + L.v * (T_STOP - T_SCROLL) * 0.5 * (1 - (1 - u) * (1 - u));
}

export function frame(ctx, i, t) {
  // 背景: 真っ黒にしない（黒判定を避ける）。ごく暗い青黒
  const bg = ctx.createRadialGradient(DW / 2, DH / 2, 100, DW / 2, DH / 2, 1200);
  bg.addColorStop(0, 'rgb(26,28,44)'); bg.addColorStop(1, 'rgb(9,10,16)');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, DW, DH);
  for (const s of STARS) { ctx.fillStyle = `rgba(200,210,240,${0.12 + 0.2 * (0.5 + 0.5 * Math.sin(t * s.f + s.p))})`; ctx.fillRect(s.x, s.y, s.s, s.s); }

  const sy = scrollY(t);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const l of L.lines) {
    const y = l.y - sy;
    if (y < -120 || y > DH + 120) continue;
    ctx.font = `${l.weight} ${l.size}px ${FONT}`;
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, DW / 2, y);
  }
  // END カード（止まってからも、ごくゆっくり息づく）
  const ey = L.endCenter - sy;
  if (ey > -300 && ey < DH + 300) {
    const k = 1 + 0.012 * Math.sin(t * 1.4) + 0.02 * smooth(7.0, 10, t);
    ctx.save(); ctx.translate(DW / 2, ey); ctx.scale(k, k);
    ctx.font = `700 260px ${FONT}`; ctx.fillStyle = 'rgb(238,238,240)';
    ctx.fillText('END', 0, 0);
    const lw = 560 * smooth(7.2, 9.4, t);
    ctx.fillStyle = 'rgba(150,168,200,0.85)'; ctx.fillRect(-lw / 2, 170, lw, 3);
    ctx.font = `600 34px ${FONT}`; ctx.fillStyle = `rgba(170,184,212,${smooth(7.6, 8.8, t)})`;
    ctx.fillText('この物語はすべて架空です', 0, 232);
    ctx.restore();
  }
  // 上下の端でなめらかに消える
  const top = ctx.createLinearGradient(0, 0, 0, 170);
  top.addColorStop(0, 'rgba(9,10,16,1)'); top.addColorStop(1, 'rgba(9,10,16,0)');
  ctx.fillStyle = top; ctx.fillRect(0, 0, DW, 170);
  const bot = ctx.createLinearGradient(0, DH - 130, 0, DH);
  bot.addColorStop(0, 'rgba(9,10,16,0)'); bot.addColorStop(1, 'rgba(9,10,16,0.9)');
  ctx.fillStyle = bot; ctx.fillRect(0, DH - 130, DW, 130);
}
