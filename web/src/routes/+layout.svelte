<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from 'svelte-sonner';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<!-- mode-watcher (#97): light / dark / system theme を <html class> + cookie で同期 -->
<ModeWatcher />

<Toaster richColors closeButton position="top-right" />

{@render children()}
