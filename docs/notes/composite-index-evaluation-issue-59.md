# Issue #59 複合インデックス導入の実測評価レポート

## 1. 概要 (Executive Summary)

本ドキュメントは、Issue #59 における Records 一覧クエリ：
```sql
SELECT * FROM meals
WHERE is_deleted = 0
ORDER BY meal_datetime DESC
LIMIT 100;
```
に対する複合インデックス `idx_meals_is_deleted_datetime ON meals(is_deleted, meal_datetime DESC)` の導入効果およびコストを、実測データに基づいて評価した調査報告書です。

### 結論要約
- **現時点では複合インデックスを本番DBへ導入しない（見送り）**。
  - 現在のデータ規模（数十〜数百件、1年程度の個人利用規模）ではSQL単体の絶対的な実行時間が0.2ms前後であり、複合インデックスによる短縮幅も0.1ms未満（1,000件規模で現状 0.225 ms vs 複合 0.143 ms、差分 0.082 ms）です。今回の測定範囲では、一覧表示のユーザー体感上のボトルネックとは考えにくく、現時点で本番スキーママイグレーションを実施する必要性は低いと判断します。
- **10,000〜50,000件規模では複合インデックスの効果が明確になることが確認された**。
  - 現状の構成は全件ソートを行う一時 B-Tree（`USE TEMP B-TREE FOR ORDER BY`）を生成するため、10,000 件で 0.677 ms、50,000 件で 4.705 ms と件数に比例して増大します。一方、複合インデックス構成は先頭 100 件でスキャンを即時打ち切る（Early Termination）ため、50,000 件でも **0.161 ms** で頭打ちとなり、約 29 倍の高速化が得られます。
  - ただし、10,000 件を固定的な導入閾値とはせず、将来のデータ量、Records 一覧の実測性能、ユーザー体感上の問題、関連 SQL の変更状況を踏まえて再評価します。
- **将来導入する場合の検討事項**:
  - 現行クエリでは `idx_meals_is_deleted_datetime` の先頭カラムが `is_deleted` であるため、`idx_meals_is_deleted` は複合インデックスで代替可能と考えられます。ただし、将来の SQL 追加・変更によって必要になる可能性があるため、実際に複合インデックスを導入する際には、その時点の全 SQL を再確認したうえで削除可否を判断します。

---

## 2. 評価環境と検証条件

- **実行エンジン**: Node.js v26.9.0 組み込み `node:sqlite`（SQLite 3.x エンジン）
- **DB スキーマ**: 本番 `src/database/services/localDatabase.ts` の Version 2 スキーマを 100% 忠実に再現
- **計測方式**:
  - タイマー: `process.hrtime.bigint()`（ナノ秒精度）
  - 各測定前にウォームアップ（20 回）を実施し、本番測定は 100〜200 回施行の中央値（Median）・平均値（Average）・95 パーセンタイル（P95）を算出
  - I/O コストおよびファイルサイズ計測は、ディスク上の WAL モード実ファイルにて実施

### 比較対象構成
1. **Config A (現状構成 - 4 つの単一インデックス)**:
   - `idx_meals_meal_datetime ON meals(meal_datetime)`
   - `idx_meals_location_name ON meals(location_name)`
   - `idx_meals_is_deleted ON meals(is_deleted)`
   - `idx_meals_search_text ON meals(search_text)`
2. **Config B (現状 + 複合インデックス追加)**:
   - Config A に加えて `idx_meals_is_deleted_datetime ON meals(is_deleted, meal_datetime DESC)`
3. **Config C (複合インデックス導入 + idx_meals_is_deleted 削除検証構成)**:
   - Config B から `idx_meals_is_deleted` を削除

---

## 3. EXPLAIN QUERY PLAN 比較結果

### 3.1 Records 一覧クエリ
対象: `SELECT * FROM meals WHERE is_deleted = 0 ORDER BY meal_datetime DESC LIMIT 100`

| 構成 | 実行計画 (EXPLAIN QUERY PLAN) | 特徴 |
|---|---|---|
| **Config A (現状)** | `SEARCH meals USING INDEX idx_meals_is_deleted (is_deleted=?)`<br>`USE TEMP B-TREE FOR ORDER BY` | `is_deleted = 0` のレコードをインデックススキャンし、全件を一時 B-Tree に投入してソートしてから 100 件を取得する |
| **Config B (複合INDEX)** | `SEARCH meals USING INDEX idx_meals_is_deleted_datetime (is_deleted=?)` | `USE TEMP B-TREE` が完全消失。B-Tree が `(is_deleted, meal_datetime DESC)` 順で保持されているため、先頭 100 件を読み込んだ時点で走査終了 |
| **Config C (検証構成)** | `SEARCH meals USING INDEX idx_meals_is_deleted_datetime (is_deleted=?)` | Config B と全く同一 |

