<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';

	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? '不明なエラーが発生しました');
</script>

<main>
	<div class="card">
		<h1>{status}</h1>
		<p class="message">{message}</p>

		{#if status === 401}
			<p class="hint">サインインが必要です。サインイン画面でメールアドレスを入力してください。</p>
		{:else if status === 403}
			<p class="hint">
				許可されていない操作です。サインインしているユーザーで権限を確認してください。
			</p>
		{:else if status === 404}
			<p class="hint">指定された URL は存在しません。</p>
		{:else if status >= 500}
			<p class="hint">サーバー側でエラーが発生しました。時間をおいて再度お試しください。</p>
		{/if}

		<div class="actions">
			<Button variant="outline" onclick={() => (window.location.href = '/')}>ホームに戻る</Button>
			<Button variant="ghost" onclick={() => (window.location.href = '/sign-in')}>
				サインイン
			</Button>
		</div>
	</div>
</main>

<style>
	main {
		display: flex;
		min-height: 100vh;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: var(--background);
	}

	.card {
		max-width: 480px;
		width: 100%;
		padding: 2rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--card);
		text-align: center;
	}

	h1 {
		margin: 0 0 0.5rem;
		font-size: 3rem;
		color: var(--destructive);
	}

	.message {
		margin: 0 0 1rem;
		color: var(--foreground);
		font-size: 1rem;
	}

	.hint {
		margin: 1rem 0;
		padding: 1rem;
		background: var(--muted);
		border-radius: calc(var(--radius) * 0.6);
		text-align: left;
		font-size: 0.875rem;
		color: var(--muted-foreground);
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
		margin-top: 1.5rem;
	}
</style>
