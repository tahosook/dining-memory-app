# AGENTS.md

## Purpose
AI エージェントがこの repo で自律的に活動しつつ品質とガバナンスを維持するための固定規約です。
詳細な意思決定ポリシーは [.jules/rules.md](.jules/rules.md) および [docs/engineering/context-map.md](docs/engineering/context-map.md) を参照してください。

## Core Principles (Non-negotiable)
1. **自然言語の禁止リスト依存からの脱却 (Prompt Firewall からの脱却)**:
   - 言い訳（「保守性向上」「テスト容易性」等の再フレーミング）によるすり抜けを防ぐため、細かな禁止構文の列挙でエージェントを縛るアプローチを廃止し、機械的判定（Machine Gate）と客観的証拠（Evidence）の2軸で強制します。
2. **機械的判定への完全オフロード (No machine gate, no trust)**:
   - 差分ゼロ、テスト削除・弱体化、および PR 本文の Evidence 欠落は CI / スクリプト (`scripts/verify-pr-gates.sh`) で物理的にブロックし、`any` やエスケープハッチ（`@ts-ignore` 等）は ESLint で静的にブロックします。
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
- **PR 本文の必須構成**:
  - [.jules/rules.md](.jules/rules.md) で定める必須4セクション（`### 具体的な問題 (Problem)`、`### 客観的証拠 (Evidence)`、`### 期待される効果 (Expected Impact)`、`### 意図して変更しなかったこと (Out of Scope)`）を維持した上で、合意された計画に基づく **「設計条件チェックリスト (Design Criteria Checklist)」** を含めることを必須ルールとします（レビュアーの ChatGPT / Grok がコード差分と照合するための検証基準となります）。

## Multi-Agent Development Workflow (多エージェント開発ワークフローと役割分担)
このリポジトリでは、以下の5フェーズの役割分担と明確な責任境界に基づいて開発サイクルを回します。

1. **計画 (Planning)**:
   - **担当**: Antigravity の **Argon**（`/plan`）が実装計画を作成し、**Muse** がレビューする。
   - **内容**: 課題・設計条件チェックリスト・検証方針・変更対象ファイルを整理し、計画の合意を形成する。
2. **実装 (Implementation)**:
   - **担当**: **Gemini 3.8 Flash High** がトピックブランチの作成、実装、ローカル標準検証（`npm run verify`）の完走、および PR 作成までを担当する。
   - **境界（厳守）**: **実装担当はマージを行わない（マージ禁止）**。
3. **レビュー (Review)**:
   - **担当**: **ChatGPT** と **Grok** が、PR 本文の「設計条件チェックリスト」とコード差分（diff）を照合してレビューし、GitHub の PR へ直接レビューコメントを投稿する。
   - **レビューの場**: 本リポジトリに対応する ChatGPT プロジェクト（名称: `dining-memory-app`）および Grok プロジェクト（名称: `dining-memory-app`）を使用する。
4. **仲介・検証 (Mediation & Verification)**:
   - **担当**: **Muse** が ChatGPT / Grok の各指摘を実際のコードと照合して裏取り（事実確認・妥当性検証）し、修正方針をまとめて**オーナーの承認**を得た上で、実装担当（Gemini 3.8 Flash High）へ修正指示を送る。
5. **マージ (Merge)**:
   - **境界（厳守）**: **マージ判断はオーナーのみが行う（オーナー専権）**。
   - **担当**: オーナーの承認後、実行は **Muse** が GitHub 経由で行う。マージ完了後は **Muse** が当該機能の Antigravity 会話に完了を一報する。

## Working Rules
- 編集前に、読んだファイル、編集予定ファイル、実装計画を短く整理する。
- 大きな作業は「調査」「計画」「実装」に分ける。
- 実装変更では、近い既存パターンと関連テストを確認してから編集する。
- **2段階検証運用 (Two-Phase Verification)**:
  1. **対話的な実装・動作確認時 (Quick Loop — Default)**:
     - ユーザーからの機能追加・UI調整・修正指示に対しては、コード変更後に**直結する単一テスト（`npx jest <target.test.ts>`）および型検査（`npm run type-check` または補助検証 `npm run verify:quick`）を確認し、即座に完了報告**する。
     - コード変更を伴う場合は、`verify:quick`（`--onlyChanged`）の自動検出で対象テストが 0 件だった場合を含め、必ず該当の単一テストを明示指定して実行するか、該当テストが存在しない理由を Finish Report に明記する。
     - 動作確認前の段階で、全件テスト（`npm test` / `test:python:fast`）や `TASKS.md` / `docs/issues/` の台帳更新、PR Gate を毎回回してユーザーを待たせない。
  2. **コミット・PR作成時 (Commit / PR Gate)**:
     - ユーザーが動作を確認し、コミットや PR 作成へ進む段階（または最初から PR 作成まで明示指示された場合）で、**本リポジトリの標準検証コマンド `npm run verify`（フルゲート: verify:pr-gates, check:react-versions, check:deps, check:docs, format:check, lint, type-check, check:expo-doctor, test, test:python:fast）** を実行して全件通過を確認する。ネイティブ依存や Expo SDK 変更時は加えて `npm run build:android:debug` を実行する。
     - 対応する `TASKS.md` や canonical doc の更新、および PR 本文の必須 4 セクション＋設計条件チェックリストを同じ PR で整備する（[docs/engineering/development-workflow.md](docs/engineering/development-workflow.md) 参照）。
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
