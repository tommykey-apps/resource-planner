import { redirect } from '@sveltejs/kit';
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
 *
 * #168 defense in depth: callbackUrl の hidden input (+page.svelte) で verify 後 / へ
 * 戻す前提だが、 既に sign-in 済 user が直接 /sign-in を navigate した時にも email 入力
 * form を見せず / へ送る。 callbackUrl が何らかの理由で効かない場合の二重 guard。
 */
export const load: PageServerLoad = async ({ fetch, locals }) => {
	const session = await locals.auth();
	if (session?.user?.id) {
		redirect(303, '/');
	}

	try {
		const res = await fetch('/auth/csrf');
		if (!res.ok) return { csrfToken: '' };
		const json = (await res.json()) as { csrfToken?: string };
		return { csrfToken: json.csrfToken ?? '' };
	} catch {
		return { csrfToken: '' };
	}
};
