<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { playground } from '$lib/stores/playground.svelte.js';
	import ModelSelector from '$lib/components/ModelSelector.svelte';
	import BackendBadge from '$lib/components/BackendBadge.svelte';
	import TabBar from '$lib/components/TabBar.svelte';
	import CompareLab from '$lib/labs/CompareLab.svelte';
	import TrajectoryLab from '$lib/labs/TrajectoryLab.svelte';
	import RAGLab from '$lib/labs/RAGLab.svelte';
	import AnalogiesLab from '$lib/labs/AnalogiesLab.svelte';
	import PlaneLab from '$lib/labs/PlaneLab.svelte';
	import { startTour } from '$lib/tour.js';

	onMount(async () => {
		void playground.probeBackends();
		await tick();
		// Don't auto-open the tour on first visit. Users start in Compare with a
		// loaded preset; the lab descriptions on the tab bar are self-explanatory.
		// The ? button opens the tour on demand.
	});

	function showHelp() {
		startTour({ force: true });
	}
</script>

<div class="app grid-bg">
	<header>
		<div class="brand no-select">
			<span class="hex" aria-hidden="true">⬡</span>
			<h1>EMBEDDING <span class="dim">PLAYGROUND</span></h1>
		</div>
		<div class="middle" data-tour="tabs">
			<TabBar />
		</div>
		<div class="right">
			<div data-tour="model">
				<ModelSelector />
			</div>
			<BackendBadge />
			<button class="help no-select" onclick={showHelp} title="Replay the intro tour" data-tour="help"
				>?</button
			>
		</div>
	</header>

	<div class="lab-host" data-tour="cloud">
		{#if playground.lab === 'compare'}
			<CompareLab />
		{:else if playground.lab === 'trajectory'}
			<TrajectoryLab />
		{:else if playground.lab === 'rag'}
			<RAGLab />
		{:else if playground.lab === 'analogies'}
			<AnalogiesLab />
		{:else if playground.lab === 'plane'}
			<PlaneLab />
		{/if}
	</div>
</div>

<style>
	.app {
		position: fixed;
		inset: 0;
		display: grid;
		grid-template-rows: auto 1fr;
		gap: 10px;
		padding: 12px;
		box-sizing: border-box;
	}
	header {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 16px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.hex {
		font-size: 22px;
		color: var(--accent);
		text-shadow: 0 0 10px var(--accent-glow);
	}
	h1 {
		font-size: 13px;
		letter-spacing: 0.22em;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}
	h1 .dim {
		color: var(--text-muted);
		font-weight: 500;
	}
	.middle {
		display: flex;
		justify-content: center;
	}
	.right {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.help {
		width: 30px;
		height: 30px;
		background: var(--surface-1);
		border: 1px solid var(--border);
		color: var(--text-secondary);
		font-weight: 700;
		font-size: 13px;
		border-radius: 6px;
		cursor: pointer;
	}
	.help:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.lab-host {
		min-height: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
</style>
