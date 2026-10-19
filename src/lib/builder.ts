import { addDays, addMonths, monthEnd, monthStart, selectedDates, today } from './dates';
import type { NewOption } from './types';

export interface Slot {
	start: string;
	end: string;
}

export interface BuilderState {
	from: string | null;
	to: string | null;
	weekdays: boolean[];
	overrides: Record<string, boolean>;
	timeMode: 'day' | 'same';
	slots: Slot[];
	month: string;
}

export function initialBuilder(): BuilderState {
	const t = today();
	return {
		from: null,
		to: null,
		weekdays: Array(7).fill(true),
		overrides: {},
		timeMode: 'day',
		slots: [],
		month: monthStart(t)
	};
}

export function datesOf(s: BuilderState): string[] {
	return selectedDates({ from: s.from, to: s.to, weekdays: s.weekdays, overrides: s.overrides, minDate: today() });
}

export function buildOptions(s: BuilderState): NewOption[] {
	const dates = datesOf(s);
	const slots = s.timeMode === 'same' ? s.slots.filter((x) => x.start) : [];
	if (!slots.length) return dates.map((date) => ({ date }));
	const sorted = [...slots].sort((a, b) => a.start.localeCompare(b.start));
	return dates.flatMap((date) => sorted.map((x) => ({ date, startTime: x.start, endTime: x.end || null })));
}

export const WEEKDAY_SETS = {
	weekdays: [true, true, true, true, true, false, false],
	weekends: [false, false, false, false, false, true, true],
	all: Array(7).fill(true)
};

export function quickPicks() {
	const t = today();
	const nextMonth = addMonths(t, 1);
	return [
		{ label: 'Next 7 days', from: t, to: addDays(t, 6), weekdays: WEEKDAY_SETS.all },
		{ label: 'Next 2 weeks', from: t, to: addDays(t, 13), weekdays: WEEKDAY_SETS.all },
		{ label: 'Weekends this month', from: t, to: monthEnd(t), weekdays: WEEKDAY_SETS.weekends },
		{ label: 'Next month', from: nextMonth, to: monthEnd(nextMonth), weekdays: WEEKDAY_SETS.all }
	];
}

export const TIME_PRESETS = [
	{ label: 'Morning', start: '10:00' },
	{ label: 'Afternoon', start: '14:00' },
	{ label: 'Evening', start: '19:00' }
];
