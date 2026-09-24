# Release Keystore Guidelines

## Meta
- Purpose: define generation specs, secure storage, backup policies, and secret injection procedures for Android release signing keys (Keystore).
- Audience: repository maintainers, release engineers, CI administrators, and AI agents.
- Update trigger: changes in Android signing standards, build infrastructure (Gradle / CI / EAS), or release distribution channels.
- Related docs: [README.md](../../README.md), [docs/engineering/github-security-settings.md](github-security-settings.md), [docs/engineering/development-workflow.md](development-workflow.md), [docs/architecture/tech-spec.md](../architecture/tech-spec.md)

## Summary
Android 本番リリースビルドにおいて、アプリの同一性とセキュリティを保証する署名鍵（Keystore）の生成規格、暗号化保管・バックアップ体制、および各ビルド環境（ローカル手動ビルド / GitHub Actions CI / EAS Build）へのシークレット注入手順を規定します。
秘密鍵の Git 混入を完全に防止しつつ、鍵の紛失による「アプリアップデート永久不能リスク」を排除することを最重要原則とします。

---

## 1. 署名鍵（Keystore）生成規格

Android 公式セキュリティガイドラインに準拠し、長期署名に耐えうる以下の規格でキーストアを生成します。

### 1.1 仕様規格
- **鍵アルゴリズム (Key Algorithm)**: `RSA`
- **鍵長 (Key Size)**: `4096 bit`（長期安全性を担保するため、2048bit ではなく 4096bit を採用）
- **キーストア形式 (Store Type)**: `PKCS12`（Java 9 以降の標準。旧 JKS 形式ではなく標準規格 PKCS12 を指定）
- **有効期間 (Validity)**: `10000 days`（約27年。Google Play 公開の要件である25年以上を満たす）
- **エイリアス名 (Key Alias)**: `dining-memory-release`
- **ファイル名**: `dining-memory-release.keystore`
- **パスワード要件**:
  - キーストアパスワード（Store Password）および鍵パスワード（Key Password）は、英大文字・小文字・数字・記号を含む **16文字以上の高エントロピー文字列** とする。
  - パスワードマネージャーで生成・管理し、開発者個人による平文メモやチャットでの送受信を禁止する。

### 1.2 生成コマンド例
キーストア生成時は、JDK に付属する `keytool` コマンドを使用します。

```bash
keytool -genkeypair \
  -v \
  -keystore dining-memory-release.keystore \
  -alias dining-memory-release \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000 \
  -storetype PKCS12
```

> [!CAUTION]
> - 生成した `.keystore` ファイルは絶対にリポジトリのワーキングツリー内に直接配置しないでください。
> - ルートの `.gitignore` により `*.keystore`, `*.jks`, `*.key` 等は除外されていますが、誤コミットの根絶のため、作業はリポジトリ外のセキュアな一時ディレクトリで実施します。

---

## 2. 保管・暗号化バックアップ運用方針

Android アプリケーションでは、**署名鍵を紛失すると同じパッケージ名（`com.tahosook.diningmemory`）でのアプリアップデートの提供が永久に不可能** になります（既存ユーザーのデータ引き継ぎ不可）。
単一の開発端末（PC）の故障や紛失に備え、多重の暗号化バックアップ体制を義務付けます。

### 2.1 保管の3大原則
1. **Never Commit to Git**: リポジトリ、Git 履歴、Pull Request、Issue 本文への秘密鍵・パスワードの混入を絶対禁止。
2. **No Single Point of Failure (SPOF)**: 開発者1台のローカルストレージのみに保管することを禁止。
3. **Encryption at Rest**: バックアップ先は必ずエンドツーエンド暗号化または強固な暗号化ボリュームとする。

### 2.2 多重バックアップ構成
以下の 2 箇所以上に分散して安全に保管します：