### 3.2 アプリ内主要クエリへの影響

| クエリ種類 | SQL | Config A (現状) | Config B (複合INDEX) |
|---|---|---|---|
| **期間指定検索** | `WHERE is_deleted = 0 AND meal_datetime >= ? AND meal_datetime <= ? ORDER BY meal_datetime DESC` | `idx_meals_is_deleted` スキャン + `USE TEMP B-TREE` | `idx_meals_is_deleted_datetime (is_deleted=? AND meal_datetime>? AND meal_datetime<?)`<br>（ソート不要・範囲検索に適合） |
| **場所絞り込み** | `WHERE is_deleted = 0 AND location_name = ? ORDER BY meal_datetime DESC` | `idx_meals_is_deleted` スキャン + `USE TEMP B-TREE` | `idx_meals_is_deleted_datetime` スキャン（ソート不要） |
| **統計: 期間集計** | `SELECT COUNT(*), SUM(...) WHERE is_deleted = 0 AND meal_datetime >= ? AND meal_datetime <= ?` | `idx_meals_is_deleted` スキャン | `idx_meals_is_deleted_datetime (is_deleted=? AND meal_datetime>? AND meal_datetime<?)` |
| **有効件数カウント** | `SELECT COUNT(*) WHERE is_deleted = 0` | `idx_meals_is_deleted` (COVERING INDEX) | `idx_meals_is_deleted` (Config C では `idx_meals_is_deleted_datetime` が COVERING INDEX となり同等) |

---

## 4. 件数別クエリ実行時間（実測値）

対象クエリ: `SELECT * FROM meals WHERE is_deleted = 0 ORDER BY meal_datetime DESC LIMIT 100`

| レコード数 | Config A (現状) 中央値 (平均 / P95) | Config B (複合INDEX) 中央値 (平均 / P95) | 高速化倍率 (中央値) | 実行時間の差分 (中央値) |
|---|---|---|---|---|
| **100 件** | **0.175 ms** (0.181 / 0.221 ms) | **0.138 ms** (0.142 / 0.185 ms) | 1.27x | -0.037 ms |
| **1,000 件** | **0.225 ms** (0.229 / 0.261 ms) | **0.143 ms** (0.146 / 0.164 ms) | 1.58x | -0.082 ms |
| **10,000 件** | **0.677 ms** (0.682 / 0.719 ms) | **0.155 ms** (0.155 / 0.167 ms) | 4.38x | -0.522 ms |
| **50,000 件** | **4.705 ms** (4.710 / 4.906 ms) | **0.161 ms** (0.163 / 0.184 ms) | **29.24x** | -4.544 ms |

### 分析
1. **Config B の安定性**:
   - 100 件から 50,000 件へとデータ量が 500 倍になっても、クエリ時間は **0.138 ms → 0.161 ms** とほぼ一定です。これはインデックスの B-Tree リーフを先頭から 100 件取得した時点で処理が終了するためです（LIMIT 100によって読み取り件数が一定となり、今回の測定範囲ではデータ件数増加に対して実行時間がほぼ一定だった）。
2. **Config A のスケーラビリティ**:
   - 一方で Config A は、マッチした行をメモリ上の一時 B-Tree に挿入してソートするため、データ件数 \(N\) に応じて処理時間が増加します（\(O(N \log N)\)）。
3. **現在のデータ規模での影響**:
   - 現在のデータ規模（1,000 件以下）では SQL 単体の絶対的な実行時間が 0.2 ms 前後であり、複合インデックスによる短縮幅も 0.1 ms 未満です。今回の測定範囲では、一覧表示のユーザー体感上のボトルネックとは考えにくい数値です。

---

## 5. データ分布（削除フラグ比率）による影響

10,000 件のデータセットにおける `is_deleted` 比率ごとの実行時間（中央値・平均）:

