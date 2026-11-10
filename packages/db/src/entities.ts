/**
 * resource-planner の DynamoDB に保存する entity の型。
 *
 * - DB 保存形式: pk = TEAM#{teamId}, sk = (RES|PRJ|ASN)#... + entity attribute (#81 で ORG → TEAM 改名)。
 * - **`startDate` は inclusive、`endDateExclusive` は exclusive 半開区間 `[start, endExclusive)`** (ADR 0004)。
 *   業界標準 (RFC 5545 / Google Calendar API / PostgreSQL daterange / Java / Rust / Python) と同じ規約。
 *   フォーム UX は inclusive (「終了日 5/31」) → Zod `.transform()` で `endDateExclusive` に変換。
 * - id は ULID (ADR 0002)。
 *
 * ResourceTimeline 用の型は `@tommykey-apps/ui-components` から import し、
 * 境界で `apps/web/src/lib/features/assignment/timeline/adapter.ts` で型変換する (DB 形式と timeline 形式を混ぜない)。
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
	/**
	 * ログインユーザーと照合するメールアドレス (ADR 0015)。 必須、 チーム内で一意、 小文字で保存する。
	 * ログインしないメンバーには届かない仮のアドレス (`*@example.invalid`、 RFC 2606) を入れる。
	 */
	email: string;
	/**
	 * 所属 Department の id (ADR 0013、 #239)。 高々 1 つ、 ツリーの任意ノード可。
	 * **未所属は attribute なし** (optional、 REMOVE semantics)。 `null` ではなく「キー不在」で表現する
	 * (Project の description/tags 等と同じ規約)。
	 */
	departmentId?: string;
}

/**
 * 部署 (組織ツリーのノード、 ADR 0013)。 1 Team 内の **グルーピング専用** ノード。
 * `parentId = null` がルート (1 Team 内に複数可 = フォレスト)。 Team とは別概念 (隔離境界ではない)。
 */
export interface Department {
	id: string;
	name: string;
	/** 親 Department の id。 `null` = ルート。 */
	parentId: string | null;
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
	/**
	 * 受注した部署、 または受注を見込む部署の id (ADR 0016)。 Resource.departmentId と同じ規約:
	 * 高々 1 つ、 ツリーの任意ノード可、 **未所属は attribute なし**。
	 */
	departmentId?: string;
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
	/**
	 * 楽観ロック用の version (ADR 0012)。 create で 1、 update のたびに +1。
	 * client は read した version を `expectedVersion` として送り、 server は
	 * `version = :expected` 条件で書き込む。 不一致 (他ユーザが先に更新) なら 409。
	 */
	version: number;
}
