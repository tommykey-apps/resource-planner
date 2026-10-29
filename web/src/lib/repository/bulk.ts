/**
 * 一括削除の共通処理。 1 件ごとに原子的な cascade delete (`deleteResource` / `deleteProject`) を呼ぶ。
 * 関連アサインを含めると 1 トランザクションの上限 (TransactWriteItems 100 項目) を超えうるため、
 * 全体を 1 トランザクションにはしない。 途中で失敗しても成功分は消えているので、
 * 失敗した id を返して呼び出し側から利用者に伝える。
 */
export type BulkDeleteResult = { deleted: string[]; failed: string[] };

export async function deleteEach(
	ids: string[],
	deleteOne: (id: string) => Promise<void>
): Promise<BulkDeleteResult> {
	const result: BulkDeleteResult = { deleted: [], failed: [] };
	for (const id of ids) {
		try {
			await deleteOne(id);
			result.deleted.push(id);
		} catch (e) {
			console.error(`bulk delete: failed to delete ${id}`, e);
			result.failed.push(id);
		}
	}
	return result;
}
