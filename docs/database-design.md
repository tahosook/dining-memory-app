# データベース設計書 - Dining Memory App

## 設計方針

### 基本方針
- **SQLite + Watermelon DB**: 高性能なローカルデータベース
- **オフラインファースト**: 全データを端末内保存
- **検索最適化**: セマンティック検索対応のインデックス設計
- **拡張性**: 将来機能追加に対応できる柔軟な構造

### パフォーマンス考慮
- **正規化バランス**: 検索速度と更新効率のバランス
- **インデックス戦略**: 検索パターンに最適化
- **画像データ分離**: BLOB データの効率的管理
- **バックアップ対応**: JSON エクスポート可能な構造

---

## データベーススキーマ

### 1. meals テーブル（食事記録メイン）

```sql
CREATE TABLE meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,           -- UUID for sync
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- 基本情報
    meal_name TEXT NOT NULL,             -- 料理名（AI解析 + 手動編集）
    meal_type TEXT,                      -- 朝食/昼食/夕食/間食
    cuisine_type TEXT,                   -- 和食/中華/洋食/その他
    
    -- AI解析結果
    ai_confidence REAL,                  -- AI解析の確信度 (0.0-1.0)
    ai_raw_result TEXT,                  -- AI解析の生データ（JSON）
    
    -- ユーザー入力
    satisfaction_rating INTEGER,         -- 満足度 (1-5)
    notes TEXT,                          -- ユーザーメモ
    
    -- メタデータ
    photo_path TEXT NOT NULL,           -- 画像ファイルパス
    photo_thumbnail_path TEXT,          -- サムネイル画像パス
    
    -- 位置情報
    location_name TEXT,                 -- 場所名（例：自宅、○○レストラン）
    latitude REAL,                      -- GPS緯度
    longitude REAL,                     -- GPS経度
    
    -- 時間情報
    meal_datetime DATETIME NOT NULL,    -- 実際の食事時間
    
    -- 同期・削除
    is_deleted BOOLEAN DEFAULT 0,       -- 論理削除フラグ
    synced_at DATETIME,                 -- 最終同期時刻
    
    -- インデックス用
    search_text TEXT,                   -- 検索用結合テキスト
    tags TEXT                           -- タグ（カンマ区切り）
);
```

### 2. ingredients テーブル（材料・要素）

```sql
CREATE TABLE ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_id INTEGER NOT NULL,
    
    -- 材料情報
    name TEXT NOT NULL,                 -- 材料名（例：煮卵、ネギ、チャーシュー）
    category TEXT,                      -- カテゴリ（メイン/サイド/調味料/ドリンク）
    confidence REAL,                    -- AI認識の確信度
    
    -- 分量情報（将来拡張用）
    quantity TEXT,                      -- 分量（例：1個、少々）
    
    -- メタデータ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_user_added BOOLEAN DEFAULT 0,    -- ユーザーが手動追加したか
    
    FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
);
```

### 3. locations テーブル（場所マスター）

```sql
CREATE TABLE locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- 場所情報
    name TEXT NOT NULL UNIQUE,          -- 場所名
    category TEXT,                      -- 自宅/レストラン/コンビニ/その他
    
    -- 位置情報
    latitude REAL,
    longitude REAL,
    address TEXT,                       -- 住所
    
    -- 統計情報
    visit_count INTEGER DEFAULT 0,      -- 訪問回数
    last_visit DATETIME,                -- 最終訪問日
    
    -- メタデータ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_favorite BOOLEAN DEFAULT 0       -- お気に入り場所
);
```

### 4. meal_images テーブル（画像管理）

```sql
CREATE TABLE meal_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_id INTEGER NOT NULL,
    
    -- 画像情報
    original_path TEXT NOT NULL,        -- 元画像パス
    thumbnail_path TEXT,                -- サムネイル画像パス
    compressed_path TEXT,               -- 圧縮版画像パス
    
    -- 画像メタデータ
    file_size INTEGER,                  -- ファイルサイズ（bytes）
    width INTEGER,                      -- 画像幅
    height INTEGER,                     -- 画像高さ
    format TEXT,                        -- 画像形式（JPEG/PNG/WebP）
    
    -- 撮影情報
    taken_at DATETIME,                  -- 撮影時刻
    camera_make TEXT,                   -- カメラメーカー
    camera_model TEXT,                  -- カメラモデル
    
    -- 処理フラグ
    is_processed BOOLEAN DEFAULT 0,     -- AI処理済みフラグ
    processing_status TEXT,             -- 処理状況
    
    FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
);
```

### 5. tags テーブル（タグマスター）

```sql
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- タグ情報
    name TEXT NOT NULL UNIQUE,          -- タグ名
    category TEXT,                      -- タグカテゴリ
    color TEXT,                         -- 表示色
    
    -- 統計情報
    usage_count INTEGER DEFAULT 0,      -- 使用回数
    
    -- メタデータ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_system_tag BOOLEAN DEFAULT 0     -- システム定義タグか
);
```

