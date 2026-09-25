# Issue 13: MediaPipe Remote Model Pipeline

## Meta
- Purpose: MediaPipe 食事分類モデルのリモート配布パイプラインを実装するためのタスク仕様。
- 内部ドキュメントID: issue-13
- 対応 GitHub Issue: 未起票
- Audience: 実装担当者および PR レビューア。
- Update trigger: 各 Phase の受入基準やスコープが変わったとき。
- Related docs: [docs/architecture/food-labeling-pipeline.md](../architecture/food-labeling-pipeline.md), [docs/notes/ai-input-assist-mediapipe-static-image-groundwork.md](../notes/ai-input-assist-mediapipe-static-image-groundwork.md)
- Status: open

---

## Prerequisites

- [docs/architecture/food-labeling-pipeline.md](../architecture/food-labeling-pipeline.md) の全体像と Design Decisions を理解済みであること。
- MediaPipe path は Hidden Path（デフォルトランタイムに切り替えない）の原則を遵守すること。

---

## Phase Dependencies

```mermaid
flowchart LR
  P1["Phase 1\nAppSettings 分離"] --> P2["Phase 2\nMediaPipe Downloader"]
  P2 --> P3["Phase 3\nAndroid Native\nMappedByteBuffer"]
  P3 --> P4["Phase 4\nUI 統合・E2E 検証"]
```

Phase 1 → 2 → 3 → 4 の順序で実装する。各 Phase は前の Phase の完了に依存する。

---

## Phase 1: AppSettingsService への MediaPipe 用キー追加

GGUF の状態管理と衝突しない MediaPipe 専用のキーを `AppSettingsService` に追加する。

### 変更対象ファイル
- `src/database/services/AppSettingsService.ts`

### タスク
- [ ] 以下のキー定数を追加する:
  - `mediapipe_model_status` (`'not_installed' | 'ready' | 'error'`)
  - `mediapipe_model_version`
  - `mediapipe_model_downloaded_at`
  - `mediapipe_model_error_message`
- [ ] 対応する getter/setter メソッドを追加する（`getMediaPipeModelStatus()`, `setMediaPipeModelStatus()` 等）。
- [ ] 既存の `meal_input_assist_model_*` キーおよびメソッドは一切変更しない。

### 受入基準
- 既存テスト（`tests/` 配下の AppSettingsService 関連）がすべて通過すること。
- 新規キーの get/set が正しく動作すること（手動確認 or テスト追加）。
- GGUF 用の `getMealInputAssistModelStatus()` の動作に影響がないこと。

---

## Phase 2: MediaPipe モデル用ダウンローダー追加

既存の `modelInstaller.ts` 内の低レベル関数（`downloadToTemporaryFile`, `replaceFile`, `cleanupFile`）を再利用し、MediaPipe 専用のインストール関数を追加する。

### 変更対象ファイル
- `src/ai/mealInputAssist/modelConfig.ts` — MediaPipe 用の設定追加
- `src/ai/mealInputAssist/modelInstaller.ts` — MediaPipe 用インストール関数追加
- `src/ai/mealInputAssist/types.ts` — 必要に応じて MediaPipe ステータス型追加
- `src/ai/mealInputAssist/index.ts` — barrel export 更新

### タスク
- [ ] `modelConfig.ts` に MediaPipe モデルの設定を追加する:
  - GitHub Releases の URL
  - ファイル名（例: `meal-classifier.task`）
  - SHA256 ハッシュ
  - バージョン文字列
- [ ] `modelInstaller.ts` に以下を追加する:
  - `installMediaPipeModel(options?)` — ダウンロード → SHA256 検証 → `replaceFile` で配置 → Phase 1 のキーに状態を永続化。
  - `getMediaPipeModelStatus()` — ローカルファイルの存在確認と設定キーの読み取り。
  - `deleteMediaPipeModel()` — ファイル削除と状態リセット。
- [ ] **既存の `installModelFiles()` / `installMealInputAssistModel()` / `redownloadMealInputAssistModel()` / `deleteMealInputAssistModel()` は変更しない。**
- [ ] SHA256 検証には `expo-crypto` の `digestStringAsync` を使用する（既存で `expo-crypto` は import 済み）。

