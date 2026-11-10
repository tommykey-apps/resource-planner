/**
 * 一覧の表 (メンバー / 案件) の絞り込み・並び替え・ページ送りを扱う純粋関数。
 *
 * 状態は URL query に持つ (SvelteKit 公式 state-management: URL を状態の置き場にする)。
 * assignments-url-state.ts と同じく parse / apply の往復を保証する。
 *
 * クエリパラメータ:
 *   - `q`: 名前などの部分一致
 *   - `sort`: 並び替える列 (画面ごとに許可した key のみ)
 *   - `dir`: `asc` | `desc`
 *   - `page`: 1 始まりのページ番号
 *
 * 既定値と同じ値は URL に書かない (共有 URL を短く保つ)。
 */

export type SortDir = 'asc' | 'desc';

export type ListQuery<K extends string> = {
	q: string;
	sort: K;
	dir: SortDir;
	page: number;
};

/**
 * 1 ページの行数。 DESIGN.md「一覧を10行で切らない」と、 業務画面は1画面に必要な情報を収める
 * 方針から 50 にする。
 */
export const PAGE_SIZE = 50;

export function parseListQuery<K extends string>(
	params: URLSearchParams,
	sortKeys: readonly K[],
	defaults: ListQuery<K>
): ListQuery<K> {
	const sort = params.get('sort');
	const dir = params.get('dir');
	const page = Number(params.get('page'));
	return {
		q: params.get('q') ?? defaults.q,
		sort: sortKeys.includes(sort as K) ? (sort as K) : defaults.sort,
		dir: dir === 'asc' || dir === 'desc' ? dir : defaults.dir,
		page: Number.isInteger(page) && page >= 1 ? page : defaults.page
	};
}

export function applyListQuery<K extends string>(
	url: URL,
	query: ListQuery<K>,
	defaults: ListQuery<K>
): URL {
	const next = new URL(url.toString());
	for (const key of ['q', 'sort', 'dir', 'page'] as const) {
		const v = String(query[key]);
		if (v === String(defaults[key])) next.searchParams.delete(key);
		else next.searchParams.set(key, v);
	}
	return next;
}

/** 見出しを押したときの次の並び順。 同じ列なら向きを反転し、 別の列なら昇順から始める。 */
export function nextSort<K extends string>(
	current: { sort: K; dir: SortDir },
	key: K
): { sort: K; dir: SortDir } {
	if (current.sort === key) return { sort: key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
	return { sort: key, dir: 'asc' };
}

/**
 * 安定ソート (Array.prototype.toSorted は ES2023 で安定性が仕様化済み)。
 * 文字列は Intl.Collator の numeric で「item2 < item10」の順にする。
 */
export function sortRows<T>(
	rows: readonly T[],
	value: (row: T) => string | number,
	dir: SortDir,
	locale: string
): T[] {
	const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
	const sign = dir === 'asc' ? 1 : -1;
	return rows.toSorted((a, b) => {
		const va = value(a);
		const vb = value(b);
		const c =
			typeof va === 'number' && typeof vb === 'number'
				? va - vb
				: collator.compare(String(va), String(vb));
		return c * sign;
	});
}

export function paginate<T>(
	rows: readonly T[],
	page: number
): { items: T[]; page: number; pageCount: number } {
	const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
	const current = Math.min(Math.max(1, page), pageCount);
	const start = (current - 1) * PAGE_SIZE;
	return { items: rows.slice(start, start + PAGE_SIZE), page: current, pageCount };
}
