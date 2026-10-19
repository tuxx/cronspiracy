<script lang="ts">
	import { googleUrl, outlookUrl, type EventInfo } from '$lib/calendar';
	import { optionLabel } from '$lib/format';
	import type { PollOption, PollView } from '$lib/types';

	let {
		poll,
		option,
		locale,
		publicUrl,
		adminToken,
		onClear
	}: {
		poll: PollView;
		option: PollOption;
		locale: string;
		publicUrl: string;
		adminToken: string | null;
		onClear: () => void;
	} = $props();

	const event = $derived<EventInfo>({
		uid: `${poll.id}@cronspiracy`,
		title: poll.title,
		description: poll.description,
		location: poll.location,
		url: `${publicUrl}/p/${poll.id}`,
		option,
		timezone: poll.timezone
	});
	const label = $derived(optionLabel(option, locale));
</script>

<section class="final" aria-live="polite">
	<p class="dim small">>>> DECISION LOCKED IN</p>
	<p class="when pixel">📅 {label.full}{option.date && !option.startTime ? ' (whole day)' : ''}</p>
	<p class="dim">Chosen by the organiser{poll.type === 'date' && option.startTime ? ` · ${poll.timezone}` : ''}.</p>
	{#if option.date}
		<div class="row">
			<a class="btn primary" href="/p/{poll.id}/event.ics" download>Add to calendar (.ics)</a>
			<a class="btn small" href={googleUrl(event)} target="_blank" rel="noopener noreferrer">Google</a>
			<a class="btn small" href={outlookUrl(event)} target="_blank" rel="noopener noreferrer">Outlook</a>
		</div>
	{/if}
	{#if adminToken}
		<p class="small"><button class="link" onclick={onClear}>Undo final pick</button> <span class="dim">(voting stays closed until you reopen it)</span></p>
	{/if}
</section>

<style>
	.final {
		border: 2px solid var(--yes);
		padding: 1rem;
		margin: 1rem 0;
		background: color-mix(in srgb, var(--yes) 8%, transparent);
	}
	.when {
		font-size: 2rem;
		margin: 0.2rem 0;
		color: var(--fg-strong);
	}
	.final p:first-child {
		margin: 0;
		letter-spacing: 0.1em;
	}
</style>
