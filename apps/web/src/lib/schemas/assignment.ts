import { z } from 'zod';
import { addDays } from '$lib/date';
import { dateString } from './shared';

// ADR 0012: assignment SK は `ASN#{id}` 安定キーになったため delete も id のみ
// (旧: startDate 込みで SK 再構築)。 `$lib/schemas` の `deleteByIdSchema` をそのまま使う。

// ── Assignment ──────────────────────────────────────────────────────

/**
 * Assignment スキーマは **フォーム入力 (inclusive `endDate`) → ストレージ (exclusive `endDateExclusive`)** の
 * 変換を `.transform()` 内に閉じ込める (ADR 0004)。フォーム送信から repository まで、
 * 他の場所には `±1 day` が一切現れない設計。
 *
 * - `z.input<typeof schema>`: フォーム生 shape (`endDate` inclusive)
 * - `z.output<typeof schema>` (= `z.infer`): post-transform shape (`endDateExclusive`)
 *
 * #173: 3 schema (create / update / formUpdate) で `refine(start<=end) + transform(addDays)` が
 * 重複していたため、 base shape + factory に集約。 Zod v4 公式 (spread syntax 推奨) に準拠。
 * `projectBaseShape` と同パターン。
 */

/** create / update / formUpdate で共通の入力 fields。 */
const assignmentBaseShape = {
	resourceId: z.string().min(1, 'required'),
	projectId: z.string().min(1, 'required'),
	startDate: dateString,
	endDate: dateString
} as const;

/** start <= end の refine。 全 assignment schema で共通。 */
const refineEndAfterStart = <T extends { startDate: string; endDate: string }>(v: T): boolean =>
	v.startDate <= v.endDate;

// Zod の refine `params` の `path` は mutable `PropertyKey[]` を要求するので as const は付けない。
const refineOpts = { message: 'endBeforeStart', path: ['endDate'] };

/** endDate (inclusive) を endDateExclusive (半開区間) に変換する共通ロジック (ADR 0004)。 */
function toExclusivePayload<T extends { startDate: string; endDate: string }>(
	input: T
): Omit<T, 'endDate'> & { endDateExclusive: string } {
	const { endDate, ...rest } = input;
	return { ...rest, endDateExclusive: addDays(endDate, 1) };
}

/**
 * 楽観ロックの expectedVersion (ADR 0012)。 client が read した version を送る。
 * form は FormData (string)、 API は JSON (number) で来るため `z.coerce.number()` で両対応。
 */
const expectedVersion = z.coerce
	.number('invalidVersion')
	.int('invalidVersion')
	.min(0, 'invalidVersion');

export const assignmentCreateSchema = z
	.object(assignmentBaseShape)
	.refine(refineEndAfterStart, refineOpts)
	.transform(toExclusivePayload);

/**
 * 更新 schema (form action / 編集ダイアログ)。 ADR 0012 で `prevStartDate` (旧 SK 再構築用) を
 * 廃止し、 代わりに `expectedVersion` (楽観ロック) を受け取る。 SK は `ASN#{id}` 安定キーなので
 * startDate を変えても SK 再構築は不要。 post-transform で `endDate` → `endDateExclusive`。
 */
export const assignmentUpdateSchema = z
	.object({ id: z.string().min(1, 'required'), expectedVersion, ...assignmentBaseShape })
	.refine(refineEndAfterStart, refineOpts)
	.transform(toExclusivePayload);

/** 編集フォーム送信用 (#99)。 ADR 0012 以降は update schema と同一 (prevStartDate 廃止)。 */
export const assignmentFormUpdateSchema = assignmentUpdateSchema;

/** Post-transform shape (storage)。repository が受け取る型。 */
export type AssignmentCreatePayload = z.output<typeof assignmentCreateSchema>;
export type AssignmentUpdatePayload = z.output<typeof assignmentUpdateSchema>;

/**
 * `PATCH /api/assignments/[id]` API endpoint で受け取る body の検証 schema。
 *
 * フォーム境界ではなく **app 内部 RPC** (frontend onMove/onResize → backend) で使うため、
 * `endDateExclusive` を直接受け取る (transform 不要、ADR 0004)。
 *
 * `id` は URL param (`[id]`) から取得するため body には含めない。
 * `expectedVersion` は楽観ロック用 (ADR 0012、不一致なら 409)。
 */
export const assignmentApiUpdateSchema = z
	.object({
		expectedVersion,
		resourceId: z.string().min(1, 'required'),
		projectId: z.string().min(1, 'required'),
		startDate: dateString,
		endDateExclusive: dateString
	})
	.refine((v) => v.startDate < v.endDateExclusive, {
		message: 'endBeforeStart',
		path: ['endDateExclusive']
	});
