/**
 * Team / TeamMembership repository (#81)。
 *
 * - 1 team = アプリデータの所有単位 (旧 Clerk Org 相当)。default `team_default` のみ運用、
 *   将来 multi-team 対応の構造を最初から導入。
 * - membership は 2 ファセット格納 (Single Table Design):
 *   - team-centric: pk = TEAM#{teamId}, sk = MEMBER#{userId}  ← Team のメンバー一覧
 *   - user-centric (GSI1): GSI1PK = USER#{userId}, GSI1SK = TEAM#{teamId}  ← User の所属 team 一覧
 *   1 PutCommand で両ファセット (= 1 item with GSI1 attributes) を書ける。
 */
import {
	GetCommand,
	PutCommand,
	QueryCommand,
	type QueryCommandInput
} from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '$lib/db/client';
import type { Team, TeamMembership } from '$lib/types';
import { pk, teamMembershipSk, teamMetaSk, userTeamsGsi1pk, userTeamsGsi1sk } from './keys';

export const DEFAULT_TEAM_ID = 'team_default';

/** Team を作成 (idempotent: 既存なら成功扱い)。 */
export async function getOrCreateDefaultTeam(): Promise<Team> {
	const existing = await getTeam(DEFAULT_TEAM_ID);
	if (existing) return existing;

	const team: Team = {
		id: DEFAULT_TEAM_ID,
		name: 'Default Team',
		createdAt: new Date().toISOString()
	};
	try {
		await ddb.send(
			new PutCommand({
				TableName: TABLE,
				Item: { pk: pk(team.id), sk: teamMetaSk(), ...team },
				ConditionExpression: 'attribute_not_exists(sk)'
			})
		);
	} catch (e) {
		// 競合: 別プロセスが先に作った場合は再 read で確定値を返す
		const c = e as { name?: string };
		if (c.name === 'ConditionalCheckFailedException') {
			const reread = await getTeam(team.id);
			if (reread) return reread;
		}
		throw e;
	}
	return team;
}

export async function getTeam(teamId: string): Promise<Team | undefined> {
	const out = await ddb.send(
		new GetCommand({ TableName: TABLE, Key: { pk: pk(teamId), sk: teamMetaSk() } })
	);
	if (!out.Item) return undefined;
	return { id: out.Item.id, name: out.Item.name, createdAt: out.Item.createdAt };
}

/**
 * User を Team に追加 (idempotent: 既に member なら成功扱い)。
 *
 * Single PutItem で team-centric SK と user-centric GSI1 を同時設定する。
 */
export async function addMembership(
	teamId: string,
	userId: string,
	role: 'admin' | 'member' = 'member'
): Promise<TeamMembership> {
	const membership: TeamMembership = {
		teamId,
		userId,
		role,
		joinedAt: new Date().toISOString()
	};
	await ddb.send(
		new PutCommand({
			TableName: TABLE,
			Item: {
				pk: pk(teamId),
				sk: teamMembershipSk(userId),
				GSI1PK: userTeamsGsi1pk(userId),
				GSI1SK: userTeamsGsi1sk(teamId),
				...membership
			}
		})
	);
	return membership;
}

/** User の所属 team 一覧を GSI1 経由で取得。 */
export async function getUserTeamIds(userId: string): Promise<string[]> {
	const teamIds: string[] = [];
	let lastKey: QueryCommandInput['ExclusiveStartKey'];
	do {
		const out = await ddb.send(
			new QueryCommand({
				TableName: TABLE,
				IndexName: 'GSI1',
				KeyConditionExpression: 'GSI1PK = :u AND begins_with(GSI1SK, :t)',
				ExpressionAttributeValues: {
					':u': userTeamsGsi1pk(userId),
					':t': 'TEAM#'
				},
				ProjectionExpression: 'teamId',
				ExclusiveStartKey: lastKey
			})
		);
		for (const item of out.Items ?? []) {
			if (typeof item.teamId === 'string') teamIds.push(item.teamId);
		}
		lastKey = out.LastEvaluatedKey;
	} while (lastKey);
	return teamIds;
}