1. **プライマリ保管（パスワードマネージャーのセキュア保管庫）**:
   - 1Password / Bitwarden 等の暗号化セキュアボルトにアイテムを作成。
   - `dining-memory-release.keystore` ファイル自体を添付。
   - 以下のメタデータをカスタムフィールドに記録：
     - `Key Alias`: `dining-memory-release`
     - `Store Password`: （生成したパスワード）
     - `Key Password`: （生成したパスワード）
     - `Creation Date`: 生成年月日
     - `SHA-256 Fingerprint`: 証明書のフィンガープリント（`keytool -list -v -keystore ...` で確認）
2. **セカンダリ保管（オフライン Cold Storage）**:
   - リポジトリ管理者が管理する暗号化外付けストレージ（または GPG 暗号化されたオフラインバックアップアーカイブ）に複製保管。

---

## 3. ビルド環境ごとのシークレット注入手順

`android/app/build.gradle` では、以下の環境変数および Gradle プロパティを読み込む署名機構が既に実装されています。

```groovy
def storeFilePath = findProperty('RELEASE_STORE_FILE') ?: System.getenv('RELEASE_STORE_FILE')
def storePass     = findProperty('RELEASE_STORE_PASSWORD') ?: System.getenv('RELEASE_STORE_PASSWORD')
def alias         = findProperty('RELEASE_KEY_ALIAS') ?: System.getenv('RELEASE_KEY_ALIAS')
def keyPass       = findProperty('RELEASE_KEY_PASSWORD') ?: System.getenv('RELEASE_KEY_PASSWORD')
```

### 3.1 ローカル手動ビルド (`npm run build:android:release`)

ローカル開発環境で本番署名付き APK を生成する場合は、以下のいずれかの方法でシークレットを注入します。

#### 推奨方式: `~/.gradle/gradle.properties` による注入
ユーザーホーム配下のグローバル Gradle 設定ファイル（リポジトリ外）に定義します。

```properties
# ~/.gradle/gradle.properties に追記
RELEASE_STORE_FILE=/Users/username/secure-keys/dining-memory-release.keystore
RELEASE_STORE_PASSWORD=your_keystore_password
RELEASE_KEY_ALIAS=dining-memory-release
RELEASE_KEY_PASSWORD=your_key_password
```

- **利点**:
  - シェルの実行履歴（`history`）にパスワードが残りません。
  - プロジェクトのリポジトリ内にシークレットファイルを持ち込む必要がありません。

#### 代替方式: シェルセッションでの一時環境変数 export
```bash
export RELEASE_STORE_FILE="/path/to/dining-memory-release.keystore"
export RELEASE_STORE_PASSWORD="your_keystore_password"
export RELEASE_KEY_ALIAS="dining-memory-release"
export RELEASE_KEY_PASSWORD="your_key_password"

npm run build:android:release
```

#### 安全フォールバック機構
- `RELEASE_STORE_FILE` が未指定の場合、個人ローカル確認用として自動的に **debug 署名** が適用されます。
- `RELEASE_STORE_FILE` が指定されているが、ファイルが存在しない場合やパスワード・Alias が欠損している場合は、意図しない未署名・debug 署名での誤リリースを防ぐため **必ず Gradle ビルドエラー（GradleException）** となります。

---

### 3.2 GitHub Actions CI (自動ビルド・リリース)

将来的に GitHub Actions 上でタグ付けリリース（Releases）や APK 自動ビルドを行う場合の構成です。

#### 1. GitHub Repository Secrets の設定
リポジトリの `Settings > Secrets and variables > Actions` に以下を登録します：

| Secret 名 | 内容 |
| :--- | :--- |
| `ANDROID_RELEASE_KEYSTORE_BASE64` | `base64 -i dining-memory-release.keystore` の出力文字列 |
| `RELEASE_STORE_PASSWORD` | キーストアのパスワード |
| `RELEASE_KEY_ALIAS` | `dining-memory-release` |
| `RELEASE_KEY_PASSWORD` | 鍵のパスワード |

