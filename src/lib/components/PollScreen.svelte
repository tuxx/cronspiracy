<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import CopyField from './CopyField.svelte';
	import AdminPanel from './AdminPanel.svelte';
	import FinalBanner from './FinalBanner.svelte';
	import { call, ClientError } from '$lib/client/api';
	import { forget, forgetVote, getMine, rememberedName, rememberName, saveMine } from '$lib/client/store';
	import { localHint, viewerTimeZone } from '$lib/dates';
	import { optionLabel } from '$lib/format';
	import { renderMarkup } from '$lib/markup';
	import { best, fmtScore, tally } from '$lib/score';
	import { LIMITS, type Participant, type PollView, type VoteValue } from '$lib/types';

	let {
		initial,
		adminToken = null,
		publicUrl,
		locale,
		brand
	}: { initial: PollView; adminToken?: string | null; publicUrl: string; locale: string; brand: string } = $props();

	let poll = $state(untrack(() => initial));
	let me = $state<{ participantId: number; editToken: string } | null>(null);
	let viewerTz = $state<string | null>(null);

	// Draft vote
	let editing = $state(false);
	let targetId = $state<number | null>(null); // null = new vote
	let name = $state('');
	let comment = $state('');
	let draft = $state<Record<number, VoteValue>>({});
	let dirty = $state(false);

	let busy = $state(false);
	let err = $state('');
	let flash = $state('');
	let justSaved = $state(false);
	let sortBy = $state<'date' | 'best'>('date');
	let ready = $state(false);

	const shareUrl = $derived(`${publicUrl}/p/${poll.id}`);
	const editUrl = $derived(me ? `${publicUrl}/p/${poll.id}#edit=${me.participantId}.${me.editToken}` : '');
	const labels = $derived(new Map(poll.options.map((o) => [o.id, optionLabel(o, locale)])));
	const editingOwn = $derived(targetId !== null && targetId === poll.youId);
	const values = $derived<VoteValue[]>(poll.allowMaybe ? ['yes', 'maybe', 'no'] : ['yes', 'no']);

	/** Participants as displayed, with the draft folded in so counts update live. */
	const shown = $derived.by<Participant[]>(() => {
		const list = poll.participants.map((p) => (editing && p.id === targetId ? { ...p, votes: draft } : p));
		if (editing && targetId === null && Object.keys(draft).length)
			list.push({ id: -1, name: name.trim() || 'You', comment: null, votes: draft, updatedAt: '' });
		return list;
	});
	const tallies = $derived(tally(poll.options, shown));
	const bestIds = $derived(best(tallies));
	const rows = $derived(poll.participants.filter((p) => !(editing && p.id === targetId)));
	const sortedOptions = $derived(
		sortBy === 'date'
			? poll.options
			: [...poll.options].sort((a, b) => {
					const x = tallies.get(a.id)!;
					const y = tallies.get(b.id)!;
					return y.score - x.score || x.no - y.no;
				})
	);
	const dupName = $derived(
		editing &&
			!editingOwn &&
			targetId === null &&
			name.trim() !== '' &&
			poll.participants.some((p) => p.name.toLowerCase() === name.trim().toLowerCase())
	);
	const comments = $derived(poll.participants.filter((p) => p.comment));
	const finalOption = $derived(poll.options.find((o) => o.id === poll.finalOptionId) ?? null);

	const ICON: Record<VoteValue, string> = { yes: '✔', maybe: '~', no: '✘' };
	const WORD: Record<VoteValue, string> = { yes: 'Yes', maybe: 'If need be', no: 'No' };

	function hint(o: (typeof poll.options)[number]) {
		if (!viewerTz || !o.date || !o.startTime) return null;
		return localHint(o.date, o.startTime, poll.timezone, viewerTz, locale);
	}

	// ---------- lifecycle ----------

	onMount(() => {
		viewerTz = viewerTimeZone();

		// Personal edit link: /p/<id>#edit=<pid>.<token>
		const m = location.hash.match(/^#edit=(\d+)\.([A-Za-z0-9_-]+)$/);
		if (m) {
			saveMine(poll.id, { title: poll.title, participantId: +m[1], editToken: m[2] });
			history.replaceState(history.state, '', location.pathname + location.search);
		}
		if (adminToken) saveMine(poll.id, { title: poll.title, adminToken });

		const mine = getMine(poll.id);
		if (mine?.editToken && mine.participantId) me = { participantId: mine.participantId, editToken: mine.editToken };

		(me ? refresh() : Promise.resolve()).finally(() => {
			if (!me && !poll.votingClosed) startNew();
			ready = true;
		});

		const timer = setInterval(() => {
			if (document.visibilityState === 'visible' && !dirty && !busy) refresh();
		}, 30_000);
		const onVis = () => document.visibilityState === 'visible' && !dirty && !busy && refresh();
		const onLeave = (e: BeforeUnloadEvent) => {
			if (dirty) e.preventDefault();
		};
		document.addEventListener('visibilitychange', onVis);
		window.addEventListener('beforeunload', onLeave);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', onVis);
			window.removeEventListener('beforeunload', onLeave);
		};
	});

	async function refresh() {
		try {
			const v = await call<PollView>('GET', `/api/polls/${poll.id}`, { adminToken, editToken: me?.editToken });
			if (me && v.youId === null) {
				// Our row was removed (or the token is stale).
				forgetVote(poll.id);
				me = null;
			}
			poll = v;
			if (me) saveMine(poll.id, { title: v.title });
		} catch (e) {
			if (e instanceof ClientError && e.code === 'NOT_FOUND') {
				forget(poll.id);
				err = e.message;
			}
		}
	}

	// ---------- drafting ----------

	function startNew() {
		targetId = null;
		name = rememberedName();
		comment = '';
		draft = {};
		dirty = false;
		editing = true;
	}

	function editRow(p: Participant) {
		targetId = p.id;
		name = p.name;
		comment = p.comment ?? '';
		draft = { ...p.votes };
		dirty = false;
		editing = true;
		justSaved = false;
	}

	function cancel() {
		dirty = false;
		err = '';
		if (me || poll.votingClosed) editing = false;
		else startNew();
	}

	function set(oid: number, v: VoteValue | null) {
		if (v) draft[oid] = v;
		else delete draft[oid];
		dirty = true;
	}

	function cycle(oid: number) {
		const order: (VoteValue | null)[] = [...values, null];
		set(oid, order[(order.indexOf(draft[oid] ?? null) + 1) % order.length]);
	}

	function allYes() {
		for (const o of poll.options) draft[o.id] = 'yes';
		dirty = true;
	}
	function clearAll() {
		draft = {};
		dirty = true;
	}

	async function save() {
		err = '';
		flash = '';
		if (!name.trim()) {
			err = 'Enter your name so the others know who voted.';
			document.getElementById('voter-name')?.focus();
			return;
		}
		busy = true;
		const body = { name, comment, votes: draft };
		try {
			if (targetId === null) {
				const res = await call<{ participantId: number; editToken: string }>('POST', `/api/polls/${poll.id}/participants`, {
					body
				});
				me = { participantId: res.participantId, editToken: res.editToken };
				saveMine(poll.id, { title: poll.title, ...me, name });
				justSaved = true;
				flash = 'Vote saved.';
			} else {
				const own = targetId === poll.youId;
				await call('PUT', `/api/polls/${poll.id}/participants/${targetId}`, {
					body,
					editToken: own ? me?.editToken : null,
					adminToken: own ? null : adminToken
				});
				flash = own ? 'Vote updated.' : 'Row updated.';
			}
			if (targetId === null || targetId === poll.youId) rememberName(name.trim());
			dirty = false;
			editing = false;
			await refresh();
		} catch (e) {
			err = e instanceof ClientError ? e.message : 'Could not save. Try again.';
		} finally {
			busy = false;
		}
	}

	let armed = $state<number | null>(null);
	async function removeRow(p: Participant) {
		if (armed !== p.id) {
			armed = p.id;
			setTimeout(() => armed === p.id && (armed = null), 4000);
			return;
		}
		armed = null;
		const own = p.id === poll.youId;
		try {
			await call('DELETE', `/api/polls/${poll.id}/participants/${p.id}`, {
				editToken: own ? me?.editToken : null,
				adminToken: own ? null : adminToken
			});
			if (own) {
				forgetVote(poll.id);
				me = null;
			}
			if (editing && targetId === p.id) cancel();
			flash = own ? 'Your vote was removed.' : `Removed ${p.name}.`;
			await refresh();
			if (own && !poll.votingClosed) startNew();
		} catch (e) {
			err = e instanceof ClientError ? e.message : 'Could not delete. Try again.';
		}
	}

	// Arrow keys move between your vote cells in the grid.
	function rowKey(e: KeyboardEvent) {
		const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
		if (!step) return;
		const cells = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button.cell')];
		const i = cells.indexOf(document.activeElement as HTMLButtonElement);
		if (i < 0) return;
		e.preventDefault();
		cells[Math.max(0, Math.min(cells.length - 1, i + step))].focus();
	}

	// ---------- admin hooks ----------

	async function pickFinal(optionId: number | null) {
		try {
			await call('POST', `/api/polls/${poll.id}/final`, { body: { optionId }, adminToken });
			flash = optionId ? 'Final date set. Voting is closed.' : 'Final date cleared.';
			editing = false;
			await refresh();
		} catch (e) {
			err = e instanceof ClientError ? e.message : 'Could not set the final date.';
		}
	}

	async function onDeleted() {
		forget(poll.id);
		await goto('/mine');
	}

	function fmtDeadline(iso: string) {
		return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', timeZone: viewerTz ?? poll.timezone }).format(
			new Date(iso)
		);
	}
