import { z } from 'zod';
import { addDays } from '$lib/date';
import { dateString } from './shared';

// assignment の delete は SK = ASN#{startDate}#{id} 構成のため startDate も必要。
export const deleteAssignmentSchema = z.object({
	id: z.string({ error: 'required' }).min(1, 'required'),
	startDate: z.string({ error: 'invalidDateFormat' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'invalidDateFormat')
});

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

export const assignmentCreateSchema = z
	.object(assignmentBaseShape)
	.refine(refineEndAfterStart, refineOpts)
	.transform(toExclusivePayload);

export const assignmentUpdateSchema = z
	.object({ id: z.string().min(1, 'required'), ...assignmentBaseShape })
	.refine(refineEndAfterStart, refineOpts)
	.transform(toExclusivePayload);

/**
 * 編集フォーム送信用 schema (#99 item 1)。`prevStartDate` を含めて受け取り、
 * post-transform で repository 呼び出しに必要な `(prevStartDate, AssignmentUpdatePayload)` 構造に分割する。
 *
 * `prevStartDate` は SK = `ASN#{startDate}#{id}` 再構築に必要 (startDate を変更したとき旧 SK を削除する)。
 */
export const assignmentFormUpdateSchema = z
	.object({
		id: z.string().min(1, 'required'),
		prevStartDate: dateString,
		...assignmentBaseShape
	})
	.refine(refineEndAfterStart, refineOpts)
	.transform((input) => {
		const { prevStartDate, ...rest } = input;
		return { prevStartDate, payload: toExclusivePayload(rest) };
	});

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
 * `prevStartDate` は SK 再構築用 (startDate 変更時に旧 SK を Delete するため)。
 */
export const assignmentApiUpdateSchema = z
	.object({
		prevStartDate: dateString,
		resourceId: z.string().min(1, 'required'),
		projectId: z.string().min(1, 'required'),
		startDate: dateString,
		endDateExclusive: dateString
	})
	.refine((v) => v.startDate < v.endDateExclusive, {
		message: 'endBeforeStart',
		path: ['endDateExclusive']
	});
