/** 部署画面 (/departments) の form actions。 */
import { departmentActions } from '$lib/features/department/actions.server';
import type { Actions } from './$types';

export const actions = { ...departmentActions } satisfies Actions;
