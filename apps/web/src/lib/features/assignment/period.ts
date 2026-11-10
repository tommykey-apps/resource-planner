import { formatLocalDate } from '$lib/shared/date/date';
import type { Assignment, DateString } from '@resource-planner/db/entities';

/**
 * アサインの期間 [startDate, endDateExclusive) が、 絞り込みの期間 [from, to] (両端を含む) と
 * 1 日でも重なるか。 from / to が空ならその側は制限しない。
 * YYYY-MM-DD は文字列の大小がそのまま日付の前後になる。
 */
export function overlapsPeriod(
	a: Pick<Assignment, 'startDate' | 'endDateExclusive'>,
	from: DateString,
	to: DateString
): boolean {
	if (from && a.endDateExclusive <= from) return false;
	if (to && a.startDate > to) return false;
	return true;
}

/** today を含む月の初日と末日 (host-local の暦日)。 */
export function currentMonthRange(today: Date): { from: DateString; to: DateString } {
	const y = today.getFullYear();
	const m = today.getMonth();
	return {
		from: formatLocalDate(new Date(y, m, 1)),
		// 翌月の 0 日目 = 今月の末日 (Date の自動正規化)
		to: formatLocalDate(new Date(y, m + 1, 0))
	};
}
