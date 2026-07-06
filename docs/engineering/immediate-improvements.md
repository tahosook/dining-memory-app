# 即時改善提案

## Meta
- Purpose: この repo に今すぐ入れるべき具体的な改善案を優先度付きで整理する。
- Audience: リポジトリ保守者、実装担当者、レビュー担当者。
- Update trigger: 既存課題の解消、運用フローの変更、新しい高優先度課題の発見時。
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/index.md](../index.md), [docs/engineering/codex-workflow.md](codex-workflow.md), [docs/architecture/tech-spec.md](../architecture/tech-spec.md)

## Summary
この文書は、現時点の repo を見た上で、すぐ着手価値の高い改善案を優先度順にまとめたものです。  
無関係な大規模整理ではなく、運用事故や手戻りを減らす具体策だけを対象にしています。

## High
### `.env` の追跡と `EXPO_PUBLIC_*` の扱いを整理する
- status: done
- 解消済みの問題: 以前は `.env` が git 管理されており、README の環境変数例も実装の `EXPO_PUBLIC_GEMINI_API_KEY` とずれていました。
- 現状: `.env` は git 管理外で、`.gitignore` は `.env` / `.env.local` / `.env*.local` を ignore しています。共有テンプレートは `.env.example` です。
- 残るリスク: 将来の鍵や公開前の値を誤って commit しないよう、ignore とテンプレート運用を維持する必要があります。
- 維持方針: `.env.example` を唯一の共有テンプレートとして維持し、`.env` はローカル専用ファイルとして扱います。
- 関連ファイル: `.env`, `.env.example`, [README.md](../../README.md), [.gitignore](../../.gitignore)
- 導入後の確認方法: `git status --short` で実値の `.env` が不用意に差分化しないこと、README の env 例が実装名と一致することを確認します。

### capture 系ログから機微な photo URI を外す
- status: done
- 解消済みの問題: camera capture 周辺で `photo.uri` や保存処理の詳細を `console.log` 出力していた状態を解消しました。
- 現状: capture / save / AI assist の production-like logs は、photo URI、location coordinates、raw AI output を直接出力しない最小限の失敗文脈に留めています。
- 維持方針: 失敗時も photo path、location、notes、raw provider response をログに追加しない方針を維持します。
- 関連ファイル: [src/hooks/cameraCapture/useCameraCapture.ts](../../src/hooks/cameraCapture/useCameraCapture.ts), [src/hooks/cameraCapture/useCameraPermission.ts](../../src/hooks/cameraCapture/useCameraPermission.ts)
- 導入後の確認方法: `rg -n "console\\.(log|warn|error|info).*?(photoUri|photo\\.uri|location|raw AI|raw output)|(?:photoUri|photo\\.uri|location|raw AI|raw output).*?console\\.(log|warn|error|info)" src` で直接ログが残っていないことを確認します。

