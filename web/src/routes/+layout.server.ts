import { buildClerkProps } from 'svelte-clerk/server';
import { redirect } from '@sveltejs/kit';
import { env as publicEnv } from '$env/dynamic/public';
import { buildSignInUrl } from '$lib/server/clerk-redirect';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	const auth = locals.auth();

	if (!auth.userId) {
		const pk = publicEnv.PUBLIC_CLERK_PUBLISHABLE_KEY;
		if (!pk) {
			throw new Error('PUBLIC_CLERK_PUBLISHABLE_KEY env is not set');
		}
		const returnTo = url.origin + url.pathname + url.search + url.hash;
		redirect(307, buildSignInUrl(pk, returnTo));
	}

	return { ...buildClerkProps(auth) };
};
