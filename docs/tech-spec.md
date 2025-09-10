# 技術仕様書 - Dining Memory App

## プロジェクト概要
食事とお酒の写真をAIで解析し、テキスト化してセマンティック検索可能な記録アプリ

### ターゲット
- **メインユーザー**: 40代後半男性
- **技術リテラシー**: 高い
- **求めるもの**: シンプルなUI、実用性重視
- **利用目的**: 食事記録、振り返り、行動パターンの発見

### 解決する課題
- 食事写真を撮るが、後で見返すことが少ない
- クラウドストレージの容量を無駄に消費している
- 過去の美味しかった料理やお店を思い出せない
- 自分の食事パターンや行動習慣に気づけない

## 技術スタック選定（ネイティブアプリ + 端末リソース最大活用）

### アーキテクチャ方針
**オフラインファースト + 端末リソース最大活用 + 必要最小限クラウド連携**

### アプリ開発フレームワーク
**選択: React Native + Expo**
- 理由:
  - iOS/Android両対応でワンコードベース
  - 豊富なネイティブ機能アクセス
  - AI開発支援（Cursor/Copilot）が充実
  - 無料でApp Store/Google Play配布可能
- **端末活用**: ネイティブAPI、GPU、ストレージ直接アクセス

### ローカルデータベース
**選択: SQLite + Watermelon DB**
- 理由:
  - 高性能なローカルSQL DB
  - 大容量データ処理（GB級も可能）
  - 複雑クエリ、インデックス対応
  - オフライン完全対応、暗号化対応
- **端末活用**: 端末内蔵SQLiteエンジンを直接活用

### ローカルストレージ・ファイル管理
**選択: React Native File System + 端末内蔵ストレージ**
- 理由:
  - 端末の内部ストレージ直接アクセス
  - ファイル操作、圧縮、メタデータ管理
  - アプリ専用領域で高セキュリティ
  - iCloud/Google Drive自動バックアップ対応
- **端末活用**: 端末の全ストレージ容量を活用可能

### カメラ・画像処理
**選択: Expo Camera + React Native Image Resizer**
- 理由:
  - ネイティブカメラアプリ並みの性能
  - リアルタイム画像処理
  - EXIF情報取得、GPS連携
  - ハードウェアエンコーダー活用
- **端末活用**: カメラハードウェア直接制御

### AI画像解析（ネイティブ + ハイブリッド）
**メイン: オンデバイスAI**
- **TensorFlow Lite Mobile**
  - ネイティブAI推論エンジン
  - GPU/NPU加速対応
  - 高速・低消費電力
  - 食べ物認識モデル組み込み
- **Core ML (iOS) / ML Kit (Android)**
  - OS標準のAI機能活用
  - テキスト認識、物体検出
  - ハードウェア最適化済み

**補完: クラウドAI（緊急時のみ）**
- **Google Gemini API**
  - 月1,500回無料枠
  - オンデバイスAIで不明な場合のみ使用
  - 月3-5回程度の想定

### バックアップ・同期
**選択: iCloud (iOS) / Google Drive (Android) + 暗号化**
- 理由:
  - OS標準機能で自動バックアップ
  - ユーザーの追加設定不要
  - 端末間同期も自動
- **端末活用**: OS標準の同期機能をそのまま活用

### 開発・配布
**選択: Expo Application Services (EAS)**
- 理由:
  - 個人開発者は月100回ビルド無料
  - App Store Connect/Google Play自動連携
  - OTA（Over The Air）アップデート対応
- **無料枠**: 個人利用は完全無料

## アーキテクチャ概要（ネイティブアプリ）

```
[スマートフォンアプリ]
    ↓ カメラ撮影
[Expo Camera API] → ネイティブカメラ制御
    ↓
[React Native Image Resizer] → 端末内画像処理
    ↓
[TensorFlow Lite] → オンデバイスAI解析
    ↓ 不明な場合のみ
[Gemini API] → クラウド解析（月3-5回）
    ↓ 全て端末内保存
[SQLite + Watermelon DB] → ローカルDB
    ↓
[React Native FS] → 端末ストレージ
    ↓ 自動バックアップ
[iCloud / Google Drive] → OS標準同期
```

## 運用コスト（完全無料）

| 機能 | 端末処理 | クラウド使用 | 月額コスト |
|------|----------|--------------|------------|
| アプリ配布 | - | App Store/Play Store | **0円** |
| 画像保存 | 端末ストレージ | なし | **0円** |
| AI解析 | TensorFlow Lite | Gemini 3-5回 | **0円** |
| データベース | SQLite | なし | **0円** |
| バックアップ | OS処理 | iCloud/Drive | **0円** |
| 開発環境 | - | EAS Build | **0円** |

