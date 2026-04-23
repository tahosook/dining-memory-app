# Dining Memory App

食事やお酒の写真を撮影し、記録として端末内に保存するモバイルアプリです。  
撮った写真を料理名、場所、メモとあわせて残し、あとから一覧・検索・統計で振り返ることを目指しています。

## 今できること
- カメラで撮影し、内容を確認してから保存する
- 記録を一覧で見返し、詳細画面で大きい写真を確認する
- 記録詳細から編集・削除し、必要な写真だけ X 投稿に進める
- テキスト検索、場所フィルター、自炊フィルターで探す
- 保存済み記録の件数や傾向を簡単な統計で確認する

## ドキュメント案内

### あなた向けドキュメント
- [プロダクト概要](docs/product/overview.md): 何を作りたいか、誰のためのものか、将来どうしたいか
- [実装進捗](docs/product/progress.md): 今どこまでできているか、何が未実装か

### 実装向けドキュメント
- [技術仕様](docs/architecture/tech-spec.md): current implementation と runtime assumptions
- [画面設計](docs/ux/screen-designs.md): current screen behavior
- [ユーザーフロー](docs/ux/user-flows.md): current implemented flows
- [DB設計](docs/domain/database-design.md): current schema and storage rules
- [実装規約](docs/engineering/coding-standards.md): coding rules
- [Codex 作業ルール](docs/engineering/codex-workflow.md): review and verification workflow
- [食事画像ラベリング指針](docs/engineering/food-labeling-guidelines.md): MediaPipe 用ラベル設計と教師データ作成に向けた script 修整の判断ルール
- [MediaPipe ラベル改善ワークフロー](docs/engineering/mediapipe-labeling-workflow.md): 自動改善 loop の目的、guardrail、停止条件
- [即時改善提案](docs/engineering/immediate-improvements.md): 今すぐ入れるべき改善案の整理

### ドキュメント入口
- [docs/index.md](docs/index.md): 誰がどの文書を読むかの案内板
- [AGENTS.md](AGENTS.md): Codex の入口と文書作成ルール

## プロジェクト構成

```text
dining-memory-app/
├── AGENTS.md
├── docs/
│   ├── index.md
│   ├── product/
│   ├── architecture/
│   ├── domain/
│   ├── ux/
│   ├── engineering/
│   └── notes/
├── src/
├── assets/
├── tests/
└── README.md
```

## 開発環境セットアップ

### システム要件
- Node.js 25.9.x 推奨
- Expo SDK 55.x
- Expo CLI 55.x 以上（`npx expo` 推奨）
- iOS 開発: Xcode
- Android 開発: Android Studio（任意）

### 初期セットアップ
```bash
git clone https://github.com/tahosook/dining-memory-app.git
cd dining-memory-app
node --version
npm install
cp .env.example .env
npx expo start --dev-client
```

### 実行時前提
- React Native 0.83 系 / React 19.2 系を前提としています
- Expo SDK 55 以降のため New Architecture は常時有効です
- Android の写真保存権限は `expo-media-library` プラグインで管理します
- `llama.rn` を使う local AI runtime は Expo Go ではなく dev build / native build 前提です

### Local AI Runtime
- local AI model は repo や app bundle に含めません
- local AI の current scope は meal input assist のみです
- model / projector は Settings 画面からユーザーが明示操作でダウンロードします
- document picker や設定画面からの path 上書きは現在サポートしません
- app-local の固定 path に必要な file がある場合だけ runtime が `Ready` になります
- review 画面の AI 入力補助は current stage、進捗の目安、残り時間の目安を表示します
- capture review 中は live camera preview を止め、AI 解析時の端末負荷を下げます
- meal input assist model: `documentDirectory/ai-models/meal-input-assist.gguf`
- meal input assist projector: `documentDirectory/ai-models/meal-input-assist.mmproj`
- model の導入状態、readiness、blocker reason は Settings 画面で確認します

