# Agent Decision & PR Eligibility Rules

> This file is the **canonical detail** of the PR eligibility rules summarized in AGENTS.md.
> In case of conflict, this file takes precedence.

## Core Principles (Non-negotiable)
1. **No evidence, no PR**:
   客観的証拠（失敗するテスト、実測ベンチマーク、EXPLAIN 計画等）が提示されない変更は PR を作成しない。
2. **No actionable finding, stop**:
   調査の結果、安全に対処すべき具体的な問題が存在しない場合は、無理にコード変更を捏造（manufacture）せず、「変更なし（調査レポートのみ）」でタスクを正常終了（最善の成果）とする。

## PR Eligibility Checklist
PR を起票する前に、以下の全項目を満たしていることを確認すること:
- [ ] 現在のコードベース上に実在する問題であること（架空の将来予測や机上の推測ではない）
- [ ] 客観的証拠（失敗テストログ、実測値、EXPLAIN 計画等）があること
- [ ] 変更がその問題の解決だけに厳密に限定（スコープ）されていること
- [ ] 動作・性能改善を伴わない関数の細分化や構文書き換え（Micro-refactoring）を含まないこと
- [ ] 既存の型安全性（TypeScript 厳格型）を一切劣化させていないこと

## Exit Criteria
上記の適格性基準（PR Eligibility Checklist）を1つでも満たせない場合は、**絶対に PR を作成しないこと**。
代わりに以下の項目を含む調査レポートを残してタスクを完了とする:
- 調査対象（コンポーネント、ファイル、関数）
- 調査結果（Result: none / 問題なし）
- 実行した検証（ベンチマーク実測値、プロファイル結果、型チェック結果等）
- 結論（現状維持が最適である理由）

## Machine Gates & Code Quality
本リポジトリでは以下の違反を CI およびツールにより機械的・物理的に遮断する:
1. 差分ゼロの PR (`scripts/verify-pr-gates.sh`)
2. 新規 `any` 型注釈・型アサーション、およびエスケープハッチ (`@ts-ignore`, `@ts-nocheck`) は ESLint (`npm run lint`) によりブロック
3. `tests/` 配下のテストファイル削除およびテスト弱体化 (`it.skip`, `test.skip`, `describe.skip`, `xit`, `xdescribe`) (`scripts/verify-pr-gates.sh`)
4. PR 本文の必須 4 セクション欠落、空・プレースホルダーのみの Evidence (`scripts/verify-pr-gates.sh`)（Feature/Spec PR は仕様・Issue 参照で可）

## Mandatory PR Description Template
PR を作成する際は、Description（PR 本文）に以下の **4 つの見出しをすべて含めること**（欠落やプレースホルダーは CI の Evidence Gate でブロックされる。PR 本文修正時は `edited` イベントにより自動再検証される）。

> **Note**: CI の Evidence Gate は見出しレベル h1-h4 のいずれでも認識し、日本語・英語の両方の見出し名（およびエイリアス）に対応している。以下のテンプレートは推奨形式であり、厳密な構文制約ではない。

```markdown
### 具体的な問題 (Problem)
現行コードベースにおける具体的な事実、不具合、測定されたボトルネック、または要求仕様。

### 客観的証拠 (Evidence)
客観的証拠（失敗テストログ、実測値、プロファイル結果、または仕様/Issue/受入基準の参照）。
※空欄や「TODO」「なし」等のプレースホルダーは不可。

### 期待される効果 (Expected Impact)
変更によって得られる具体的な成果や改善点。

### 意図して変更しなかったこと (Out of Scope)
意図的に今回の変更に含めなかった関連領域、不要なリファクタリングの排除。
```

### PR 起票前のローカル検証手順（Shift-Left 推奨）
PR を作成する前に、以下のローカル検証を推奨する:

1. **型チェック・lint**: `npm run type-check && npm run lint` — Machine Gates の `any` 型・エスケープハッチ違反を事前検出
2. **テスト**: `npm test` — 既存テストの破壊がないことを確認
3. **PR 本文 Evidence Gate**: 作成予定の PR 本文（Description）が Evidence Gate を通過するかローカルで事前検証する:

```bash
# 文字列を直接渡して検証
npm run verify:pr-gates -- --pr-body "### 具体的な問題 (Problem)..."

# またはファイル経由で検証
npm run verify:pr-gates -- --pr-body-file /path/to/pr-body.md
```
