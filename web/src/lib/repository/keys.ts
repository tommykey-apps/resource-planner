/**
 * DynamoDB Single Table Design のキー組立 (entities.md / access-patterns.md 参照)。
 *
 * - pk: ORG#{orgId}
 * - sk: RES#{id} | PRJ#{id} | ASN#{startDate}#{id}
 *
 * **必ず server side で組み立てる**。HTTP body の orgId を信用しない (クロステナント混入防止、
 * docs/db/access-patterns.md A1 参照)。
 */

export const SK_PREFIX = {
	resource: 'RES#',
	project: 'PRJ#',
	assignment: 'ASN#'
} as const;

export const pk = (orgId: string) => `ORG#${orgId}`;
export const resourceSk = (id: string) => `${SK_PREFIX.resource}${id}`;
export const projectSk = (id: string) => `${SK_PREFIX.project}${id}`;
export const assignmentSk = (startDate: string, id: string) =>
	`${SK_PREFIX.assignment}${startDate}#${id}`;
