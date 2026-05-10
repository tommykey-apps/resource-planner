// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ProjectManager from './ProjectManager.svelte';

describe('ProjectManager (smoke)', () => {
	it('renders the trigger button with the project count', () => {
		const { getByRole } = render(ProjectManager, {
			props: { projects: [], assignments: [] }
		});
		expect(getByRole('button', { name: /案件を管理/ })).toBeInTheDocument();
	});

	it('shows count of provided projects in the trigger label', () => {
		const { getByRole } = render(ProjectManager, {
			props: {
				projects: [{ id: 'p1', name: 'Project A', color: '#ff0000' }],
				assignments: []
			}
		});
		expect(getByRole('button', { name: /\(1\)/ })).toBeInTheDocument();
	});

	it('phosphor svg icon visible + text label wrapped in sm:inline span (#96 / #105)', () => {
		const { getByRole } = render(ProjectManager, {
			props: { projects: [], assignments: [] }
		});
		const trigger = getByRole('button', { name: /案件を管理/ });
		const icon = trigger.querySelector('svg[aria-hidden="true"]');
		expect(icon).toBeTruthy();
		expect(trigger.textContent).not.toMatch(/📁/);
		expect(trigger.querySelector('.hidden.sm\\:inline')?.textContent).toMatch(/案件を管理/);
	});
});
