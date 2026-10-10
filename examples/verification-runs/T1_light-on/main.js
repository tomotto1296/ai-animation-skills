import { startWork } from '../_harness/runtime.js';
import * as draw from './draw.mjs';
let ctx;
startWork({
  defaults: { width: 1920, height: 1080, fps: 30, duration: 10, seed: 1 },
  setup: (canvas, cfg) => { ctx = canvas.getContext('2d'); draw.setup(ctx, cfg); },
  frame: (i, t) => draw.frame(ctx, i, t),
});
