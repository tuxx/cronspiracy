<script lang="ts">
	import PollScreen from '$lib/components/PollScreen.svelte';
	let { data } = $props();
</script>

<PollScreen
	initial={data.poll}
	adminToken={data.adminToken}
	publicUrl={data.publicUrl}
	locale={data.locale}
	brand={data.brand}
/>
