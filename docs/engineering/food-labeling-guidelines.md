# 食事画像ラベリング指針

## Meta
- Purpose: MediaPipe static-image food classifier 向けのラベル設計と教師データ作成に関する、食事画像ラベリング用スクリプトの修整判断ルールを定義する。
- Audience: `scripts/explore-food-labels.py`、`scripts/analyze-food-labels.py`、`scripts/build-review-gallery.py` を修整する実装者とレビュー担当者。
- Update trigger: ラベリング用スクリプトの責務、優先度、出力契約、打ち止めラインの考え方が変わったとき。
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/index.md](../index.md), [docs/product/overview.md](../product/overview.md), [docs/product/progress.md](../product/progress.md), [docs/architecture/tech-spec.md](../architecture/tech-spec.md), [docs/ux/user-flows.md](../ux/user-flows.md), [docs/engineering/mediapipe-labeling-workflow.md](mediapipe-labeling-workflow.md)

## Summary
このスクリプト群の役割は、MediaPipe static-image food classifier 用の学習可能なラベル体系を固め、教師データを作りやすくするための道具である。  
主目的はアプリ本体の最終分類器を完璧にすることではない。

Dining Memory 全体の目的は、食事やお酒の写真を「あとで思い出せる記録」に変えることにある。  
AI は capture review 上の optional な入力補助であり、manual save を妨げてはいけない。  
MediaPipe path は separate path として扱い、将来 rich classifier result が出ても UI には suggestion 形へ正規化し、保存時 AI metadata は thin に保つ。

## Current State
- `scripts/explore-food-labels.py` は、主料理を拾うためのラベル提案と、高頻度 `broad_primary` の具体化を担当する。
- `scripts/explore-food-labels.py` の crop refinement は、`set_meal` / `multi_dish_table` / `scene_dominant` / broad primary に対して、一時 crop で主料理候補を見直す separate stage として扱う。
- `scripts/analyze-food-labels.py` は、`unknown_primary`、`scene_dominant`、`side_item_primary`、`broad_primary` の偏りと、broad の割れ先を見える化する。
- `scripts/build-review-gallery.py` は、人手レビューを教師データ化しやすい形で集める。アプリ本体の UX を再現することは責務に含めない。
- このスクリプト群の目標は完璧な最終分類ではなく、MediaPipe の一次クラス候補を 8〜12 個程度に絞れる状態を作ることにある。

## Decisions / Rules
### 修整優先度
1. 主料理を副菜や scene に奪われにくくする。
2. `broad_primary` を高頻度・高価値クラスに限って具体カテゴリへ割る。
3. 人手レビュー結果を教師データ化しやすくする。
4. `broad` の中身がどこに割れるか可視化する。

### 高頻度 broad 改善の既定候補
- `stew -> nimono / meat_and_potato_stew / curry_rice`
- `meat_dish -> stir_fry / grilled_meat`
- `noodles -> pasta / noodles`
- 高頻度 broad の改善はやる価値が高い。一方で、少数クラスや説明しにくい境界のためにスクリプトを複雑化しすぎない。

### やるべき修整
- `explore-food-labels.py` の prompt、rubric、fallback 順序を見直し、主料理が `side_item` や `scene` に奪われにくいようにする。
- `set_meal` / `multi_dish_table` / `scene_dominant` には full-image だけで詰めず、一時 crop による main-dish 再判定を使ってよい。
- 高頻度 `broad_primary` だけを対象に compare set や review note を調整し、具体カテゴリへ寄せやすくする。
- `scene_dominant` は、`low_confidence` や `candidate_split` など別の review reason が既に付いている場合は last-resort の fallback とみなし、scene 優勢だけを独立した理由として残す。
- `scene_dominant` や `low_confidence` は model の raw reason をそのまま信じず、最終 `primary_dish_key` と最終 confidence から再判定し、specific dish が選べている時の stale reason は落とす。
- `analyze-food-labels.py` の集計で、`broad_primary` の残件と、その中身がどの具体クラスに割れそうかを見えるように保つ。
- `build-review-gallery.py` の review candidate 整理や export を、教師データ化しやすい shape に寄せる。
- crop / broad refinement の追加 metadata は review と診断に必要な最小限だけを normalized JSON に残し、crop 画像そのものや厚い中間 state は保存しない。
- 出力契約を変えるのは、ラベル設計や教師データ化に直接効くときに限る。

### やりすぎになる修整
- 少数クラスのために複雑な rescue や例外処理を積み増すこと。
- 説明しにくい境界のために、多段 heuristic や細かすぎる分岐を増やすこと。
- `analyze` や `gallery` を、教師データ作成に直接効かない高機能な分析ツールや review UI に広げること。
- broad を減らすためだけに、再現しにくい prompt 調整や過剰な後処理を入れること。
- crop 補助のために重い CV 依存や恒久的な中間画像保存を持ち込むこと。

### このスクリプトでやるべきでないこと
- アプリ本体の UX 問題までこのスクリプトに背負わせない。
- capture review の optional assist という AI の位置づけを崩さない。
- manual save を妨げる前提で分類器や review flow を設計しない。
- MediaPipe path を app 全体の default runtime や永続化契約の中心にしない。
- 最終分類精度の追求や厚い AI metadata 保存を、このスクリプト群の責務にしない。

### 今後むやみに崩さない出力契約
- `explore-food-labels.py`: `labels.jsonl`、`normalized/**/*.json`、`primary_dish_key`、`primary_dish_candidates`、`supporting_items`、`review_reasons`、`needs_human_review`
- `explore-food-labels.py`: crop は run 中の一時ファイルだけで扱い、永続化は thin metadata と raw response の stage 記録に留める
- `analyze-food-labels.py`: `summary.json`、`summary.md`、`review_candidates.csv`、`unknown_candidates.csv`、`scene_dominant_candidates.csv`、`side_item_primary_candidates.csv`、`low_confidence_candidates.csv`、`broad_primary_candidates.csv`
- `build-review-gallery.py`: `predicted_primary_dish_key`、`human_judgment`、`corrected_primary_dish_key`、`review_note`、`review_flags`、`candidate_groups` を中心にした review export

### 打ち止めライン
- `unknown_primary` と `side_item_primary` がごく少数になっている。
- `broad_primary` が、主に本当に曖昧なものだけになっている。
- 高頻度 broad の中身が、どの具体クラスに割れるか見えている。
- MediaPipe の一次クラス候補を 8〜12 個程度に絞れる見通しが立っている。
- それ以上の改善は、スクリプト改修より教師データ追加や UI 側改善の方が効く状態になっている。

## Next Steps or Open Questions
- review export を教師データへ変換する最小フローを、別タスクで必要になった時点で整理する。
- 高頻度 broad の残件が減ったあとに、追加で割る価値があるクラスは frequency と review しやすさを基準に再判断する。
- MediaPipe 側の class set が固まったら、この文書と `src/ai/mealInputAssist/` 側の正規化方針にずれがないかを確認する。
