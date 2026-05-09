import { handle } from './auth';

/**
 * SvelteKit handle hook (#65 / #87)。
 *
 * Auth.js (`@auth/sveltekit`) が `event.locals.auth` を async session getter として注入する。
 * ドメイン制限は Auth.js の `callbacks.signIn` (`auth.ts`) で実施するため、本 file には
 * 追加のミドルウェアは不要。Clerk 関連の SSM fetch / domain check / sequence は PR-A5 で撤去済。
 */
export { handle };
