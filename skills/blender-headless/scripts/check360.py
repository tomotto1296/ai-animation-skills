"""正距円筒の360°映像の品質チェック（継ぎ目・極）。

  python check360.py <equirect.mp4> <out_dir> [--times 0,6,11.9]

- 継ぎ目: 左端列と右端列の差（平均絶対差）を、画像内の隣り合う列どうしの差の平均・99%点と比べる
  （継ぎ目の差が隣接列の差と同程度なら、継ぎ目は目立たない）
- 極: 最上段・最下段の行の標準偏差（どの画素も同じ方向なので、ほぼ一様になるはず）
- 目視用: 継ぎ目を中央に回した切り出し（seam_XXs.png）と、立方体6面に展開した画像（cube_XXs.png）
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("out_dir")
    ap.add_argument("--times", default="0,6,11.9")
    a = ap.parse_args()
    out = Path(a.out_dir); out.mkdir(parents=True, exist_ok=True)
    report = {"frames": []}
    with tempfile.TemporaryDirectory() as tmp:
        for t in [float(x) for x in a.times.split(",")]:
            png = Path(tmp) / f"f{t}.png"
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(t), "-i", a.video, "-frames:v", "1", str(png)], check=True)
            img = np.asarray(Image.open(png).convert("RGB"), np.float32)
            H, W, _ = img.shape
            seam = np.abs(img[:, 0] - img[:, -1]).mean()
            cols = np.abs(img[:, 1:] - img[:, :-1]).mean(axis=(0, 2))
            rec = {"t": t, "size": [W, H], "seam_diff": round(float(seam), 3),
                   "adjacent_col_diff_mean": round(float(cols.mean()), 3),
                   "adjacent_col_diff_p99": round(float(np.percentile(cols, 99)), 3),
                   "top_row_std": round(float(img[0].std(axis=0).mean()), 3),
                   "bottom_row_std": round(float(img[-1].std(axis=0).mean()), 3)}
            rec["seam_ok"] = rec["seam_diff"] <= rec["adjacent_col_diff_p99"]
            report["frames"].append(rec)
            Image.fromarray(np.roll(img, W // 2, axis=1)[H // 4: H * 3 // 4, W // 2 - H // 4: W // 2 + H // 4].astype(np.uint8)).save(out / f"seam_{t:05.2f}s.png")
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(png), "-vf", "v360=e:c3x2:out_forder=rludfb,scale=1536:-1",
                            str(out / f"cube_{t:05.2f}s.png")], check=True)
    report["seam_ok_all"] = all(f["seam_ok"] for f in report["frames"])
    (out / "check360.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
