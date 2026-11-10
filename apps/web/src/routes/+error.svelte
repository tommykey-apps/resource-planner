<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { m } from '$lib/paraglide/messages.js';
	import { errorMessage } from '$lib/i18n/message-maps';

	const status = $derived(page.status);
	// #178: server が App.Error.code (i18n key) を載せていたら user locale で翻訳。
	// 未知の code なら raw message に fallback、 それも無ければ unknownMessage。
	const message = $derived(
		(page.error?.code && errorMessage(page.error.code, { field: '' })) ||
			page.error?.message ||
			m.errorPage_unknownMessage()
	);
</script>

<main>
	<div class="card">
		<h1>{status}</h1>
		<p class="message">{message}</p>

		{#if status === 401}
			<p class="hint">{m.errorPage_hint401()}</p>
		{:else if status === 403}
			<p class="hint">{m.errorPage_hint403()}</p>
		{:else if status === 404}
			<p class="hint">{m.errorPage_hint404()}</p>
		{:else if status >= 500}
			<p class="hint">{m.errorPage_hint5xx()}</p>
		{/if}

		<div class="actions">
			<Button variant="outline" onclick={() => (window.location.href = '/')}>
				{m.errorPage_goHome()}
			</Button>
			<Button variant="ghost" onclick={() => (window.location.href = '/sign-in')}>
				{m.errorPage_signin()}
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
