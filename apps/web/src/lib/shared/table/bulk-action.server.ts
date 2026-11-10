/**
 * 表で選んだ行への一括操作 (form action) の共通部分。メンバーと案件の一括削除・一括変更が使う。
 */
import { fail } from '@sveltejs/kit';

/** 一括操作の form は ids を繰り返して送るので getAll で読む。 */
export function readBulkInput(formData: FormData): Record<string, unknown> {
	return { ...Object.fromEntries(formData), ids: formData.getAll('ids') };
}

/**
 * 一括削除の結果を返す。 1 件ごとに原子的に削除するので、 一部失敗しても成功分は消えている。
 * 失敗があれば fail(500) にして client が件数を利用者に伝えられるようにする。
 */
export function bulkDeleteResult(result: { deleted: string[]; failed: string[] }) {
	return result.failed.length > 0 ? fail(500, result) : result;
}