### Gemma 4 食事写真ラベリング CLI
- script の修整方針、責務、打ち止めラインは [食事画像ラベリング指針](docs/engineering/food-labeling-guidelines.md) を参照してください
- 自動改善 loop の guardrail、停止条件、次フェーズ判断は [MediaPipe ラベル改善ワークフロー](docs/engineering/mediapipe-labeling-workflow.md) を参照してください
- UI とは別に、`scripts/explore-food-labels.py` でローカル画像ディレクトリを一括ラベリングできます
- 想定は macOS + Ollama のローカル API + `gemma4:e4b` です
- 対応拡張子は `jpg`, `jpeg`, `png`, `webp`, `heic` です
- v3 では scene 説明より `primary_dish_key` の発掘を優先し、`supporting_items` と `review_reasons` に補助情報を分離します
- `meat_dish` は broad な last-resort fallback として扱い、可能なら `fried_cutlet`, `fried_chicken`, `grilled_meat`, `stir_fry`, `stew` などへ寄せます
- `set_meal`, `multi_dish_table`, `scene_dominant`, `stew`, `meat_dish`, `noodles` は coarse 判定後に crop refinement 対象になり、主料理候補の局所 crop を 1〜3 個だけ一時生成して main dish を再確認します
- crop refinement 後も `stew`, `meat_dish`, `noodles` が残る時だけ、compare set を絞った fine refinement を追加実行します
- broad refinement 後の `review_reasons` / `needs_human_review` は最終 `primary_dish_key` 基準で再計算され、resolved broad は不要に review へ残りにくくなります
- crop は run 中の一時処理だけに使い、crop 画像ファイル自体は保存しません
- `meat_dish`, `stew`, `noodles` は fine candidates が十分具体寄りな時だけ conservative rescue で `stir_fry` / `grilled_meat` / `nimono` / `curry_rice` / `meat_and_potato_stew` / `pasta` へ寄せます
- 出力は `normalized/`, `raw/`, `labels.jsonl`, `errors.jsonl` に保存します
- `--workers` で安全寄りの並列実行ができます。既定は `1`、まずは `2` から試し、余裕があれば `3〜4` を検討してください

まずは 50 枚程度で試す想定の最小例:

```bash
python3 scripts/explore-food-labels.py --input-dir <photos> --output-dir <out> --model gemma4:e4b --limit 50 --timeout 180
```

並列実行例:

```bash
python3 scripts/explore-food-labels.py --input-dir <photos> --output-dir <out> --model gemma4:e4b --workers 2
```

`normalized/<relative-file>.json` が画像ごとの正規化済み JSON、`raw/<relative-file>.response.json` が生レスポンス保存、`labels.jsonl` が全件集約、`errors.jsonl` が失敗ログです。`labels.jsonl` は worker から直接追記せず、run 完了後に再構築します。主な v3 フィールドは `primary_dish_key`, `primary_dish_candidates`, `supporting_items`, `scene_type`, `review_reasons`, `needs_human_review` で、review 補助メタデータとして `container_hint`, `contains_can_or_bottle`, `review_bucket`, `crop_refinement_status`, `crop_refinement_applied`, `crop_candidate_count`, `crop_selected_index` を含められます。

### Gemma 4 ラベリング結果 集計 CLI
- `scripts/analyze-food-labels.py` で `labels.jsonl` または `normalized/**/*.json` を読み、`primary_dish_key` を中心に分布・bias・要レビュー候補を集計できます
- `summary.json` と `summary.md` に全体像を保存し、`review_candidates.csv` と reason 別 candidate CSV を出力します
- `summary.json` / `summary.md` には coarse broad 件数、crop refinement の triggered / applied / failed 件数、fine refinement の resolved / kept_broad / failed 件数も含まれます
- `broad_primary_candidates.csv` は fine refinement 後も broad fallback のまま残った record を中心に抽出し、`coarse_primary_dish_key`, `broad_refinement_status`, `crop_refinement_status`, `best_concrete_candidate_key`, `top1_score`, `top2_score`, `score_gap` などの診断列も出します
- `--min-confidence` を指定すると、低信頼 record を summary 集計から除外して見直せます

最小例:

```bash
python3 scripts/analyze-food-labels.py --input-path <label-output-dir> --output-dir <analysis-out> --top-n 20 --min-confidence 0.5
```

`summary.json`, `summary.md`, `review_candidates.csv`, `unknown_candidates.csv`, `scene_dominant_candidates.csv`, `side_item_primary_candidates.csv`, `low_confidence_candidates.csv`, `broad_primary_candidates.csv` が出力されます。

### ラベリング report 比較 CLI
- `scripts/compare_labeling_reports.py` で before / after の `summary.json` を比較し、`improved` / `no_change` / `regressed` を JSON で返します
- `config/mediapipe_labeling_goals.json` の guardrail と stop condition を使い、`unknown_primary` や `side_item_primary` の悪化を broad 改善より重く扱います
- `broad_primary_candidates.csv` があれば、`broad_fallback:<key>` と `best_alt:<candidate>` から次 target hint も返します

最小例:

