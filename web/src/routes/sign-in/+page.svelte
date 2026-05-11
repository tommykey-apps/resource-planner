<script lang="ts">
	import { t } from '$lib/i18n/index.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	// 連打防止 (#94)。Auth.js auto endpoint への直接 POST なので `use:enhance` ではなく
	// 生 onsubmit + $state で一回限りに。送信後はページ遷移するため reset は不要。
	let submitting = $state(false);

	function onSubmit(e: Event) {
		if (submitting) {
			e.preventDefault();
			return;
		}
		submitting = true;
	}
</script>

<svelte:head>
	<title>{t('signin.title')} — {t('app.title')}</title>
</svelte:head>

<main class="container mx-auto max-w-md px-4 py-12">
	<h1 class="mb-2 text-2xl font-bold">{t('signin.title')}</h1>
	<p class="mb-6 text-sm text-muted-foreground">
		{t('signin.description')}
	</p>

	<!--
		Auth.js が `/auth/signin/nodemailer` を auto-register (hooks.server.ts の handle 経由)。
		csrfToken は同じ origin で Auth.js が cookie をセット済 (handle が GET 時に注入)。
	-->
	<form method="POST" action="/auth/signin/nodemailer" class="space-y-4" onsubmit={onSubmit}>
		<input type="hidden" name="csrfToken" value={data.csrfToken} />
		<div>
			<label for="email" class="mb-1 block text-sm font-medium">{t('signin.emailLabel')}</label>
			<input
				id="email"
				name="email"
				type="email"
				required
				autocomplete="email"
				readonly={submitting}
				class="w-full rounded border border-input bg-background px-3 py-2 read-only:opacity-60"
				placeholder={t('signin.emailPlaceholder')}
			/>
		</div>
		<button
			type="submit"
			disabled={submitting}
			class="w-full cursor-pointer rounded bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
		>
			{submitting ? t('signin.submitting') : t('signin.submit')}
		</button>
	</form>

	<p class="mt-6 text-xs text-muted-foreground">
		{t('signin.hint')}
	</p>
</main>
