"""目視確認用の画像を作る。

  python contact.py <video> <out_dir> [--n 16] [--cols 4] [--full 0.5,3,9.5] [--diff 1,5]

- contact.png : 全尺から均等に n コマ（時刻つき）
- full_XXs.png: 指定時刻の等倍フレーム
- diff_XXs.png: 指定時刻の前後フレームの差分（動きの確認。差を 4 倍に強調）
"""
import argparse
import sys
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFont

FONT = "C:/Windows/Fonts/YuGothM.ttc"


def grab(video: Path, t: float, out: Path):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.4f}", "-i", str(video), "-frames:v", "1", str(out)],
                   check=True)


def duration(video: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("out_dir")
    ap.add_argument("--n", type=int, default=16); ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--full", default=""); ap.add_argument("--diff", default="")
    ap.add_argument("--thumb-width", type=int, default=480)
    a = ap.parse_args()
    video, out = Path(a.video), Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    dur = duration(video)
    fps_frame = 1 / 30
    try:
        font = ImageFont.truetype(FONT, 18)
    except OSError:
        font = ImageFont.load_default()

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        times = [min(dur * (i + 0.5) / a.n, max(0.0, dur - 0.1)) for i in range(a.n)]  # 最後のコマが終端を越えないように
        tiles = []
        for i, t in enumerate(times):
            p = tmp / f"c{i}.png"
            grab(video, t, p)
            im = Image.open(p).convert("RGB")
            tw = a.thumb_width
            im = im.resize((tw, round(im.height * tw / im.width)), Image.LANCZOS)
            d = ImageDraw.Draw(im)
            d.rectangle([0, 0, 70, 26], fill=(0, 0, 0))
            d.text((6, 3), f"{t:5.2f}s", fill=(255, 255, 255), font=font)
            tiles.append(im)
        tw, th = tiles[0].size
        rows = (len(tiles) + a.cols - 1) // a.cols
        sheet = Image.new("RGB", (tw * a.cols + 4 * (a.cols - 1), th * rows + 4 * (rows - 1)), (40, 40, 40))
        for i, im in enumerate(tiles):
            sheet.paste(im, ((i % a.cols) * (tw + 4), (i // a.cols) * (th + 4)))
        sheet.save(out / "contact.png")

        for t in [float(x) for x in a.full.split(",") if x]:
            grab(video, t, out / f"full_{t:05.2f}s.png")

        for t in [float(x) for x in a.diff.split(",") if x]:
            p0, p1 = tmp / "d0.png", tmp / "d1.png"
            grab(video, t, p0)
            grab(video, t + fps_frame, p1)
            diff = ImageChops.difference(Image.open(p0).convert("RGB"), Image.open(p1).convert("RGB"))
            arr = np.clip(np.asarray(diff, dtype=np.float32) * 4, 0, 255).astype(np.uint8)
            Image.fromarray(arr).save(out / f"diff_{t:05.2f}s.png")
    print(f"contact sheet and stills -> {out}")


if __name__ == "__main__":
    main()
