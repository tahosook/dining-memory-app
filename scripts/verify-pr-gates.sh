#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# verify-pr-gates.sh
#
# Machine-enforced PR quality and governance gates:
# 1. Zero diff check: Blocks empty PRs (No actionable finding, stop without PR).
# 2. Escape hatch check: Blocks 'eslint-disable' comments to prevent suppressing static analysis.
# 3. Test protection check: Blocks deletion of test files and introduction of skipped tests.
# 4. PR body Evidence Gate: Validates mandatory sections and requires concrete Evidence.
# Note: Type safety ('any', '@ts-ignore', '@ts-nocheck') is enforced via ESLint in static-analysis.
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

# 2. Escape hatch check (eslint-disable)
# Restrict to code files (*.ts, *.tsx, *.js, *.jsx) to allow documentation references.
# Note: Type safety ('any', '@ts-ignore', '@ts-nocheck') is enforced via ESLint in static-analysis.
# 'eslint-disable' comments are blocked here to prevent suppressing ESLint itself.
CODE_ADDED_LINES=$(git diff -U0 "$TARGET_REF" -- '*.ts' '*.tsx' '*.js' '*.jsx' 2>/dev/null \
  | grep '^\+[^+]' || true)

ESCAPE_HATCH_MATCHES=$(echo "$CODE_ADDED_LINES" \
  | grep -E '(\/\/|\/\*)\s*eslint-disable' || true)

if [ -n "$ESCAPE_HATCH_MATCHES" ]; then
  echo "❌ [GATE FAIL] Escape hatch comment detected:"
  echo "$ESCAPE_HATCH_MATCHES"
  echo "   Core Principle: Machine-enforced quality. Adding 'eslint-disable' comments is blocked."
  exit 1
fi
echo "  ✓ No 'eslint-disable' escape hatches introduced."

# 3. Test protection check
# 3a. Deletion check
DELETED_TESTS=$(git diff --name-only --diff-filter=D "$TARGET_REF" -- 'tests/*' 2>/dev/null || true)

if [ -n "$DELETED_TESTS" ]; then
  echo "❌ [GATE FAIL] Deleted test file(s) detected in tests/:"
  echo "$DELETED_TESTS"
  echo "   Core Principle: Machine-enforced test protection. Deleting test files under tests/ is blocked."
  exit 1
fi
echo "  ✓ No test files deleted."

# 3b. Test weakening check (blocks it.skip, test.skip, describe.skip, xit, xdescribe)
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

# 4. PR body Evidence Gate
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

    // Evidence section aliases: Japanese, English, and agent verification terms (Measured Improvement, Benchmark)
    const evidenceHeaderTerms = "(?:客観的証拠|証拠|Evidence|Verification|Test Results?|Measured Improvement|Benchmark)";
    const evidenceSectionPattern = new RegExp(`(?:^|\\n)#{1,4}[^\\n]*?${evidenceHeaderTerms}`, "i");
    const evidenceExtractPattern = new RegExp(`(?:^|\\n)#{1,4}[^\\n]*?${evidenceHeaderTerms}[^\\n]*\\n([\\s\\S]*?)(?=(?:\\n#{1,4}\\s+|\\n---|$(?![\\s\\S])))`, "i");

    // Flexible section matching (level 1-4 headings, Japanese, English, and agent aliases like What/Why/Measured Improvement/Verification)
    const requiredSections = [
      {
        id: "problem",
        label: "### 具体的な問題 (Problem)",
        pattern: /(?:^|\n)#{1,4}[^\n]*?(?:具体的な問題|問題点?|Problem|Issue|\bWhat\b)/i,
        hint: "具体的な問題 (Problem) / Problem / 💡 What"
      },
      {
        id: "evidence",
        label: "### 客観的証拠 (Evidence)",
        pattern: evidenceSectionPattern,
        hint: "客観的証拠 (Evidence) / Evidence / 📊 Measured Improvement / Verification"
      },
      {
        id: "expected_impact",
        label: "### 期待される効果 (Expected Impact)",
        pattern: /(?:^|\n)#{1,4}[^\n]*?(?:期待される効果|効果|Expected Impact|\bImpact\b|\bWhy\b)/i,
        hint: "期待される効果 (Expected Impact) / Expected Impact / 🎯 Why"
      },
      {
        id: "out_of_scope",
        label: "### 意図して変更しなかったこと (Out of Scope)",
        pattern: /(?:^|\n)#{1,4}[^\n]*?(?:意図して変更しなかったこと|変更しなかったこと|スコープ外|Out of Scope|Non-?Goals?)/i,
        hint: "意図して変更しなかったこと (Out of Scope) / Out of Scope / Non-Goals"
      },
    ];

    const missing = [];
    for (const sec of requiredSections) {
      if (!sec.pattern.test(body)) {
        missing.push(`${sec.label} (accepted aliases: ${sec.hint})`);
      }
    }

    if (missing.length > 0) {
      console.error("❌ [GATE FAIL] PR body is missing mandatory section(s):");
      missing.forEach(m => console.error("   - " + m));
      console.error("   Rule: PR body must contain all 4 standard governance sections. See .jules/rules.md for the template.");
      process.exit(1);
    }

    // Extract Evidence section content up to the next heading or horizontal rule
    const evidenceMatch = body.match(evidenceExtractPattern);
    const rawEvidence = evidenceMatch ? evidenceMatch[1] : "";

    // Strip HTML comments <!-- ... -->
    const stripped = rawEvidence.replace(/<!--[\s\S]*?-->/g, "").trim();
    const placeholderPattern = /^(TODO|TBD|N\/?A|none|なし|null|undefined)$/i;

    if (!stripped) {
      console.error("❌ [GATE FAIL] Evidence section in PR body is empty (or contains only HTML comments).");
      console.error("   Core Principle: \"No evidence, no PR\".");
      console.error("   Provide concrete evidence (failing test, benchmark, trace, or spec/issue reference for features).");
      process.exit(1);
    }

    // Check if evidence is a placeholder (only symbols/dashes, or keywords like TODO, TBD, N/A)
    const strippedWithoutSymbols = stripped.replace(/[\s\-\*\•\d\.\:\(\)\/]+/g, "").trim();
    if (!strippedWithoutSymbols || placeholderPattern.test(strippedWithoutSymbols) || placeholderPattern.test(stripped.trim())) {
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
