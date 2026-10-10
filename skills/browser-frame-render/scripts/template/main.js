// 作品の雛形（ブラウザ描画）。render.mjs と runtime.js と組む。
//   - 描画は「設計座標 1920×1080」で書く。draft（640×360 など）でも ctx.setTransform で全体が縮んで写る
//     （座標を実解像度に固定すると、小さい draft では左上しか写らず、QC の数字が無意味になる）
//   - frame(i, t) は frame 番号 i（時刻 t 秒）だけから絵が決まること。Math.random は使わず mulberry32
import { startWork, mulberry32, smoothstep, clamp } from '../runtime.js';   // runtime.js は 1つ上のフォルダに置く

const DW = 1920, DH = 1080;     // 設計座標
let ctx, W, H;

startWork({
  defaults: { width: 1920, height: 1080, fps: 30, duration: 10, seed: 1 },
  setup(canvas, cfg) {
    ctx = canvas.getContext('2d');
    W = cfg.width; H = cfg.height;
  },
  frame(i, t) {
    ctx.setTransform(W / DW, 0, 0, H / DH, 0, 0);     // 以降は 1920×1080 の座標で描く
    ctx.fillStyle = '#10141c';
    ctx.fillRect(0, 0, DW, DH);
    const x = 200 + 1500 * smoothstep(0, 10, t);
    ctx.fillStyle = '#ffcc33';
    ctx.beginPath();
    ctx.arc(x, 540, Math.max(0, 60), 0, Math.PI * 2);   // 半径は 0 以上に clamp
    ctx.fill();
  },
});
