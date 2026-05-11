/**
 * /assignments page の filter と URL query の双方向変換 (#100)。
 *
 * timeline-url-state.ts と同 pattern: parse / apply の純粋関数で roundtrip 保証。
 *
 * クエリパラメータ:
 *   - `q`: free text 検索 (resource name / project name に match)
 *   - `resourceId`: 特定 resource で絞る
 *   - `projectId`: 特定 project で絞る
 *   - `from`: YYYY-MM-DD、開始日下限
 *   - `to`: YYYY-MM-DD、開始日上限 (inclusive)
 */

export type AssignmentFilters = {
	q: string;
	resourceId: string;
	projectId: string;
	from: string;
	to: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function readDate(params: URLSearchParams, key: string): string {
	const v = params.get(key);
	if (!v) return '';
	return DATE_RE.test(v) ? v : '';
}

export function parseAssignmentParams(params: URLSearchParams): AssignmentFilters {
	return {
		q: params.get('q') ?? '',
		resourceId: params.get('resourceId') ?? '',
		projectId: params.get('projectId') ?? '',
		from: readDate(params, 'from'),
		to: readDate(params, 'to')
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
	setOrDelete('from');
	setOrDelete('to');
	return next;
}
