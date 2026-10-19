import { describe, expect, it } from 'vitest';
import { toIcs } from './calendar';

const base = { uid: 'x@y', title: 'Game, night', description: null, location: null, url: 'https://e.com/p/x', timezone: 'Europe/Amsterdam' };

describe('ics', () => {
	it('writes whole-day events as DATE values', () => {
		const ics = toIcs({ ...base, option: { id: 1, date: '2026-11-22', startTime: null, endTime: null, label: null } });
		expect(ics).toContain('DTSTART;VALUE=DATE:20261122');
		expect(ics).toContain('DTEND;VALUE=DATE:20261123');
		expect(ics).toContain('SUMMARY:Game\\, night');
		expect(ics).toMatch(/\r\n$/);
	});
	it('writes timed events in UTC', () => {
		const ics = toIcs({ ...base, option: { id: 1, date: '2026-11-22', startTime: '19:00', endTime: '22:30', label: null } });
		expect(ics).toContain('DTSTART:20261122T180000Z');
		expect(ics).toContain('DTEND:20261122T213000Z');
	});
});
