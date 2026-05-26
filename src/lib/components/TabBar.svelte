<script lang="ts">
	import { playground, type LabId } from '$lib/stores/playground.svelte.js';

	const labs: { id: LabId; label: string; desc: string }[] = [
		{ id: 'compare', label: 'Compare', desc: 'Pair similarity' },
		{ id: 'trajectory', label: 'Trajectory', desc: 'Sentence path' },
		{ id: 'rag', label: 'RAG', desc: 'Semantic search' },
		{ id: 'classify', label: 'Classify', desc: 'Nearest-prototype' },
		{ id: 'cluster', label: 'Cluster', desc: 'K-means in vector space' }
	];

	function pick(id: LabId) {
		playground.lab = id;
	}
</script>

<div class="bar no-select" role="tablist" aria-label="Labs">
	{#each labs as t (t.id)}
		{@const active = playground.lab === t.id}
		<button
			class="tab"
			class:active
			role="tab"
			aria-selected={active}
			onclick={() => pick(t.id)}
			title={t.desc}
		>
			<span class="label">{t.label}</span>
			<span class="desc">{t.desc}</span>
		</button>
	{/each}
</div>

<style>
	.bar {
		display: flex;
		gap: 3px;
		padding: 4px;
		background: var(--surface-0);
		border: 1px solid var(--border);
		border-radius: 8px;
		backdrop-filter: blur(10px);
	}
	.tab {
		background: transparent;
		border: 0;
		padding: 5px 12px;
		border-radius: 5px;
		cursor: pointer;
		color: var(--text-muted);
		text-align: left;
		display: flex;
		flex-direction: column;
		gap: 1px;
		line-height: 1.1;
		transition: background 0.15s ease;
		min-width: 92px;
	}
	.tab:hover {
		background: var(--surface-1);
		color: var(--text-secondary);
	}
	.tab.active {
		background: var(--accent-glow);
		color: var(--text-primary);
	}
	.label {
		font-size: 12px;
		font-weight: 600;
	}
	.desc {
		font-size: 9px;
		color: var(--text-subtle);
		letter-spacing: 0.03em;
	}
	.tab.active .desc {
		color: var(--accent);
	}
</style>
