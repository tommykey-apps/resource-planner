/** 案件画面 (/projects) の form actions。 */
import { projectActions } from '$lib/features/project/actions.server';
import type { Actions } from './$types';

export const actions = { ...projectActions } satisfies Actions;
