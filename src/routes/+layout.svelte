<script lang="ts">
	import '@fontsource/vt323';
	import '../app.css';
	import { BANNER_WIDE } from '$lib/banner';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	let { children, data } = $props();

	const THEMES = ['green', 'amber', 'paper'] as const;
	let theme = $state<(typeof THEMES)[number]>('green');

	onMount(() => {
		const t = document.documentElement.dataset.theme as (typeof THEMES)[number];
		if (THEMES.includes(t)) theme = t;
	});

	function setTheme(t: (typeof THEMES)[number]) {
		theme = t;
		document.documentElement.dataset.theme = t;
		try {
			localStorage.setItem('cronspiracy:theme', t);
		} catch {
			/* ignore */
		}
	}

	const nav = [
		{ href: '/', label: 'New poll' },
		{ href: '/mine', label: 'My polls' },
		{ href: '/about', label: 'About' }
	];
</script>

<svelte:head>
	<title>{data.brand}</title>
	<meta name="description" content="Find a date everyone can make. No accounts, no tracking." />
</svelte:head>

<a class="skip sr-only" href="#main">Skip to content</a>

<header>
	<a href="/" class="banner" aria-label="{data.brand} home">
		<pre class="wide" aria-hidden="true">{BANNER_WIDE}</pre>
		<span class="narrow pixel" aria-hidden="true">&gt; {data.brand.toUpperCase()}<span class="cursor"></span></span>
	</a>
	<div class="statusbar">
		<span class="dim">[ SECURE LINE ESTABLISHED ]</span>
		<nav aria-label="Main">
			{#each nav as n (n.href)}
				<a href={n.href} aria-current={page.url.pathname === n.href ? 'page' : undefined}>{n.label}</a>
			{/each}
		</nav>
	</div>
</header>

<main id="main">
	{@render children()}
</main>

<footer>
	<div class="themes" role="group" aria-label="Screen colour">
		<span class="dim">PHOSPHOR:</span>
		{#each THEMES as t (t)}
			<button class="link" aria-pressed={theme === t} onclick={() => setTheme(t)}>{t}</button>
		{/each}
	</div>
	<p class="dim small">
		No accounts · no cookies · no trackers. Links are the only identity — guard them well.
	</p>
	<p class="dim small">{data.brand} · <a href="/about">how this works</a></p>
</footer>

<style>
	header,
	main,
	footer {
		max-width: 1100px;
		margin: 0 auto;
		padding: 0 16px;
	}
	header {
		padding-top: 1.2rem;
	}
	.banner {
		display: block;
		text-decoration: none;
		color: var(--fg);
		overflow: hidden;
	}
	pre {
		margin: 0;
		font-size: min(13px, 1.75vw);
		line-height: 1.15;
	}
	.narrow {
		display: none;
		font-size: 2.6rem;
		line-height: 1;
		color: var(--fg-strong);
	}
	@media (max-width: 720px) {
		.wide {
			display: none;
		}
		.narrow {
			display: block;
		}
	}
	.statusbar {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		border-top: 1px solid var(--faint);
		border-bottom: 1px solid var(--faint);
		margin-top: 0.8rem;
		padding: 0.35rem 0;
		font-size: 0.85rem;
	}
	nav {
		display: flex;
		gap: 1.2rem;
	}
	nav a {
		text-decoration: none;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	nav a::before {
		content: '[';
		color: var(--dim);
	}
	nav a::after {
		content: ']';
		color: var(--dim);
	}
	nav a[aria-current='page'] {
		color: var(--fg-strong);
	}
	main {
		padding-top: 1rem;
		padding-bottom: 6rem;
		min-height: 60vh;
	}
	footer {
		border-top: 1px dashed var(--faint);
		padding-top: 1rem;
		padding-bottom: 2rem;
	}
	.themes {
		display: flex;
		gap: 1rem;
		align-items: center;
	}
	.themes button[aria-pressed='true'] {
		color: var(--fg-strong);
		text-decoration: none;
	}
	.themes button[aria-pressed='true']::before {
		content: '*';
	}
	.skip:focus {
		position: fixed;
		top: 0.5rem;
		left: 0.5rem;
		width: auto;
		height: auto;
		clip: auto;
		padding: 0.5rem;
		background: var(--bg);
		z-index: 2000;
	}
</style>
