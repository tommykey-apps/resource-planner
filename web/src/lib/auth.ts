/**
 * Provider 非依存の認証セッション抽象 (#65 / #79 / #81 / #87)。
 *
 * Auth.js (`@auth/sveltekit`) が `event.locals.auth` を async session getter として
 * 注入するため、本関数は **async** で session を await して `AppSession` 形に整形する。
 *
 * - `teamId`: 現状は `'team_default'` 固定 (PR-A2 で auto-join 済)。将来 multi-team
 *   対応では last-used team を session に保存する別 PR で。
 *
 * #183: 旧実装は local `AuthJsLocals` interface を定義して `as AuthJsLocals` でキャストして
 * いたが、 `@auth/sveltekit` の `dist/types.d.ts` で既に `App.Locals` を ambient augment
 * していて (`auth(): Promise<Session | null>`)、 cast は不要だった。 公式型を直接使う。
 */
import { error, type RequestEvent } from '@sveltejs/kit';
import { DEFAULT_TEAM_ID } from '$lib/repository/team';

export interface AppSession {
	userId: string;
	email: string;
	name?: string;
	teamId: string;
}

/**
 * 認証済セッションを取得する。未認証なら 401 を throw する。
 * Auth.js session を読み出して `AppSession` に整形。
 */
export async function requireSession(event: RequestEvent): Promise<AppSession> {
	const session = await event.locals.auth();
	if (!session?.user?.id || !session.user.email) {
		error(401, { message: 'Authentication required', code: 'authRequired' });
	}

	return {
		userId: session.user.id,
		email: session.user.email,
		name: session.user.name ?? undefined,
		teamId: DEFAULT_TEAM_ID
	};
}
