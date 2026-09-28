### 具体的な問題 (Problem)
BackupService.tsにて、ZIPファイル展開前にlistContentsでエントリをチェックし`../`などの相対パストラバーサルを防ぐ防御機構が既に導入されていますが、`/`や`\`で始まる絶対パスを含む不正なアーカイブ（例: `/data/data/...`）に対するチェックが漏れており、Zip Slip脆弱性のリスクが残存しています。

### 客観的証拠 (Evidence)
BackupService.ts のソースコードを調査した結果、`path.includes('../') || path.includes('..\\') || path.includes('\0')` の相対パストラバーサル検出ロジックは存在するものの、絶対パスを防止する `path.startsWith('/') || path.startsWith('\\')` のロジックが存在しないことが確認されました。これによりUnixベースのシステム（AndroidやiOS）において絶対パスを指定したZip Slip攻撃が可能です。

### 期待される効果 (Expected Impact)
絶対パス（`/` および `\`）で始まるZIPエントリが含まれる場合にステージング抽出を即座に中止するバリデーションが追加され、任意のシステムファイルに対する上書き攻撃（Zip Slip）を完全にブロックできます。

### 意図して変更しなかったこと (Out of Scope)
BackupServiceの機能自体や、他のZIPファイルの扱い（Assetsの解凍など）には変更を加えていません。また、`listContents` 後の `unzip` の呼び出し部分の挙動変更は行っていません。