### 受入基準
- GGUF のダウンロード・削除フローが引き続き正常に動作すること。
- MediaPipe モデルのダウンロード後、`documentDirectory/ai-models/meal-classifier.task` にファイルが配置され、`getMediaPipeModelStatus()` が `{ kind: 'ready' }` を返すこと。
- SHA256 が不一致の場合、ファイルが削除され `{ kind: 'error' }` が返ること。
- ダウンロード中に異常終了した場合、一時ファイルがクリーンアップされること。

### ロールバック
追加した関数・型・設定を削除すれば完全に元に戻る。既存コードを変更しないため、revert は安全。

---

## Phase 3: Android Native の MappedByteBuffer 対応

`MediaPipeMealInputAssistModule.kt` の `ensureClassifier()` を変更し、APK assets/ ではなくローカルストレージのモデルファイルを `MappedByteBuffer` 経由で読み込めるようにする。

### 変更対象ファイル
- `android/.../MediaPipeMealInputAssistModule.kt` — `ensureClassifier()` の読み込みロジック変更
- `android/.../MediaPipeMealInputAssistSupport.kt` — パス定数の追加

### タスク
- [ ] `ensureClassifier()` (現在 L131-153) を以下のように変更する:
  1. React Native 側から渡されたモデルファイルパス、またはNative 側で既知のパスから `File` オブジェクトを生成。
  2. `FileInputStream(file).channel.map(FileChannel.MapMode.READ_ONLY, 0, file.length())` で `MappedByteBuffer` を取得。
  3. `BaseOptions.builder().setModelAssetBuffer(mappedBuffer)` でオプションを構築。
  4. `FileChannel` と `FileInputStream` を `use` ブロックで確実に close する。
- [ ] `hasBundledModelAsset()` (現在 L155-166) をローカルファイルの存在確認に置き換える。
- [ ] 既存の `invalidate()` (L33-40) の `classifier?.close()` パスはそのまま維持する。
- [ ] モデルファイルが存在しない場合の `FileNotFoundException` ハンドリングは既存のエラーコード体系（`E_CLASSIFIER_INIT_FAILED`）を踏襲する。

### 受入基準
- `documentDirectory/ai-models/meal-classifier.task` にモデルファイルを配置した状態で `classifyStaticImage` を呼び、`categories[]` が返ること（実機 or エミュレータ）。
- モデルファイルが存在しない場合、`getClassifierStatus` が `{ kind: 'unavailable' }` を返し、クラッシュしないこと。
- `invalidate()` 呼び出し後、`classifier` が null になりリソースが解放されること。
- 破損したファイルを配置した場合、`E_CLASSIFIER_INIT_FAILED` エラーが React Native 側に伝播すること。

### ロールバック
`ensureClassifier()` を `setModelAssetPath` に戻せば完全に元に戻る。

---

## Phase 4: UI 統合と E2E 検証（Hidden Path）

一般ユーザーの体験を壊さず、開発者が MediaPipe モデルをテストできる導線を SettingsScreen に追加する。

### 変更対象ファイル
- `src/screens/SettingsScreen/SettingsScreen.tsx` — MediaPipe セクション追加
- 関連フック（必要に応じて新規作成）

### タスク
- [ ] SettingsScreen に MediaPipe モデルの状態表示・ダウンロード・削除の UI を追加する。
  - **表示条件**: `__DEV__` フラグ、または feature flag によって表示を制限する。一般ユーザーには見せない。
- [ ] ダウンロード → 設定画面のステータスが `ready` に切り替わることを確認する。
- [ ] 写真撮影 → `classifyStaticImage` → 推論結果が Review UI に表示されることを E2E で確認する。

### 受入基準
- Development ビルドで SettingsScreen に MediaPipe セクションが表示されること。
- Production ビルド（または feature flag オフ時）に MediaPipe セクションが表示されないこと。
- ダウンロード → 推論 → 結果表示の一連のフローが実機で動作すること。
- GGUF モデルの既存のダウンロード・推論フローに影響がないこと。

### ロールバック
SettingsScreen の MediaPipe セクションを削除すれば完全に元に戻る。

---

## Out of Scope

- iOS 対応。
- GGUF → MediaPipe へのデフォルトランタイム切替判断。
- `LABEL_MAPPING` の coarse class 対応（Normalizer 更新）。
- `installModelFiles` 自体の汎用化リファクタリング。
- MediaPipe モデルの再学習パイプライン改善。
