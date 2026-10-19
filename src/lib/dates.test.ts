import { describe, expect, it } from 'vitest';
import { addDays, isDate, monthGrid, selectedDates, weekday, zonedToInstant } from './dates';

describe('plain dates', () => {
	it('adds days across DST and month ends', () => {
		expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
	});
	it('weekday is Monday-first', () => {
		expect(weekday('2026-11-02')).toBe(0); // Monday
		expect(weekday('2026-11-08')).toBe(6); // Sunday
	});
	it('validates dates', () => {
		expect(isDate('2026-02-29')).toBe(false);
		expect(isDate('2028-02-29')).toBe(true);
	});
	it('builds a Monday-first month grid', () => {
		const g = monthGrid('2026-11-01');
		expect(g[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
		expect(g[0][6]).toBe('2026-11-01');
		expect(g.every((w) => w.length === 7)).toBe(true);
	});
});

describe('selectedDates', () => {
	const base = {
		from: '2026-11-01',
		to: '2026-11-30',
		weekdays: [false, false, false, false, false, true, true],
		overrides: {},
		minDate: '2026-10-19'
	};
	it('filters range by weekday', () => {
		const d = selectedDates(base);
		expect(d).toHaveLength(9);
		expect(d.every((x) => weekday(x) >= 5)).toBe(true);
	});
	it('applies overrides and keeps them sorted', () => {
		const d = selectedDates({ ...base, overrides: { '2026-11-07': false, '2026-11-04': true, '2026-12-25': true } });
		expect(d).toContain('2026-11-04');
		expect(d).not.toContain('2026-11-07');
		expect(d.at(-1)).toBe('2026-12-25');
		expect([...d].sort()).toEqual(d);
	});
	it('drops past days', () => {
		expect(selectedDates({ ...base, minDate: '2026-11-20' })[0]).toBe('2026-11-21');
	});
});

describe('timezones', () => {
	it('converts wall clock to instant, including DST', () => {
		expect(new Date(zonedToInstant('2026-07-01', '20:00', 'Europe/Amsterdam')).toISOString()).toBe('2026-07-01T18:00:00.000Z');
		expect(new Date(zonedToInstant('2026-12-01', '20:00', 'Europe/Amsterdam')).toISOString()).toBe('2026-12-01T19:00:00.000Z');
		expect(new Date(zonedToInstant('2026-12-01', '20:00', 'America/New_York')).toISOString()).toBe('2026-12-02T01:00:00.000Z');
	});
});
