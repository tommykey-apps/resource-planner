/**
 * ADR 0016: 既存の案件 (Project) に部署を入れる移行スクリプト (one-off)。
 *
 * 決め方: 案件の割り当て (Assignment) ごとに、 メンバー (Resource) の今の部署を 1 票として数え、
 * 最多の部署を入れる。 未所属のメンバーは数えない。 次の案件は入れずに一覧に出し、 人が決める:
 *   - tie          : 最多の部署が同数で並んだ
 *   - noAssignments: 割り当てが 0 件
 *   - noDepartment : 割り当てられた全員が未所属
 *
 * 部署が入っている案件は対象外 (何度実行しても同じ結果)。 書き込みは
 * `attribute_exists(sk) AND attribute_not_exists(departmentId)` 付きの UpdateItem で、
 * 実行中に誰かが部署を入れた案件は上書きしない。
 *
 * **実行前に必ずオンデマンドバックアップを取得すること** (ADR 0016 Implementation notes):
 *   aws dynamodb create-backup --table-name <table> --backup-name pre-project-department-<date>
 *
 * env:  DYNAMODB_TABLE (必須) / AWS_REGION / AWS_ENDPOINT_URL (DDB Local 用、任意)
 * 使い方 (packages/db で実行): node migrations/migrate-project-departments.mjs [--dry-run] [--team team_default]
 */
import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

/**
 * 部署を入れる案件と、 決まらない案件を分ける純粋関数 (副作用なし = テスト容易)。
 *
 * @param {Array<{ id: string, name: string, departmentId?: string }>} projects
 * @param {Array<{ projectId: string, resourceId: string }>} assignments
 * @param {Array<{ id: string, departmentId?: string }>} resources
 */
export function planProjectDepartments(projects, assignments, resources) {
	/** @type {Map<string, string>} */
	const deptOfResource = new Map();
	for (const r of resources) if (r.departmentId) deptOfResource.set(r.id, r.departmentId);

	/** @type {Map<string, Map<string, number>>} 案件 id → (部署 id → 票数) */
	const votes = new Map();
	/** @type {Map<string, number>} 案件 id → 割り当て件数 */
	const assignmentCount = new Map();
	for (const a of assignments) {
		assignmentCount.set(a.projectId, (assignmentCount.get(a.projectId) ?? 0) + 1);
		const dept = deptOfResource.get(a.resourceId);
		if (!dept) continue;
		const byDept = votes.get(a.projectId) ?? new Map();
		byDept.set(dept, (byDept.get(dept) ?? 0) + 1);
		votes.set(a.projectId, byDept);
	}

	/** @type {Array<{ projectId: string, name: string, departmentId: string, votes: number, total: number }>} */
	const assign = [];
	/** @type {Array<{ projectId: string, name: string, reason: 'tie' | 'noAssignments' | 'noDepartment' }>} */
	const undecided = [];
	for (const p of projects) {
		if (p.departmentId) continue;
		const total = assignmentCount.get(p.id) ?? 0;
		if (total === 0) {
			undecided.push({ projectId: p.id, name: p.name, reason: 'noAssignments' });
			continue;
		}
		const byDept = votes.get(p.id);
		if (!byDept) {
			undecided.push({ projectId: p.id, name: p.name, reason: 'noDepartment' });
			continue;
		}
		const max = Math.max(...byDept.values());
		const top = [...byDept].filter(([, n]) => n === max);
		if (top.length > 1) {
			undecided.push({ projectId: p.id, name: p.name, reason: 'tie' });
			continue;
		}
		assign.push({ projectId: p.id, name: p.name, departmentId: top[0][0], votes: max, total });
	}
	return { assign, undecided };
}

/**
 * 1 team 分の item を sk の接頭辞で Query して全取得する (pagination 対応)。
 * @param {DynamoDBDocumentClient} ddb
 * @param {string} table
 * @param {string} teamId
 * @param {string} prefix
 */
