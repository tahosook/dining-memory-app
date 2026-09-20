# [Chore/CI] ESLint flat config スクリプトの整理および CI フォーマットチェックの追加

## 概要
ESLint v9（Flat Config）を採用しているにもかかわらず、`package.json` のスクリプトで v8 以前の `--ext` オプションが残存しています。また、プロジェクトに Prettier の設定が存在するものの、CI（`.github/workflows/ci.yml`）でコードフォーマットのチェックが実行されていません。

## 現状の課題
1. **廃止された CLI オプションの使用**:
   - `package.json` の `lint` / `lint:fix` で `--ext .ts,.tsx` が指定されている。
   - Flat config (`eslint.config.js`) では対象ファイル拡張子は `files` 設定で管理されるため、CLI オプションとしての `--ext` は不要・非推奨である。
2. **CI での Prettier 検証漏れ**:
   - `npm run format`（`prettier --write ...`）が定義されているが、CI ワークフローでは `npm run lint` のみ実行されており、未フォーマットコードがマージされる可能性がある。

## 修正方針
1. `package.json` の `lint` および `lint:fix` スクリプトから `--ext .ts,.tsx` を削除する。
2. `package.json` にフォーマット検証用スクリプト（例: `"format:check": "prettier --check \"src/**/*.{ts,tsx}\" \"tests/**/*.{ts,tsx}\""`）を追加する。
3. `.github/workflows/ci.yml` の `lint` ジョブにフォーマット検証ステップを追加する。

## 受入基準
- [ ] `npm run lint` が警告なく実行できること。
- [ ] `npm run format:check` でフォーマット不整合を検知できること。
- [ ] CI 上で lint と format 検証が実行されること。
