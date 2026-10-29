import { userPrefersMode } from 'mode-watcher';
import { THEME_COOKIE_NAME } from '$lib/theme';
import { buildClientCookie, isSecureClientContext } from '$lib/cookies';

/**
 * userPrefersMode を cookie にミラーする (#141)。 component の初期化中に呼ぶ。
 *
 * - `mode-watcher` は localStorage しか書かない → SSR で初期 mode を復元するため、
 *   localStorage と同じ key (`mode-watcher-mode`) で cookie も併記する
 * - setMode 直後だけでなく、 初回 hydration で localStorage 由来の mode に確定したタイミング
 *   (cookie が未書込のレガシーユーザー) でも cookie を書くため、 $effect で reactive に同期する
 * - #184: production (HTTPS) では Secure 属性付与、 dev (http://localhost) では skip
 * - テーマはアバターメニューと sign-in 画面の両方で変えられるので root layout で 1 回だけ呼ぶ
 */
export function syncThemeCookie(): void {
	$effect(() => {
		const current = userPrefersMode.current;
		if (typeof document === 'undefined') return;
		document.cookie = buildClientCookie({
			name: THEME_COOKIE_NAME,
			value: current,
			maxAge: 31536000,
			secure: isSecureClientContext()
		});
	});
}
