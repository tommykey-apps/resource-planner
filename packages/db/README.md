# @resource-planner/db

DynamoDB に保存する形 (キーの組み立てと項目の形) と、データ移行スクリプト。
web アプリ (`apps/web`) と SES バウンス処理 (`apps/ses-bounce`) が同じキーを使うために共有する。

`$app/...` や `$env/...` を import しない。SvelteKit の外 (esbuild で bundle する Lambda) からも読むため。

データ移行はこのディレクトリで実行する:

```bash
node migrations/migrate-assignment-keys.mjs --dry-run
```
