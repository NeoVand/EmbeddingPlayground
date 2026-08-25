<script lang="ts">
	import { onMount } from 'svelte';
	import { playground } from '$lib/stores/playground.svelte.js';
	import BusyPill from '$lib/shell/BusyPill.svelte';
	import ModelManager from '$lib/shell/ModelManager.svelte';
	import Rail from '$lib/shell/Rail.svelte';
	import CompareLab from '$lib/labs/CompareLab.svelte';
	import TrajectoryLab from '$lib/labs/TrajectoryLab.svelte';
	import RAGLab from '$lib/labs/RAGLab.svelte';
	import ClassifyLab from '$lib/labs/ClassifyLab.svelte';
	import ClusterLab from '$lib/labs/ClusterLab.svelte';

	onMount(() => {
		void playground.probeBackends();
	});
</script>

<svelte:head>
	<title>Embedding Playground</title>
</svelte:head>

<div class="app">
	<Rail />

	<main class="lab-host">
		{#if playground.lab === 'compare'}
			<CompareLab />
		{:else if playground.lab === 'trajectory'}
			<TrajectoryLab />
		{:else if playground.lab === 'rag'}
			<RAGLab />
		{:else if playground.lab === 'classify'}
			<ClassifyLab />
		{:else if playground.lab === 'cluster'}
			<ClusterLab />
		{/if}
	</main>

	<BusyPill />
	<ModelManager />
</div>

<style>
	.app {
		position: fixed;
		inset: 0;
		background:
			radial-gradient(1100px 600px at 70% -10%, oklch(0.12 0.02 200 / 0.5), transparent 65%),
			var(--bg-base);
	}
	.lab-host {
		position: absolute;
		inset: 0;
	}
</style>
