<script lang="ts">
	import { datesOf, quickPicks, TIME_PRESETS, WEEKDAY_SETS, type BuilderState } from '$lib/builder';
	import { addMonths, fmtDate, fmtMonth, monthGrid, monthStart, today, weekday } from '$lib/dates';

	let { state: s }: { state: BuilderState } = $props();

	const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
	const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
	const t = today();
	const picks = quickPicks();

	let dates = $derived(datesOf(s));
	let selected = $derived(new Set(dates));
	let manual = $derived(Object.keys(s.overrides).length);
	let weeks = $derived(monthGrid(s.month));
	let monthCount = $derived(dates.filter((d) => d.startsWith(s.month.slice(0, 7))).length);
	let canPrev = $derived(s.month > monthStart(t));

	function applyPick(p: (typeof picks)[number]) {
		s.from = p.from;
		s.to = p.to;
		s.weekdays = [...p.weekdays];
		s.month = monthStart(p.from);
	}

	function setWeekdays(set: boolean[]) {
		s.weekdays = [...set];
	}

	function toggle(d: string) {
		const on = selected.has(d);
		const generated = !!(s.from && s.to && d >= s.from && d <= s.to && s.weekdays[weekday(d)]);
		// Remove the override if toggling brings the day back to what the range generates.
		if (on === generated) s.overrides[d] = !on;
		else delete s.overrides[d];
	}

	function onFrom() {
		if (s.from && (!s.to || s.to < s.from)) s.to = s.from;
		if (s.from) s.month = monthStart(s.from);
	}

	function addSlot(start = '12:00') {
		if (s.slots.length >= 5) return;
		if (s.slots.some((x) => x.start === start)) return;
		s.slots.push({ start, end: '' });
	}

	function inRange(d: string) {
		return !!(s.from && s.to && d >= s.from && d <= s.to);
	}

	// Keyboard: arrows move between days in the grid.
	function onGridKey(e: KeyboardEvent) {
		const el = e.target as HTMLElement;
		const d = el.dataset.date;
		if (!d) return;
		const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
		if (!step) return;
		e.preventDefault();
		const cells = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button[data-date]')];
		const i = cells.indexOf(el as HTMLButtonElement);
		cells[Math.max(0, Math.min(cells.length - 1, i + step))]?.focus();
	}
</script>

