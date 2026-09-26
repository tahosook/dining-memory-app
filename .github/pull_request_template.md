## Change Classification
<!-- Select exactly one primary category -->
- [ ] Bug Fix (reproducible defect with failing test)
- [ ] Performance (measured bottleneck with benchmark/profile)
- [ ] Security (identified vulnerability or insecure pattern)
- [ ] Test (test suite maintenance or coverage addition)
- [ ] Feature / Spec (explicit requirement change)

## Problem (Fact in Current Codebase)
<!-- What is broken, insecure, or measurably deficient? Describe facts, not subjective opinions. -->

## Evidence (Objective Verification)
<!--
  REQUIRED (Core Principle: "No evidence, no PR"):
  Paste failing test output, benchmark measurements, EXPLAIN QUERY PLAN, or reproduction steps.
  PRs without concrete evidence will be rejected.
-->

## Out of Scope
<!-- What related or nearby code was intentionally left untouched to prevent scope drift? -->

## Summary
<!-- Brief summary of what this PR changes and why -->

## Related Issues
<!--
  - Use 'Closes #XX' or 'Fixes #XX' when this PR fully resolves the target issue (auto-closes on merge).
  - Use 'Refs #XX' or 'Relates to #XX' for investigation spikes, partial milestones, or parent issues spawning sub-issues.
-->
- Closes #
- Refs #
- Spec / Checklist: `docs/issues/`

## Ledger & Documentation Updates
<!-- Keep TASKS.md and docs/issues/ synchronized in the same PR -->
- [ ] Updated `TASKS.md` (moved from Now to Done, or updated status)
- [ ] Updated `docs/issues/issue-XX.md` (marked acceptance criteria `[x]`, updated status & PR number)
- [ ] Updated canonical docs if UX, schema, conventions, or behavior changed

## Verification Checklist
- [ ] `npm run verify:pr-gates`
- [ ] `npm run check:docs`
- [ ] `npm run format:check`
- [ ] `npm run lint`
- [ ] `npm run type-check` (if code/types changed)
- [ ] `npm test`
