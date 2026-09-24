# [Investigation] Keyset (Cursor) ページネーション移行条件の検討（Issue #80）

- **ステータス**: 将来トリガー待ち評価 (Later / Future-triggered)
- **対象トリガー**: データ規模の拡大（保存件数10,000件超）または実機性能課題の顕在化

## 目的
現在のLIMIT/OFFSET方式について、実際のデータ規模・利用形態を踏まえてKeyset paginationへの移行が必要になる条件を明確化する。

## 背景・現状
`src/database/services/MealService.ts` において、`getRecentMeals` はシンプルな `LIMIT` を使用し、検索・一覧取得を行う `searchMeals` において `LIMIT` と `OFFSET` によるページネーションが採用されています。
コード内コメント（`MealService.ts` L238）にもある通り、将来的な大量データ下での負荷を考慮して keyset pagination への移行が言及されていますが、現行の個人利用規模（数十〜数百件、1年程度）において即座に実装移行が必要かどうか、およびどのような利用形態・データ規模で性能劣化が顕在化するかは未評価です。
そのため、本Issueでは今すぐコード実装を行うのではなく、移行が必要となる条件・性能特性・変更範囲を調査・評価します。

## 実施内容
以下を調査・評価する：
- `MealService.ts` の現在の LIMIT/OFFSET 実装（特に `searchMeals` での `OFFSET` 処理）
- Records / Search 画面でのページネーション利用状況
- 現在想定しているデータ件数
- 実際に問題となるデータ規模
- OFFSET 方式の性能劣化条件
- `(meal_datetime, id)` による Keyset 方式の実装可能性
- 現在の API / UI への変更範囲
- Keyset 方式へ移行するメリット・デメリット
※ 必要に応じて実測ベンチマークを実施し、クエリプランおよび実行時間を評価する。

## 今回やらないこと（Non-goals / Out of scope）
- 本Issueでの Keyset pagination コードの直接実装
- `MealFilterOptions` の API 変更（`beforeMealDatetime` / `beforeId` 等の追加）
- Keyset 用 SQL の実装および UI の無限スクロール実装の変更
※ 評価結果から「実装する」と判断された場合に、別の実装 Issue として作業を切り出します。

## 受入基準
- [ ] 現在の LIMIT/OFFSET 方式の利用箇所（`searchMeals` 中心）と仕様が整理されている。
- [ ] 現在および想定されるデータ規模における性能特性が確認されている。
- [ ] Keyset pagination へ移行した場合のメリット・デメリットが整理されている。
- [ ] API、MealService、UI への変更範囲が整理されている。
- [ ] Keyset pagination への移行が必要になる具体的なトリガー条件が定義されている。
- [ ] 評価結果が `docs/notes/` 等のドキュメントとして記録されている。
- [ ] 「実装する / しない」の判断が Issue コメントまたは本文で明示され、実装が必要と判断された場合は別Issueとして実装作業を切り出せる状態になっている。
