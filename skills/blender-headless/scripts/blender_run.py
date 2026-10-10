"""Blender をヘッドレスで実行して、完了を待つ（Windows の Microsoft Store 版にも、通常のインストールにも対応）。

  python blender_run.py <scene.py> [--timeout 秒] [--workdir DIR] -- <scene.py への引数...>

- Blender の場所: 環境変数 BLENDER_EXE があればそれ。なければ Store 版の launcher
  （%LOCALAPPDATA%/Microsoft/WindowsApps/blender-launcher.exe）。それも無ければ PATH の blender
- Store 版の blender.exe は直接実行できず、launcher はすぐ終了して Blender は別プロセスで動く。
  そのため scene.py 側が書く完了ファイル（--done）とログ（--log）を、ここで待って読む（どの版でも同じ流れにしてある）
- scene.py は sys.argv の '--' 以降から --done / --log を受け取り、終わったら done に JSON（{"ok": true, ...}）を書く決まり
  → scene_template.py の形に従う
- 終了コード: 成功 0、scene.py が ok:false なら 1、タイムアウト 2
- ログは 2 秒ごとに読んで表示する。ツール1回が10分で切られる環境では、`--timeout` を長くしてバックグラウンドで起動する
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path


def find_blender():
    if os.environ.get("BLENDER_EXE"):
        return os.environ["BLENDER_EXE"]
    store = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/WindowsApps/blender-launcher.exe"
    if store.exists():
        return str(store)
    exe = shutil.which("blender")
    if exe:
        return exe
    sys.exit("Blender が見つからない（BLENDER_EXE を設定するか、Store 版を入れる）")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    argv = sys.argv[1:]
    rest = argv[argv.index("--") + 1:] if "--" in argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("script")
    ap.add_argument("--timeout", type=float, default=6 * 3600)
    ap.add_argument("--workdir", default=None)
    a = ap.parse_args(argv[: argv.index("--")] if "--" in argv else argv)
    work = Path(a.workdir or Path(a.script).resolve().parent / "_blender_run")
    work.mkdir(parents=True, exist_ok=True)
    done, log = work / "done.json", work / "log.txt"
    for f in (done, log):
        f.unlink(missing_ok=True)
    cmd = [find_blender(), "-b", "--factory-startup", "--python", str(Path(a.script).resolve()), "--",
           *rest, "--done", str(done), "--log", str(log)]
    t0 = time.time()
    subprocess.run(cmd, check=True)
    pos = 0
    while True:
        if log.exists():
            with log.open(encoding="utf-8", errors="replace") as f:
                f.seek(pos)
                chunk = f.read()
                pos = f.tell()
            if chunk:
                print(chunk, end="", flush=True)
        if done.exists():
            time.sleep(0.5)
            res = json.loads(done.read_text(encoding="utf-8"))
            res["wall_seconds"] = round(time.time() - t0, 1)
            print(json.dumps(res, ensure_ascii=False))
            sys.exit(0 if res.get("ok") else 1)
        if time.time() - t0 > a.timeout:
            print("TIMEOUT")
            sys.exit(2)
        time.sleep(2)


if __name__ == "__main__":
    main()
