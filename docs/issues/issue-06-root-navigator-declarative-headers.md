# [Refactor] RootNavigator のタブヘッダー制御を画面ごとの宣言的設定に移行

## 概要
`src/navigation/RootNavigator.tsx` の `MainTabs` コンポーネントにおいて、タブ全体の `screenOptions` 内で `headerShown: route.name !== 'Camera' && route.name !== 'Records'` という文字列比較による条件分岐を行っています。この手法は画面名変更や画面追加時の変更漏れに弱いため、各画面定義（`Tab.Screen`）における明示的な宣言へ移行することを推奨します。

## 現状の課題
1. `headerShown` の表示・非表示判定が親コンテナ側の文字列判定に集約されており、どの画面でヘッダーが非表示になるのかが各 `Tab.Screen` の記述から直感的に分かりにくい。
2. 画面名の変更やリファクタリング時に、この文字列条件の更新が漏れるリスクがある。

## 修正方針
1. `Tab.Navigator` の共通 `screenOptions` から動的判定 `headerShown: route.name !== ...` を削除し、デフォルトを `headerShown: true` とする。
2. ヘッダーを表示しない `Camera` および `Records` 画面の `Tab.Screen` オプションに `options={{ title: ..., headerShown: false }}` を明示的に設定する。

## 受入基準
- [ ] 画面ごとのヘッダー表示・非表示の挙動が現行と完全に一致していること。
- [ ] コードの可読性と保守性が向上していること。
