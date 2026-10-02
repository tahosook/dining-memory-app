# [Investigation] Expo SQLite prepareAsync 可用性の根拠固定

- **対応 GitHub Issue**: GitHub Issue #231
- **関連 PR**: PR #197, PR #209, PR #221, PR #223
- **ステータス**: 完了 (Closed)
- **対象ソース**: `src/database/services/localDatabase.ts`

## 目的・概要
PR #197（`app_settings` の fallback バッチインサート化）および PR #209（リストア時 meals fallback のバッチインサート化）のクローズ判断根拠である、
「現行 Expo SQLite ランタイムでは `typeof db.prepareAsync === 'function'` は常に `true` であり、フォールバック分岐は死パス（dead path）である」
という事実について、確認対象バージョンと客観的検証根拠をドキュメント化して固定します。

実効性のない死パスに対する投機的最適化やリファクタリングの再発を防止し、今後の SDK アップグレード時の再確認トリガーを定義します。

---

## 調査・固定結果

### 1. 確認対象バージョン
- **Expo SDK**: 57 (`expo: ~57.0.26`)
- **expo-sqlite**: `~57.0.3`
- **React Native**: `0.81.5` / **React**: `19.2.3`

### 2. prepareAsync 常時利用可能の客観的根拠

#### A. 型定義上の保証 (`node_modules/expo-sqlite/build/SQLiteDatabase.d.ts`)
`openDatabaseSync` / `openDatabaseAsync` が返却する `SQLiteDatabase` クラスのインターフェースにおいて、`prepareAsync` はオプショナルではなく必須メソッドとして定義されています。
```typescript
export declare class SQLiteDatabase {
    prepareAsync(source: string): Promise<SQLiteStatement>;
    ...
}
```

#### B. ランタイム実装上の保証 (`node_modules/expo-sqlite/build/SQLiteDatabase.js`)
`SQLiteDatabase` の全コンビニエンスメソッド（`runAsync`, `getFirstAsync`, `getEachAsync`, `getAllAsync`）は、内部実装で `this.prepareAsync(source)` を直接呼び出しています。
```javascript
async runAsync(source, ...params) {
    const statement = await this.prepareAsync(source);
    let result;
    try {
        result = await statement.executeAsync(...params);
    }
    finally {
        await statement.finalizeAsync();
    }
    return result;
}
```
したがって、Expo SQLite を用いてクエリを実行できる環境（本アプリのすべての DB 操作環境）である限り、`prepareAsync` が未定義となることは構造上あり得ません。

#### C. `src/database/services/localDatabase.ts` の `else` 分岐の性質
`replaceDatabaseWithBackup` 内に存在する以下の分岐：
```typescript
if (typeof db.prepareAsync === 'function') {
  const insertMealStatement = await db.prepareAsync(...);
  ...
} else {
  // フォールバックパス
  for (const meal of meals) {
    await db.runAsync(...);
  }
}
```
この `else` 句は、旧世代の SQLite API や特定のモック環境との互換性を考慮した防御的分岐に過ぎず、本番ランタイムで実行されることはありません。
そのため、このフォールバックパスに対する高速化・バッチ化等の最適化は実行実効性がゼロであり、PR #197 および PR #209 をクローズした判断は完全に妥当です。

---

## SDK アップグレード時の再確認トリガー

将来 Expo SDK または `expo-sqlite` のメジャーバージョンアップグレードを実施する際は、以下のワンライナーで `prepareAsync` の存在とシグネチャを検証します：

```bash
node -e 'const { openDatabaseSync } = require("expo-sqlite"); const db = openDatabaseSync(":memory:"); if (typeof db.prepareAsync !== "function") throw new Error("prepareAsync is missing in upgraded expo-sqlite"); console.log("✓ prepareAsync is available");'
```

CI / 型チェックでの静的確認：
```bash
grep -q "prepareAsync(source: string): Promise<SQLiteStatement>" node_modules/expo-sqlite/build/SQLiteDatabase.d.ts && echo "✓ prepareAsync signature verified"
```

上記トリガーにより、万一将来のバージョンで API 破壊的変更（例: prepared statement の非推奨化や同期専用化など）が発生した場合に即座に検知します。

---

## 受け入れ条件（Acceptance Criteria）
- [x] `prepareAsync` が常時利用可能である根拠と対象バージョンが記録されていること。
- [x] 将来の再確認トリガーが明文化されていること。
- [x] プロダクションコードの不要な変更を行わないこと。
