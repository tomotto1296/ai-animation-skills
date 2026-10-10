"""T8 物理 probe: 画像を書かない。投げ方（初速・回転・開始姿勢）を乱数で総当たりし、
最終の上向きの目・止まる時刻・跳ねた回数・テーブルからの逸脱を数値で出す。試行には数えない。"""
import json
import math
import os
import random
import sys
import time
import traceback

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as C

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(n, d=None):
    return argv[argv.index(n) + 1] if n in argv else d


DONE, LOG = arg("--done"), arg("--log")
N = int(arg("--n", 40))
SEED = int(arg("--seed", 1))
logf = open(LOG, "a", encoding="utf-8", buffering=1) if LOG else sys.stdout


def log(*a):
    print(*a, file=logf, flush=True)


def run_trial(sc, d, prm):
    if d.animation_data:
        d.animation_data_clear()
    C.set_throw(d, prm["start"], prm["euler"], prm["vel"], prm["ang"])
    sc.frame_set(1)
    poses = []
    for f in range(1, C.TOTAL + 1):
        sc.frame_set(f)
        loc = d.matrix_world.translation
        poses.append((f, loc.x, loc.y, loc.z, C.lowest_z(d)))
    rest = None
    for i in range(1, len(poses) - 20):
        if all(math.dist(poses[j][1:4], poses[j - 1][1:4]) < 0.0004 for j in range(i, i + 20)):
            rest = poses[i][0]
            break
    bounces, air = 0, False
    for p in poses[C.RELEASE:]:
        if p[4] > 0.012:
            air = True
        elif p[4] < 0.003 and air:
            bounces += 1
            air = False
    xs = [p[1] for p in poses]
    ys = [p[2] for p in poses]
    up, dot = C.face_up(d)
    # 解放直後の速さ（キーフレームの速度が引き継がれているかの確認）
    v_rel = math.dist(poses[C.RELEASE + 1][1:4], poses[C.RELEASE][1:4]) * 30
    return {"rest_frame": rest, "rest_s": None if rest is None else round(rest / 30, 2), "up": up, "up_dot": round(dot, 3),
            "bounces": bounces, "x_range": [round(min(xs), 2), round(max(xs), 2)], "y_range": [round(min(ys), 2), round(max(ys), 2)],
            "max_z": round(max(p[3] for p in poses), 3), "end": [round(poses[-1][1], 3), round(poses[-1][2], 3)],
            "v_after_release": round(v_rel, 2)}


def main():
    res = {"ok": False}
    try:
        sc = bpy.context.scene
        C.clear_scene()
        C.make_world(sc)
        C.make_table(sc)
        d = C.make_dice(sc, pips=False)
        rnd = random.Random(SEED)
        out = []
        t0 = time.time()
        for k in range(N):
            prm = {
                "start": (-0.55, rnd.uniform(-0.12, 0.12), rnd.uniform(0.3, 0.6)),
                "euler": tuple(rnd.uniform(0, 2 * math.pi) for _ in range(3)),
                "vel": (rnd.uniform(0.3, 0.75), rnd.uniform(-0.2, 0.2), rnd.uniform(-0.3, 0.25)),
                "ang": tuple(rnd.uniform(-22, 22) for _ in range(3)),
            }
            r = run_trial(sc, d, prm)
            r["prm"] = prm
            r["i"] = k
            out.append(r)
            log(f"trial {k}: up={r['up']} rest={r['rest_s']} bounces={r['bounces']} x={r['x_range']} y={r['y_range']} v_rel={r['v_after_release']} ({time.time() - t0:.0f}s)")
        n6 = sum(1 for r in out if r["up"] == 6)
        good = [r for r in out if r["up"] == 6 and r["up_dot"] > 0.99 and r["rest_s"] is not None and 5.0 <= r["rest_s"] <= 7.2 and r["bounces"] >= 3
                and r["x_range"][1] < 0.6 and r["y_range"][0] > -0.3 and r["y_range"][1] < 0.3 and r["max_z"] < 0.55]
        res = {"ok": True, "n": N, "n_six": n6, "n_rest": sum(1 for r in out if r["rest_s"] is not None),
               "n_good": len(good), "good": good[:12], "seconds": round(time.time() - t0, 1), "blender": bpy.app.version_string,
               "up_hist": {str(i): sum(1 for r in out if r["up"] == i) for i in range(1, 7)}}
        json.dump(out, open(os.path.join(HERE, "probe_trials_%d.json" % SEED), "w"))
    except Exception:
        res["error"] = traceback.format_exc()
        log(res["error"])
    if DONE:
        open(DONE, "w", encoding="utf-8").write(json.dumps(res))


main()
