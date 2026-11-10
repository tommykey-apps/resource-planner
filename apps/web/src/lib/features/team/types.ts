import type { Assignment, Department, Project, Resource } from '@resource-planner/db/entities';

/** `+layout.server.ts` の load が返す形 (entity 別に振り分け済み)。 */
export interface TeamData {
	resources: Resource[];
	projects: Project[];
	assignments: Assignment[];
	departments: Department[];
}
