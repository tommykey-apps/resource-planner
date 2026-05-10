<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from 'svelte-sonner';
	import { initLocale } from '$lib/i18n/index.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	// SSR で決定された locale (cookie / Accept-Language) を client にも同期 (#98)
	$effect.pre(() => {
		initLocale(data.locale);
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<!-- mode-watcher (#97): light / dark / system theme を <html class> + cookie で同期 -->
<ModeWatcher />

<Toaster richColors closeButton position="top-right" />

{@render children()}
