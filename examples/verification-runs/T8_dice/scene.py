"""T8 サイコロ: 本番の scene。probe で選んだ投げ方（chosen.json）で剛体を回し、Cycles で書き出す。

  python blender_run.py scene.py -- --out <dir> [--test 1,150,300] [--frames 1:301] [--samples 32] [--res 1920x1080]
- コマ番号は 1〜300（剛体は 1 から順に進める。--test でも 1 から最後の指定コマまで順に計算する）。出力の PNG は (コマ-1) 番。
"""
import json
import math
import os
import sys
import time
import traceback

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as C

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(n, d=None):
    return argv[argv.index(n) + 1] if n in argv else d


DONE, LOG, OUT = arg("--done"), arg("--log"), arg("--out", ".")
logf = open(LOG, "a", encoding="utf-8", buffering=1) if LOG else sys.stdout


def log(*a):
    print(*a, file=logf, flush=True)


def wood_material():
    m = bpy.data.materials.new("wood")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (2.0, 264.0, 1.0)     # 局所座標(±0.5 = 40m)を世界のメートルに合わせる。木目は X 方向に長い     # 木目は X 方向
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type, wave.bands_direction = "BANDS", "Y"
    wave.inputs["Scale"].default_value = 5.0
    wave.inputs["Distortion"].default_value = 3.5
    wave.inputs["Detail"].default_value = 3.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.06, 0.026, 0.012, 1)
    ramp.color_ramp.elements[1].color = (0.19, 0.095, 0.042, 1)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], wave.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.42
    return m


def ivory_material():
    m = bpy.data.materials.new("ivory")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.88, 0.84, 0.72, 1)
    b.inputs["Roughness"].default_value = 0.22
    return m


def setup_render(sc, samples, rw, rh):
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for dev_type in ("OPTIX", "CUDA", "NONE"):
        try:
            prefs.compute_device_type = dev_type
            prefs.get_devices()
            break
        except Exception:
            continue
    for dv in prefs.devices:
        dv.use = dv.type != "CPU"
    sc.cycles.device = "GPU" if any(d.use for d in prefs.devices) else "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = rw, rh, 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.view_settings.view_transform = "AgX"
    sc.render.use_motion_blur = False


def build(chosen):
    sc = bpy.context.scene
    C.clear_scene()
    C.make_world(sc)
    table = C.make_table(sc)
    table.scale = (40.0, 40.0, 1.0)
    table.data.materials.append(wood_material())
    d = C.make_dice(sc, pips=True)
    d.data.materials.append(ivory_material())
    C.set_throw(d, chosen["start"], chosen["euler"], chosen["vel"], chosen["ang"])
    # 世界（暗い部屋）と照明
    w = sc.world or bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.02, 0.022, 0.03, 1)
    bg.inputs["Strength"].default_value = 1.0
    ld = bpy.data.lights.new("key", "AREA")
    ld.energy, ld.size = 55, 0.7
    ld.color = (1.0, 0.93, 0.82)
    key = bpy.data.objects.new("key", ld)
    sc.collection.objects.link(key)
    key.location = (-0.35, -0.35, 0.95)
    tgt = bpy.data.objects.new("tgt", None)
    sc.collection.objects.link(tgt)
    tgt.location = (-0.05, 0.0, 0.0)
    tc = key.constraints.new("TRACK_TO")
    tc.target, tc.track_axis, tc.up_axis = tgt, "TRACK_NEGATIVE_Z", "UP_Y"
    ld2 = bpy.data.lights.new("rim", "AREA")
    ld2.energy, ld2.size = 25, 0.5
    ld2.color = (0.6, 0.7, 1.0)
    rim = bpy.data.objects.new("rim", ld2)
    sc.collection.objects.link(rim)
    rim.location = (0.5, 0.45, 0.6)
    tc2 = rim.constraints.new("TRACK_TO")
    tc2.target, tc2.track_axis, tc2.up_axis = tgt, "TRACK_NEGATIVE_Z", "UP_Y"
    cd = bpy.data.cameras.new("cam")
    cd.lens = 50
    cam = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    ct = bpy.data.objects.new("camtgt", None)
    sc.collection.objects.link(ct)
    tc3 = cam.constraints.new("TRACK_TO")
    tc3.target, tc3.track_axis, tc3.up_axis = ct, "TRACK_NEGATIVE_Z", "UP_Y"
    return d, cam, ct


