"""初回の確認（このスキルが動く環境か）を、自動で調べる。足りないものは、直し方を表示する。

  python doctor.py          # 確認だけ
  python doctor.py --fix    # 直せるもの（npm install など）は、その場で直す

スキルの名前（このファイルがあるフォルダの名前）で、確認する項目が変わる。ほかのスキルの doctor.py も同じファイル。
Claude は、スキルを初めて使うとき、これを実行して結果を見ればよい（ユーザーが手で準備する必要はない）。
"""
import importlib.util
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent.name
results = []


def ok(name, detail=""):
    results.append((True, name, detail, ""))


def ng(name, how, optional=False):
    results.append((False if not optional else None, name, "", how))


def run(cmd, **kw):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=60, **kw)
    except Exception:
        return None


def check_tool(cmd, name=None, how=""):
    name = name or cmd
    exe = shutil.which(cmd)
    if exe:
        r = run([exe, "-version"] if cmd.startswith("ff") else [exe, "--version"])
        v = (r.stdout or r.stderr).splitlines()[0][:70] if r else ""
        ok(name, v)
    else:
        ng(name, how or f"{name} をインストールして PATH に通す / install {name} and add it to PATH")


def check_python_mod(mod, pip=None, optional=False, why=""):
    if importlib.util.find_spec(mod):
        ok(f"Python: {mod}")
    else:
        ng(f"Python: {mod}", f"pip install {pip or mod}" + (f"（{why}）" if why else ""), optional)


def find_browser():
    cands = []
    if platform.system() == "Windows":
        for env in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
            base = os.environ.get(env)
            if base:
                cands += [("msedge", Path(base) / "Microsoft/Edge/Application/msedge.exe"),
                          ("chrome", Path(base) / "Google/Chrome/Application/chrome.exe")]
    elif platform.system() == "Darwin":
        cands = [("msedge", Path("/Applications/Microsoft Edge.app")), ("chrome", Path("/Applications/Google Chrome.app"))]
    else:
        for n, ch in (("microsoft-edge", "msedge"), ("google-chrome", "chrome"), ("chromium", "chrome")):
            if shutil.which(n):
                return ch
    for ch, p in cands:
        if p.exists():
            return ch
    return None


def blender():
    if os.environ.get("BLENDER_EXE") and Path(os.environ["BLENDER_EXE"]).exists():
        return os.environ["BLENDER_EXE"]
    store = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/WindowsApps/blender-launcher.exe"
    if store.exists():
        return str(store)
    return shutil.which("blender")


def main():
    fix = "--fix" in sys.argv
    if SKILL == "animation-qc-selfreview":
        check_tool("ffmpeg"); check_tool("ffprobe")
        check_python_mod("numpy", why="contact.py が使う"); check_python_mod("PIL", "Pillow", why="contact.py が使う")
    elif SKILL == "browser-frame-render":
        check_tool("node", how="Node.js 18 以上を入れる / install Node.js >= 18"); check_tool("npm")
        check_tool("ffmpeg", how="ffmpeg を入れる（PNG 連番 → MP4 に使う）")
        have = run(["node", "-e", "require.resolve('playwright-core')"], cwd=str(HERE))
        if have is not None and have.returncode == 0:
            ok("playwright-core")
        elif fix and shutil.which("npm"):
            r = run(["npm", "install", "--no-audit", "--no-fund"], cwd=str(HERE))
            if r is not None and r.returncode == 0:
                ok("playwright-core", "npm install で導入した")
            else:
                ng("playwright-core", f"npm install に失敗: {(r.stderr if r else '')[-200:]}")
        else:
            ng("playwright-core", f"`python {Path(__file__).name} --fix`（または {HERE} で `npm install`）")
        b = find_browser()
        ok("ブラウザ", b) if b else ng("ブラウザ（Microsoft Edge または Google Chrome）", "Edge か Chrome を入れる / install Edge or Chrome")
    elif SKILL == "simulation-animation":
        check_tool("node", how="Node.js 18 以上を入れる（数値検査 sim_check_template.mjs に使う）")
        check_python_mod("numpy", optional=True, why="numpy で試算するなら")
    elif SKILL == "blender-headless":
        b = blender()
        ok("Blender", b) if b else ng("Blender 5.x", "Blender を入れ、環境変数 BLENDER_EXE に blender の実行ファイルを設定する（Windows の Store 版は、そのままで良い）")
    else:
        ok(SKILL, "確認項目なし")
    bad = 0
    for state, name, detail, how in results:
        mark = "OK  " if state else ("NG  " if state is False else "任意")
        line = f"[{mark}] {name}" + (f"  {detail}" if detail else "")
        if not state:
            line += f"\n        → {how}"
        if state is False:
            bad += 1
        print(line)
    print("すべてそろっている" if not bad else f"足りないもの: {bad} 件")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
