# Dependency Policy

## Meta
- Purpose: define the dependency management policy, classification tiers, Expo SDK upgrade playbook, and verification boundaries for this repository.
- Audience: developers, AI agents, and code reviewers.
- Update trigger: changes to dependency tiers, Expo SDK versioning strategy, Dependabot configuration, or native module verification protocols.
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/index.md](../index.md), [docs/engineering/context-map.md](context-map.md), [docs/engineering/development-workflow.md](development-workflow.md), [docs/engineering/github-security-settings.md](github-security-settings.md), [docs/architecture/tech-spec.md](../architecture/tech-spec.md)

## Summary
- **Expo SDK は統合プラットフォーム**: Web の一般的な Node.js アプリと異なり、Expo / React Native では `expo`, `react`, `react-native`, 各種 `expo-*`, ネイティブモジュールが 1 つの「Expo SDK 互換性マトリクス」として固定されています。
- **通常の自動 Version Update の対象外**: 互換性境界に属する依存関係（Tier 1）は Dependabot の通常 Version Update から除外（`ignore`）し、壊れた PR の乱造を防ぎます。
- **「Jest 通過」≠「ネイティブ互換性」**: ネイティブモジュールは Jest テスト実行時にモック化されているため、CI の単体テストが通ってもネイティブビルドや実機でクラッシュするリスクがあります。ネイティブ依存の変更時はネイティブビルドが必須検証ゲートです。
- **Security Updates は別レーン**: `dependabot.yml` の `ignore` は自動 PR を抑制しますが、GitHub の **Dependabot Alerts（脆弱性通知）** は継続して機能します。Security Alert 検知時は人間（＋AI）が影響調査と Expo 整合性を確認し、手動で検証・更新します。
- **Expo SDK アップグレードは専用メンテナンス**: Expo SDK release をトリガーとして実施し、開発者 + AI coding agent による計画的スプリント（15ステップの手順書）として実施します。

---

## 1. Core Principles (基本原則)

### 原則 1: 単一パッケージではなく「プラットフォーム単位」で捉える
Expo アプリにおいて、`package.json` に記載された主要ライブラリは独立した SemVer では動きません。
`node_modules/expo/bundledNativeModules.json` に定義された互換性テーブルが真実の基準（Source of Truth）です。
- `expo-image-picker: 57.x` → `58.x` は単なるライブラリの更新ではなく、次期 Expo SDK 58 への移行を意味します。
- `react-native: 0.86` → `0.87` は SemVer 上は minor ですが、React Native の 0.x 系では破壊的変更（Breaking Changes）を含みます。
したがって、Dependabot による個別やまとめ（group）での自動 bump は互換性を破壊します。

### 原則 2: 「Jest 通過」を過信しない
Jest 単体テストは、以下のようにネイティブモジュールを完全にモック化して実行されます。
- `jest.mock('expo-image-picker', ...)`
- `jest.setup.js` での `require('react-native-gesture-handler/jestSetup')`
- `llama.rn` の JS ラッパーモック
このため、**CI の Jest テストが 100% 通過しても、Android / iOS のネイティブビルド（Gradle / C++ / NDK）や実機実行時のクラッシュは検知できません**。
ネイティブ層に触れる変更では、必ず `npm run build:android:debug` を検証ゲートとします。

### 原則 3: 自動更新と手動更新の責任境界を明確にする
- **自動化するもの**: ネイティブ層を持たない純粋な JS / TS ツール（Prettier, Knip, TypeScript, Linter プラグイン）や GitHub Actions。
- **手動 / AI 協調で行うもの**: Expo SDK コア、React / React Native、ネイティブモジュール、およびメジャーアップデート。

---

## 2. Dependency Classification (4層分類マトリクス)

本リポジトリのすべての依存関係は、以下の 4 つの Tier に分類されます。

```
┌──────────────────────────────────────────────────────────────────┐
│ Tier 1: Expo / React Native Runtime & Native Boundary            │
│         👉 Dependabot 完全 ignore ＋ Expo SDK release トリガーでの手動/AIスプリント │
├──────────────────────────────────────────────────────────────────┤
│ Tier 2: Ecosystem Tooling with Strict Compatibility Bounds       │
│         👉 Major update は手動確認、minor/patch は限定適用       │
├──────────────────────────────────────────────────────────────────┤
│ Tier 3: Pure JS / TS Tooling & Safe Ecosystem Libraries          │
│         👉 Dependabot グループ自動更新 (minor/patch, 週1回)       │
├──────────────────────────────────────────────────────────────────┤
│ Tier 4: CI & GitHub Actions                                      │
│         👉 Dependabot 週次自動更新 (月曜 09:30 JST)              │
└──────────────────────────────────────────────────────────────────┘
```

