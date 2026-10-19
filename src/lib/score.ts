import type { Participant, PollOption, VoteValue } from './types';

export interface Tally {
	yes: number;
	maybe: number;
	no: number;
	score: number;
	names: Record<VoteValue, string[]>;
}

export function tally(options: PollOption[], participants: Participant[]): Map<number, Tally> {
	const out = new Map<number, Tally>();
	for (const o of options) {
		const t: Tally = { yes: 0, maybe: 0, no: 0, score: 0, names: { yes: [], maybe: [], no: [] } };
		for (const p of participants) {
			const v = p.votes[o.id];
			if (!v) continue;
			t[v]++;
			t.names[v].push(p.name);
		}
		t.score = t.yes + t.maybe / 2;
		out.set(o.id, t);
	}
	return out;
}

/** Ids of the best option(s): highest score, ties broken by fewest "no". Empty when nobody voted yes/maybe. */
export function best(tallies: Map<number, Tally>): Set<number> {
	let top: Tally | null = null;
	for (const t of tallies.values()) {
		if (t.score === 0) continue;
		if (!top || t.score > top.score || (t.score === top.score && t.no < top.no)) top = t;
	}
	const ids = new Set<number>();
	if (!top) return ids;
	for (const [id, t] of tallies) if (t.score === top.score && t.no === top.no) ids.add(id);
	return ids;
}

export const fmtScore = (n: number) => (n % 1 ? `${Math.floor(n) || ''}½` : String(n));
