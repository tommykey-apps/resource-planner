import { redirect } from '@sveltejs/kit';
import { queryAllByTeam } from '$lib/repository';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const session = await event.locals.auth();
	const locale = event.locals.locale;
	const theme = event.locals.theme;

	// 未認証なら sign-in ページへ送る (#65 / #87、Clerk 撤去後)。
	// /sign-in 系ページ自体は authenticated でも accessible (Auth.js 側で適切にハンドル)。
	if (!session?.user?.id) {
		if (event.url.pathname.startsWith('/sign-in') || event.url.pathname.startsWith('/auth')) {
			return { locale, theme, resources: [], projects: [], assignments: [] };
		}
		redirect(303, '/sign-in');
	}

	// teamId は requireSession() と同じ default。multi-team 化までは hardcode。
	const teamId = 'team_default';
	const data = await queryAllByTeam(teamId);

	return {
		locale,
		theme,
		user: { id: session.user.id, email: session.user.email, name: session.user.name },
		...data
	};
};
