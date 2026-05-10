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
});
