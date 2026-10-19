import { addDays, zonedToInstant } from './dates';
import type { PollOption } from './types';

export interface EventInfo {
	uid: string;
	title: string;
	description: string | null;
	location: string | null;
	url: string;
	option: PollOption;
	timezone: string;
}

const compact = (d: string) => d.replace(/-/g, '');
const utcStamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Start/end as calendar strings. Whole day → DATE values; timed → UTC instants (default length 2h). */
function span(e: EventInfo) {
	const o = e.option;
	if (!o.date) return null;
	if (!o.startTime) return { allDay: true, start: compact(o.date), end: compact(addDays(o.date, 1)) };
	const start = zonedToInstant(o.date, o.startTime, e.timezone);
	let end = o.endTime ? zonedToInstant(o.date, o.endTime, e.timezone) : start + 2 * 3600_000;
	if (end <= start) end += 86_400_000; // e.g. 22:00–01:00
	return { allDay: false, start: utcStamp(start), end: utcStamp(end) };
}

const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function fold(line: string) {
	const out = [];
	while (line.length > 74) {
		out.push(line.slice(0, 74));
		line = ' ' + line.slice(74);
	}
	out.push(line);
	return out.join('\r\n');
}

export function toIcs(e: EventInfo): string {
	const s = span(e)!;
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Cronspiracy//EN',
		'CALSCALE:GREGORIAN',
		'BEGIN:VEVENT',
		`UID:${e.uid}`,
		`DTSTAMP:${utcStamp(Date.now())}`,
		s.allDay ? `DTSTART;VALUE=DATE:${s.start}` : `DTSTART:${s.start}`,
		s.allDay ? `DTEND;VALUE=DATE:${s.end}` : `DTEND:${s.end}`,
		`SUMMARY:${icsEscape(e.title)}`,
		e.description ? `DESCRIPTION:${icsEscape(e.description + '\n\n' + e.url)}` : `DESCRIPTION:${icsEscape(e.url)}`,
		e.location ? `LOCATION:${icsEscape(e.location)}` : null,
		`URL:${e.url}`,
		'END:VEVENT',
		'END:VCALENDAR'
	].filter((l): l is string => l !== null);
	return lines.map(fold).join('\r\n') + '\r\n';
}

export function googleUrl(e: EventInfo) {
	const s = span(e)!;
	const p = new URLSearchParams({
		action: 'TEMPLATE',
		text: e.title,
		dates: `${s.start}/${s.end}`,
		details: [e.description, e.url].filter(Boolean).join('\n\n')
	});
	if (e.location) p.set('location', e.location);
	return `https://calendar.google.com/calendar/render?${p}`;
}

export function outlookUrl(e: EventInfo) {
	const o = e.option;
	const iso = (ms: number) => new Date(ms).toISOString();
	const p = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: e.title, body: e.url });
	if (!o.startTime) {
		p.set('startdt', o.date!);
		p.set('enddt', addDays(o.date!, 1));
		p.set('allday', 'true');
	} else {
		const start = zonedToInstant(o.date!, o.startTime, e.timezone);
		const end = o.endTime ? zonedToInstant(o.date!, o.endTime, e.timezone) : start + 2 * 3600_000;
		p.set('startdt', iso(start));
		p.set('enddt', iso(end > start ? end : end + 86_400_000));
	}
	if (e.location) p.set('location', e.location);
	return `https://outlook.live.com/calendar/0/deeplink/compose?${p}`;
}
