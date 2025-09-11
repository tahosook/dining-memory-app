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

### 40代男性ターゲット特化
- **実用的な分析**: 自炊レベル分類、行動パターン発見
- **メモ重視**: 振り返りに重要な自由記述の活用
- **プライバシー**: 端末内完結、外部送信最小限

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
    ai_source TEXT,                      -- 'local' or 'cloud' AI解析元
    
    -- ユーザー入力（満足度削除、メモ重視）
    notes TEXT,                          -- ユーザーメモ（重要フィールド）
    
    -- 自炊分析用
    cooking_level TEXT,                  -- 'quick'(時短)/'daily'(日常)/'gourmet'(本格)
    is_homemade BOOLEAN DEFAULT 0,       -- 自炊フラグ
    
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
    
    -- 自炊分析用
    ingredient_type TEXT,               -- 'fresh'(生鮮)/'processed'(加工)/'seasoning'(調味料)
    
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
    first_visit DATETIME,               -- 初回訪問日
    
    -- 40代男性向け分析用
    average_interval_days REAL,         -- 平均訪問間隔（日数）
    business_hours TEXT,                -- 営業時間情報
    price_range TEXT,                   -- 価格帯（S/M/L/XL）
    
    -- メタデータ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_favorite BOOLEAN DEFAULT 0,      -- お気に入り場所
    notes TEXT                          -- 場所に関するメモ
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
    quality_score REAL,                 -- 画像品質スコア
    
    FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
);
```

### 5. cooking_patterns テーブル（自炊パターン分析用）

```sql
CREATE TABLE cooking_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_id INTEGER NOT NULL,
    
    -- 自炊分析
    recipe_complexity INTEGER,          -- レシピ複雑度 (1-5)
    cooking_time_minutes INTEGER,       -- 調理時間（分）
    skill_level TEXT,                   -- 'beginner'/'intermediate'/'advanced'
    
    -- 材料分析
    ingredient_count INTEGER,           -- 使用材料数
    fresh_ingredient_ratio REAL,        -- 生鮮材料比率
    
    -- パターン分析用
    day_of_week INTEGER,                -- 曜日 (0=Sunday)
    time_of_day TEXT,                   -- 'morning'/'afternoon'/'evening'/'night'
    weather_condition TEXT,             -- 天気情報（将来拡張）
    
    -- メタデータ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    analysis_version TEXT,              -- 分析ロジックのバージョン
    
    FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
);
```

### 6. tags テーブル（タグマスター）

```sql
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- タグ情報
    name TEXT NOT NULL UNIQUE,          -- タグ名
    category TEXT,                      -- タグカテゴリ
    color TEXT,                         -- 表示色
    
    -- 統計情報
    usage_count INTEGER DEFAULT 0,      -- 使用回数
    
    -- 40代男性向け分析用
    business_usage BOOLEAN DEFAULT 0,   -- ビジネス関連タグか
    health_related BOOLEAN DEFAULT 0,   -- 健康関連タグか
    
    -- メタデータ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_system_tag BOOLEAN DEFAULT 0     -- システム定義タグか
);
```

### 7. meal_tags テーブル（食事-タグ関連）

```sql
CREATE TABLE meal_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    
    -- メタデータ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    confidence REAL,                    -- タグ付けの確信度
    
    FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    
    UNIQUE(meal_id, tag_id)
);
```

### 8. behavior_insights テーブル（行動パターン分析結果）

```sql
CREATE TABLE behavior_insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- インサイト情報
    insight_type TEXT NOT NULL,         -- 'routine'/'pattern'/'change'/'discovery'
    title TEXT NOT NULL,                -- インサイトのタイトル
    description TEXT,                   -- 詳細説明
    confidence REAL,                    -- 確信度
    
    -- 対象期間
    analysis_start_date DATE,           -- 分析開始日
    analysis_end_date DATE,             -- 分析終了日
    
    -- 関連データ
    related_meals TEXT,                 -- 関連する食事ID（JSON配列）
    statistical_data TEXT,             -- 統計データ（JSON）
    
    -- メタデータ
    discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_dismissed BOOLEAN DEFAULT 0,     -- ユーザーが却下したか
    shown_to_user BOOLEAN DEFAULT 0,    -- ユーザーに表示したか
    
    -- 40代男性向け
    business_relevance REAL,           -- ビジネス関連度
    health_relevance REAL,             -- 健康関連度
    lifestyle_relevance REAL           -- ライフスタイル関連度
);
```

### 9. search_vectors テーブル（セマンティック検索用）

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
    keywords TEXT,                      -- 抽出キーワード
    
    -- メタデータ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
);
```

### 10. app_settings テーブル（アプリ設定）

