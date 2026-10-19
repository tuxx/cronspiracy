<script lang="ts">
	import DateBuilder from '$lib/components/DateBuilder.svelte';
	import CopyField from '$lib/components/CopyField.svelte';
	import { buildOptions, initialBuilder } from '$lib/builder';
	import { call, ClientError } from '$lib/client/api';
	import { rememberedName, rememberName, saveMine } from '$lib/client/store';
	import { viewerTimeZone } from '$lib/dates';
	import { LIMITS, type NewOption } from '$lib/types';
	import { onMount, tick } from 'svelte';

	let { data } = $props();

	type Step = 1 | 2 | 3 | 'done';
	let step = $state<Step>(1);

	let title = $state('');
	let description = $state('');
	let location = $state('');
	let organiserName = $state('');
	let website = $state(''); // honeypot

	let kind = $state<'date' | 'text'>('date');
	let builder = $state(initialBuilder());
	let textOptions = $state<string[]>(['', '']);

	let allowMaybe = $state(true);
	let hideVotes = $state(false);
	let hideNames = $state(false);
	let deadline = $state('');
	let expiryDays = $state<7 | 30 | 90>(30);
	let password = $state('');
	let timezone = $state('UTC');

	let busy = $state(false);
	let err = $state('');
	let created = $state<{ id: string; adminToken: string } | null>(null);

	onMount(() => {
		timezone = viewerTimeZone();
		organiserName = rememberedName();
		if ([7, 30, 90].includes(data.defaultExpiryDays)) expiryDays = data.defaultExpiryDays as 7 | 30 | 90;
	});

	let options: NewOption[] = $derived(
		kind === 'date'
			? buildOptions(builder)
			: textOptions.map((l) => l.trim()).filter(Boolean).map((label) => ({ label }))
	);
	let count = $derived(options.length);
	let overLimit = $derived(count > data.maxOptions);
	let nearLimit = $derived(count > data.maxOptions * 0.8);

	let canNext = $derived(
		step === 1 ? title.trim().length > 0 : step === 2 ? count > 0 && !overLimit : !busy
	);

	async function go(to: Step) {
		err = '';
		step = to;
		await tick();
		document.getElementById('step-heading')?.focus();
		window.scrollTo({ top: 0 });
	}

	function next() {
		if (!canNext) {
			if (step === 1) err = 'Give your poll a title first.';
			else if (step === 2) err = overLimit ? `Too many options: the maximum is ${data.maxOptions}.` : 'Pick at least one option.';
			return;
		}
		if (step === 1) go(2);
		else if (step === 2) go(3);
		else submit();
	}

	async function submit() {
		busy = true;
		err = '';
		try {
			const res = await call<{ id: string; adminToken: string }>('POST', '/api/polls', {
				body: {
					type: kind,
					title,
					description,
					location,
					organiserName,
					timezone,
					options,
					allowMaybe,
					hideVotes,
					hideNames,
					deadline: deadline ? new Date(deadline).toISOString() : null,
					expiryDays,
					password: password || undefined,
					website
				}
			});
			created = res;
			saveMine(res.id, { title, adminToken: res.adminToken });
			if (organiserName) rememberName(organiserName);
			go('done');
		} catch (e) {
			err = e instanceof ClientError ? e.message : 'Something went wrong. Try again.';
		} finally {
			busy = false;
		}
	}

	function textKey(e: KeyboardEvent, i: number) {
		if (e.key === 'Enter') {
			e.preventDefault();
			textOptions.splice(i + 1, 0, '');
			tick().then(() => document.getElementById(`opt-${i + 1}`)?.focus());
		} else if (e.key === 'Backspace' && !textOptions[i] && textOptions.length > 1) {
			e.preventDefault();
			textOptions.splice(i, 1);
			tick().then(() => document.getElementById(`opt-${Math.max(0, i - 1)}`)?.focus());
		}
	}

	function textPaste(e: ClipboardEvent, i: number) {
		const lines = (e.clipboardData?.getData('text') ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
		if (lines.length < 2) return;
		e.preventDefault();
		textOptions.splice(i, textOptions[i] ? 0 : 1, ...lines);
	}

	let shareUrl = $derived(created ? `${data.publicUrl}/p/${created.id}` : '');
	let adminUrl = $derived(created ? `${data.publicUrl}/p/${created.id}/admin/${created.adminToken}` : '');
	let mailto = $derived(
		`mailto:?subject=${encodeURIComponent(`Admin link: ${title}`)}&body=${encodeURIComponent(
			`Admin link for your poll "${title}". Keep it secret:\n\n${adminUrl}\n\nShare link for participants:\n${shareUrl}`
		)}`
	);
	const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

	const STEPS = ['What', 'When', 'Settings'];
</script>

<svelte:head>
	<title>{step === 'done' ? 'Poll created' : 'New poll'} · {data.brand}</title>
</svelte:head>

{#if step !== 'done'}
	<p class="intro">
		<span class="prompt">When can everyone make it? Pick some dates, send the link, let the group vote.</span
		><span class="cursor"></span>
	</p>

	<ol class="steps" aria-label="Progress">
		{#each STEPS as label, i (label)}
			<li aria-current={step === i + 1 ? 'step' : undefined} class:done={typeof step === 'number' && step > i + 1}>
				<span class="dim">0{i + 1}</span>
				{label}
			</li>
		{/each}
	</ol>
{/if}

<form
	onsubmit={(e) => {
		e.preventDefault();
		next();
	}}
	novalidate
>
	<!-- Honeypot: humans never see this. -->
	<label class="hp" aria-hidden="true">Website <input tabindex="-1" autocomplete="off" bind:value={website} /></label>

	{#if step === 1}
		<h1 id="step-heading" tabindex="-1">What's the plan?</h1>
		<label class="field">
			<span>Title *</span>
			<input bind:value={title} maxlength={LIMITS.title} placeholder="Board game night" required />
		</label>
		<label class="field">
			<span>Description <span class="dim">(optional)</span></span>
			<textarea bind:value={description} maxlength={LIMITS.description} rows="3" placeholder="Bring snacks. **Bold** and links work."></textarea>
		</label>
		<label class="field">
			<span>Location <span class="dim">(optional)</span></span>
			<input bind:value={location} maxlength={LIMITS.location} placeholder="The usual place" />
		</label>
		<label class="field">
			<span>Your name <span class="dim">(optional, shown as "organised by")</span></span>
			<input bind:value={organiserName} maxlength={LIMITS.name} autocomplete="nickname" />
		</label>
	{:else if step === 2}
		<h1 id="step-heading" tabindex="-1">When?</h1>
		{#if kind === 'date'}
			<DateBuilder state={builder} />
			<p class="dim small">
				Not about dates? <button type="button" class="link" onclick={() => (kind = 'text')}>Use text options instead</button>
			</p>
		{:else}
			<p class="dim">Each option gets its own line. Press Enter for the next one, or paste a list.</p>
			{#each textOptions as _, i (i)}
				<div class="textopt">
					<span class="dim">{String(i + 1).padStart(2, '0')}</span>
					<input
						id="opt-{i}"
						bind:value={textOptions[i]}
						maxlength={LIMITS.optionLabel}
						placeholder={i === 0 ? 'Pizza' : i === 1 ? 'Sushi' : ''}
						onkeydown={(e) => textKey(e, i)}
						onpaste={(e) => textPaste(e, i)}
						aria-label="Option {i + 1}"
					/>
					<button type="button" class="ghost small" aria-label="Remove option {i + 1}" disabled={textOptions.length < 2} onclick={() => textOptions.splice(i, 1)}>✘</button>
				</div>
			{/each}
			<button type="button" class="small" onclick={() => textOptions.push('')}>+ Add option</button>
			<p class="dim small">
				<button type="button" class="link" onclick={() => (kind = 'date')}>Back to picking dates</button>
			</p>
		{/if}
	{:else if step === 3}
		<h1 id="step-heading" tabindex="-1">Settings</h1>
		<p class="dim">The defaults are fine for most polls.</p>

		<label class="check"
			><input type="checkbox" bind:checked={allowMaybe} />
			<span>Allow "if need be" answers <span class="dim small">— besides yes and no</span></span></label
		>
		<label class="check"
			><input type="checkbox" bind:checked={hideVotes} />
			<span>Keep votes secret until you've voted <span class="dim small">— people can't be swayed by what others picked</span></span></label
		>
		<label class="check"
			><input type="checkbox" bind:checked={hideNames} />
			<span>Hide participants' names from each other <span class="dim small">— you still see them</span></span></label
		>

		<label class="field">
			<span>Voting deadline <span class="dim">(optional)</span></span>
			<input type="datetime-local" bind:value={deadline} />
		</label>

		<label class="field">
			<span>Delete the poll automatically</span>
			<select bind:value={expiryDays}>
				<option value={7}>7 days after the last date</option>
				<option value={30}>30 days after the last date</option>
				<option value={90}>90 days after the last date</option>
			</select>
		</label>

		<p class="dim small">Times are in <strong>{timezone}</strong>.</p>

		{#if data.createPasswordRequired}
			<label class="field">
				<span>Creation password *</span>
				<input type="password" bind:value={password} autocomplete="off" />
			</label>
		{/if}
	{:else if created}
		<h1 id="step-heading" tabindex="-1" class="cursor">Poll created</h1>
		<p>Send this link to everyone who should vote:</p>
		<CopyField value={shareUrl} label="Share link" />
		<div class="row" style="margin-top:.6rem">
			{#if canShare}
				<button type="button" onclick={() => navigator.share({ title, url: shareUrl }).catch(() => {})}>Share…</button>
			{/if}
			<a class="btn" href="/p/{created.id}">Open poll</a>
		</div>

		<div class="panel titled master">
			<span class="panel-title">⚠ YOUR ADMIN LINK</span>
			<p>
				<strong>Save this.</strong> It is the only way to edit or close your poll. Don't share it: anyone with
				this link can control the poll.
			</p>
			<CopyField value={adminUrl} label="Admin link" />
			<div class="row" style="margin-top:.6rem">
				<a class="btn small" href={mailto}>Email it to myself</a>
				<a class="btn small" href="/p/{created.id}/admin/{created.adminToken}">Open admin page</a>
			</div>
			<p class="dim small">It's also saved under <a href="/mine">My polls</a> in this browser. Bookmark it to be safe.</p>
		</div>
	{/if}

	{#if err}<p class="alert" role="alert">{err}</p>{/if}

	{#if step !== 'done'}
		<div class="bar">
			<div class="bar-inner">
				{#if step !== 1}
					<button type="button" class="ghost" onclick={() => go(((step as number) - 1) as Step)}>← Back</button>
				{/if}
				<span class="count" class:warn={nearLimit} class:over={overLimit}>
					{count} option{count === 1 ? '' : 's'}{overLimit ? ` (max ${data.maxOptions})` : ''}
				</span>
				<span class="spacer"></span>
				<button type="submit" class="primary" disabled={busy} aria-disabled={!canNext}>
					{step === 3 ? (busy ? 'Creating…' : 'Create poll ►') : 'Next →'}
				</button>
			</div>
		</div>
	{/if}
</form>

<style>
	.intro {
		margin: 0.5rem 0 1.2rem;
	}
	.steps {
		list-style: none;
		padding: 0;
		margin: 0 0 1rem;
		display: flex;
		gap: 0.4rem 1.4rem;
		flex-wrap: wrap;
		font-size: 0.9rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--dim);
	}
	.steps li[aria-current='step'] {
		color: var(--fg-strong);
	}
	.steps li[aria-current='step']::before {
		content: '► ';
	}
	.steps li.done::after {
		content: ' ✔';
		color: var(--yes);
	}
	form {
		max-width: 640px;
	}
	h1:focus {
		outline: none;
	}
	.hp {
		position: absolute;
		left: -10000px;
		width: 1px;
		height: 1px;
		overflow: hidden;
	}
	.textopt {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 0.5rem;
	}
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
	.count {
		font-family: 'VT323', monospace;
		font-size: 1.4rem;
	}
	.count.warn {
		color: var(--warn);
	}
	.count.over {
		color: var(--no);
	}
	button[aria-disabled='true'] {
		opacity: 0.5;
	}
	.master {
		margin-top: 2.5rem;
		border: 2px solid var(--warn);
	}
	.master .panel-title {
		color: var(--warn);
	}
</style>