**合計: 完全無料運用** 🎉

## 開発環境

### 推奨開発ツール
- **IDE**: Cursor (AI支援重視) または VS Code
- **バージョン管理**: GitHub
- **パッケージ管理**: npm または yarn
- **デバッグツール**: Expo DevTools, Flipper

### 必要な開発環境
```bash
# Node.js (18.x以上推奨)
node --version

# Expo CLI
npm install -g @expo/cli

# EAS CLI (ビルド用)
npm install -g eas-cli

# React Native CLI (必要に応じて)
npm install -g @react-native-community/cli
```

## MVP機能仕様

### Phase 1: コア機能（必須）
1. **写真撮影・アップロード**
   - カメラ連携
   - ギャラリー選択
   - 画像プレビュー

2. **AI解析・保存**
   - TensorFlow Liteで解析
   - 料理名、材料、メモを抽出
   - SQLiteに保存

3. **記録一覧表示**
   - 日付別表示
   - サムネイル表示
   - 解析結果表示

4. **基本検索**
   - テキスト検索（FTS5使用）
   - 日付フィルター

### Phase 2: 拡張機能
- **高度な検索・フィルター**: 場所、タグ、材料での絞り込み
- **統計・インサイト機能**: 自炊分析、行動パターン発見
- **設定・バックアップ**: データエクスポート、復元機能

### Phase 3: 将来機能
- **セマンティック検索**: ベクトル検索による自然言語検索
- **栄養情報表示**: カロリー、栄養素の推定
- **レシピ機能**: 自炊レシピの管理

## 詳細技術仕様

### データベース設計連携
```javascript
// Watermelon DB スキーマ例
import { appSchema, tableSchema } from '@nozbe/watermelondb'

export default appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'meals',
      columns: [
        { name: 'uuid', type: 'string', isIndexed: true },
        { name: 'meal_name', type: 'string' },
        { name: 'meal_type', type: 'string' },
        { name: 'cuisine_type', type: 'string' },
        { name: 'ai_confidence', type: 'number' },
        { name: 'notes', type: 'string' },
        { name: 'photo_path', type: 'string' },
        { name: 'location_name', type: 'string' },
        { name: 'latitude', type: 'number' },
        { name: 'longitude', type: 'number' },
        { name: 'meal_datetime', type: 'number', isIndexed: true },
        { name: 'search_text', type: 'string' },
        { name: 'tags', type: 'string' },
        { name: 'is_deleted', type: 'boolean', isIndexed: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ]
    }),
    tableSchema({
      name: 'ingredients',
      columns: [
        { name: 'meal_id', type: 'number', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'category', type: 'string' },
        { name: 'confidence', type: 'number' },
        { name: 'is_user_added', type: 'boolean' },
      ]
    }),
    // その他のテーブル...
  ]
})
```

### AI処理パイプライン
```javascript
// AI解析処理フロー
const analyzeImage = async (imagePath) => {
  try {
    // 1. ローカルAI解析
    const localResult = await TensorFlowLite.analyze(imagePath);
    
    if (localResult.confidence > 0.8) {
      return localResult;
    }
    
    // 2. 確信度が低い場合はクラウドAI使用
    const cloudResult = await GeminiAPI.analyze(imagePath);
    
    return {
      ...cloudResult,
      source: 'cloud'
    };
  } catch (error) {
    // 3. 全て失敗時は手動入力モード
    return {
      meal_name: '',
      confidence: 0,
      requires_manual_input: true
    };
  }
};
```

### 画像処理最適化
```javascript
// 画像圧縮・最適化
import ImageResizer from 'react-native-image-resizer';

const optimizeImage = async (imagePath) => {
  // 高解像度画像（保存用）
  const highRes = await ImageResizer.createResizedImage(
    imagePath,
    1920,
    1080,
    'JPEG',
    80
  );
  
  // サムネイル（一覧表示用）
  const thumbnail = await ImageResizer.createResizedImage(
    imagePath,
    300,
    200,
    'JPEG',
    70
  );
  
  return { highRes, thumbnail };
};
```

### 検索機能実装
```javascript
// FTS5 全文検索
const searchMeals = async (query, filters = {}) => {
  const db = await database;
  
  let sql = `
    SELECT m.* FROM meals m
    JOIN meals_fts fts ON m.id = fts.rowid
    WHERE meals_fts MATCH ?
  `;
  
  const params = [query];
  
  // フィルター追加
  if (filters.dateFrom) {
    sql += ` AND m.meal_datetime >= ?`;
    params.push(filters.dateFrom);
  }
  
  if (filters.location) {
    sql += ` AND m.location_name = ?`;
    params.push(filters.location);
  }
  
  sql += ` ORDER BY fts.rank DESC`;
  
  return await db.raw(sql, params);
};
```

