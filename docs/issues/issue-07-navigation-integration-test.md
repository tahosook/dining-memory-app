# [Test] RootNavigator / App.tsx のナビゲーション結合テストの追加

## 概要
現在、`src/screens/` 配下の各画面に対する単体テストは充実していますが、アプリ全体のルーティングを束ねる `RootNavigator.tsx` およびエントリーポイントである `App.tsx` に対する結合テストが存在しません。タブの切り替えやスタック画面（`MealDetail` 等）の導線が壊れていないかを検証するテストを追加します。

## 現状の課題
1. `src/navigation/RootNavigator.tsx` にテストが存在しないため、タブナビゲーションの初期表示タブ、タブアイコン、スタック遷移の設定ミスを自動検知できない。
2. ナビゲーションライブラリのバージョン更新時（React Navigation v7 など）に、ルーティング設定が壊れていないかを保証するセーフティネットが不足している。

## 修正方針
1. `tests/RootNavigator.test.tsx` を新規作成する。
2. NavigationContainer を用いて `RootNavigator` をレンダリングし、以下を検証する：
   - デフォルトで初期タブ（Camera）が表示されること。
   - 5つの主要タブ（Camera, Records, Search, Stats, Settings）が存在し、切り替え可能であること。
   - `MealDetail` がタブの外側（親スタック）に正しくマッピングされていること。

## 受入基準
- [x] `RootNavigator.test.tsx` が作成され、CI 上でパスすること。
- [x] ナビゲーションの基本構造に対するリグレッションを自動検知できること。
