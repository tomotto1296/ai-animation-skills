---
name: browser-frame-render
description: Render browser-drawn animations (Canvas2D, SVG, WebGL/GLSL, three.js) to video deterministically — virtual-time frame stepping with Playwright, PNG sequence to ffmpeg — and avoid the known pitfalls (setup exceptions, easing overshoot, WebGL readback, float textures, equirect seams, stateful scenes, long waits). Use when making an animation as a web page and exporting it to MP4, when a browser render fails or comes out different from the preview, or when starting a new Canvas/WebGL piece.
---

# ブラウザで描くアニメーションを MP4 にする

実績: 129作品のうち約半数（2D・ジェネラティブ・シェーダー・画面系）をこの方式で作った。同梱: `scripts/render.mjs`（書き出し）・`scripts/runtime.js`（作品側の共通部品）。動作確認済み（Edge＋playwright-core）。

## 初回の確認（自動）
このスキルを初めて使うときは、最初に `python scripts/doctor.py` を実行して、環境が足りているかを確かめる（足りないものと、直し方が表示される。`--fix` を付けると、直せるもの（npm install など）はその場で直す）。ユーザーに手で準備させる前に、まずこれを試す。

## 1. 仕組み
1. 作品ページは `runtime.js` の `startWork({ defaults, setup, frame })` を呼ぶだけ。`frame(i, t)` は**frame 番号 i（時刻 t = i/fps）だけから絵が決まる**こと。`Math.random` は使わず `mulberry32(seed)`。`Date.now`・`performance.now`・`requestAnimationFrame` に頼らない
2. `render.mjs` が、乱数・時計・rAF を固定したヘッドレス Edge でページを開き、`frame(i)` を1コマずつ呼んで canvas（`#c`）を PNG で保存する
3. ffmpeg で PNG 連番 → H.264（`-pix_fmt yuv420p`、BT.709 のタグ、crf 17〜18）。PNG はエンコード後に消す（容量）
4. `node render.mjs --root <作品> --entry index.html --out out --width 1920 --height 1080 --fps 30 --duration 12 --seed 1`
   - 前提: プロジェクトで `npm i playwright-core`（スクリプトを置いた場所か親に `node_modules`）
   - `--stateless`: 前のコマの結果に依存しない作品だけ。付けると `--frames 100,150` が指定コマだけ描け、`--workers N` で並列化できる
   - **状態を持つ作品（シミュレーション等）は `--stateless` を付けない**。`--frames 359` は 0 から 359 まで全部計算して指定コマだけ保存するので、下見でも後半は遅い
5. 結果: `frames/*.png`・`hashes.json`（再現性の確認: 同じ入力で2回書いて比べる）・`render_meta.json`（秒/コマ・エラー）。ページの例外・`console.error`・HTTP 400以上があれば `error.log` を書き終了コード 1

## 2. 手順（手戻りを減らす順）
0. **全コマの数値チェック**（書き出し前に必ず）: `scripts/mock_canvas_check.mjs` が、モックの Canvas2D で負の半径・NaN・addColorStop の範囲外・alpha の範囲外・例外を全コマ検出する（360コマで 1〜8 秒）。描画を DOM のない `frame(ctx, i, t)` に分けておくと使える。これを回すようにしてから、実行時エラーで潰れた試行は 0 件になった
1. **数値の部分を DOM のないファイルに分ける**（`sim.js` のように）。node だけで全尺を回して、全反射の有無・渋滞のでき方・ピークの時刻・NaN・最小車間などを**書き出す前に数値で確かめる**（`check_sim.mjs`）。パラメータの当たりは記憶でなく小さな試算で決める
2. **下見**: `--frames` で数コマ（0・中盤・最後・危ない区間）を描いて、1080p の等倍で見る。引き出し線・ラベル・図の中の文字の重なりは、コンタクトシートでは小さすぎて毎回1〜3か所見落とす
3. **明るさが急に変わる区間**（場面転換・暗幕・雷・グリッチ・再起動表示）は、最初の書き出しの前にその区間の連続コマ（例: 62-73・170-181）だけ描き、平均輝度の1コマの差を測る（`PNG の平均輝度 × 219/255 + 16` が QC の物差しに近い）。しきい値 10。実例: 18.9→フェードと追従で 4.2（#115）、10.09→3.2（#122）。→ Skill `animation-qc-selfreview`
4. 本番は final（1080p）を1回。重い作品だけ先に draft（540p・640×360 など）で全尺を下見
   - **描画は「設計座標 1920×1080」で書き、`ctx.setTransform(width/1920, 0, 0, height/1080, 0, 0)` を毎コマ先頭で呼ぶ**。座標を実解像度に固定すると、小さい draft では左上しか写らず、QC の数字が無意味になる（検証 T3 で判明。T1 の draft QC も切り抜きに対するものだった）。雛形は `scripts/template/`（index.html＋main.js。動作確認済み）
