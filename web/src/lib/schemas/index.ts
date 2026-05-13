import { z } from 'zod';
import { addDays } from '$lib/date';
import type { ProjectLink } from '$lib/types';

/**
 * #139: schema 内の `message` は **i18n code** に統一する (`errors.required` 等)。
 * UI 側で `t(\`errors.${msg}\`)` で翻訳することで、 サーバから locale 済文字列を返さない契約。
 *
 * code 体系:
 *   required           — 必須欠落 (min(1) など)
 *   tooLong            — 長さ超過 (max())
 *   tooMany            — 件数超過 (max(N) on array, #187)
 *   invalidDateFormat  — 日付 YYYY-MM-DD パターン不一致
 *   invalidColorFormat — #RRGGBB パターン不一致
 *   invalidUrl         — URL が http(s) でない / 形式不正 (#187)
 *   endBeforeStart     — 終了日 < 開始日 (refine)
 */

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalidDateFormat');

const colorString = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'invalidColorFormat');

// ── Resource ────────────────────────────────────────────────────────

export const resourceCreateSchema = z.object({
	name: z.string().min(1, 'required').max(100, 'tooLong')
});

export const resourceUpdateSchema = resourceCreateSchema.extend({
	id: z.string().min(1, 'required')
});

export type ResourceCreateInput = z.infer<typeof resourceCreateSchema>;
export type ResourceUpdateInput = z.infer<typeof resourceUpdateSchema>;

// ── Project ─────────────────────────────────────────────────────────

/**
 * Project 詳細フィールドの上限 (ADR 0010)。 UI (HTML input maxlength 等) と schema 双方で
 * 同 source を参照するため export して共有する (ADR 0001 型駆動、 マジック数値禁止)。
 */
export const PROJECT_NAME_MAX_LENGTH = 100;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 10_000;
export const PROJECT_TAG_MAX_LENGTH = 30;
export const PROJECT_TAG_MAX_COUNT = 20;
// tags CSV の worst-case: 20 tags × (30 chars + 2 chars for ', ') = 640。 余裕を持って 700。
export const PROJECT_TAGS_CSV_MAX_LENGTH = 700;
export const PROJECT_LINK_LABEL_MAX_LENGTH = 50;
export const PROJECT_LINK_MAX_COUNT = 10;
// URL 上限: RFC 上の明示的な上限はないが、 各 browser / proxy が ~2048 / ~8192 で truncate
// する事例があるため defensive に 2048 を採用 (IE 互換目安、 modern browser でも安全圏)。
export const PROJECT_LINK_URL_MAX_LENGTH = 2048;

/**
 * description: 空文字 → undefined に正規化して max(10_000) で長さ制限 (ADR 0010)。
 * `<textarea>` は空でも空文字を返すので preprocess で undefined に揃え、 repository 側で
 * 「未設定 = attribute REMOVE」 を一貫させる (Zod v4 preprocess pattern)。
 */
