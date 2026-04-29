#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v rg >/dev/null 2>&1; then
  echo "error: ripgrep (rg) is required for doc drift checks." >&2
  exit 2
fi

TARGETS=(
  README.md
  TASKS.md
  PLANS.md
  docs
)

RG_ARGS=(
  --line-number
  --glob '!docs/deprecated/**'
  --glob '!docs/working/**'
)

STATUS=0

run_check() {
  local label="$1"
  local pattern="$2"
  local output

  if output="$(rg "${RG_ARGS[@]}" --regexp "$pattern" "${TARGETS[@]}")"; then
    echo "doc drift check failed: $label" >&2
    echo "$output" >&2
    STATUS=1
  fi
}

run_check \
  "legacy AI candidate-chip wording should not describe current Camera UI" \
  '料理名と料理ジャンル候補|AI candidates should appear as tappable chips|AIで候補|候補チップ'

run_check \
  "mock provider should not be described as the current runtime path" \
  'local mock provider'

run_check \
  "Phase 1 candidate contract should not be stated as current behavior" \
  '候補は `料理名` `料理ジャンル`'

if [[ "$STATUS" -ne 0 ]]; then
  echo "Review the matches above. If they are intentional historical notes, rewrite them as historical context or narrow this script." >&2
  exit "$STATUS"
fi

echo "doc drift check passed"
