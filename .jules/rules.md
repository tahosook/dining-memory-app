# Agent Decision & PR Eligibility Rules

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

## Machine Gates
本リポジトリでは以下の違反を CI および `scripts/verify-pr-gates.sh` により機械的・物理的に遮断する:
1. 差分ゼロの PR
2. 新規 `any` 型注釈および型アサーション (`: any`, `as any`)
3. エスケープハッチの追加 (`@ts-ignore`, `@ts-nocheck`, `eslint-disable`)
4. `tests/` 配下のテストファイル削除
