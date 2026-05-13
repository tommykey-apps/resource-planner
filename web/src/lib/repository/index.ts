import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '$lib/db/client';
import { pk, SK_PREFIX } from './keys';
import type { TeamData, Resource, Project, ProjectLink, Assignment } from '$lib/types';

export * from './resource';
export * from './project';
export * from './assignment';
export * from './team';

/**
 * Team 内の全アプリデータ (Resource / Project / Assignment) を 1 query で取得する。
 *
 * Single Table Design のため `Query(pk = TEAM#X)` だけで 3 entity が混在で返る。
 * SK プレフィックスで振り分けて返す (access-patterns.md UC #1)。
 *
 * Team META / MEMBER#... は本関数の戻り値には含めない (App data only)。
 */
export async function queryAllByTeam(teamId: string): Promise<TeamData> {
	const data: TeamData = { resources: [], projects: [], assignments: [] };
	let lastKey: Record<string, unknown> | undefined;

	do {
		const out = await ddb.send(
			new QueryCommand({
				TableName: TABLE,
				KeyConditionExpression: 'pk = :pk',
				ExpressionAttributeValues: { ':pk': pk(teamId) },
				ExclusiveStartKey: lastKey
			})
		);

		for (const item of out.Items ?? []) {
			const sk = item.sk as string;
			if (sk.startsWith(SK_PREFIX.resource)) {
				// ADR 0010 「DDB read path 規約」: `as <Entity>` 全体キャスト禁止、 個別 cast に localize。
				// Resource は現状 required field のみだが、 将来 optional 追加時に TS error で
				// 気づけるよう同 pattern を踏む。
				const resource: Resource = {
					id: item.id as string,
					name: item.name as string
				};
				data.resources.push(resource);
			} else if (sk.startsWith(SK_PREFIX.project)) {
				// optional 属性 (description / tags / links) は spread + 条件分岐で type-safe に
				// 取り出す (#196)。 `as Project` 全体キャストは TS error を握り潰すので避け、
				// 個別 `as string` 等に localize して 「次回 field 追加時に型 error で気づける」
				// よう保つ。 ADR 0010 「DDB read path 規約」 参照。
				const project: Project = {
					id: item.id as string,
					name: item.name as string,
					color: item.color as string,
					...(typeof item.description === 'string' && item.description.length > 0
						? { description: item.description }
						: {}),
					...(Array.isArray(item.tags) && item.tags.length > 0
						? { tags: item.tags as string[] }
						: {}),
					...(Array.isArray(item.links) && item.links.length > 0
						? { links: item.links as ProjectLink[] }
						: {})
				};
				data.projects.push(project);
			} else if (sk.startsWith(SK_PREFIX.assignment)) {
				// ADR 0010 「DDB read path 規約」: `as <Entity>` 全体キャスト禁止、 個別 cast に localize。
				const assignment: Assignment = {
					id: item.id as string,
					resourceId: item.resourceId as string,
					projectId: item.projectId as string,
					startDate: item.startDate as string,
					endDateExclusive: item.endDateExclusive as string
				};
				data.assignments.push(assignment);
			}
			// META / MEMBER# は無視 (App data only)
		}

		lastKey = out.LastEvaluatedKey;
	} while (lastKey);

	return data;
}
