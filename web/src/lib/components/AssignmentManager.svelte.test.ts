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

	it('phosphor svg icon visible + text label wrapped in sm:inline span (#96 / #105)', () => {
		const { getByRole } = render(AssignmentManager, {
			props: { assignments: [], resources: [], projects: [] }
		});
		const trigger = getByRole('button', { name: /アサイン一覧/ });
		const icon = trigger.querySelector('svg[aria-hidden="true"]');
		expect(icon).toBeTruthy();
		expect(trigger.textContent).not.toMatch(/📋/);
		expect(trigger.querySelector('.hidden.sm\\:inline')?.textContent).toMatch(/アサイン一覧/);
	});
});