<div class="builder">
	<section aria-labelledby="qp">
		<h3 id="qp" class="prompt">Quick picks</h3>
		<div class="row">
			{#each picks as p (p.label)}
				<button type="button" class="small" onclick={() => applyPick(p)}>{p.label}</button>
			{/each}
		</div>
	</section>

	<section class="range">
		<label class="field">
			<span>From</span>
			<input type="date" min={t} bind:value={s.from} onchange={onFrom} />
		</label>
		<label class="field">
			<span>To</span>
			<input type="date" min={s.from ?? t} bind:value={s.to} />
		</label>
	</section>

	<section aria-labelledby="only">
		<h3 id="only" class="prompt">Only on</h3>
		<div class="chips" role="group" aria-labelledby="only">
			{#each DAYS as d, i (d)}
				<button
					type="button"
					class="chip"
					aria-pressed={s.weekdays[i]}
					aria-label={DAY_NAMES[i]}
					onclick={() => (s.weekdays[i] = !s.weekdays[i])}>{d}</button
				>
			{/each}
		</div>
		<div class="row presets">
			<button type="button" class="link" onclick={() => setWeekdays(WEEKDAY_SETS.weekdays)}>weekdays</button>
			<button type="button" class="link" onclick={() => setWeekdays(WEEKDAY_SETS.weekends)}>weekends</button>
			<button type="button" class="link" onclick={() => setWeekdays(WEEKDAY_SETS.all)}>all</button>
		</div>
	</section>

	<section class="cal panel titled" aria-label="Calendar preview">
		<span class="panel-title">CALENDAR</span>
		<div class="cal-head">
			<button type="button" class="small" disabled={!canPrev} onclick={() => (s.month = addMonths(s.month, -1))} aria-label="Previous month">◀</button>
			<div class="cal-title">
				<span class="pixel">{fmtMonth(s.month)}</span>
				<span class="dim small">{monthCount} selected</span>
			</div>
			<button type="button" class="small" onclick={() => (s.month = addMonths(s.month, 1))} aria-label="Next month">▶</button>
		</div>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<table role="grid" onkeydown={onGridKey}>
			<thead>
				<tr>{#each DAYS as d (d)}<th scope="col" class="dim">{d}</th>{/each}</tr>
			</thead>
			<tbody>
				{#each weeks as week, wi (wi)}
					<tr>
						{#each week as d, di (di)}
							<td>
								{#if d}
									<button
										type="button"
										class="day"
										data-date={d}
										class:on={selected.has(d)}
										class:out={!inRange(d)}
										class:manual={d in s.overrides}
										disabled={d < t}
										aria-pressed={selected.has(d)}
										aria-label={fmtDate(d, undefined, { weekday: 'long', month: 'long', year: 'numeric' })}
										onclick={() => toggle(d)}>{+d.slice(8)}</button
									>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="dim small">
			Tap a day to add or remove it.
			{#if manual}
				· {manual} manual change{manual === 1 ? '' : 's'} ·
				<button type="button" class="link" onclick={() => (s.overrides = {})}>reset</button>
			{/if}
		</p>
	</section>

	<section aria-labelledby="times">
		<h3 id="times" class="prompt">Times</h3>
		<label class="check"><input type="radio" bind:group={s.timeMode} value="day" /> <span>Whole day</span></label>
		<label class="check"
			><input type="radio" bind:group={s.timeMode} value="same" onchange={() => s.slots.length || addSlot('19:00')} />
			<span>Same times every day</span></label
		>
		{#if s.timeMode === 'same'}
			<div class="slots">
				{#each s.slots as slot, i (i)}
					<div class="slot">
						<label><span class="sr-only">Start time {i + 1}</span><input type="time" bind:value={slot.start} required /></label>
						<span class="dim">→</span>
						<label><span class="sr-only">End time {i + 1} (optional)</span><input type="time" bind:value={slot.end} /></label>
						<button type="button" class="ghost small" aria-label="Remove time slot" onclick={() => s.slots.splice(i, 1)}>✘</button>
					</div>
				{/each}
				<p class="dim small">End time is optional.</p>
				{#if s.slots.length < 5}
					<div class="row">
						{#each TIME_PRESETS as p (p.start)}
							<button type="button" class="small" onclick={() => addSlot(p.start)}>+ {p.label} {p.start}</button>
						{/each}
						<button type="button" class="small" onclick={() => addSlot()}>+ Custom…</button>
					</div>
				{/if}
			</div>
		{/if}
	</section>
</div>

<style>
	.builder section {
		margin-bottom: 1.2rem;
	}
	.range {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0 1rem;
	}
	.range .field {
		margin: 0;
	}
	.chips {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.chip {
		min-width: 44px;
		padding: 0.3em 0.5em;
		border-radius: 999px;
		border-style: dashed;
		color: var(--dim);
		border-color: var(--dim);
	}
	.chip[aria-pressed='true'] {
		background: var(--fg);
		color: var(--on-accent);
		border-style: solid;
		border-color: var(--fg);
		text-shadow: none;
	}
	.presets {
		margin-top: 0.4rem;
		font-size: 0.9rem;
	}
	.cal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.cal-title {
		text-align: center;
		display: flex;
		flex-direction: column;
	}
	.cal-title .pixel {
		font-size: 1.6rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 0.5rem;
		table-layout: fixed;
	}
	th {
		font-weight: normal;
		font-size: 0.8rem;
		padding-bottom: 0.3rem;
	}
	td {
		padding: 2px;
		text-align: center;
	}
	.day {
		width: 100%;
		min-height: 44px;
		padding: 0;
		font-family: inherit;
		font-size: 1rem;
		border: 1px solid var(--faint);
		color: var(--fg);
	}
	.day.out {
		color: var(--dim);
		border-color: transparent;
	}
	.day.on {
		background: var(--fg);
		color: var(--on-accent);
		border-color: var(--fg);
		text-shadow: none;
	}
	.day.manual {
		border-style: dashed;
		border-color: var(--warn);
	}
	.day:disabled {
		opacity: 0.25;
		text-decoration: line-through;
	}
	.slots {
		margin-left: 2.1em;
	}
	.slot {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 0.5rem;
	}
	.slot input {
		width: 8.5em;
	}
</style>
