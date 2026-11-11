<script lang="ts">
	/**
	 * タブのアイコンと Apple 用アイコンの <link>。 レイアウトで全ページに 1 回だけ置く。
	 *
	 * 図は import して、 ビルド時に中身のハッシュ値入りの URL にする。 `static/` の固定 URL だと
	 * 図を変えても URL が同じで、 ブラウザが古いアイコンを持ち続ける (HTML の仕様でも、
	 * アイコンの更新はブラウザの義務ではない)。
	 * Refs: https://svelte.dev/docs/kit/project-structure#Project-files-static
	 * Refs: https://html.spec.whatwg.org/multipage/links.html#rel-icon
	 *
	 * /favicon.ico だけは固定の URL が要るので `static/` に置く (RSS リーダーなどはそこしか見ない)。
	 */
	import icon from './icon.svg';
	import appleTouchIcon from './apple-touch-icon.png';
</script>

<svelte:head>
	<!-- SVG を使えないブラウザ向け。 sizes を付けないと Chrome が SVG より ICO を選ぶ -->
	<link rel="icon" href="/favicon.ico" sizes="32x32" />
	<link rel="icon" type="image/svg+xml" href={icon} />
	<link rel="apple-touch-icon" href={appleTouchIcon} />
</svelte:head>
