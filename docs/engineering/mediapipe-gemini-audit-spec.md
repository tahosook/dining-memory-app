# MediaPipe Gemini 監査仕様書 (ローカル監査設計・評価基準・送信前チェックリスト)

## Meta
- Purpose: 70枚のブラインド抽出画像に対するGemini外部監査のプロンプト仕様、出力スキーマ、ローカル照合評価仕様、および送信前チェックリストを定義する。
- Audience: MediaPipeラベル監査の設計者、実装者、レビュアー。
- Scope: 仕様策定とローカル検証のみ。外部APIへの通信・送信は含まない。
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/engineering/food-labeling-guidelines.md](food-labeling-guidelines.md), [docs/engineering/mediapipe-labeling-workflow.md](mediapipe-labeling-workflow.md), [scripts/food_label_taxonomy.py](../../scripts/food_label_taxonomy.py)

---

## 1. 監査の背景と目的

### 1.1 背景
MediaPipe static-image food classifier 向けの学習データ候補（`pseudo_label_candidate`）として抽出された画像群について、既存の自動付与ラベル（Ollama等のローカルVLMによる分類）に系統的なバイアスや誤分類がないかを検証するため、独立した外部モデル（Gemini）によるセカンドオピニオン監査を実施する。

### 1.2 完全ブラインド監査の原則
監査モデルに元の付与ラベルや確信度、元ファイル名、撮影日時を渡すと、モデルが既存ラベルに引っ張られる「確認バイアス (Confirmation Bias)」が発生する。これを物理的に防ぐため、以下の**二段階分離**を徹底する：
1. **モデル提示データ（送信データ）**: メタデータを完全除去した画像ファイル（`blind_001.jpg` 〜 `blind_070.jpg`）と、匿名識別子（`blind_001` 〜 `blind_070`）のみ。
2. **内部照合マッピング（ローカル非公開データ）**: 元ラベル・元ファイル名・元画像ハッシュと `blind_id` の対応表（`blind_id_mapping.private.json`）はローカル環境にのみ保存し、モデルには一切提供しない。

---

## 2. 7クラスの定義・境界・判定ルール

本監査の対象となる7クラスは、MediaPipe static-image classifier の一次分類クラスセットのうち、頻度の高い主菜系7クラスである。

### 2.1 クラス定義と境界

| クラス名 (`target_class`) | 日本語定義 | 代表例 | 境界・優先ルール（重要） |
| :--- | :--- | :--- | :--- |
| `curry_rice` | カレーライス | ポークカレー、チキンカレー、ドライカレー、カツカレー | ご飯とカレーソースが主体の料理。※カツカレーなど揚げ物が乗っていても主料理がカレーライスであれば `curry_rice` を優先。※カレースープやカレーうどんは対象外 (`unknown`)。 |
| `drink` | ドリンク（飲料単体） | コーヒー、お茶、ビール、カクテル、ジュース、ワイン | グラス・カップに入った飲料が画面の主たる被写体である場合。※食事の脇にあるグラスは対象外（食事が主）。 |
| `fish_dish` | 魚介料理（揚げ物以外） | 焼き魚、煮魚、刺身、カルパッチョ、魚介のグリル | 魚介類が主体の料理。**注意: 魚フライやエビフライなど「揚げた魚介」は `fried_dish` に分類する**。 |
| `fried_dish` | 揚げ物料理（素材不問） | から揚げ、とんかつ、コロッケ、魚フライ、天ぷら、揚げ餃子 | **調理法が「揚げ物」である料理は、肉・魚・野菜を問わず `fried_dish` を最優先する**。 |
| `meat_dish` | 肉料理（揚げ物・煮込み・炒め物以外） | ステーキ、焼肉、ハンバーグ、ローストビーフ、焼き鳥 | 焼く・グリルする調理法による肉料理。**注意: 肉の揚げ物は `fried_dish`、肉じゃがや角煮は `simmered_dish`、肉野菜炒めは `stir_fry` に分類する**。 |
| `simmered_dish` | 煮物・煮込み料理 | 肉じゃが、筑前煮、豚の角煮、おでん、シチュー、もつ煮 | 煮汁・スープで煮込んだ日本の煮物・シチュー。スープ単体ではなく具材が主体の料理。 |
| `stir_fry` | 炒め物料理 | 野菜炒め、肉野菜炒め、麻婆豆腐、回鍋肉、レバニラ | フライパンや中華鍋で炒めた料理。※チャーハンや焼きそばは `unknown`。 |

