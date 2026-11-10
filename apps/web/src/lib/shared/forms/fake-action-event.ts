/**
 * form action のテスト用に、 `request.formData()` だけを持つ RequestEvent を作る。
 * 各 feature の `actions.server.test.ts` から使う。
 */
import type { RequestEvent } from '@sveltejs/kit';

export function makeEvent(form: Record<string, string>): RequestEvent {
	const data = new FormData();
	for (const [k, v] of Object.entries(form)) data.append(k, v);
	return { request: { formData: async () => data } } as unknown as RequestEvent;
}

/** 同じ key を繰り返す form (一括操作の ids) 用。 */
export function makeEntriesEvent(entries: [string, string][]): RequestEvent {
	const data = new FormData();
	for (const [k, v] of entries) data.append(k, v);
	return { request: { formData: async () => data } } as unknown as RequestEvent;
}
