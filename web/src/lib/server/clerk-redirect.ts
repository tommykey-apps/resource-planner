/**
 * Decode publishable key to extract Clerk frontend API domain.
 * Format: pk_(test|live)_<base64(domain + '$')>
 */
function frontendApiFromPublishableKey(pk: string): string {
	const parts = pk.split('_');
	if (parts.length < 3) throw new Error('Invalid publishable key format');
	const encoded = parts.slice(2).join('_');
	const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
	return decoded.replace(/\$$/, '');
}

export function buildSignInUrl(publishableKey: string, returnTo: string): string {
	const domain = frontendApiFromPublishableKey(publishableKey);
	const params = new URLSearchParams({ redirect_url: returnTo });
	return `https://${domain}/sign-in?${params.toString()}`;
}
