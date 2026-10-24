# [Enhancement] 器情報非依存・料理特化型 汎用ダイニング分類モデル (23クラス) の仕様策定とモデル更新

- **内部ドキュメントID**: issue-24
- **対応 GitHub Issue**: 未起票
- **対応 PR**: PR #294 (`feat/issue-24-25-dining-models`)
- **ステータス**: フェーズ1・2・3完了 (Phase 1, 2 & 3 Completed)
- **作成日**: 2026-10-22
- **関連ドキュメント**:
  - 総合概要: [docs/engineering/mediapipe-overview.md](../engineering/mediapipe-overview.md)
  - 先行デュアルモデル構築: [docs/issues/issue-23-dual-dining-classification-models.md](issue-23-dual-dining-classification-models.md)
  - スクリプトカタログ: [scripts/README.md](../../scripts/README.md)
  - データセット構築スクリプト: [scripts/build_dual_taxonomy_dataset.py](../../scripts/build_dual_taxonomy_dataset.py)
  - アプリ推論モデル設定: [src/ai/mealInputAssist/modelConfig.ts](../../src/ai/mealInputAssist/modelConfig.ts)
  - 推論結果正規化: [src/ai/mealInputAssist/mediapipeStaticImageNormalizer.ts](../../src/ai/mealInputAssist/mediapipeStaticImageNormalizer.ts)
  - 評価ベンチマークレポート: [docs/notes/issue-24-25-model-evaluation-report.md](../notes/issue-24-25-model-evaluation-report.md)

---

## 1. Problem (問題の所在)

1. **現行汎用モデル（7クラス）における「料理名の具体性」の不足**:
   - Issue-23 で導入された汎用シーンモデル（`universal_scene_7class`）は、「おうち定食」「ワンプレート・カレー」「外食・トレイ飯」など食事の配膳形式やシーンの大分類にとどまっていた。
   - その結果、アプリの入力補助（`MealInputAssistSection`）において「生姜焼き定食」「ラーメン」「うどん」といった具体的な料理名がサジェストされず、ユーザーがタップして入力欄に反映できる価値が限定的であった。
2. **器や食器情報への依存とノイズ**:
   - モデルやラベルに食器情報（北欧大皿、染付小皿、トレイ等）が混在していると、料理を記録したいユーザーにとって不要なノイズとなり、分類結果の納得感を損ねる。料理記録アプリとしては「器」ではなく純粋な「料理・献立内容」そのものを判別・サジェストするべきである。
3. **料理分類の重複と境界の曖昧さ（焼き鮭・焼き魚・和朝食の競合）**:
   - 「焼き鮭」「焼き魚」「和朝食」が別々に存在すると、「焼き鮭定食と焼き魚定食の違い」や「朝食の焼き鮭との境界」が曖昧になり、推論確信度の分散や誤認識を招く。焼き魚全般を統合し、朝食は納豆や味噌汁といった献立スタイルで明確に分離する必要がある。
4. **細分化レベルの不足（最低20クラスの要件）**:
   - 日常的に食べるメニュー（ラーメン、うどん、そば、パスタ、カレー、丼もの、各種主菜定食）を網羅し、タップ1回で目的の料理名を入力できるようにするためには、最低でも20クラス以上の細かい粒度が求められる。

---

## 2. Design Principles (設計原則)

1. **器・食器情報の完全排除 (No Tableware Dependency)**:
   - クラス定義、判定キーワード、UI出力料理名から、食器（北欧皿、染付、大皿、小皿、トレイ、鍋敷き等）に関する単語や条件を一切排除し、純粋な「料理・食材・献立」のみで分類する。
2. **魚料理の一本化と朝食の再定義**:
   - 焼き鮭・サーモン、サバ、ホッケ、アジ、サンマ、ししゃも等あらゆる焼き魚を **`teishoku_fish`（焼き魚定食）** に一本化する。
   - 和朝食は鮭を冠さず、納豆パック・白ご飯・具だくさん味噌汁のスタイルに着目した **`breakfast_japanese_natto`（納豆・味噌汁の和朝食）** として定義し、昼・夕の焼き魚定食との重複を排除する。
