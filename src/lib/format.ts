import { fmtDate, fmtTime } from './dates';
import type { PollOption } from './types';

export interface OptionLabel {
	top: string; // "Sat" (date) or the text label
	main: string; // "8 Nov"
	time: string | null; // "19:00–21:00"
	full: string; // one-line, for aria / banners
}

export function optionLabel(o: PollOption, locale?: string): OptionLabel {
	if (!o.date) return { top: '', main: o.label ?? '', time: null, full: o.label ?? '' };
	const top = fmtDate(o.date, locale, { weekday: 'short', day: undefined, month: undefined });
	const main = fmtDate(o.date, locale, { weekday: undefined, day: 'numeric', month: 'short' });
	const time = o.startTime ? fmtTime(o.startTime, locale) + (o.endTime ? `–${fmtTime(o.endTime, locale)}` : '') : null;
	const full = `${fmtDate(o.date, locale, { weekday: 'long', day: 'numeric', month: 'long' })}${time ? `, ${time}` : ''}`;
	return { top, main, time, full };
}