```sql
CREATE TABLE app_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- 設定情報
    key TEXT NOT NULL UNIQUE,           -- 設定キー
    value TEXT,                         -- 設定値（JSON形式）
    data_type TEXT,                     -- データ型
    
    -- メタデータ
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    description TEXT,                   -- 設定の説明
    
    -- ユーザー関連
    is_user_setting BOOLEAN DEFAULT 1, -- ユーザー設定かシステム設定か
    requires_restart BOOLEAN DEFAULT 0  -- 変更時の再起動要否
);
```

---

## インデックス設計

### パフォーマンス最適化インデックス

```sql
-- 基本検索用インデックス
CREATE INDEX idx_meals_meal_datetime ON meals(meal_datetime);
CREATE INDEX idx_meals_created_at ON meals(created_at);
CREATE INDEX idx_meals_is_deleted ON meals(is_deleted);

-- 場所・位置情報検索用
CREATE INDEX idx_meals_location ON meals(location_name, latitude, longitude);
CREATE INDEX idx_locations_name ON locations(name);
CREATE INDEX idx_locations_category ON locations(category);

-- 自炊分析用インデックス
CREATE INDEX idx_meals_homemade ON meals(is_homemade);
CREATE INDEX idx_meals_cooking_level ON meals(cooking_level);
CREATE INDEX idx_cooking_patterns_complexity ON cooking_patterns(recipe_complexity, skill_level);

-- AI解析用インデックス
CREATE INDEX idx_meals_ai_confidence ON meals(ai_confidence);
CREATE INDEX idx_meals_ai_source ON meals(ai_source);

-- 材料検索用
CREATE INDEX idx_ingredients_name ON ingredients(name);
CREATE INDEX idx_ingredients_category ON ingredients(category);
CREATE INDEX idx_ingredients_type ON ingredients(ingredient_type);

-- 行動分析用インデックス
CREATE INDEX idx_cooking_patterns_day ON cooking_patterns(day_of_week, time_of_day);
CREATE INDEX idx_behavior_insights_type ON behavior_insights(insight_type, confidence);

-- 複合インデックス（よく使われる組み合わせ）
CREATE INDEX idx_meals_datetime_location ON meals(meal_datetime, location_name);
CREATE INDEX idx_meals_type_cuisine ON meals(meal_type, cuisine_type);
CREATE INDEX idx_meals_homemade_datetime ON meals(is_homemade, meal_datetime);
CREATE INDEX idx_meals_cooking_level_datetime ON meals(cooking_level, meal_datetime);

-- 同期・バックアップ用
CREATE INDEX idx_meals_sync ON meals(synced_at, is_deleted);
```

### 全文検索（FTS5）設定

```sql
-- 全文検索用仮想テーブル
CREATE VIRTUAL TABLE meals_fts USING fts5(
    meal_name,
    search_text,
    notes,
    location_name,
    tags,
    content='meals',
    content_rowid='id'
);

-- FTS更新トリガー
CREATE TRIGGER meals_fts_insert AFTER INSERT ON meals BEGIN
    INSERT INTO meals_fts(rowid, meal_name, search_text, notes, location_name, tags)
    VALUES (new.id, new.meal_name, new.search_text, new.notes, new.location_name, new.tags);
END;

CREATE TRIGGER meals_fts_update AFTER UPDATE ON meals BEGIN
    UPDATE meals_fts SET 
        meal_name = new.meal_name,
        search_text = new.search_text,
        notes = new.notes,
        location_name = new.location_name,
        tags = new.tags
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
-- 自炊記録の例
INSERT INTO meals (
    uuid, meal_name, meal_type, cuisine_type,
    ai_confidence, notes, is_homemade, cooking_level,
    photo_path, location_name, meal_datetime, search_text, tags
) VALUES (
    '12345678-1234-5678-9abc-123456789abc',
    '手作り親子丼', '夕食', '和食',
    0.75, '久しぶりに作った。思ったより美味しくできた。', 1, 'daily',
    '/images/meal_001.jpg', '自宅', '2025-09-11 19:30:00',
    '親子丼 和食 自宅 手作り 久しぶり 美味しい',
    '和食,自炊,親子丼'
);

-- 外食記録の例
INSERT INTO meals (
    uuid, meal_name, meal_type, cuisine_type,
    ai_confidence, notes, is_homemade, cooking_level,
    photo_path, location_name, latitude, longitude,
    meal_datetime, search_text, tags
) VALUES (
    '87654321-4321-8765-cba9-876543210abc',
    'ラーメン（醤油）', '夕食', '和食',
    0.85, '行きつけの店。安定の美味しさ。', 0, null,
    '/images/meal_002.jpg', '○○ラーメン店', 35.6762, 139.6503,
    '2025-09-11 20:15:00',
    'ラーメン 醤油 和食 ○○ラーメン店 行きつけ 安定',
    'ラーメン,外食,行きつけ'
);

-- 材料データ
INSERT INTO ingredients (meal_id, name, category, confidence, ingredient_type) VALUES
(1, '鶏肉', 'メイン', 0.90, 'fresh'),
(1, '玉子', 'メイン', 0.85, 'fresh'),
(1, '玉ねぎ', 'サイド', 0.80, 'fresh'),
(1, '醤油', '調味料', 0.70, 'seasoning');

-- 自炊パターンデータ
INSERT INTO cooking_patterns (
    meal_id, recipe_complexity, cooking_time_minutes, skill_level,
    ingredient_count, fresh_ingredient_ratio, day_of_week, time_of_day
) VALUES (
    1, 2, 20, 'intermediate', 4, 0.75, 3, 'evening'
);
```

