import type { PageServerLoad } from './$types';

/**
 * sign-in 画面の load。
 *
 * Auth.js は handle 内で CSRF cookie を発行する (GET /auth/csrf を経由しなくても
 * SvelteKit handle 内で内部的にセット)。フォームの hidden input にも同じトークンを
 * 載せるため、`/auth/csrf` から JSON を取得して `data.csrfToken` として渡す。
 *
 * `event.fetch` を使うことで SSR コンテキスト内で内部 endpoint を直接呼べる。
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
