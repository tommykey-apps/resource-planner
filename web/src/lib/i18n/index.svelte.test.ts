import { describe, expect, it, beforeEach } from 'vitest';
import { localeState, pickLocaleFromAcceptLanguage, t } from './index.svelte';

describe('pickLocaleFromAcceptLanguage', () => {
	it('returns ja when header starts with ja', () => {
		expect(pickLocaleFromAcceptLanguage('ja,en;q=0.9')).toBe('ja');
		expect(pickLocaleFromAcceptLanguage('ja-JP')).toBe('ja');
		expect(pickLocaleFromAcceptLanguage('JA-jp;q=1')).toBe('ja');
	});

	it('returns en when header starts with en (no ja)', () => {
		expect(pickLocaleFromAcceptLanguage('en-US,en;q=0.9')).toBe('en');
		expect(pickLocaleFromAcceptLanguage('en')).toBe('en');
	});

	it('prefers ja when ja appears first (priority on order)', () => {
		expect(pickLocaleFromAcceptLanguage('ja,en;q=0.9')).toBe('ja');
		expect(pickLocaleFromAcceptLanguage('en;q=0.9,ja;q=0.8')).toBe('en');
	});

	it('returns en for unknown / empty', () => {
		expect(pickLocaleFromAcceptLanguage('')).toBe('en');
		expect(pickLocaleFromAcceptLanguage(null)).toBe('en');
		expect(pickLocaleFromAcceptLanguage(undefined)).toBe('en');
		expect(pickLocaleFromAcceptLanguage('zh-CN,fr;q=0.5')).toBe('en');
	});
});

describe('t (translation lookup)', () => {
	beforeEach(() => {
		localeState.current = 'ja';
	});

	it('returns the translated string for a known key (ja default)', () => {
		expect(t('resources.manage')).toBe('人を管理');
	});

	it('switches language when localeState changes', () => {
		expect(t('resources.manage')).toBe('人を管理');
		localeState.current = 'en';
		expect(t('resources.manage')).toBe('Manage people');
	});

	it('substitutes {name} placeholders with params', () => {
		const ja = t('resources.confirmDelete', { name: '山田' });
		expect(ja).toContain('山田');
	});

	it('returns the key itself when not found (fail-soft)', () => {
		expect(t('does.not.exist')).toBe('does.not.exist');
	});

	it('returns the unmodified template if a placeholder is unspecified', () => {
		const result = t('resources.confirmDelete'); // no params provided
		expect(result).toContain('{name}'); // placeholder kept as-is
	});
});
