# [AI/Native] MediaPipe 食事分類モデルのリモートオンデマンド配布・端末内ローカル読み込みパイプライン

- **内部ドキュメントID**: issue-13
- **対応 GitHub Issue**: 未起票
- **ステータス**: 未着手 (Open)
- **参照アーキテクチャ仕様書**: [docs/architecture/food-labeling-pipeline.md](../architecture/food-labeling-pipeline.md)
- **関連ファイル**:
  - `android/app/src/main/java/com/tahosook/diningmemory/MediaPipeMealInputAssistModule.kt`
  - `android/app/src/main/java/com/tahosook/diningmemory/MediaPipeMealInputAssistSupport.kt`
  - `android/app/src/test/java/com/tahosook/diningmemory/MediaPipeMealInputAssistSupportTest.kt`
  - `src/ai/mealInputAssist/modelConfig.ts`
  - `src/ai/mealInputAssist/modelInstaller.ts`
  - `src/ai/mealInputAssist/mediapipeStaticImageProvider.ts`
  - `src/hooks/cameraCapture/useMealInputAssist.ts`
  - `src/screens/SettingsScreen/SettingsScreen.tsx`
- **関連ドキュメント**:
  - [docs/architecture/tech-spec.md](../architecture/tech-spec.md)
  - [docs/engineering/food-labeling-guidelines.md](../engineering/food-labeling-guidelines.md)
  - [docs/engineering/mediapipe-labeling-workflow.md](../engineering/mediapipe-labeling-workflow.md)

---

## 1. 目的
MediaPipe 食事分類モデル（`.task`）をアプリバイナリに同梱せず、GitHub Releases 等のリモートストレージから端末内ローカルストレージへオンデマンドで安全にダウンロードし、Android Native Module がローカルファイルパス（`MappedByteBuffer`）から直接ロードして静的画像推論を行うパイプラインを実装する。

これにより、APK/AAB サイズの肥大化を防ぎ、モデルの独立した改善・更新を可能にするとともに、モデル未導入時でも手動入力・保存を一切妨げない堅牢なフォールバック機構を提供する。

---

## 2. 背景と技術的課題（事前調査・コード突合結果）

1. **Native Module 層のローカルパス読み込み制約**:
   - 現在の `MediaPipeMealInputAssistModule.kt` は `BaseOptions.builder().setModelAssetPath(...)` を使用しているが、これは Android の `assets/` フォルダ専用である。
   - 端末ローカルストレージ上のモデルを読み込むには、`FileInputStream` から `FileChannel.map` を用いて `MappedByteBuffer` を作成し、`setModelAssetBuffer(...)` を利用する形へ書き換える必要がある。
2. **モデル配布と完全性検証の欠如**:
   - リポジトリに `.task` をコミットしない方針のため、リモート（GitHub Releases）からのダウンロード機能および SHA256 ハッシュ検証が必要である。
3. **UI / フックの未接続**:
   - `SettingsScreen` で MediaPipe モデルの管理（ダウンロード / 削除 / 状態表示）ができず、モデル未導入時に撮影画面で不要なエラーや混乱が生じないよう、適切なフォールバック表示と安全弁を設ける必要がある。

---

## 3. 実装タスク（Phased Implementation Tasks）

### Phase 1: Android Native Module のローカルパス読み込み対応（Kotlin）
- [ ] `android/app/src/main/java/com/tahosook/diningmemory/MediaPipeMealInputAssistSupport.kt`:
  - [ ] `resolveLocalModelPath(modelUriOrPath: String): String?` を実装し、`file://` スキームおよび絶対パスを正規化・検証する。
  - [ ] モデル不在・読み込み失敗時の理由文字列生成関数（`buildModelMissingReason(path)`, `buildModelLoadFailedReason(path, message)`, `buildInvalidModelPathReason(path)`）を追加する。
- [ ] `android/app/src/main/java/com/tahosook/diningmemory/MediaPipeMealInputAssistModule.kt`:
  - [ ] `@ReactMethod fun getClassifierStatus(modelPath: String?, promise: Promise)` を追加またはシグネチャを改修し、指定ローカルパスのモデル有効性を非同期チェックする。
  - [ ] `@ReactMethod fun classifyStaticImage(photoUri: String, modelPath: String, promise: Promise)` へシグネチャを改修し、`modelPath` を受け取る。
  - [ ] `ensureClassifier(modelPath: String)` を実装:
    - [ ] `resolveLocalModelPath` でパスを検証。
    - [ ] `File(modelPath).exists()` を確認し、存在しない場合は `FileNotFoundException` をスロー。
    - [ ] 既に同一パスで作成済みの `ImageClassifier` があれば再利用し、異なるパスが渡された場合は `classifier?.close()` して再生成。
    - [ ] `FileInputStream(file).channel.map(FileChannel.MapMode.READ_ONLY, 0, file.length())` で `MappedByteBuffer` を生成し、`BaseOptions.builder().setModelAssetBuffer(mappedBuffer)` を設定。
  - [ ] エラーコード体系を整備:
    - [ ] `E_INVALID_MODEL_PATH`
    - [ ] `E_MODEL_MISSING`
    - [ ] `E_MODEL_LOAD_FAILED`
- [ ] `android/app/src/test/java/com/tahosook/diningmemory/MediaPipeMealInputAssistSupportTest.kt`:
  - [ ] `resolveLocalModelPath` の正常系・異常系単体テストを追加。
  - [ ] エラーメッセージ生成の JVM 単体テストを追加。

