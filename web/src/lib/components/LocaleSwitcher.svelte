<script lang="ts">
	import Translate from 'phosphor-svelte/lib/Translate';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale, setLocale } from '$lib/paraglide/runtime';

	const current = getLocale();

	// Paraglide JS の setLocale は cookie を書いてページを再読み込みする (公式の既定動作)。
	function cycle() {
		setLocale(current === 'ja' ? 'en' : 'ja');
	}
</script>

<button
	type="button"
	onclick={cycle}
	aria-label={m.locale_label()}
	title={m.locale_label()}
	class="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md border border-border bg-background px-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:outline-none"
>
	<Translate size={18} weight="regular" aria-hidden="true" />
	<span class="text-xs">{current === 'ja' ? 'JA' : 'EN'}</span>
</button>
