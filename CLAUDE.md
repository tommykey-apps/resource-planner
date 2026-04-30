# resource-planner

要員計画アプリ。SvelteKit (adapter-static) + Tailwind v4 + `@tommykey-apps/ui-components` 消費。

## プロジェクト構成

```
resource-planner/
├── src/
│   ├── routes/
│   │   ├── +layout.svelte
│   │   ├── +page.svelte
│   │   ├── +page.ts          # prerender = true (adapter-static 必須)
│   │   └── layout.css        # Tailwind v4 entry (@import 'tailwindcss')
│   ├── lib/
│   └── app.html
├── .flox/                    # flox 環境 (nodejs_22 + pnpm)
└── .github/workflows/ci.yaml
```

## 開発環境

```bash
flox activate    # nodejs 22 + pnpm 10
```

## 認証 (private package 取得)

`@tommykey-apps/ui-components` は GitHub Packages の private なので `GITHUB_TOKEN` 必須:

```bash
export GITHUB_TOKEN=$(gh auth token)
```

`.npmrc` で `${GITHUB_TOKEN}` を展開している。CI では `secrets.GITHUB_TOKEN` で完結。

## コマンド

```bash
pnpm install               # 依存インストール (要 GITHUB_TOKEN)
pnpm dev                   # Vite dev server
pnpm build                 # 静的サイトビルド (build/)
pnpm check                 # svelte-check
pnpm lint                  # ESLint + Prettier
```

## デプロイ方針 (未確定)

- `adapter-static` で静的サイトとしてビルド
- ホスティング先は未定 (Cloudflare Pages / S3 + CloudFront / GitHub Pages のどれか想定)

## ライブラリ消費

```svelte
<script>
  import { ResourceTimeline } from '@tommykey-apps/ui-components';
</script>
```

ローカル開発で `ui-components` の変更を即時反映したい場合:
- `pnpm link --global` (一時的)
- `yalc` (推奨)
- patch を publish して `pnpm add @tommykey-apps/ui-components@latest`

## 関連リポジトリ

- [tommykey-apps/ui-components](https://github.com/tommykey-apps/ui-components) — このアプリで使う Svelte コンポーネントライブラリ
