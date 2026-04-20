# Dining Memory App

食事やお酒の写真を撮影し、記録として端末内に保存するモバイルアプリです。  
撮った写真を料理名、場所、メモとあわせて残し、あとから一覧・検索・統計で振り返ることを目指しています。

## 今できること
- カメラで撮影し、内容を確認してから保存する
- 記録を一覧で見返し、詳細画面で大きい写真を確認する
- 記録詳細から編集・削除し、必要な写真だけ X 投稿に進める
- テキスト検索、場所フィルター、自炊フィルターで探す
- 保存済み記録の件数や傾向を簡単な統計で確認する

## ドキュメント案内

### あなた向けドキュメント
- [プロダクト概要](docs/product/overview.md): 何を作りたいか、誰のためのものか、将来どうしたいか
- [実装進捗](docs/product/progress.md): 今どこまでできているか、何が未実装か

### 実装向けドキュメント
- [技術仕様](docs/architecture/tech-spec.md): current implementation と runtime assumptions
- [画面設計](docs/ux/screen-designs.md): current screen behavior
- [ユーザーフロー](docs/ux/user-flows.md): current implemented flows
- [DB設計](docs/domain/database-design.md): current schema and storage rules
- [実装規約](docs/engineering/coding-standards.md): coding rules
- [Codex 作業ルール](docs/engineering/codex-workflow.md): review and verification workflow
- [即時改善提案](docs/engineering/immediate-improvements.md): 今すぐ入れるべき改善案の整理

### ドキュメント入口
- [docs/index.md](docs/index.md): 誰がどの文書を読むかの案内板
- [AGENTS.md](AGENTS.md): Codex の入口と文書作成ルール

## プロジェクト構成

```text
dining-memory-app/
├── AGENTS.md
├── docs/
│   ├── index.md
│   ├── product/
│   ├── architecture/
│   ├── domain/
│   ├── ux/
│   ├── engineering/
│   └── notes/
├── src/
├── assets/
├── tests/
└── README.md
```

## 開発環境セットアップ

### システム要件
- Node.js 25.9.x 推奨
- Expo SDK 55.x
- Expo CLI 55.x 以上（`npx expo` 推奨）
- iOS 開発: Xcode
- Android 開発: Android Studio（任意）

### 初期セットアップ
```bash
git clone https://github.com/tahosook/dining-memory-app.git
cd dining-memory-app
node --version
npm install
cp .env.example .env
npx expo start
```

### 実行時前提
- React Native 0.83 系 / React 19.2 系を前提としています
- Expo SDK 55 以降のため New Architecture は常時有効です
- Android の写真保存権限は `expo-media-library` プラグインで管理します

### 環境変数
```env
# 将来的な機能拡張用 API キー
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key

EXPO_PUBLIC_APP_NAME=Dining Memory
EXPO_PUBLIC_APP_VERSION=1.0.0
```

`.env.example` をテンプレートとして使い、`.env` はローカル専用ファイルとして扱います。

### 動作確認
1. 物理デバイスで Expo Go を開く
2. カメラタブから写真を撮影し、料理名などを入力して保存する
3. 記録タブと検索タブで保存結果を確認する

## 検証の考え方
- ユニットテスト: 個別ロジックやサービス
- 統合テスト: 撮影から保存、表示までの一連フロー
- 自動テスト: Jest + React Native Testing Library
- 詳細な検証ルールは [docs/engineering/codex-workflow.md](docs/engineering/codex-workflow.md) を参照

## APK ビルド
### 🔹 開発用デバッグAPK
```bash
cd android
./gradlew assembleDebug
```
出力先: `./android/app/build/outputs/apk/debug/app-debug.apk`

### 🔹 本番用リリースAPK（推奨）
```bash
cd android
./gradlew assembleRelease
```
出力先: `./android/app/build/outputs/apk/release/app-release.apk`

✅ どちらも一度端末にインストールすればUSBケーブル不要で単体で動作します。開発サーバーなしでも全機能が利用可能です。

💡 リリース版は最適化が有効で起動が速く、ファイルサイズも小さくなります。実際に使う場合はこちらを推奨します。
