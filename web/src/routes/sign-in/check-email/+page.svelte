<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
</script>

<svelte:head>
	<title>{m.signin_checkEmailTitle()} — {m.app_title()}</title>
</svelte:head>

<main class="container mx-auto max-w-md px-4 py-12">
	<h1 class="mb-2 text-2xl font-bold">{m.signin_checkEmailTitle()}</h1>
	<p class="mb-4">
		{m.signin_checkEmailDescription()}
	</p>
	<p class="text-sm text-muted-foreground">
		{m.signin_checkEmailFootnote()}
	</p>

	<div class="mt-6">
		<a href="/sign-in" class="text-sm text-primary underline">{m.signin_checkEmailRetry()}</a>
	</div>
</main>
