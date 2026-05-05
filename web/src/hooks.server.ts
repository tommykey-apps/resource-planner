import { sequence } from '@sveltejs/kit/hooks';
import { error, type Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { withClerkHandler, clerkClient } from 'svelte-clerk/server';

if (!env.CLERK_SECRET_KEY_PARAM) {
	throw new Error('CLERK_SECRET_KEY_PARAM env not set');
}

const ssm = new SSMClient({});

const out = await ssm.send(
	new GetParameterCommand({
		Name: env.CLERK_SECRET_KEY_PARAM,
		WithDecryption: true
	})
);
const secretKey = out.Parameter?.Value;
if (!secretKey) {
	throw new Error('CLERK_SECRET_KEY not retrieved from SSM');
}

const clerkHandler = withClerkHandler({ secretKey });

const emailCache = new Map<string, string>();

const domainCheck: Handle = async ({ event, resolve }) => {
	const auth = event.locals.auth();
	const allowed = env.ALLOWED_DOMAIN?.toLowerCase();

	if (auth.userId && allowed) {
		let email = (
			(auth.sessionClaims?.primaryEmail as string | undefined) ??
			(auth.sessionClaims?.email as string | undefined)
		)?.toLowerCase();

		if (!email) email = emailCache.get(auth.userId);

		if (!email) {
			const user = await clerkClient.users.getUser(auth.userId);
			email = user.primaryEmailAddress?.emailAddress?.toLowerCase();
			if (email) emailCache.set(auth.userId, email);
		}

		if (!email || !email.endsWith(`@${allowed}`)) {
			error(403, `このドメインからのアクセスは許可されていません (${allowed} のみ)`);
		}
	}

	return resolve(event);
};

export const handle = sequence(clerkHandler, domainCheck);
