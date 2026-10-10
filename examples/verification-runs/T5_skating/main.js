// T5 フィギュアスケート — 設計座標 1920×1080 で描き、ctx.setTransform で縮める
import { startWork } from '../_harness/runtime.js';
import * as draw from './draw.mjs';

const DW = 1920, DH = 1080;
let ctx, W, H;

startWork({
  defaults: { width: 1920, height: 1080, fps: 30, duration: 10, seed: 1 },
  setup(canvas, cfg) {
    ctx = canvas.getContext('2d');
    W = cfg.width; H = cfg.height;
    draw.setup(ctx, cfg);
  },
  frame(i, t) {
    ctx.setTransform(W / DW, 0, 0, H / DH, 0, 0);
    draw.frame(ctx, i, t);
  },
});
