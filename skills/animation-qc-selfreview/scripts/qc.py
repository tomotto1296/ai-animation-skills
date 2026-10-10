"""自動品質チェック（アニメーション・映像の書き出し直後に実行する）。

  python qc.py <video.mp4> [--config qc.json] [--size 1920x1080] [--fps 30] [--frames N | --duration 秒] [--out qc.json]

検査: 仕様（解像度・fps・フレーム数。指定したものだけ）/ 黒 / 白 / 単色 / 静止 / ちらつき / 強い明滅（簡易）
結果: PASS / WARN / FAIL（FAIL の検出が1つでもあれば終了コード 1）

--config（JSON、任意）:
  {"profiles": ["dark"],                        # dark（黒の基準を緩める）/ strobe（ちらつき基準 40）/ static（静止 2秒まで許す）/ lowfps
   "expect": [{"check": "freeze", "start": 0, "end": 1.4, "reason": "最初のページが持ち上がるまで意図した静止"}]}
- expect は **最初の書き出しの前に**書く（意図した静止・フラッシュ・単色の宣言）。事後に書いて通すのは禁止（post-hoc は記録に残す）
- 宣言した区間と重なる検出だけが除外され、除外した検出も qc.json に理由つきで残る（黙って消さない）
- 宣言した演出が検出されなかったら WARN
しきい値の意味: ちらつき＝1コマで平均輝度（8bit TV レンジ）が 10 以上変わる、強い明滅＝22 以上の変化が1秒に3往復超、
静止＝フレーム差が小さく（freezedetect -60dB）かつ最大画素差が 12 以下の区間が 0.5 秒以上
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

PROFILE_DEFAULTS = {
    "black_pix_th": 0.10, "black_d": 0.1,
    "freeze_d": 0.5,
    "flicker_th": 10.0,   # 1フレームで平均輝度（8bit, TV レンジ）がこれ以上変わると検出
    "flash_th": 22.0,     # 強い明滅とみなす変化量（219 段階の約10%）
}
PROFILES = {
    "dark": {"black_pix_th": 0.02, "black_d": 0.5},
    "strobe": {"flicker_th": 40.0},
    "lowfps": {"freeze_d": 0.5},
    "static": {"freeze_d": 2.0},
}
NON_EXEMPT = {"spec"}
FREEZE_MAXDIFF = 12  # 8bit。これを超える画素差がある区間は「一部が動いている」とみなす（#17 a01 の誤検出を受けて追加）


def probe(video: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", str(video)],
        capture_output=True, text=True, check=True).stdout
    j = json.loads(out)
    s = j["streams"][0]
    num, den = map(int, s["r_frame_rate"].split("/"))
    return {"width": s["width"], "height": s["height"], "fps": num / den,
            "frames": int(s["nb_read_frames"]), "duration": float(j["format"]["duration"])}


def analyze(video: Path, th: dict, fps: float):
    with tempfile.TemporaryDirectory() as tmp:
        vf = (f"blackdetect=d={th['black_d']}:pix_th={th['black_pix_th']},"
              f"freezedetect=n=-60dB:d={th['freeze_d']},"
              "signalstats,metadata=mode=print:file=stats.txt")
        # 静止の確認用: 前フレームとの差の最大画素値（画面の一部だけが動く作品で、平均差だけだと誤検出するため）
        vf2 = "tblend=all_mode=difference,signalstats,metadata=mode=print:key=lavfi.signalstats.YMAX:file=diff.txt"
        subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(video.resolve()), "-vf", vf2, "-f", "null", "-"],
                       capture_output=True, text=True, cwd=tmp)
        r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(video.resolve()), "-vf", vf, "-f", "null", "-"],
                           capture_output=True, text=True, cwd=tmp)
        if r.returncode != 0:
            sys.exit(r.stderr[-2000:])
        log = r.stderr
        stats_txt = (Path(tmp) / "stats.txt").read_text(encoding="utf-8", errors="replace")
        diff_txt = (Path(tmp) / "diff.txt").read_text(encoding="utf-8", errors="replace")

    black = [(float(a), float(b)) for a, b in re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", log)]
    fs = [float(x) for x in re.findall(r"freeze_start: ([\d.]+)", log)]
    fe = [float(x) for x in re.findall(r"freeze_end: ([\d.]+)", log)]
    freeze = [(s, fe[i] if i < len(fe) else None) for i, s in enumerate(fs)]

    frames = []
    cur = None
    for line in stats_txt.splitlines():
        m = re.match(r"frame:(\d+)\s+pts:\S+\s+pts_time:([\d.]+)", line)
        if m:
            cur = {"n": int(m.group(1)), "t": float(m.group(2))}
            frames.append(cur)
            continue
        m = re.match(r"lavfi\.signalstats\.(\w+)=([-\d.]+)", line)
        if m and cur is not None:
            cur[m.group(1)] = float(m.group(2))
    diffmax, t = [], None
    for line in diff_txt.splitlines():
        m = re.search(r"pts_time:([\d.]+)", line)
        if m:
            t = float(m.group(1))
        m = re.match(r"lavfi\.signalstats\.YMAX=([-\d.]+)", line)
        if m and t is not None:
            diffmax.append((t, float(m.group(1))))
    return black, freeze, frames, diffmax


def freeze_runs(freeze, diffmax, duration, min_len, fps):
    """freezedetect の区間 [s, e) の中で、フレーム間の最大画素差が FREEZE_MAXDIFF 以下のコマが min_len 秒以上続く区間を返す"""
    out = []
    for s, e in freeze:
        e = e if e is not None else duration
        pts = [(x, d) for (x, d) in diffmax if s - 1e-6 <= x < e]
        start, last = None, None
        for x, d in pts:
            if d <= FREEZE_MAXDIFF:
                if start is None:
                    start = x
                last = x
            else:
                if start is not None and (last - start + 1 / fps) >= min_len:
                    out.append((start, last + 1 / fps))
                start = None
        if start is not None and (last - start + 1 / fps) >= min_len:
            out.append((start, last + 1 / fps))
    return out


def runs(flags, frames, fps):
    """フレームごとの真偽を、連続区間 [start, end) の秒のリストにまとめる"""
    out, start = [], None
    for f, on in zip(frames, flags):
        if on and start is None:
            start = f["t"]
        if not on and start is not None:
            out.append((start, f["t"])); start = None
    if start is not None:
        out.append((start, frames[-1]["t"] + 1 / fps))
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--config"); ap.add_argument("--out")
    ap.add_argument("--size"); ap.add_argument("--fps", type=float)
    ap.add_argument("--frames", type=int); ap.add_argument("--duration", type=float)
    a = ap.parse_args()
    video = Path(a.video)
    q = json.loads(Path(a.config).read_text(encoding="utf-8")) if a.config else {}
    th = dict(PROFILE_DEFAULTS)
    for p in q.get("profiles", []):
        th.update(PROFILES[p])
    expects = q.get("expect", [])

    info = probe(video)
    spec_expected, spec_ok = {}, True
    if a.size:
        w, h = map(int, a.size.lower().split("x"))
        spec_expected.update(width=w, height=h)
        spec_ok &= (info["width"], info["height"]) == (w, h)
    if a.fps:
        spec_expected["fps"] = a.fps
        spec_ok &= abs(info["fps"] - a.fps) < 1e-3
    fr = a.frames or (round(a.duration * info["fps"]) if a.duration else None)
    if fr:
        spec_expected["frames"] = fr
        spec_ok &= info["frames"] == fr

    fps = info["fps"]
    black, freeze, frames, diffmax = analyze(video, th, fps)
    yavg = [f.get("YAVG", 0.0) for f in frames]
    delta = [0.0] + [abs(yavg[i] - yavg[i - 1]) for i in range(1, len(yavg))]
    solid = [(f["YMAX"] - f["YMIN"] <= 2 and f["UMAX"] - f["UMIN"] <= 2 and f["VMAX"] - f["VMIN"] <= 2) for f in frames]
    white = [f.get("YLOW", 0) >= 220 for f in frames]
    flicker = [d >= th["flicker_th"] for d in delta]

    # 強い明滅（簡易）: 平均輝度の大きな変化が向きを反転する回数を1秒窓で数える
    signed = [0.0] + [yavg[i] - yavg[i - 1] for i in range(1, len(yavg))]
    trans = [(frames[i]["t"], 1 if s > 0 else -1) for i, s in enumerate(signed) if abs(s) >= th["flash_th"]]
    flash_windows = []
    for i, (t0, _) in enumerate(trans):
        win = [d for (t, d) in trans[i:] if t < t0 + 1.0]
        flips = sum(1 for x, y in zip(win, win[1:]) if x != y) + 1
        if flips / 2 > 3:
            flash_windows.append((t0, t0 + 1.0))

    detections = {
        "black": black,
        "white": runs(white, frames, fps),
        "solid": runs(solid, frames, fps),
        # freezedetect の区間を、フレーム間の最大画素差が小さい（FREEZE_MAXDIFF 以下）コマの連続区間に絞り直す。
        # 区間全体の最大値で捨てると、止まり始めの落ち着く動きが1コマ入っただけで本物の静止を見逃す（検証 T8 で判明）。
        # 一部だけが動く作品（#017）は、どの連続区間も短く（freeze_d 未満）なり、誤検出は出ない
        "freeze": freeze_runs(freeze, diffmax, info["duration"], th["freeze_d"], fps),
        "flicker": runs(flicker, frames, fps),
    }

    report = {"video": str(video), "profiles": q.get("profiles", []), "thresholds": th,
              "spec": {"expected": spec_expected, "actual": info, "ok": spec_ok}, "checks": {}, "warnings": []}
    fail = not spec_ok
    excluded = 0
    for check, ivs in detections.items():
        items = []
        for s, e in ivs:
            hit = next((x for x in expects if x["check"] == check and x["start"] < e and s < x["end"]), None)
            items.append({"start": round(s, 3), "end": round(e, 3), "excluded": bool(hit),
                          "reason": hit["reason"] if hit else None})
            if hit:
                excluded += 1
            else:
                fail = True
        report["checks"][check] = items
    for x in expects:
        if not any(it["excluded"] and it["reason"] == x["reason"] for it in report["checks"].get(x["check"], [])):
            report["warnings"].append(f"宣言した演出が検出されなかった: {x}")
    if flash_windows:
        report["warnings"].append(f"強い明滅（簡易判定、1秒に3回超）: {flash_windows[:5]}")
    if excluded:
        report["warnings"].append(f"意図的な演出として除外した検出: {excluded} 件")

    report["excluded_count"] = excluded
    report["post_hoc"] = bool(q.get("post_hoc"))
    report["result"] = "FAIL" if fail else ("WARN" if report["warnings"] else "PASS")
    report["stats"] = {"yavg_min": round(min(yavg), 1), "yavg_max": round(max(yavg), 1),
                       "max_frame_delta": round(max(delta), 2)}
    out = Path(a.out) if a.out else video.with_name("qc.json")
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(report["result"], json.dumps({"spec_ok": spec_ok, "excluded": excluded,
                                         "detections": {k: len(v) for k, v in detections.items()},
                                         "warnings": report["warnings"], "stats": report["stats"]}, ensure_ascii=False))
    sys.exit(1 if report["result"] == "FAIL" else 0)


if __name__ == "__main__":
    main()
