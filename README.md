# AI Animation Skills

Claude Code skills for making animations **with code** — browser Canvas/WebGL, simulations, and Blender — and for checking them (QC + self-review) before calling them done.
They were distilled from a record of 129 animations (166 attempts) made with Claude Opus 5.5, and then verified on 8 new tasks with Claude Sonnet 5.5.

Claude Code 用のスキル集です。コードでアニメーション（ブラウザ描画・シミュレーション・Blender）を作り、「完成」と言う前に品質を確かめる（自動チェック＋自己レビュー）ためのものです。
Claude Opus 5.5 が129種類を作った記録（166試行）からまとめ、新しい8つのお題で Claude Sonnet 5.5 で検証しました。

- Making-of video (Japanese) / 本編: https://youtu.be/yMWuyfUbVKI

- All 129 works, uncut (no narration, EN/JA labels) / 129本ノーカット: https://youtu.be/ARzaA4eKRAU

## What's inside / 中身

| Skill | What it does / 役目 |
|---|---|
| [`animation-qc-selfreview`](skills/animation-qc-selfreview) | Automatic QC (flicker, freeze, black/white/solid, strobing) with pre-declared intentional effects, plus a self-review checklist for what QC cannot see. / 自動チェックと自己レビュー |
| [`browser-frame-render`](skills/browser-frame-render) | Deterministic frame-by-frame rendering of browser animations with Playwright; pitfalls list; page template. / ブラウザ描画を1コマずつ決定的に書き出す |
| [`simulation-animation`](skills/simulation-animation) | Verify simulation numbers in node/numpy before drawing; seed sweeps; patterns for fluids, growth, flocks, traffic. / シミュレーションを描く前に数値で確かめる |
| [`blender-headless`](skills/blender-headless) | Headless Blender (bpy) with a done-file launcher, sample/time budgets, physics probes, fluids/cloth. / Blender をヘッドレスで回す |

Each skill is a folder with `SKILL.md` and `scripts/`. The skill bodies are written in Japanese (descriptions are in English).
各スキルは `SKILL.md` と `scripts/` のフォルダです。本文は日本語です（description は英語）。

## Install / 使い方

**Easiest (Claude Code plugin) / いちばん簡単（プラグイン）** — run these two commands in Claude Code:

```
/plugin marketplace add tomotto1296/ai-animation-skills
/plugin install ai-animation-skills@ai-animation-skills
```

That is all: the four skills become available (as `/ai-animation-skills:<skill-name>` and automatically when relevant). Missing tools are detected and fixed by Claude itself: each skill tells Claude to run `scripts/doctor.py` on first use (it checks ffmpeg, Node.js, a browser, Blender, and installs `playwright-core` with `--fix`).
これだけで4つのスキルが使えます（`/ai-animation-skills:<スキル名>`、または内容に応じて自動で）。足りない道具は、Claude 自身が検出して直します（各スキルは初回に `scripts/doctor.py` を実行するよう書いてあります。ffmpeg・Node.js・ブラウザ・Blender を確かめ、`--fix` で `playwright-core` を導入します）。

**Without the plugin system / プラグインを使わない場合** — copy the four folders under `skills/` into `~/.claude/skills/` (user-level) or `<project>/.claude/skills/`, then restart Claude Code:

```bash
git clone https://github.com/tomotto1296/ai-animation-skills.git
cp -r ai-animation-skills/skills/* ~/.claude/skills/
```

**What you still need to have installed / 入れておくもの** (Claude cannot install these for you; `doctor.py` tells you which are missing):
- Python 3 (`pip install -r requirements.txt` for `contact.py`: NumPy, Pillow) and `ffmpeg`/`ffprobe` on PATH
- Node.js 18+ and Microsoft Edge or Google Chrome (for `browser-frame-render`; `playwright-core` is installed by `doctor.py --fix`)
- Blender 5.x (for `blender-headless`; set `BLENDER_EXE`, or use the Microsoft Store version)

The scripts were written on Windows 11 (Windows fonts, Microsoft Store Blender); some paths and font settings are Windows-oriented. I have not run them on other operating systems.
スクリプトは Windows 11 で作りました（Windows のフォント、Microsoft Store 版 Blender）。他の OS では動かしていません。

You can also skip installation and point Claude at a `SKILL.md` by path and ask it to follow it. / インストールしなくても、`SKILL.md` のパスを示して「これに従って」と頼めば読ませられます。

## Results / 結果
- 129 works: 98 finished on the first attempt (76%); about 18 attempts failed the automatic QC (flicker ≈10, freeze 5, black/white/solid 4).
- Verification on 8 new tasks (Claude Sonnet 5.5, skills only): 3 finished on the first attempt, 14 attempts in total (average 1.75). Every targeted pitfall was avoided on the first attempt except one QC miss (below); the rework that remained was picture quality. See [`docs/verification.md`](docs/verification.md).
- The verification found a bug in my own QC (a real 2-second freeze was missed). Re-checking the 129 finished works showed 13 works with an undeclared static interval ≥ 0.5 s (most of them < 1.2 s at the start/end). See [`docs/freeze-recheck.md`](docs/freeze-recheck.md). The fixed logic is in `skills/animation-qc-selfreview/scripts/qc.py`.

## Note / 注意書き
The 129 works were made with Claude Opus 5.5. The skills summarize those records; the verification (8 works) used Claude Sonnet 5.5 only. I did not compare against Sonnet 5.5 without the skills, nor against Opus 5.5. This is a small sample of 8 works.

※ 129本の制作は Claude Opus 5.5 で行いました。スキルはその記録をまとめたもので、今回の検証（8本）は Claude Sonnet 5.5 のみで行っています。スキルなしの Sonnet 5.5 との比較や、Opus 5.5 との比較はしていません。8本という少ない数での結果です。

`#NNN` in the skills and docs means a work number in the 129-work project. / スキルや文書の `#NNN` は、129本の企画の作品番号です。

Claude and Anthropic are named as text only; this project is not affiliated with Anthropic or any other company.
Claude・Anthropic は文字だけで表記しています。特定の企業とは関係ありません。

## Examples / 例
[`examples/verification-runs/`](examples/verification-runs): final sources, QC results and contact sheets of the 8 verification tasks (no MP4s).

## License
MIT — see [LICENSE](LICENSE). Copyright (c) 2026 RHU AIstudio
