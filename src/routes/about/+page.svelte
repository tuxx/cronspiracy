<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>About · {data.brand}</title></svelte:head>

<article>
	<h1>About {data.brand}</h1>
	<p class="prompt">A self-hosted "when can everyone make it?" poll. No accounts, no email, no tracking.</p>

	<h2>How it works</h2>
	<ol>
		<li>Pick some dates (or write text options) and create the poll.</li>
		<li>You get two links: a <strong>share link</strong> for everyone, and a secret <strong>admin link</strong> for you.</li>
		<li>People open the share link, type their name, and tap ✔ yes, ~ if need be, or ✘ no for each option.</li>
		<li>The best option gets a ★. Pick the final date and everyone can add it to their calendar.</li>
	</ol>

	<h2>What we store</h2>
	<ul>
		<li>The poll, its options, and the names and votes people enter. Nothing else.</li>
		<li>Links are the only identity. Admin and edit links contain secret tokens; the server only keeps a hash of them.</li>
		<li>
			IP addresses are never stored. For rate limiting we keep a hash of your IP mixed with a secret that changes every day.
		</li>
		<li>No cookies. Your browser remembers your own polls and votes in local storage, on your device only.</li>
		<li>No analytics, no third-party scripts, no external fonts.</li>
		<li>Polls are deleted automatically after their last date (7, 30 or 90 days, chosen by the organiser), or when the organiser deletes them.</li>
		<li>Poll pages are hidden from search engines.</li>
	</ul>

	<h2>Lost your admin link?</h2>
	<p>
		Check <a href="/mine">My polls</a> in the browser you used to create the poll. If it's not there, it cannot be recovered;
		that is the price of having no accounts.
	</p>
</article>

<style>
	article {
		max-width: 70ch;
	}
	li {
		margin-bottom: 0.4rem;
	}
</style>
