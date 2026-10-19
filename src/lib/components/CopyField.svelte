<script lang="ts">
	import { copyText } from '$lib/client/api';

	let { value, label }: { value: string; label: string } = $props();
	let copied = $state(false);
	let input: HTMLInputElement;

	async function copy() {
		if (await copyText(value)) {
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} else {
			input.select(); // fall back to manual copy
		}
	}
</script>

<div class="copy">
	<input bind:this={input} readonly {value} aria-label={label} onfocus={(e) => e.currentTarget.select()} />
	<button type="button" class="primary" onclick={copy} aria-live="polite">{copied ? 'Copied ✔' : 'Copy'}</button>
</div>

<style>
	.copy {
		display: flex;
	}
	input {
		flex: 1;
		min-width: 0;
		font-size: 0.9rem;
	}
	button {
		flex: none;
		min-width: 6.5em;
	}
</style>
