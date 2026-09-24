# [CI] CI Node.js バージョンの LTS 固定（Issue #76）

- **ステータス**: 完了 (Closed)
- **完了 PR**: PR #84

## 概要
現在、`.github/workflows/ci.yml` において Node.js のバージョンが `25.9.0` に固定されています。Node.js 25 は奇数番号リリースであり、既に **2026年6月1日に EOL（End of Life / サポート終了）** を迎えています。現在サポート切れのランタイムを CI で使用している状態を解消し、長期安定運用のために LTS（Long Term Support）バージョンへ移行します。

## 現状の課題
1. **Node 25 は既に EOL 済み**:
   - 2026-06-01 に公式サポートが終了しており、セキュリティパッチやバグ修正が提供されないサポート切れの環境で CI パイプラインが動作している。
2. **ビルド安定性とライブラリ互換性のリスク**:
   - サポート終了に伴い、最新の依存パッケージや GitHub Actions 環境との非互換・突然のビルド障害が発生するリスクがある。

## 修正方針
1. `.github/workflows/ci.yml` 内の `node-version: 25.9.0`（lint, type-check, test ジョブ）を LTS バージョンへ変更する。
   - **推奨バージョン**:
     - 第一候補: `24.x`（Active LTS）
     - 次点: `22.x`（Maintenance LTS）
     - （※ 将来の 26.x も視野に入るが、現時点で安定した LTS リリースを優先する）
2. 変更後の Node.js バージョンで `npm ci`, `npm run lint`, `npm run type-check`, `npm test` が全て正常に通過することを確認する。

## 受入基準
- [x] `.github/workflows/ci.yml` でサポート中の LTS Node.js バージョン（推奨: `24.x` または `22.x`）が指定されていること。
- [x] 全 CI ジョブ（lint, type-check, test）が安定してグリーンになること。