| 削除率 (is_deleted = 1) | 想定シナリオ | Config A (現状) | Config B (複合INDEX) | 高速化倍率 |
|---|---|---|---|---|
| **0%** | 全件有効（初期〜通常利用） | 0.655 ms (0.657 ms) | 0.144 ms (0.147 ms) | 4.56x |
| **15%** | 一部削除済み（現実的な利用蓄積） | 0.681 ms (0.689 ms) | 0.145 ms (0.147 ms) | 4.69x |
| **50%** | 大量削除（極端な整理後） | 0.611 ms (0.621 ms) | 0.147 ms (0.149 ms) | 4.16x |

### 分析
- Config A では有効レコード件数が減るとソート対象データが減るため、50% 削除時にわずかに処理時間が短縮します。
- Config B は削除率に関わらず、常に ~0.145 ms で極めて安定しています。

---

## 6. DB ファイルサイズへの影響（実測値）

ディスク上実ファイル（VACUUM 後）におけるサイズ比較:

| レコード数 | Config A (現状) | Config B (現状 + 複合INDEX) | サイズ増加量 (比率) | Config C (`idx_meals_is_deleted` 削除) | Config A からの正味増分 |
|---|---|---|---|---|---|
| **100 件** | 60.0 KB (61,440 B) | 64.0 KB (65,536 B) | +4.0 KB (+6.67%) | 60.0 KB (61,440 B) | **±0.0 KB (0.00%)** |
| **1,000 件** | 436.0 KB (446,464 B) | 456.0 KB (466,944 B) | +20.0 KB (+4.59%) | 444.0 KB (454,656 B) | **+8.0 KB (+1.83%)** |
| **10,000 件** | 4,084.0 KB (4,182,016 B) | 4,236.0 KB (4,337,664 B) | +152.0 KB (+3.72%) | 4,152.0 KB (4,251,648 B) | **+68.0 KB (+1.67%)** |
| **50,000 件** | 21,388.0 KB (21,901,312 B) | 22,144.0 KB (22,675,456 B) | +756.0 KB (+3.53%) | 21,732.0 KB (22,253,568 B) | **+344.0 KB (+1.61%)** |

### 分析
- 複合インデックス自体の追加による容量増は全体の **3.5% 〜 4.6%** 程度です。
- `idx_meals_is_deleted` を削除した場合（Config C）、正味の容量増は **約 1.7%** に抑制されます。

---

## 7. 書き込み性能への影響（実測値）

実ファイル（WAL モード、PRAGMA synchronous = NORMAL）で 50 操作実行した際の中央値および平均時間:

### 1,000 件ベース
| 操作 | Config A (現状) 中央値 (平均) | Config B (複合追加) 中央値 (平均) | 1操作あたりの差分 (中央値) |
|---|---|---|---|
| **単一 INSERT (保存)** | 0.030 ms (0.035 ms) | 0.038 ms (0.043 ms) | +0.0079 ms (+7.9 µs) |
| **ソフトデリート (UPDATE is_deleted)** | 0.016 ms (0.017 ms) | 0.024 ms (0.025 ms) | +0.0079 ms (+7.9 µs) |
| **日時更新 (UPDATE meal_datetime)** | 0.012 ms (0.012 ms) | 0.016 ms (0.017 ms) | +0.0040 ms (+4.0 µs) |

### 10,000 件ベース
| 操作 | Config A (現状) 中央値 (平均) | Config B (複合追加) 中央値 (平均) | 1操作あたりの差分 (中央値) |
|---|---|---|---|
| **単一 INSERT (保存)** | 0.025 ms (0.029 ms) | 0.023 ms (0.034 ms) | 測定誤差範囲 (±0.002 ms) |
| **ソフトデリート (UPDATE is_deleted)** | 0.016 ms (0.018 ms) | 0.016 ms (0.017 ms) | 差分なし (±0.000 ms) |
| **日時更新 (UPDATE meal_datetime)** | 0.013 ms (0.013 ms) | 0.011 ms (0.012 ms) | 測定誤差範囲 (±0.001 ms) |

### 分析
- インデックス 1 個の追加に伴う書き込みオーバーヘッドは実測で **数マイクロ秒（0.004〜0.008 ms）** 程度です。
- 写真ファイルの保存処理（数十〜数百 ms）などと比較して無視できるレベルであり、書き込みコスト単体を理由に見送る必要はありません。

---

## 8. 既存 INDEX の冗長性についての見解