### 2.2 7クラス対象外・例外の扱い (`unknown`)

モデルに対して無理に7クラスのいずれかに割り当てさせず、以下のケースでは **`unknown`** を選択することを明示的に許可・要求する：

1. **7クラスに含まれない料理カテゴリ**:
   - 麺類（ラーメン、うどん、そば、パスタ、焼きそば）
   - ご飯もの単体（白飯、チャーハン、丼もの、寿司、おにぎり）
   - パン類、ピザ、サンドイッチ
   - サラダ単体、スープ・味噌汁単体
   - デザート、スイーツ、フルーツ、お菓子
2. **複数料理・定食で主菜が一意に定まらない場合**:
   - 定食や複数皿の食卓で、例えば「焼き魚」と「から揚げ」が同等に写っており、どちらが主たる料理か判定できない場合 (`reason_code: multiple_dishes_unresolvable`)。
3. **画像品質の不良・不鮮明**:
   - 極端なピンボケ、手ブレ、暗所、過度なアップで食材が判別不能 (`reason_code: poor_image_quality`)。
4. **食品以外の被写体**:
   - メニュー表、レシート、看板、食品パッケージ・外装、人物・風景が主 (`reason_code: non_food_or_menu`)。

---

## 3. 監査プロンプト仕様

### 3.1 設計方針
- 英語または明確な日本語で指示を与える。LLMがブレずに構造化JSONのみを出力できるよう、System Instruction および JSON Mode（または Structured Outputs）を前提とする。
- **既存の予測値、ファイル名、撮影日時、確信度を絶対にプロンプトに埋め込まない**。
- 長文の推論や説明文はトークンコストとブレの原因になるため排除し、コード化された理由（`reason_code`）のみを要求する。

### 3.2 システムプロンプト案 (System Instruction)

```text
You are an expert food classification auditor. Your task is to inspect an unlabeled dining image and classify the primary dish into exactly ONE of the allowed 7 coarse classes, or mark it as "unknown" if it does not fit.

Allowed Classes:
- curry_rice: Curry rice (curry sauce served with rice, including katsu-curry).
- drink: Beverages served alone (coffee, tea, beer, wine, cocktail, soft drink).
- fish_dish: Seafood dishes EXCEPT fried items (grilled fish, sashimi, simmered fish, carpaccio).
- fried_dish: ANY deep-fried or pan-fried battered/breaded items (fried chicken/karaage, tonkatsu, croquette, fried fish, tempura, fried gyoza). Fried cooking method takes absolute precedence over meat or fish.
- meat_dish: Meat dishes EXCEPT fried, simmered, or stir-fried items (steak, yakiniku, hamburger patty, roast beef, yakitori).
- simmered_dish: Japanese simmered dishes and stews (nikujaga, chikuzenni, kakuni, oden, stew).
- stir_fry: Pan-stirred/sauteed dishes (vegetable stir-fry, meat-vegetable stir-fry, mapo tofu).
- unknown: Use this if the dish does NOT belong to the above 7 classes (e.g., noodles, pasta, pizza, sushi, plain rice, fried rice, bread, dessert, salad alone), if multiple main dishes conflict without clear dominance, or if the image is unidentifiable/non-food.

Rules:
1. Always prioritize cooking method: Fried food is ALWAYS "fried_dish" regardless of ingredients.
2. If the meal is a set meal with multiple dishes, identify the SINGLE most dominant main dish. If impossible to determine, select "unknown".
3. Return ONLY a valid JSON object matching the requested schema. No markdown formatting outside the JSON, no free-form explanation text.
```

### 3.3 ユーザープロンプト案 (User Prompt Template)

各画像のリクエスト時に渡すプロンプト。`{blind_id}` のみをパラメータとして展開する。

