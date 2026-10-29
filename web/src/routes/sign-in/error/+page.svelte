<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';

	const errorCode = $derived(page.url.searchParams.get('error') ?? 'Default');

	const message = $derived.by(() => {
		switch (errorCode) {
			case 'AccessDenied':
				return m.signin_errorAccessDenied();
			case 'Verification':
				return m.signin_errorVerification();
			case 'Configuration':
				return m.signin_errorConfiguration();
			default:
				return m.signin_errorDefault();
		}
	});
</script>

<svelte:head>
	<title>{m.signin_errorTitle()} — {m.app_title()}</title>
</svelte:head>

<!--
	#101 item 2: 404 (`+error.svelte`) と同じ centered-card レイアウトに揃える。
	min-h-screen + flex 中央配置 + max-w カード で alignment を統一。
-->
<main class="flex min-h-screen items-center justify-center bg-background px-4 py-12">
	<div class="w-full max-w-md rounded border border-border bg-card p-8 text-center">
		<h1 class="mb-2 text-2xl font-bold text-destructive">{m.signin_errorTitle()}</h1>
		<p class="mb-4 rounded border-l-4 border-destructive bg-destructive/10 p-4 text-left text-sm">
			{message}
		</p>
		<p class="text-xs text-muted-foreground">{m.signin_errorCode({ code: errorCode })}</p>

		<div class="mt-6">
			<a
				href="/sign-in"
				class="inline-block rounded bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:outline-none"
			>
				{m.signin_backToSignin()}
			</a>
		</div>
	</div>
</main>
