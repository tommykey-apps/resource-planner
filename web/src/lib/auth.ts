/**
 * Provider 非依存の認証セッション抽象 (#65 / #79)。
 *
 * Clerk → Auth.js への段階移行中、`+page.server.ts` の form action / `+layout.server.ts` の
 * load から呼ばれる「現在のユーザーを取得する」入り口を 1 箇所に集約する。
 *
 * **PR-A1 時点の挙動**: hooks.server.ts の `sequence(authHandle, clerkHandler, ...)` 順により
 * `event.locals.auth` は最終的に **Clerk のもの** で上書きされる (Auth.js は providers 空なので
 * 実質 no-op)。本関数は Clerk session を読み出して `AppSession` 形に整形する。
 *
 * - PR-A2: `teamId` を Team モデル (DDB GSI1) 経由で取得
 * - PR-A3: Auth.js Magic Link 経由の session も読めるように
 * - PR-A5: Clerk fallback を削除、Auth.js 専用に簡素化
 */
import { error, type RequestEvent } from '@sveltejs/kit';

export interface AppSession {
	userId: string;
	email: string;
	name?: string;
	/** 現在の active team。本 PR では `'team_default'` 固定、将来は last-used / URL ベース。 */
	teamId: string;
}

const DEFAULT_TEAM_ID = 'team_default';

interface ClerkLikeAuth {
	userId: string | null;
	sessionClaims?: Record<string, unknown>;
}

/**
 * 認証済セッションを取得する。未認証なら 401 を throw する。
 * 現状は Clerk session 由来。PR-A3 以降で Auth.js session も併読する。
 */
export function requireSession(event: RequestEvent): AppSession {
	const authFn = event.locals.auth as unknown;
	if (typeof authFn !== 'function') {
		error(401, '認証が必要です');
	}

	const result = (authFn as () => unknown)();
	// Auth.js は Promise を返す (PR-A3 以降に await で扱う)。Clerk は同期 object を返す。
	if (!result || typeof result !== 'object' || result instanceof Promise) {
		error(401, '認証が必要です');
	}

	const clerk = result as ClerkLikeAuth;
	if (!clerk.userId) {
		error(401, '認証が必要です');
	}

	const email = (clerk.sessionClaims?.primaryEmail ?? clerk.sessionClaims?.email) as
		| string
		| undefined;
	if (!email) {
		error(401, 'メールアドレスがセッションに含まれていません');
	}

	return {
		userId: clerk.userId,
		email,
		name: undefined,
		teamId: DEFAULT_TEAM_ID
	};
}
