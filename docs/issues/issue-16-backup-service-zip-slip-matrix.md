# [Verification] BackupService Zip Slip 拒否ケースのテスト行列確認

- **内部ドキュメントID**: issue-16
- **対応 GitHub Issue**: GitHub Issue #232
- **ステータス**: 完了 (Closed)
- **結果**: 拒否ケースのテスト網羅性不足を確認し、境界・異常ケースのテスト行列を補完（最小差分のテスト追加で完了）
- **関連 PR**: PR #194

## 概要
PR #194 で実装された Zip Slip 防御（絶対パス拒否対応）に基づき、現在の `BackupService` の防御実装および `tests/BackupService.test.ts` を確認し、拒否ケースのテスト網羅性に不足があるかを判断・補完した記録です。

## 調査・検証結果

### 1. 現在の Zip Slip 防御実装 (`src/database/services/BackupService.ts`)
`BackupService.pickAndValidateBackup` では、ネイティブ展開（`unzip`）の実行前に `react-native-zip-archive` の `listContents` を用いた事前検証（Pre-flight Verification）による多層防御（Defense in Depth）を実施している：
- **Layer 1 (相対パストラバーサル・ヌルバイト)**:
  `path.includes('../') || path.includes('..\\') || path.includes('\0')` を検知し、`'バックアップファイルに不正なパスが含まれています。'` を返却。
- **Layer 2 (絶対パス / PR #194)**:
  `path.startsWith('/') || path.startsWith('\\')` を検知し、`'バックアップファイルに不正な絶対パスが含まれています。'` を返却。
- **Layer 3 (ファイルパスホワイトリスト)**:
  `manifest.json`, `database/*`, `photos/*` 以外の未許可パスを検知し、`'バックアップファイルに未許可のファイルが含まれています。'` を返却。
- **Layer 4 (展開後バリデーション)**:
  `validatePortableMeals` および `validateSafeFileName` により、写真ファイル名が許可パターン（英数字・ハイフン・アンダースコア・ドット＋拡張子）に適合し `..` やセパレータを含まないことを厳格に検証。

実装自体は堅牢であり、セキュリティ上の不備は見られなかった。

### 2. 既存テストの網羅性分析と不足点
既存の `tests/BackupService.test.ts` を確認した結果、以下の不足が確認された：
1. **`../` を含むエントリ**:
   先頭が `../evil.sh` のテストのみ存在したが、エラーメッセージや `unzip` が呼び出されないことのアサーションが不十分であった。また Windows 形式のトラバーサル（`..\\`）やヌルバイト（`\0`）のテストが欠落していた。
2. **正規化後に保存先ディレクトリ外へ出るパス**:
   ホワイトリスト対象プレフィックス（`photos/`）を偽装したトラバーサル（例: `photos/../../evil.sh`）など、典型的な Zip Slip 攻撃パターンのテストが欠落していた。
3. **絶対パス**:
   Unix 絶対パス（`/etc/passwd`）および Windows 絶対パス（`\\Windows\\evil.exe`）のテストは存在したが、許可プレフィックスを模倣した絶対パス（`/photos/meal.jpg`）やルート単体（`/`）の境界テストが欠落していた。
4. **境界・安全な相対パス**:
   ドットを含む安全な写真ファイル名（`meal.lunch.2026.04.22.jpg`）が誤検知されず受理されること、およびディレクトリ境界エントリ（`photos/../` や `..` 単体）が適切に遮断されることの検証が不足していた。
5. **展開後の食事データ内のパストラバーサル**:
   `meals.json` 内の `photo_file_name` に `../../evil.jpg` が指定された場合の遮断が明示的に検証されていなかった。

### 3. 追加・補完したテストケース (`tests/BackupService.test.ts`)
最小差分で以下のテスト行列を追加・補完：
- `rejects backup containing malicious path traversal in zip contents` (`../evil.sh` のエラー文言・unzip 未呼出検証)
- `rejects backup containing traversal path that escapes staging directory after normalization` (`photos/../../evil.sh`)
- `rejects backup containing Windows-style path traversal (..\\)` (`photos\\..\\evil.sh`)
- `rejects backup containing null byte injection in entry path` (`photos/meal.jpg\0evil.jpg`)
- `rejects backup containing absolute path mimicking allowed directory prefix` (`/photos/meal-20260422-01.jpg`)
- `rejects backup containing single root slash as entry path` (`/`)
- `rejects backup containing traversal boundary entry (photos/../)` (`photos/../`)
- `rejects backup containing isolated dot-dot entry (..)` (`..`)
- `accepts safe relative photo paths containing dots in filename` (`photos/meal.lunch.2026.04.22.jpg`)
- `rejects backup when meals data contains malicious path traversal in photo_file_name after extraction` (`meals.json` 内トラバーサル検証)

## 受入基準
- [x] PR #194 の実装内容および `BackupService.ts` の Zip Slip 防御が確認されていること。
- [x] 既存テストにおける拒否ケース（`../`, 絶対パス, 境界ケース等）の不足が特定されていること。
- [x] 正規化後に保存先ディレクトリ外へ出るパスを含むテスト行列が `tests/BackupService.test.ts` に補完されていること。
- [x] 全テスト (`npm test`)、型チェック (`npm run type-check`)、lint (`npm run lint`)、および `verify-pr-gates.sh` がパスしていること。