### Tier 1: Expo / React Native Runtime & Native Boundary (完全手動管理)
Expo SDK 互換性マトリクス、React Native コア、または Android / iOS ネイティブコード（C++, Kotlin, Java）を含む依存関係です。
Dependabot の通常更新からは **完全に `ignore`** します。

| パッケージ名 | 分類 | 判断理由 |
| :--- | :--- | :--- |
| `expo` | Expo Core | Expo SDK の基盤。個別更新不可。`npx expo upgrade` で管理。 |
| `expo-*` (全15パッケージ)<br>*(camera, file-system, image-picker, sqlite 等)* | Expo Native Modules | Expo SDK と 1対1 でネイティブ実装が結合。メジャー更新は新 SDK 向け。 |
| `@expo/vector-icons` | Expo Asset | Expo SDK のバンドルアイコンアセット。 |
| `react`, `react-dom` | Core Runtime | Expo SDK 57 が指定する React 19.2.3 に固定。 |
| `react-native` | Core Runtime | Expo SDK 57 が指定する React Native 0.86.3 に固定。 |
| `react-test-renderer` | React Testing | `react` と同一バージョン（19.2.3）である必要あり。 |
| `@types/react` | Type Definitions | `react` バージョンと整合させる必要あり。 |
| `react-native-web` | Web Runtime | Expo / React Native Web 実装。Expo SDK バージョンに追従。 |
| `react-native-gesture-handler` | Bundled Native Module | Expo SDK 57 では `~2.32.0` に固定。3.x はネイティブ破壊的変更。 |
| `react-native-reanimated` | Bundled Native Module | Expo SDK 57 では `4.5.1` に固定。C++ ネイティブランタイム含む。 |
| `react-native-screens` | Bundled Native Module | Expo SDK 57 では `~4.26.0` に固定。Fragment / Activity ネイティブ連携。 |
| `react-native-safe-area-context` | Bundled Native Module | Expo SDK 57 では `~5.7.0` に固定。ネイティブ Inset 連携。 |
| `react-native-worklets` | Bundled Native Module | Expo SDK 57 では `0.10.1` に固定。Reanimated 依存。 |
| `llama.rn` | Out-of-tree Native Module | ローカル AI 推論用 C++ / CMake / NDK ネイティブライブラリ。 |
| `react-native-zip-archive` | Out-of-tree Native Module | モデル展開用ネイティブ ZIP ライブラリ。 |
| `@bam.tech/react-native-image-resizer` | Out-of-tree Native Module | 画像回転・リサイズ用 Android/iOS ネイティブコード含む。 |
| `jest-expo` | Expo Testing Preset | Expo SDK 57 バンドル。Jest 29 / RN preset と厳格に結合。 |

### Tier 2: Ecosystem Tooling with Strict Compatibility Bounds (メジャー手動管理)
React Native や Expo の公式プリセットが特定のメジャーバージョンに依存しているため、メジャーアップデートを自動化できないツール群です。

| パッケージ名 | 分類 | 判断理由 |
| :--- | :--- | :--- |
| `eslint` | Linter Core | `@react-native/eslint-config` が `eslint: ^8.0.0 \|\| ^9.0.0` を要求。v10 は peerDependency 破壊となるため **メジャー更新 ignore**。9.x 内の minor/patch は可。 |
| `jest`, `@types/jest` | Test Runner & Types | `jest-expo` および `@react-native/jest-preset` が Jest 29 系に依存。v30 はロックファイル肥大化と二重管理を招くため **メジャー更新 ignore**。 |
| `@react-native/eslint-config` | RN Tooling | React Native 公式 ESLint 設定。React Native 本体更新時に手動追従。 |
| `@react-native/jest-preset` | RN Tooling | `jest-expo` から厳格に peerDependency 指定されているため手動管理。 |
| `@testing-library/react-native` | Testing Tooling | React Native テストユーティリティ（非ネイティブ）。メジャー更新は React / RN 互換境界を跨ぐ可能性があるため **メジャー更新 ignore**。minor / patch は `tooling` グループで安全に自動配信。 |
| `@react-native-community/cli` | RN Tooling | React Native CLI ツール。本体と連動。 |
| `jest-environment-jsdom` | Test Environment | `package.json` の `overrides` で jsdom バージョンを固定しているため手動管理。 |

### Tier 3: Pure JS / TS Tooling & Safe Ecosystem Libraries (Dependabot 自動化)
ネイティブコードを持たず、peerDependency 競合リスクの低い純粋な JS / TS ライブラリです。Dependabot による **minor / patch のグループ更新** を適用します。

