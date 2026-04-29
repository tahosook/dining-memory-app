# Dining Memory App

食事やお酒の写真を撮影し、記録として端末内に保存するモバイルアプリです。  
撮った写真を料理名、場所、メモとあわせて残し、あとから一覧・検索・統計で振り返ることを目指しています。

## 今できること
- カメラで撮影し、内容を確認してから保存する
- 記録を一覧で見返し、詳細画面で大きい写真を確認する
- 記録詳細から編集・削除し、必要な写真だけ X 投稿に進める
- テキスト検索、料理ジャンル、場所フィルター、自炊フィルターで探す
- 保存済み記録の件数や傾向を簡単な統計で確認する

## ドキュメント案内

### あなた向けドキュメント
- [プロダクト概要](docs/product/overview.md): 何を作りたいか、誰のためのものか、将来どうしたいか
- [実装進捗](docs/product/progress.md): 今どこまでできているか、何が未実装か

### 実装向けドキュメント
- [Codex コンテキストマップ](docs/engineering/codex-context-map.md): Codex が task ごとに読むべき最小 context の索引
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
- [AGENTS.md](AGENTS.md): Codex の固定ルール
- [TASKS.md](TASKS.md): 現在見えている作業候補
- [PLANS.md](PLANS.md): 大きめ作業の短い実装方針

## プロジェクト構成

```text
dining-memory-app/
├── AGENTS.md
├── TASKS.md
├── PLANS.md
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

### 食事写真ラベリング CLI
MediaPipe static-image classifier 向けのラベル探索と教師データ化補助は、アプリ本体 UI とは別のローカル CLI として運用します。
責務、出力契約、打ち止めラインは [食事画像ラベリング指針](docs/engineering/food-labeling-guidelines.md) を、改善 loop の guardrail と停止条件は [MediaPipe ラベル改善ワークフロー](docs/engineering/mediapipe-labeling-workflow.md) を参照してください。

最小例:

```bash
python3 scripts/explore-food-labels.py --input-dir <photos> --output-dir <out> --model gemma4:e4b --limit 50 --timeout 180
```

```bash
python3 scripts/analyze-food-labels.py --input-path <label-output-dir> --output-dir <analysis-out> --top-n 20 --min-confidence 0.5
```

```bash
python3 scripts/build-review-gallery.py \
  --input-path <label-output-dir> \
  --output-html <analysis-out>/review_gallery.html \
  --image-root <photos>
```

`build-review-gallery.py` は既定で重点候補セクションのみを出力します。全件一覧や Review targets も見たい場合は `--include-all-records` / `--include-review-targets` を追加します。HTML 1 ファイルだけを別デバイスに渡す場合は `--embed-images` を追加します。

```bash
python3 scripts/compare_labeling_reports.py \
  --before-summary <before-report>/summary.json \
  --after-summary <after-report>/summary.json \
  --config config/mediapipe_labeling_goals.json
```

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