const descriptionSchema = z.preprocess(
	(v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
	z.string().max(PROJECT_DESCRIPTION_MAX_LENGTH, 'tooLong').optional()
);

/**
 * tags: カンマ区切り raw string → trim + NFC normalize + dedup で `string[]` に変換 (ADR 0010)。
 * NFC normalize は 「ｶ (半角)」 と 「カ (全角)」 等の表記揺れを統一する Unicode 正規化
 * (UAX#15)。 dedup は順序保持のまま重複を弾く。
 *
 * Zod v4 `.transform().pipe()` で 「raw 入力 → 中間 array → array 検証」 を 1 schema に閉じる。
 */
const tagsCsvSchema = z
	.string()
	.optional()
	.transform((s) => {
		if (!s) return [];
		const seen = new Set<string>();
		const result: string[] = [];
		for (const raw of s.split(',')) {
			const t = raw.trim().normalize('NFC');
			if (!t || seen.has(t)) continue;
			seen.add(t);
			result.push(t);
		}
		return result;
	})
	.pipe(
		z
			.array(z.string().min(1, 'required').max(PROJECT_TAG_MAX_LENGTH, 'tooLong'))
			.max(PROJECT_TAG_MAX_COUNT, 'tooMany')
	);

/**
 * link 1 件: label は省略可 (空文字なら undefined)、 url は http(s) のみ許可 (ADR 0010)。
 * `javascript:` / `data:` URL は XSS ベクトルになるため明示的に拒否 (OWASP)。
 */
const linkObjectSchema = z.object({
	label: z.preprocess(
		(v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
		z.string().max(PROJECT_LINK_LABEL_MAX_LENGTH, 'tooLong').optional()
	),
	url: z.preprocess(
		(v) => (typeof v === 'string' ? v.trim() : v),
		z
			.url('invalidUrl')
			.max(PROJECT_LINK_URL_MAX_LENGTH, 'tooLong')
			.refine((u) => /^https?:\/\//.test(u), 'invalidUrl')
	)
});

/**
 * links: hidden input に JSON.stringify した文字列で送信 (BP B8、 SvelteKit form action と
 * nested data の妥協)。 server 側で JSON.parse → array validation を 1 schema で行う。
 * parse 失敗時は `[]` に正規化 (中身を後段 pipe で検証)。
 */
const linksJsonSchema = z
	.string()
	.optional()
	.transform((s) => {
		if (!s) return [];
		try {
			const parsed: unknown = JSON.parse(s);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	})
	.pipe(z.array(linkObjectSchema).max(PROJECT_LINK_MAX_COUNT, 'tooMany'));

/**
 * create / update 共通 shape。 Zod v4 では `.transform()` 後に `.extend()` できないため、
 * base object を const 化して両 schema で再利用する。
 */
const projectBaseShape = {
	name: z.string().min(1, 'required').max(PROJECT_NAME_MAX_LENGTH, 'tooLong'),
	color: colorString,
	description: descriptionSchema,
	tags: tagsCsvSchema,
	linksJson: linksJsonSchema
} as const;

interface ProjectInputShape {
	name: string;
	color: string;
	description?: string;
	tags: string[];
	linksJson: ProjectLink[];
}

interface ProjectOutput {
	name: string;
	color: string;
	description?: string;
	tags: string[];
	links: ProjectLink[];
}

/** transform で linksJson → links rename + 一貫した output 型を生成 (ADR 0001 型駆動)。 */
const projectTransform = (input: ProjectInputShape): ProjectOutput => ({
	name: input.name,
	color: input.color,
	description: input.description,
	tags: input.tags,
	links: input.linksJson
});

export const projectCreateSchema = z.object(projectBaseShape).transform(projectTransform);

export const projectUpdateSchema = z
	.object({ id: z.string().min(1, 'required'), ...projectBaseShape })
	.transform((input) => ({ ...projectTransform(input), id: input.id }));

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

// ── Assignment ──────────────────────────────────────────────────────

/**
 * Assignment スキーマは **フォーム入力 (inclusive `endDate`) → ストレージ (exclusive `endDateExclusive`)** の
 * 変換を `.transform()` 内に閉じ込める (ADR 0004)。フォーム送信から repository まで、
 * 他の場所には `±1 day` が一切現れない設計。
 *
 * - `z.input<typeof schema>`: フォーム生 shape (`endDate` inclusive)
 * - `z.output<typeof schema>` (= `z.infer`): post-transform shape (`endDateExclusive`)
 */

export const assignmentCreateSchema = z
	.object({
		resourceId: z.string().min(1, 'required'),
		projectId: z.string().min(1, 'required'),
		startDate: dateString,
		endDate: dateString
	})
	.refine((v) => v.startDate <= v.endDate, {
		message: 'endBeforeStart',
		path: ['endDate']
	})
	.transform((input) => ({
		resourceId: input.resourceId,
		projectId: input.projectId,
		startDate: input.startDate,
		endDateExclusive: addDays(input.endDate, 1)
	}));

export const assignmentUpdateSchema = z
	.object({
		id: z.string().min(1, 'required'),
		resourceId: z.string().min(1, 'required'),
		projectId: z.string().min(1, 'required'),
		startDate: dateString,
		endDate: dateString
	})
	.refine((v) => v.startDate <= v.endDate, {
		message: 'endBeforeStart',
		path: ['endDate']
	})
	.transform((input) => ({
		id: input.id,
		resourceId: input.resourceId,
		projectId: input.projectId,
		startDate: input.startDate,
		endDateExclusive: addDays(input.endDate, 1)
	}));

/**
 * 編集フォーム送信用 schema (#99 item 1)。`prevStartDate` を含めて受け取り、
 * post-transform で repository 呼び出しに必要な `(prevStartDate, AssignmentUpdatePayload)` 構造に分割する。
 *
 * `prevStartDate` は SK = `ASN#{startDate}#{id}` 再構築に必要 (startDate を変更したとき旧 SK を削除する)。
 */
export const assignmentFormUpdateSchema = z
	.object({
		id: z.string().min(1, 'required'),
		resourceId: z.string().min(1, 'required'),
		projectId: z.string().min(1, 'required'),
		prevStartDate: dateString,
		startDate: dateString,
		endDate: dateString
	})
	.refine((v) => v.startDate <= v.endDate, {
		message: 'endBeforeStart',
		path: ['endDate']
	})
	.transform((input) => ({
		prevStartDate: input.prevStartDate,
		payload: {
			id: input.id,
			resourceId: input.resourceId,
			projectId: input.projectId,
			startDate: input.startDate,
			endDateExclusive: addDays(input.endDate, 1)
		}
	}));

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

