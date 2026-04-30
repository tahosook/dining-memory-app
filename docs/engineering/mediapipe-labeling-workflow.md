# MediaPipe ラベル改善ワークフロー

## Meta
- Purpose: MediaPipe static-image food classifier 向けラベル設計の改善ループを、bounded task として自動反復する workflow を定義する。
- Audience: `scripts/mediapipe_labeling_loop.py`、`scripts/compare_labeling_reports.py`、関連 prompt / config を保守する実装者とレビュー担当者。
- Update trigger: 自動改善 loop の目的、停止条件、guardrail、役割分担、次フェーズ判断が変わったとき。
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/index.md](../index.md), [docs/product/overview.md](../product/overview.md), [docs/product/progress.md](../product/progress.md), [docs/architecture/tech-spec.md](../architecture/tech-spec.md), [docs/ux/user-flows.md](../ux/user-flows.md), [docs/engineering/codex-workflow.md](codex-workflow.md), [docs/engineering/food-labeling-guidelines.md](food-labeling-guidelines.md)

## Summary
この workflow の主目的は、MediaPipe static-image food classifier 用に学習可能で実用的なラベル体系を固め、教師データ追加フェーズへ進めるところまでを bounded に自動反復することです。  
アプリ本体の最終分類器を完璧にし続けることは目的ではありません。

Dining Memory 全体の主目的は、食事やお酒の写真を「あとで思い出せる記録」に変え、手間なく保存し、あとで探しやすくすることにあります。  
AI は capture review 上の optional な入力補助であり、manual save を妨げてはいけません。  
この workflow も、その前提を崩さない範囲で MediaPipe 用ラベル設計と教師データ作成の土台を固めるためのものです。

## Current State
- `scripts/explore-food-labels.py` は画像ごとの primary 候補、review reasons、broad refinement を出力する。
- `scripts/analyze-food-labels.py` は `summary.json` と reason 別 candidate CSV を出し、どこを次に見直すかの材料を出す。
- これまでは、人が最新 summary を読み、次に直す対象を選び、Codex へ prompt を渡す運用が前提だった。
- 今後は 1 本の orchestration loop が `summary 読み取り -> 対象選定 -> bounded prompt 生成 -> nested AI executor 実行 -> 再集計 -> 比較 -> 継続/停止判定` を自動で回す。

## Decisions / Rules
### この workflow で優先して直すこと
1. `unknown_primary` と `side_item_primary` のような教師データ汚染につながる primary 崩れを優先 review へ回す。
2. MediaPipe の一次分類用 dataset を 8〜12 個程度の coarse class に抑える。
3. `stew` / `meat_dish` / `noodles` のような broad class は、coarse training class に map できていれば失敗扱いしない。
4. これ以上の LLM 自動分類改善より、人手 review 結果を教師データへ反映できる状態を優先する。

### MediaPipe 一次 class set
- 現段階の目的は細かい料理名分類ではなく、MediaPipe static-image classifier 向けの一次分類 dataset を作ること。
- 既定 class は `fried_dish`、`fish_dish`、`meat_dish`、`simmered_dish`、`curry_rice`、`stir_fry`、`noodles`、`drink`、`other_or_exclude`。
- `fried_chicken` / `fried_fish` / `fried_dumplings` は `fried_dish`、`nimono` / `stew` / `meat_and_potato_stew` は `simmered_dish`、`pasta` は `noodles` へ寄せる。
- `pizza`、`sushi`、`bento`、`bread`、`dessert`、`packaged_food`、`unknown` などは初期分類で独立 class 化せず、`other_or_exclude` または review / exclude 対象として扱う。

### review 優先順位
- `unknown_candidates` を最優先にする。
- 次に `broad_primary` のうち `stew` / `meat_dish` を確認する。
- 次に `side_item_primary`、`low_confidence`、`broad_primary` の `noodles` の順で見る。
- `noodles` は coarse class として成立しやすいため、細分化が必要かどうかの確認に留める。
- `drink_only` の `drink` に付いた `menu_or_text` reason は保持してよいが、メニュー表・ラベル・看板などの明示的な不適切画像でなければ主 review trigger から抑制する。

### やりすぎになる修整
- broad を減らすためだけに多段 heuristic や説明しにくい分岐を増やすこと。
- 少数クラスのために compare rubric、fallback、review note を過剰に複雑化すること。
- MediaPipe 用ラベル設計から外れた高機能分析 UI や review UI をこの workflow に背負わせること。
- 実用ラインを超えて精度改善を無限に追い続けること。

### この workflow でやるべきでないこと
- `src/` 配下のアプリ UX 問題まで同時に解こうとしない。
- capture review の optional assist という AI の位置づけを崩さない。
- manual save を止める前提で classifier や review flow を設計しない。
- MediaPipe path を app 全体の default runtime や永続化契約の中心にしない。
- 厚い AI metadata 保存や最終分類精度の追求を、この loop の主責務にしない。