def simulate_poses(sc, d):
    poses = {}
    for f in range(1, C.TOTAL + 1):
        sc.frame_set(f)
        poses[f] = d.matrix_world.translation.copy()
    return poses


def camera_path(poses, rest_frame):
    """ガウスでならした追従カメラ。止まったあと（最後の約1.5秒）はゆっくり寄る。"""
    n = C.TOTAL
    sig = 14.0
    xs = [poses[f].x for f in range(1, n + 1)]
    ys = [poses[f].y for f in range(1, n + 1)]
    zs = [poses[f].z for f in range(1, n + 1)]

    def smooth(a):
        out = []
        for i in range(n):
            s = w = 0.0
            for j in range(max(0, i - 40), min(n, i + 41)):
                g = math.exp(-0.5 * ((j - i) / sig) ** 2)
                s += a[j] * g
                w += g
            out.append(s / w)
        return out

    sx, sy, sz = smooth(xs), smooth(ys), smooth(zs)
    path = {}
    t_push = n - 45          # 最後の 1.5 秒
    for f in range(1, n + 1):
        u = min(1.0, max(0.0, (f - t_push) / 45.0))
        e = u * u * (3 - 2 * u)
        tx, ty = sx[f - 1] * 0.8, sy[f - 1] * 0.8
        zz = max(sz[f - 1], poses[f].z)
        dist = 0.78 - 0.30 * e + 0.8 * max(0.0, zz - 0.04)
        height = 0.46 - 0.20 * e + 0.4 * max(0.0, zz - 0.04)
        u2 = max(0.0, min(1.0, (f - 170) / 130.0))   # 止まったあとも、ゆっくり滑る・寄る（静止を避ける）
        u2 = u2 * u2 * (3 - 2 * u2)
        dist -= 0.10 * u2
        cam = (tx + 0.10 * e + 0.10 * u2, ty - dist, height)
        path[f] = (cam, (poses[f].x * 0.6 + tx * 0.4, poses[f].y * 0.6 + ty * 0.4, 0.035 + 0.95 * max(0.0, zz - 0.04)))
    return path


def main():
    res = {"ok": False}
    try:
        chosen = json.load(open(os.path.join(HERE, "chosen.json"), encoding="utf-8"))
        samples = int(arg("--samples", 32))
        rw, rh = (int(v) for v in arg("--res", "1920x1080").split("x"))
        sc = bpy.context.scene
        d, cam, ct = build(chosen)
        setup_render(sc, samples, rw, rh)
        t0 = time.time()
        poses = simulate_poses(sc, d)
        rest = chosen.get("rest_frame", 150)
        e = poses[C.TOTAL]
        log(f"final pos ({e.x:.3f},{e.y:.3f}) probe end {chosen.get('end')} up={C.face_up(d)}")
        path = camera_path(poses, rest)
        log(f"sim done {time.time() - t0:.1f}s; blender {bpy.app.version_string}; samples {samples}; res {rw}x{rh}")
        if arg("--test"):
            frames = [int(x) for x in arg("--test").split(",")]
        else:
            a, b = (int(x) for x in arg("--frames", f"1:{C.TOTAL + 1}").split(":"))
            frames = list(range(a, b))
        times = []
        os.makedirs(OUT, exist_ok=True)
        for f in frames:
            ts = time.time()
            sc.frame_set(f)
            cam.location, ct.location = path[f][0], path[f][1]
            sc.render.filepath = f"{OUT}/{f - 1:06d}.png"
            bpy.ops.render.render(write_still=True)
            times.append(round(time.time() - ts, 2))
            log(f"frame {f} {times[-1]}s up={C.face_up(d)}")
        res = {"ok": True, "frames": len(frames), "sec_per_frame": round(sum(times[1:] or times) / len(times[1:] or times), 2),
               "first_frame_s": times[0], "sec_per_frame_max": max(times), "render_seconds": round(sum(times), 1),
               "blender": bpy.app.version_string, "samples": samples, "final_up": C.face_up(d)[0]}
    except Exception:
        res["error"] = traceback.format_exc()
        log(res["error"])
    if DONE:
        open(DONE, "w", encoding="utf-8").write(json.dumps(res))


main()
