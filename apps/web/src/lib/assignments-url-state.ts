/**
 * /assignments page の filter と URL query の双方向変換 (#100)。
 *
 * timeline-url-state.ts と同 pattern: parse / apply の純粋関数で roundtrip 保証。
 *
 * クエリパラメータ:
 *   - `q`: free text 検索 (resource name / project name に match)
 *   - `resourceId`: 特定 resource で絞る
 *   - `projectId`: 特定 project で絞る
 *   - `departmentId`: 部署 (子孫含む) で絞る。 `__unassigned__` で未所属 (#242)
 *   - `from` / `to`: YYYY-MM-DD、期間の初日と最終日 (両端を含む)。 アサインの期間と重なれば表示する。
 *     両方のキーがなければ今月にする。 空のキー (`from=&to=`) は利用者が制限なしを選んだ印として
 *     残し、 再読み込みで今月に戻さない (部署の `__all__` と同じ考え方、 ADR 0015)
 */
import { currentMonthRange } from './assignment-period';

export type AssignmentFilters = {
	q: string;
	resourceId: string;
	projectId: string;
	departmentId: string;
	from: string;
	to: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function readDate(params: URLSearchParams, key: string): string {
	const v = params.get(key);
	if (!v) return '';
	return DATE_RE.test(v) ? v : '';
}

export function parseAssignmentParams(params: URLSearchParams, today: Date): AssignmentFilters {
	const period =
		params.has('from') || params.has('to')
			? { from: readDate(params, 'from'), to: readDate(params, 'to') }
			: currentMonthRange(today);
	return {
		q: params.get('q') ?? '',
		resourceId: params.get('resourceId') ?? '',
		projectId: params.get('projectId') ?? '',
		departmentId: params.get('departmentId') ?? '',
		...period
	};
}

export function applyAssignmentParams(url: URL, filters: AssignmentFilters): URL {
	const next = new URL(url.toString());
	const setOrDelete = (key: keyof AssignmentFilters) => {
		const v = filters[key];
		if (v) next.searchParams.set(key, v);
		else next.searchParams.delete(key);
	};
	setOrDelete('q');
	setOrDelete('resourceId');
	setOrDelete('projectId');
	setOrDelete('departmentId');
	next.searchParams.set('from', filters.from);
	next.searchParams.set('to', filters.to);
	return next;
}