## パフォーマンス最適化戦略

### メモリ管理
- **画像メモリ**: 大きな画像の効率的読み込み・解放
- **FlatList活用**: 大量データの仮想スクロール
- **キャッシュ戦略**: よく使うデータの先読み

### ストレージ最適化
- **WebP形式**: 高圧縮率での画像保存
- **段階的削除**: 古いデータの自動アーカイブ
- **インデックス最適化**: 検索速度の向上

### AI処理最適化
- **モデル量子化**: 軽量AIモデルの使用
- **GPU加速**: 端末GPU活用での高速化
- **非同期処理**: UI応答性の確保

## セキュリティ・プライバシー

### データ保護
- **ローカルストレージ**: 全データを端末内保存
- **暗号化**: 機密データの暗号化保存
- **アプリサンドボックス**: OS標準の分離機能活用

### プライバシー配慮
- **最小限データ収集**: 必要最小限の情報のみ
- **ユーザー制御**: データの削除・エクスポート権限
- **透明性**: データ使用目的の明確化

### 外部通信の最小化
- **クラウドAI**: 月数回のみの限定使用
- **バックアップ**: ユーザー選択によるオプション機能
- **分析データ**: 端末内処理のみ、外部送信なし

## 品質保証・テスト戦略

### テスト項目
1. **ユニットテスト**: データベース操作、AI解析処理
2. **統合テスト**: カメラ→AI→保存の一連フロー
3. **E2Eテスト**: 主要ユーザーフローの自動化
4. **パフォーマンステスト**: 大量データ処理、メモリ使用量
5. **デバイステスト**: iOS/Android実機での動作確認

### CI/CD パイプライン
```yaml
# .github/workflows/main.yml 例
name: CI/CD Pipeline

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - run: npm run type-check

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: expo/expo-github-action@v7
      - run: eas build --platform all --non-interactive
```

## 開発フロー・AI活用戦略

### AI開発支援活用
1. **設計フェーズ**: このClaude.aiでの設計相談
2. **実装フェーズ**: Cursor IDEでのリアルタイム支援
3. **デバッグフェーズ**: GitHub Copilotでの問題解決
4. **レビューフェーズ**: AI支援でのコード品質向上

### 段階的開発アプローチ
```
Week 1-2: 環境構築、基本画面レイアウト
Week 3-4: カメラ機能、基本AI解析
Week 5-6: データベース、記録機能
Week 7-8: 検索・フィルター機能
Week 9-10: 統計・インサイト機能
Week 11-12: 設定・最適化、リリース準備
```

## デプロイ・リリース戦略

### ビルド・配布
```bash
# 開発ビルド
expo start

# プレビュービルド
eas build --profile preview

# プロダクションビルド
eas build --profile production

# アプリストア申請
eas submit --platform all
```

### リリース管理
- **バージョニング**: セマンティックバージョニング採用
- **段階的リリース**: TestFlightでのベータテスト
- **OTAアップデート**: 軽微な修正の即座反映
- **ロールバック**: 問題発生時の迅速な対応

## 監視・分析

### エラー追跡
- **Sentry**: クラッシュレポート収集
- **ローカルログ**: 端末内でのログ管理
- **プライバシー配慮**: 個人情報を含まない形での収集

### 使用状況分析（オプション）
- **端末内分析**: 機能使用頻度の把握
- **パフォーマンス監視**: レスポンス時間、メモリ使用量
- **ユーザー同意**: 明示的な同意による実施

## 将来の拡張性

### 技術的拡張
1. **AI機能強化**: より高精度な認識、多言語対応
2. **セマンティック検索**: 自然言語での検索機能
3. **AR機能**: カメラプレビュー上での情報表示
4. **ウェアラブル連携**: Apple Watch、Android Wear対応

### 機能的拡張
1. **ソーシャル機能**: 友人との記録共有
2. **レコメンド**: 過去データに基づく提案
3. **API連携**: 外部サービスとの統合
4. **Web版**: ブラウザでの利用対応

---

## 実装開始準備チェックリスト

### 環境準備
- [ ] Node.js 18.x以上インストール
- [ ] Expo CLI インストール
- [ ] EAS CLI インストール
- [ ] 開発者アカウント準備（Apple, Google）

### プロジェクト初期化
- [ ] `expo init dining-memory-app`
- [ ] 必要ライブラリのインストール
- [ ] プロジェクト構成の設定
- [ ] GitHub リポジトリ作成

### 開発開始
- [ ] 基本ナビゲーション実装
- [ ] CameraScreen骨格作成
- [ ] データベーススキーマ実装
- [ ] 最初の画面表示確認

---

*この技術仕様書は実装進捗に合わせて随時更新・詳細化していく*