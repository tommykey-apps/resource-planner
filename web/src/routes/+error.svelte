<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/index.svelte';

	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? t('errorPage.unknownMessage'));
</script>

<main>
	<div class="card">
		<h1>{status}</h1>
		<p class="message">{message}</p>

		{#if status === 401}
			<p class="hint">{t('errorPage.hint401')}</p>
		{:else if status === 403}
			<p class="hint">{t('errorPage.hint403')}</p>
		{:else if status === 404}
			<p class="hint">{t('errorPage.hint404')}</p>
		{:else if status >= 500}
			<p class="hint">{t('errorPage.hint5xx')}</p>
		{/if}

		<div class="actions">
			<Button variant="outline" onclick={() => (window.location.href = '/')}>
				{t('errorPage.goHome')}
			</Button>
			<Button variant="ghost" onclick={() => (window.location.href = '/sign-in')}>
				{t('errorPage.signin')}
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
