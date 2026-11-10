/** メンバー画面 (/resources) の form actions。 */
import { resourceActions } from '$lib/features/resource/actions.server';
import type { Actions } from './$types';

export const actions = { ...resourceActions } satisfies Actions;
