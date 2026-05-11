/**
 * DynamoDB Single Table Design のキー組立 (entities.md / access-patterns.md 参照)。
 *
 * **Team scope (アプリデータ)**:
 * - pk: `TEAM#{teamId}` (#81 で ORG → TEAM 改名)
 * - sk: `RES#{id}` | `PRJ#{id}` | `ASN#{startDate}#{id}` | `MEMBER#{userId}` | `META`
 *
 * **User scope (Auth.js / membership 逆引き)**:
 * - pk: `USER#{userId}` sk: `META` | `ACCOUNT#{provider}#{providerAccountId}`
 *
 * **GSI1** (Auth.js + 自前 membership 逆引き 兼用、#81):
 * - GSI1PK = `USER#{userId}` GSI1SK = `TEAM#{teamId}` (user が所属する team 一覧)
 * - GSI1PK = `USER#email#{email}` (Auth.js が getUserByEmail で利用)
 * - GSI1PK = `ACCOUNT#{provider}` GSI1SK = `ACCOUNT#{providerAccountId}` (Auth.js getUserByAccount)
 *
 * **必ず server side で組み立てる**。HTTP body の teamId / userId を信用しない (クロステナント混入防止、
 * docs/db/access-patterns.md A1 参照)。
 */

export const SK_PREFIX = {
	resource: 'RES#',
	project: 'PRJ#',
	assignment: 'ASN#',
	teamMember: 'MEMBER#'
} as const;

// ── Team scope ──
export const pk = (teamId: string) => `TEAM#${teamId}`;
export const teamMetaSk = () => 'META';
export const resourceSk = (id: string) => `${SK_PREFIX.resource}${id}`;
export const projectSk = (id: string) => `${SK_PREFIX.project}${id}`;
export const assignmentSk = (startDate: string, id: string) =>
	`${SK_PREFIX.assignment}${startDate}#${id}`;
export const teamMembershipSk = (userId: string) => `${SK_PREFIX.teamMember}${userId}`;

// ── User scope ──
export const userPk = (userId: string) => `USER#${userId}`;
export const userMetaSk = () => 'META';

// ── GSI1: user → team 一覧 (membership 逆引き) ──
export const userTeamsGsi1pk = (userId: string) => `USER#${userId}`;
export const userTeamsGsi1sk = (teamId: string) => `TEAM#${teamId}`;

// ── SES suppression (#134): bounce / complaint で送信を停止するアドレス ──
// email は大小文字 insensitive で正規化 (RFC 5321 のローカル部 case-sensitive は実害無し、
// SES の bounce 報告も lower-case で揃えるので safe)。
export const suppressionPk = (email: string) => `SUPPRESS#${email.toLowerCase()}`;
export const suppressionMetaSk = () => 'META';
