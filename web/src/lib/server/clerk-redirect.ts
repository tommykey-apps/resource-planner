/**
 * Decode publishable key to extract Clerk Account Portal domain.
 *
 * publishable key encodes the Frontend API domain (e.g., `premium-mutt-63.clerk.accounts.dev`).
 * The Account Portal (where hosted sign-in pages live) is at the same slug
 * but without the `clerk.` prefix (e.g., `premium-mutt-63.accounts.dev`).
 *
 * Format: pk_(test|live)_<base64(frontend_api_domain + '$')>
 */
function accountPortalFromPublishableKey(pk: string): string {
	const parts = pk.split('_');
	if (parts.length < 3) throw new Error('Invalid publishable key format');
	const encoded = parts.slice(2).join('_');
	const frontendApi = Buffer.from(encoded, 'base64').toString('utf-8').replace(/\$$/, '');
	// Strip leading `clerk.` to get Account Portal domain
	return frontendApi.replace(/^clerk\./, '');
}

export function buildSignInUrl(publishableKey: string, returnTo: string): string {
	const domain = accountPortalFromPublishableKey(publishableKey);
	const params = new URLSearchParams({ redirect_url: returnTo });
	return `https://${domain}/sign-in?${params.toString()}`;
}
