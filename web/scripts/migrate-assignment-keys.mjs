/**
 * ADR 0012: assignment の SK 移行スクリプト (one-off)。
 *
 *   forward (default): `ASN#{startDate}#{id}` → `ASN#{id}` + `version=1`
 *   --rollback       : `ASN#{id}` (+startDate 属性) → `ASN#{startDate}#{id}` (version 属性 drop)
 *   --dry-run        : 変更内容を出力するだけ (forward / rollback 両対応)
 *
 * forward / rollback とも idempotent (既に目的形式の item は対象外)。 各 item は
 * TransactWrite (新 Put + 旧 Delete) で原子的に書き換える。
 *
 * **実行前に必ずオンデマンドバックアップを取得すること** (runbook: README / ADR 0012):
 *   aws dynamodb create-backup --table-name <table> --backup-name pre-assignment-key-migration-<date>
 *
 * env:  DYNAMODB_TABLE (必須) / AWS_REGION / AWS_ENDPOINT_URL (DDB Local 用、任意)
 * 使い方: node scripts/migrate-assignment-keys.mjs [--rollback] [--dry-run] [--team team_default]
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
	DynamoDBDocumentClient,
	QueryCommand,
	TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';

/** `ASN#{startDate}#{id}` (旧形式)。 */
const LEGACY_SK = /^ASN#\d{4}-\d{2}-\d{2}#/;
/** `ASN#{id}` (ADR 0012 安定キー)。 # を 1 つだけ含む。 */
const STABLE_SK = /^ASN#[^#]+$/;

/**
 * 取得済 item 群から書き換え計画を作る純粋関数 (副作用なし = テスト容易)。
 *
 * @param {Array<Record<string, any>>} items - Query で得た ASN# item 群
 * @param {{ rollback?: boolean }} [opts]
 * @returns {Array<{ pk: unknown, oldSk: string, newSk: string, newItem: Record<string, any> }>}
 */
export function planAssignmentKeyMigration(items, { rollback = false } = {}) {
	const plan = [];
	for (const item of items) {
		const sk = item.sk;
		if (typeof sk !== 'string') continue;

		if (!rollback) {
			// forward: 旧形式のみ対象 (既に安定キーの item は触らない = idempotent)
			if (!LEGACY_SK.test(sk)) continue;
			const newSk = `ASN#${item.id}`;
			const newItem = {
				...item,
				sk: newSk,
				version: typeof item.version === 'number' ? item.version : 1
			};
			plan.push({ pk: item.pk, oldSk: sk, newSk, newItem });
		} else {
			// rollback: 安定キー + startDate 属性あり が対象
			if (!STABLE_SK.test(sk) || typeof item.startDate !== 'string') continue;
			const newSk = `ASN#${item.startDate}#${item.id}`;
			// object spread は index signature を落とすため Record 注釈で delete を許可する。
			/** @type {Record<string, any>} */
			const newItem = { ...item, sk: newSk };
			delete newItem.version;
			plan.push({ pk: item.pk, oldSk: sk, newSk, newItem });
		}
	}
	return plan;
}

/**
 * 1 team 分の ASN# item を Query で全取得する (pagination 対応)。
 * @param {DynamoDBDocumentClient} ddb
 * @param {string} table
 * @param {string} teamId
 */
async function queryAssignments(ddb, table, teamId) {
	/** @type {Array<Record<string, any>>} */
	const items = [];
	/** @type {Record<string, any> | undefined} */
	let lastKey;
	do {
		const out = await ddb.send(
			new QueryCommand({
				TableName: table,
				KeyConditionExpression: 'pk = :pk AND begins_with(sk, :asn)',
				ExpressionAttributeValues: { ':pk': `TEAM#${teamId}`, ':asn': 'ASN#' },
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
 * @param {{ ddb: DynamoDBDocumentClient, table: string, teamId: string, rollback?: boolean, dryRun?: boolean, log?: (msg: string) => void }} opts
 */
export async function runMigration({ ddb, table, teamId, rollback = false, dryRun = false, log = console.log }) {
	const items = await queryAssignments(ddb, table, teamId);
	const plan = planAssignmentKeyMigration(items, { rollback });

	log(
		`[migrate-assignment-keys] team=${teamId} mode=${rollback ? 'rollback' : 'forward'} ` +
			`scanned=${items.length} target=${plan.length} dryRun=${dryRun}`
	);
	for (const p of plan) log(`  ${p.oldSk}  ->  ${p.newSk}`);

	if (dryRun) return { scanned: items.length, migrated: 0, planned: plan.length };

	let migrated = 0;
	for (const p of plan) {
		await ddb.send(
			new TransactWriteCommand({
				TransactItems: [
					{ Put: { TableName: table, Item: p.newItem } },
					{ Delete: { TableName: table, Key: { pk: p.pk, sk: p.oldSk } } }
				]
			})
		);
		migrated++;
	}
	log(`[migrate-assignment-keys] done: migrated=${migrated}`);
	return { scanned: items.length, migrated, planned: plan.length };
}

/**
 * CLI 引数を最小限パースする。
 * @param {string[]} argv
 */
function parseArgs(argv) {
	const args = { rollback: false, dryRun: false, teamId: 'team_default' };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--rollback') args.rollback = true;
		else if (argv[i] === '--dry-run') args.dryRun = true;
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
	const { rollback, dryRun, teamId } = parseArgs(process.argv.slice(2));
	const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
	await runMigration({ ddb, table, teamId, rollback, dryRun });
}

// 直接実行されたときだけ main を走らせる (import 時は実行しない = テスト可能)。
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	main().catch((e) => {
		console.error(e);
		process.exit(1);
	});
}
