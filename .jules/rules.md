# Jules Core Rules

## Core Principles (Non-negotiable)
1. **No Language-Based Prohibition Lists**:
   - Nuanced or repetitive "do not do X" natural language lists are eliminated. Quality criteria are enforced by machine gates and explicit verification policies.
2. **Offload to Machine Gates (No machine gate, no trust)**:
   - Empty diffs, new `any` types, escape hatches (`@ts-ignore`, `@ts-nocheck`, `eslint-disable`), and test deletions are mechanically blocked by `scripts/verify-pr-gates.sh` and CI.
3. **Mandatory Objective Evidence (No evidence, no PR)**:
   - Never open a pull request without concrete problem facts and objective verification evidence (failing test output, benchmark measurements, EXPLAIN plan, etc.).
4. **Success Defined by Safe Inaction (No actionable finding, stop)**:
   - If investigation reveals no critical defect, measured bottleneck, or explicit requirement change, do not manufacture unnecessary edits. Completing the task with "No changes needed" and an evidence report is the best and expected outcome.

## PR Eligibility Criteria
A pull request must satisfy all three criteria:
- **Problem**: Factual issue in the current codebase (reproducible defect, verified security risk, measured performance issue, or explicit feature requirement).
- **Evidence**: Verifiable proof (failing test, benchmark, trace).
- **Scope**: Minimal changeset strictly addressing the problem without touching unrelated code.

## Verification
- Always run `bash scripts/verify-pr-gates.sh` (or `npm run verify:pr-gates`) and standard test suites before proposing a PR.
