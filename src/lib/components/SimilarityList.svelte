<script lang="ts">
	import type { CorpusEmbedding } from '$lib/stores/playground.svelte.js';
	import { cosine } from '$lib/math/similarity.js';
	import { CATEGORY_HUES, CATEGORY_LABELS } from '$lib/corpus/seed.js';

	interface Props {
		vector: Float32Array | null;
		corpus: { items: CorpusEmbedding[] } | null;
		building?: boolean;
		progress?: number;
		limit?: number;
		title?: string;
	}
	let {
		vector,
		corpus,
		building = false,
		progress = 0,
		limit = 8,
		title = 'Nearest neighbors'
	}: Props = $props();

	type Row = { id: string; text: string; category: string; sim: number; hue: number };

	const rows = $derived.by<Row[]>(() => {
		if (!vector || !corpus) return [];
		if (corpus.items.length === 0) return [];
		if (vector.length !== corpus.items[0].vector.length) return [];
		return corpus.items
			.map((ce) => ({
				id: ce.item.id,
				text: ce.item.text,
				category: CATEGORY_LABELS[ce.item.category],
				hue: CATEGORY_HUES[ce.item.category],
				sim: cosine(vector, ce.vector)
			}))
			.sort((a, b) => b.sim - a.sim);
	});

	const top = $derived(rows.slice(0, limit));
	const max = $derived(top.length > 0 ? Math.max(...top.map((r) => Math.abs(r.sim))) : 1);
</script>

<div class="card glass">
	<div class="head">
		<span class="eyebrow">{title}</span>
		{#if building}
			<span class="prog tabular">{Math.round(progress * 100)}%</span>
		{:else if corpus}
			<span class="prog tabular">{corpus.items.length} seeded</span>
		{/if}
	</div>

	{#if top.length === 0}
		<p class="empty">
			{#if building}Building neighborhood…{:else if !vector}Awaiting input.{:else}—{/if}
		</p>
	{:else}
		<ol>
			{#each top as r (r.id)}
				<li>
					<div class="line">
						<span class="dot" style:background={`oklch(0.72 0.15 ${r.hue})`}></span>
						<span class="text" title={r.text}>{r.text}</span>
						<span class="sim tabular" class:hot={r.sim > 0.6}>{r.sim.toFixed(3)}</span>
					</div>
					<div class="bar">
						<div
							class="fill"
							style:width={`${Math.max(0, Math.min(100, (Math.max(0, r.sim) / max) * 100))}%`}
							style:background={`oklch(0.7 0.15 ${r.hue})`}
						></div>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</div>

<style>
	.card {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-height: 0;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.prog {
		font-size: 10px;
		color: var(--text-subtle);
	}
	.empty {
		font-size: 12px;
		color: var(--text-subtle);
		font-style: italic;
	}
	ol {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		overflow-y: auto;
		min-height: 0;
	}
	li {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.text {
		color: var(--text-secondary);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sim {
		color: var(--text-muted);
		font-weight: 500;
	}
	.sim.hot {
		color: var(--accent);
	}
	.bar {
		height: 3px;
		background: var(--surface-2);
		border-radius: 2px;
		overflow: hidden;
	}
	.fill {
		height: 100%;
		transition: width 0.3s ease;
		opacity: 0.85;
	}
</style>
