#!/usr/bin/env bash
set -euo pipefail

# Script to create GitHub Issues from docs/issues/ definitions
# Usage: ./scripts/create-github-issues.sh

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh (GitHub CLI) is not installed." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Error: gh is not authenticated. Please run 'gh auth login' first." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ISSUES_DIR="${REPO_ROOT}/docs/issues"

echo "=== Ensuring required labels exist ==="
ensure_label() {
  local name="$1"
  local color="$2"
  local desc="$3"
  gh label create "${name}" --color "${color}" --description "${desc}" --force >/dev/null 2>&1 || true
}

ensure_label "performance" "ffb703" "Performance improvements and optimizations"
ensure_label "refactor" "8ecae6" "Code refactoring and quality improvements"
ensure_label "test" "219ebc" "Tests and testing infrastructure"
ensure_label "ci" "023047" "Continuous integration and workflow improvements"
ensure_label "chore" "b0c4de" "Routine tasks, maintenance, and dependencies"
ensure_label "database" "f77f00" "Database schemas, queries, and migrations"

echo "=== Creating GitHub Issues for Dining Memory App ==="

create_issue() {
  local title="$1"
  local file="$2"
  local labels="$3"

  echo "Creating: ${title}..."
  gh issue create \
    --title "${title}" \
    --body-file "${ISSUES_DIR}/${file}" \
    --label "${labels}"
}

create_issue "[Bug/Config] Jest テスト実行環境およびセットアップ設定の健全化" \
  "issue-01-jest-config-cleanup.md" "test,bug"

create_issue "[Chore/CI] ESLint flat config スクリプトの整理および CI フォーマットチェックの追加" \
  "issue-02-eslint-flat-config-and-format-ci.md" "ci,chore"

create_issue "[Feature/Perf] 撮影写真の保存時圧縮・リサイズ機構の導入（端末ストレージ肥大化対策）" \
  "issue-03-photo-storage-compression.md" "performance,enhancement"

create_issue "[Chore/CI] CI 実行環境の Node.js バージョン見直し（LTS 固定）" \
  "issue-04-ci-node-lts-version.md" "ci,chore"

create_issue "[Bug/Refactor] RecordsScreen の日付グルーピングにおけるタイムゾーン依存・日付再パースの改善" \
  "issue-05-records-screen-date-grouping.md" "bug,refactor"

create_issue "[Refactor] RootNavigator のタブヘッダー制御を画面ごとの宣言的設定に移行" \
  "issue-06-root-navigator-declarative-headers.md" "refactor"

create_issue "[Test] RootNavigator / App.tsx のナビゲーション結合テストの追加" \
  "issue-07-navigation-integration-test.md" "test"

create_issue "[Perf/Tech-Debt] 大量データを見据えた Keyset (Cursor) ページネーションへの移行検討" \
  "issue-08-keyset-cursor-pagination.md" "performance,refactor"

create_issue "[Perf/Database] 大量データ規模（10,000件超）における複合インデックス導入の再評価（Issue #59 フォローアップ）" \
  "issue-09-composite-index-follow-up.md" "database,performance"

create_issue "[Chore/Cleanup] src/ai/search/ 未使用空ディレクトリのクリーンアップ" \
  "issue-10-cleanup-empty-search-dir.md" "chore"

create_issue "[Chore/Config] knip.json のスキーマ定義バージョン更新 (v5 → v6)" \
  "issue-11-knip-schema-version.md" "chore"

echo "=== All issues created successfully! ==="
