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

	it('shows phosphor Plus icon, wraps text label in sm:inline span (#96 / #105)', () => {
		const { getByRole } = render(AssignmentCreator, {
			props: { resources: [], projects: [] }
		});
		const trigger = getByRole('button');
		const icon = trigger.querySelector('svg[aria-hidden="true"]');
		expect(icon).toBeTruthy();
		// プレーンな "+" 文字も使わない (text node の plus)
		expect(trigger.textContent?.replace(/アサインを追加/, '').trim()).not.toContain('+');
		expect(trigger.querySelector('.hidden.sm\\:inline')?.textContent).toMatch(/アサインを追加/);
	});
});