### CI とローカル gate の常設運用を定着させる
- status: done
- 問題点: standard gate は文書にある一方、GitHub Actions と pre-commit / pre-push 相当が未整備でした。
- 現状: `.github/workflows/ci.yml` が `main` push / pull request で `npm ci`, `npm run lint`, `npm run type-check`, `npm test -- --runInBand` を実行します。
- リスク: 手元では通っていたつもりの lint/type-check/test 不整合が main に入りやすくなります。
- 推奨修正: GitHub Actions CI を main 向けに常設し、必要なら次段階で `pre-commit` / `pre-push` の軽量フックを追加します。
- 関連ファイル: [docs/engineering/codex-workflow.md](codex-workflow.md), [package.json](../../package.json), [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- 導入後の確認方法: pull request で `npm ci`, `npm run lint`, `npm run type-check`, `npm test -- --runInBand` が自動実行されることを確認します。

## Medium
### Search 詳細表示のタブ切り替えを減らす
- status: done
- 解消済みの問題: Search から詳細を開くと Records 側の shared detail を経由してタブが切り替わる違和感がありました。
- 現状: `MealDetail` は root stack route になり、Search から直接開いて戻ると検索文脈に戻れる構造です。
- 維持方針: Records / Search は同じ detail 画面を使いながら、それぞれの一覧順を previous/next context として渡します。
- 関連ファイル: [src/navigation/RootNavigator.tsx](../../src/navigation/RootNavigator.tsx), [src/screens/RecordsScreen/MealDetailScreen.tsx](../../src/screens/RecordsScreen/MealDetailScreen.tsx), [src/screens/SearchScreen/SearchScreen.tsx](../../src/screens/SearchScreen/SearchScreen.tsx)
- 導入後の確認方法: `npm test -- tests/RecordsScreen.test.tsx tests/SearchScreen.test.tsx tests/MealDetailScreen.test.tsx --runInBand` と実機で戻る操作を確認します。

### image resizer 依存の継続監視
- status: open
- 問題点: 画像縮小には現在 `@bam.tech/react-native-image-resizer` を使っており、Expo 標準機能ではまだ置き換えていません。
- リスク: 将来の Expo / New Architecture 更新時に、native module 側の互換性確認が必要になります。
- 推奨修正: 現状は doctor の targeted exclude を scoped package 名に合わせて維持しつつ、今後は Expo 標準機能で同等処理に寄せられるかを継続確認します。
- 関連ファイル: [package.json](../../package.json), [src/hooks/cameraCapture/useCameraCapture.ts](../../src/hooks/cameraCapture/useCameraCapture.ts)
- 導入後の確認方法: `npx expo-doctor` が他の warning なしで通る状態を維持しつつ、代替候補で同等の画像縮小ができるかを別ブランチで試します。

### 端末実機の smoke test を最低限ルーチン化する
- status: open
- 問題点: 自動テストはあるものの、camera / share sheet / adaptive icon のような実機依存の挙動は回帰を拾いにくいです。
- リスク: Jest が通っても、Android 実機での権限導線や共有 UI、ホーム画面アイコンの見え方が崩れる可能性があります。
- 推奨修正: Android 実機での capture-save-records-detail-share を短い手順にして、PR 単位で確認できるようにします。
- 関連ファイル: [README.md](../../README.md), [docs/ux/user-flows.md](../ux/user-flows.md), [app.json](../../app.json)
- 導入後の確認方法: 実機で「撮影 -> 保存 -> Records 詳細 -> X共有 -> ホーム画面アイコン確認」を 1 回通して結果を記録します。

## Low
### expo-file-system マルチパートアップロードの CRLF インジェクション留意
- status: tracked
- 問題点: `expo-file-system` の `FileSystemUploadTask.swift` と `NetworkingHelpers.swift` において、`fieldName`、`filename`、`parameters` の値が CRLF 文字 (`\r`, `\n`) のエスケープなしでマルチパートボディに直接挿入されています。これは HTTP ヘッダーインジェクションにつながる CRLF インジェクションの可能性があります。
- 現状: 本アプリは `expo-file-system` を使用しているが、現在のコードベースではアップロード機能を使用していません。
- リスク: 将来アップロード機能を追加する際、ユーザー入力をそのままフィールド名やファイル名に使用すると脆弱性が露出する可能性があります。
- 推奨修正: アップロード機能を追加する場合は、フィールド名・パラメータ・ファイル名に対して CRLF 文字のエスケープを行うか、信頼できる固定値のみを使用する。`expo-file-system` のアップデートで修正版がリリースされるまで、ユーザー入力を直接使用しない方針を維持します。
- 関連ファイル: [package.json](../../package.json), [node_modules/expo-file-system/ios/FileSystemUploadTask.swift](../../node_modules/expo-file-system/ios/FileSystemUploadTask.swift)
- 導入後の確認方法: `grep -r "uploadTask\|UploadTask\|upload" src/` でアップロードコードが追加されていないことを確認します。

### アイコン assets の生成手順を repo 内に残す
- status: open
- 問題点: PNG assets だけがあると、後で色味や構図を微調整したいときに再現性が落ちます。
- リスク: asset 差し替えが属人的になり、adaptive icon と通常 icon の整合が崩れやすくなります。
- 推奨修正: stdlib-only script で icon を再生成できる状態を維持し、必要なら簡単な使用手順も README に追記します。
- 関連ファイル: `scripts/generate-icons.py`, [assets/icon.png](../../assets/icon.png), [assets/adaptive-foreground.png](../../assets/adaptive-foreground.png), [assets/adaptive-monochrome.png](../../assets/adaptive-monochrome.png)