### よく使われるクエリパターン

#### 1. 期間別検索・統計
```sql
-- 今月の自炊回数と外食回数
SELECT 
    is_homemade,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM meals WHERE meal_datetime >= date('now', 'start of month') AND is_deleted = 0), 1) as percentage
FROM meals 
WHERE meal_datetime >= date('now', 'start of month')
  AND is_deleted = 0
GROUP BY is_homemade;

-- 過去3ヶ月の自炊レベル分析
SELECT 
    cooking_level,
    COUNT(*) as count,
    AVG(cp.recipe_complexity) as avg_complexity,
    AVG(cp.cooking_time_minutes) as avg_time
FROM meals m
LEFT JOIN cooking_patterns cp ON m.id = cp.meal_id
WHERE m.meal_datetime >= date('now', '-3 months')
  AND m.is_homemade = 1
  AND m.is_deleted = 0
GROUP BY cooking_level 
ORDER BY count DESC;
```

#### 2. 行動パターン発見
```sql
-- 曜日別の外食・自炊傾向
SELECT 
    CASE strftime('%w', meal_datetime)
        WHEN '0' THEN '日'
        WHEN '1' THEN '月' 
        WHEN '2' THEN '火'
        WHEN '3' THEN '水'
        WHEN '4' THEN '木'
        WHEN '5' THEN '金'
        WHEN '6' THEN '土'
    END as day_of_week,
    COUNT(*) as total,
    SUM(CASE WHEN is_homemade = 1 THEN 1 ELSE 0 END) as homemade_count,
    SUM(CASE WHEN is_homemade = 0 THEN 1 ELSE 0 END) as eating_out_count,
    ROUND(SUM(CASE WHEN is_homemade = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as homemade_rate
FROM meals 
WHERE meal_datetime >= date('now', '-3 months')
  AND is_deleted = 0
GROUP BY strftime('%w', meal_datetime)
ORDER BY strftime('%w', meal_datetime);

-- 忘れかけてるメニュー発見
SELECT 
    meal_name,
    MAX(meal_datetime) as last_cooked,
    COUNT(*) as total_times,
    julianday('now') - julianday(MAX(meal_datetime)) as days_since
FROM meals
WHERE is_homemade = 1 
  AND is_deleted = 0
GROUP BY meal_name
HAVING total_times >= 2
  AND days_since > 60
ORDER BY total_times DESC, days_since DESC;
```

#### 3. インサイト生成用クエリ
```sql
-- ルーティン発見（特定の曜日に特定の料理）
SELECT 
    strftime('%w', meal_datetime) as day_of_week,
    cuisine_type,
    COUNT(*) as frequency,
    COUNT(DISTINCT date(meal_datetime)) as unique_days,
    ROUND(COUNT(*) * 100.0 / COUNT(DISTINCT date(meal_datetime)), 1) as consistency_rate
FROM meals
WHERE meal_datetime >= date('now', '-8 weeks')
  AND is_deleted = 0
GROUP BY strftime('%w', meal_datetime), cuisine_type
HAVING frequency >= 4 AND consistency_rate >= 50
ORDER BY consistency_rate DESC;

-- 最近の変化検出（3ヶ月前 vs 最近1ヶ月）
WITH recent_period AS (
    SELECT cuisine_type, COUNT(*) as recent_count
    FROM meals 
    WHERE meal_datetime >= date('now', '-1 month')
      AND is_deleted = 0
    GROUP BY cuisine_type
),
past_period AS (
    SELECT cuisine_type, COUNT(*) as past_count
    FROM meals 
    WHERE meal_datetime >= date('now', '-4 months')
      AND meal_datetime < date('now', '-3 months')
      AND is_deleted = 0
    GROUP BY cuisine_type
)
SELECT 
    COALESCE(r.cuisine_type, p.cuisine_type) as cuisine_type,
    COALESCE(r.recent_count, 0) as recent_count,
    COALESCE(p.past_count, 0) as past_count,
    CASE 
        WHEN p.past_count = 0 THEN 'NEW'
        WHEN r.recent_count = 0 THEN 'STOPPED'
        ELSE ROUND((r.recent_count - p.past_count) * 100.0 / p.past_count, 1)
    END as change_rate
FROM recent_period r
FULL OUTER JOIN past_period p ON r.cuisine_type = p.cuisine_type
ORDER BY change_rate DESC;
```

