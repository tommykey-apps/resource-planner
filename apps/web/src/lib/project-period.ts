import { currentMonthRange, overlapsPeriod } from './assignment-period';
import { formatLocalDate } from './date';
import type { Assignment, DateString } from './types';

/**
 * 案件一覧の期間の絞り込み (ADR 0016)。 案件は期間を持たないので、 選んだ期間と 1 日でも重なる
 * 割り当てを 1 件以上持つ案件を出す。 割り当てが 0 件の案件は「すべて」でだけ出る。
 */
export const PROJECT_PERIODS = ['today', 'month', 'year', 'all'] as const;
export type ProjectPeriod = (typeof PROJECT_PERIODS)[number];

/** URL にキーがないとき、 不正な値のときの期間。 */
export const DEFAULT_PROJECT_PERIOD: ProjectPeriod = 'month';

export function parseProjectPeriod(value: string): ProjectPeriod {
	return (PROJECT_PERIODS as readonly string[]).includes(value)
		? (value as ProjectPeriod)
		: DEFAULT_PROJECT_PERIOD;
}

/** 期間の初日と最終日 (両端を含む、 host-local の暦日)。 「すべて」は `null`。 */
export function periodRange(
	period: ProjectPeriod,
	today: Date
): { from: DateString; to: DateString } | null {
	switch (period) {
		case 'today': {
			const d = formatLocalDate(today);
			return { from: d, to: d };
		}
		case 'month':
			return currentMonthRange(today);
		case 'year': {
			const y = today.getFullYear();
			return { from: formatLocalDate(new Date(y, 0, 1)), to: formatLocalDate(new Date(y, 11, 31)) };
		}
		case 'all':
			return null;
	}
}

/** 期間に重なる割り当てを持つ案件の id。 「すべて」は `null` (呼び出し側は絞らない)。 */
export function projectIdsInPeriod(
	assignments: Pick<Assignment, 'projectId' | 'startDate' | 'endDateExclusive'>[],
	period: ProjectPeriod,
	today: Date
): Set<string> | null {
	const range = periodRange(period, today);
	if (!range) return null;
	return new Set(
		assignments.filter((a) => overlapsPeriod(a, range.from, range.to)).map((a) => a.projectId)
	);
}