```bash
python3 scripts/compare_labeling_reports.py \
  --before-summary <before-report>/summary.json \
  --after-summary <after-report>/summary.json \
  --config config/mediapipe_labeling_goals.json
```

### MediaPipe ラベル改善 auto loop
- `scripts/mediapipe_labeling_loop.py` は `summary 読み取り -> target 選定 -> bounded prompt 生成 -> Codex 実装 -> labels/report 再生成 -> compare -> 継続/停止判定` を 1 run で自動実行します
- baseline `summary.json` が無いときは `state/mediapipe_labeling_runs/baseline/` に baseline labels/report を自動生成します
- default guardrail では `src/` を触らず、主に `scripts/explore-food-labels.py`, `scripts/analyze-food-labels.py`, `config/*`, `prompts/*`, `docs/engineering/*` を対象にします
- state seed は `state/mediapipe_labeling_state.json`、prompt template は `prompts/mediapipe_labeling_implementer.txt`、goal config は `config/mediapipe_labeling_goals.json` を使います
- `--executor dry_run` で prompt / state / compare artifact だけ確認できます。dry-run cycle では実装差分が無いため、cycle 側の再ラベリングは行わず baseline summary を after として扱います
- `--executor codex_cli` では実際に `codex exec` を呼び、cycle 側でも labels/report を再生成して before / after を比較します
- `codex_cli` の既定 model は `gpt-5.4-mini` です。`no_change` / `regressed` が連続 2 cycle 続くと、残りの stalled cycle では `gpt-5.3-codex` へ自動昇格します
- `--codex-model`, `--codex-fallback-model`, `--codex-fallback-after-stalled-cycles` で nested Codex の運用方針を調整できます
- `--explore-limit` を指定すると、実写真ディレクトリ全体ではなく先頭 N 件だけを bounded に処理できます

dry-run 例:

```bash
python3 scripts/mediapipe_labeling_loop.py \
  --input-dir <photos> \
  --config-path config/mediapipe_labeling_goals.json \
  --prompt-template prompts/mediapipe_labeling_implementer.txt \
  --state-path state/mediapipe_labeling_state.json \
  --runs-dir state/mediapipe_labeling_runs \
  --executor dry_run \
  --explore-limit 10
```

Codex 実行例:

```bash
python3 scripts/mediapipe_labeling_loop.py \
  --input-dir <photos> \
  --config-path config/mediapipe_labeling_goals.json \
  --prompt-template prompts/mediapipe_labeling_implementer.txt \
  --state-path state/mediapipe_labeling_state.json \
  --runs-dir state/mediapipe_labeling_runs \
  --executor codex_cli \
  --codex-model gpt-5.4-mini \
  --codex-fallback-model gpt-5.3-codex \
  --codex-fallback-after-stalled-cycles 2 \
  --explore-limit 50 \
  --explore-model gemma4:e4b \
  --explore-workers 2 \
  --explore-timeout 180 \
  --analyze-top-n 20 \
  --analyze-min-confidence 0.5
```

### 環境変数
```env
# 将来的な機能拡張用 API キー
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key

EXPO_PUBLIC_APP_NAME=Dining Memory
EXPO_PUBLIC_APP_VERSION=1.0.0
```

`.env.example` をテンプレートとして使い、`.env` はローカル専用ファイルとして扱います。

### 動作確認
1. dev build か native build を物理デバイスに入れて起動する
2. Settings 画面で meal input assist model をダウンロードし、`Local AI Runtime Status` の ready / unavailable reason を確認する
3. カメラタブから写真を撮影し、料理名などを入力して保存する
4. 記録タブと検索タブで保存結果を確認する

## 検証の考え方
- ユニットテスト: 個別ロジックやサービス
- 統合テスト: 撮影から保存、表示までの一連フロー
- 自動テスト: Jest + React Native Testing Library
- 詳細な検証ルールは [docs/engineering/codex-workflow.md](docs/engineering/codex-workflow.md) を参照

## APK ビルド
### 🔹 開発用デバッグAPK
```bash
cd android
./gradlew assembleDebug
```
出力先: `./android/app/build/outputs/apk/debug/app-debug.apk`

### 🔹 本番用リリースAPK（推奨）
```bash
cd android
./gradlew assembleRelease
```
出力先: `./android/app/build/outputs/apk/release/app-release.apk`

✅ どちらも一度端末にインストールすればUSBケーブル不要で単体で動作します。開発サーバーなしでも全機能が利用可能です。

💡 リリース版は最適化が有効で起動が速く、ファイルサイズも小さくなります。実際に使う場合はこちらを推奨します。
