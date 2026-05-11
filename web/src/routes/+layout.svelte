<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from 'svelte-sonner';
	import { initLocale } from '$lib/i18n/index.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	// SSR で決定された locale (cookie / Accept-Language) を client にも同期 (#98)
	$effect.pre(() => {
		initLocale(data.locale);
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<!--
  mode-watcher (#97): light / dark / system theme を <html class> + cookie で同期。
  #141: SSR で cookie から復元した data.theme を defaultMode に渡し、hydration 時の
  userPrefersMode 初期値が 'system' に戻る race を防ぐ。
-->
<ModeWatcher defaultMode={data.theme} />

<Toaster richColors closeButton position="top-right" />

<!-- #132: confirmDialog の root mount。app 全体で 1 つだけ。 -->
<ConfirmDialog />

{@render children()}
