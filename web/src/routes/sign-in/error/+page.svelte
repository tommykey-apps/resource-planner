<script lang="ts">
	import { page } from '$app/state';
	import { t } from '$lib/i18n/index.svelte';

	const errorCode = $derived(page.url.searchParams.get('error') ?? 'Default');

	const message = $derived.by(() => {
		switch (errorCode) {
			case 'AccessDenied':
				return t('signin.errorAccessDenied');
			case 'Verification':
				return t('signin.errorVerification');
			case 'Configuration':
				return t('signin.errorConfiguration');
			default:
				return t('signin.errorDefault');
		}
	});
</script>

<svelte:head>
	<title>{t('signin.errorTitle')} — {t('app.title')}</title>
</svelte:head>

<main class="container mx-auto max-w-md px-4 py-12">
	<h1 class="mb-2 text-2xl font-bold">{t('signin.errorTitle')}</h1>
	<p class="mb-4 rounded border-l-4 border-destructive bg-destructive/10 p-4 text-sm">
		{message}
	</p>
	<p class="text-xs text-muted-foreground">{t('signin.errorCode', { code: errorCode })}</p>

	<div class="mt-6">
		<a href="/sign-in" class="inline-block rounded bg-primary px-4 py-2 text-primary-foreground">
			{t('signin.backToSignin')}
		</a>
	</div>
</main>