3. **日常メニューの網羅（最低20クラス達成・実測23クラス）**:
   - 1,007枚のオープン視覚観察データ（`observations_all_1007.jsonl`）の実測頻度に基づき、各クラス最低10枚以上の学習サンプルを確保できるバランスの良い23クラス（UI表示対象22クラス＋非食事除外1クラス）を編成する。
4. **排他ルールと決定論的分割**:
   - 1枚の写真に対して優先度順のルールベース判定を行い、重複なく一意のクラスに決定論的に割り当てる。Golden Test Set（回帰防止用）の漏洩防止（`test` スプリットへの完全固定）を維持する。

---

## 3. Taxonomy Specification (23クラス詳細定義表)

### 3.1 クラス一覧とマッピング仕様

| No | クラスID（内部） | UIサジェスト料理名 | 判定ジャンル | 定義・対象料理の具体例 | 1,007枚中の推計件数 |
|---|---|---|---|---|---:|
| 1 | `teishoku_fish` | **焼き魚定食** | 和食 | 焼き鮭、サーモンソテー、ホッケ、アジ開き、サバ塩焼き等の焼き魚全般定食 | 99 (9.8%) |
| 2 | `teishoku_pork_ginger_stirfry` | **生姜焼き・豚肉炒め定食** | 和食 | 豚肉生姜焼き、豚バラ野菜炒め、豚ロースソテー等 | 73 (7.2%) |
| 3 | `teishoku_chicken` | **チキンソテー・鶏肉料理定食** | 和食 | 照り焼きチキン、鶏ももソテー、手羽先・手羽元煮/焼き等 | 42 (4.2%) |
| 4 | `teishoku_fried_meat` | **唐揚げ・フライ定食** | その他 | 鶏の唐揚げ、竜田揚げ、とんかつ、チキンカツ、コロッケ等 | 28 (2.8%) |
| 5 | `teishoku_hamburg` | **ハンバーグ定食** | 洋食 | 自家製ハンバーグ、デミグラス/おろしハンバーグ、煮込みハンバーグ | 14 (1.4%) |
| 6 | `teishoku_simmered_stew` | **肉じゃが・煮物定食** | 和食 | 肉じゃが、かぼちゃの煮物、筑前煮、大根煮物等のおかず定食 | 19 (1.9%) |
| 7 | `teishoku_general_multi_dish` | **一汁三菜・おうち定食** | 和食 | 主菜＋複数副菜小鉢＋汁物のバランス和定食全般 | 85 (8.4%) |
| 8 | `breakfast_japanese_natto` | **納豆・味噌汁の和朝食** | 和食 | 納豆パック、白ご飯、具だくさん味噌汁、卵等の和朝ごはん | 61 (6.1%) |
| 9 | `breakfast_western_toast` | **トースト＆目玉焼き朝食** | 洋食 | 食パン・トースト、目玉焼き、ウインナー、サラダ等のパン朝食 | 21 (2.1%) |
| 10 | `noodles_ramen` | **ラーメン・中華麺** | 中華 | ラーメン、まぜそば、つけ麺、中華そば | 36 (3.6%) |
| 11 | `noodles_udon` | **うどん** | 和食 | 煮込みうどん、かけうどん、ざるうどん、鍋焼きうどん | 24 (2.4%) |
| 12 | `noodles_soba` | **そば** | 和食 | ざるそば、温かいそば、天ぷらそば | 19 (1.9%) |
| 13 | `pasta_dishes` | **パスタ・スパゲッティ** | 洋食 | トマトパスタ、ミートソース、ボロネーゼ、オイルパスタ等 | 11 (1.1%) |
| 14 | `curry_keema` | **特製キーマカレー** | 洋食 | ひき肉キーマカレー（ゆで卵のせ） | 46 (4.6%) |
| 15 | `curry_hayashi_ethnic` | **カレー・ハヤシライス** | 洋食 | 欧風カレー、ハヤシライス、ガパオライス、タイカレー等 | 90 (8.9%) |
| 16 | `donburi_omurice` | **丼もの・オムライス** | その他 | 親子丼、かつ丼、牛丼、豚丼、天丼、海鮮丼、オムライス | 15 (1.5%) |
| 17 | `fried_rice_pilaf` | **チャーハン・炊き込みご飯** | 中華 | チャーハン、炒飯、ピラフ、五目炊き込みご飯 | 28 (2.8%) |
| 18 | `pot_stew_nabe` | **鍋料理・すき焼き** | 和食 | 寄せ鍋、水炊き、すき焼き、おでん、土鍋煮込み | 27 (2.7%) |
| 19 | `izakaya_appetizers` | **おうち居酒屋・おつまみ小鉢** | 和食 | 焼き鳥、冷奴、枝豆、小鉢晩酌膳、刺身おつまみ | 39 (3.9%) |
| 20 | `bal_ajillo_pizza` | **おうちバル・アヒージョ** | 洋食 | アヒージョ、バゲット、ピザ、チーズ、温野菜バル料理 | 41 (4.1%) |
| 21 | `chuka_gyoza_mapo` | **餃子・麻婆豆腐** | 中華 | 焼き餃子、点心、麻婆豆腐、春巻き、エビチリ等の中華主菜 | 28 (2.8%) |
| 22 | `alcohol_drink_record` | **お酒・ドリンク** | その他 | 日本酒、地酒、ワイン、ビール等のボトル接写記録 | 139 (13.8%) |
| 23 | `non_food_exclude` | - | - | 食事以外の写真（メガネ、日用品、風景等）※UI候補から自動除外 | 22 (2.2%) |

