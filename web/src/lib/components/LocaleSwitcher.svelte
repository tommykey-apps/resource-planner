<script lang="ts">
	import Translate from 'phosphor-svelte/lib/Translate';
	import { localeState, t, type Locale } from '$lib/i18n/index.svelte';

	function cycle() {
		const next: Locale = localeState.current === 'ja' ? 'en' : 'ja';
		localeState.set(next);
	}
</script>

<button
	type="button"
	onclick={cycle}
	aria-label={t('locale.label')}
	title={t('locale.label')}
	class="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md border border-border bg-background px-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:outline-none"
>
	<Translate size={18} weight="regular" aria-hidden="true" />
	<span class="text-xs">{localeState.current === 'ja' ? 'JA' : 'EN'}</span>
</button>
