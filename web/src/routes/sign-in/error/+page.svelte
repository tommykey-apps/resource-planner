<script lang="ts">
	import { page } from '$app/state';

	const errorCode = $derived(page.url.searchParams.get('error') ?? 'Default');

	const errorMessages: Record<string, string> = {
		AccessDenied: '許可されていないドメインのメールアドレスです。',
		Verification: 'リンクが無効または期限切れです。再度サインインリンクを送信してください。',
		Configuration: '認証設定に問題があります。管理者に連絡してください。',
		Default: 'サインインに失敗しました。しばらくして再試行してください。'
	};

	const message = $derived(errorMessages[errorCode] ?? errorMessages.Default);
</script>

<svelte:head>
	<title>サインインエラー — resource-planner</title>
</svelte:head>

<main class="container mx-auto max-w-md px-4 py-12">
	<h1 class="mb-2 text-2xl font-bold">サインインに失敗しました</h1>
	<p class="mb-4 rounded border-l-4 border-destructive bg-destructive/10 p-4 text-sm">
		{message}
	</p>
	<p class="text-xs text-muted-foreground">エラーコード: {errorCode}</p>

	<div class="mt-6">
		<a href="/sign-in" class="inline-block rounded bg-primary px-4 py-2 text-primary-foreground">
			サインインに戻る
		</a>
	</div>
</main>
