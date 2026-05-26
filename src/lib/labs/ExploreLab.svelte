<script lang="ts">
	/**
	 * Explore Lab — "What is an embedding?"
	 *
	 * One text input. Cloud shows the input as a labeled point against the
	 * seed corpus (this is the only lab where corpus is the point — every
	 * other lab hides it). The inspector breaks the vector apart into stats,
	 * a token × dimension heatmap, and a dimension bar chart.
	 */

	import { playground } from '$lib/stores/playground.svelte.js';
	import SemanticCloud, {
		type CloudPoint
	} from '$lib/viz/SemanticCloud.svelte';
	import StatsCard from '$lib/components/StatsCard.svelte';
	import SimilarityList from '$lib/components/SimilarityList.svelte';
	import TokenHeatmap from '$lib/viz/TokenHeatmap.svelte';
	import DimensionBars from '$lib/viz/DimensionBars.svelte';
	import { CATEGORY_HUES, CATEGORY_LABELS } from '$lib/corpus/seed.js';
	import type { EmbeddingResult } from '$lib/models/types.js';
	import { createLabState } from './labState.svelte.js';

	const lab = createLabState('explore', { text: 'A black hole bending light around its event horizon.' });

	let result = $state<EmbeddingResult | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	const examples = [
		'A black hole bending light around its event horizon.',
		'A golden retriever bounding across a sunlit lawn.',
		'Debugging a race condition between two async workers.',
		'The quiet joy of watching a long project finally come together.',
		'A bowl of miso soup with cubed tofu and ribbons of wakame.'
	];

	let embedSeq = 0;
	async function embed(opts: { force?: boolean } = {}) {
		const text = lab.text.trim();
		if (!text) {
			result = null;
			error = null;
			return;
		}
		const seq = ++embedSeq;
		loading = true;
		error = null;
		try {
			const r = await playground.embedText(text, opts);
			if (seq !== embedSeq) return;
			result = r;
		} catch (e) {
			if (seq !== embedSeq) return;
			error = e instanceof Error ? e.message : String(e);
			result = null;
		} finally {
			if (seq === embedSeq) loading = false;
		}
	}

	let timer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		void lab.text;
		void playground.modelId;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => void embed(), 300);
	});

	const points = $derived.by<CloudPoint[]>(() => {
		const out: CloudPoint[] = [];
		if (result) {
			out.push({
				id: 'input',
				vector: result.vector,
				hue: 200,
				label: 'YOU',
				hoverText: lab.text,
				size: 1.1
			});
		}
		const corpus = playground.corpus;
		if (corpus && (!result || corpus.items[0]?.vector.length === result.vector.length)) {
			for (const c of corpus.items) {
				out.push({
					id: c.item.id,
					vector: c.vector,
					hue: CATEGORY_HUES[c.item.category],
					hoverText: `${CATEGORY_LABELS[c.item.category]} · ${c.item.text}`,
					variant: 'dot'
				});
			}
		}
		return out;
	});

	function applyExample(t: string) {
		lab.text = t;
	}
</script>

<main class="lab">
	<aside class="left">
		<div class="card glass" data-tour="input">
			<div class="head">
				<span class="eyebrow">Your text</span>
				{#if loading}
					<span class="status loading">embedding…</span>
				{:else if error}
					<span class="status err" title={error}>error</span>
				{:else if result?.elapsedMs && result.elapsedMs > 0}
					<span class="status tabular">{result.elapsedMs.toFixed(0)} ms</span>
				{:else if result}
					<span class="status">cached</span>
				{/if}
			</div>
			<textarea
				bind:value={lab.text}
				rows="4"
				spellcheck="false"
				placeholder="Type or paste any sentence — see it become a vector."
			></textarea>
			<div class="examples">
				<span class="ex-eyebrow no-select">try:</span>
				{#each examples as ex, i (i)}
					<button class="ex" onclick={() => applyExample(ex)} title={ex}
						>{ex.split(' ').slice(0, 4).join(' ')}…</button
					>
				{/each}
			</div>
		</div>
		<StatsCard {result} modelShortName={playground.model.shortName} title="Embedding" />
	</aside>

	<section class="center">
		<SemanticCloud {points} mode="pca" selectedId={result ? 'input' : null} />
	</section>

	<aside class="right">
		<SimilarityList
			vector={result?.vector ?? null}
			corpus={playground.corpus}
			building={playground.corpusBuilding}
			progress={playground.corpusProgress}
		/>
	</aside>

	<footer>
		<div class="foot wide">
			<TokenHeatmap {result} onRefresh={() => embed({ force: true })} />
		</div>
		<div class="foot">
			<DimensionBars vector={result?.vector ?? null} />
		</div>
	</footer>
</main>

<style>
	.lab {
		display: grid;
		grid-template-columns: 360px 1fr 340px;
		grid-template-rows: 1fr auto;
		gap: 10px;
		min-height: 0;
		height: 100%;
	}
	.left,
	.right {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
		grid-row: 1;
	}
	.left > :global(.card:last-child),
	.right > :global(.card:last-child) {
		flex: 1;
		min-height: 0;
	}
	.center {
		grid-row: 1;
		min-height: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	footer {
		grid-column: 1 / -1;
		grid-row: 2;
		display: grid;
		grid-template-columns: 1.6fr 1fr;
		gap: 10px;
		height: 200px;
	}
	.foot {
		min-height: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.foot :global(.card) {
		flex: 1;
		min-height: 0;
	}
	.card {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.status {
		font-size: 10px;
		color: var(--text-subtle);
	}
	.status.loading {
		color: var(--accent);
		animation: blink 1s infinite;
	}
	.status.err {
		color: var(--bad);
	}
	@keyframes blink {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
	}
	textarea {
		width: 100%;
		resize: vertical;
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 5px;
		color: var(--text-primary);
		font-family: 'Inter', sans-serif;
		font-size: 14px;
		line-height: 1.45;
		padding: 8px 10px;
		min-height: 60px;
		box-sizing: border-box;
	}
	textarea::placeholder {
		color: var(--text-subtle);
		font-style: italic;
	}
	.examples {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		align-items: center;
	}
	.ex-eyebrow {
		font-size: 9px;
		color: var(--text-subtle);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-weight: 600;
		margin-right: 4px;
	}
	.ex {
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 4px;
		font-size: 10px;
		padding: 3px 6px;
		color: var(--text-muted);
		cursor: pointer;
		max-width: 110px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ex:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
</style>