| パッケージ名 / グループ | 分類 | 運用方針 |
| :--- | :--- | :--- |
| `prettier`, `knip`, `semver` | Pure Tooling | `tooling` グループとして minor/patch を週次配信。 |
| `@typescript-eslint/*`<br>`eslint-config-prettier`<br>`eslint-plugin-react-hooks` | Linter Plugins | `tooling` グループとして minor/patch を週次配信。 |
| `typescript` | Language Compiler | `~6.0.3`。マイナー/パッチ更新は CI 型検査 (`npm run type-check`) で検証。 |
| `@react-navigation/*` | Navigation | 純粋な JS ナビゲーションロジック。`react-navigation` グループで minor/patch 更新。メジャーは手動。 |
| `piexifjs` | Pure JS Runtime Lib | EXIF 操作の純粋 JS ライブラリ。`runtime-utils` グループで minor/patch 更新。 |

### Tier 4: CI & GitHub Actions (Dependabot 週次更新)
GitHub Actions のワークフロー（`actions/checkout`, `actions/setup-node` 等）は安定しており、CI 実行時に即座に成否が検証できるため、週次（月曜 09:30 JST）の更新を維持します。

---

## 3. Security Policy (脆弱性対応レーン)

### Dependabot Alerts と Security Updates の役割分担
GitHub のセキュリティ機能には **Dependabot Alerts（脆弱性検知・通知）** と **Dependabot Security Updates（自動 PR 生成）** の 2 つがあります。本リポジトリではこの 2 つを明確に区別して運用します。

1. **Dependabot Alerts（検知・通知）**:
   - GitHub Advisory Database をもとにリポジトリ内の脆弱性を検知し、Security タブや通知で知らせる機能です。
   - `.github/dependabot.yml` の `ignore` 設定にかかわらず、リポジトリ設定で Dependabot alerts が有効であれば **Tier 1〜Tier 4 のすべての依存関係について常時機能** します。
2. **Dependabot Security Updates（自動 PR 生成）**:
   - 脆弱性を解決するバージョンへの更新 PR を GitHub が自動作成する機能です。
   - **GitHub の仕様上、`.github/dependabot.yml` で `ignore` されたパッケージは、通常 Version Updates だけでなく自動 Security Update PR の生成も抑制されます**。

> [!IMPORTANT]
> **なぜ Tier 1 で自動 Security PR を抑制し、手動/AIレビューを原則とするのか**:
> Expo / React Native アプリケーションにおいて、`react-native`、`expo-file-system`、`react-native-reanimated` などの Tier 1 依存に脆弱性が発見された場合、一般的な npm パッケージのように Dependabot が自動 PR で最新パッチやメジャーバージョンに bump してしまうと、Expo SDK 互換性マトリクスを逸脱し、Gradle ネイティブビルドの失敗や実機クラッシュを引き起こします。
> したがって、Tier 1 では自動 Security PR を抑制し、**Dependabot Alerts による通知を受けてから人間（＋AI coding agent）が Expo SDK 整合性・ネイティブビルドを慎重に検証して手動 PR を作成する運用が最も安全** です。

### セキュリティパッチの自動マージ禁止
いかなる Tier であっても、**セキュリティアップデートの自動マージ（Auto-merge）は行いません**。
CI の単体テストを通過してもネイティブ連携や間接的な依存関係の衝突が潜んでいる可能性があるため、必ず検証ゲートの通過を確認した上で手動でレビュー・マージします。

### Security Alert 対応プロトコル
脆弱性アラート（Dependabot Alert）が発報された場合の流れ：
1. **検知**: GitHub Security タブまたはメール通知で Alert を確認。
2. **影響調査**: 本アプリでの該当コードパスの利用有無、重要度（CVSS / Severity）を評価。
3. **Expo 互換パッチの確認**:
   - Expo 公式が提供するパッチバージョンが存在するか確認:
     ```bash
     npx expo install --check
     ```
   - Expo SDK 57 の範囲内でパッチ（例: `~57.0.24`）が提供されていれば、`npx expo install <package>` で安全に適用。
4. **ワークアラウンドまたは overrides の検討**:
   - Expo SDK 側の公式パッチが未提供で緊急性が高い場合、`package.json` の `overrides` 等によるピンポイント対処が可能か検証。
5. **検証ゲートの実行**:
   - `npm run check:react-versions`
   - `npm run check:expo-doctor`
   - `npm test`
   - `npm run build:android:debug`（ネイティブモジュールまたは package.json/lockfile が関係する場合）
   - 実機またはエミュレータでのスモークテスト
6. **手動 PR 作成とマージ**:
   - 自動マージは一切行わず、影響範囲と検証ログを明記した PR を作成してマージ。

---

## 4. Expo SDK Upgrade Playbook (15-Step Protocol)

Expo SDK のメジャーバージョンアップ（例: SDK 57 → SDK 58）は、Dependabot ではなく **開発者 + AI coding agent による計画的メンテナンスタスク** として実行します。

