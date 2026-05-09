<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>サインイン — resource-planner</title>
</svelte:head>

<main class="container mx-auto max-w-md px-4 py-12">
	<h1 class="mb-2 text-2xl font-bold">サインイン</h1>
	<p class="mb-6 text-sm text-muted-foreground">
		会社のメールアドレスを入力してください。サインインリンクをメールで送信します。
	</p>

	<!--
		Auth.js が `/auth/signin/nodemailer` を auto-register (hooks.server.ts の handle 経由)。
		csrfToken は同じ origin で Auth.js が cookie をセット済 (handle が GET 時に注入)。
		本 PR では検証用の placeholder ページ。sign-in 主導線への昇格は PR-A5 で。
	-->
	<form method="POST" action="/auth/signin/nodemailer" class="space-y-4">
		<input type="hidden" name="csrfToken" value={data.csrfToken} />
		<div>
			<label for="email" class="mb-1 block text-sm font-medium">メールアドレス</label>
			<input
				id="email"
				name="email"
				type="email"
				required
				autocomplete="email"
				class="w-full rounded border border-input bg-background px-3 py-2"
				placeholder="you@your-company.example.com"
			/>
		</div>
		<button type="submit" class="w-full rounded bg-primary px-4 py-2 text-primary-foreground">
			サインインリンクを送信
		</button>
	</form>

	<p class="mt-6 text-xs text-muted-foreground">
		許可されたドメインのメールアドレスのみサインイン可能です。
	</p>
</main>