---

## 4. Acceptance Criteria (受入基準)

### フェーズ 1: データセット構築スクリプトの実装と検証
- [x] `scripts/build_dual_taxonomy_dataset.py` を拡張または専用ビルダー（例: `scripts/build_universal_23class_dataset.py`）を作成し、1,007枚の観察データから上記23クラスを決定論的に抽出できること。
- [x] 全23クラスについて、各クラス最低10枚以上の実画像が割り当てられること。
- [x] Golden Test Set（回帰防止用）に含まれる画像が `train` / `val` に漏洩せず、厳格に `test` に固定されること。
- [x] Golden Test Set ディレクトリの不在・読取失敗時に処理を fail-closed で即時中断し、意図的バイパスのみ明示オプションで許可すること。
- [x] 抽出処理のユニットテストを作成・パスすること。

### フェーズ 2: MediaPipe モデル学習と精度評価
- [x] `scripts/train-mediapipe-model.py` を用いて、MobileNetV2 バックボーンで 23クラス分類モデル（`.task`）を学習すること（`universal_dining_23class.task` 8,984,478 bytes）。
- [x] 少数クラスの均等化（Data Augmentation）を train 限定で適用し、学習が安定して収束すること（Train Top-3 74.7%）。
- [x] Held-out `test` / `val` スプリットにおいて精度評価を実施し、v1.0.0 実力値として Overall Top-3 72.1%（Test 64.0%, Val 55.9%）を達成・記録すること（[docs/notes/issue-24-25-model-evaluation-report.md](../notes/issue-24-25-model-evaluation-report.md) 参照）。継続学習で 80% を目指す。
- [x] 推論レイテンシがモバイル要件（< 30ms）を満たすこと（実測 15.7ms @ Apple M4）。

### フェーズ 3: アプリ統合と UI 動作検証
- [x] `src/ai/mealInputAssist/modelConfig.ts` の汎用モデル定義を本23クラスモデルに更新すること（`sha256` 登録、`available: true`）。
- [x] `src/ai/mealInputAssist/mediapipeStaticImageNormalizer.ts` に23クラスの料理名・ジャンルマッピング（`non_food_exclude` の除外抑制含む）を追加すること。
- [x] `scripts/ensure-mediapipe-model.sh` にモデル4を追加し、同梱アセットの整合性・同期を保証すること。
- [x] 既存のユニットテスト（`tests/mealInputAssist*.test.ts`, `tests/StatsSettingsScreens.test.tsx`）を更新・パスすること。
- [x] 設定画面で汎用モデルを選択した状態で、写真から具体的な料理名（「生姜焼き・豚肉炒め定食」「ラーメン・中華麺」等）がサジェストチップとして提示される設定配線を完了すること。
