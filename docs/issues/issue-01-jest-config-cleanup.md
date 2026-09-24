# [Chore/Test] Jest テスト環境設定健全化（Issue #73）

- **ステータス**: 完了 (Closed)
- **完了 PR**: PR #84

## 概要
現在、`jest.config.js` で `jest.setup.js` が読み込まれておらず（`setupFilesAfterEnv` 未設定）、また `testEnvironment: 'node'` が指定されているため、`jest-expo` の提供する React Native 向けテスト環境が一部バイパスされています。加えて、`BROWSERSLIST_IGNORE_OLD_DATA` 環境変数が `package.json` と `jest.setup.js` で重複しており、さらに `jest.setup.js` 内にプロジェクトで未導入のパッケージに対する不要なモックが残留しています。

## 現状の課題
1. **`jest.setup.js` が未ロード**:
   - `jest.config.js` に `setupFilesAfterEnv: ['<rootDir>/jest.setup.js']` が指定されていないため、セットアップファイル全体がロードされていない。
   - 各テストファイル（例: `RecordsScreen.test.tsx`）が個別にモックを宣言して回避しているが、保守性が低く設定の重複が発生している。
2. **`jest.setup.js` 内の不要・未使用モックの存在**:
   - `jest.setup.js` 内に、`package.json` に導入されていないパッケージのモックが定義されている：
     - `@react-native-async-storage/async-storage`（Expo SQLite を利用しており未導入）
     - `lodash`（未導入）
     - `expo-router`（React Navigation を利用しており未導入）
   - 単に setup ファイルを読み込むだけでは不要モックが残り続け、将来のテスト動作やデバッグ時の混乱を招くリスクがある。
3. **`testEnvironment: 'node'` の指定**:
   - React Native / Expo のコンポーネントテストにおいて、`jest-expo` プリセットの環境とコンフリクトする可能性がある。
4. **環境変数指定の重複**:
   - `package.json` の `"test": "BROWSERSLIST_IGNORE_OLD_DATA=1 jest"` と `jest.setup.js` の `process.env.BROWSERSLIST_IGNORE_OLD_DATA = 'true'` が二重に存在する。

## 修正方針
1. `jest.config.js` に `setupFilesAfterEnv: ['<rootDir>/jest.setup.js']` を追加する。
2. `jest.setup.js` 内のモックを精査し、未導入パッケージ（`async-storage`, `lodash`, `expo-router` 等）の不要・死んだモックを削除・整理する（意図的に残すモックがある場合は理由コメントを付記する）。
3. `jest.config.js` から不要な `testEnvironment: 'node'` を見直し、`jest-expo` の推奨設定に準拠させる。
4. `package.json` の test コマンドから `BROWSERSLIST_IGNORE_OLD_DATA=1` を削除し、`jest.setup.js` 側へ一元化する。
5. 既存テストスイート全 28 件が正常に PASS することを確認する。

## 受入基準
- [x] `jest.setup.js` のモックがテスト実行時に確実にロードされていること。
- [x] `jest.setup.js` 内に未導入パッケージへの不要な死んだモックが残っていないこと（または残す意図がコメントで説明されていること）。
- [x] `package.json` のテストスクリプトおよび環境変数設定が簡素化されていること。
- [x] `npm test` で既存テストスイート全件が正常に PASS すること。
