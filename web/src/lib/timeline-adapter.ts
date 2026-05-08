import type { Assignment as DbAssignment, DateString } from './types';
import type { Assignment as TimelineAssignment } from '@tommykey-apps/ui-components';

/**
 * DB 保存形式 (inclusive YYYY-MM-DD) と ResourceTimeline 形式 (Date / end-exclusive) を相互変換する。
 *
 * ADR 0003 参照:
 * - DB / フォーム / use-cases docs はすべて inclusive 統一
 * - ResourceTimeline は end-exclusive ライブラリ規約 → 境界でのみ ±1 day 変換
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD (Asia/Tokyo) から、その日の 0:00 ローカルを表す Date を作る。 */
export function parseLocalDate(s: DateString): Date {
	const [y, m, d] = s.split('-').map(Number);
	return new Date(y, m - 1, d);
}

/**
 * Date を Asia/Tokyo の YYYY-MM-DD に変換する。
 * `Date.toISOString().slice(0, 10)` は UTC ベースで JST と日付がずれることがあるため自前実装。
 */
export function formatLocalDate(d: Date): DateString {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/**
 * DB Assignment + 関連 Project の color/label を ResourceTimeline 用に compose。
 * timeline は Project entity を知らないため、app 層で帯の見た目を決めて渡す。
 */
export function toTimelineAssignment(
	a: DbAssignment,
	project: { name: string; color: string } | undefined
): TimelineAssignment {
	const end = parseLocalDate(a.endDate);
	end.setDate(end.getDate() + 1); // inclusive → end-exclusive
	return {
		id: a.id,
		resourceId: a.resourceId,
		startDate: parseLocalDate(a.startDate),
		endDate: end,
		label: project?.name,
		color: project?.color
	};
}

/**
 * ResourceTimeline の onMove / onResize 引数を DB 形式に戻す。
 * timeline は projectId を持たないため、変更前の DbAssignment と merge して projectId を保持する。
 */
export function fromTimelineAssignment(t: TimelineAssignment, prev: DbAssignment): DbAssignment {
	const end = new Date(t.endDate);
	end.setDate(end.getDate() - 1); // end-exclusive → inclusive
	return {
		...prev,
		resourceId: t.resourceId,
		startDate: formatLocalDate(t.startDate),
		endDate: formatLocalDate(end)
	};
}
