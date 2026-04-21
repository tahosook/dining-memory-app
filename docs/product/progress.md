# 実装進捗

## Meta
- Purpose: 現在の実装進捗と、今使える機能の範囲を整理する。
- Audience: プロダクト確認者、オーナー、将来の判断に関わる人。
- Update trigger: 実装済み機能、未実装機能、優先順位、マイルストーンが変わったとき。
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/index.md](../index.md), [docs/product/overview.md](overview.md), [docs/architecture/tech-spec.md](../architecture/tech-spec.md)

この文書は、現在の実装進捗を日本語で確認するための文書です。

## Summary
Dining Memory は、撮影して保存し、一覧・検索・簡易統計で振り返るところまでが動く段階にあります。
review 画面には、tap-to-apply only の AI 入力補助が入り、real local runtime path も app-local model / projector がある build で使える状態になりました。
AI 実行中は current stage、進捗の目安、残り時間の目安を review 上に表示し、review 中は live camera preview を止めて端末負荷を抑えます。
Settings には local AI の事前許可、meal input assist model のダウンロード管理、local AI runtime status が入り、条件を満たさない build では引き続き disabled reason を返します。
本格的な AI 解析、クラウドバックアップ、データエクスポートはまだ実装していません。
一覧の詳細画面から、明示的な操作で X 共有に進む最小導線を持っています。

## 現在使える機能
- カメラで写真を撮影し、内容を確認してから保存する
- 初回のカメラ利用時に、最小限の権限説明を見てから撮影を始める
- 料理名、料理ジャンル、場所、メモ、自炊フラグを付けて記録する
- review 画面で、明示操作に限って AI 候補を取得し、料理名と料理ジャンル候補を入力へ反映する
- 記録一覧を日付ごとに見返し、詳細画面で大きい写真を確認する
- 記録を詳細画面から編集・削除する
- 記録詳細から、共有シート経由で気に入った写真だけ X 投稿に進む
- テキスト検索、料理ジャンル、場所フィルター、自炊フィルターで探し、結果からそのまま編集・削除する
- 総記録数、自炊比率、よく記録する料理ジャンル・場所を確認し、更新失敗時は再試行する
- 設定画面でプライバシー方針、meal input assist model の導入状態、local AI runtime status、ローカルデータ削除を確認する

## 機能ごとの進捗
### 完了
- 撮影から保存までの基本フロー
- 記録一覧の表示、編集、削除
- 基本検索
- 簡易統計
- 設定画面の最小構成
- ローカル保存を前提にしたデータアクセス層

### 一部実装
- AI 入力補助
  - 現在は review 画面の user-triggered な候補提案のみ
  - running 中は current stage、進捗の目安、残り時間の目安を表示する
  - Settings の opt-in と `app_settings` 保存あり
  - model / projector は Settings から direct URL を使って端末へ明示ダウンロードする
  - supported device/runtime と app-local model / projector が揃う build では `llama.rn` の real local runtime を使う
  - MediaPipe custom food classifier 向け static-image classification groundwork は追加済みだが、native bridge と runtime readiness wiring は未接続
  - capture review 中は live camera preview を止め、AI 解析時の memory pressure を下げる
  - 条件を満たさない build では disabled reason を返し、manual save はそのまま使える
  - Settings で meal input assist model の導入状態、ready / unavailable reason、固定 model path を確認できる
- 統計
  - 現在は軽量なサマリーのみ
- 検索
  - text、料理ジャンル、場所、自炊フィルターを使う local text/filter path まで
- 画像表示
  - サムネイル生成は未実装で、保存画像のフォールバック表示を使う

### 未実装
- 自動的な AI 解析
- クラウドバックアップ
- データエクスポート / 復元
- 高度な行動パターン分析
- 栄養情報推定
- レシピ提案

## 現在の実装範囲
### Camera
- 明示的なカメラ権限リクエスト
- 権限拒否時の設定アプリ導線
- 写真撮影
- 撮影後レビュー
- review 上の AI 候補提案ボタンと候補チップ
- 保存前に 1600x1200 / JPEG 圧縮で端末内向けに軽量化
- 手動入力
- 保存後に Records へ即時遷移

### Records
- 日付グループ表示
- 詳細画面
- 編集 / 削除
- 明示的な X 共有導線
- 保存画像の表示

### Search
- テキスト検索
- 料理ジャンルフィルター
- 場所フィルター
- 自炊のみフィルター
- 検索結果からの詳細画面遷移
- loading / error / zero-result 表示
- エラー時の再試行導線

### Stats
- 総記録数
- 自炊 / 外食件数
- 自炊比率
- よく記録する料理ジャンル・場所
- loading / error 表示
- エラー時の再試行導線

### Settings
- プライバシー説明
- meal input assist model の status 表示
- model のダウンロード / 再ダウンロード / 削除
- local AI runtime status 表示
- 現在の機能範囲の説明
- ローカルデータ削除
- アプリ情報

## 未実装 / 構想中
- ローカル AI による料理認識
- クラウド API を使った補完解析
- 検索 quality 改善
- バックアップ、エクスポート、復元
- より深い統計・傾向分析

## 次に進める候補
- バックアップとエクスポートの優先順位を決める
- 統計をもう少し実用的にする
- 記録作成フローの入力補助を増やす
- AI 解析を入れる前に必要な最小データ項目を再確認する