5. **長い待ち・長い書き出しは最初からバックグラウンドで**。前面だと1コマンド10分の上限で切られる（空き RAM の待ちだけで #097 は 3030 秒）

## 3. 罠の一覧（実際に起きたもの）
**ページ・ランタイム**
- **setup の例外が見えずに120秒タイムアウト**: `let` 宣言より前に関数を呼ぶ（TDZ）など。`runtime.js` は setup の同期例外も `work.error` に載せる。ランタイムを自作するなら必ず拾う
- **easing の戻り値が範囲外**: `easeOutBack(0)` が -2.2e-15 になり、円の半径が負で `arc()` が IndexSizeError。**半径・不透明度・サイズは 0 以上に clamp**
- 共通関数の取り違え: `hexToRgb` は 0〜1（0〜255ではない。LUT が真っ黒になりかけた）。使いたい関数が export されていないと、ハーネスが「PNG がない」という分かりにくいエラーしか出さないことがある → import の名前を確認
- 雛形の設定が合わない（`stateless=true` なのに状態を持つ作品で例外）→ 作品ごとに確認
- **ライブ操作・実時間に依存する作品**は台本とずれる（自動操作が毎秒16〜19ステップ、目標30、実時間の約0.6倍）→ 仮想時刻で決定的に動かし、操作は frame(i) の関数にする
- 細い縞・細線は、下見の PNG を**本番と同じ x264 設定（crf16・slow・yuv420p）で圧縮して戻して見る**（周期9px・線4.1px は残った #080）
- 文字は `measureText` で幅を測ってから置く（右端で切れる）。日本語は Yu Gothic UI、数字・記号は Segoe UI。フォントはシステムのものだと環境で変わる → 使ったフォント名を記録
- 物理の説明ラベルの向きは、**シェーダーと同じ式で計算**する（ラベルは JS の `(0,1,0)×p`、シェーダーは `cross(vec3(0,1,0), hp)` で外積の向きが逆だった #038）

- **setup の無限ループは例外にならず、`page.goto` の30秒タイムアウトとしてしか出ない**（#109）→ setup は短く、重い初期化は下見で時間を測る
- 自作のドットフォントなど、文字列が1つでも長すぎると崩れる（34画素で崩れた #020）→ 全文字列の長さを機械で点検
- float32 で比べる値は、同じ型にそろえてから比較する（塗り順を float32 で比べて列が取りこぼされ、縦の白線 #101）
- 流れ場のブラシ・粒の生まれ直しは、粗い格子の空いている所から選ぶ（風下に溜まる #102）

**レイマーチ・WebGL の数式（#033・#034）**
- 距離関数の符号を1つ誤ると、画面全体が一色になる（奥の壁）
- 霞の式 (1−e^{−kt})/k は、下向きの視線（k<0）で max(k, ε) にすると負になり、水平線の下に帯が出る
- 遠景の段々の縞は、最小ステップ 0.02t → 0.0015t＋二分法で消えた
- 2×2 スーパーサンプリングは、GPU の1回の処理が長くならないよう画面を 12〜16 本の帯（scissor）に分けて描く
- 作品の `stateless` を設定する前に `--frames` で下見すると、0 から全コマを計算する（最初の下見が遅い）
- 網点のパターンは点だけで透けるので、下に紙の色を塗ってから重ねる（#024）
- 全画面の白フラッシュの代わりに、中心からの光を 0.2 秒で強めると、1コマの変化が最大 4.9（#123）

