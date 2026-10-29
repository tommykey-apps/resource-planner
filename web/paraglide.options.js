/**
 * Paraglide JS のコンパイル設定。 vite plugin (dev / build / Vitest) と
 * scripts/compile-paraglide.mjs (svelte-check 前の生成) の両方から読む。
 *
 * - strategy: 利用者が切り替えた言語 (cookie) > ブラウザの言語 (Accept-Language / navigator.languages) > baseLocale
 * - cookieName: 自前 i18n 時代の cookie 名を引き継ぎ、 切り替え済みの利用者の言語を保つ
 *
 * @type {import('@inlang/paraglide-js').CompilerOptions}
 */
export const paraglideOptions = {
	project: './project.inlang',
	outdir: './src/lib/paraglide',
	emitTsDeclarations: true,
	strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
	cookieName: 'resource-planner-locale',
	cookieMaxAge: 60 * 60 * 24 * 365,
	cookieSameSite: 'lax',
	cookieSecure: 'auto'
};
