# meals クエリにおけるページネーションと複合インデックスのベンチマーク評価レポート

## 1. 概要 (Executive Summary)

本ドキュメントは、以下の2つの将来移行検討課題：
- **GitHub Issue #80** (内部ID: `issue-08`): Keyset (Cursor) ページネーションへの移行検討
- **GitHub Issue #81** (内部ID: `issue-09`): 大量データ規模における複合インデックス (`idx_meals_datetime_deleted`) 導入の再評価

について、ローカル SQLite 環境でベンチマークスクリプト ([`scripts/benchmarks/benchmark-meals-query.ts`](../../scripts/benchmarks/benchmark-meals-query.ts)) を実行し、クエリ実行計画（`EXPLAIN QUERY PLAN`）およびミリ秒単位の実行速度を測定・分析したレポートです。

### 結論要約と現時点の判断

1. **GitHub Issue #80 (Keyset ページネーション)**:
   - **現時点では実装見送り**。
   - 同一 timestamp を考慮した正しいタイブレーカー方式 `(meal_datetime < ? OR (meal_datetime = ? AND id < ?))` と、`ORDER BY meal_datetime DESC, id DESC` の整合性を仕様として文書化。
   - 移行判断は、将来的に 20,000 件超のデータ規模に達し、かつ深いスクロールやバックグラウンド同期要件が生じた段階で再評価します。
2. **GitHub Issue #81 (複合インデックス導入)**:
   - **現時点では本番 INDEX 追加（スキーマ Version 3 移行）を見送り**。
   - **10,000 件以上を「再評価トリガー」** として記録。件数のみで機械的に導入を必須化せず、実機での体感速度、実データ分布、一覧画面全体の描画性能を追加判断材料とします。
3. **ベンチマークの意義**:
   - 今回の実測値は開発 Mac 上の in-memory SQLite 環境における相対値であり、将来の再評価時における比較用ベースラインとして保存します。実機環境での同一倍率の再現を保証するものではありません。

---

## 2. 本番クエリとベンチマーク SQL の照合

本番コードベース（`src/database/services/MealService.ts` および `src/database/services/localDatabase.ts`）の実装と、本ベンチマークで使用した SQL の対応関係は以下の通りです。

### 2.1 `MealService.getRecentMeals` (本番クエリ)
本番の `getRecentMeals`（L400-L425）は、タイブレーカーとして `(meal_datetime, id)` の複合ソートを採用しています。

- **OFFSET 方式 (本番クエリ)**:
  ```sql
  SELECT * FROM meals
  WHERE is_deleted = 0
  ORDER BY meal_datetime DESC, id DESC
  LIMIT ? OFFSET ?;
  ```
  - `WHERE`: `is_deleted = 0`
  - `ORDER BY`: `meal_datetime DESC, id DESC` (複合ソート)
  - `LIMIT / OFFSET`: パラメータバインド
- **Keyset 方式 (本番クエリ・タイブレーカー対応)**:
  ```sql
  SELECT * FROM meals
  WHERE is_deleted = 0
    AND (meal_datetime < ? OR (meal_datetime = ? AND id < ?))
  ORDER BY meal_datetime DESC, id DESC
  LIMIT ?;
  ```
  - 同一 `meal_datetime` のレコードが存在する場合、`id` の降順比較でタイブレークを行い、ページ境界での重複や取りこぼしを物理的に防ぎます。

### 2.2 `MealService.searchMeals` (代表クエリ)
本番の `searchMeals`（L334-L348）は、現在単一ソートキーを採用しています。

- **OFFSET 方式 (代表クエリ)**:
  ```sql
  SELECT * FROM meals
  WHERE is_deleted = 0
  ORDER BY meal_datetime DESC
  LIMIT ? OFFSET ?;
  ```
  - 本レポートでは `searchMeals` 向けのクエリを「代表クエリのベンチマーク」として明記・分類します。

### 2.3 誤った Keyset 条件の検証（参考）
- **誤った条件**:
  ```sql
  SELECT * FROM meals
  WHERE meal_datetime < ? AND id < ?
  ORDER BY meal_datetime DESC
  LIMIT 20;
  ```
  - `meal_datetime < ? AND id < ?` は、「日時が前であり、**かつ** ID も小さい」ことを要求するため、日時が過去であっても `id >= ?` である行をすべて取りこぼします。本レポートではこの誤りを実証するため参考測定対象としています。

