import { describe, expect, it } from 'vitest';
import { addDays, formatLocalDate, parseLocalDate } from './date';

describe('addDays', () => {
	it('adds positive days within the same month', () => {
		expect(addDays('2026-05-01', 1)).toBe('2026-05-02');
		expect(addDays('2026-05-01', 10)).toBe('2026-05-11');
	});

	it('rolls over month boundary', () => {
		expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
		expect(addDays('2026-04-30', 1)).toBe('2026-05-01');
	});

	it('rolls over year boundary', () => {
		expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
	});

	it('handles leap year (2024-02-28 + 1 = 2024-02-29)', () => {
		expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
		expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
	});

	it('handles non-leap year (2025-02-28 + 1 = 2025-03-01)', () => {
		expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
	});

	it('handles negative n (subtract days)', () => {
		expect(addDays('2026-05-01', -1)).toBe('2026-04-30');
		expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
	});

	it('returns the same date for n = 0', () => {
		expect(addDays('2026-05-09', 0)).toBe('2026-05-09');
	});
});

describe('parseLocalDate / formatLocalDate roundtrip', () => {
	it('preserves the YYYY-MM-DD value through parse + format', () => {
		const d = parseLocalDate('2026-05-09');
		expect(formatLocalDate(d)).toBe('2026-05-09');
	});
});
