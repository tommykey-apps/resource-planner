// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import AppHeader from './AppHeader.svelte';

/**
 * #136 / #146: 共通 Header に logo + アプリ名 が並び、 /assignments 行き button が
 * `isAssignmentsActive` のとき aria-current="page" になることを確認する。
 *
 * 子コンポーネント (ResourceManager / ThemeToggle 等) は smoke 確認のみ
 * (各々が独立した spec を持つので mount 出来ていれば OK)。
 */
type StubOverrides = {
	isAssignmentsActive?: boolean;
};

const stubProps = (overrides: StubOverrides = {}) => ({
	props: {
		resources: [],
		projects: [],
		assignments: [],
		user: { email: 'alice@example.com' },
		isAssignmentsActive: false,
		...overrides
	}
});

describe('AppHeader (#136 / #146)', () => {
	it('logo img has empty alt (decorative — same meaning as adjacent h1) + width/height for CLS', () => {
		const { container } = render(AppHeader, stubProps());
		const img = container.querySelector('img');
		expect(img).toBeTruthy();
		expect(img?.getAttribute('alt')).toBe('');
		expect(img?.getAttribute('width')).toBe('32');
		expect(img?.getAttribute('height')).toBe('32');
	});

	it('logo + h1 are wrapped in <a href="/"> for canonical home navigation', () => {
		const { container } = render(AppHeader, stubProps());
		const anchor = container.querySelector('a[href="/"]');
		expect(anchor).toBeTruthy();
		expect(anchor?.querySelector('img')).toBeTruthy();
		expect(anchor?.querySelector('h1')).toBeTruthy();
	});

	it('renders an /assignments link (no aria-current) when not on the assignments page', () => {
		const { container } = render(AppHeader, stubProps({ isAssignmentsActive: false }));
		const link = container.querySelector('a[href="/assignments"]');
		expect(link).toBeTruthy();
		expect(link?.getAttribute('aria-current')).toBeNull();
	});

	it('marks the /assignments link with aria-current="page" when active', () => {
		const { container } = render(AppHeader, stubProps({ isAssignmentsActive: true }));
		const link = container.querySelector('a[href="/assignments"]');
		expect(link?.getAttribute('aria-current')).toBe('page');
	});
});