---

## 3. 評価環境と検証条件

- **実行エンジン**: Node.js v26.10.0 組み込み `node:sqlite`（SQLite 3.x エンジン）
- **DB スキーマ**: `src/database/services/localDatabase.ts` の Version 2 スキーマを再現
  - テーブル: `meals` (全21カラム)
  - 単一インデックス (Baseline):
    - `idx_meals_meal_datetime ON meals(meal_datetime)`
    - `idx_meals_location_name ON meals(location_name)`
    - `idx_meals_is_deleted ON meals(is_deleted)`
    - `idx_meals_search_text ON meals(search_text)`
- **検証用複合インデックス (Issue #81)**:
  - `idx_meals_datetime_deleted ON meals(is_deleted, meal_datetime DESC, id DESC)`
- **計測条件**:
  - タイマー: `process.hrtime.bigint()`（ナノ秒精度）
  - 各クエリごとに 10 回のウォームアップ実行後、100 回実行の算術平均（Average）、中央値（Median）、95パーセンタイル（P95）を算出
  - データセット件数: 1,000件 / 5,000件 / 10,000件 / 20,000件
  - データ特性: 4時間間隔、ソフトデリート比率 ~5%（`is_deleted = 1`）、**同一 `meal_datetime` の重複行を 20% 含有**（タイブレーカー検証用）
- **連続ページ取得検証**:
  - ページ 1 → 2 → 3 → 4 → 5 の連続カーソル取得を行い、重複（Duplicates）および欠落（Omissions）が 0 件であることを機械的に検証

---

## 4. Keyset 連続ページ取得の整合性検証結果

同一 `meal_datetime` を複数含むデータセットにおいて、本番 `getRecentMeals` 準拠の Keyset 方式で 5 ページ（計 100 レコード）を連続取得した検証結果：

```
▶ Verifying Keyset continuous pagination integrity (Page 1 -> 5)...
  ✓ Integrity PASS: 100 rows collected across 5 pages, 0 duplicates, 0 omissions (identical timestamps handled properly).
```

- **結果**: 重複件数 0 件、欠落件数 0 件。同一日時のレコードがページ境界（20件目と21件目など）をまたぐ場合でも、`id < ?` タイブレーカーにより漏れなく一意にページ送りできることを確認しました。
- 一方、`meal_datetime < ? AND id < ?` の構文では、過去日付のレコードが条件によって除外され、返却行数が 0 件になる論理的欠陥が確認されました。

---

## 5. EXPLAIN QUERY PLAN 解析比較

| ケース | クエリ分類 | 実行計画 (EXPLAIN QUERY PLAN) | ソートコスト (TEMP B-TREE) | 特徴 |
|---|---|---|---|---|
| **Case 1** | 本番 `getRecentMeals` (OFFSET 5000) | `SEARCH meals USING INDEX idx_meals_is_deleted (is_deleted=?)`<br>`USE TEMP B-TREE FOR ORDER BY` | **あり (YES)** | `idx_meals_is_deleted` で絞り込んだ全有効行を一時 B-Tree でソートしてからスキップ。 |
| **Case 1-search** | 本番 `searchMeals` 代表 (OFFSET 5000) | `SEARCH meals USING INDEX idx_meals_is_deleted (is_deleted=?)`<br>`USE TEMP B-TREE FOR ORDER BY` | **あり (YES)** | Case 1 と同様に全有効行の一時 B-Tree ソートが発生。 |
| **Case 2** | 本番 `getRecentMeals` Keyset 正式条件 | `SEARCH meals USING INDEX idx_meals_is_deleted (is_deleted=?)`<br>`USE TEMP B-TREE FOR ORDER BY` | **あり (YES)** | 単一インデックス構成では、`is_deleted = 0` の絞り込みが優先され、Keyset 条件を指定しても一時 B-Tree ソートが残存する。 |
| **Case 2-err** | 誤った Keyset 条件 (`AND id < ?`) | `SEARCH meals USING INDEX idx_meals_meal_datetime (meal_datetime<?)` | **なし (Zero Sort)** | `is_deleted = 0` がないため一時 B-Tree は出ないが、論理条件の誤りにより行が正しく返却されない（0件）。 |
| **Case 3A** | 複合INDEX + `getRecentMeals` OFFSET 5000 | `SEARCH meals USING INDEX idx_meals_datetime_deleted (is_deleted=?)` | **なし (Zero Sort)** | 複合インデックス順と `ORDER BY` が合致するため一時 B-Tree が完全消失。 |
| **Case 3B** | 複合INDEX + `getRecentMeals` Keyset 正式条件 | `SEARCH meals USING INDEX idx_meals_datetime_deleted (is_deleted=?)` | **なし (Zero Sort)** | 一時 B-Tree なしでインデックスを利用してカーソル位置付近から取得。 |
| **Case 3-search** | 複合INDEX + `searchMeals` 代表 (OFFSET 5000) | `SEARCH meals USING INDEX idx_meals_datetime_deleted (is_deleted=?)` | **なし (Zero Sort)** | 一時 B-Tree ソートなしでインデックス順走査。 |

### SCAN TABLE（フルテーブルスキャン）の発生有無
全ケースにおいてインデックス検索（SEARCH meals USING INDEX ...）が使われており、**テーブル全体のフルスキャン（SCAN TABLE without index）は発生していません**。

---

## 6. 件数別クエリ実行時間（100回試行の実測値・開発環境参考値）

> [!NOTE]
> 以下の数値は開発 Mac 上の in-memory SQLite 環境で測定した相対参考値です。端末の CPU、ストレージ性能、バックグラウンド負荷により実機での数値は変動します。

### 6.1 データ規模: 1,000 件
| ケース | クエリ分類 | 平均 (avg) | 中央値 (med) | P95 | ソート (TEMP B-TREE) | 使用インデックス | 返却行数 |
|---|---|---|---|---|---|---|---|
| **Case 1** | 本番 `getRecentMeals` OFFSET 5000 | **0.422 ms** | 0.418 ms | 0.442 ms | YES | `idx_meals_is_deleted` | 0行 (※総数不足) |
| **Case 1-search** | 本番 `searchMeals` 代表 (OFFSET 5000) | **0.411 ms** | 0.408 ms | 0.431 ms | YES | `idx_meals_is_deleted` | 0行 |
| **Case 2** | 本番 `getRecentMeals` Keyset 正式条件 | **0.087 ms** | 0.085 ms | 0.100 ms | YES | `idx_meals_is_deleted` | 20行 |
| **Case 2-err** | 誤った Keyset 条件 (`AND id < ?`) | **0.031 ms** | 0.030 ms | 0.034 ms | NO | `idx_meals_meal_datetime` | 0行 (※論理欠陥) |
| **Case 3A** | 複合INDEX + `getRecentMeals` OFFSET 5000 | **0.013 ms** | 0.013 ms | 0.015 ms | NO | `idx_meals_datetime_deleted` | 0行 |
| **Case 3B** | 複合INDEX + `getRecentMeals` Keyset 正式条件 | **0.040 ms** | 0.038 ms | 0.042 ms | NO | `idx_meals_datetime_deleted` | 20行 |
| **Case 3-search** | 複合INDEX + `searchMeals` 代表 (OFFSET 5000) | **0.014 ms** | 0.013 ms | 0.018 ms | NO | `idx_meals_datetime_deleted` | 0行 |

### 6.2 データ規模: 5,000 件
| ケース | クエリ分類 | 平均 (avg) | 中央値 (med) | P95 | ソート (TEMP B-TREE) | 使用インデックス | 返却行数 |
|---|---|---|---|---|---|---|---|
| **Case 1** | 本番 `getRecentMeals` OFFSET 5000 | **2.117 ms** | 2.115 ms | 2.164 ms | YES | `idx_meals_is_deleted` | 0行 |
| **Case 1-search** | 本番 `searchMeals` 代表 (OFFSET 5000) | **2.083 ms** | 2.079 ms | 2.124 ms | YES | `idx_meals_is_deleted` | 0行 |
| **Case 2** | 本番 `getRecentMeals` Keyset 正式条件 | **0.300 ms** | 0.296 ms | 0.326 ms | YES | `idx_meals_is_deleted` | 20行 |
| **Case 2-err** | 誤った Keyset 条件 (`AND id < ?`) | **0.163 ms** | 0.162 ms | 0.172 ms | NO | `idx_meals_meal_datetime` | 0行 |
| **Case 3A** | 複合INDEX + `getRecentMeals` OFFSET 5000 | **0.067 ms** | 0.065 ms | 0.072 ms | NO | `idx_meals_datetime_deleted` | 0行 |
| **Case 3B** | 複合INDEX + `getRecentMeals` Keyset 正式条件 | **0.093 ms** | 0.091 ms | 0.099 ms | NO | `idx_meals_datetime_deleted` | 20行 |
| **Case 3-search** | 複合INDEX + `searchMeals` 代表 (OFFSET 5000) | **0.068 ms** | 0.066 ms | 0.073 ms | NO | `idx_meals_datetime_deleted` | 0行 |

### 6.3 データ規模: 10,000 件
| ケース | クエリ分類 | 平均 (avg) | 中央値 (med) | P95 | ソート (TEMP B-TREE) | 使用インデックス | 返却行数 |
|---|---|---|---|---|---|---|---|
| **Case 1** | 本番 `getRecentMeals` OFFSET 5000 | **2.590 ms** | 2.531 ms | 2.912 ms | YES | `idx_meals_is_deleted` | 20行 |
| **Case 1-search** | 本番 `searchMeals` 代表 (OFFSET 5000) | **2.458 ms** | 2.447 ms | 2.558 ms | YES | `idx_meals_is_deleted` | 20行 |
| **Case 2** | 本番 `getRecentMeals` Keyset 正式条件 | **0.572 ms** | 0.570 ms | 0.613 ms | YES | `idx_meals_is_deleted` | 20行 |
| **Case 2-err** | 誤った Keyset 条件 (`AND id < ?`) | **0.356 ms** | 0.355 ms | 0.374 ms | NO | `idx_meals_meal_datetime` | 0行 |
| **Case 3A** | 複合INDEX + `getRecentMeals` OFFSET 5000 | **0.096 ms** | 0.093 ms | 0.106 ms | NO | `idx_meals_datetime_deleted` | 20行 |
| **Case 3B** | 複合INDEX + `getRecentMeals` Keyset 正式条件 | **0.163 ms** | 0.161 ms | 0.176 ms | NO | `idx_meals_datetime_deleted` | 20行 |
| **Case 3-search** | 複合INDEX + `searchMeals` 代表 (OFFSET 5000) | **0.093 ms** | 0.092 ms | 0.101 ms | NO | `idx_meals_datetime_deleted` | 20行 |

### 6.4 データ規模: 20,000 件
| ケース | クエリ分類 | 平均 (avg) | 中央値 (med) | P95 | ソート (TEMP B-TREE) | 使用インデックス | 返却行数 |
|---|---|---|---|---|---|---|---|
| **Case 1** | 本番 `getRecentMeals` OFFSET 5000 | **3.051 ms** | 3.048 ms | 3.109 ms | YES | `idx_meals_is_deleted` | 20行 |
| **Case 1-search** | 本番 `searchMeals` 代表 (OFFSET 5000) | **3.045 ms** | 2.980 ms | 3.381 ms | YES | `idx_meals_is_deleted` | 20行 |
| **Case 2** | 本番 `getRecentMeals` Keyset 正式条件 | **1.196 ms** | 1.192 ms | 1.255 ms | YES | `idx_meals_is_deleted` | 20行 |
| **Case 2-err** | 誤った Keyset 条件 (`AND id < ?`) | **1.118 ms** | 1.114 ms | 1.154 ms | NO | `idx_meals_meal_datetime` | 0行 |
| **Case 3A** | 複合INDEX + `getRecentMeals` OFFSET 5000 | **0.096 ms** | 0.092 ms | 0.110 ms | NO | `idx_meals_datetime_deleted` | 20行 |
| **Case 3B** | 複合INDEX + `getRecentMeals` Keyset 正式条件 | **0.171 ms** | 0.170 ms | 0.186 ms | NO | `idx_meals_datetime_deleted` | 20行 |
| **Case 3-search** | 複合INDEX + `searchMeals` 代表 (OFFSET 5000) | **0.099 ms** | 0.099 ms | 0.106 ms | NO | `idx_meals_datetime_deleted` | 20行 |

---

## 7. OFFSET 深度による性能特性分析 (20,000件時)

20,000 件データセットにおけるページ深度（OFFSET）と Keyset の所要時間比較（in-memory 測定値）：

| OFFSET (ページ深度) | Config A: 現行単一INDEX (ソートあり OFFSET) | Config B: 複合INDEX (ソートなし OFFSET) | Config B: 複合INDEX (Keyset シーク) |
|---|---|---|---|
| **OFFSET 0** (先頭) | **1.112 ms** | **0.035 ms** | **0.026 ms** |
| **OFFSET 20** (2頁目) | **1.114 ms** | **0.024 ms** | **0.026 ms** |
| **OFFSET 100** (6頁目) | **1.150 ms** | **0.026 ms** | **0.029 ms** |
| **OFFSET 1,000** (51頁目) | **1.504 ms** | **0.039 ms** | **0.062 ms** |
| **OFFSET 5,000** (251頁目) | **3.110 ms** | **0.099 ms** | **0.203 ms** |
| **OFFSET 10,000** (501頁目)| **6.930 ms** | **0.171 ms** | **0.373 ms** |

### 性能特性の考察
1. **OFFSET 方式の特性**:
   - OFFSET は深いページほど読み飛ばし（スキップ）コストが増大します。
   - 単一インデックス構成（Config A）では全件ソートコスト（~1.1ms）にスキップコストが上乗せされ、OFFSET 10,000 では約 6.9ms に達します。
   - 複合インデックス構成（Config B）ではソートが省かれるため、スキップのみの処理となり、深い OFFSET でも増加幅が大幅に緩和されます。
2. **Keyset 方式の特性**:
   - Keyset はインデックスを利用してカーソル位置付近から直接取得できるため、ページ深度による極端な性能劣化を抑えられます。
   - ただし、本番クエリのように `(meal_datetime < ? OR (meal_datetime = ? AND id < ?))` の複合タイブレーカー条件を用いる場合、SQLite はインデックスの `is_deleted` スキャンを基準に評価するため、シーク条件の複雑さに応じて一定の走査コストが発生します。

---

## 8. 将来の再評価トリガーと移行方針

実測結果と本番クエリの照合に基づき、方針を以下のように整理します。

### 8.1 GitHub Issue #81: 複合インデックス導入の再評価トリガー
- **現時点の判断**: **本番 DB へのインデックス追加は見送り（現状維持）**。
- **再評価トリガー**:
  1. **データ件数**: 保存件数 **10,000 件以上** を再評価開始の目安トリガーとする（※件数到達のみで自動導入とはせず、以下の項目と併せて総合判断する）。
  2. **実機体感**: 低〜中価格帯端末での Records 一覧・検索画面における実測描画遅延やユーザー体感上のカクつきの有無。
  3. **実データ分布**: ソフトデリート件数の比率や、実際の端末内 SQLite ファイルの断片化状況。
  4. **一覧画面の機能要件**: 画面での取得件数変更やソート条件の変更。

### 8.2 GitHub Issue #80: Keyset Pagination 移行の移行方針
- **現時点の判断**: **実装見送り（現状維持）**。
- **移行トリガー**:
  1. 保存レコード数が **20,000 件以上** に達した段階。
  2. かつ、深いスクロール（OFFSET 5,000 超）が日常的に発生する、または全件バックグラウンド差分同期などの大量データ走査機能が新設された場合。
- **移行時の必須仕様**:
  - タイブレーカー条件は `(meal_datetime < ? OR (meal_datetime = ? AND id < ?))` を採用し、`ORDER BY meal_datetime DESC, id DESC` と完全に一致させること。
  - 単一インデックスのままではソートが残存するため、**複合インデックス（Issue #81）の導入とセットで実施** すること。

---

## 9. 関連ドキュメント・検証スクリプト

- ベンチマーク実行スクリプト: [`scripts/benchmarks/benchmark-meals-query.ts`](../../scripts/benchmarks/benchmark-meals-query.ts)
  - 再現コマンド: `node scripts/benchmarks/benchmark-meals-query.ts`
- 関連 Issue ドキュメント:
  - [`docs/issues/issue-08-keyset-cursor-pagination.md`](../issues/issue-08-keyset-cursor-pagination.md) (GitHub Issue #80)
  - [`docs/issues/issue-09-composite-index-follow-up.md`](../issues/issue-09-composite-index-follow-up.md) (GitHub Issue #81)
- 先行評価レポート:
  - [`docs/notes/composite-index-evaluation-issue-59.md`](composite-index-evaluation-issue-59.md) (Issue #59 複合インデックス実測評価)
