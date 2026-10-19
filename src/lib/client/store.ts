// Per-browser memory of polls you created or voted on. localStorage only; can be empty or throw.

export interface MyPoll {
	id: string;
	title: string;
	adminToken?: string;
	participantId?: number;
	editToken?: string;
	name?: string;
	touched: string;
}

const KEY = 'cronspiracy:polls';
const NAME_KEY = 'cronspiracy:name';

function read(): Record<string, MyPoll> {
	try {
		const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		return v && typeof v === 'object' ? v : {};
	} catch {
		return {};
	}
}

function write(all: Record<string, MyPoll>) {
	try {
		localStorage.setItem(KEY, JSON.stringify(all));
	} catch {
		/* storage unavailable: links still work */
	}
}

export function getMine(id: string): MyPoll | undefined {
	return read()[id];
}

export function listMine(): MyPoll[] {
	return Object.values(read()).sort((a, b) => b.touched.localeCompare(a.touched));
}

export function saveMine(id: string, patch: Partial<MyPoll>) {
	const all = read();
	all[id] = { ...(all[id] ?? { id, title: '' }), ...patch, id, touched: new Date().toISOString() } as MyPoll;
	write(all);
}

export function forgetVote(id: string) {
	const all = read();
	if (!all[id]) return;
	delete all[id].participantId;
	delete all[id].editToken;
	if (!all[id].adminToken) delete all[id];
	write(all);
}

export function forget(id: string) {
	const all = read();
	delete all[id];
	write(all);
}

/** Merge an exported blob into this browser. Returns how many polls were added/updated. */
export function importMine(json: string): number {
	const incoming = JSON.parse(json);
	const list: MyPoll[] = Array.isArray(incoming) ? incoming : Object.values(incoming);
	const all = read();
	let n = 0;
	for (const p of list) {
		if (!p || typeof p.id !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{10}$/.test(p.id)) continue;
		all[p.id] = { ...all[p.id], ...p, touched: p.touched ?? new Date().toISOString() };
		n++;
	}
	write(all);
	return n;
}

export function exportMine(): string {
	return JSON.stringify(listMine(), null, 2);
}

export function rememberedName(): string {
	try {
		return localStorage.getItem(NAME_KEY) ?? '';
	} catch {
		return '';
	}
}
export function rememberName(name: string) {
	try {
		localStorage.setItem(NAME_KEY, name);
	} catch {
		/* ignore */
	}
}
