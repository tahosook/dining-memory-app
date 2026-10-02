# [Investigation] mealShare エラーパス統合テストの完全性確認

- **内部ドキュメントID**: issue-15
- **対応 GitHub Issue**: GitHub Issue #230
- **ステータス**: 完了 (Closed)
- **結果**: 既存実装・テストで網羅済みであることを確認（コード変更なし / no-op、完了）
- **関連 PR**: PR #156, PR #196, PR #202, PR #211, PR #226, PR #228

## 概要
Issue #228 で統合された `mealShare` のエラーパスおよびフォールバック検証について、実際の共有フロー（`MealDetailScreen` → `mealShare`）におけるエラー経路が十分にテストされているか確認・照合した記録です。

## 調査・検証結果

### 1. 共有呼び出し経路（MealDetailScreen → mealShare）
- **呼出導線**:
  - `src/screens/RecordsScreen/MealDetailScreen.tsx` の「共有」ボタン押下（`meal-detail-share-button`）で確認モーダル（`shareComposerVisible`）が開く。
  - モーダル内の「共有を開く」ボタン（`share-submit-button`）押下で `submitShare` コールバックが実行され、`shareMealContent({ title, text, photoUri, mimeType: 'image/jpeg' })` が非同期呼出される。

### 2. エラー伝播とフォールバック
- **実装**: `src/media/mealShare.ts`
- **各プラットフォームの挙動**:
  - **iOS**: `Share.share` 失敗時、外側 `catch` でログ出力（サニタイズ済み）し、例外を再スロー (`throw error`)。
  - **Android**:
    1. `NativeModules.MealShare.shareMeal` 失敗時は警告ログを出力し `expo-sharing` へフォールバック。
    2. `expo-sharing` 失敗時は警告ログを出力し標準 `Share.share` へフォールバック。
    3. 全フォールバック失敗時は外側 `catch` でログ出力し例外を再スロー (`throw error`)。
  - **Web / その他**: `Share.share` 失敗時に外側 `catch` でログ出力し例外を再スロー。
  - **写真検査補助 (`inspectSharePhoto`)**: `getInfoAsync` 失敗時は警告ログを出力して安全に握りつぶし（graceful degradation）、共有フロー自体の継続を妨げない。

### 3. MealDetailScreen 側のエラー表示・状態更新
- **実装**: `src/screens/RecordsScreen/MealDetailScreen.tsx` (`submitShare`)
- **挙動**:
  - `shareMealContent` が例外を投げた場合、`catch (error)` で捕捉。
  - `Alert.alert('エラー', '共有シートを開けませんでした。')` によりユーザーへ明示的に通知。
  - `console.error('Failed to open share sheet:', sanitizeLogObject(error))` で機密情報（写真パス等）をマスクしてログ記録。
  - `setShareComposerVisible(false)` がスキップされるため、モーダルは開いたまま維持され、入力中の共有文が保護される。

### 4. テストの網羅性
- **UI統合テスト (`tests/MealDetailScreen.test.tsx`)**:
  - `test('shows an alert when shareMealContent fails')`: 共有失敗時の `Alert.alert` 呼出およびサニタイズログ出力を検証済み。
  - Android ネイティブモジュール、expo-sharing フォールバック、標準 Share フォールバックの各経路を検証済み。
- **モジュール単体テスト (`tests/mealShare.test.ts`)**:
  - 写真検査エラー時の `console.warn` 出力および非クラッシュ挙動（Ref #196, #202）。
  - iOS 共有失敗時のログ記録と再スロー（Ref #211）。
  - Android 各フォールバック（NativeModule 失敗 → expo-sharing、expo-sharing 失敗 → 標準 Share）の警告ログと段階的遷移（Ref #226）。
  - 全フォールバック失敗時のログ記録と再スロー。
- **カバレッジ実績**:
  - `src/media/mealShare.ts`: Stmts 100%, Branch 96.61%, Funcs 100%, Lines 100%

## 受入基準
- [x] MealDetailScreen から共有処理を呼び出す経路が確認されていること。
- [x] MealShare 失敗時のエラー伝播（再スロー）が確認されていること。
- [x] MealDetailScreen 側のエラー表示（Alert）および状態保持が確認されていること。
- [x] 既存テストで上記エラー経路が十分に検証されていること（Stmts 100% / Lines 100%）。
- [x] 追加のコード・テスト変更不要の根拠が明確であること。
