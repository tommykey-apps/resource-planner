/**
 * resource-planner の domain 型。
 *
 * - DB 保存形式: pk = ORG#{orgId}, sk = (RES|PRJ|ASN)#... + entity attribute。
 * - endDate / startDate は **inclusive** な YYYY-MM-DD string (ADR 0003)。
 * - id は ULID (ADR 0002)。
 *
 * ResourceTimeline 用の型は `@tommykey-apps/ui-components` から import し、
 * 境界で `web/src/lib/timeline-adapter.ts` で変換する (DB 形式と timeline 形式を混ぜない)。
 */

/** YYYY-MM-DD (inclusive)。Asia/Tokyo の暦日。 */
export type DateString = string;

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
	startDate: DateString;
	endDate: DateString; // inclusive
}

/** `+layout.server.ts` の load が返す形 (entity 別に振り分け済み)。 */
export interface OrgData {
	resources: Resource[];
	projects: Project[];
	assignments: Assignment[];
}
