import { redirect } from '@sveltejs/kit';
import { queryAllByTeam } from '$lib/repository';
import { renderMarkdown } from '$lib/markdown';
import type { ProjectWithRenderedDescription } from '$lib/types';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const session = await event.locals.auth();
	const locale = event.locals.locale;
	const theme = event.locals.theme;

	// 未認証なら sign-in ページへ送る (#65 / #87、Clerk 撤去後)。
	// /sign-in 系ページ自体は authenticated でも accessible (Auth.js 側で適切にハンドル)。
	if (!session?.user?.id) {
		if (event.url.pathname.startsWith('/sign-in') || event.url.pathname.startsWith('/auth')) {
			// csrfToken は未認証時 AppHeader を mount しないので空文字で OK (型整合用)。
			return { locale, theme, csrfToken: '', resources: [], projects: [], assignments: [] };
		}
		redirect(303, '/sign-in');
	}

	// #166: sign-out form の double-submit CSRF 用 token を SSR fetch して全 authenticated
	// page に流す。 sign-in 側 +page.server.ts と同じ pattern。 fail-soft (失敗時は空文字)。
	let csrfToken = '';
	try {
		const res = await event.fetch('/auth/csrf');
		if (res.ok) {
			const json = (await res.json()) as { csrfToken?: string };
			csrfToken = json.csrfToken ?? '';
		}
	} catch {
		csrfToken = '';
	}

	// teamId は requireSession() と同じ default。multi-team 化までは hardcode。
	const teamId = 'team_default';
	const data = await queryAllByTeam(teamId);

	// ADR 0010 / PR-N4: SSR で markdown を sanitize 済 HTML に変換。 description なしの
	// project には empty string を渡し、 client が `{@html descriptionHtml}` で安全に
	// 表示できる契約に揃える。 marked + isomorphic-dompurify の overhead は warm Lambda で
	// <1ms / project、 wasteful 回避のため description ありのみ render する。
	const projects: ProjectWithRenderedDescription[] = data.projects.map((p) => ({
		...p,
		descriptionHtml: p.description ? renderMarkdown(p.description) : ''
	}));

	return {
		locale,
		theme,
		csrfToken,
		user: { id: session.user.id, email: session.user.email, name: session.user.name },
		resources: data.resources,
		projects,
		assignments: data.assignments
	};
};
