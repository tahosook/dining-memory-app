# Issue 13: MediaPipe Remote Model Pipeline 導入タスク仕様

## Overview
本 Issue は、MediaPipe 食事分類モデル（`.task`）のアプリ非同梱化・オンデマンドダウンロード・ローカルファイル推論を実現するための実装タスクリストです。
現在の GGUF モデル用ダウンロード基盤と密結合しているコードをリファクタリングし、「マルチランタイム」として MediaPipe が安全に共存・稼働できるアーキテクチャを実現します。

## Prerequisites
- 実行する開発者は `docs/architecture/food-labeling-pipeline.md` を必ず事前に読むこと。
- 「MediaPipe はあくまで Hidden Path であり、直ちにデフォルトランタイムに切り替えない」という原則を遵守すること。

---

## Phase 1: ダウンロード基盤の抽象化（TS層リファクタリング）
既存の `modelInstaller.ts` は GGUF (Model + Projector) に強く依存しているため、汎用化します。

- [ ] `src/ai/mealInputAssist/types.ts` 等に、複数モデルのダウンロード設定を抽象化する `AIModelConfig` インターフェースを定義する。
- [ ] `modelInstaller.ts` 内の `installModelFiles` 関数をリファクタリングし、ハードコードされた `getMealInputAssistManagedFiles()` への依存を排除する。
  - 引数で `ManagedFile[]` や `AIModelConfig` を受け取るようにし、単一ファイル（MediaPipe）と複数ファイル（GGUF）の両方で使い回せる「汎用ダウンローダー Core」として再構築する。
- [ ] 既存の GGUF モデルダウンロード機能が壊れていないか、テストまたは手動動作確認を行う。

## Phase 2: MediaPipe モデルの状態管理とダウンローダー追加
`AppSettingsService` を拡張し、GGUF と競合しない MediaPipe 専用のステータス管理とインストーラーを実装します。

- [ ] `AppSettingsService.ts` に MediaPipe 用のステータスキー（例: `mediapipe_model_status`, `mediapipe_model_version` 等）を新設する。
- [ ] `MediaPipeModelConfig` を定義し、GitHub Releases 等から `.task` モデルをダウンロードするための URL とハッシュを記述する。
- [ ] Phase 1 で作った汎用ダウンローダー Core を用いて、`installMediaPipeModel()` と状態取得関数 `getMediaPipeModelStatus()` を実装する。
  - 保存先は GGUF と同じく `documentDirectory/ai-models/` 配下とする（ファイル名で区別）。

## Phase 3: Android Native の MappedByteBuffer 対応とメモリ管理
Android ネイティブブリッジ（`MediaPipeMealInputAssistModule.kt`）において、Asset バンドルからの読み込み制約を突破します。

- [ ] `MediaPipeMealInputAssistModule.kt` に、ローカルファイル（`documentDirectory/ai-models/meal-classifier.task` 等）の絶対パスを受け取る口を用意する。
- [ ] `FileInputStream(file).channel.map(...)` を用いてファイルを `MappedByteBuffer` に展開し、`BaseOptions.builder().setModelAssetBuffer(mappedBuffer)` を呼び出すロジックを実装する。
- [ ] **[重要]** リソースリークを防ぐため、`invalidate()` メソッドや例外発生時など、適切なタイミングで `ImageClassifier` の `close()` を呼び出し、バッファの参照を切るメモリライフサイクル管理を実装する。
- [ ] 既存の `assets/` から読み込むテスト用のモック処理を撤廃（またはフォールバックとして隔離）する。

## Phase 4: UI 統合・検証（Hidden Path）
一般ユーザーの体験を壊さず、開発時のみ MediaPipe をテスト・利用できる導線を用意します。

- [ ] `SettingsScreen.tsx` (または開発者向け設定画面) に、MediaPipe モデルのダウンロードステータスとインストールボタンを追加する。
  - ※UI への表示条件はプロダクト側の要件に合わせる（環境変数で隠す、あるいは Developer Mode オン時のみ表示するなど）。
- [ ] 実際にダウンロードを行い、正常に保存され、設定画面のステータスが `ready` に切り替わることを確認する。
- [ ] 写真を撮影し、Native モジュール経由で推論が正しく実行される（`MappedByteBuffer` がシグメンテーションフォールト等を起こさない）ことを実機・エミュレータで確認する。

---
**Note:** 本 Issue 完了後、既存の GGUF と MediaPipe のどちらをデフォルトのランタイムとして運用するかは、パフォーマンス検証後に別 Issue で決定します。
