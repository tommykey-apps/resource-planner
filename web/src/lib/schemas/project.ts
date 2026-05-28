import { z } from 'zod';
import { colorString } from './shared';
import type { ProjectLink } from '$lib/types';

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
