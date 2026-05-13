/**
 * resource-planner の domain 型。
 *
 * - DB 保存形式: pk = TEAM#{teamId}, sk = (RES|PRJ|ASN)#... + entity attribute (#81 で ORG → TEAM 改名)。
 * - **`startDate` は inclusive、`endDateExclusive` は exclusive 半開区間 `[start, endExclusive)`** (ADR 0004)。
 *   業界標準 (RFC 5545 / Google Calendar API / PostgreSQL daterange / Java / Rust / Python) と同じ規約。
 *   フォーム UX は inclusive (「終了日 5/31」) → Zod `.transform()` で `endDateExclusive` に変換。
 * - id は ULID (ADR 0002)。
 *
 * ResourceTimeline 用の型は `@tommykey-apps/ui-components` から import し、
 * 境界で `web/src/lib/timeline-adapter.ts` で型変換する (DB 形式と timeline 形式を混ぜない)。
 * 規約が一致しているため `±1 day` 変換は **不要**。
 */

/** YYYY-MM-DD。 host TZ の暦日として解釈・format する floating string (UTC ではない)。 */
export type DateString = string;

/** チーム = multi-tenant 単位 (社内 1 チーム想定、 将来 multi-team は ADR 0009 参照)。 */
export interface Team {
	id: string;
	name: string;
	createdAt: string; // ISO 8601
}

/** Team メンバーシップ。同じ User が複数 Team に所属できる構造。 */
export interface TeamMembership {
	teamId: string;
	userId: string;
	role: 'admin' | 'member';
	joinedAt: string;
}

export interface Resource {
	id: string;
	name: string;
}

export interface Project {
	id: string;
	name: string;
	color: string; // #RRGGBB
	/** markdown 本文 (1 万字以内、 cure53 DOMPurify で sanitize、 ADR 0010)。 */
	description?: string;
	/** 使用技術タグ (各 30 字以内 / 20 件以内、 NFC normalize + dedup、 ADR 0010)。 */
	tags?: string[];
	/** 関連リンク (http(s) のみ / 10 件以内、 ADR 0010)。 */
	links?: ProjectLink[];
}

export interface ProjectLink {
	/** 表示ラベル (50 字以内、 省略時は url を表示)。 */
	label?: string;
	/** http(s) URL。 */
	url: string;
}

export interface Assignment {
	id: string;
	resourceId: string;
	projectId: string;
	/** 開始日 (inclusive、この日を含む)。 */
	startDate: DateString;
	/** 終了日の翌日 (exclusive、この日は含まない)。半開区間 `[startDate, endDateExclusive)`。 */
	endDateExclusive: DateString;
}

/** `+layout.server.ts` の load が返す形 (entity 別に振り分け済み)。 */
export interface TeamData {
	resources: Resource[];
	projects: Project[];
	assignments: Assignment[];
}

/**
 * SSR render 済の Project (ADR 0010、 PR-N4)。
 *
 * `+layout.server.ts` の load が `renderMarkdown(p.description)` を呼び、 `descriptionHtml` を
 * sanitize 済 HTML 文字列として付与する。 client 側は `{@html descriptionHtml}` で表示するだけ。
 *
 * 理由 (ADR 0010 Decision):
 * - `$effect` 内の `await import('marked')` は SSR で走らないため、 lazy load だと初回描画で
 *   description が空になる
 * - SSR で render すれば初回 modal open 時点で markdown が即見える (lazy await なし)
 */
export interface ProjectWithRenderedDescription extends Project {
	/** server 側 sanitize 済 HTML 文字列 (description なしの project は空文字 `''`)。 */
	descriptionHtml: string;
}
