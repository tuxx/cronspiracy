import { describe, expect, it } from 'vitest';
import { best, fmtScore, tally } from './score';
import type { Participant, PollOption } from './types';

const opt = (id: number): PollOption => ({ id, date: null, startTime: null, endTime: null, label: `o${id}` });
const p = (id: number, votes: Participant['votes']): Participant => ({ id, name: `p${id}`, comment: null, votes, updatedAt: '' });

describe('scoring', () => {
	it('scores yes + ½ maybe and breaks ties on fewer no', () => {
		const t = tally([opt(1), opt(2), opt(3)], [
			p(1, { 1: 'yes', 2: 'yes', 3: 'maybe' }),
			p(2, { 1: 'maybe', 2: 'maybe', 3: 'no' }),
			p(3, { 1: 'no' })
		]);
		expect(t.get(1)!.score).toBe(1.5);
		expect(t.get(2)!.score).toBe(1.5);
		expect([...best(t)]).toEqual([2]);
	});
	it('has no best option when nobody said yes or maybe', () => {
		expect(best(tally([opt(1)], [p(1, { 1: 'no' })])).size).toBe(0);
	});
	it('formats halves', () => {
		expect(fmtScore(2.5)).toBe('2½');
		expect(fmtScore(0.5)).toBe('½');
		expect(fmtScore(3)).toBe('3');
	});
});
