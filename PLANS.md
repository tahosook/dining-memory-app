# 正本準拠の実装整合化計画

## Scope
- 対象: canonical docs を基準にした永続化基盤、Camera の保存フロー、Records / Search / Stats / Settings の実データ接続、README の進捗表現更新。
- 非対象: AI 解析、クラウドバックアップ、データエクスポート、セマンティック検索、大規模なナビゲーション再設計、schema の大幅拡張。

## Doc vs Impl Gaps
- Product Overview / meal record save: 撮影した食事を記録として保存できること / カメラは写真ライブラリ保存で完了する / 撮影後に確認して meal record を保存するフローへ変更する。
- Tech Spec / local database primary: 端末内 DB が主データ源であること / DB は無効化され global mock に置き換えられている / native は SQLite、web/test は同一 API の軽量 in-memory 実装へ置き換える。
- User Flows / capture a meal: 撮影→確認→編集→保存→Records 遷移があること / 撮影後の確認・保存ステップがない / Camera review overlay と保存アクションを追加する。
- Screen Designs / Records: 日付グループの記録一覧と編集削除があること / 一覧は mock service 依存、編集は未実装 / 実データ読み込み、modal 編集、削除の実処理を入れる。
- Screen Designs / Search: text と basic filters で検索できること / hardcoded 候補と結果のみ / 実検索と 0 件状態に切り替える。
- Tech Spec / Stats: compact summary cards を表示すること / 仮データの分析カードが並ぶ / 実データ summary のみ表示する。
- Tech Spec / Settings: privacy-first で現在使える設定だけを見せること / backup/export を実機能のように見せている / 実機能を local data delete と app info 中心に絞る。
- README / progress: 実装済み範囲だけを案内すること / Search, Stats, Settings, DB が実態以上に完成扱い / 整合化後の実装状態に合わせて更新する。

## Execution Checklist
- [x] `PLANS.md` を作成し、このファイルを単一の進行管理にする
- [x] local database service を実装し、native SQLite と web/test in-memory adapter を用意する
- [x] `MealService` を mock 実装から実データ実装へ置き換える
- [x] `DatabaseProvider` と `App.tsx` を実データ初期化前提に更新する
- [x] Camera に review/save overlay を追加し、保存後の分岐を実装する
- [x] Records を実データ読み込み、編集、削除対応に更新する
- [x] Search を実検索 + basic filters に更新する
- [x] Stats を summary-only の実データ表示に更新する
- [x] Settings を privacy-first の current scope に絞る
- [x] README の進捗と機能説明を実態に合わせて更新する
- [x] サービス / 画面テストを追加または更新する
- [x] `type-check`, `test`, `lint` を実行して結果を記録する

## Verification
- [x] `npm run type-check`
- [x] `npm test -- --runInBand`
- [x] `npm run lint`

### Results
- `npm run type-check`: pass
- `npm test -- --runInBand`: pass (5 suites, 23 tests)
- `npm run lint`: pass with warnings only
  - `src/navigation/RootNavigator.tsx`
  - `src/navigation/TabNavigator.tsx`
  - `src/screens/RecordsScreen/RecordsScreen.tsx`
