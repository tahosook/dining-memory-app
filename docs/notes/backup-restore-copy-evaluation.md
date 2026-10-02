# [Evaluation] バックアップ復元時の写真コピー並列化 — 再開条件と技術的評価

- **対応 GitHub Issue**: GitHub Issue #229
- **内部ドキュメント**: [docs/issues/issue-14-backup-restore-concurrency-criteria.md](../issues/issue-14-backup-restore-concurrency-criteria.md)
- **関連 PR**: PR #220
- **対象ソース**: `src/database/services/BackupService.ts` (`restoreFromZip`)
- **ステータス**: 保留 / 将来トリガー待ち評価 (Later)

## 1. 概要
PR #220（バックアップ復元時の写真コピー並列化）の事後レビューおよびクローズ判断に基づき、写真コピー処理の並列化・チャンク化を安全に再開・着手するために満たすべき必須条件と客観的証拠（Evidence）の基準を定義・記録します。

## 2. 背景と PR #220 のクローズ理由
PR #220 では、`src/database/services/BackupService.ts` の `restoreFromZip` における写真展開ループ（`uniquePhotosToRestore`）を、`for...of` による逐次コピーから `Promise.allSettled` によるチャンク並列実行（concurrency: 25）に置き換える変更が提案されました。しかし以下の重大な理由によりクローズされました：

1. **ロールバック整合性・フェイルファスト検証テストの欠落**:
   - チャンク内の一部コピー失敗時（例: 25件中10件目でファイル書き込みエラー発生）において、同一チャンク内の成功ファイルのみが漏れなくロールバック（削除）対象として追跡されるか、後続チャンクの処理が確実に中断されるかを検証する単体テストが一切存在しなかった。
   - バックグラウンドでの遅延書き込み（lingering writes）が残存し、ロールバック完了後のファイルシステムを後から汚染しないことの検証が不足していた。
2. **人工的シミュレーション値（モック遅延）の不適格性**:
   - 提示された性能改善（1479ms -> 273ms, 約81%短縮）は、Expo FileSystem の `getInfoAsync`（2ms）、`copyAsync`（10ms）という人工的なタイマーモックを用いたシミュレーションスクリプトによるものであり、実端末・実ファイルシステムでの実測根拠ではなかった。
3. **モバイル端末におけるリソース過負荷・EMFILE 枯渇リスク**:
   - 低スペック Android 端末やモバイル環境において、大容量写真ファイル（数MB）の非同期コピーを 25 並列で同時発火させると、ネイティブブリッジの過負荷、ファイル記述子（EMFILE）枯渇、OS レベルの I/O スロットリング、メモリ急増（OOM）のリスクを伴う。
4. **元の sequential 設計意図を覆す安全性の検証不足**:
   - 元のコードに明記されていた設計意図（`Must remain sequential to guarantee fail-fast behavior without lingering background writes`）は、データ損失や不整合を絶対に許容しないバックアップ復元基盤の安全哲学に基づいている。これを覆すに足る客観的証拠および安全性の検証が不十分であった。

## 3. 現行実装の安全設計 (`src/database/services/BackupService.ts`)
現行の `restoreFromZip` における写真展開処理は、フェイルファストと厳密なロールバックを保証するため、あえて逐次処理として実装されています：

```typescript
// 2. Copy all verified photos to documentDirectory (Fail-fast: no best-effort)
// Must remain sequential to guarantee fail-fast behavior without lingering background writes
for (const fileName of uniquePhotosToRestore) {
  const sourcePath = `${stagingDir}photos/${fileName}`;
  const destPath = `${targetDocDir}${fileName}`;

  const sourceInfo = await getInfoAsync(sourcePath);
  if (!sourceInfo.exists) {
    throw new Error('写真ファイルが見つかりません。');
  }

  await copyAsync({
    from: sourcePath,
    to: destPath,
  });

  const destInfo = await getInfoAsync(destPath);
  if (!destInfo.exists) {
    throw new Error('写真ファイルのコピーに失敗しました。');
  }

  copiedFiles.add(fileName);
}
```

- 1ファイルでも存在確認やコピーに失敗した場合、即座に例外をスローしてループを中断（フェイルファスト）。
- `copiedFiles` に登録されたファイルのみが、後続の `catch` ブロックで正確に物理削除される。
- 逐次処理であるため、並列実行時のように「エラー発生後に別スレッドで書き込みが遅延完了してしまい、ロールバック後にファイルが残存する」といった競合状態（lingering background writes）が構造的に発生しない。

## 4. 再開・着手の受入基準（Acceptance Criteria）
以下の条件が客観的証拠（Evidence）とともにすべて満たされない限り、本機能の実装 PR は再作成しません：

- [ ] **実機環境での N 枚復元時間の実測プロファイル（実測 Evidence）**:
  - 低スペック Android 端末を含む実機環境において、実際の写真ファイル（50〜200枚）を用いた復元時間を実測し、写真コピー処理が復元全体の支配的ボトルネック（例: 全体の70%以上）となっている客観的証拠が存在すること（合成シミュレーション値は不可）。
- [ ] **ロールバック整合性と障害系の検証テスト完備**:
  - チャンク内の一部コピー失敗時（例: 途中でディスクフルやパーミッションエラー等）に、成功済みファイルのみが正確にロールバック（削除）されること。
  - 失敗発生後に後続チャンクの処理が確実に中断されること。
  - バックグラウンドでの遅延書き込み（lingering writes）が残存せず、ロールバック後のディレクトリ整合性が保たれること。
- [ ] **並列度上限（CONCURRENCY_LIMIT）の客観的根拠**:
  - 端末クラス別またはストレージ/ブリッジ負荷の実測に基づき、EMFILE、メモリ枯渇、UI フリーズ（ANR）を引き起こさない安全な並列度（例: 4〜8程度）が客観的データに基づき定義されていること。
- [ ] **元の sequential 設計意図を上回る安全性の論理的証明**:
  - フェイルファスト原則およびデータ保護の観点から、逐次処理と同等の安全性が担保されていることの論理的説明。
