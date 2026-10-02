# [Investigation] main 直コミット + PR ブランチ force-push 運用の見直し

- **対応 GitHub Issue**: GitHub Issue #235
- **関連 Ruleset**: GitHub Ruleset ID `19937013` ("protect main branch")
- **ステータス**: 完了 (Closed)
- **対象ドキュメント**: `docs/engineering/development-workflow.md`

## 目的・概要
main ブランチへの直接コミットや PR ブランチへの force-push による CI 監査性（auditability）の低下を防ぐため、現在の GitHub 設定（Ruleset）、CI 検証フロー、およびブランチ運用ポリシーの整合性を確認・整理した記録です。

---

## 調査・確認結果

### 1. 機械的に強制されている仕組み (GitHub Ruleset 19937013)
GitHub API (`repos/tahosook/dining-memory-app/rulesets/19937013`) の検証により、以下のルールが main ブランチ（`~DEFAULT_BRANCH`）に対して**機械的かつ例外なし（Bypass 不可）**で強制されていることを確認しました：

| ルール種別 | 設定値 | 効果・強制力 |
|---|---|---|
| **`deletion`** | 有効 | main ブランチの削除を物理的にブロック |
| **`non_fast_forward`** | 有効 | **main ブランチへの force-push を物理的にブロック** |
| **`pull_request`** | 有効 | **main ブランチへの直接 push を物理的にブロック（PR 必須）** |
| **`required_status_checks`** | `static-analysis`, `test`, `native-build` | 必須 3 ジョブの全パスがマージに必須 |
| **`strict_required_status_checks_policy`** | `true` | **最新の main と同期されていないブランチのマージをブロック** |
| **`bypass_actors`** | `[]`（空） | **管理者・ボット・エージェントを含む全員バイパス不可** (`current_user_can_bypass: "never"`) |

**結論**: main ブランチに対する「直接 push」および「force-push」は、既に GitHub Ruleset によって 100% 機械的に遮断されており、人間の手作業やエージェントが誤って main に直接書き込むリスクは物理的に存在しません。

### 2. PR ブランチにおける force-push と CI 監査性
PR ブランチ（作業ブランチ）は開発者・エージェントの所有ブランチであるため force-push が可能ですが、以下の観点から運用ガイドラインを定義します：
- **課題**: レビュー中に force-push を行うと、GitHub 上のコミット履歴や過去の CI 実行ログとの対応関係が失われ、監査性（Auditability）が低下する。
- **方針**:
  - PR 作業中は原則として追加コミット（コミット積み増し）で修正を行う。
  - GitHub Ruleset で許可されているマージ方式（`squash`, `merge`, `rebase`）のうち、不要な中間コミットはマージ時に Squash することで main の履歴を綺麗に保つ。
  - Rebase や force-push は、マージコンフリクト解消など真に必要な場合に限定し、force-push 後は CI の再完走を必ず確認する。

### 3. ドキュメント単体更新（TASKS.md / docs/）の扱い
- `TASKS.md` や `docs/` の単独更新であっても、Ruleset の例外（バイパス）は設けない。
- すべての変更はトピックブランチから PR を作成し、CI（`verify:pr-gates` 等）を通過させてマージする。

---

## 結論
「main への直接コミット・force-push 防止」は既に GitHub Ruleset ID 19937013 により機械的強制が完備されているため、新たな GitHub 設定変更やツール追加は不要です。
本調査結果に基づき、機械的強制の事実と作業ブランチ運用ルールを `docs/engineering/development-workflow.md` に明文化します。

---

## 受け入れ条件（Acceptance Criteria）
- [x] 現在の GitHub Ruleset 設定（ID 19937013）の内容と機械的強制力が確認されていること。
- [x] 機械的に強制される仕組みと運用ルールの区別が明確化されていること。
- [x] `docs/engineering/development-workflow.md` にブランチ運用規約が反映されていること。
