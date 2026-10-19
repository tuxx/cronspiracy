<script lang="ts">
	import { onMount } from 'svelte';
	import { exportMine, forget, importMine, listMine, type MyPoll } from '$lib/client/store';
	import { copyText } from '$lib/client/api';

	let { data } = $props();
	let polls = $state<MyPoll[]>([]);
	let loaded = $state(false);
	let showImport = $state(false);
	let blob = $state('');
	let msg = $state('');
	let armed = $state<string | null>(null);

	onMount(() => {
		polls = listMine();
		loaded = true;
	});

	async function doExport() {
		const json = exportMine();
		if (await copyText(json)) msg = `Copied ${polls.length} poll link(s) to the clipboard. Paste them into "Import" on your other device.`;
		else {
			blob = json;
			showImport = true;
			msg = 'Copy the text below and paste it into "Import" on your other device.';
		}
	}

	function doImport() {
		try {
			const n = importMine(blob);
			msg = `Imported ${n} poll${n === 1 ? '' : 's'}.`;
			polls = listMine();
			blob = '';
			showImport = false;
		} catch {
			msg = "That doesn't look like an export from My polls. Copy the whole text and try again.";
		}
	}

	function remove(id: string) {
		if (armed !== id) {
			armed = id;
			return;
		}
		forget(id);
		polls = listMine();
		armed = null;
	}
</script>

<svelte:head><title>My polls · {data.brand}</title></svelte:head>

<h1>My polls</h1>
<p class="dim">
	Polls you created or voted on <strong>in this browser</strong>. Nothing is stored on the server about you; this list lives only
	on this device.
</p>

{#if loaded && !polls.length}
	<p class="notice">Nothing here yet. <a href="/">Start a new poll</a>, or open a link someone sent you.</p>
{/if}

<ul class="list">
	{#each polls as p (p.id)}
		<li class="panel">
			<div class="row">
				<a class="pixel ttl" href="/p/{p.id}">{p.title || p.id}</a>
				<span class="spacer"></span>
				{#if p.adminToken}<span class="tag">ORGANISER</span>{/if}
				{#if p.editToken}<span class="tag vote">VOTED{p.name ? ` AS ${p.name.toUpperCase()}` : ''}</span>{/if}
			</div>
			<div class="row small">
				<a href="/p/{p.id}">open</a>
				{#if p.adminToken}<a href="/p/{p.id}/admin/{p.adminToken}">admin page</a>{/if}
				<span class="dim">last opened {new Date(p.touched).toLocaleDateString()}</span>
				<span class="spacer"></span>
				<button class="link" onclick={() => remove(p.id)}>{armed === p.id ? 'forget it? (click again)' : 'forget'}</button>
			</div>
		</li>
	{/each}
</ul>

<h2 class="prompt">Move to another device</h2>
<p class="dim small">Export copies your links (including admin links, so keep it private). Import merges them into this browser.</p>
<div class="row">
	<button onclick={doExport} disabled={!polls.length}>Export</button>
	<button onclick={() => (showImport = !showImport)}>Import</button>
</div>
{#if msg}<p class="ok" role="status">{msg}</p>{/if}
{#if showImport}
	<label class="field">
		<span>Exported links</span>
		<textarea bind:value={blob} rows="8" placeholder="Paste the export here"></textarea>
	</label>
	<button class="primary" onclick={doImport} disabled={!blob.trim()}>Import links</button>
{/if}

<style>
	.list {
		list-style: none;
		padding: 0;
	}
	.list li {
		margin-bottom: 0.7rem;
	}
	.ttl {
		font-size: 1.6rem;
		text-decoration: none;
	}
	.tag {
		font-size: 0.75rem;
		border: 1px solid var(--warn);
		color: var(--warn);
		padding: 0 0.4em;
		letter-spacing: 0.08em;
	}
	.tag.vote {
		border-color: var(--yes);
		color: var(--yes);
	}
</style>
