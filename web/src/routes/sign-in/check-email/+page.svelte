<script lang="ts">
	import { t } from '$lib/i18n/index.svelte';
</script>

<svelte:head>
	<title>{t('signin.checkEmailTitle')} — {t('app.title')}</title>
</svelte:head>

<main class="container mx-auto max-w-md px-4 py-12">
	<h1 class="mb-2 text-2xl font-bold">{t('signin.checkEmailTitle')}</h1>
	<p class="mb-4">
		{t('signin.checkEmailDescription')}
	</p>
	<p class="text-sm text-muted-foreground">
		{t('signin.checkEmailFootnote')}
	</p>

	<div class="mt-6">
		<a href="/sign-in" class="text-sm text-primary underline">{t('signin.checkEmailRetry')}</a>
	</div>
</main>
