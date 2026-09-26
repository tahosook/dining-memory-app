# AGENTS.md

## Purpose
AI エージェントがこの repo で自律的に活動しつつ品質とガバナンスを維持するための固定規約です。
詳細な意思決定ポリシーは [.jules/rules.md](.jules/rules.md) および [docs/engineering/context-map.md](docs/engineering/context-map.md) を参照してください。

## Core Principles (Non-negotiable)
1. **自然言語の禁止リスト全廃**:
   - 言い訳（「保守性向上」「テスト容易性」等の再フレーミング）によるすり抜けを防ぐため、細かな禁止構文の列挙を行いません。
2. **機械的判定への完全オフロード (No machine gate, no trust)**:
   - 差分ゼロ、新規 `any`、エスケープハッチ（`@ts-ignore` 等）、テスト削除などは CI / スクリプト (`scripts/verify-pr-gates.sh`) で物理的にブロックします。
3. **客観的証拠の義務化 (No evidence, no PR)**:
   - 具体的な課題と客観的証拠（失敗テストログ、実測ベンチマーク、EXPLAIN QUERY PLAN 等）が示されない PR は作成しません。
4. **「変更しないこと」の成功定義 (No actionable finding, stop)**:
   - 調査の結果、安全に対処すべき問題がない場合、無理にコード変更を捏造（manufacture）せず「変更なし」で調査レポートを残してタスク完了（成功）とします。

## Read First
1. [docs/engineering/context-map.md](docs/engineering/context-map.md)
2. 今回のタスクに必要な docs / source / tests だけ

毎回 repo 全体、`docs/` 全体、`src/` 全体を読まないでください。
`TASKS.md` は作業候補、`PLANS.md` は大きめ作業の計画です。該当タスクのときだけ参照します。

## PR Eligibility Criteria (PR 適格性基準)
詳細は [.jules/rules.md](.jules/rules.md) を参照してください。
- **Problem**: 現行コードベースにおける具体的な事実（破損、脆弱性、測定されたボトルネック、明示された要件）。
- **Evidence**: 客観的証拠（再現テストの失敗ログ、実測値、プロファイル結果など）。
- **Scope**: 課題解決に直結する最小限の変更（無関係なリファクタやスタイル変更の排除）。

## Working Rules
- 編集前に、読んだファイル、編集予定ファイル、実装計画を短く整理する。
- 大きな作業は「調査」「計画」「実装」に分ける。
- 実装変更では、近い既存パターンと関連テストを確認してから編集する。
- product / UX / data / engineering convention が変わる場合は、対応する canonical doc も同じタスクで更新する。
- タスク完了時は、対応する `TASKS.md` や `docs/issues/` のステータス・受入基準を同じ PR/コミットで更新する（[docs/engineering/development-workflow.md](docs/engineering/development-workflow.md) 参照）。

## AI & Privacy Rules
- 実験的・プロトタイプ機能（MediaPipe 等）は、指示なく default runtime や永続化契約へ昇格しない。
- AI 入力補助は optional で、manual save を妨げない。
- raw AI output、model metadata、photo path、location、notes などの sensitive data を不要に保存・ログ出力しない。

## Finish Report
作業後は以下を簡潔に報告してください。
- 変更ファイル（変更なしの場合は調査結果レポート）
- 確認コマンド
- 未確認事項
- テストや lint を実行しなかった場合はその理由