### 6. meal_tags テーブル（食事-タグ関連）

```sql
CREATE TABLE meal_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    
    -- メタデータ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    
    UNIQUE(meal_id, tag_id)
);
```

### 7. search_vectors テーブル（セマンティック検索用）

```sql
CREATE TABLE search_vectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_id INTEGER NOT NULL,
    
    -- ベクトル情報
    vector_data BLOB,                   -- ベクトル埋め込み（バイナリ）
    vector_model TEXT,                  -- 使用モデル名
    vector_dimension INTEGER,           -- ベクトル次元数
    
    -- テキスト情報
    indexed_text TEXT,                  -- ベクトル化対象テキスト
    
    -- メタデータ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
);
```

### 8. app_settings テーブル（アプリ設定）

```sql
CREATE TABLE app_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- 設定情報
    key TEXT NOT NULL UNIQUE,           -- 設定キー
    value TEXT,                         -- 設定値（JSON形式）
    data_type TEXT,                     -- データ型
    
    -- メタデータ
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    description TEXT                    -- 設定の説明
);
```

---

## インデックス設計

### パフォーマンス最適化インデックス

```sql
-- 日時検索用
CREATE INDEX idx_meals_meal_datetime ON meals(meal_datetime);
CREATE INDEX idx_meals_created_at ON meals(created_at);

-- 場所検索用
CREATE INDEX idx_meals_location ON meals(location_name, latitude, longitude);

-- 満足度検索用
CREATE INDEX idx_meals_satisfaction ON meals(satisfaction_rating);

-- テキスト検索用（FTS）
CREATE INDEX idx_meals_search_text ON meals(search_text);

-- 論理削除・同期用
CREATE INDEX idx_meals_deleted ON meals(is_deleted);
CREATE INDEX idx_meals_sync ON meals(synced_at);

-- 材料検索用
CREATE INDEX idx_ingredients_name ON ingredients(name);
CREATE INDEX idx_ingredients_category ON ingredients(category);

-- 複合インデックス（よく使われる組み合わせ）
CREATE INDEX idx_meals_datetime_location ON meals(meal_datetime, location_name);
CREATE INDEX idx_meals_type_cuisine ON meals(meal_type, cuisine_type);
```

### 全文検索（FTS5）設定

```sql
-- 全文検索用仮想テーブル
CREATE VIRTUAL TABLE meals_fts USING fts5(
    meal_name,
    search_text,
    notes,
    content='meals',
    content_rowid='id'
);

-- FTS更新トリガー
CREATE TRIGGER meals_fts_insert AFTER INSERT ON meals BEGIN
    INSERT INTO meals_fts(rowid, meal_name, search_text, notes)
    VALUES (new.id, new.meal_name, new.search_text, new.notes);
END;

CREATE TRIGGER meals_fts_update AFTER UPDATE ON meals BEGIN
    UPDATE meals_fts SET 
        meal_name = new.meal_name,
        search_text = new.search_text,
        notes = new.notes
    WHERE rowid = new.id;
END;

CREATE TRIGGER meals_fts_delete AFTER DELETE ON meals BEGIN
    DELETE FROM meals_fts WHERE rowid = old.id;
END;
```

---

## データ例とクエリパターン

### サンプルデータ

```sql
-- 食事記録サンプル
INSERT INTO meals (
    uuid, meal_name, meal_type, cuisine_type,
    ai_confidence, satisfaction_rating, notes,
    photo_path, location_name, latitude, longitude,
    meal_datetime, search_text, tags
) VALUES (
    '12345678-1234-5678-9abc-123456789abc',
    'ラーメン（醤油）', '夕食', '和食',
    0.85, 4, '美味しかった。また来たい。',
    '/images/meal_001.jpg', '○○ラーメン店', 35.6762, 139.6503,
    '2025-09-09 19:30:00',
    'ラーメン 醤油 和食 ○○ラーメン店 美味しかった',
    'ラーメン,醤油,麺類'
);

-- 材料データサンプル
INSERT INTO ingredients (meal_id, name, category, confidence) VALUES
(1, 'ラーメン', 'メイン', 0.95),
(1, '煮卵', 'トッピング', 0.80),
(1, 'ネギ', 'トッピング', 0.75),
(1, 'チャーシュー', 'トッピング', 0.90);
```

### よく使われるクエリパターン

#### 1. 期間別検索
```sql
-- 今月の食事記録
SELECT * FROM meals 
WHERE meal_datetime >= date('now', 'start of month')
  AND is_deleted = 0
ORDER BY meal_datetime DESC;

-- 過去1週間の満足度平均
SELECT AVG(satisfaction_rating) as avg_satisfaction
FROM meals 
WHERE meal_datetime >= datetime('now', '-7 days')
  AND satisfaction_rating IS NOT NULL;
```

