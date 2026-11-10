import { describe, expect, it } from 'vitest';
// scripts/ の one-off 移行スクリプトの純粋ロジックを検証する (ADR 0012)。
import { planAssignmentKeyMigration } from '../../../scripts/migrate-assignment-keys.mjs';

const legacy = {
	pk: 'TEAM#team_default',
	sk: 'ASN#2026-05-01#a1',
	id: 'a1',
	resourceId: 'r1',
	projectId: 'p1',
	startDate: '2026-05-01',
	endDateExclusive: '2026-06-01'
};

const stable = {
	pk: 'TEAM#team_default',
	sk: 'ASN#a1',
	id: 'a1',
	resourceId: 'r1',
	projectId: 'p1',
	startDate: '2026-05-01',
	endDateExclusive: '2026-06-01',
	version: 1
};

describe('planAssignmentKeyMigration (ADR 0012)', () => {
	it('forward: legacy ASN#{startDate}#{id} → ASN#{id} + version=1, 属性を保持', () => {
		const plan = planAssignmentKeyMigration([legacy]);
		expect(plan).toHaveLength(1);
		expect(plan[0].oldSk).toBe('ASN#2026-05-01#a1');
		expect(plan[0].newSk).toBe('ASN#a1');
		expect(plan[0].newItem).toMatchObject({
			pk: 'TEAM#team_default',
			sk: 'ASN#a1',
			id: 'a1',
			resourceId: 'r1',
			projectId: 'p1',
			startDate: '2026-05-01',
			endDateExclusive: '2026-06-01',
			version: 1
		});
	});

	it('forward idempotent: 既に安定キーの item は対象外', () => {
		expect(planAssignmentKeyMigration([stable])).toHaveLength(0);
	});

	it('rollback: ASN#{id} → ASN#{startDate}#{id}, version 属性を drop', () => {
		const plan = planAssignmentKeyMigration([stable], { rollback: true });
		expect(plan).toHaveLength(1);
		expect(plan[0].oldSk).toBe('ASN#a1');
		expect(plan[0].newSk).toBe('ASN#2026-05-01#a1');
		expect(plan[0].newItem).not.toHaveProperty('version');
		expect(plan[0].newItem.startDate).toBe('2026-05-01');
	});

	it('rollback idempotent: 既に legacy 形式の item は対象外', () => {
		expect(planAssignmentKeyMigration([legacy], { rollback: true })).toHaveLength(0);
	});

	it('round-trip: forward → rollback で元の SK / 形状に戻る', () => {
		const forward = planAssignmentKeyMigration([legacy]);
		const migrated = forward[0].newItem;
		const back = planAssignmentKeyMigration([migrated], { rollback: true });
		expect(back).toHaveLength(1);
		expect(back[0].newSk).toBe(legacy.sk);
		expect(back[0].newItem).not.toHaveProperty('version');
		expect(back[0].newItem).toMatchObject({
			pk: legacy.pk,
			sk: legacy.sk,
			id: 'a1',
			startDate: '2026-05-01',
			endDateExclusive: '2026-06-01'
		});
	});

	it('rollback は startDate 属性が無い安定 item をスキップ (復元不能なため)', () => {
		const noStart = { pk: 'TEAM#t', sk: 'ASN#x', id: 'x' };
		expect(planAssignmentKeyMigration([noStart], { rollback: true })).toHaveLength(0);
	});
});
