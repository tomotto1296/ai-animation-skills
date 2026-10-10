// T7 アリのコロニー — DOM を使わないシミュレーション（設計座標 1920×1080）。simulate(seed) が全コマの状態を返す。
export const W = 1920, H = 1080, CELL = 8, GW = W / CELL, GH = H / CELL;
export const NEST = [600, 720], FOOD = [1230, 410];
export const P = {
  fps: 30, sub: 2, seconds: 10, nAnts: 150, initial: 36, spawnRate: 38,
  speed: 280, foodR: 52, nestR: 30, foodTotal: 200, sense: 30, senseAng: 0.62,
  decay: 0.9972, diffuse: 0.045, deposit: 0.9, maxRange: 760,
};
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const angDiff = (b, a) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function simulate(seed, opt = {}) {
  const p = { ...P, ...opt };
  const rnd = mulberry32(seed * 7919 + 13);
  const frames = Math.round(p.seconds * p.fps);
  const dt = 1 / (p.fps * p.sub);
  const ants = [];
  const spawn = (hidden) => {
    const a = rnd() * Math.PI * 2, r = hidden ? 0 : 10 + rnd() * 28;
    ants.push({ x: NEST[0] + Math.cos(a) * r, y: NEST[1] + Math.sin(a) * r, a: rnd() * Math.PI * 2, carry: 0, run: rnd() * 10, dist: 0 });
  };
  for (let i = 0; i < p.initial; i++) spawn(false);
  let ph = new Float32Array(GW * GH), tmp = new Float32Array(GW * GH);
  const sample = (x, y) => {
    const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
    if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return 0;
    return ph[gy * GW + gx];
  };
  let food = p.foodTotal, delivered = 0, picked = 0, spawnAcc = 0;
  const out = [];
  const toNest = (x, y) => Math.atan2(NEST[1] - y, NEST[0] - x);
  const toFood = (x, y) => Math.atan2(FOOD[1] - y, FOOD[0] - x);
  for (let f = 0; f < frames; f++) {
    for (let s = 0; s < p.sub; s++) {
      spawnAcc += p.spawnRate * dt;
      while (spawnAcc >= 1 && ants.length < p.nAnts) { spawn(false); spawnAcc -= 1; }
      if (ants.length >= p.nAnts) spawnAcc = 0;
      for (const an of ants) {
        if (an.carry) {
          const want = toNest(an.x, an.y);
          an.a += clamp(angDiff(want, an.a), -6 * dt, 6 * dt) + (rnd() - 0.5) * 2.4 * dt * 4;
          const gx = Math.floor(an.x / CELL), gy = Math.floor(an.y / CELL);
          if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) ph[gy * GW + gx] += p.deposit;
        } else {
          let best = 0, bw = 0.12;
          for (const k of [-1, 0, 1]) {
            const aa = an.a + k * p.senseAng;
            const w = sample(an.x + Math.cos(aa) * p.sense, an.y + Math.sin(aa) * p.sense) * (k === 0 ? 1.15 : 1);
            if (w > bw) { bw = w; best = k; }
          }
          if (best !== 0) an.a += best * 7.5 * dt;
          an.a += (rnd() - 0.5) * 3.2 * dt * 4 * (bw > 0.12 ? 0.35 : 1);
          const dn = Math.hypot(an.x - NEST[0], an.y - NEST[1]);
          if (dn > p.maxRange) an.a += clamp(angDiff(toNest(an.x, an.y), an.a), -3 * dt, 3 * dt);
        }
        const v = p.speed * (an.carry ? 0.9 : 1);
        an.x += Math.cos(an.a) * v * dt; an.y += Math.sin(an.a) * v * dt;
        an.dist += v * dt;
        if (an.x < 50) { an.x = 50; an.a = Math.PI - an.a; } if (an.x > W - 50) { an.x = W - 50; an.a = Math.PI - an.a; }
        if (an.y < 50) { an.y = 50; an.a = -an.a; } if (an.y > H - 50) { an.y = H - 50; an.a = -an.a; }
        if (!an.carry && food > 0 && Math.hypot(an.x - FOOD[0], an.y - FOOD[1]) < p.foodR) {
          an.carry = 1; food--; picked++; an.a = toNest(an.x, an.y) + (rnd() - 0.5) * 0.4;
        } else if (an.carry && Math.hypot(an.x - NEST[0], an.y - NEST[1]) < p.nestR) {
          an.carry = 0; delivered++;
          an.a = rnd() < 0.4 ? toFood(an.x, an.y) + (rnd() - 0.5) * 0.7 : rnd() * Math.PI * 2;
        }
      }
      // 蒸発と拡散
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        const i = y * GW + x;
        const c = ph[i];
        const l = x > 0 ? ph[i - 1] : c, r = x < GW - 1 ? ph[i + 1] : c, u = y > 0 ? ph[i - GW] : c, d = y < GH - 1 ? ph[i + GW] : c;
        tmp[i] = (c * (1 - p.diffuse) + (l + r + u + d) * 0.25 * p.diffuse) * p.decay;
      }
      [ph, tmp] = [tmp, ph];
    }
    const q = new Uint8Array(GW * GH);
    for (let i = 0; i < q.length; i++) q[i] = Math.min(255, Math.round(ph[i] * 32));
    out.push({
      ants: ants.map((a) => [a.x, a.y, a.a, a.carry, a.dist]),
      ph: q, food, delivered, picked,
    });
  }
  return out;
}
