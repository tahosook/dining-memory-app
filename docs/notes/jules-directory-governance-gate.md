# [Investigation] エージェントによる .jules/ 変更の拒否方針とゲート化の検討

- **対応 GitHub Issue**: GitHub Issue #236
- **ステータス**: 完了 (Closed)
- **対象スクリプト**: `scripts/verify-pr-gates.sh`
- **対象ドキュメント**: `AGENTS.md`, `docs/engineering/development-workflow.md`

## 目的・概要
AI エージェントが PR 作成時に作業メモの混入やプロンプト制限の回避を目的として `.jules/` 配下のファイル（`rules.md`, `bolt.md`, `sentinel.md` 等）を意図的・偶発的に変更する事象を防止するため、機械的ゲート（`scripts/verify-pr-gates.sh`）による検出・ブロック方針を設計・整理した記録です。

---

## 調査・分析結果

### 1. 現行ゲート（`scripts/verify-pr-gates.sh`）の現状と課題
現在の `scripts/verify-pr-gates.sh` には以下の 4 つの機械的検査が存在します：
1. **Zero diff check**: 差分ゼロ PR のブロック
2. **Escape hatch check**: コード内の `eslint-disable` コメントのブロック
3. **Test protection check**: `tests/` 内のファイル削除およびスキップ（`it.skip` 等）のブロック
4. **PR body Evidence Gate**: PR 本文の 4 必須セクションと客観的証拠の検証

**不足点**:
現在、`.jules/` ディレクトリに対する変更検知ロジックは存在せず、エージェントが偶発的なメモ書きやダミー空行、またはプロンプト指示の自己改変（Prompt Injection / Jailbreak 回避）をコミットに含めた場合でも、CI ゲートをすり抜けてしまいます。
自然言語ルール（「.jules/ を変更しない」）だけでは遵守が担保できないため、「機械的判定への完全オフロード (No machine gate, no trust)」の原則に基づき、スクリプトによる物理遮断が必要です。

### 2. `.jules/` 変更拒否ゲートの設計案

#### A. 検査ロジック (`scripts/verify-pr-gates.sh` への追加イメージ)
```bash
# 5. .jules/ directory protection check
JULES_MODIFIED=$(git diff --name-only "$TARGET_REF" -- '.jules/*' 2>/dev/null || true)

if [ -n "$JULES_MODIFIED" ]; then
  # 人間（管理者）による明示的バイパス環境変数 ALLOW_JULES_CHANGE=true がない限りブロック
  if [ "${ALLOW_JULES_CHANGE:-false}" != "true" ]; then
    echo "❌ [GATE FAIL] Unauthorized modification to .jules/ directory detected:"
    echo "$JULES_MODIFIED"
    echo "   Core Principle: Machine-enforced governance. Automated agents must not modify .jules/."
    echo "   To legitimately update governance rules as maintainer, set ALLOW_JULES_CHANGE=true."
    exit 1
  fi
  echo "  ℹ .jules/ modification permitted via ALLOW_JULES_CHANGE=true."
else
  echo "  ✓ No unauthorized changes to .jules/ directory."
fi
```

#### B. 管理者（人間）による正当なルール改訂フロー
- ガバナンスルールやペルソナ定義（`bolt.md`, `sentinel.md`）の改訂は人間管理者の主導で行われます。
- 管理者がローカルまたは CI でルール更新 PR を作成する際は、`ALLOW_JULES_CHANGE=true` を明示的に指定することでゲートをパスさせます。
- GitHub Actions のワークフロー側では、PR に `governance` ラベルが付与され、かつ作成者がリポジトリ Owner である場合のみ環境変数 `ALLOW_JULES_CHANGE=true` を注入する運用が安全です。

#### C. ガバナンス違反 PR への自動ハンドリングプロトコル
1. エージェントが PR 作成・編集時に `.jules/` を変更した場合、CI の `verify:pr-gates` が即座に Exit Code 1 で失敗。
2. エージェントは「変更禁止ファイルへの変更検知」ログを受け取り、`git checkout main -- .jules/` により差分を除去して再プッシュする。
3. 差分除去がなされない PR は、レビュアーによりマージ拒否（Reject / Close without merge）される。

---

## 結論
- `.jules/` の偶発的・意図的変更を機械的に防ぐゲートの要件および設計仕様を確立しました。
- 本バッチではガバナンス設計の固定（ドキュメント化）を完了とし、実際のスクリプト実装は将来のゲート強化 PR で最小差分として適用可能と判断します。

---

## 受け入れ条件（Acceptance Criteria）
- [x] 現行の `verify-pr-gates.sh` で検出可能な項目と不足している項目が整理されていること。
- [x] `.jules/` 変更検知ゲートのロジックおよび管理者バイパス方法が設計されていること。
- [x] エージェントによる違反時のハンドリングプロトコルが定義されていること。
