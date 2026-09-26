# [Bug/Refactor] RecordsScreen の日付グルーピングにおけるタイムゾーン依存・日付再パースの改善

- **内部ドキュメントID**: issue-05
- **対応 GitHub Issue**: GitHub Issue #77
- **ステータス**: 完了 (Closed)
- **完了 PR**: PR #85（Phase 2）

## 概要
`src/screens/RecordsScreen/RecordsScreen.tsx` の `groupMealsByDate` 関数において、`new Date(meal.meal_datetime).toDateString()` で日付キーを生成し、セクションのソート時に `new Date(b.date).getTime()` で文字列を再パースしています。この処理は JS エンジン間の日付文字列解釈の差異やタイムゾーンの境界で意図しない日付のずれ（off-by-one エラー）を引き起こすリスクがあります。

## 現状の課題
1. `toDateString()` は `"Sun Sep 20 2026"` のようなロケール依存・エンジン依存の文字列を出力する。
2. その文字列を `new Date(b.date).getTime()` で再度パースして降順ソートを行っている。JavaScriptCore や Hermes、V8 で文字列パースのタイムゾーン解釈（UTC 扱いかローカル扱いか）が異なる場合がある。
3. `groupMeals` に含まれるレコード自体がすでに `meal_datetime`（数値タイムスタンプ）を保持しているため、文字列を再パースして比較する必要性がない。

## 修正方針
1. 日付キーをロケール・エンジン依存のない形式（例: `YYYY-MM-DD` 形式）で生成する。
2. セクション一覧のソートは、文字列の再パースではなく、各セクションの代表タイムスタンプ（グループ内先頭アイテムの `meal_datetime`）を直接比較して降順ソートする。

## 受入基準
- [x] 日付セクションのグルーピングが端末のローカルタイムゾーンで一貫して正確に動作すること。
- [x] 文字列を `new Date()` で再パースするアンチパターンが解消されていること。
- [x] `tests/RecordsScreen.test.tsx` のテストがパスすること。
