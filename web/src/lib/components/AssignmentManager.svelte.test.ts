// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import AssignmentManager from './AssignmentManager.svelte';

describe('AssignmentManager (smoke)', () => {
	it('renders the trigger button with the assignment count', () => {
		const { getByRole } = render(AssignmentManager, {
			props: { assignments: [], resources: [], projects: [] }
		});
		expect(getByRole('button', { name: /アサイン一覧/ })).toBeInTheDocument();
	});

	it('emoji icon visible + text label wrapped in sm:inline span (mobile responsive、#96)', () => {
		const { getByRole } = render(AssignmentManager, {
			props: { assignments: [], resources: [], projects: [] }
		});
		const trigger = getByRole('button', { name: /アサイン一覧/ });
		expect(trigger.textContent).toMatch(/📋/);
		expect(trigger.querySelector('.hidden.sm\\:inline')?.textContent).toMatch(/アサイン一覧/);
	});
});
