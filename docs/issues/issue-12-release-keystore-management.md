# [Ops/Security] リリースビルド署名鍵（Keystore）の生成・保管・注入方針の策定

- **内部ドキュメントID**: issue-12
- **対応 GitHub Issue**: GitHub Issue #109（※GitHub の PR/Issue #12 とは無関係の内部文書ID）
- **ステータス**: 完了 (Closed)
- **策定ガイドライン**: [docs/engineering/release-keystore-guidelines.md](../engineering/release-keystore-guidelines.md)
- **関連ファイル**: `android/app/build.gradle`, `README.md`, `eas.json`, `.gitignore`
- **関連ドキュメント**: [docs/engineering/github-security-settings.md](../engineering/github-security-settings.md)

## 目的
本番リリースビルドにおける署名鍵（Keystore）の安全な生成、保管・バックアップ、および各ビルド環境（ローカル / CI / EAS）への注入運用を確立し、秘密鍵の漏洩や紛失（アプリアップデート不可）のリスクを排除する。

## 背景・現状
1. **Gradle 側の実装状況**:
   - `android/app/build.gradle` の `signingConfigs.release` において、`RELEASE_STORE_FILE`, `RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD` が設定されていれば release 署名を行い、未設定の場合はローカル検証用に debug 署名へフォールバックする安全機構がすでに組み込まれている。
   - 設定不備（ファイル欠損やパスワード不足）時は silent fallback を防ぐためビルドエラーとなる。
2. **Git 除外状況**:
   - ルートの `.gitignore` により `*.keystore`, `*.jks`, `*.key` 等の秘密鍵ファイルは追跡対象外となっている。
3. **未解決の運用課題**:
   - 本番用キーストアの生成規格（アルゴリズム、鍵長、有効期間）や生成手順が未定義。
   - 鍵の紛失対策（開発者個人 PC の破損時にアプリアップデートが永久に不可能になる致命的リスク）となる多重保管・バックアップルールが未確立。
   - ビルド環境ごとのシークレット注入方法（ローカル手動ビルド、GitHub Actions CI、EAS Build）の住み分けや管理方針が未整理。
   - 将来の Google Play 公開を見据えた Play App Signing（Upload key と App signing key の分離）の採否方針が未決定。

## 検討・実施内容
### 1. キーストアの生成規格と手順の策定
- Android 公式推奨に準拠したキーストア生成コマンド（例: RSA 4096bit または 2048bit、有効期限 25 年以上）を明文化する。
- 鍵エイリアス名およびパスワード管理基準を定義する。

### 2. 保管・バックアップ運用の確立
- 開発者ローカル端末のストレージのみに依存しない、安全な暗号化バックアップ体制（例: パスワードマネージャーのセキュアストレージ、暗号化クラウドバックアップ等）を策定する。
- 鍵へのアクセス権限および漏洩時の緊急対応手順（失効・再発行手順）を確認する。

### 3. 各ビルド環境へのシークレット注入方針の整理
以下のビルド実行環境ごとに、安全な認証情報の渡し方を決定する：
- **ローカル手動ビルド**: `~/.gradle/gradle.properties` または `.env.local` 経由での設定手順。
- **GitHub Actions (CI)**: GitHub Secrets に Base64 エンコードしたキーストアおよびパスワードを登録し、ビルド時に一時ファイルとして復元・注入する方式の検討。
- **EAS Build**: Expo Application Services を利用する場合の EAS Credentials / Secrets での管理方針。

### 4. 配布形態（Google Play / 野良配布）との整合性
- Google Play 公開を想定する場合、Play App Signing を利用した Upload 鍵運用の可否を検討する。
- GitHub Releases 等での直接 APK 配布を行う場合の署名整合性を確認する。

### 5. セキュリティ確認とガードレール
- ビルドログ、CI アーティファクト、コミット履歴に鍵やパスワードが露出しないことを確認する。
- `docs/engineering/` 配下に「リリース署名・キーストア管理ガイドライン」を整備する。

## 今回やらないこと（Non-goals / Out of scope）
- 本Issue内での実際の秘密鍵・パスワードの生成および共有（秘密情報はリポジトリ外で管理する）。
- アプリのコード変更（`android/app/build.gradle` の署名ロジック改修は必要と判断された場合のみ）。

## 受入基準
- [x] リリース署名用キーストアの生成手順および暗号化保管・バックアップ運用方針が策定されている。
- [x] ローカル / CI / EAS の各ビルド経路における署名鍵の注入フローが決定されている。
- [x] Google Play（Play App Signing）および直接配布に対する署名方針が整理されている。
- [x] 策定された運用手順が `docs/engineering/` 等のドキュメント（[docs/engineering/release-keystore-guidelines.md](../engineering/release-keystore-guidelines.md)）として記録されている。
