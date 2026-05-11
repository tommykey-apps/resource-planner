<script lang="ts">
	import { mode, setMode, userPrefersMode } from 'mode-watcher';
	import Sun from 'phosphor-svelte/lib/Sun';
	import Moon from 'phosphor-svelte/lib/Moon';
	import Monitor from 'phosphor-svelte/lib/Monitor';
	import { t } from '$lib/i18n/index.svelte';
	import { THEME_COOKIE_NAME } from '$lib/theme';

	/**
	 * テーマ切替 (light → dark → system → light、#97)。
	 * - `mode-watcher` は localStorage しか書かない → SSR で初期 mode を復元するため、
	 *   localStorage と同じ key (`mode-watcher-mode`) で cookie も併記する (#141)
	 * - 初期値は SSR で cookie 復元 → `<ModeWatcher defaultMode={data.theme} />`
	 * - icon は phosphor (#105 と一貫)
	 */
	function cycle() {
		const current = userPrefersMode.current;
		const next = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
		setMode(next);
	}

	// userPrefersMode を cookie にミラー (#141)。
	// setMode 直後だけでなく、初回 hydration で localStorage 由来の mode に確定したタイミング
	// (cookie が未書込のレガシーユーザー) でも cookie を書くため、$effect で reactive に同期する。
	$effect(() => {
		const current = userPrefersMode.current;
		if (typeof document === 'undefined') return;
		document.cookie = `${THEME_COOKIE_NAME}=${current}; path=/; max-age=31536000; samesite=lax`;
	});

	const label = $derived.by(() => {
		const u = userPrefersMode.current;
		if (u === 'system') {
			return t('theme.labelSystem', { resolved: t(`theme.${mode.current ?? 'light'}`) });
		}
		return t('theme.label', { mode: t(`theme.${u}`) });
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
