# [Investigation] 孤立写真削除のチャンク化 — 再開条件の定義

- **対応 GitHub Issue**: GitHub Issue #239
- **関連 PR**: PR #210
- **関連 Issue**: GitHub Issue #88（孤立写真ファイル回収とファイルライフサイクル保護）
- **対象ソース**: `src/media/photoLifecycle.ts` (`cleanupOrphanedPhotoFiles`)
- **ステータス**: 保留 / 将来トリガー待ち評価 (Later)

## 1. 概要
PR #210（孤立写真クリーンアップ処理のチャンク化・バッチ分割）のクローズ理由と現行実装の安全設計を踏まえ、将来的なデータ肥大化や大量ファイル蓄積時に本最適化を安全に再開・着手するための必須条件と客観的証拠（Evidence）の基準を定義・記録します。

## 2. 背景と PR #210 のクローズ理由
PR #210 では、`src/media/photoLifecycle.ts` の `cleanupOrphanedPhotoFiles` における逐次 `for` ループを、`Promise.allSettled` によるチャンク並列化（上限25件）に置き換える変更が提案されました。しかし以下の重大な懸念によりクローズされました：

1. **レースコンディション発生窓の拡大による誤削除リスク**:
   - 孤立写真削除で最優先されるべきは「直前に保存された正規の写真や生成中のサムネイルを誤削除しない安全性」である。
   - チャンク化によって最新参照確認（`getReferencedPhotoPaths()` / `getInFlightThumbnailProtectionSet()`）をチャンク先頭に集約すると、並列削除の実行中に新規撮影写真が保存されたり非同期サムネイルが生成された場合に、それらを誤って削除してしまうレースコンディションの危険期間（時間窓）が拡大する。
2. **実運用のデータ規模との乖離**:
   - 通常運用時において発生する孤立写真は、アプリの異常終了や保存失敗時の残骸など「数件程度」である。
   - PR #210 で提示された「1,000件のシミュレーション数値（1175ms -> 54ms）」は、架空の大量ファイル条件における机上数値であり、実環境の実態に即したボトルネックの証拠とは言えない。
3. **削除判定の安全性証明テストの欠落**:
   - DB に存在する有効写真、論理削除写真、保存中の一時ファイル、非同期生成中（in-flight）サムネイル、真の孤立ファイルを正確に区別し、正当なファイルを誤削除しないことを証明する単体テストが不足していた。
4. **中断・再開に対する耐性（冪等性）の未検証**:
   - チャンク処理の途中でアプリがバックグラウンド退行または強制終了された場合の整合性や再開安全性が考慮されていなかった。

## 3. 現行実装の安全設計 (`src/media/photoLifecycle.ts`)
現行の `cleanupOrphanedPhotoFiles` は以下の 3段階保護チェックを **各ファイルの削除直前に逐次実行** しています：

```typescript
// 1. 早期スキップ: ループ開始前の DB 参照スナップショットによる除外
if (dbReferenced.has(fileName) || dbReferenced.has(uri)) {
  skippedFileNames.push(fileName);
  continue;
}

// 2. 最新 DB 参照の再取得: 削除直前に実 DB から最新状態を取得し、scan 後〜delete 直前に参照された写真を保護
const latestReferenced = await getReferencedPhotoPaths(options);
if (latestReferenced.has(fileName) || latestReferenced.has(uri)) {
  skippedFileNames.push(fileName);
  continue;
}

// 3. 最新 in-flight サムネイル状態の確認: Issue #102 非同期タスクとの競合を防止
const currentInFlight = getInFlightThumbnailProtectionSet();
if (currentInFlight.has(fileName) || currentInFlight.has(uri)) {
  skippedFileNames.push(fileName);
  continue;
}

await deleteAsync(uri, { idempotent: true });
```

この逐次設計により、写真保存・サムネイル生成との競合が完全に排除されています。

## 4. 再開・着手の受入基準（Acceptance Criteria）
以下の条件が客観的証拠（Evidence）とともにすべて満たされない限り、本最適化の実装 PR は作成しません：

- [ ] **誤削除防止テストの完備**:
  - DB 内の有効な写真レコード、論理削除（`is_deleted = 1`）レコード、保存中の一時ファイル、非同期生成中（in-flight）サムネイル、真の孤立ファイルを正確に区別し、正当な写真が絶対に誤削除されないことを保証する単体テストが完備されていること。
- [ ] **実環境での大量データ実測データ（実機プロファイリング）**:
  - 実機（低スペック Android 端末を含む）において、通常想定を超える孤立写真（例: 500〜1,000件）が存在する場合に、現行の逐次処理がどの程度の UI Jank、メインスレッド停止、またはメモリ枯渇を引き起こすかの実測プロファイルデータが存在すること。
- [ ] **レースコンディション防止アーキテクチャの証明**:
  - 並列・チャンク化を行っても、各ファイルの削除直前保護判定が失われないこと、または並行書き込みと排他制御（ロック・ミューテックス等）が破綻しない論理的・構造的証明があること。
- [ ] **中断・再開に対する耐性（冪等性）の検証**:
  - チャンク削除処理の途中でアプリ終了・キル・クラッシュが発生してもファイルシステムや DB 状態に不整合が生じず、次回実行時に安全に再開できることがテストで検証されていること。
