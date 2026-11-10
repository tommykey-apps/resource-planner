<script lang="ts">
	import { mode, setMode, userPrefersMode } from 'mode-watcher';
	import Sun from 'phosphor-svelte/lib/Sun';
	import Moon from 'phosphor-svelte/lib/Moon';
	import Monitor from 'phosphor-svelte/lib/Monitor';
	import { m } from '$lib/paraglide/messages.js';
	import { themeLabel } from '$lib/i18n/message-maps';

	/**
	 * テーマ切替 (light → dark → system → light、#97)。 sign-in 画面で使う。
	 * - cookie ミラー (#141) は root layout の `syncThemeCookie()` が担う
	 * - 初期値は SSR で cookie 復元 → `<ModeWatcher defaultMode={data.theme} />`
	 * - icon は phosphor (#105 と一貫)
	 */
	function cycle() {
		const current = userPrefersMode.current;
		const next = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
		setMode(next);
	}

	const label = $derived.by(() => {
		const u = userPrefersMode.current;
		if (u === 'system') {
			return m.theme_labelSystem({ resolved: themeLabel(mode.current ?? 'light') });
		}
		return m.theme_label({ mode: themeLabel(u) });
	});
</script>

<button
	type="button"
	onclick={cycle}
	aria-label={label}
	title={label}
	class="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:outline-none"
>
	{#if userPrefersMode.current === 'light'}
		<Sun size={18} weight="regular" aria-hidden="true" />
	{:else if userPrefersMode.current === 'dark'}
		<Moon size={18} weight="regular" aria-hidden="true" />
	{:else}
		<Monitor size={18} weight="regular" aria-hidden="true" />
	{/if}
</button>
