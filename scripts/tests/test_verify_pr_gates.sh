#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# test_verify_pr_gates.sh
# Direct lightweight verification test for verify-pr-gates.sh
# -----------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
GATE_SCRIPT="$ROOT_DIR/scripts/verify-pr-gates.sh"

echo "=== Running verify-pr-gates.sh direct test suite ==="

valid_problem="### 具体的な問題 (Problem)\nIssue description here"
valid_evidence="### 客観的証拠 (Evidence)\nBenchmark shows 45ms -> 12ms, test passing."
valid_impact="### 期待される効果 (Expected Impact)\nReduced latency."
valid_out_of_scope="### 意図して変更しなかったこと (Out of Scope)\nNo database schema changes."

full_valid_body=$(printf "%b\n\n%b\n\n%b\n\n%b" "$valid_problem" "$valid_evidence" "$valid_impact" "$valid_out_of_scope")

# 1. Evidence あり -> PASS
echo -n "Test 1: Valid Evidence present -> "
output=$(bash "$GATE_SCRIPT" "HEAD~1...HEAD" --pr-body "$full_valid_body" 2>&1) || { echo "FAILED"; echo "$output"; exit 1; }
echo "PASS"

# 2. Evidence セクションなし -> FAIL
echo -n "Test 2: Missing Evidence section -> "
no_evidence_body=$(printf "%b\n\n%b\n\n%b" "$valid_problem" "$valid_impact" "$valid_out_of_scope")
if bash "$GATE_SCRIPT" "HEAD~1...HEAD" --pr-body "$no_evidence_body" >/dev/null 2>&1; then
  echo "FAILED (expected failure)"; exit 1
else
  echo "PASS (failed as expected)"
fi

# 3. Evidence が空 -> FAIL
echo -n "Test 3: Empty Evidence -> "
empty_evidence_body=$(printf "%b\n\n### 客観的証拠 (Evidence)\n\n%b\n\n%b" "$valid_problem" "$valid_impact" "$valid_out_of_scope")
if bash "$GATE_SCRIPT" "HEAD~1...HEAD" --pr-body "$empty_evidence_body" >/dev/null 2>&1; then
  echo "FAILED (expected failure)"; exit 1
else
  echo "PASS (failed as expected)"
fi

# 4. Evidence が HTML コメントだけ -> FAIL
echo -n "Test 4: Evidence with only HTML comments -> "
html_comment_body=$(printf "%b\n\n### 客観的証拠 (Evidence)\n<!-- テストログなど -->\n\n%b\n\n%b" "$valid_problem" "$valid_impact" "$valid_out_of_scope")
if bash "$GATE_SCRIPT" "HEAD~1...HEAD" --pr-body "$html_comment_body" >/dev/null 2>&1; then
  echo "FAILED (expected failure)"; exit 1
else
  echo "PASS (failed as expected)"
fi

# 5. Evidence が TODO/TBD/N/A だけ -> FAIL
echo -n "Test 5: Evidence with only placeholder -> "
for ph in "TODO" "TBD" "N/A" "NA" "-" "none" "なし"; do
  ph_body=$(printf "%b\n\n### 客観的証拠 (Evidence)\n%s\n\n%b\n\n%b" "$valid_problem" "$ph" "$valid_impact" "$valid_out_of_scope")
  if bash "$GATE_SCRIPT" "HEAD~1...HEAD" --pr-body "$ph_body" >/dev/null 2>&1; then
    echo "FAILED on $ph (expected failure)"; exit 1
  fi
done
echo "PASS (all placeholders failed as expected)"

# 6. Feature/Spec + Issue/Spec 参照 -> PASS
echo -n "Test 6: Feature/Spec PR with issue/spec reference -> "
feature_spec_body=$(printf "%b\n\n### 客観的証拠 (Evidence)\n- Specifications per docs/issues/issue-13.md\n- Acceptance criteria in GitHub Issue #120 verified.\n\n%b\n\n%b" "$valid_problem" "$valid_impact" "$valid_out_of_scope")
output=$(bash "$GATE_SCRIPT" "HEAD~1...HEAD" --pr-body "$feature_spec_body" 2>&1) || { echo "FAILED"; echo "$output"; exit 1; }
echo "PASS"

# 7. 既存の4つのMachine Gate (ゼロ差分) -> FAIL
echo -n "Test 7: Existing gate (zero diff) -> "
if bash "$GATE_SCRIPT" "HEAD...HEAD" --pr-body "$full_valid_body" >/dev/null 2>&1; then
  echo "FAILED (expected zero diff failure)"; exit 1
else
  echo "PASS (zero diff failed as expected)"
fi

# 8. 通常の有効なPR本文 (環境変数経由) -> PASS
echo -n "Test 8: Valid PR body via PR_BODY env -> "
output=$(PR_BODY="$full_valid_body" bash "$GATE_SCRIPT" "HEAD~1...HEAD" 2>&1) || { echo "FAILED"; echo "$output"; exit 1; }
echo "PASS"

