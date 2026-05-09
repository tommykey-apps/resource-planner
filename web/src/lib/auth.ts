/**
 * Provider 非依存の認証セッション抽象 (#65 / #79 / #81 / #87)。
 *
 * Auth.js (`@auth/sveltekit`) が `event.locals.auth` を async session getter として
 * 注入するため、本関数は **async** で session を await して `AppSession` 形に整形する。
 *
 * Clerk fallback (PR-A1〜A4 で同居していた経路) は PR-A5 で削除。
 *
 * - `teamId`: 現状は `'team_default'` 固定 (PR-A2 で auto-join 済)。将来 multi-team
 *   対応では last-used team を session に保存する別 PR で。
 */
import { error, type RequestEvent } from '@sveltejs/kit';

export interface AppSession {
	userId: string;
	email: string;
	name?: string;
	teamId: string;
}

const DEFAULT_TEAM_ID = 'team_default';

interface AuthJsLocals {
	auth?: () => Promise<{
		user?: { id?: string | null; email?: string | null; name?: string | null };
	} | null>;
}

/**
 * 認証済セッションを取得する。未認証なら 401 を throw する。
 * Auth.js session を読み出して `AppSession` に整形。
 */
export async function requireSession(event: RequestEvent): Promise<AppSession> {
	const locals = event.locals as AuthJsLocals;
	if (typeof locals.auth !== 'function') {
		error(401, '認証が必要です');
	}

	const session = await locals.auth();
	if (!session?.user?.id || !session.user.email) {
		error(401, '認証が必要です');
	}

	return {
		userId: session.user.id,
		email: session.user.email,
		name: session.user.name ?? undefined,
		teamId: DEFAULT_TEAM_ID
	};
}
