<script lang="ts">
	import './layout.css';
	import { theme } from '$lib/theme/theme.svelte.js';

	let { children } = $props();
</script>

<svelte:head>
	{@html `<style>:root { ${theme.cssVarsText} }</style>`}
</svelte:head>

{@render children()}
