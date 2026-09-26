#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# verify-pr-gates.sh
#
# Machine-enforced PR quality and governance gates:
# 1. Zero diff check: Blocks empty PRs (No actionable finding, stop without PR).
# 2. New 'any' check: Blocks additions of ': any' or 'as any' in code files.
# 3. Escape hatches check: Blocks additions of '@ts-ignore', '@ts-nocheck', 'eslint-disable'.
# 4. Test deletion check: Blocks deletion of test files under tests/.
# -----------------------------------------------------------------------------

TARGET_REF="${1:-}"

if [ -z "$TARGET_REF" ]; then
  if git rev-parse --verify origin/main >/dev/null 2>&1; then
    TARGET_REF="origin/main...HEAD"
  elif git rev-parse --verify main >/dev/null 2>&1; then
    TARGET_REF="main...HEAD"
  else
    TARGET_REF="HEAD~1...HEAD"
  fi
fi

echo "🔍 Verifying PR machine gates for target: $TARGET_REF"

# 1. Zero diff check
# In git diff, --quiet exits with 0 if no diff, 1 if diff exists.
if git diff --quiet "$TARGET_REF" 2>/dev/null; then
  echo "❌ [GATE FAIL] Zero diff detected in $TARGET_REF."
  echo "   Core Principle: 'No actionable finding, stop'."
  echo "   Do not manufacture changes or submit empty PRs when no safe action is required."
  exit 1
fi
echo "  ✓ Non-zero diff verified."

# 2. New 'any' check
# Restrict to code files (*.ts, *.tsx, *.js, *.jsx) to allow documentation references.
NEW_ANY_MATCHES=$(git diff -U0 "$TARGET_REF" -- '*.ts' '*.tsx' '*.js' '*.jsx' 2>/dev/null \
  | grep '^\+[^+]' \
  | grep -E '(\bas\s+any\b|:\s*any\b)' || true)

if [ -n "$NEW_ANY_MATCHES" ]; then
  echo "❌ [GATE FAIL] New 'any' type annotation or cast detected:"
  echo "$NEW_ANY_MATCHES"
  echo "   Core Principle: Machine-enforced typing. Adding ': any' or 'as any' is blocked."
  exit 1
fi
echo "  ✓ No new 'any' types introduced."

# 3. Escape hatches check
ESCAPE_HATCH_MATCHES=$(git diff -U0 "$TARGET_REF" -- '*.ts' '*.tsx' '*.js' '*.jsx' 2>/dev/null \
  | grep '^\+[^+]' \
  | grep -E '(@ts-ignore|@ts-nocheck|eslint-disable)' || true)

if [ -n "$ESCAPE_HATCH_MATCHES" ]; then
  echo "❌ [GATE FAIL] Escape hatch comment detected:"
  echo "$ESCAPE_HATCH_MATCHES"
  echo "   Core Principle: Machine-enforced quality. Adding '@ts-ignore', '@ts-nocheck', or 'eslint-disable' is blocked."
  exit 1
fi
echo "  ✓ No escape hatches introduced."

# 4. Test deletion check
DELETED_TESTS=$(git diff --name-status "$TARGET_REF" 2>/dev/null \
  | grep -E '^D[[:space:]]+tests/' || true)

if [ -n "$DELETED_TESTS" ]; then
  echo "❌ [GATE FAIL] Deleted test file(s) detected:"
  echo "$DELETED_TESTS"
  echo "   Core Principle: Machine-enforced test protection. Deleting test files under tests/ is blocked."
  exit 1
fi
echo "  ✓ No test files deleted."

echo "✅ All PR machine gates passed successfully for $TARGET_REF."
exit 0