#### 4. 検索機能
```sql
-- 全文検索（メモ内容も含む）
SELECT m.*, 
       snippet(meals_fts, 1, '<mark>', '</mark>', '...', 32) as snippet
FROM meals m
JOIN meals_fts fts ON m.id = fts.rowid
WHERE meals_fts MATCH '美味しい AND ラーメン'
  AND m.is_deleted = 0
ORDER BY fts.rank
LIMIT 20;

-- 複合条件検索
SELECT m.*, l.visit_count
FROM meals m
LEFT JOIN locations l ON m.location_name = l.name
WHERE m.meal_datetime BETWEEN ? AND ?
  AND m.cuisine_type IN ('和食', '中華')
  AND (m.is_homemade = 1 OR l.visit_count > 3)
  AND m.is_deleted = 0
ORDER BY m.meal_datetime DESC;
```

---

## データ管理戦略

### バックアップ・同期

#### JSON エクスポート形式
```json
{
  "version": "1.2.0",
  "exported_at": "2025-09-11T10:00:00Z",
  "user_preferences": {
    "cooking_level_thresholds": {
      "quick": 15,
      "daily": 45,
      "gourmet": 90
    }
  },
  "meals": [
    {
      "uuid": "12345678-1234-5678-9abc-123456789abc",
      "meal_name": "手作り親子丼",
      "meal_type": "夕食",
      "cuisine_type": "和食",
      "notes": "久しぶりに作った。思ったより美味しくできた。",
      "is_homemade": true,
      "cooking_level": "daily",
      "meal_datetime": "2025-09-11T19:30:00Z",
      "location": {
        "name": "自宅",
        "latitude": null,
        "longitude": null
      },
      "ingredients": [
        {"name": "鶏肉", "category": "メイン", "ingredient_type": "fresh"},
        {"name": "玉子", "category": "メイン", "ingredient_type": "fresh"}
      ],
      "images": [
        {
          "original_path": "/images/meal_001.jpg",
          "thumbnail_path": "/images/thumb_001.jpg"
        }
      ],
      "ai_analysis": {
        "confidence": 0.75,
        "source": "local",
        "raw_result": "..."
      },
      "cooking_pattern": {
        "recipe_complexity": 2,
        "cooking_time_minutes": 20,
        "skill_level": "intermediate"
      }
    }
  ],
  "behavior_insights": [
    {
      "insight_type": "routine",
      "title": "火曜日は中華の日",
      "description": "過去8週間中6回が中華料理",
      "confidence": 0.85,
      "analysis_period": {
        "start": "2025-07-16",
        "end": "2025-09-10"
      }
    }
  ]
}
```

### データ最適化・メンテナンス

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

-- 古いインサイトの削除（表示済み&低関連度）
DELETE FROM behavior_insights 
WHERE shown_to_user = 1 
  AND discovered_at < datetime('now', '-3 months')
  AND (business_relevance + health_relevance + lifestyle_relevance) < 1.5;

-- インデックス再構築
REINDEX;

-- データベース最適化
VACUUM;
```

#### 自動データ整理
```sql
-- 重複検出・マージ候補
SELECT 
    meal_name, location_name, date(meal_datetime),
    COUNT(*) as duplicate_count,
    GROUP_CONCAT(id) as meal_ids
FROM meals
WHERE is_deleted = 0
GROUP BY meal_name, location_name, date(meal_datetime)
HAVING COUNT(*) > 1;

-- 品質スコアの低い画像特定
SELECT m.id, m.meal_name, mi.quality_score, mi.file_size
FROM meals m
JOIN meal_images mi ON m.id = mi.meal_id
WHERE mi.quality_score < 0.3 
   OR (mi.file_size > 5000000 AND mi.quality_score < 0.7)
ORDER BY mi.quality_score ASC;
```

---

## 技術実装メモ

### Watermelon DB設定

```javascript
// schema.js
import { appSchema, tableSchema } from '@nozbe/watermelondb'

export default appSchema({
  version: 2,
  tables: [
    tableSchema({
      name: 'meals',
      columns: [
        { name: 'uuid', type: 'string', isIndexed: true },
        { name: 'meal_name', type: 'string' },
        { name: 'meal_type', type: 'string' },
        { name: 'cuisine_type', type: 'string' },
        { name: 'ai_confidence', type: 'number' },
        { name: 'ai_source', type: 'string' },
        { name: 'notes', type: 'string' },
        { name: 'cooking_level', type: 'string' },
        { name: 'is_homemade', type: 'boolean' },
        { name: 'photo_path', type: 'string' },
        { name: 'photo_thumbnail_path', type: 'string' },
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