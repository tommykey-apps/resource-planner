/**
 * 予定一覧 (/assignments) の form actions。 作成・更新はタイムラインと同じ部品から、 削除は一覧の行から送る。
 */
import {
	assignmentDeleteActions,
	assignmentEditActions
} from '$lib/features/assignment/actions.server';
import type { Actions } from './$types';

export const actions = { ...assignmentEditActions, ...assignmentDeleteActions } satisfies Actions;
