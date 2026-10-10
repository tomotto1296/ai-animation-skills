import { startWork } from '../_harness/runtime.js';
import * as draw from './draw.mjs';
let ctx, k = 1;
startWork({
  defaults: { width: 1920, height: 1080, fps: 30, duration: 10, seed: 1 },
  setup: (canvas, cfg) => { ctx = canvas.getContext('2d'); k = cfg.width / 1920; draw.setup(ctx, cfg); },
  frame: (i, t) => { ctx.setTransform(k, 0, 0, k, 0, 0); draw.frame(ctx, i, t); },
});
