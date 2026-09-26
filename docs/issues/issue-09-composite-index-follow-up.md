# [Investigation] 大量データ規模における複合インデックス導入の再評価

- **内部ドキュメントID**: issue-09
- **対応 GitHub Issue**: GitHub Issue #81
- **GitHub Issue 状態**: OPEN（Later / 将来トリガー待ち）
- **ステータス**: 将来トリガー待ち評価 (Later / Future-triggered)
- **根拠ドキュメント**: [docs/notes/composite-index-evaluation-issue-59.md](../notes/composite-index-evaluation-issue-59.md)（現時点見送り確認済み）
- **対象トリガー**: 保存件数10,000件超、または実機体感遅延の報告時

## 概要
本Issueは、**Issue #59 の実測評価レポート（`docs/notes/composite-index-evaluation-issue-59.md`）の結論（現時点は見送り）を引き継ぐ将来追跡用 Issue** です。
Records 一覧クエリに対する複合インデックス `idx_meals_is_deleted_datetime ON meals(is_deleted, meal_datetime DESC)` の導入について、現時点（データ規模 1,000 件以下）では体感改善効果が 0.1ms 未満であり不要なスキーマ更新を避けるため見送りと判断されました。本Issueは、将来データ件数の増大時やクエリ要件変更時に再評価を行うためのトリガー管理タスクとして位置付けられます。

## 関連 Issue および運用方針
- **先行 Issue**: #59（[perf(db): add composite index for records screen](https://github.com/tahosook/dining-memory-app/issues/59)）
- **根拠ドキュメント**: [docs/notes/composite-index-evaluation-issue-59.md](../../docs/notes/composite-index-evaluation-issue-59.md)
  - Issue #59 における詳細な実行計画比較（EXPLAIN QUERY PLAN）、実ファイルでのベンチマーク結果、および「現時点は見送り」と判断した論理的根拠は本ドキュメントに恒久的に記録・保持されています。
- **推奨運用**:
  - Issue #59 は実測評価の完了およびドキュメント化をもってクローズとし、将来の再評価トリガー管理は本 Issue (#81) で一元的に追跡することを推奨します（#59 をクローズしても過去の判断根拠が失われることはありません）。

## 現状の課題・背景（実測データに基づく事実）
1. `docs/notes/composite-index-evaluation-issue-59.md` の実測結果により、現状の単一インデックス構成では `USE TEMP B-TREE FOR ORDER BY` による全件ソートが発生し、データ規模の拡大に伴いクエリ時間が増大することが確認されています（実測値: 1,000件で0.23ms、10,000件で0.68ms、50,000件で4.71ms。複合インデックス構成では50,000件でも0.16msで頭打ち）。
2. しかし、現在の個人利用規模（数十〜数百件、1年程度）では短縮効果が 0.08ms 程度と微小であり、不要な本番 DB スキーママイグレーション（Version 2 → Version 3）を実行するリスクを避けるため、現時点では導入が見送られています。
3. 加えて、StatsScreen や SearchScreen における `cuisine_type` 集計・検索頻度に対するインデックス最適化についても将来の検討余地があります。

## 再評価のトリガー条件（いずれかを満たした段階で再評価を実施）
※ 以下の数値は「到達時に必ずインデックスを導入する」という自動導入基準ではなく、「再評価プロセスを開始するための目安トリガー」です。
1. **データ規模の拡大**: 保存レコード数が 10,000 件規模に到達したとき（Issue #59 の実測において全件ソートコストと複合インデックスの効果差が明確になり始めた規模に基づく目安）。
2. **実機性能の課題**: Records 一覧や検索画面の実機描画・実測性能でユーザー体感上の遅延が報告されたとき。
3. **SQL 要件の変更**: 一覧取得 SQL の条件変更や、新たな日付ソート・絞り込み系 SQL が追加されたとき。

## 再評価時の方針（トリガー到達時）
1. 到達時点の実データ、端末環境、クエリプラン、実測性能を再測定し、マイグレーション実施の妥当性を評価する。
2. 導入と判断された場合、`docs/notes/composite-index-evaluation-issue-59.md` の DDL 構成イメージに基づき、Version 3 マイグレーションを別実装 Issue として起票・実装する。
3. 既存の `idx_meals_is_deleted` の冗長性評価を行い、安全に削除可能かを全 SQL の影響調査とともに判断する。

## 受入基準
- [ ] 再評価トリガー到達時に実機ベンチマーク・調査を実施し、マイグレーションの妥当性を確認すること。
- [ ] 評価結果が `docs/notes/` 等のドキュメントとして記録されていること。
- [ ] 「本番スキーマを更新して実装する / しない」の判断が Issue コメントまたは本文で明示され、実装が必要と判断された場合は別Issueとして実装作業を切り出せる状態になっていること。
