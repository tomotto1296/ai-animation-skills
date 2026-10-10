"""Blender の bpy スクリプトの雛形（ヘッドレスで書き出す作品用）。

  python blender_run.py scene_template.py -- --out <dir> [--test 0,30,59] [--frames 0:60] [--samples 32] [--res 1280x720] [--engine CYCLES|EEVEE]

決まり（blender_run.py と組む）:
- 引数は sys.argv の '--' 以降。--done / --log は blender_run.py が付ける
- 完了ファイルに JSON を必ず書く（例外のときも {"ok": false, "error": ...}）。書かないと呼び出し側が待ち続ける
- --test 0,30,59: 指定コマだけの下見（試行に数えない）。--frames a:b: 範囲の書き出し（PNG 連番を --out に）
- 画質の決まり: samples は必ず引数（または設定ファイル）で明示する。既定のままだと遅い（実例: 既定128で 4.15 秒/コマ → samples=16 で解決）
- GPU: Cycles は OptiX（NVIDIA）。VRAM に収まる規模にし、GPU を使う書き出しは同時に1件
- 使う属性・API は Blender の版で変わる。テスト段階で例外を出して確かめる（例: ライトの visible_glossy は未対応）
"""
import json
import math
import sys
import time
import traceback

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


DONE, LOG, OUT = arg("--done"), arg("--log"), arg("--out", ".")
FPS, FRAMES = 30, int(arg("--total", 60))
logf = open(LOG, "a", encoding="utf-8", buffering=1) if LOG else sys.stdout


def log(*a):
    print(*a, file=logf, flush=True)


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def build():
    sc = bpy.context.scene
    clear_scene()
    sc.render.fps = FPS
    sc.frame_start, sc.frame_end = 0, FRAMES - 1
    # --- ここにシーンを作る（例: 立方体が回る） ---
    bpy.ops.mesh.primitive_cube_add(size=1.5, location=(0, 0, 0))
    cube = bpy.context.object
    cube.rotation_euler = (0, 0, 0)
    cube.keyframe_insert("rotation_euler", frame=0)
    cube.rotation_euler = (0, 0, math.radians(180))
    cube.keyframe_insert("rotation_euler", frame=FRAMES - 1)
    bpy.ops.object.light_add(type="SUN", location=(3, -3, 5))
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    cam.location = (4, -4, 3)
    cam.rotation_euler = (math.radians(60), 0, math.radians(45))
    sc.camera = cam

    # --- レンダー設定 ---
    engine = arg("--engine", "CYCLES")
    sc.render.engine = engine if engine == "CYCLES" else "BLENDER_EEVEE"
    if engine == "CYCLES":
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
        sc.cycles.samples = int(arg("--samples", 16))           # 明示する
        sc.cycles.use_denoising = True
    rw, rh = (int(v) for v in arg("--res", "1280x720").split("x"))
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = rw, rh, 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.view_settings.view_transform = "AgX"


def main():
    res = {"ok": False}
    try:
        t0 = time.time()
        build()
        sc = bpy.context.scene
        log(f"scene built in {time.time() - t0:.1f}s, engine={sc.render.engine}")
        if arg("--test"):
            frames = [int(x) for x in arg("--test").split(",")]
        else:
            a, b = (int(x) for x in arg("--frames", f"0:{FRAMES}").split(":"))
            frames = list(range(a, b))
        times = []
        for f in frames:
            ts = time.time()
            sc.frame_set(f)
            sc.render.filepath = f"{OUT}/{f:06d}.png"
            bpy.ops.render.render(write_still=True)
            times.append(round(time.time() - ts, 2))
            log(f"frame {f} {times[-1]}s")
        res = {"ok": True, "frames": len(frames), "sec_per_frame": round(sum(times) / len(times), 2),
               "sec_per_frame_max": max(times), "render_seconds": round(sum(times), 1), "blender": bpy.app.version_string}
    except Exception:
        res["error"] = traceback.format_exc()
        log(res["error"])
    if DONE:
        open(DONE, "w", encoding="utf-8").write(json.dumps(res))


main()
