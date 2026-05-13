import { describe, expect, it, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
const queryAllByTeamMock = vi.fn();

vi.mock('$lib/repository', () => ({
	queryAllByTeam: (...args: unknown[]) => queryAllByTeamMock(...args)
}));

const { load } = await import('./+layout.server');

function makeEvent(opts: { user?: { id: string; email?: string; name?: string }; pathname?: string } = {}) {
	return {
		url: { pathname: opts.pathname ?? '/' },
		locals: {
			auth: authMock,
			locale: 'ja',
			theme: 'light'
		}
	} as unknown as Parameters<typeof load>[0];
}

beforeEach(() => {
	authMock.mockReset();
	queryAllByTeamMock.mockReset();
});

describe('+layout.server.ts load (PR-N4, refs #187)', () => {
	it('attaches descriptionHtml (sanitized markdown HTML) to each project when authenticated', async () => {
		authMock.mockResolvedValue({ user: { id: 'u1', email: 'a@example.com', name: 'A' } });
		queryAllByTeamMock.mockResolvedValue({
			resources: [],
			projects: [
				{ id: 'p1', name: 'P1', color: '#000000', description: '**bold**' },
				{ id: 'p2', name: 'P2', color: '#ffffff' } // legacy, no description
			],
			assignments: []
		});

		const result = (await load(makeEvent())) as {
			projects: Array<{
				id: string;
				name: string;
				color: string;
				description?: string;
				descriptionHtml: string;
			}>;
		};

		expect(result.projects).toHaveLength(2);
		// project with description → descriptionHtml is sanitized HTML (not raw markdown)
		expect(result.projects[0].description).toBe('**bold**');
		expect(result.projects[0].descriptionHtml).toMatch(/<strong>bold<\/strong>/);
		// legacy project without description → descriptionHtml is empty string
		expect(result.projects[1].descriptionHtml).toBe('');
	});

	it('passes through resources / assignments / user unchanged', async () => {
		authMock.mockResolvedValue({ user: { id: 'u1', email: 'a@example.com', name: 'A' } });
		queryAllByTeamMock.mockResolvedValue({
			resources: [{ id: 'r1', name: 'Alice' }],
			projects: [],
			assignments: [
				{
					id: 'a1',
					resourceId: 'r1',
					projectId: 'p1',
					startDate: '2026-05-01',
					endDateExclusive: '2026-05-08'
				}
			]
		});

		const result = (await load(makeEvent())) as {
			resources: Array<{ id: string }>;
			assignments: Array<{ id: string }>;
			user: { id: string };
		};

		expect(result.resources).toEqual([{ id: 'r1', name: 'Alice' }]);
		expect(result.assignments).toHaveLength(1);
		expect(result.user.id).toBe('u1');
	});

	it('returns empty arrays for unauthenticated user on /sign-in (no projects to render)', async () => {
		authMock.mockResolvedValue(null);
		const result = (await load(makeEvent({ pathname: '/sign-in' }))) as {
			projects: unknown[];
			resources: unknown[];
		};
		expect(result.projects).toEqual([]);
		expect(result.resources).toEqual([]);
		expect(queryAllByTeamMock).not.toHaveBeenCalled();
	});

	it('throws redirect for unauthenticated user on non-sign-in path', async () => {
		authMock.mockResolvedValue(null);
		// SvelteKit の redirect() は HttpError-like object を throw する
		await expect(load(makeEvent({ pathname: '/assignments' }))).rejects.toMatchObject({
			status: 303,
			location: '/sign-in'
		});
		expect(queryAllByTeamMock).not.toHaveBeenCalled();
	});
});