async function queryByPrefix(ddb, table, teamId, prefix) {
	/** @type {Array<Record<string, any>>} */
	const items = [];
	/** @type {Record<string, any> | undefined} */
	let lastKey;
	do {
		const out = await ddb.send(
			new QueryCommand({
				TableName: table,
				KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
				ExpressionAttributeValues: { ':pk': `TEAM#${teamId}`, ':prefix': prefix },
				ExclusiveStartKey: lastKey
			})
		);
		for (const item of out.Items ?? []) items.push(item);
		lastKey = out.LastEvaluatedKey;
	} while (lastKey);
	return items;
}

/**
 * 移行を実行する (dry-run なら書き込みなし)。
 * @param {{ ddb: DynamoDBDocumentClient, table: string, teamId: string, dryRun?: boolean, log?: (msg: string) => void }} opts
 */
export async function runMigration({ ddb, table, teamId, dryRun = false, log = console.log }) {
	const [projects, assignments, resources, departments] = await Promise.all([
		queryByPrefix(ddb, table, teamId, 'PRJ#'),
		queryByPrefix(ddb, table, teamId, 'ASN#'),
		queryByPrefix(ddb, table, teamId, 'RES#'),
		queryByPrefix(ddb, table, teamId, 'DEPT#')
	]);
	const deptName = new Map(departments.map((d) => [d.id, d.name]));
	const { assign, undecided } = planProjectDepartments(
		/** @type {any} */ (projects),
		/** @type {any} */ (assignments),
		/** @type {any} */ (resources)
	);

	log(
		`[migrate-project-departments] team=${teamId} projects=${projects.length} ` +
			`assign=${assign.length} undecided=${undecided.length} dryRun=${dryRun}`
	);
	for (const a of assign) {
		log(
			`  ${a.name}  ->  ${deptName.get(a.departmentId) ?? a.departmentId}  (${a.votes}/${a.total})`
		);
	}
	for (const u of undecided) log(`  [undecided:${u.reason}] ${u.name}`);

	if (dryRun) return { assigned: 0, planned: assign.length, undecided: undecided.length };

	let assigned = 0;
	let skipped = 0;
	for (const a of assign) {
		try {
			await ddb.send(
				new UpdateCommand({
					TableName: table,
					Key: { pk: `TEAM#${teamId}`, sk: `PRJ#${a.projectId}` },
					UpdateExpression: 'SET departmentId = :d',
					ConditionExpression: 'attribute_exists(sk) AND attribute_not_exists(departmentId)',
					ExpressionAttributeValues: { ':d': a.departmentId }
				})
			);
			assigned++;
		} catch (e) {
			// 実行中に削除された / 誰かが部署を入れた案件は飛ばす。
			if (e instanceof ConditionalCheckFailedException) {
				skipped++;
				log(`  [skipped] ${a.name}`);
				continue;
			}
			throw e;
		}
	}
	log(`[migrate-project-departments] done: assigned=${assigned} skipped=${skipped}`);
	return { assigned, planned: assign.length, undecided: undecided.length };
}

/**
 * CLI 引数を最小限パースする。
 * @param {string[]} argv
 */
function parseArgs(argv) {
	const args = { dryRun: false, teamId: 'team_default' };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--dry-run') args.dryRun = true;
		else if (argv[i] === '--team') args.teamId = argv[++i];
	}
	return args;
}

async function main() {
	const table = process.env.DYNAMODB_TABLE;
	if (!table) {
		console.error('DYNAMODB_TABLE env is required');
		process.exit(1);
	}
	const { dryRun, teamId } = parseArgs(process.argv.slice(2));
	const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
	await runMigration({ ddb, table, teamId, dryRun });
}

// 直接実行されたときだけ main を走らせる (import 時は実行しない = テスト可能)。
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	main().catch((e) => {
		console.error(e);
		process.exit(1);
	});
}
