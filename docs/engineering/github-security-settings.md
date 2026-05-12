# GitHub Security Settings

## Meta
- Purpose: GitHub 側で有効化する security / quality settings と repo 側設定の運用方針をまとめる。
- Audience: repo owner, maintainers, Codex.
- Update trigger: GitHub security feature、CI required checks、Dependabot 方針、branch protection 方針を変えるとき。
- Related docs: [README.md](../../README.md), [docs/index.md](../index.md), [docs/engineering/codex-workflow.md](codex-workflow.md), [GitHub security and code quality docs](https://docs.github.com/en/code-security)

## Policy
- GitHub UI でしか有効化できない項目は、この repo では「手順」として管理する。repo 側変更だけで設定済みとは扱わない。
- Public repo では CodeQL default setup、Dependabot alerts、Dependabot security updates、Secret scanning、Push protection を基本的に有効化する。
- Private repo では GitHub plan、organization policy、GitHub Code Security、GitHub Secret Protection の利用条件を先に確認する。利用できない場合は repo 側の CI と Dependabot version updates だけを先に運用する。
- CodeQL は最初から required check にしない。まず alerts を確認し、false positive や運用負荷が見えてから required 化を検討する。
- Dependabot auto-merge は使わない。major update は minor / patch group に混ぜず、個別 PR として手動で確認する。

## Repo Settings Already Managed In Code
- CI workflow は `.github/workflows/ci.yml` で管理する。
- CI の `GITHUB_TOKEN` permission は workflow top-level で `contents: read` に制限する。
- CI required check として使う job 名は `lint`、`type-check`、`test` とする。
- Dependabot version updates は `.github/dependabot.yml` で管理する。
- npm updates は週1回、月曜 09:00 JST、open PR 上限 5、minor / patch grouped。
- GitHub Actions updates は週1回、月曜 09:30 JST、open PR 上限 3。

## GitHub UI Checklist
GitHub の repository 画面で以下を確認する。画面名は GitHub UI の変更で揺れることがあるため、見つからない場合は同名の Code security / Actions / Rulesets 設定を探す。

- CodeQL default setup
  - Repository > Settings > Advanced Security を開く。
  - Code Security の CodeQL analysis で Set up > Default を選ぶ。
  - JavaScript / TypeScript が対象に含まれることを確認し、Enable CodeQL を実行する。
  - 初期運用では branch protection の required check に追加しない。
- Dependabot alerts
  - Repository > Settings > Advanced Security を開く。
  - Dependabot alerts を Enable にする。
- Dependabot security updates
  - Repository > Settings > Advanced Security を開く。
  - Dependabot security updates を Enable にする。
  - Grouped security updates は必要になってから検討する。初期状態では version updates の group 設定と混同しない。
- Secret scanning
  - Repository > Settings > Advanced Security を開く。
  - Secret Protection または Secret scanning を Enable にする。
- Push protection
  - Repository > Settings > Advanced Security を開く。
  - Secret Protection が有効なことを確認する。
  - Push protection を Enable にする。
- Actions default workflow permissions
  - Repository > Settings > Actions > General を開く。
  - Workflow permissions は read-only を選ぶ。
  - Allow GitHub Actions to create and approve pull requests は OFF のままにする。
- main branch protection / ruleset
  - Repository > Settings > Rules > Rulesets または Branches を開く。
  - 対象 branch pattern は `main`。
  - Require a pull request before merging: ON。
  - Require status checks before merging: ON。
  - Required checks: `lint`、`type-check`、`test`。
  - Block force pushes: ON。
  - Require branches to be up to date before merging: 推奨。
  - Require linear history: 任意。
  - Require approvals: 個人開発では強くしすぎない。必要なら 1 approval から始める。

## Operation Notes
- Dependabot PR は CI の `lint`、`type-check`、`test` が通ってから手動で確認する。
- Expo SDK、React Native、React、TypeScript の major update は破壊的変更や peer dependency の影響が大きいため、通常のまとめ PR ではなく個別に確認する。
- CodeQL alerts は導入直後に一度棚卸しし、実害があるもの、false positive、後回しにするものを分ける。
- Secret scanning alert が出た場合は、該当 secret を削除するだけでなく、provider 側で revoke / rotate する。

## References
- [Configuring default setup for code scanning](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configuring-default-setup-for-code-scanning)
- [Dependabot options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)
- [Configuring Dependabot alerts](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configuring-dependabot-alerts)
- [Configuring Dependabot security updates](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configuring-dependabot-security-updates)
- [Enabling secret scanning for your repository](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/detect-secret-leaks/enabling-secret-scanning-for-your-repository)
- [Enabling push protection for your repository](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/prevent-future-leaks/enabling-push-protection-for-your-repository)
- [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Managing GitHub Actions settings for a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)
