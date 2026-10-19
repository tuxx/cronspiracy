// Plain-date maths. Dates are 'YYYY-MM-DD' strings and computed in UTC so DST never shifts a day.

const DAY = 86_400_000;

export const toUTC = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => fromUTC(toUTC(d) + n * DAY);
/** 0 = Monday … 6 = Sunday */
export const weekday = (d: string) => (new Date(toUTC(d)).getUTCDay() + 6) % 7;
export const isDate = (s: unknown): s is string =>
	typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUTC(toUTC(s)) === s;
export const isTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Today's date in the viewer's (or given) timezone. */
export function today(timeZone?: string): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
		new Date()
	);
}

export function monthStart(d: string) {
	return d.slice(0, 8) + '01';
}
export function addMonths(d: string, n: number) {
	const dt = new Date(toUTC(monthStart(d)));
	dt.setUTCMonth(dt.getUTCMonth() + n);
	return fromUTC(dt.getTime());
}
export function monthEnd(d: string) {
	return addDays(addMonths(d, 1), -1);
}

export function* range(from: string, to: string) {
	for (let t = toUTC(from), end = toUTC(to); t <= end; t += DAY) yield fromUTC(t);
}

export interface DateSelection {
	from: string | null;
	to: string | null;
	weekdays: boolean[]; // 7 entries, Monday first
	/** date -> true (force include) / false (force exclude) */
	overrides: Record<string, boolean>;
	minDate: string; // usually today; earlier days are never selected
}

/** The concrete set of dates produced by range + weekday filter + manual overrides. */
export function selectedDates(s: DateSelection): string[] {
	const set = new Set<string>();
	if (s.from && s.to && s.from <= s.to) {
		for (const d of range(s.from, s.to)) if (s.weekdays[weekday(d)] && d >= s.minDate) set.add(d);
	}
	for (const [d, on] of Object.entries(s.overrides)) {
		if (on && d >= s.minDate) set.add(d);
		else set.delete(d);
	}
	return [...set].sort();
}

/** Calendar grid for a month: weeks of 7 cells (null = padding), Monday first. */
export function monthGrid(month: string): (string | null)[][] {
	const first = monthStart(month);
	const cells: (string | null)[] = Array(weekday(first)).fill(null);
	for (const d of range(first, monthEnd(first))) cells.push(d);
	while (cells.length % 7) cells.push(null);
	const weeks = [];
	for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
	return weeks;
}

// ---------- formatting ----------

export function fmtDate(d: string, locale?: string, opts: Intl.DateTimeFormatOptions = {}) {
	return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC', ...opts }).format(
		new Date(toUTC(d))
	);
}

export function fmtMonth(d: string, locale?: string) {
	return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(toUTC(d)));
}

export function fmtTime(t: string, locale?: string) {
	const [h, m] = t.split(':').map(Number);
	return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(
		new Date(Date.UTC(2000, 0, 1, h, m))
	);
}

// ---------- timezones ----------

/** Offset (ms) of `timeZone` from UTC at the instant `ms`. */
function tzOffset(ms: number, timeZone: string) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(new Date(ms));
	const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
	return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}

/** Wall-clock date+time in `timeZone` → UTC epoch ms. */
export function zonedToInstant(date: string, time: string, timeZone: string): number {
	const [h, m] = time.split(':').map(Number);
	const guess = toUTC(date) + (h * 60 + m) * 60_000;
	let ms = guess - tzOffset(guess, timeZone);
	ms = guess - tzOffset(ms, timeZone); // second pass settles DST edges
	return ms;
}

export function isTimeZone(tz: unknown): tz is string {
	if (typeof tz !== 'string' || tz.length > 64) return false;
	try {
		new Intl.DateTimeFormat('en', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

export function viewerTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** "20:00" formatted in the viewer's timezone, or null when it matches the poll's. */
export function localHint(date: string, time: string, pollTz: string, viewerTz: string, locale?: string): string | null {
	const ms = zonedToInstant(date, time, pollTz);
	const fmt = (tz: string) =>
		new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(ms);
	const mine = fmt(viewerTz);
	return mine === fmt(pollTz) ? null : mine;
}
