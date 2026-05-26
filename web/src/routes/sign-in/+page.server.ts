import type { PageServerLoad } from './$types';

/**
 * sign-in 画面の load。
 *
 * Auth.js は handle 内で CSRF cookie を発行する (GET /auth/csrf を経由しなくても
 * SvelteKit handle 内で内部的にセット)。フォームの hidden input にも同じトークンを
 * 載せるため、`/auth/csrf` から JSON を取得して `data.csrfToken` として渡す。
 *
 * `event.fetch` を使うことで SSR コンテキスト内で内部 endpoint を直接呼べる。
 *
 * #184: @auth/sveltekit が export する `SignIn` form action wrapper を採用するか検討したが、
 * Auth.js docs の SignIn パターンは Email provider に対して **server-side で内部 fetch する
 * 必要**があり、 結局本 SSR fetch と等価。 さらに本実装は `csrfToken` を component 側で
 * 任意のフォーム配置に hidden input として埋め込めて柔軟性が高い (#166 で sign-out にも
 * 同 token を流用済) ため、 現状の SSR fetch を維持する判定。
 */
export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const res = await fetch('/auth/csrf');
		if (!res.ok) return { csrfToken: '' };
		const json = (await res.json()) as { csrfToken?: string };
		return { csrfToken: json.csrfToken ?? '' };
	} catch {
		return { csrfToken: '' };
	}
};
