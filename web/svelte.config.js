import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter({ out: 'build', precompress: true }),
		// PR-N0: CSP は kit.csp 単一統合 (hooks.server.ts では touch しない)。
		// 理由: hook で response.headers.set すると kit.csp と完全上書き衝突する
		// (SvelteKit `csp.js` の最終 headers.set 順序依存)。 append でも browser
		// intersection 評価で予期しない挙動になる。
		//
		// mode:'auto' で SSR page は nonce、 prerender page は hash を自動付与。
		// adapter-node + 全 SSR route の前提で nonce ベース動作。
		//
		// directive 値は bare 'self' (TS string literal の quote のみ)。
		// SvelteKit が出力時に CSP 正式 syntax 'self' にラップする。
		//
		// Refs:
		// - https://svelte.dev/docs/kit/configuration#csp
		// - https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
		// - https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'], // SvelteKit が hydration script に nonce 自動付与
				'style-src': ['self', 'unsafe-inline'], // Svelte transition / Tailwind 都合 (将来 nonce 化検討)
				'img-src': ['self', 'data:'],
				'font-src': ['self', 'data:'],
				'connect-src': ['self'],
				'object-src': ['none'], // OWASP 必須
				'base-uri': ['self'], // OWASP 必須 (<base> tag injection 対策)
				'form-action': ['self'], // OWASP 必須
				'frame-ancestors': ['none'] // clickjacking 完全 block
			}
		}
	}
};

export default config;
