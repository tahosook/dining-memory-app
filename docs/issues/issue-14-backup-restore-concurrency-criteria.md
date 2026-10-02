# [Investigation] バックアップ復元時の写真コピー並列化 — 再開条件と必須 Evidence の定義

- **内部ドキュメントID**: issue-14
- **対応 GitHub Issue**: GitHub Issue #229
- **ステータス**: 保留 / 将来トリガー待ち評価 (Later)
- **関連 PR**: PR #220
- **関連ノート**: [docs/notes/backup-restore-copy-evaluation.md](../notes/backup-restore-copy-evaluation.md)

## 概要
PR #220（バックアップ復元時の写真コピー並列化）の事後レビューに基づき、並列化を再開・着手するために満たすべき必須条件と客観的証拠（Evidence）の基準を定義・記録します。

## 現状の課題と判断
PR #220 では `Promise.allSettled` によるチャンク並列化が提案されましたが、以下の理由によりクローズされました：
1. チャンク内での一部成功・一部失敗時のロールバック整合性や後続中断挙動のテスト欠落。
2. 人工的な遅延（mock delay）を用いたシミュレーション値であり、実端末での実測根拠がない。
3. モバイル端末環境におけるブリッジ過負荷やファイル記述子（EMFILE）枯渇リスク。
4. 元のコードに明記されていた設計意図（`Must remain sequential to guarantee fail-fast behavior without lingering background writes`）を覆す安全性の検証不足。

## 再開・着手の受入基準（Acceptance Criteria）
以下の条件が客観的証拠（Evidence）とともにすべて満たされない限り、本機能の実装 PR は作成しない：
- [ ] 低スペック Android 端末を含む実機環境において、実ファイルシステムでの復元時間実測データが取得されていること。
- [ ] チャンク内一部失敗時のロールバック（成功済みファイルの正確な削除・後続中断・lingering write なし）を検証する単体テストが完備されていること。
- [ ] 並列度上限（CONCURRENCY_LIMIT）の客観的根拠が実測または端末クラス別に定義されていること。
- [ ] 元の sequential 設計意図を上回る安全性の説明が論理的になされていること。