### 自動 loop の bounded task 原則
- 1 cycle では 1 target、1 hypothesis、1 primary purpose だけ扱う。
- 1 run あたり `max_cycles_per_run` を超えて回さない。
- 同じ target で `no_change` が続くときは、同方向へ無限に粘らず別 hypothesis か別 target へ切り替える。
- local executor は 1 cycle / 1 target / 1 hypothesis の bounded task だけを担当する。
- local executor の変更範囲は原則 `scripts/explore-food-labels.py`、`scripts/analyze-food-labels.py`、`prompts/*`、`config/*`、`docs/engineering/*`、必要最小限の補助 script に限定する。
- local executor では `src/` 配下を原則変更禁止とし、アプリ本体 UX、runtime selection、永続化契約は扱わない。

### nested AI executor 方針
- executor 種別は `local_ollama`、`codex_cli`、`manual` とする。
- 既定 executor は `local_ollama` とし、通常の bounded cycle は local LLM で回す。
- local model の第一候補は `qwen3-coder-next` とし、代替候補は `devstral-small-2` または `gemma4:e4b` とする。
- `local_ollama` は script / prompt / config / engineering docs の小さな仮説検証だけを担当し、広い refactor や `src/` 配下の変更は担当しない。
- `codex_cli` は local executor が詰まったときの cloud executor として使う。既定 model は `gpt-5.4-mini`、fallback は `gpt-5.3-codex` とする。
- GPT-5.4 系は毎 cycle 使わず、local executor で通常サイクルを回し、詰まったときだけ上限の高い cloud executor へ escalation する。
- escalation は失敗ではなく、高い model を節約しながら bounded task を進めるための通常ルートとして扱う。
- `manual` executor は、人間が review gallery や CSV を見て判断するケース、または LLM だけでは分類方針や class set 判断を決めにくいケースに使う。
- `compare` 結果が `no_change` / `regressed`、`invalid_output`、executor failure のいずれかで stall した cycle が続く場合は escalation 対象にする。
- 既定の escalation 条件は 2 連続 stall とする。threshold、cloud model、fallback model は CLI 引数や config で調整できるように保つ。
- cycle artifact には executor 種別、model、strategy / hypothesis、target、changed_files、validation command、compare result、escalation reason を残し、あとから改善経路を追えるようにする。

- `unknown_primary` と `side_item_primary` がごく少数で安定している。
- `broad_primary` の総数ではなく、coarse training class に map できない broad 件数がごく少数になっている。
- `needs_human_review` が実用ラインまで下がり、review 対象が priority bucket で追える。
- coarse MediaPipe training class count が 8〜12 個程度に収まっている。
- `unknown`、`menu_or_text`、`packaged_food`、`non_food` などが training target の未解決件数と exclude candidate として分離されている。
- それ以上の改善は code 修整より教師データ追加の方が効くと判断できる。
- もしくは `max_cycles_per_run`、target 枯渇、executor failure、比較不能などの打ち止め条件に達した。

### 打ち止め後の next phase
- `teacher-data curation`: ラベル体系は概ね見えたが、残件は code 修整より教師データ追加の方が効く。
- `review UI / correction UX`: 致命指標は下がったが、review や correction の運用面が次の律速になっている。
- `MediaPipe class set finalization`: 一次クラス候補が 8〜12 個程度に収まり、class set を固定してよい状態になった。

### teacher-data curation 実行例
`scripts/export-mediapipe-dataset.py` は `labels.jsonl` と任意の review export を読み、MediaPipe static-image classifier 用の class-directory dataset を作る。

```bash
python scripts/export-mediapipe-dataset.py \
  --labels-jsonl state/labeling/latest/labels.jsonl \
  --review-json state/labeling/latest/review_export.json \
  --image-root /path/to/photos \
  --output-dir state/mediapipe-dataset/latest \
  --val-ratio 0.15 \
  --test-ratio 0.15 \
  --seed 42
```

review correction がある場合は AI の `primary_dish_key` より `corrected_training_class` または `corrected_primary_dish_key` を優先する。`human_judgment` は `ok`、`wrong_primary`、`exclude_non_food`、`exclude_menu_or_text`、`exclude_packaged` を使う。出力は `train/`、`val/`、`test/`、`excluded/excluded_manifest.jsonl`、`label_map.json`、`labels.txt`、`dataset_summary.json`、`dataset_summary.md` で確認する。

## Next Steps or Open Questions
- loop が `no_change` / `regressed` を出したときにどこまで自動 rollback するかは、必要になった時点で別途判断する。
- 次フェーズは LLM 自動分類改善を続けるより、priority bucket に沿った人手 review と教師データ export を進める。
- MediaPipe class set finalization の判断後に `src/ai/mealInputAssist/` 側の正規化契約をどう固定するかは別タスクで扱う。
