<script lang="ts">
	import CopyField from './CopyField.svelte';
	import { call, ClientError } from '$lib/client/api';
	import { LIMITS, type PollView } from '$lib/types';

	let {
		poll = $bindable(),
		adminToken,
		shareUrl,
		refresh,
		onDeleted,
		onFlash,
		locale
	}: {
		poll: PollView;
		adminToken: string;
		shareUrl: string;
		refresh: () => Promise<void>;
		onDeleted: () => void;
		onFlash: (msg: string) => void;
		locale: string;
	} = $props();

	let editingDetails = $state(false);
	let busy = $state(false);
	let err = $state('');
	let armDelete = $state(false);

	let f = $state({
		title: '',
		description: '',
		location: '',
		organiserName: '',
		allowMaybe: true,
		hideVotes: false,
		hideNames: false,
		deadline: '',
		expiryDays: 30 as 7 | 30 | 90
	});

	function toLocalInput(iso: string | null) {
		if (!iso) return '';
		const d = new Date(iso);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function openDetails() {
		f = {
			title: poll.title,
			description: poll.description ?? '',
			location: poll.location ?? '',
			organiserName: poll.organiserName ?? '',
			allowMaybe: poll.allowMaybe,
			hideVotes: poll.hideVotes,
			hideNames: poll.hideNames,
			deadline: toLocalInput(poll.deadline),
			expiryDays: poll.expiryDays as 7 | 30 | 90
		};
		editingDetails = true;
	}

	async function run(fn: () => Promise<unknown>, ok: string) {
		busy = true;
		err = '';
		try {
			await fn();
			onFlash(ok);
			await refresh();
			return true;
		} catch (e) {
			err = e instanceof ClientError ? e.message : 'Something went wrong. Try again.';
			return false;
		} finally {
			busy = false;
		}
	}

	async function saveDetails(e: SubmitEvent) {
		e.preventDefault();
		const ok = await run(
			() =>
				call('PATCH', `/api/polls/${poll.id}`, {
					adminToken,
					body: { ...f, deadline: f.deadline ? new Date(f.deadline).toISOString() : null }
				}),
			'Poll updated.'
		);
		if (ok) editingDetails = false;
	}

	const toggleClosed = () =>
		run(
			() => call('POST', `/api/polls/${poll.id}/${poll.closed || poll.finalOptionId ? 'reopen' : 'close'}`, { adminToken }),
			poll.closed || poll.finalOptionId ? 'Voting reopened.' : 'Voting closed.'
		);

	async function del() {
		if (!armDelete) {
			armDelete = true;
			setTimeout(() => (armDelete = false), 5000);
			return;
		}
		busy = true;
		try {
			await call('DELETE', `/api/polls/${poll.id}`, { adminToken });
			onDeleted();
		} catch (e) {
			err = e instanceof ClientError ? e.message : 'Could not delete the poll.';
			busy = false;
		}
	}

	const expires = $derived(new Date(poll.expiresAt).toLocaleDateString(locale, { dateStyle: 'medium', timeZone: 'UTC' }));
</script>

<section class="panel titled admin" aria-label="Organiser controls">
	<span class="panel-title">ADMIN CONSOLE · ROOT ACCESS</span>
	<p class="small">Share this link with everyone who should vote:</p>
	<CopyField value={shareUrl} label="Share link" />

	<div class="row actions">
		<button class="small" disabled={busy} onclick={toggleClosed}>
			{poll.closed || poll.finalOptionId ? '▶ Reopen voting' : '■ Close voting'}
		</button>
		<button class="small" disabled={busy} onclick={() => (editingDetails ? (editingDetails = false) : openDetails())}>
			{editingDetails ? 'Cancel edit' : '✎ Edit details'}
		</button>
		<a class="btn small" href="/api/polls/{poll.id}/export.csv?token={encodeURIComponent(adminToken)}" download>⇩ CSV</a>
		<span class="spacer"></span>
		<button class="small danger" disabled={busy} onclick={del}>{armDelete ? 'Click again to delete forever' : 'Delete poll'}</button>
	</div>
	<p class="dim small">
		Tap <strong>pick</strong> on an option to make it the final date. That closes voting and offers everyone a calendar download.
		Deletes itself on {expires}.
	</p>
	{#if err}<p class="alert" role="alert">{err}</p>{/if}

	{#if editingDetails}
		<form onsubmit={saveDetails} class="details">
			<label class="field"><span>Title</span><input bind:value={f.title} maxlength={LIMITS.title} required /></label>
			<label class="field"
				><span>Description</span><textarea bind:value={f.description} maxlength={LIMITS.description} rows="3"></textarea></label
			>
			<label class="field"><span>Location</span><input bind:value={f.location} maxlength={LIMITS.location} /></label>
			<label class="field"><span>Organiser name</span><input bind:value={f.organiserName} maxlength={LIMITS.name} /></label>
			<label class="check"><input type="checkbox" bind:checked={f.allowMaybe} /> <span>Allow "if need be" answers</span></label>
			<label class="check"><input type="checkbox" bind:checked={f.hideVotes} /> <span>Keep votes secret until someone has voted</span></label>
			<label class="check"><input type="checkbox" bind:checked={f.hideNames} /> <span>Hide participants' names from each other</span></label>
			<label class="field"><span>Voting deadline</span><input type="datetime-local" bind:value={f.deadline} /></label>
			<label class="field">
				<span>Delete the poll automatically</span>
				<select bind:value={f.expiryDays}>
					<option value={7}>7 days after the last date</option>
					<option value={30}>30 days after the last date</option>
					<option value={90}>90 days after the last date</option>
				</select>
			</label>
			<button type="submit" class="primary" disabled={busy}>Save changes</button>
		</form>
	{/if}
</section>

<style>
	.admin {
		border: 2px solid var(--warn);
		margin: 1.5rem 0;
	}
	.admin .panel-title {
		color: var(--warn);
	}
	.actions {
		margin: 0.8rem 0 0.4rem;
	}
	.details {
		max-width: 640px;
		border-top: 1px dashed var(--faint);
		margin-top: 1rem;
	}
</style>
