/**
 * タイムライン (/) の form actions。 AssignmentCreator / AssignmentEditor から予定を作成・更新する。
 */
import { assignmentEditActions } from '$lib/features/assignment/actions.server';
import type { Actions } from './$types';

export const actions = { ...assignmentEditActions } satisfies Actions;
