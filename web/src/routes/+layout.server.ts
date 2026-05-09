import { buildClerkProps } from 'svelte-clerk/server';
import { queryAllByTeam } from '$lib/repository';
import { requireSession } from '$lib/auth';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	// 未認証は +layout.svelte の <RedirectToSignIn /> で誘導される (Clerk 撤去まで)。
	// 認証済の場合は session 経由で teamId を取得 (#65 で Clerk Org 概念を撤廃)。
	const authFn = event.locals.auth as unknown;
	const clerkAuth = typeof authFn === 'function' ? (authFn as () => unknown)() : undefined;
	const isAuthenticated =
		clerkAuth !== undefined &&
		clerkAuth !== null &&
		!(clerkAuth instanceof Promise) &&
		typeof clerkAuth === 'object' &&
		'userId' in clerkAuth &&
		(clerkAuth as { userId: string | null }).userId !== null;

	if (!isAuthenticated) {
		return {
			...buildClerkProps(clerkAuth as Parameters<typeof buildClerkProps>[0]),
			resources: [],
			projects: [],
			assignments: []
		};
	}

	const session = requireSession(event);
	const data = await queryAllByTeam(session.teamId);

	return {
		...buildClerkProps(clerkAuth as Parameters<typeof buildClerkProps>[0]),
		...data
	};
};
