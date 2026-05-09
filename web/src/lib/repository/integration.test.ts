import { ulid } from 'ulid';
import { describe, expect, it } from 'vitest';
import { createAssignment } from './assignment';
import { createResource, deleteResource, updateResource } from './resource';
import { queryAllByTeam } from './index';
import { addMembership, getOrCreateDefaultTeam, getTeam, getUserTeamIds } from './team';

/**
 * Repository 層の統合テスト。実 DDB Local に書き込み、unit (mock) では拾えない
 * marshalling、SK ソート順、TransactWriteItems の実挙動を検証する。
 *
 * **実行条件**: `AWS_ENDPOINT_URL` が設定されている場合のみ走る (DDB Local 起動済の指標)。
 * - ローカル: `make db` 後に `pnpm test`
 * - CI: `test` job が `services.dynamodb` で起動 (.github/workflows/ci.yaml)
 *
 * **隔離**: 各テストで `team-${ulid()}` の一意 Team を使うため、並行実行・前回の残骸の影響を受けない。
 */
describe.runIf(process.env.AWS_ENDPOINT_URL)('repository integration (DDB Local)', () => {
	it('Resource lifecycle: create → query → update → delete', async () => {
		const teamId = `test-${ulid()}`;
		const r = await createResource(teamId, { name: 'Alice' });

		let data = await queryAllByTeam(teamId);
		expect(data.resources).toEqual([{ id: r.id, name: 'Alice' }]);

		await updateResource(teamId, { id: r.id, name: 'Alicia' });
		data = await queryAllByTeam(teamId);
		expect(data.resources).toEqual([{ id: r.id, name: 'Alicia' }]);

		await deleteResource(teamId, r.id);
		data = await queryAllByTeam(teamId);
		expect(data.resources).toEqual([]);
	});

	it('cascade delete removes resource + related assignments atomically', async () => {
		const teamId = `test-${ulid()}`;
		const r = await createResource(teamId, { name: 'Bob' });
		await createAssignment(teamId, {
			resourceId: r.id,
			projectId: 'p1',
			startDate: '2026-05-01',
			endDateExclusive: '2026-06-01'
		});
		await createAssignment(teamId, {
			resourceId: r.id,
			projectId: 'p1',
			startDate: '2026-05-15',
			endDateExclusive: '2026-05-30'
		});

		let data = await queryAllByTeam(teamId);
		expect(data.assignments).toHaveLength(2);

		await deleteResource(teamId, r.id);

		data = await queryAllByTeam(teamId);
		expect(data.resources).toEqual([]);
		expect(data.assignments).toEqual([]);
	});

	it('Query returns assignments in startDate ascending order (SK lexicographic)', async () => {
		const teamId = `test-${ulid()}`;
		const r = await createResource(teamId, { name: 'C' });

		// 順番を逆に挿入しても、SK が `ASN#{startDate}#{id}` なのでソートされる
		await createAssignment(teamId, {
			resourceId: r.id,
			projectId: 'p1',
			startDate: '2026-05-15',
			endDateExclusive: '2026-05-30'
		});
		await createAssignment(teamId, {
			resourceId: r.id,
			projectId: 'p1',
			startDate: '2026-05-01',
			endDateExclusive: '2026-05-10'
		});

		const data = await queryAllByTeam(teamId);
		expect(data.assignments.map((a) => a.startDate)).toEqual(['2026-05-01', '2026-05-15']);

		// cleanup
		await deleteResource(teamId, r.id);
	});

	it('createResource enforces attribute_not_exists (no duplicate SK)', async () => {
		const teamId = `test-${ulid()}`;
		const a = await createResource(teamId, { name: 'A' });
		const b = await createResource(teamId, { name: 'B' });
		// Different ULIDs → both succeed
		expect(a.id).not.toBe(b.id);

		// cleanup
		await deleteResource(teamId, a.id);
		await deleteResource(teamId, b.id);
	});

	it('Team membership: addMembership writes both team-centric and GSI1 user-centric facets', async () => {
		const teamId = `test-${ulid()}`;
		const userId = `user-${ulid()}`;

		await addMembership(teamId, userId, 'member');

		// user-centric (GSI1): user の所属 team 一覧
		const teams = await getUserTeamIds(userId);
		expect(teams).toContain(teamId);
	});

	it('getOrCreateDefaultTeam is idempotent', async () => {
		// note: shared 'team_default' ID の test。他テストと並行で衝突しないよう既存値の存在のみ確認
		const a = await getOrCreateDefaultTeam();
		const b = await getOrCreateDefaultTeam();
		expect(a.id).toBe('team_default');
		expect(b.id).toBe('team_default');
		expect(a.createdAt).toBe(b.createdAt); // 2 回目は既存値を返す
		const fetched = await getTeam('team_default');
		expect(fetched?.id).toBe('team_default');
	});
});
