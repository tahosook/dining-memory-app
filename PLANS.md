# MVP Completion Plan

## Meta
- Purpose: MVP 完了に向けた直近の実装計画をまとめる。
- Audience: オーナー、実装担当、Codex。
- Update trigger: 次の実装優先順位または実装方針が変わったとき。
- Related docs: [AGENTS.md](AGENTS.md), [docs/product/overview.md](docs/product/overview.md), [docs/product/progress.md](docs/product/progress.md), [docs/ux/user-flows.md](docs/ux/user-flows.md), [docs/ux/screen-designs.md](docs/ux/screen-designs.md)

## Summary
MVP の「撮る -> 探す -> 開く -> 直す」と「失敗時に詰まらない」を締めるため、次の 2 項目を実装する。

1. Search 結果から記録を開けるようにする
2. Search / Stats の loading / error / zero-result 表示を整える

この計画では、新しい詳細画面や新規 DB スキーマは追加しない。既存の Records の編集・削除体験を Search に広げ、状態表示を明示することで MVP を完成形に近づける。

## Current State
- Search は検索実行と一覧表示まではできるが、結果カードから記録を開けない。
- Search は失敗時のユーザー向けエラー表示がなく、初回 loading と zero-result の区別も弱い。
- Stats は集計表示はできるが、失敗時は console 出力だけで、ユーザー向け回復導線がない。
- Records には Alert ベースの記録操作と編集モーダルがあり、Search 側で再利用できる土台がある。

## Decisions / Rules
- Search からの「開く」は新しい詳細画面ではなく、Records と同等の Alert + 編集 / 削除で実装する。
- 編集 UI は Search と Records で同じものを使うため、共通の `MealEditModal` に切り出す。
- Search / Stats の状態表示は、`loading` `error` `zero-result` を区別し、初回ロード前の誤表示を避ける。
- Service / DB schema / navigation shell の変更は行わない。
- 新規依存は追加しない。

## Implementation Plan
### 1. Search 結果から記録を開く
- `SearchScreen` の結果カードを `TouchableOpacity` に変更し、タップで記録詳細 Alert を開く。
- Alert の表示項目は `料理名 / 撮影日時 / 場所 / 料理ジャンル / 自炊/外食 / メモ` に揃える。
- Alert のアクションは `編集 / 削除 / 閉じる` にする。
- `SearchScreen` に以下の state を追加する。
  - `selectedMeal`
  - `editingMeal`
  - `editMealName`
  - `editCuisineType`
  - `editLocation`
  - `editNotes`
  - `editHomemade`
- Records の編集 UI を共通化し、`MealEditModal` を作る。
- Search 側の保存は `MealService.updateMeal` を呼び、成功後に `runSearch()` を再実行する。
- Search 側の削除は `MealService.softDeleteMeal` を呼び、成功後に `runSearch()` を再実行する。
- `RecordsScreen` も `MealEditModal` を使う形に寄せ、既存挙動を維持する。

### 2. Search の state 表示を整える
- `SearchScreen` に以下の state を追加する。
  - `errorMessage: string | null`
  - `hasLoadedOnce: boolean`
- `runSearch()` のルールを以下に固定する。
  - 開始時に `loading = true`, `errorMessage = null`
  - 成功時に `results` 更新, `hasLoadedOnce = true`
  - 失敗時に `errorMessage` をセットし、既存結果は保持する
  - 終了時に `loading = false`
- 表示ルールは以下とする。
  - 初回ロード中かつ結果なし: loading card
  - エラーありかつ結果なし: error card + `再試行`
  - エラーありかつ結果あり: 結果を残しつつ inline error card
  - ロード完了後に結果 0 件: zero-result card
- 件数表示は以下とする。
  - 読み込み中: `読み込み中...`
  - エラー時: `更新失敗`
  - 通常時: `N件`

### 3. Stats の state 表示を整える
- `StatsScreen` に `loading` と `errorMessage` を追加する。
- `loadStats()` のルールを以下に固定する。
  - 開始時に `loading = true`, `errorMessage = null`
  - 成功時に `stats` 更新
  - 失敗時に `errorMessage` をセットし、既存 stats は保持する
  - 終了時に `loading = false`
- 表示ルールは以下とする。
  - 初回ロード中: loading card
  - エラーかつ `stats.totalMeals === 0`: error card + `再試行`
  - エラーかつ既存 stats あり: 集計カードを残して inline error card
  - 通常時: 現在の summary cards
- 再訪時の更新中は既存 stats を消さず、補助テキストだけ `更新中...` に切り替える。

### 4. UI 共通化
- 新規共通コンポーネントは次の 2 つまでに絞る。
  - `MealEditModal`
  - `ScreenStateCard` または同等の軽量 state card
- Search / Stats の loading / error card は同じ見た目に揃える。
- `CuisineTypeSelector` は既存のものをそのまま再利用する。

## Test Plan
- `SearchScreen.test.tsx`
  - 結果カード押下で Alert が開く
  - Alert の `編集` からモーダルが開く
  - 編集保存で `MealService.updateMeal` が呼ばれ、検索が再実行される
  - Alert の `削除` で `MealService.softDeleteMeal` が呼ばれ、検索が再実行される
  - 初回 loading state が表示される
  - エラー時に error card と `再試行` が表示される
  - エラー時に既存結果があれば一覧を残す
- `StatsSettingsScreens.test.tsx`
  - 初回 loading state が表示される
  - エラー時に error card と `再試行` が表示される
  - 既存 stats がある状態で更新失敗した場合、summary を残して error card を出す
- `RecordsScreen.test.tsx`
  - 共通モーダル化後も既存の編集挙動が維持される
- 必要なら `MealEditModal` 単体テストを追加する。

## Assumptions
- この計画では新しい詳細画面は作らない。
- Search からの「開く」は Records と同等の Alert + 編集 / 削除で満たす。
- 既存の `MealService` だけで実装可能で、サービス API 追加は不要。
- 実装と同時に `docs/product/progress.md` `docs/ux/user-flows.md` `docs/ux/screen-designs.md` を更新する。
