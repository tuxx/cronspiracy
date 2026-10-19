<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head><title>Error {page.status}</title></svelte:head>

<pre class="err" aria-hidden="true">
*** STOP: 0x{page.status.toString(16).padStart(8, '0').toUpperCase()} ***
</pre>
<h1>{page.status === 404 ? 'Not found' : page.status === 403 ? 'Access denied' : 'Something broke'}</h1>
<p class="prompt">{page.error?.message}</p>
<p><a class="btn" href="/">Start a new poll</a> <a class="btn" href="/mine">My polls</a></p>

<style>
	.err {
		color: var(--no);
		font-size: 1rem;
	}
</style>
