# [Chore/Config] knip.json のスキーマ定義バージョン更新 (v5 → v6)

- **内部ドキュメントID**: issue-11
- **対応 GitHub Issue**: GitHub Issue #83
- **ステータス**: 完了 (Closed)
- **完了 PR**: PR #84

## 概要
`knip.json` の `$schema` プロパティが `https://unpkg.com/knip@5/schema.json`（v5 用スキーマ）を指定していますが、`package.json` で導入されている Knip のバージョンは `^6.36.0`（v6）です。エディタでの補完や検証を正しく機能させるため、スキーマ URL を v6 に更新します。

## 現状の課題
1. メジャーバージョン不一致により、エディタ（VS Code 等）の JSON スキーマ検証で無効な警告が出たり、Knip v6 の新規設定プロパティの補完が効かない可能性がある。

## 修正方針
1. `knip.json` の `$schema` を `https://unpkg.com/knip@6/schema.json` に更新する。
2. `npm run check:deps` を実行し、正常に動作することを確認する。

## 受入基準
- [x] `knip.json` の `$schema` が v6 を参照していること。
- [x] `npm run check:deps` がエラーなく実行されること。
