import { describe, expect, it } from 'vitest';
import {
	SK_PREFIX,
	assignmentSk,
	pk,
	projectSk,
	resourceSk,
	teamMembershipSk,
	teamMetaSk,
	userMetaSk,
	userPk,
	userTeamsGsi1pk,
	userTeamsGsi1sk
} from './keys';

/**
 * DynamoDB Single Table Design のキー組立は **DB スキーマの contract**。
 * 文字列フォーマットを変えると既存データの読み出しが壊れる + GSI1 で逆引きが効かなくなる。
 * 純粋関数なのでここで literal を assert して、 リネーム / プレフィックス変更を検知できるようにする。
 */
describe('repository/keys (#81 single table design)', () => {
	describe('Team scope pk/sk', () => {
		it('pk(teamId) → "TEAM#{teamId}"', () => {
			expect(pk('team_default')).toBe('TEAM#team_default');
			expect(pk('t-123')).toBe('TEAM#t-123');
		});

		it('teamMetaSk() → "META"', () => {
			expect(teamMetaSk()).toBe('META');
		});

		it('resourceSk(id) → "RES#{id}"', () => {
			expect(resourceSk('01HX')).toBe('RES#01HX');
			expect(resourceSk('')).toBe('RES#');
		});

		it('projectSk(id) → "PRJ#{id}"', () => {
			expect(projectSk('01PRJ')).toBe('PRJ#01PRJ');
		});

		it('assignmentSk(startDate, id) → "ASN#{startDate}#{id}" (date 先頭で sort 可能)', () => {
			expect(assignmentSk('2026-05-01', '01ASN')).toBe('ASN#2026-05-01#01ASN');
			// startDate のフォーマットが ISO ならソート可能 (access-patterns.md A3 の前提)
			expect(assignmentSk('2026-01-01', 'a').localeCompare(assignmentSk('2026-12-31', 'b'))).toBeLessThan(0);
		});

		it('teamMembershipSk(userId) → "MEMBER#{userId}"', () => {
			expect(teamMembershipSk('u1')).toBe('MEMBER#u1');
		});
	});

	describe('User scope (Auth.js DDB adapter と共存)', () => {
		it('userPk(userId) → "USER#{userId}"', () => {
			expect(userPk('u1')).toBe('USER#u1');
		});

		it('userMetaSk() → "META"', () => {
			expect(userMetaSk()).toBe('META');
		});
	});

	describe('GSI1 — user の team 一覧逆引き', () => {
		it('userTeamsGsi1pk(userId) → "USER#{userId}"', () => {
			expect(userTeamsGsi1pk('u1')).toBe('USER#u1');
		});

		it('userTeamsGsi1sk(teamId) → "TEAM#{teamId}"', () => {
			expect(userTeamsGsi1sk('team_default')).toBe('TEAM#team_default');
		});

		it('GSI1 の begins_with(GSI1SK, "TEAM#") で user の team 一覧が引ける', () => {
			const gsi1sks = ['team_default', 't-2', 't-3'].map(userTeamsGsi1sk);
			for (const sk of gsi1sks) {
				expect(sk.startsWith('TEAM#')).toBe(true);
			}
		});
	});

	describe('SK_PREFIX 定数の不変性', () => {
		it('entities.md と一致する prefix 値', () => {
			// この値が変わると既存 DDB データ全件 migration が必要。 contract として固定。
			expect(SK_PREFIX).toEqual({
				resource: 'RES#',
				project: 'PRJ#',
				assignment: 'ASN#',
				teamMember: 'MEMBER#'
			});
		});

		it('Auth.js entity prefix (USER#, SESSION#, VERIFICATION#, ACCOUNT#) と衝突しない', () => {
			const appPrefixes = Object.values(SK_PREFIX);
			const authPrefixes = ['USER#', 'SESSION#', 'VERIFICATION#', 'ACCOUNT#'];
			for (const a of appPrefixes) {
				for (const b of authPrefixes) {
					expect(a.startsWith(b)).toBe(false);
					expect(b.startsWith(a)).toBe(false);
				}
			}
		});
	});
});