### 前提条件
- リリース検知: GitHub の [expo/expo Releases](https://github.com/expo/expo/releases)（Releases only Watch）または [Expo Changelog](https://expo.dev/changelog)。
- 作業用ブランチを作成して作業する。

### 手順書

```bash
# 1. アップグレード用作業ブランチ作成
git checkout main
git pull origin main
git checkout -b chore/upgrade-expo-sdk-<TARGET_SDK>

# 2. 対象 SDK のリリースノート / Migration Guide を確認
#    Breaking changes, deprecated modules, React / RN バージョン変更を確認

# 3. Expo SDK 本体と関連バンドルモジュールを一括更新
npx expo upgrade

# 4. 依存関係の整合性修正
npx expo install --fix

# 5. React と React Native の peerDependency 整合性チェック
npm run check:react-versions

# 6. Expo Doctor によるプロジェクト健全性チェック
npx expo-doctor

# 7. クリーンインストール検証
npm run clean
npm install

# 8. 単体テスト実行
npm test

# 9. カバレッジ検証
npm run test:coverage

# 10. 静的解析および型検査
npm run lint
npm run type-check
npm run format:check

# 11. ドキュメント整合性チェック
npm run check:docs

# 12. Android ネイティブデバッグビルド検証 (必須!)
npm run build:android:debug

# 13. 実機 / エミュレータ スモークテスト
#     - カメラ撮影と保存 (expo-camera, photoStorage)
#     - EXIF 情報保存 (piexifjs, photoExif)
#     - 画像回転・リサイズ (@bam.tech/react-native-image-resizer)
#     - ローカル AI 推論 (llama.rn)
#     - バックアップ / リストア (expo-file-system, react-native-zip-archive)

# 14. 変更差分の確認と PR 作成
#     - package.json / package-lock.json / android/ 設定差分を確認
#     - PR 本文に検証結果（CI結果、ビルドログ、実機確認項目）を記載

# 15. レビューとマージ
```

---

## 5. CI Quality Gates & Verification (CI・検証ゲート)

### CI ワークフロー (`.github/workflows/ci.yml`) の構成
- **`static-analysis` ジョブ**:
  - `npm ci`
  - `npm run check:react-versions` (**必須ゲート**: React と React Native のバージョン乖離を水際で防止)
  - `npm run check:docs`
  - `npm run type-check`
  - `npm run lint`
  - `npm run format:check`
  - `npx expo-doctor` (**実質的CIゲート**: Expo プロジェクト健全性とバージョン整合性を検証。Expo Doctor の exit code を直接 CI の成否として扱い、問題検出時は CI を失敗させる)
- **`test` ジョブ**:
  - `npm ci`
  - `npm run test:coverage -- --runInBand`
- **`native-build` ジョブ** (**条件付きネイティブビルドゲート**):
  - 以下のいずれかのネイティブ影響ファイル・依存関係が変更された場合のみ、Ubuntu runner 上で Java 17 環境（Gradle キャッシュ有効）をセットアップし `npm run build:android:debug` を実行:
    - `android/**`
    - `package-lock.json`
    - `app.json`
    - `app.config.*`
    - `babel.config.*`
    - `metro.config.*`
    - `eas.json`
    - `package.json` 内の native compatibility に影響する依存関係変更（Tier 1 コア・ネイティブモジュール等。scripts や metadata のみの変更ではスキップ）
  - 純粋な JS/TS（`src/**`）やドキュメント（`docs/**`）、`package.json` の scripts / metadata 変更のみの PR ではネイティブビルドを安全にスキップし、CI コストと実行時間を最適化。

### ネイティブビルド検証ルール
CI での自動実行に加え、以下のいずれかに該当する PR / コミットでは、ローカル開発環境でも **`npm run build:android:debug`** の実行を必須とします。
1. `llama.rn`, `react-native-gesture-handler`, `react-native-reanimated` 等のネイティブモジュールの変更
2. `android/` ディレクトリ配下のネイティブ設定・Gradle スクリプトの変更
3. Expo SDK のアップグレード
4. Android Permission や File System 関連のネイティブ契約変更

---

## 6. Future Considerations (将来の検討事項)

### Renovate への移行判断基準
現時点では、リポジトリの運用複雑性を上げずに済むよう GitHub 標準の **Dependabot** の設定見直しで対応しています。
将来的に以下のニーズが生じた場合は、Renovate の導入を再検討します：
1. `packageRules` を用いて、より細かな正規表現ベースのバージョン範囲固定やスケジューリングが必要になった場合。
2. Expo プリセット（`config:expo` 等のコミュニティ製ルールセット）の保守性が Dependabot よりも明確に上回ると判断された場合。
3. 自動マージ（Auto-merge）の高度な条件分岐を CI 連携で組み込みたくなった場合。

現時点では移行を行わず、本ポリシーに基づく Dependabot 運用を継続します。