**WebGL**
- `getContext('webgl2', { preserveDrawingBuffer: true })` が必要（`toDataURL` で撮るため）
- RGBA32F テクスチャは環境によって線形補間できない → `texelFetch` で手で双線形補間
- **正距円筒の画像を球に貼るとき、経度 ±180° の継ぎ目で `atan` の微分が跳び、ミップマップが最も粗い段になって線が出る** → `textureLod` で、詳細度を球の画面上の半径から決める
- 光の筋（ゴッドレイ）: サンプル数×減衰が足りないと遠い画素に光が届かない（96サンプル×0.986/サンプル → 0.995＋距離補正、128サンプル）。画素ごとのサンプル位置のずらしはざらつきになる。**原因が分からないときは光が通るマスクそのものを1コマだけ画面に出す**
- 太陽などの明るさが雲のノイズで毎コマ揺れる → 時刻の関数だけで決める

**Canvas2D・フォント・合成**
- `globalCompositeOperation='destination-out'` は塗り色の不透明度の分しか消さない（rgba 0.42 で塗ると42%しか抜けない）→ 型抜きの前に `fillStyle='#000'`
- 加算（`lighter`）で重ねると色が白とピンクに寄る → 通常合成＋α0.88 で宝石色を残した
- **フォント名を間違えても、エラーなく黙って別のフォントに置き換わる**（`"UD Digi Kyokasho N-B"` は存在せず Yu Gothic で描かれた。正しくは family `UD Digi Kyokasho N`＋`bold`）。使うフォント名は .NET の InstalledFontCollection などで確かめる
- WebGL は別のキャンバスに `preserveDrawingBuffer:true` で描き、2D の `#c` へ `drawImage` してから文字を重ねると扱いやすい。重い描画は横の帯に分けて `flush`/`finish`（GPU のタイムアウト対策。実際に起きたかは未確認）
- WebGL の32ビット小数は深いズームで崩れる → 摂動法（Skill `simulation-animation`）
- **ループ作品**: frame 0 と最終コマの PNG の MD5 一致を確かめる
- 規則で動く配置・計算は、main.js の import と `startWork` 以降を消して node で `eval` し、数値で検証できる

**環境・手順**
- 部分描画で `--frames` に指定したコマの前を全部計算する（状態あり）。GPU を使う作品の下見は、資源の順番待ちの仕組みを通らないことがある（推測）
- この環境の ffmpeg は `-pattern_type glob` 非対応 → 連番は `%06d.png` の名前で渡す
- Git Bash の Python は標準出力が cp932 で日本語が化ける → `PYTHONIOENCODING=utf-8`。PowerShell の出力でも UTF-8 が化ける → ファイルは Read か Python（utf-8指定）で読む
- 書き出しの `--frames` に番号を1つだけ渡すと、古い版では範囲と誤解されて 0 コマで正常終了した（#068）。この同梱版は1つでも1コマの指定として扱う。直ったかは元の版では未確認
- 縮小のコンタクトシートにつける番号ラベルが、作品の左上の表示を隠すことがある（等倍で確認）
- 結果ファイル名は `qc_final.json` のようにプロジェクトごとに違う。待ち時間などの数字は summary に残す

## 4. 完成の確認
- ffprobe で解像度・fps・フレーム数・尺。→ Skill `animation-qc-selfreview`（QC と自己レビュー）
- 作品に音が必要なら、音は映像とは別に作り、書き出し・QC のあとに `ffmpeg -c:v copy` で AAC 192k を足す（映像を再エンコードしない）。クリックなど短い音を大量に足すとトゥルーピークが超える（1万回超で +2.2 dBFS）→ ピークを -6 dBFS に正規化して -13.6 LUFS・-2.8 dBTP にした。（音のミックスは、映像を再エンコードせず `ffmpeg -c:v copy -c:a aac` で足す）
