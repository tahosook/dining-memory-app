#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# verify-pr-gates.sh
#
# Machine-enforced PR quality and governance gates:
# 1. Zero diff check: Blocks empty PRs (No actionable finding, stop without PR).
# 2. New 'any' check: Blocks additions of ': any', 'as any', 'any[]', 'Array<any>', etc.
# 3. Escape hatches check: Blocks additions of '@ts-ignore', '@ts-nocheck', 'eslint-disable'.
# 4. Test protection check: Blocks deletion of test files and introduction of skipped tests.
# 5. PR body Evidence Gate: Validates mandatory sections and non-empty Evidence in PR body.
# -----------------------------------------------------------------------------

TARGET_REF=""
PR_BODY_INPUT="${PR_BODY:-}"
PR_BODY_FILE="${PR_BODY_FILE:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr-body)
      PR_BODY_INPUT="$2"
      shift 2
      ;;
    --pr-body-file)
      PR_BODY_FILE="$2"
      shift 2
      ;;
    *)
      if [ -z "$TARGET_REF" ]; then
        TARGET_REF="$1"
      fi
      shift
      ;;
  esac
done

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

# 2. New 'any' / type assertion check
# Restrict to code files (*.ts, *.tsx, *.js, *.jsx) to allow documentation references.
# Blocks: ': any', 'as any', 'any[]', 'Array<any>', 'Promise<any>', 'Record<..., any>', '<any>'
NEW_ANY_MATCHES=$(git diff -U0 "$TARGET_REF" -- '*.ts' '*.tsx' '*.js' '*.jsx' 2>/dev/null \
  | grep '^\+[^+]' \
  | grep -E '(\bas\s+any\b|:\s*any\b|\bany\[\]|\bArray<any>|\bPromise<any>|\bRecord<[^>]*,\s*any>|<any>|<[^>]*[,\s]any[,\s>])' || true)

if [ -n "$NEW_ANY_MATCHES" ]; then
  echo "❌ [GATE FAIL] New 'any' type annotation, generic, array, or cast detected:"
  echo "$NEW_ANY_MATCHES"
  echo "   Core Principle: Machine-enforced typing. Introducing 'any' types is blocked."
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

# 4. Test protection check
# 4a. Deletion check
DELETED_TESTS=$(git diff --name-only --diff-filter=D "$TARGET_REF" -- 'tests/*' 2>/dev/null || true)

if [ -n "$DELETED_TESTS" ]; then
  echo "❌ [GATE FAIL] Deleted test file(s) detected in tests/:"
  echo "$DELETED_TESTS"
  echo "   Core Principle: Machine-enforced test protection. Deleting test files under tests/ is blocked."
  exit 1
fi
echo "  ✓ No test files deleted."

# 4b. Test weakening check (blocks it.skip, test.skip, describe.skip, xit, xdescribe)
TEST_WEAKENING_MATCHES=$(git diff -U0 "$TARGET_REF" -- 'tests/*' 2>/dev/null \
  | grep '^\+[^+]' \
  | grep -E '(\b(it|test|describe)\.skip\b|\b(xit|xdescribe)\s*\()' || true)

if [ -n "$TEST_WEAKENING_MATCHES" ]; then
  echo "❌ [GATE FAIL] Test skipping / weakening detected in tests/:"
  echo "$TEST_WEAKENING_MATCHES"
  echo "   Core Principle: Machine-enforced test integrity. Adding it.skip, test.skip, describe.skip, xit, or xdescribe is blocked."
  exit 1
fi
echo "  ✓ No skipped or weakened tests introduced."

# 5. PR body Evidence Gate
# Resolve PR body from stdin, file, environment, or GitHub Actions event file if not explicitly passed
if [ "$PR_BODY_FILE" = "-" ]; then
  PR_BODY_INPUT=$(cat)
elif [ -n "$PR_BODY_FILE" ] && [ -f "$PR_BODY_FILE" ]; then
  PR_BODY_INPUT=$(cat "$PR_BODY_FILE")
