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