### 8.1 `idx_meals_is_deleted` について
- 現行クエリでは `idx_meals_is_deleted_datetime` の先頭カラムが `is_deleted` であるため、`idx_meals_is_deleted` は複合インデックスで代替可能と考えられます（`WHERE is_deleted = 0` や `SELECT COUNT(*) FROM meals WHERE is_deleted = 0` で COVERING INDEX として動作することを確認済み）。
- ただし、将来の SQL 追加・変更によって単独インデックスが必要になる可能性があるため、実際に複合インデックスを導入する際には、その時点の全 SQL を再確認したうえで削除可否を判断します。本調査の結果のみをもって将来の DROP を安全と断定することはしません。

### 8.2 `idx_meals_meal_datetime` との関係
- `idx_meals_meal_datetime` は `meal_datetime` 単独のインデックスです。
- 現行の `MealService.ts` では、日付範囲検索（StatsScreen や SearchScreen）を行うすべてのクエリに `is_deleted = 0` が付与されています。
- 複合インデックス `(is_deleted, meal_datetime DESC)` は `WHERE is_deleted = 0 AND meal_datetime >= ? AND meal_datetime <= ?` に適合しますが、将来 `is_deleted` 条件なしで日付ソートする外部クエリやエクスポート要件を考慮すると、`idx_meals_meal_datetime` は維持しておくことが推奨されます。

---

## 9. 将来のマイグレーション安全性評価 (Version 3)

将来的に複合インデックスを導入する場合の実現可能性を調査した結果です。

> [!IMPORTANT]
> 本調査は実現可能性の評価を目的としており、今回の PR では以下を厳守しています：
> - DB スキーマバージョンを 2 から 3 に変更しない
> - マイグレーションスクリプトを追加しない
> - `CREATE INDEX` を本番コードに追加しない
> - `DROP INDEX` を実行するマイグレーションを作成しない

### 9.1 将来導入時の DDL 構成イメージ
将来 `localDatabase.ts` に導入する場合の想定コード：

```typescript
{
  version: 3,
  sql: `
    CREATE INDEX IF NOT EXISTS idx_meals_is_deleted_datetime
    ON meals(is_deleted, meal_datetime DESC);
  `,
}
```

### 9.2 DDL 実行時間（今回の実測環境における結果）
| 既存レコード数 | `CREATE INDEX IF NOT EXISTS` 所要時間 |
|---|---|
| **100 件** | **0.11 ms** |
| **1,000 件** | **0.18 ms** |
| **10,000 件** | **1.88 ms** |
| **50,000 件** | **8.79 ms** |

※ 上記は本調査の開発マシン上（ディスク・WALモード）で実測した値であり、実際のすべてのユーザー端末（多様な SoC、ストレージ性能、バックグラウンド負荷）における性能を保証するものではありません。

### 9.3 起動時ブロッキングと安全性の評価
- `applyNativeMigrations` はアプリ起動時に同期実行されますが、実測環境では 50,000 件でも約 8.8 ms で処理されました。
- Expo SQLite にはロールバック機構（ダウンマイグレーション）がないため、`CREATE INDEX IF NOT EXISTS` による冪等性の担保が必須となります。

---

## 10. 総合判断・提案

### 判断: **現時点では複合インデックスを本番DBへ導入しない（見送り）**

#### 理由
1. **実効体感差の不在**:
   - 現在のデータ規模（1,000 件以下）では、SQL 単体の絶対的な実行時間が 0.2 ms 前後であり、短縮される時間も 0.082 ms（0.1 ms 未満）です。今回の測定範囲では一覧表示のボトルネックとは考えにくく、ユーザー体感上の改善効果は極めて限定的です。
2. **不要なスキーママイグレーションの回避**:
   - 体感効果がほとんどない最適化のために本番スキーマバージョンを 2 → 3 へ繰り上げ、全ユーザー端末で DDL マイグレーションを実行するリスクを負う必要性はありません。
3. **10,000〜50,000件規模における効果**:
   - 10,000〜50,000件規模では複合インデックスの効果（4.4倍〜29倍）が明確になることが確認されました。ただし、10,000件を固定的な導入閾値とはせず、将来のデータ量、Records一覧の実測性能、ユーザー体感上の問題、関連SQLの変更状況を踏まえて再評価します。

#### 再評価のトリガー
以下の事象が発生した段階で、複合インデックスの導入を再評価します：
- データ量が 10,000〜50,000 件規模になった場合
- Records 一覧の実測性能が問題になった場合
- 一覧取得 SQL の要件が変わった場合
- 日付検索・ソート系 SQL が追加された場合