elif [ -z "$PR_BODY_INPUT" ] && [ -n "${GITHUB_EVENT_PATH:-}" ] && [ -f "$GITHUB_EVENT_PATH" ]; then
  PR_BODY_INPUT=$(node -e '
    try {
      const ev = JSON.parse(require("fs").readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
      if (ev.pull_request && typeof ev.pull_request.body === "string") {
        process.stdout.write(ev.pull_request.body);
      }
    } catch (_) {}
  ')
fi

if [ -n "$PR_BODY_INPUT" ]; then
  echo "🔍 Verifying PR body Evidence Gate..."
  node -e '
    const body = process.argv[1] || "";

    // Flexible section matching (level 2 or 3 headings, optional numbering, Japanese and English labels)
    const requiredSections = [
      { id: "problem", label: "### 具体的な問題 (Problem)", pattern: /(?:^|\n)#{2,3}\s*(?:(?:\d+\.\s*)?具体的な問題\s*\(Problem\)|Problem\b)/i },
      { id: "evidence", label: "### 客観的証拠 (Evidence)", pattern: /(?:^|\n)#{2,3}\s*(?:(?:\d+\.\s*)?客観的証拠\s*\(Evidence\)|Evidence\b)/i },
      { id: "expected_impact", label: "### 期待される効果 (Expected Impact)", pattern: /(?:^|\n)#{2,3}\s*(?:(?:\d+\.\s*)?期待される効果\s*\(Expected Impact\)|Expected Impact\b)/i },
      { id: "out_of_scope", label: "### 意図して変更しなかったこと (Out of Scope)", pattern: /(?:^|\n)#{2,3}\s*(?:(?:\d+\.\s*)?意図して変更しなかったこと\s*\(Out of Scope\)|Out of Scope\b)/i },
    ];

    const missing = [];
    for (const sec of requiredSections) {
      if (!sec.pattern.test(body)) {
        missing.push(sec.label);
      }
    }

    if (missing.length > 0) {
      console.error("❌ [GATE FAIL] PR body is missing mandatory section(s):");
      missing.forEach(m => console.error("   - " + m));
      console.error("   Rule: PR body must contain all 4 standard governance sections.");
      process.exit(1);
    }

    // Extract Evidence section content up to the next heading or horizontal rule
    const evidenceMatch = body.match(/(?:^|\n)#{2,3}\s*(?:(?:\d+\.\s*)?客観的証拠\s*\(Evidence\)|Evidence\b)[^\n]*\n([\s\S]*?)(?=(?:\n#{2,3}\s+|\n---|$(?![\s\S])))/i);
    const rawEvidence = evidenceMatch ? evidenceMatch[1] : "";

    // Strip HTML comments <!-- ... -->
    const stripped = rawEvidence.replace(/<!--[\s\S]*?-->/g, "").trim();

    if (!stripped) {
      console.error("❌ [GATE FAIL] Evidence section in PR body is empty (or contains only HTML comments).");
      console.error("   Core Principle: \"No evidence, no PR\".");
      console.error("   Provide concrete evidence (failing test, benchmark, trace, or spec/issue reference for features).");
      process.exit(1);
    }

    // Check if evidence contains only symbols, dashes, bullets, or whitespace
    const strippedWithoutSymbols = stripped.replace(/[\s\-\*\•\d\.\:\(\)\/]+/g, "").trim();
    if (!strippedWithoutSymbols) {
      console.error("❌ [GATE FAIL] Evidence section contains only a placeholder (\"" + stripped + "\").");
      console.error("   Core Principle: \"No evidence, no PR\". Genuine verification evidence is required.");
      process.exit(1);
    }

    // Check for common placeholders: TODO, TBD, N/A, NA, none, なし
    const placeholderPattern = /^(TODO|TBD|N\/?A|none|なし|null|undefined)$/i;
    if (placeholderPattern.test(strippedWithoutSymbols) || placeholderPattern.test(stripped.trim())) {
      console.error("❌ [GATE FAIL] Evidence section contains only a placeholder (\"" + stripped + "\").");
      console.error("   Core Principle: \"No evidence, no PR\". Genuine verification evidence is required.");
      process.exit(1);
    }

    console.log("  ✓ PR body Evidence Gate passed (all 4 sections present with valid evidence content).");
  ' "$PR_BODY_INPUT"
else
  if [ "${GITHUB_ACTIONS:-false}" = "true" ] && [ "${GITHUB_EVENT_NAME:-}" = "pull_request" ]; then
    echo "❌ [GATE FAIL] PR body could not be resolved in CI pull_request event."
    echo "   Ensure PR body is provided or GITHUB_EVENT_PATH is accessible."
    exit 1
  else
    echo "  ℹ PR body not provided; skipping Evidence Gate (local diff-only mode)."
  fi
fi

echo "✅ All PR machine gates passed successfully for $TARGET_REF."
exit 0