</script>

<svelte:head>
	<title>{poll.title} · {brand}</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta property="og:title" content={poll.title} />
	<meta
		property="og:description"
		content="{poll.options.length} {poll.type === 'date' ? 'dates' : 'options'} · {poll.participantCount} voted"
	/>
	<meta property="og:url" content={shareUrl} />
</svelte:head>

<article>
	<header class="head">
		<p class="dim small file">/p/{poll.id}{adminToken ? '/admin' : ''} · {poll.type === 'date' ? 'date poll' : 'text poll'}</p>
		<h1>{poll.title}</h1>
		<p class="meta dim">
			{#if poll.organiserName}<span>Organised by <strong class="fg">{poll.organiserName}</strong></span>{/if}
			{#if poll.location}<span>📍 {poll.location}</span>{/if}
			<span>{poll.participantCount} voted</span>
			{#if poll.type === 'date' && poll.options.some((o) => o.startTime)}<span>Times in {poll.timezone}</span>{/if}
		</p>
		{#if poll.description}
			<!-- renderMarkup escapes everything except links, bold, italics and line breaks -->
			<div class="desc">{@html renderMarkup(poll.description)}</div>
		{/if}
		{#if poll.deadline && !poll.closed}
			<p class:v-no={poll.votingClosed} class="small">
				{poll.votingClosed ? 'Voting closed on' : 'Voting closes'}
				{fmtDeadline(poll.deadline)}
			</p>
		{/if}
	</header>

	{#if adminToken}
		<AdminPanel bind:poll {adminToken} {locale} {shareUrl} {refresh} {onDeleted} onFlash={(m) => (flash = m)} />
	{/if}

	{#if finalOption}
		<FinalBanner {poll} option={finalOption} {locale} {publicUrl} {adminToken} onClear={() => pickFinal(null)} />
	{:else if poll.votingClosed}
		<p class="notice" role="status">
			Voting is closed{poll.closed ? ' by the organiser' : ''}.
			{adminToken ? 'Reopen it in the admin panel above.' : 'Ask the organiser to reopen it if you still need to vote.'}
		</p>
	{/if}

	{#if flash}<p class="ok" role="status">{flash}</p>{/if}
	{#if err}<p class="alert" role="alert">{err}</p>{/if}

	{#if justSaved && me}
		<div class="panel titled">
			<span class="panel-title">YOUR PERSONAL EDIT LINK</span>
			<p class="small">You can change your vote from this browser anytime. To change it on another device, use this link:</p>
			<CopyField value={editUrl} label="Personal edit link" />
		</div>
	{/if}

	{#if poll.votesHidden}
		<p class="notice">
			🔒 {poll.participantCount}
			{poll.participantCount === 1 ? 'person has' : 'people have'} voted. Their answers stay hidden until you vote, so nobody can
			sway you.
		</p>
	{/if}

	<!-- ---------- voter controls ---------- -->
	{#if editing}
		<section class="you panel titled" aria-label="Your vote">
			<span class="panel-title">{targetId === null ? 'CAST YOUR VOTE' : editingOwn ? 'CHANGE YOUR VOTE' : `EDITING ${name.toUpperCase()}`}</span>
			<label class="field">
				<span>Your name</span>
				<input id="voter-name" bind:value={name} maxlength={LIMITS.name} autocomplete="nickname" oninput={() => (dirty = true)} />
			</label>
			{#if dupName}
				<p class="notice small">
					Someone named <strong>{name.trim()}</strong> already voted. Is that you? Open your personal edit link, or add a last initial.
				</p>
			{/if}
			<p class="dim small">
				Tap each option: <span class="v-yes">✔ yes</span>{#if poll.allowMaybe}, <span class="v-maybe">~ if need be</span>{/if},
				<span class="v-no">✘ no</span>.
			</p>
			<div class="row">
				<button type="button" class="small" onclick={allYes}>Yes to all</button>
				<button type="button" class="small" onclick={clearAll}>Clear</button>
			</div>
		</section>
	{:else if ready && !poll.votingClosed && !me}
		<button class="primary" onclick={startNew}>Vote ►</button>
	{/if}

	<!-- ---------- board ---------- -->
	{#if poll.options.length}
		<div class="toolbar row">
			<h2 class="prompt">Results</h2>
			<span class="spacer"></span>
			<div class="sort small" role="group" aria-label="Sort options">
				<span class="dim">Sort:</span>
				<button class="link" aria-pressed={sortBy === 'date'} onclick={() => (sortBy = 'date')}>{poll.type === 'date' ? 'by date' : 'original'}</button>
				<button class="link" aria-pressed={sortBy === 'best'} onclick={() => (sortBy = 'best')}>by best</button>
			</div>
		</div>

		{#if !poll.participants.length && !poll.votesHidden}
			<div class="empty">
				<p>No one has voted yet. Share the link:</p>
				<CopyField value={shareUrl} label="Share link" />
			</div>
		{/if}

		<!-- Desktop grid -->
		<div class="grid-wrap">
			<table class="grid">
				<thead>
					<tr>
						<th class="name-col" scope="col"><span class="sr-only">Name</span></th>
						{#each sortedOptions as o (o.id)}
							{@const l = labels.get(o.id)!}
							<th scope="col" class:final={o.id === poll.finalOptionId} class:best={bestIds.has(o.id)}>
								<span class="top dim">{l.top}</span>
								<span class="main">{l.main}</span>
								{#if l.time}<span class="time">{l.time}</span>{/if}
								{#if hint(o)}<span class="hint dim">({hint(o)} your time)</span>{/if}
								{#if adminToken && o.id !== poll.finalOptionId}
									<button class="link pick" onclick={() => pickFinal(o.id)} title="Choose this as the final date">pick</button>
								{/if}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each rows as p (p.id)}
						<tr class:mine={p.id === poll.youId}>
							<th scope="row" class="name-col">
								<span class="pname">{p.name}{#if p.id === poll.youId}<span class="dim">&nbsp;(you)</span>{/if}</span>
								{#if !poll.votingClosed && p.id === poll.youId && !editing}
									<button class="link small" onclick={() => editRow(p)}>change</button>
								{/if}
								{#if adminToken && p.id !== poll.youId}
									<button class="link small" onclick={() => editRow(p)}>edit</button>
								{/if}
								{#if adminToken || (p.id === poll.youId && !poll.votingClosed)}
									<button class="link small del" onclick={() => removeRow(p)}>{armed === p.id ? 'sure?' : 'del'}</button>
								{/if}
							</th>
							{#each sortedOptions as o (o.id)}
								{@const v = p.votes[o.id]}
								<td class="c-{v ?? 'none'}" class:final={o.id === poll.finalOptionId}>
									{#if v}<span aria-label={WORD[v]}>{ICON[v]}</span>{:else}<span class="dim" aria-label="No answer">·</span>{/if}
								</td>
							{/each}
						</tr>
					{/each}
					{#if editing}
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<tr class="editrow" onkeydown={rowKey}>
							<th scope="row" class="name-col">{name.trim() || 'You'} <span class="cursor"></span></th>
							{#each sortedOptions as o (o.id)}
								{@const v = draft[o.id]}
								<td class:final={o.id === poll.finalOptionId}>
									<button
										type="button"
										class="cell c-{v ?? 'none'}"
										aria-label="{labels.get(o.id)!.full}: {v ? WORD[v] : 'no answer'}. Press to change."
										onclick={() => cycle(o.id)}>{v ? ICON[v] : '·'}</button
									>
								</td>
							{/each}
						</tr>
					{/if}
				</tbody>
				{#if !poll.votesHidden}
					<tfoot>
						<tr>
							<th scope="row" class="name-col dim">Score</th>
							{#each sortedOptions as o (o.id)}
								{@const t = tallies.get(o.id)!}
								<td class:best={bestIds.has(o.id)} class:final={o.id === poll.finalOptionId}>
									{fmtScore(t.score)}{#if bestIds.has(o.id)}<span class="star" aria-label="best option"> ★</span>{/if}
								</td>
							{/each}
						</tr>
					</tfoot>
				{/if}
			</table>
		</div>

		<!-- Mobile cards -->
		<ul class="cards">
			{#each sortedOptions as o (o.id)}
				{@const l = labels.get(o.id)!}
				{@const t = tallies.get(o.id)!}
				<li class="card" class:best={bestIds.has(o.id)} class:final={o.id === poll.finalOptionId}>
					<div class="card-head">
						<span class="pixel">
							{#if bestIds.has(o.id)}★{/if}
							{l.top}
							{l.main}{#if l.time}
								· {l.time}{:else if o.date}
								<span class="dim small">· whole day</span>{/if}
						</span>
						{#if hint(o)}<span class="dim small">({hint(o)} your time)</span>{/if}
					</div>
					{#if !poll.votesHidden}
						<details>
							<summary>
								<span class="v-yes">✔ {t.yes}</span>
								{#if poll.allowMaybe || t.maybe}<span class="v-maybe">~ {t.maybe}</span>{/if}
								<span class="v-no">✘ {t.no}</span>
								<span class="dim small">· score {fmtScore(t.score)}</span>
							</summary>
							<ul class="names small">
								{#each values as v (v)}
									{#if t.names[v].length}<li class="v-{v}">{ICON[v]} {t.names[v].join(', ')}</li>{/if}
								{/each}
								{#if !t.yes && !t.maybe && !t.no}<li class="dim">No answers yet</li>{/if}
							</ul>
						</details>
					{/if}
					{#if editing}
						<div class="mine-btns" role="group" aria-label="Your answer for {l.full}">
							<span class="dim small">You:</span>
							{#each values as v (v)}
								<button
									type="button"
									class="vbtn v-{v}"
									aria-pressed={draft[o.id] === v}
									onclick={() => set(o.id, draft[o.id] === v ? null : v)}
								>
									{ICON[v]} <span class="sr-only">{WORD[v]}</span>
								</button>
							{/each}
						</div>
					{:else if poll.youId !== null && poll.participants.find((p) => p.id === poll.youId)?.votes[o.id]}
						{@const v = poll.participants.find((p) => p.id === poll.youId)!.votes[o.id]}
						<p class="small">You: <span class="v-{v}">{ICON[v]} {WORD[v]}</span></p>
					{/if}
					{#if adminToken && o.id !== poll.finalOptionId}
						<button class="small pick-card" onclick={() => pickFinal(o.id)}>★ Pick this as final</button>
					{/if}
				</li>
			{/each}
		</ul>

		{#if !editing && me && !poll.votingClosed}
			{@const mine = poll.participants.find((p) => p.id === poll.youId)}
			{#if mine}
				<div class="row mobile-change">
					<button onclick={() => editRow(mine)}>✎ Change my vote</button>
					<button class="danger small" onclick={() => removeRow(mine)}>{armed === mine.id ? 'Really delete?' : 'Delete my vote'}</button>
				</div>
			{/if}
		{/if}

		{#if comments.length}
			<h3 class="prompt">Notes</h3>
			<ul class="comments">
				{#each comments as p (p.id)}
					<li><strong>{p.name}:</strong> {p.comment}</li>
				{/each}
			</ul>
		{/if}
	{/if}
</article>

{#if editing}
	<div class="bar">
		<div class="bar-inner">
			{#if targetId !== null || me}
				<button type="button" class="ghost" onclick={cancel}>Cancel</button>
			{/if}
			<label class="comment">
				<span class="sr-only">Note (optional)</span>
				<input bind:value={comment} maxlength={LIMITS.comment} placeholder="Note (optional)" oninput={() => (dirty = true)} />
			</label>
			<button type="button" class="primary" disabled={busy} onclick={save}>
				{busy ? 'Saving…' : targetId === null ? 'Save vote ►' : 'Update ►'}
			</button>
		</div>
	</div>
{/if}

<style>
	article {
		padding-bottom: 2rem;
	}
	.file {
		margin: 0;
		letter-spacing: 0.05em;
	}
	h1 {
		word-break: break-word;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 1.2rem;
		font-size: 0.9rem;
	}
	.fg {
		color: var(--fg);
		font-weight: normal;
	}
	.desc {
		border-left: 2px solid var(--faint);
		padding-left: 1rem;
		margin: 1rem 0;
		max-width: 70ch;
		word-break: break-word;
	}
	.you {
		max-width: 640px;
	}
	.you .field {
		margin-top: 0.4rem;
	}
	.toolbar {
		margin-top: 1.5rem;
	}
	.toolbar h2 {
		margin: 0;
	}
	.sort button[aria-pressed='true'] {
		color: var(--fg-strong);
		text-decoration: none;
	}
	.empty {
		max-width: 640px;
		margin-bottom: 1rem;
	}

	/* ---------- grid (desktop) ---------- */
	.grid-wrap {
		overflow-x: auto;
		border: 1px solid var(--faint);
		margin-top: 0.8rem;
		max-height: 75vh;
	}
	.grid {
		border-collapse: separate;
		border-spacing: 0;
		min-width: 100%;
	}
	.grid th,
	.grid td {
		border-bottom: 1px solid var(--faint);
		border-right: 1px solid var(--faint);
		padding: 0.35rem 0.5rem;
		text-align: center;
		white-space: nowrap;
		background: var(--bg);
	}
	.grid thead th {
		position: sticky;
		top: 0;
		z-index: 2;
		font-weight: normal;
		vertical-align: bottom;
		min-width: 4.8rem;
	}
	.grid thead th span {
		display: block;
	}
	.grid .main {
		font-family: 'VT323', monospace;
		font-size: 1.35rem;
		color: var(--fg-strong);
	}
	.grid .time,
	.grid .hint {
		font-size: 0.75rem;
	}
	.grid .name-col {
		position: sticky;
		left: 0;
		z-index: 1;
		text-align: left;
		font-weight: normal;
		min-width: 9rem;
		max-width: 14rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.grid thead .name-col {
		z-index: 3;
	}
	.pname {
		margin-right: 0.5rem;
	}
	.grid .link.small {
		font-size: 0.75rem;
		margin-left: 0.3rem;
	}
	.del {
		color: var(--no) !important;
	}
	.pick {
		font-size: 0.75rem !important;
		margin-top: 0.2rem;
	}
	td.c-yes {
		color: var(--yes);
		background: color-mix(in srgb, var(--yes) 12%, var(--bg));
	}
	td.c-maybe {
		color: var(--maybe);
		background: color-mix(in srgb, var(--maybe) 12%, var(--bg));
	}
	td.c-no {
		color: var(--no);
		background: color-mix(in srgb, var(--no) 10%, var(--bg));
	}
	tr.mine th {
		color: var(--fg-strong);
	}
	tr.mine th::before {
		content: '► ';
	}
	.editrow th,
	.editrow td {
		background: var(--bg2);
		border-top: 2px solid var(--fg);
	}
	.cell {
		width: 100%;
		min-width: 3.2rem;
		min-height: 40px;
		padding: 0;
		font-family: inherit;
		font-size: 1.2rem;
		border-style: dashed;
		border-color: var(--dim);
	}
	.cell.c-yes {
		border: 2px solid var(--yes);
		color: var(--yes);
		background: color-mix(in srgb, var(--yes) 18%, transparent);
	}
	.cell.c-maybe {
		border: 2px solid var(--maybe);
		color: var(--maybe);
		background: color-mix(in srgb, var(--maybe) 18%, transparent);
	}
	.cell.c-no {
		border: 2px solid var(--no);
		color: var(--no);
		background: color-mix(in srgb, var(--no) 15%, transparent);
	}
	.cell:hover {
		color: var(--on-accent) !important;
	}
	tfoot td,
	tfoot th {
		font-family: 'VT323', monospace;
		font-size: 1.3rem;
	}
	.grid .best {
		color: var(--fg-strong);
	}
	tfoot td.best {
		background: color-mix(in srgb, var(--fg) 20%, var(--bg));
	}
	.star {
		color: var(--maybe);
	}
	.grid .final {
		box-shadow: inset 2px 0 0 var(--yes), inset -2px 0 0 var(--yes);
	}

	/* ---------- cards (mobile) ---------- */
	.cards {
		display: none;
		list-style: none;
		padding: 0;
		margin: 0.8rem 0 0;
	}
	.card {
		border: 1px solid var(--faint);
		padding: 0.7rem 0.8rem;
		margin-bottom: 0.6rem;
		background: var(--panel);
	}
	.card.best {
		border-color: var(--fg);
	}
	.card.final {
		border: 2px solid var(--yes);
	}
	.card-head .pixel {
		font-size: 1.45rem;
		display: block;
	}
	summary {
		cursor: pointer;
		display: flex;
		gap: 1rem;
		align-items: baseline;
		padding: 0.3rem 0;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary::before {
		content: '+';
		color: var(--dim);
	}
	details[open] summary::before {
		content: '−';
	}
	.names {
		list-style: none;
		padding: 0 0 0 1rem;
		margin: 0.2rem 0;
	}
	.mine-btns {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.4rem;
	}
	.vbtn {
		flex: 1;
		font-size: 1.4rem;
		border-color: currentColor;
		border-style: dashed;
	}
	.vbtn.v-yes {
		color: var(--yes);
	}
	.vbtn.v-maybe {
		color: var(--maybe);
	}
	.vbtn.v-no {
		color: var(--no);
	}
	.vbtn[aria-pressed='true'] {
		border-style: solid;
		background: currentColor;
	}
	.vbtn[aria-pressed='true'] :global(*),
	.vbtn[aria-pressed='true'] {
		text-shadow: none;
	}
	.vbtn.v-yes[aria-pressed='true'] {
		background: var(--yes);
		color: var(--on-accent);
	}
	.vbtn.v-maybe[aria-pressed='true'] {
		background: var(--maybe);
		color: var(--on-accent);
	}
	.vbtn.v-no[aria-pressed='true'] {
		background: var(--no);
		color: var(--on-accent);
	}
	.pick-card {
		margin-top: 0.5rem;
	}
	.mobile-change {
		display: none;
		margin-top: 1rem;
	}
	.comments {
		padding-left: 1.2rem;
	}

	@media (max-width: 640px) {
		.grid-wrap {
			display: none;
		}
		.cards,
		.mobile-change {
			display: block;
		}
		.mobile-change {
			display: flex;
		}
	}

	/* ---------- save bar ---------- */
	.bar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 50;
		background: var(--bg);
		border-top: 2px solid var(--fg);
		box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.5);
	}
	.bar-inner {
		max-width: 1100px;
		margin: 0 auto;
		padding: 0.6rem 16px calc(0.6rem + env(safe-area-inset-bottom));
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.comment {
		flex: 1;
		min-width: 0;
	}
	.bar .primary {
		flex: none;
	}
</style>
