# Food Label Exploration Workflow

## Meta
- Purpose: 食事写真ラベリング CLI 群の目的、crop refinement を含む運用前提、保存境界を task-local memo として残す。
- Audience: `scripts/explore-food-labels.py`、`scripts/analyze-food-labels.py`、`scripts/build-review-gallery.py` を修整・運用する人。
- Update trigger: food label exploration の stage 構成、broad primary の扱い、review 運用、保存方針が変わったとき。
- Related docs: [AGENTS.md](../../AGENTS.md), [README.md](../../README.md), [docs/engineering/food-labeling-guidelines.md](../engineering/food-labeling-guidelines.md), [docs/architecture/tech-spec.md](../architecture/tech-spec.md)

## Summary
この文書は canonical docs より下位の task-local memo です。  
判断に迷った場合は `README.md` と `docs/engineering/food-labeling-guidelines.md` を優先し、このメモは今回の CLI 改修意図を補うために使います。

## Current State
- `scripts/explore-food-labels.py` は `coarse full-image -> crop refinement -> broad refinement` の順で main dish を寄せる。
- 主料理の取りこぼしが多いのは `set_meal` / `multi_dish_table` / `scene_dominant` / broad primary 残件で、特に multi-dish / set meal 写真で full-image 判定だけだと主菜が埋もれやすい。
- `scripts/analyze-food-labels.py` は broad 残件や review 候補を集計し、`broad_primary_candidates.csv` で「なぜ broad のまま残ったか」を見やすくする。
- `scripts/build-review-gallery.py` は HTML 単体で review しやすい診断画面を作る。編集保存や app 本体 UX の再現は責務に含めない。

## Decisions / Rules
- taxonomy の考え方は `specific > broad > scene fallback > unknown/supporting` を基本にする。broad primary は「最後の fallback だが still usable」な中間地点として扱う。
- `stew`, `meat_dish`, `noodles` は residual broad が多く、compare set を絞った broad refinement と conservative rescue の対象にする。
- crop refinement は `set_meal`, `multi_dish_table`, `scene_dominant`, broad primary を main-dish 観点で再確認するための一時 stage とする。重い CV 依存は入れず、固定ヒューリスティック crop と Ollama/Gemma の再判定だけで進める。
- crop は run 中の一時ファイルだけを使い、crop 画像そのものは保存しない。normalized JSON には `crop_refinement_status` などの thin metadata だけ残し、raw JSON には stage 単位の request/response を残す。
- analyze / gallery の運用は「残件 broad を減らす」よりも「次にどのルールを直すか判断できる」ことを優先する。`best_concrete_candidate`, `top1/top2`, `score_gap`, `compare_keys`, `crop/broad status` を診断軸にする。
- app 本体の persistent contract は広げない。`src/`、DB schema、user-visible save data は今回の対象外。

## Next Steps or Open Questions
- crop 候補の位置やサイズは固定ヒューリスティックのままなので、set meal の残件を見ながら lower-center / center の比率を再調整する余地がある。
- residual broad が減ったあと、追加で割る価値があるカテゴリは frequency と review のしやすさで再判断する。
- 将来 MediaPipe 側の class set が固まったら、review gallery から教師データへ落とす最小フローを別タスクで整理する。
