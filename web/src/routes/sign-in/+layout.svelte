<script lang="ts">
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import LocaleSwitcher from '$lib/components/LocaleSwitcher.svelte';

	let { children } = $props();
</script>

<!--
	#123: /sign-in 系ページ (= /sign-in, /sign-in/check-email, /sign-in/error) で
	テーマ・言語切替を右上に常時表示する。各 page は max-w-md で中央寄せなので
	fixed right-top と被らない。z-40 で modal overlay より下に置く (sign-in 系では
	modal は無いが、将来 alert dialog を入れた時の overlay 衝突を避けるため)。
-->
<div
	class="fixed right-4 top-4 z-40 flex items-center gap-2"
	data-testid="signin-layout-toggles"
>
	<LocaleSwitcher />
	<ThemeToggle />
</div>

{@render children?.()}
