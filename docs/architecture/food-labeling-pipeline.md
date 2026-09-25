# Food Labeling Pipeline Architecture

## Overview
本ドキュメントは、Dining Memory App における「食事画像ラベル推論（Food Labeling）パイプライン」のアーキテクチャ仕様を定義します。
特に、現在運用されている「ローカル LLM (GGUF / llama.rn) を用いた汎用推論」と、新しく導入される「MediaPipe を用いた軽量・専用分類モデル（.task）」という**マルチランタイムの共存・段階的移行**を前提とした設計方針を記載します。

## 1. Multi-Runtime Architecture
アプリは複数の AI ランタイムを切り替えて利用できる構造（Strategy パターン相当）を持ちます。

### 1.1 GGUF Pipeline (Current)
- **Model**: Qwen2.5-VL-3B-Instruct (GGUF) + mmproj
- **Runtime**: `llama.rn` (C++ backend)
- **Characteristics**: 汎用性が高いが、モデルサイズが大きく（数GB）、メモリ消費と推論時間が大きい。
- **Status**: 現在のデフォルト (`local-runtime-prototype`)。

### 1.2 MediaPipe Pipeline (New)
- **Model**: Custom MediaPipe Image Classifier (`.task` file, 約 10~20MB)
- **Runtime**: `com.google.mediapipe.tasks.vision.imageclassifier` (Android Native) / iOS (Future)
- **Characteristics**: 食事分類に特化しており、軽量・高速。メモリ消費が極めて少ない。
- **Status**: 今回導入するが、当面は**Hidden Path（特定条件下でのみ利用可能なプロトタイプ）**とし、デフォルトランタイムとしては直ちに切り替えない。

---

## 2. Abstraction of Downloader Core (TS Layer)

既存のダウンローダー（`modelInstaller.ts`）は GGUF モデルの構成（Model + Projector）に密結合しています。これを汎用化し、MediaPipe などの単一ファイルモデルも透過的に扱えるようにします。

### 2.1 Downloader Interface
ダウンローダーは以下の汎用的な設定（`ModelConfig`）を受け取る設計とします。

```typescript
type ModelDownloadStrategy = 'single-file' | 'multi-file';

interface ManagedModelFile {
  key: string;
  url: string;
  targetFileName: string;
  expectedSha256?: string; // Phase 1 以降で検証用に追加
}

interface AIModelConfig {
  version: string;
  displayName: string;
  strategy: ModelDownloadStrategy;
  files: ManagedModelFile[];
}
```

### 2.2 AppSettingsService の分離（State Management）
GGUF と MediaPipe の状態を混同しないため、`AppSettingsService` のキーを分離します。

- 既存: `meal_input_assist_model_status` (GGUF用として継続利用、あるいは `gguf_model_status` へマイグレーション)
- 新設: `mediapipe_model_status` (MediaPipe用のステータス管理)

---

## 3. Native Layer Architecture (Android)

MediaPipe SDK (`BaseOptions.builder().setModelAssetPath(String)`) は、APK 内の `assets/` フォルダのファイルしか読み込めない制約があります。
これを回避し、オンデマンドでダウンロードしたローカルストレージ（`documentDirectory`）上のモデルを読み込むため、`MappedByteBuffer` を利用します。

### 3.1 MappedByteBuffer によるゼロコピー読み込み
`documentDirectory/ai-models/meal-classifier.task` を読み込む手順：

1. `FileInputStream(file).channel` を取得。
2. `channel.map(FileChannel.MapMode.READ_ONLY, 0, file.length())` で `MappedByteBuffer` を生成。
3. `BaseOptions.builder().setModelAssetBuffer(mappedBuffer)` にセット。

### 3.2 メモリライフサイクルと GC 戦略
Direct ByteBuffer は Java Heap 外の OS ページキャッシュを使用するため、不要になっても即座に GC されにくい問題があります。

- **リソース解放**: `classifyStaticImage` を実行するごとに Classifier をインスタンス化せず、可能であればキャッシュします。ただし、`invalidate()` などの Native Module ライフサイクル終了時、またはエラーリカバリ時には `imageClassifier.close()` を確実に呼び出し、関連するリソースへの参照を破棄してメモリリークを防ぎます。

---

## 4. UI / UX Integration (Hidden Path)

「直ちにデフォルトランタイムに切り替えない」という要件を満たすため、UI レイヤーでは以下の原則を守ります。

### 4.1 SettingsScreen への組み込み方針
一般ユーザーを混乱させないため、SettingsScreen 上に MediaPipe 用の巨大なダウンロードボタンを無造作に追加することは避けます。

- **アプローチ案**:
  1. 開発者向けトグル（Developer Settings）を設け、オンにした場合のみ MediaPipe モデルのダウンロードフローを表示する。
  2. あるいは、既存の AI 設定画面内で「GGUF（高精度・数GB）」と「MediaPipe（軽量・数十MB）」のオプションを明示的に分け、ユーザーが意図して「軽量モデル」を選ぶ UX とする（※プロダクトオーナーと要合意）。
- まずは UI に露出させず、TS 側のダウンロード用フック（`useMediaPipeInstaller` 相当）を用意するにとどめる設計を推奨します。

---

## 5. Security & Validation
1. **Hash Verification**: ダウンロードされた `.task` モデルの SHA256 を検証し、不完全なモデルのロードによるクラッシュ（`MappedByteBuffer` でのシグメンテーションフォールト等）を防止します。
2. **Atomic Swap**: ダウンロードは `.download-tmp` 拡張子で行い、完了とハッシュ検証が成功した瞬間に `ai-models/` の対象ファイル名へアトミックにリネーム（`replaceFile`）します。