#### 2. CI ワークフローでの復元とクリーンアップ
ワークフロー内では、一時ファイルとしてデコードし、ビルド完了後は成否に関わらず確実に削除します。

```yaml
- name: Decode Android Release Keystore
  run: |
    echo "${{ secrets.ANDROID_RELEASE_KEYSTORE_BASE64 }}" | base64 --decode > /tmp/release.keystore

- name: Build Android Release APK
  env:
    RELEASE_STORE_FILE: /tmp/release.keystore
    RELEASE_STORE_PASSWORD: ${{ secrets.RELEASE_STORE_PASSWORD }}
    RELEASE_KEY_ALIAS: ${{ secrets.RELEASE_KEY_ALIAS }}
    RELEASE_KEY_PASSWORD: ${{ secrets.RELEASE_KEY_PASSWORD }}
  run: npm run build:android:release

- name: Clean up Keystore
  if: always()
  run: rm -f /tmp/release.keystore
```

---

### 3.3 EAS Build (Expo Application Services)

Expo のクラウドビルド（EAS Build）を利用する場合の構成です。

1. **Credentials の管理**:
   - `eas credentials` コマンドを使用し、Android Release 用キーストアとして登録します。
   - 対話型プロンプトで既存キーストアファイル、エイリアス、パスワードを入力し、Expo のセキュアクラウド保管庫へアップロードします。
2. **設定 (`eas.json`)**:
   - `eas.json` の `build.production` プロファイルで配布形式（`apk` または `app-bundle (aab)`）を制御します。

---

## 4. 配布形態（Google Play / 直接配布）と署名運用方針

配布形態によって、署名鍵の紛失耐性と運用責任が大きく異なります。

### 4.1 Google Play 公開時: Play App Signing (推奨)
将来的に Google Play ストアへ公開する場合は、**Google Play App Signing (PEP: Play Encrypts and Protects)** を利用することを原則とします。

- **App Signing Key（アプリ署名鍵）**:
  - Google Play のインフラ内で安全に生成・保管されます。エンドユーザー端末へ配信される APK はこの鍵で署名されます。
- **Upload Key（アップロード鍵）**:
  - 本ガイドライン第 1 節で生成したキーストア（`dining-memory-release.keystore`）を **Upload Key** として使用します。
  - Google Play Console への AAB アップロード時の身元認証にのみ使われます。
- **最大のメリット**:
  - 万が一開発者が Upload Key を紛失した場合でも、Google Play Console 経由で開発者認証（本人確認）を行うことで **Upload Key のリセット・再登録が可能** です（アプリアップデートの途絶を防止）。

### 4.2 GitHub Releases 等での直接配布（Sideloading / APK 直配布）
GitHub Releases や Web サイトから APK を直接ダウンロードしてインストールさせる形態の場合：

- 開発者が管理するキーストアが **唯一絶対の署名鍵** となります。
- Google Play のような救済（鍵リセット）機能は存在しません。
- 鍵を紛失した場合、ユーザーは既存アプリをアンインストール（ローカルの食事記録データや設定の喪失リスク）しない限りアップデートできなくなります。
- したがって、第 2 節の **暗号化多重バックアップ** の厳格な運用が不可欠です。

---

## 5. セキュリティ確認チェックリスト

リリースビルドおよび鍵管理における安全確認リストです。

- [ ] キーストアファイルが `.gitignore` の除外対象に含まれていることを確認（`git check-ignore -v /path/to/keystore`）
- [ ] コミット差分にキーストアバイナリや平文パスワードが含まれていないことを確認
- [ ] CI やローカルのビルドログにパスワードが出力されていないことを確認（Gradle を `--debug` や `--info` で実行する際はシークレット露出に注意）
- [ ] パスワードマネージャーにキーストアバイナリ、パスワード、Alias、SHA-256 フィンガープリントが保管されていることを確認
- [ ] オフラインのバックアップ（Cold Storage）への複製が完了していることを確認
