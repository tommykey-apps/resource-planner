// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import AssignmentCreator from './AssignmentCreator.svelte';

describe('AssignmentCreator (smoke)', () => {
	it('renders the trigger button', () => {
		const { getByRole } = render(AssignmentCreator, {
			props: { resources: [], projects: [] }
		});
		expect(getByRole('button', { name: /アサイン/ })).toBeInTheDocument();
	});

	it('shows + icon always, wraps text label in sm:inline span (mobile responsive、#96)', () => {
		const { getByRole } = render(AssignmentCreator, {
			props: { resources: [], projects: [] }
		});
		const trigger = getByRole('button');
		expect(trigger.textContent).toMatch(/\+/);
		expect(trigger.querySelector('.hidden.sm\\:inline')?.textContent).toMatch(/アサインを追加/);
	});
});