### Phase 2: TS層モデルインストーラー ＆ ダウンロード基盤統合
- [ ] `src/ai/mealInputAssist/modelConfig.ts`:
  - [ ] `MEDIAPIPE_MEAL_INPUT_ASSIST_MODEL_CONFIG` 定数を追加（バージョン、URL、ファイル名、SHA256ハッシュ等）。
  - [ ] `resolveMediaPipeModelPath(): string | null` を追加。
- [ ] `src/ai/mealInputAssist/modelInstaller.ts`:
  - [ ] MediaPipe モデル用のダウンロード関数 `installMediaPipeModel(options?)` を追加（`createDownloadResumable` を使用）。
  - [ ] ダウンロード完了時の SHA256 ハッシュ検証ロジックを実装。
  - [ ] `replaceFile` によるアトミックな配置と、エラー時の一時ファイルクリーンアップ。
  - [ ] `getMediaPipeModelStatus(): Promise<MealInputAssistModelStatus>` を実装（ファイル存在確認、DBステータス確認）。
  - [ ] `deleteMediaPipeModel(): Promise<void>` を実装。
- [ ] `src/database/services/AppSettingsService.ts`:
  - [ ] MediaPipe モデル用のステータス管理キー（または汎用モデル状態カラム）の追加・永続化。
- [ ] 単体テスト（Jest）の作成・拡充:
  - [ ] `tests/modelInstaller.test.ts`（MediaPipe モデルのダウンロード・検証・配置・ステータス取得テスト）。

### Phase 3: 推論フックの結合 ＆ 未導入時フォールバック・Settings UI
- [ ] `src/ai/mealInputAssist/mediapipeStaticImageProvider.ts`:
  - [ ] `MediaPipeMealInputAssistNativeModule` インターフェースの型定義を `modelPath` 引数対応に更新。
  - [ ] `getMediaPipeStaticImageAvailability()` においてローカルモデルの存在を確認し、未ダウンロード時は `kind: 'unavailable'`, `code: 'model_unavailable'` を返す。
  - [ ] `MediaPipeStaticImageNativeModuleClassifier.classifyStaticImage` に `modelPath` を渡し、Native Module を呼び出す。
- [ ] `src/screens/SettingsScreen/SettingsScreen.tsx`:
  - [ ] AI入力補助設定セクションに「MediaPipe 食事分類モデル」のカード・状態表示を追加。
  - [ ] 「モデルをダウンロード」「再ダウンロード」「モデルを削除」のアクションボタンおよびプログレスバーを配置。
- [ ] `src/hooks/cameraCapture/useMealInputAssist.ts` & `MealInputAssistSection.tsx`:
  - [ ] モデル未ダウンロード時は「設定画面からモデルをダウンロードしてください」と適切にガイダンスを表示。
  - [ ] 手動入力および保存操作を決してブロックしないことを確認。

### Phase 4: 検証・テスト ＆ ドキュメント同期
- [ ] JVM 単体テストの実行・パス確認:
  - [ ] `cd android && ./gradlew testDebugUnitTest`
- [ ] Jest 単体テスト・結合テストの実行・パス確認:
  - [ ] `npm test`
- [ ] 型チェックおよび Lint チェック:
  - [ ] `npx tsc --noEmit`
  - [ ] `npm run lint`
- [ ] ドキュメント整合性ガードレール検証:
  - [ ] `node scripts/check-docs.cjs`
- [ ] プロジェクト進捗・タスクドキュメントの同期:
  - [ ] `docs/product/progress.md` の更新
  - [ ] `TASKS.md` の更新

---

## 4. 受入基準（Acceptance Criteria）

- [ ] **Native ローカル読み込み**:
  - [ ] Android Native Module が、端末内ローカルストレージ（`documentDirectory/ai-models/` 配下等）に配置された `.task` ファイルを `MappedByteBuffer` 経由で安全に読み込み、クラッシュなく推論を実行できること。
  - [ ] モデルパスが無効、またはファイルが存在しない場合に適切なエラーコード（`E_INVALID_MODEL_PATH`, `E_MODEL_MISSING`）が返ること。
- [ ] **リモートオンデマンドダウンロード**:
  - [ ] アプリ本体バイナリ（APK）内に `.task` ファイルを含めずとも、指定されたリモート URL（GitHub Releases 等）からバックグラウンドでダウンロードできること。
  - [ ] ダウンロード完了時に SHA256 チェックサムの照合が行われ、改ざんや破損ファイルを検出して破棄できること。
  - [ ] ダウンロード完了後、アトミックに所定のローカルパスへ配置されること。
- [ ] **UI 安全弁・フォールバック**:
  - [ ] モデルが端末内に存在しない状態でも、撮影画面や確認画面（Capture Review）でアプリがクラッシュせず、正常に手動保存できること。
  - [ ] 設定画面（SettingsScreen）からモデルのダウンロード、進捗確認、および削除操作が行えること。
- [ ] **品質・規約準拠**:
  - [ ] JVM 単体テストおよび Jest テストがすべてグリーンであること。
  - [ ] `node scripts/check-docs.cjs` のドキュメント整合性チェックをパスすること。
  - [ ] 既存の AI 原則（manual save を妨げない、余計な AI メタデータを永続化しない）を完全に遵守していること。
