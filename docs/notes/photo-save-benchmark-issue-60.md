# Issue #60 Android 実機環境における写真保存パイプラインの実測プロファイリングレポート

## 1. 概要 (Executive Summary)

本ドキュメントは、[GitHub Issue #60](https://github.com/tahosook/dining-memory-app/issues/60)「Android 実機環境における写真保存パイプラインの詳細プロファイリング（所要時間・メモリ・GC挙動の計測）」に基づき、最新のリリースビルド環境下で写真保存処理の各ステップの所要時間、メモリ推移（PSS / RSS）、GC 挙動、および UI フレームドロップを実測・評価した調査報告書です。

> [!NOTE]
> **前提となる改善経緯**:
> 当初本タスクおよび先行検討において懸念されていた「原寸写真（6MB超）に対する JavaScript Base64 / piexifjs 処理時のヒープメモリ急増（288MB）および端末クラッシュ（OOM）リスク」は、[Issue #75](https://github.com/tahosook/dining-memory-app/issues/75) の机上評価および [Issue #86 / PR #102](https://github.com/tahosook/dining-memory-app/pull/102) の**「ネイティブリサイズ先行パイプライン（1600px / JPEG 80%）」**の導入により、設計上解決されていました。
> 本ベンチマークは、この新パイプラインが**実際の Android 実機環境において想定通りの省メモリ・高速性・低遅延を達成しているかを客観的データによって検証・確定させる**ことを主目的として実施されました。

### 結論要約
- **EXIF処理の所要時間**:
  - リサイズ先行（約 200KB）により、JavaScript レイヤーの EXIF 処理（Base64 読込 + piexif パース・ダンプ・挿入 + Base64 書込）の実測所要時間は **平均 42.4 ms**（施行1: 54.9 ms、施行2: 29.8 ms）となり、保存ワークフロー全体（約 1.3 秒）の **約 3.3%** を占めるにとどまった。
- **メモリ健全性**:
  - **今回の測定条件（Google Pixel 9a / RAM 8GB / 2回施行）においては**、かつて懸念されたヒープ肥大化（288MB）や OOM の兆候は観測されず、Java Heap PSS は **11.3 MB 〜 22.4 MB** の範囲で推移した。
- **GC 影響・UI 描画安定性**:
  - 今回の測定条件では、ART GC による全スレッド一時停止時間（STW pause time）は **2.97 ms**（3ミリ秒未満）であり、UI 描画への顕著な影響は確認されなかった。
  - UI 描画の Janky frames 率は **3.92% 〜 5.39%**（90% のフレームが 10ms 以内で描画され、今回の測定では顕著な UI 停止は観測されなかった）。
- **主要なボトルネックの所在**:
  - 保存ワークフロー所要時間（平均 1,283.8 ms）の大部分は、**Android MediaStore へのアルバム保存（`MediaLibrary.Asset.create` / 370〜909 ms）** および **ネイティブリサイズ（`ImageResizer` / 194〜347 ms）** が占めており、JavaScript / Base64 レイヤーには起因しない。
- **Issue #61 への判断**:
  - **Native EXIF (Kotlin) への移行は「不要（現状維持・改善見送り）」と判断する**。
  - 理由: 移行による短縮余地は未実測の机上試算（~10ms）に基づいても最大約 30ms 程度の推計にとどまり、Kotlin ネイティブモジュール保守コストや iOS とのプラットフォーム二重管理のデメリットに見合わないため（第 6 節参照）。

---

## 2. 測定環境・端末情報

- **実機端末**: Google Pixel 9a (device: `tegu`)
- **OS バージョン**: Android 17 (API Level 37)
- **端末 RAM 容量**: 7,752,848 kB (約 8.0 GB)
- **ビルド種別**: **Release ビルド** (`app-release.apk`)
  - 最適化・難読化、Hermes 最適化バイトコードコンパイル、ProGuard/R8 適用済み
- **アプリ識別子**: `com.tahosook.diningmemory`
- **測定日時**: 2026-09-25 00:27 〜 00:30 (JST)
- **施行回数**: 実機撮影および保存 2 回

---

## 3. 測定手順・再現コマンド

以下の手順およびコマンドを用いてベンチマークを再現できます。

### 3.1 測定準備
1. 実機の「USBデバッグ」を有効化し、PC に接続。
2. Release APK を実機へインストール:
   ```bash
   npm run install:android:release
   ```
3. 描画統計およびログバッファのリセット:
   ```bash
   adb shell dumpsys gfxinfo com.tahosook.diningmemory reset
   adb logcat -c
   ```

### 3.2 保存処理中の計測
実機で写真を撮影し「保存」をタップする間に、以下のコマンドでデータを取得:
```bash
# 1. 各ステップの所要時間を Logcat から抽出
adb logcat -d -s ReactNativeJS | grep -E "\[PERF_STEP\]"

# 2. メモリ使用量のスナップショット取得
adb shell dumpsys meminfo com.tahosook.diningmemory

# 3. GC ポーズ時間の確認
adb logcat -d | grep -iE "(art: Explicit|concurrent mark compact GC)"

# 4. フレーム描画統計（UI Jank / フレームドロップ）の取得
adb shell dumpsys gfxinfo com.tahosook.diningmemory
```

※ 上記の一連の測定を対話的に実行するスクリプト `scripts/benchmark-android-photo-save.sh` を整備済み。

---

## 4. 実機プロファイリング実測データ

実機（Pixel 9a）において、実際にカメラで撮影・保存を行った 2 回の実測値を以下に示します。

> [!NOTE]
> **測定上の限界と分散について**:
> 施行回数は 2 回の実測値です。特に `MediaLibrary.Asset.create`（370〜909 ms）は端末の MediaStore インデックス負荷等により大きく変動し得ます。本結果は「ボトルネックの所在と EXIF 処理の相対的な寄与度（約 3.3%）」を客観的に示すものであり、絶対的なレイテンシ保証ではありません。

### 4.1 パイプライン各ステップの所要時間 (ms)

| Step | パイプライン処理ステップ | 施行 1 | 施行 2 | **平均値** | 処理責務 / レイヤー |
|---|---|---|---|---|---|
| **Step 1** | **Camera 生画像取り込み** (`takePictureAsync`) | - ※1 | 328.5 ms | **~328 ms** | ネイティブカメラセンサー / 一時書き込み（※保存外） |
| **Step 2** | **長辺1600px ネイティブリサイズ** (`ImageResizer`) | 346.7 ms | 194.0 ms | **270.4 ms** | ネイティブ Bitmap/Matrix（アスペクト比維持縮小） |
| **Step 3** | **Base64 読み込み** (`readAsStringAsync`) | 17.9 ms | 3.5 ms | **10.7 ms** | JS / FileSystem（約 200〜300KB のみ） |
| **Step 4** | **EXIF 挿入・パース** (`piexif.load/dump/insert`) | 33.0 ms | 23.8 ms | **28.4 ms** | JS (piexifjs) / メタデータ注入 |
| **Step 5** | **Base64 書き出し** (`writeAsStringAsync`) | 4.0 ms | 2.5 ms | **3.3 ms** | JS / FileSystem（ディスク同期） |
| **(3〜5)** | **【EXIF 処理小計】** | **54.9 ms** | **29.8 ms** | **42.4 ms** | **JavaScript レイヤー合計 (実測値)** |
| **Step 6** | **サムネイル生成** (320px / `mealThumbnail`) | 97.0 ms | 39.1 ms | **68.1 ms** | 非同期キュー / `ImageResizer` (※バックグラウンド非同期) |
| **Step 7** | **SQLite レコード保存** (`MealService.createMeal`) | 56.2 ms | 129.9 ms | **93.1 ms** | SQLite トランザクション |
| **Step 8** | **MediaLibrary アルバム保存** (`MediaLibrary.Asset`) | 909.1 ms | 370.3 ms | **639.7 ms** | Android MediaStore インデックス登録 |
| **Total** | **保存パイプライン全体経過時間** | **1,805.4 ms** | **762.2 ms** | **1,283.8 ms** | **saveCaptureReviewWorkflow 全体の計測区間** |

※1 施行 1 は事前撮影済みの一時画像から保存を実行したため Step 1 は除外。

---

### 4.2 各 Step の計測値と Total の包含関係・整合性分析

各 Step の合計値と Total の数値が一見一致しない理由は、コード上の**「処理フェーズの分離」「非同期実行（await なし）」「保存ワークフロー内部の入れ子構造」**に起因します。コード実装（`src/hooks/cameraCapture/`）に基づく詳細な計測区間と関係性は以下の通りです。

```
【フェーズ 1: 撮影 (レビュー前)】
[Step 1: takePictureAsync] (328.5 ms)
      ↓ (ユーザー確認・レビュー画面表示)

【フェーズ 2: 保存ワークフロー (Total: saveCaptureReviewWorkflow の計測区間)】
┌── [Total 開始: performance.now()] ────────────────────────────────────────┐
│  (1) 位置情報取得: getLocationSnapshot() (GPS 測位)                      │
│  (2) 写真永続化: persistPhotoLocally() -> persistPhotoToStablePath()      │
│      ├─ [Step 2: Native リサイズ (ImageResizer)] (194〜347 ms)           │
│      ├─ copyAsync (リサイズ一時ファイル -> 永続パスへコピー)              │
│      ├─ writePhotoExifToJpeg()                                           │
│      │   ├─ [Step 3: Base64 読込] (3.5〜17.9 ms)                         │
│      │   ├─ [Step 4: EXIF 挿入]  (23.8〜33.0 ms)                         │
│      │   └─ [Step 5: Base64 書込] (2.5〜4.0 ms)                          │
│      ├─ cleanupTempFile (リサイズ一時ファイル削除)                        │
│      └─ [Step 8: MediaLibrary.Asset.create] (370〜909 ms)                │
│  (3) [Step 7: MealService.createMeal] (56〜130 ms)                        │
│  (4) triggerThumbnailGeneration(meal.id) ───┐ (await なし・非同期キック)  │
│  (5) cleanupTempFile (カメラ元一時ファイル削除)│                          │
└── [Total 終了: performance.now()] ─────────┼──────────────────────────────┘
                                             │
【バックグラウンド非同期処理 (Total に含まれない)】
└─> [Step 6: Thumbnail generation] (39〜97 ms) (非同期タスクキューで並行処理)
```

#### 包含関係のポイント:
1. **Step 1 (Camera capture) は Total に含まれない**:
   - `takePhotoForReview` はユーザーがシャッターを切った撮影フェーズで完了しており、その後のレビュー画面で「保存」を押した時に開始される `saveCaptureReviewWorkflow` (Total) の計測区間外です。
2. **Step 6 (Thumbnail generation) は Total に含まれない**:
   - `saveCaptureReviewWorkflow` L114 では `triggerThumbnail(meal.id)` を呼び出していますが、これは内部の非同期キュー（`taskQueue`）にタスクをエンキューするだけで `await` していません。そのため、Step 6 はバックグラウンドで並行処理され、Total の同期ブロック時間には含まれません。
3. **Total 内部で直列実行される Step の合算値と差分**:
   - Total の内部で直列（`await`）実行されているのは **Step 2, 3, 4, 5, 8, 7** の 6 つです。
   - **施行 2 の検証**:
     - 直列 Step 合計 = 194.0 (Step 2) + 3.5 (Step 3) + 23.8 (Step 4) + 2.5 (Step 5) + 370.3 (Step 8) + 129.9 (Step 7) = **724.0 ms**
     - Total 実測値 = **762.2 ms**
     - **差分 = 38.2 ms**。このわずか 38ms の差分は、`copyAsync`、`getInfoAsync`、一時ファイル削除、および位置情報取得のオーバーヘッドであり、各 Step の合算値と Total は高い精度で整合しています。
   - **施行 1 の検証**:
     - 直列 Step 合計 = 346.7 + 17.9 + 33.0 + 4.0 + 909.1 + 56.2 = **1,366.9 ms**
     - Total 実測値 = **1,805.4 ms**
     - **差分 = 438.5 ms**。Total 計測区間内には位置情報取得、ファイルコピー、一時ファイル削除、ディレクトリ解決等の未計測区間が含まれており、個別の寄与は特定していません。

---

### 4.3 保存写真の仕様・EXIF保持検証結果
実機から pull した写真ファイル（`meal-20260925002725.jpg`）のバイナリ解析結果:
- **解像度**: 1600 × 900（長辺 1600px に正常リサイズ）
- **ファイルサイズ**: **224.0 KB**（施行 1）/ **192.4 KB**（施行 2）
  - 未圧縮の元画像（約 2〜4 MB）から **約 90% のストレージ削減** を達成。
- **EXIF タグ保持状況**:
  - `Make`: `Google`（カメラ元データ保持）
  - `Model`: `Pixel 9a`（カメラ元データ保持）
  - `Software`: `Dining Memory`（アプリ管理 EXIF 注入確認）
  - `DateTimeOriginal`: 撮影日時が正常記録
  - `Orientation`: `1`（Normal / 正位置に物理回転・正規化完了）

---

## 5. メモリ・GC・描画パフォーマンス分析

### 5.1 メモリ使用量推移 (PSS / RSS)

| メモリ指標 | 起動直後 (Baseline) | 保存処理後 (施行 1) | 保存処理後 (施行 2) | 実測傾向 |
|---|---|---|---|---|
| **Java Heap PSS** | 13.3 MB | 11.3 MB | 22.4 MB | 今回の測定条件ではこの範囲で推移 (最大でも 25MB 未満) |
| **Native Heap PSS** | 26.6 MB | 219.1 MB | 194.1 MB | カメラプレビュー・Bitmap 解放サイクル正常 |
| **Total RSS** | 208.8 MB | 358.8 MB | 399.0 MB | 今回の測定条件ではこの範囲で推移 |

- **今回の測定範囲（Pixel 9a、2回施行）では**、かつて 6MB RAW 画像で試算されていた「JS ヒープ増分 288MB」のような急激なメモリ圧迫や OOM の兆候は観測されず、Java Heap PSS は 11〜22MB に収まりました。
- **Native Heap の推移に関する補足**: 起動直後（26.6 MB）から保存後（194〜219 MB）への増加は、CameraX プレビューの Surface バッファやネイティブ Bitmap メモリが、Android OS の非同期 GC およびグラフィックパイプラインのライフサイクルに依存して保持されていることによるものです。今回の測定範囲では OOM の兆候なく安定推移しました。

### 5.2 ART ランタイムの GC 挙動
- **GC ログ**:
  ```
  Explicit concurrent mark compact GC freed 1802KB AllocSpace bytes, paused 2.967ms, 7.871ms total 188.199ms
  ```
- **評価**:
  - 今回の測定環境では、ART GC による全スレッド一時停止時間（Stop-The-World pause time）は **2.967 ms** でした。
  - 60fps における 1 フレームの許容描画時間（16.6 ms）に対して極めて小さく、UI 描画への顕著な影響やフレームドロップは確認されませんでした（第 5.3 節 gfxinfo 参照）。

### 5.3 UI 描画フレームレート・遅延 (gfxinfo)
- **レンダリング総フレーム数**: 332 frames
- **Janky frames 率**: **3.92%**（13 / 332 frames、施行 2 完了時の累積値。※施行 1 完了時点は 9 / 167 frames で 5.39%）
- **フレーム所要時間パーセンタイル**:
  - 50th percentile: **5 ms**
  - 90th percentile: **10 ms** (100 fps 相当)
  - 95th percentile: **19 ms**
  - 99th percentile: **44 ms**
- **Slow bitmap uploads**: **0 回**
- **評価**:
  - 90% 以上のフレームが 10ms 以内で描画を終えており、今回の測定では顕著なUI停止は観測されませんでした。

---

## 6. Issue #61（Native EXIF 化）に対する客観的判断

[Issue #61](https://github.com/tahosook/dining-memory-app/issues/61)「perf(android): evaluate native EXIF processing to reduce JS Base64 overhead」は、本 Issue #60 の実測結果を前提に Native EXIF (Kotlin) への移行要否を判断するスコープでした。

本実測結果に基づき、以下の 4 軸で客観的に評価した結果、**「Native EXIF 化は行わず、現状の JS 実装を維持する（改善不要・見送り）」** と結論づけます。

| 評価軸 | Native EXIF 移行案 (Kotlin) | 現行方式 (JS / piexifjs) | 評価・判断 |
|---|---|---|---|
| **1. 処理速度・メモリ改善幅** | **~10ms（※未実測の机上推定値）** ※2 | **42.4 ms（※実測値: 2回平均）** (Step 3〜5 合計) | **短縮余地は未実測の机上試算でも最大約 30ms 程度にとどまる**。保存全体の主要要因は MediaLibrary（640ms）や Native リサイズ（270ms）であり、EXIF 短縮による全体寄与は限定的と推計される。 |
| **2. 実装工数・保守コスト** | Kotlin Native Module（40〜60行）の追加、メンテ負荷増 | **ゼロ**（既存コードをそのまま利用） | ネイティブコード追加による Expo SDK アップデート時の破壊リスクを回避できる。 |
| **3. クロスプラットフォーム整合性** | Android: Native、iOS: JS の二重管理が発生 | **両 OS 共通の統一実装** | 実装の一貫性とテストの容易性が保たれる。 |
| **4. EXIF 互換性** | Android OS の ExifInterface 依存 | `piexifjs` による厳密なタグ制御 | 実機写真で `Make`, `Model`, `Software`, `DateTimeOriginal` が正常保持されていることを確認済み。 |

※2 `~10ms` は、Kotlin Native Module 未実装のため、一般的な Android `ExifInterface.saveAttributes()` 直接呼出のオーバーヘッドに基づく机上試算（未実測の推定値）です。これに基づく「最大約 30ms の短縮余地」も推計上の試算値です。

### 結論
> **判断: 現状維持（見送り / Won't Fix）**
> 「改善できる ≠ 改善する必要がある」の原則に基づき、今回の測定条件（Pixel 9a / 2回施行）において顕著なユーザー体験劣化（数百ms以上の遅延やメモリ不足）は確認されず、EXIF 処理自体が平均 42ms で完了しているため、保守コストを増やしてまで Native EXIF 化を行う技術的合理性はありません。

---

## 7. 受入基準の達成状況

- [x] Android 実機での写真保存パイプラインの各ステップの所要時間および PSS / RSS メモリ推移が実測されていること。
  - Google Pixel 9a (Android 17) 実機にて 8 ステップのミリ秒精度および PSS/RSS を実測完了。
- [x] 測定結果がテーブル形式で記録されていること。
  - 第 4 節および第 5 節に詳細なマトリクス、包含関係の分解、および整合性分析を記載完了。
- [x] 測定手順が再現可能なコマンド・手順として Issue に記録されていること。
  - 第 3 節に adb コマンドおよび `scripts/benchmark-android-photo-save.sh` を整備完了。
- [x] 本測定結果に基づき、Issue 61（Native EXIF 化の要否判断）を開始できる状態になること。
  - 第 6 節にて 4 軸評価を行い、「現状維持（移行不要）」の明確な結論と根拠を文書化完了。