```text
Inspect the attached image for sample ID "{blind_id}".
Classify the primary dish into one of: ["curry_rice", "drink", "fish_dish", "fried_dish", "meat_dish", "simmered_dish", "stir_fry", "unknown"].

Respond with a JSON object strictly adhering to this schema:
{
  "blind_id": "{blind_id}",
  "predicted_class": "<class_name>",
  "is_uncertain": <true|false>,
  "reason_code": "<reason_code>"
}
```

---

## 4. 出力 JSON スキーマ

Geminiからのレスポンスは以下のJSONスキーマに厳格に準拠させる。

### 4.1 JSON Schema 定義 (Draft 2020-12)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "GeminiFoodAuditPrediction",
  "type": "object",
  "required": ["blind_id", "predicted_class", "is_uncertain", "reason_code"],
  "additionalProperties": false,
  "properties": {
    "blind_id": {
      "type": "string",
      "pattern": "^(blind|blind_A|sampleA)_[0-9]{3}$",
      "description": "The unique blind sample identifier (e.g. blind_001 for Pilot 70, blind_A_001 / sampleA_001 for Sample A)."
    },
    "predicted_class": {
      "type": "string",
      "enum": [
        "curry_rice",
        "drink",
        "fish_dish",
        "fried_dish",
        "meat_dish",
        "simmered_dish",
        "stir_fry",
        "unknown"
      ],
      "description": "Audited coarse food class, or unknown if outside scope."
    },
    "is_uncertain": {
      "type": "boolean",
      "description": "True if the model is uncertain about the classification or boundaries. False if confident in the decision (including confident exclusion)."
    },
    "reason_code": {
      "type": "string",
      "enum": [
        "clear_single_dish",
        "multiple_dishes_dominant_chosen",
        "multiple_dishes_unresolvable",
        "not_in_class_set",
        "poor_image_quality",
        "non_food_or_menu",
        "ambiguous_cooking_method"
      ],
      "description": "Standardized reason code justifying the prediction."
    }
  }
}
```

#### 4.1.1 `blind_id` 命名規則とバッチ識別子

複数バッチや段階的監査におけるID衝突（Collision）を物理的に防ぎ、データ追跡性を担保するため、以下のプレフィックス命名を正式にサポートする：
- **パイロット70枚 (Pilot 70)**: `blind_001` 〜 `blind_070` (`^blind_[0-9]{3}$`)
- **追加監査サンプルA (Sample A: 280枚)**: 配布パッケージおよび予測識別子 `blind_A_001` 〜 `blind_A_280` (`^blind_A_[0-9]{3}$`)、および抽出時中間ID `sampleA_001` 〜 `sampleA_280` (`^sampleA_[0-9]{3}$`)

### 4.2 各 `reason_code` の意味と `is_uncertain` の定義

- **`is_uncertain` の定義**:
  モデルがその分類判断、クラス境界、または主菜選定に対して「迷い・不確実性がある」と判断したかを示すブール値フラグ。
  - `false`: 単一料理の同定、あるいは対象外（麺類やピザ等）であることの判定に明確な確信がある。
  - `true`: 調理法（揚げか焼きか等）の判定、主菜の同定、または画質劣化等により、確信度が低い。

### 4.3 フィールド組み合わせ整合性マトリクス (Consistency Rules)

無効な回答や自己矛盾した推論を機械的に排除するため、以下の組み合わせルールを厳格に適用する：

| `predicted_class` | 許可される `reason_code` | `is_uncertain` の許容値 | 判定理由・整合性ルール |
| :--- | :--- | :---: | :--- |
| **7クラスのいずれか** | `clear_single_dish` | **`false` のみ** | 単一料理が明確に同定されているため、不確実であってはならない。 |
| **7クラスのいずれか** | `multiple_dishes_dominant_chosen` | `true` または `false` | 複数料理の中で主菜を選定。主菜決定に迷いがあれば `true`、明確なら `false`。 |
| **7クラスのいずれか** | `ambiguous_cooking_method` | **`true` のみ** | 調理法の特定に迷いがあるため、必ず `is_uncertain: true` でなければならない。 |
| **7クラスのいずれか** | `multiple_dishes_unresolvable`, `not_in_class_set`, `poor_image_quality`, `non_food_or_menu` | **拒否 (矛盾)** | 主菜未解決・対象外・低品質・非食品であるにもかかわらず、7クラスの料理に割り当てることは自己矛盾。 |
| **`unknown`** | `not_in_class_set` | `true` または `false` | 7クラス対象外（麺類、寿司等）。明確に対象外なら `false`、境界判断に迷うなら `true`。 |
| **`unknown`** | `multiple_dishes_unresolvable` | **`true` のみ** | 複数料理の主菜が定まらないため、本質的に不確実。 |
| **`unknown`** | `poor_image_quality` | **`true` のみ** | 画質不良による判別不能のため、本質的に不確実。 |
| **`unknown`** | `non_food_or_menu` | `true` または `false` | メニュー表や非食品。明らかな非食品なら `false`、食品か迷う場合は `true`。 |
| **`unknown`** | `ambiguous_cooking_method` | **`true` のみ** | 調理法が不明瞭すぎて7クラスのいずれにも決められなかったため `true`。 |
| **`unknown`** | `clear_single_dish`, `multiple_dishes_dominant_chosen` | **拒否 (矛盾)** | 単一料理が明確、または主菜が選定できているにもかかわらず `unknown` にすることは自己矛盾。 |

---

## 5. ローカル照合・評価仕様

Geminiの出力結果（`audit_predictions.jsonl`）が得られた後、ローカル環境で `blind_id_mapping.private.json` と突合して評価を行う。

### 5.1 前提と用語の厳格な定義
- **正解ラベルではなく「既存ラベル」との照合**:
  照合対象の元ラベル（`mapped_class`）は、先行の自動ラベリング工程で付与された「暫定ラベル」であり、確定したグラウンドトゥルースではない。
  したがって、本監査における比較は「正解率 (Accuracy)」ではなく、**「モデル間一致率 (Inter-model Agreement Rate)」** と呼称する。
- **不一致・unknown の位置づけ**:
  不一致や `unknown` は「既存ラベルの誤りの確定」を意味するのではなく、**「人手による優先レビューが必要な候補（Priority Human Review Candidates）」** として扱う。

### 5.2 評価指標の数式定義

全サンプル数を $N = 70$（各クラス $c \in C_{\text{target}}$ あたり $n_c = 10$）とする。

1. **全体一致率 (Overall Agreement Rate)**:
   $$\text{Agreement Rate} = \frac{1}{N} \sum_{i=1}^{N} \mathbb{I}\Big(\text{predicted\_class}_i == \text{mapped\_class}_i\Big)$$
   - 分子: Geminiの予測クラスが、内部マッピングの `mapped_class` と一致した件数。
   - 分母: 全抽出サンプル数（70件）。
   - ※ `unknown` と予測されたサンプルは、元ラベルが7クラスのいずれかであるため、自動的に「不一致」としてカウントされる。

2. **クラス別一致率 (Class-level Agreement Rate / Class Recall)**:
   各クラス $c$ について：
   $$\text{Agreement Rate}_c = \frac{1}{n_c} \sum_{i \in S_c} \mathbb{I}\Big(\text{predicted\_class}_i == c\Big)$$
   - 分子: 元ラベルがクラス $c$ であるサンプルのうち、Geminiもクラス $c$ と予測した件数。
   - 分母: クラス $c$ のサンプル数（$n_c = 10$）。

3. **混同行列 (Confusion Matrix: 7行 $\times$ 8列)**:
   - 行 (Row): 元ラベル（7クラス: `curry_rice`, `drink`, `fish_dish`, `fried_dish`, `meat_dish`, `simmered_dish`, `stir_fry`）。
   - 列 (Column): Gemini予測クラス（8クラス: 7クラス + `unknown`）。
   - `unknown` への流出（どのクラスが最も `unknown` と判定されやすいか）を独立列として集計する。

4. **不明回答率 (Unknown Rate)**:
   $$\text{Unknown Rate} = \frac{1}{N} \sum_{i=1}^{N} \mathbb{I}\Big(\text{predicted\_class}_i == \text{"unknown"}\Big)$$
   - 分子: Geminiが `unknown` と回答した総件数。
   - 分母: 全サンプル数（70件）。

5. **不確実回答率 (Uncertainty Rate)**:
   $$\text{Uncertainty Rate} = \frac{1}{N} \sum_{i=1}^{N} \mathbb{I}\Big(\text{is\_uncertain}_i == \text{true}\Big)$$
   - 分子: Geminiが `is_uncertain: true` と報告した総件数。
   - 分母: 全サンプル数（70件）。

### 5.3 層化抽出の留意点（母集団への外挿制限）

- **均等抽出（Balanced Stratified Sample）の性質**:
  本サンプル（70件）は、7クラスそれぞれから均等に10件ずつ抽出したデータである。
- **母集団831件のクラス偏り**:
  元の候補母集団（831件）における各クラスの件数は均等ではなく、以下の通り差異がある：
  - `curry_rice`: 120件, `stir_fry`: 120件, `fried_dish`: 119件, 他4クラス: 各118件。
- **外挿の禁止**:
  70件の単純平均一致率を「母集団831件全体の推定一致率」として直接扱ってはならない。母集団全体の一致率を推定する場合は、各クラスの母集団サイズ $N_c$ に基づく加重平均（Weighted Agreement Rate: $\sum (N_c \times \text{Agreement Rate}_c) / \sum N_c$）を算出しなければならない。

---

## 6. 送信前チェックの状態管理 (Pre-flight Checklist)

チェック項目は以下の4つの状態で厳格に管理する：
- `[SPEC_DEFINED]`: 仕様および基準が文書として定義済み。
- `[AUTO_VERIFIED]`: 自動スクリプトやテストコードにより機械的に検証済み。
- `[HUMAN_VERIFIED]`: 人間による目視または契約確認が完了済み。
- `[UNVERIFIED]`: 未確認または未実施（外部送信をブロックするゲート）。

| カテゴリ | チェック項目 | 現在の状態 | 詳細条件・検証内容 |
| :--- | :--- | :---: | :--- |
| **プライバシー** | JPEGメタデータの完全除去 | **`[AUTO_VERIFIED]`** | `blind_images` の全70画像に対し、Exif (`APP1`) だけでなく、`APP1`〜`APP15` および `COM` マーカーの完全非存在をバイナリスキャンで確認済み。 |
| **プライバシー** | 画像内個人情報の不存在 | **`[UNVERIFIED]`** | 画像内の人物の顔、名札、クレジットカード、住所・レシート等の個人特定情報が写っていないことの目視確認（人間による全画像目視確認が完了するまでPASSとしない）。 |
| **整合性** | 送信ファイルとハッシュの一致 | **`[AUTO_VERIFIED]`** | `blind_001.jpg` 〜 `blind_070.jpg` のSHA-256が `provenance_metadata.json` と100%一致することをテストで検証済み。 |
| **ブラインド性** | プロンプトの完全ブラインド性 | **`[AUTO_VERIFIED]`** | `blind_request_inputs.jsonl` およびプロンプトテンプレートに、元ラベル、元パス、元ファイル名（`MESHI_...`）、確信度が含まれないことをテストで検証済み。 |
| **API利用条件** | モデル学習利用の禁止 (Zero Data Retention) | **`[UNVERIFIED]`** | Google Cloud Vertex AI または Gemini API 有償枠における「プロンプトおよび画像データの学習利用禁止（Opt-out / No Training）」の利用規約・組織設定の確認（人による確認待ち）。 |
| **API利用条件** | レートリミット安全域の確保 | **`[SPEC_DEFINED]`** | 70リクエストを直列または低並列（例: 2並列、遅延1秒）で処理し、429 Too Many Requests を回避する設計（スクリプト実装時に反映）。 |
| **コスト** | トークン数 & コスト試算 | **`[SPEC_DEFINED]`** | 画像70枚＋プロンプトで合計約 40,000〜90,000 入力トークン（Flashで$0.01未満、Proで$0.10未満）を試算済み（実測請求は未発生）。 |
| **承認ゲート** | ユーザーの明示的実行承認 | **`[UNVERIFIED]`** | 外部送信を実行する直前に、ユーザーから明示的な許可を得ること（未取得）。 |

