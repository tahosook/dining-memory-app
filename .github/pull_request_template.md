## 1. 分類 (Classification)
- [ ] Bug fix / Security
- [ ] Performance
- [ ] Test addition
- [ ] Feature

## 2. 証拠 (Evidence) ※必須
<!-- ※ CI の PR Body Gate で検査されるため、以下の 4 つの見出しテキストは変更・削除しないでください -->
### 具体的な問題 (Problem)
<!-- 何が起きているか。架空の将来予測ではなく、現在のコードベース上の事実を記述 -->

### 客観的証拠 (Evidence)
<!-- 失敗するテストログ、実測ベンチマーク、EXPLAIN QUERY PLAN、CVE、パラメータバインド確認行など -->

### 期待される効果 (Expected Impact)
<!-- この変更によってどのような改善・修正が達成されるか -->

## 3. スコープ境界 (Scope)
### 意図して変更しなかったこと (Out of Scope)
<!-- ついでにリファクタリングしなかった周辺コードを明記 -->

---

## 4. 関連 Issue (Related Issues)
<!--
  - Use 'Closes #XX' or 'Fixes #XX' when this PR fully resolves the target issue (auto-closes on merge).
  - Use 'Refs #XX' or 'Relates to #XX' for investigation spikes, partial milestones, or parent issues.
-->
- Closes #
- Refs #
- Spec / Checklist: `docs/issues/`

## 5. 台帳・ドキュメント更新 (Ledger & Documentation Updates)
<!-- Keep TASKS.md and docs/issues/ synchronized in the same PR -->
- [ ] Updated `TASKS.md` (moved from Now to Done, or updated status)
- [ ] Updated `docs/issues/issue-XX.md` (marked acceptance criteria `[x]`, updated status & PR number)
- [ ] Updated canonical docs if UX, schema, conventions, or behavior changed

## 6. 検証チェックリスト (Verification Checklist)
- [ ] `npm run verify` (runs all gates: verify:pr-gates, check:docs, format:check, lint, type-check, test)
- [ ] または個別検証: `npm run verify:pr-gates`, `npm run check:docs`, `npm run lint`, `npm test`

