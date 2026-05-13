import type { Assignment as DbAssignment } from './types';
import type { Assignment as TimelineAssignment } from '@tommykey-apps/ui-components';
import { parseLocalDate, formatLocalDate } from './date';

/**
 * DB 形式 (`Assignment`、`endDateExclusive` 文字列) と ResourceTimeline 形式
 * (`TimelineAssignment`、`endDate: Date` exclusive) の **型変換** を担う。
 *
 * 半開区間規約は両者一致 (ADR 0004) のため、`±1 day` 変換は不要。
 * `Date <-> string` の変換と Project の `label` / `color` compose のみを行う。
 */

/**
 * DB Assignment + 関連 Project の color/label を ResourceTimeline 用に compose。
 * timeline は Project entity を知らないため、app 層で帯の見た目を決めて渡す。
 */
export function toTimelineAssignment(
	a: DbAssignment,
	project: { name: string; color: string } | undefined
): TimelineAssignment {
	return {
		id: a.id,
		resourceId: a.resourceId,
		startDate: parseLocalDate(a.startDate),
		endDate: parseLocalDate(a.endDateExclusive),
		label: project?.name,
		color: project?.color
	};
}

/**
 * ResourceTimeline の onMove / onResize 引数を DB 形式に戻す。
 * timeline は projectId を持たないため、変更前の DbAssignment と merge して projectId を保持する。
 */
export function fromTimelineAssignment(t: TimelineAssignment, prev: DbAssignment): DbAssignment {
	return {
		...prev,
		resourceId: t.resourceId,
		startDate: formatLocalDate(t.startDate),
		endDateExclusive: formatLocalDate(t.endDate)
	};
}
