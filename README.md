# Dining Memory App

食事やお酒の写真を撮影し、記録として端末内に保存するモバイルアプリです。  
撮った写真を料理名、場所、メモとあわせて残し、あとから一覧・検索・統計で振り返ることを目指しています。

## 今できること
- カメラで撮影し、内容を確認してから保存する
- 記録を一覧で見返し、編集・削除する
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
- Node.js 18.x 以上
- Expo CLI 54.x 以上
- iOS 開発: Xcode
- Android 開発: Android Studio（任意）

### 初期セットアップ
```bash
git clone https://github.com/tahosook/dining-memory-app.git
cd dining-memory-app
node --version
npm install
npm install -g @expo/cli
cp .env.example .env.local
npx expo start
```

### 環境変数
```env
# 将来的な機能拡張用 API キー
GEMINI_API_KEY=your_gemini_api_key

EXPO_PUBLIC_APP_NAME=Dining Memory
EXPO_PUBLIC_APP_VERSION=1.0.0
```

### 動作確認
1. 物理デバイスで Expo Go を開く
2. カメラタブから写真を撮影し、料理名などを入力して保存する
3. 記録タブと検索タブで保存結果を確認する

## 検証の考え方
- ユニットテスト: 個別ロジックやサービス
- 統合テスト: 撮影から保存、表示までの一連フロー
- 自動テスト: Jest + React Native Testing Library
- 詳細な検証ルールは [docs/engineering/codex-workflow.md](docs/engineering/codex-workflow.md) を参照
