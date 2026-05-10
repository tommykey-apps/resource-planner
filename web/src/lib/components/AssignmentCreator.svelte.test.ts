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
});
