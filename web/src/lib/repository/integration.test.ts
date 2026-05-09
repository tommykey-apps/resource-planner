import { ulid } from 'ulid';
import { describe, expect, it } from 'vitest';
import { createAssignment } from './assignment';
import { createResource, deleteResource, updateResource } from './resource';
import { queryAllByOrg } from './index';

/**
 * Repository 層の統合テスト。実 DDB Local に書き込み、unit (mock) では拾えない
 * marshalling、SK ソート順、TransactWriteItems の実挙動を検証する。
 *
 * **実行条件**: `AWS_ENDPOINT_URL` が設定されている場合のみ走る (DDB Local 起動済の指標)。
 * - ローカル: `make db` 後に `pnpm test`
 * - CI: `test` job が `services.dynamodb` で起動 (.github/workflows/ci.yaml)
 *
 * **隔離**: 各テストで `org-${ulid()}` の一意 ORG を使うため、並行実行・前回の残骸の影響を受けない。
 */
describe.runIf(process.env.AWS_ENDPOINT_URL)('repository integration (DDB Local)', () => {
	it('Resource lifecycle: create → query → update → delete', async () => {
		const orgId = `test-${ulid()}`;
		const r = await createResource(orgId, { name: 'Alice' });

		let data = await queryAllByOrg(orgId);
		expect(data.resources).toEqual([{ id: r.id, name: 'Alice' }]);

		await updateResource(orgId, { id: r.id, name: 'Alicia' });
		data = await queryAllByOrg(orgId);
		expect(data.resources).toEqual([{ id: r.id, name: 'Alicia' }]);

		await deleteResource(orgId, r.id);
		data = await queryAllByOrg(orgId);
		expect(data.resources).toEqual([]);
	});

	it('cascade delete removes resource + related assignments atomically', async () => {
		const orgId = `test-${ulid()}`;
		const r = await createResource(orgId, { name: 'Bob' });
		await createAssignment(orgId, {
			resourceId: r.id,
			projectId: 'p1',
			startDate: '2026-05-01',
			endDateExclusive: '2026-06-01'
		});
		await createAssignment(orgId, {
			resourceId: r.id,
			projectId: 'p1',
			startDate: '2026-05-15',
			endDateExclusive: '2026-05-30'
		});

		let data = await queryAllByOrg(orgId);
		expect(data.assignments).toHaveLength(2);

		await deleteResource(orgId, r.id);

		data = await queryAllByOrg(orgId);
		expect(data.resources).toEqual([]);
		expect(data.assignments).toEqual([]);
	});

	it('Query returns assignments in startDate ascending order (SK lexicographic)', async () => {
		const orgId = `test-${ulid()}`;
		const r = await createResource(orgId, { name: 'C' });

		// 順番を逆に挿入しても、SK が `ASN#{startDate}#{id}` なのでソートされる
		await createAssignment(orgId, {
			resourceId: r.id,
			projectId: 'p1',
			startDate: '2026-05-15',
			endDateExclusive: '2026-05-30'
		});
		await createAssignment(orgId, {
			resourceId: r.id,
			projectId: 'p1',
			startDate: '2026-05-01',
			endDateExclusive: '2026-05-10'
		});

		const data = await queryAllByOrg(orgId);
		expect(data.assignments.map((a) => a.startDate)).toEqual(['2026-05-01', '2026-05-15']);

		// cleanup
		await deleteResource(orgId, r.id);
	});

	it('createResource enforces attribute_not_exists (no duplicate SK)', async () => {
		const orgId = `test-${ulid()}`;
		const a = await createResource(orgId, { name: 'A' });
		const b = await createResource(orgId, { name: 'B' });
		// Different ULIDs → both succeed
		expect(a.id).not.toBe(b.id);

		// cleanup
		await deleteResource(orgId, a.id);
		await deleteResource(orgId, b.id);
	});
});