#### 2. テキスト検索
```sql
-- 全文検索
SELECT m.* FROM meals m
JOIN meals_fts fts ON m.id = fts.rowid
WHERE meals_fts MATCH 'ラーメン'
  AND m.is_deleted = 0
ORDER BY m.meal_datetime DESC;

-- 材料検索
SELECT DISTINCT m.* FROM meals m
JOIN ingredients i ON m.id = i.meal_id
WHERE i.name LIKE '%卵%'
  AND m.is_deleted = 0;
```

#### 3. 統計クエリ
```sql
-- よく食べる料理Top10
SELECT meal_name, COUNT(*) as count
FROM meals 
WHERE is_deleted = 0
GROUP BY meal_name 
ORDER BY count DESC 
LIMIT 10;

-- 場所別訪問回数
SELECT location_name, COUNT(*) as visit_count,
       AVG(satisfaction_rating) as avg_rating
FROM meals 
WHERE location_name IS NOT NULL 
  AND is_deleted = 0
GROUP BY location_name 
ORDER BY visit_count DESC;
```

#### 4. セマンティック検索（将来実装）
```sql
-- ベクトル類似度検索（概念的な例）
SELECT m.*, 
       vector_similarity(sv.vector_data, ?) as similarity
FROM meals m
JOIN search_vectors sv ON m.id = sv.meal_id
WHERE similarity > 0.7
ORDER BY similarity DESC
LIMIT 10;
```

---

## データ管理戦略

### バックアップ・同期

#### JSON エクスポート形式
```json
{
  "version": "1.0",
  "exported_at": "2025-09-09T10:00:00Z",
  "meals": [
    {
      "uuid": "12345678-1234-5678-9abc-123456789abc",
      "meal_name": "ラーメン（醤油）",
      "meal_type": "夕食",
      "cuisine_type": "和食",
      "satisfaction_rating": 4,
      "notes": "美味しかった",
      "meal_datetime": "2025-09-09T19:30:00Z",
      "location": {
        "name": "○○ラーメン店",
        "latitude": 35.6762,
        "longitude": 139.6503
      },
      "ingredients": [
        {"name": "ラーメン", "category": "メイン"},
        {"name": "煮卵", "category": "トッピング"}
      ],
      "images": [
        {
          "original_path": "/images/meal_001.jpg",
          "thumbnail_path": "/images/thumb_001.jpg"
        }
      ],
      "ai_analysis": {
        "confidence": 0.85,
        "raw_result": "..."
      }
    }
  ]
}
```

### データ最適化

#### 定期メンテナンス
```sql
-- 削除済みデータの物理削除（30日後）
DELETE FROM meals 
WHERE is_deleted = 1 
  AND updated_at < datetime('now', '-30 days');

-- 未使用タグの削除
DELETE FROM tags 
WHERE usage_count = 0 
  AND created_at < datetime('now', '-7 days')
  AND is_system_tag = 0;

-- インデックス再構築
REINDEX;

-- データベース最適化
VACUUM;
```

#### ストレージ効率化
- **画像圧縮**: WebP形式で保存、サムネイル生成
- **重複排除**: 同じ画像のハッシュチェック
- **アーカイブ**: 古いデータの圧縮保存

---

## 技術実装メモ

### Watermelon DB設定

```javascript
// schema.js
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
        { name: 'satisfaction_rating', type: 'number' },
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
    })
    // ... 他のテーブル定義
  ]
})
```

### Model定義例

```javascript
// Meal.js
import { Model } from '@nozbe/watermelondb'
import { field, date, children, json } from '@nozbe/watermelondb/decorators'

export default class Meal extends Model {
  static table = 'meals'
  static associations = {
    ingredients: { type: 'has_many', foreignKey: 'meal_id' },
    images: { type: 'has_many', foreignKey: 'meal_id' },
  }

  @field('uuid') uuid
  @field('meal_name') mealName
  @field('meal_type') mealType
  @field('cuisine_type') cuisineType
  @field('ai_confidence') aiConfidence
  @field('satisfaction_rating') satisfactionRating
  @field('notes') notes
  @field('photo_path') photoPath
  @field('location_name') locationName
  @field('latitude') latitude
  @field('longitude') longitude
  @date('meal_datetime') mealDatetime
  @field('search_text') searchText
  @field('tags') tags
  @field('is_deleted') isDeleted

  @children('ingredients') ingredients
  @children('meal_images') images
}
```

---

## 将来の拡張予定

### Phase 2 機能
- **栄養情報テーブル**: カロリー、栄養素情報
- **レシピテーブル**: 自炊記録との連携
- **共有機能**: 友人・家族との記録共有
- **レコメンド**: 過去データに基づく推奨

### セマンティック検索強化
- **ベクトル検索エンジン**: Faiss等の統合
- **多言語対応**: 英語・中国語等の検索
- **画像類似検索**: 見た目の近い料理検索
- **味覚プロファイル**: 個人の嗜好学習

---

*このスキーマは開発進捗に合わせて随時更新・最適化する*