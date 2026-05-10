<script lang="ts">
	import { mode, setMode, userPrefersMode } from 'mode-watcher';
	import Sun from 'phosphor-svelte/lib/Sun';
	import Moon from 'phosphor-svelte/lib/Moon';
	import Monitor from 'phosphor-svelte/lib/Monitor';

	/**
	 * テーマ切替 (light → dark → system → light、#97)。
	 * - `mode-watcher` が cookie / localStorage 同期と `<html class="dark">` 反映を担う
	 * - 初期値は `prefers-color-scheme` + cookie (`+layout.svelte` の `<ModeWatcher />` 経由)
	 * - icon は phosphor (#105 と一貫)
	 */
	function cycle() {
		const current = userPrefersMode.current;
		const next = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
		setMode(next);
	}

	const label = $derived.by(() => {
		const u = userPrefersMode.current;
		if (u === 'system') return `テーマ: システム (${mode.current})`;
		if (u === 'dark') return 'テーマ: ダーク';
		return 'テーマ: ライト';
	});
</script>

<button
	type="button"
	onclick={cycle}
	aria-label={label}
	title={label}
	class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background transition-colors hover:bg-accent hover:text-accent-foreground"
>
	{#if userPrefersMode.current === 'light'}
		<Sun size={18} weight="regular" aria-hidden="true" />
	{:else if userPrefersMode.current === 'dark'}
		<Moon size={18} weight="regular" aria-hidden="true" />
	{:else}
		<Monitor size={18} weight="regular" aria-hidden="true" />
	{/if}
</button>