# 9. 見出し柔軟性 (## 見出し、ナンバリング付き、英語単体) -> PASS
echo -n "Test 9: Heading flexibility (##, numbered, English) -> "
h2_body=$(printf "## 具体的な問題 (Problem)\nIssue\n\n## 客観的証拠 (Evidence)\nBenchmark ok\n\n## 期待される効果 (Expected Impact)\nFaster\n\n## 意図して変更しなかったこと (Out of Scope)\nNone")
output=$(bash "$GATE_SCRIPT" "HEAD~1...HEAD" --pr-body "$h2_body" 2>&1) || { echo "FAILED (H2)"; echo "$output"; exit 1; }

numbered_body=$(printf "### 1. 具体的な問題 (Problem)\nIssue\n\n### 2. 客観的証拠 (Evidence)\nBenchmark ok\n\n### 3. 期待される効果 (Expected Impact)\nFaster\n\n### 4. 意図して変更しなかったこと (Out of Scope)\nNone")
output=$(bash "$GATE_SCRIPT" "HEAD~1...HEAD" --pr-body "$numbered_body" 2>&1) || { echo "FAILED (numbered)"; echo "$output"; exit 1; }

english_body=$(printf "### Problem\nIssue\n\n### Evidence\nBenchmark ok\n\n### Expected Impact\nFaster\n\n### Out of Scope\nNone")
output=$(bash "$GATE_SCRIPT" "HEAD~1...HEAD" --pr-body "$english_body" 2>&1) || { echo "FAILED (English)"; echo "$output"; exit 1; }
echo "PASS"

# 10. any 拡張検知 (any[], Array<any>, Promise<any>, Record<..., any>, <any>)
echo -n "Test 10: Extended 'any' patterns detection -> "
TEST_TMP_DIR="$ROOT_DIR/node_modules/.cache/test-verify-pr-gates-sh-repo"
rm -rf "$TEST_TMP_DIR"
mkdir -p "$TEST_TMP_DIR"
git -C "$TEST_TMP_DIR" init -b main >/dev/null 2>&1
git -C "$TEST_TMP_DIR" config user.name "Tester"
git -C "$TEST_TMP_DIR" config user.email "tester@example.com"
echo "export const x = 1;" > "$TEST_TMP_DIR/a.ts"
git -C "$TEST_TMP_DIR" add .
git -C "$TEST_TMP_DIR" commit -m "init" >/dev/null 2>&1

for any_code in "export const b: any[] = [];" "export const c: Array<any> = [];" "export async function d(): Promise<any> {}" "export const e: Record<string, any> = {};" "export const f = <any>1;"; do
  echo "$any_code" >> "$TEST_TMP_DIR/a.ts"
  git -C "$TEST_TMP_DIR" add .
  git -C "$TEST_TMP_DIR" commit -m "add any" >/dev/null 2>&1
  if (cd "$TEST_TMP_DIR" && bash "$GATE_SCRIPT" "HEAD~1...HEAD" --pr-body "$full_valid_body" >/dev/null 2>&1); then
    echo "FAILED to block: $any_code"; exit 1
  fi
  git -C "$TEST_TMP_DIR" reset --hard HEAD~1 >/dev/null 2>&1
done
echo "PASS"

# 11. テスト弱体化検知 (it.skip, test.skip, describe.skip, xit, xdescribe)
echo -n "Test 11: Test weakening detection (skip / xit) -> "
mkdir -p "$TEST_TMP_DIR/tests"
echo "test('initial', () => {});" > "$TEST_TMP_DIR/tests/sample.test.ts"
git -C "$TEST_TMP_DIR" add .
git -C "$TEST_TMP_DIR" commit -m "add test" >/dev/null 2>&1

for skip_code in "it.skip('t', () => {});" "test.skip('t', () => {});" "describe.skip('s', () => {});" "xit('t', () => {});" "xdescribe('s', () => {});"; do
  echo "$skip_code" >> "$TEST_TMP_DIR/tests/sample.test.ts"
  git -C "$TEST_TMP_DIR" add .
  git -C "$TEST_TMP_DIR" commit -m "add skip" >/dev/null 2>&1
  if (cd "$TEST_TMP_DIR" && bash "$GATE_SCRIPT" "HEAD~1...HEAD" --pr-body "$full_valid_body" >/dev/null 2>&1); then
    echo "FAILED to block test weakening: $skip_code"; exit 1
  fi
  git -C "$TEST_TMP_DIR" reset --hard HEAD~1 >/dev/null 2>&1
done
rm -rf "$TEST_TMP_DIR"
echo "PASS"

echo "=== All 11 gate tests PASSED successfully ==="
exit 0
