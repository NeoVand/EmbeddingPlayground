<script lang="ts">
	/**
	 * Retrieve — the retrieval half of RAG, honestly.
	 *
	 * Pick a document, choose a chunking strategy, type a query. Chunks embed
	 * as documents, the query embeds as a query (role-correct prefixes — this
	 * is the lab where that distinction matters), and chunks are ranked by
	 * cosine or euclidean distance. No generation.
	 */

	import { IconUpload } from '$lib/icons.js';
	import { cosine, euclidean } from '$lib/math/similarity.js';
	import type { EmbeddingResult } from '$lib/models/types.js';
	import { playground } from '$lib/stores/playground.svelte.js';
	import { PIN_HUE } from '$lib/theme/palette.js';
	import DockSection from '$lib/shell/DockSection.svelte';
	import InfoPop from '$lib/shell/InfoPop.svelte';
	import LabShell from '$lib/shell/LabShell.svelte';
	import SemanticCloud, { type CloudLink, type CloudPoint } from '$lib/viz/SemanticCloud.svelte';
	import { SAMPLE_DOCS, getDoc } from '$lib/rag/documents.js';
	import {
		STRATEGY_DESCRIPTIONS,
		STRATEGY_LABELS,
		chunkText,
		type Chunk,
		type ChunkStrategy
	} from '$lib/rag/chunking.js';
	import { createBatchEmbed, createSingleEmbed } from './embed.svelte.js';
	import { createLabState } from './labState.svelte.js';

	const lab = createLabState('rag', {
		docId: 'photosynthesis' as string,
		customText: '',
		strategy: 'paragraph' as ChunkStrategy,
		chunkSize: 30,
		chunkOverlap: 10,
		query: 'how do plants store sunlight as chemical energy',
		metric: 'cosine' as 'cosine' | 'euclidean',
		topN: 5
	});

	const activeText = $derived.by(() => {
		if (lab.docId === 'custom') return lab.customText;
		return getDoc(lab.docId)?.text ?? '';
	});

	const chunks = $derived.by<Chunk[]>(() =>
		chunkText(activeText, { strategy: lab.strategy, size: lab.chunkSize, overlap: lab.chunkOverlap })
	);

	// Chunks are documents; the query is a query. 4 of 8 models apply
	// different instruction prefixes per role — this is where it shows.
	const chunkBatch = createBatchEmbed({ delay: 200, role: 'document' });
	const queryEmbed = createSingleEmbed({ delay: 300, role: 'query' });

	$effect(() => {
		void playground.modelId;
		void chunks.map((c) => c.id + c.text.slice(0, 20)).join('|');
		chunkBatch.run(chunks.map((c) => ({ id: c.id, text: c.text })));
	});
	$effect(() => {
		void playground.modelId;
		queryEmbed.run(lab.query);
	});

	let selectedChunkId = $state<string | null>(null);
	const selectedResult = $derived.by<EmbeddingResult | null>(() => {
		if (selectedChunkId === 'query') return queryEmbed.result;
		if (selectedChunkId) return chunkBatch.results.get(selectedChunkId) ?? null;
		return null;
	});

	type Ranked = { chunk: Chunk; score: number; sim: number; dist: number };
	const ranked = $derived.by<Ranked[]>(() => {
		const q = queryEmbed.result?.vector;
		if (!q) return [];
		const out: Ranked[] = [];
		for (const c of chunks) {
			const v = chunkBatch.results.get(c.id)?.vector;
			if (!v || v.length !== q.length) continue;
			const sim = cosine(q, v);
			const dist = euclidean(q, v);
			out.push({ chunk: c, score: lab.metric === 'cosine' ? sim : -dist, sim, dist });
		}
		out.sort((a, b) => b.score - a.score);
		return out;
	});
	const topRanked = $derived(ranked.slice(0, lab.topN));
	const topIds = $derived(new Set(topRanked.map((r) => r.chunk.id)));

	const points = $derived.by<CloudPoint[]>(() => {
		const out: CloudPoint[] = [];
		const N = chunks.length;
		for (let i = 0; i < chunks.length; i++) {
			const c = chunks[i];
			const vec = chunkBatch.results.get(c.id)?.vector;
			if (!vec) continue;
			const isTop = topIds.has(c.id);
			const tFrac = i / Math.max(1, N - 1);
			const hue = 220 - 190 * tFrac;
			out.push({
				id: c.id,
				vector: vec,
				hue,
				hoverText: `[chunk ${c.index + 1}/${N}] ${c.text.slice(0, 90)}${c.text.length > 90 ? '…' : ''}`,
				size: isTop ? 0.95 : 0.6,
				variant: isTop ? 'sphere' : 'dot',
				label: isTop ? `#${topRanked.findIndex((r) => r.chunk.id === c.id) + 1}` : undefined
			});
		}
		if (queryEmbed.result) {
			out.push({
				id: 'query',
				vector: queryEmbed.result.vector,
				hue: PIN_HUE,
				label: 'QUERY',
				hoverText: `query: "${lab.query}"`,
				size: 1.2,
				pinned: true
			});
		}
		return out;
	});

	const links = $derived.by<CloudLink[]>(() => {
		if (!queryEmbed.result) return [];
		return topRanked.map((r) => ({
			from: 'query',
			to: r.chunk.id,
			style: 'solid' as const,
			hue: PIN_HUE,
			opacity: 0.55
		}));
	});

	function onFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const f = input.files?.[0];
		if (!f) return;
		const reader = new FileReader();
		reader.onload = () => {
			lab.customText = String(reader.result ?? '');
			lab.docId = 'custom';
		};
		reader.readAsText(f);
	}

	// Lexical match highlighting — a useful tell of when the model retrieved
	// by meaning versus by shared words. HTML-escape first, then mark.
	function esc(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}
	function highlight(text: string, query: string): string {
		const escaped = esc(text);
		const terms = Array.from(
			new Set(
				query
					.toLowerCase()
					.split(/[^a-z0-9]+/i)
					.filter((w) => w.length >= 3)
			)
		);
		if (terms.length === 0) return escaped;
		const re = new RegExp(`\\b(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
		return escaped.replace(re, '<mark>$1</mark>');
	}

	const strategies = Object.keys(STRATEGY_LABELS) as ChunkStrategy[];

	const guide = [
		{
			title: 'Search by meaning',
			body: 'The query never appears verbatim in the document — "store sunlight as chemical energy" still finds the photosynthesis chunks about ATP and glucose. Highlighted words show the (few) lexical overlaps.',
			apply: () => {
				lab.docId = 'photosynthesis';
				lab.query = 'how do plants store sunlight as chemical energy';
			},
			applyLabel: 'Load the example'
		},
		{
			title: 'Chunking changes everything',
			body: 'Switch from paragraph to sentence chunks and watch the ranking change. Small chunks rank precisely but lose context; big chunks keep context but blur topics together. This trade-off is the heart of production RAG.',
			apply: () => (lab.strategy = lab.strategy === 'paragraph' ? 'sentence' : 'paragraph'),
			applyLabel: 'Flip the strategy'
		},
		{
			title: 'Ask something that is not there',
			body: 'Query "best pizza in Naples" against the photosynthesis document. Something still ranks #1 — retrieval always returns its best guess. Look at the cosine score to see how weak that best guess is.',
			apply: () => (lab.query = 'best pizza in Naples'),
			applyLabel: 'Try it'
		},
		{
			title: 'Bring your own document',
			body: 'Upload any .txt file and search it. Models with role prefixes (Nomic, Arctic, Qwen3, Gemma) embed your query with a query instruction and the chunks with a document instruction — switch models to compare retrieval quality.'
		}
	];
</script>

<LabShell
	labId="rag"
	dockTitle="Document"
	resultsTitle="Query & results"
	selected={selectedResult}
	selectedLabel={selectedChunkId === 'query' ? 'QUERY' : selectedChunkId ? `chunk ${selectedChunkId}` : null}
	scopeHint="Click any chunk or the QUERY reticle to inspect its embedding."
	{guide}
>
	{#snippet cloud()}
		<SemanticCloud
			{points}
			{links}
			selectedId={selectedChunkId ?? (queryEmbed.result ? 'query' : null)}
			onPointClick={(id) => (selectedChunkId = id)}
		/>
	{/snippet}

	{#snippet dockHeader()}
		<label class="icon-btn" title="Upload a .txt file">
			<input class="file-input" type="file" accept=".txt,.md,text/plain" onchange={onFileChange} />
			<IconUpload size={14} />
		</label>
	{/snippet}

	{#snippet dock()}
		<div class="doc-list">
			{#each SAMPLE_DOCS as d (d.id)}
				<button class="doc" class:on={lab.docId === d.id} onclick={() => (lab.docId = d.id)}>
					<span class="doc-title">{d.title}</span>
					<span class="doc-src">{d.source}</span>
				</button>
			{/each}
			{#if lab.customText}
				<button class="doc" class:on={lab.docId === 'custom'} onclick={() => (lab.docId = 'custom')}>
					<span class="doc-title">Custom document</span>
					<span class="doc-src">{lab.customText.length.toLocaleString()} chars</span>
				</button>
			{/if}
		</div>

		<div class="hairline"></div>

		<div class="fld-label">
			<span>Chunking
				<InfoPop title={STRATEGY_LABELS[lab.strategy]}>
					<p>{STRATEGY_DESCRIPTIONS[lab.strategy]}</p>
					<p>Chunk size is the core RAG trade-off: <b>small</b> = precise ranking, lost context; <b>large</b> = full context, blurred topics.</p>
				</InfoPop>
			</span>
			<span class="count tabular">
				{#if chunkBatch.loading}{chunkBatch.done}/{chunkBatch.total}{:else}{chunks.length} chunks{/if}
			</span>
		</div>
		<div class="chips">
			{#each strategies as s (s)}
				<button class="chip-btn" class:on={lab.strategy === s} onclick={() => (lab.strategy = s)} title={STRATEGY_DESCRIPTIONS[s]}>
					{STRATEGY_LABELS[s]}
				</button>
			{/each}
		</div>
		{#if lab.strategy === 'fixed' || lab.strategy === 'sliding'}
			<div class="num-row no-select">
				<label><span>size</span><input class="fld num" type="number" min="5" max="200" step="5" bind:value={lab.chunkSize} /></label>
				{#if lab.strategy === 'sliding'}
					<label><span>overlap</span><input class="fld num" type="number" min="0" max="100" step="5" bind:value={lab.chunkOverlap} /></label>
				{/if}
			</div>
		{/if}

		<div class="hairline"></div>

		<DockSection label="Chunk texts" count={`${chunks.length}`}>
			<ol class="chunk-list">
				{#each chunks as c, i (c.id)}
					{@const rank = topRanked.findIndex((r) => r.chunk.id === c.id)}
					<li class:top={rank >= 0} class:sel={selectedChunkId === c.id}>
						<button class="chunk" onclick={() => (selectedChunkId = c.id)}>
							<span class="chunk-num tabular">#{i + 1}</span>
							{#if rank >= 0}<span class="chunk-rank tabular">match {rank + 1}</span>{/if}
							<span class="chunk-text">{c.text}</span>
						</button>
					</li>
				{/each}
			</ol>
		</DockSection>
	{/snippet}

	{#snippet results()}
		<div>
			<div class="fld-label">
				<span>Query
					<InfoPop title="Query vs document roles">
						<p>Retrieval models are often trained with an <b>instruction prefix</b> — one for queries, one for documents.</p>
						<p>Here your query embeds with the query template and chunks with the document template, exactly as the model expects.</p>
					</InfoPop>
				</span>
				{#if queryEmbed.loading}<span class="busy">…</span>{/if}
			</div>
			<textarea class="fld" bind:value={lab.query} rows="2" spellcheck="false"
				placeholder="what are you trying to find in this document?"></textarea>
		</div>
		<div class="ranker-row no-select">
			<div class="chips">
				<button class="chip-btn" class:on={lab.metric === 'cosine'} onclick={() => (lab.metric = 'cosine')}>cosine</button>
				<button class="chip-btn" class:on={lab.metric === 'euclidean'} onclick={() => (lab.metric = 'euclidean')}>euclidean</button>
			</div>
			<label class="topn">
				<span>top</span>
				<input class="fld num" type="number" min="1" max="20" bind:value={lab.topN} />
			</label>
		</div>

		<div class="hairline"></div>

		{#if topRanked.length === 0}
			<p class="empty-note">
				{#if !lab.query.trim()}Type a query — chunks rank by semantic closeness.
				{:else if chunkBatch.loading}Embedding chunks…
				{:else if queryEmbed.loading}Embedding query…
				{:else}No matches.{/if}
			</p>
		{:else}
			<ol class="results">
				{#each topRanked as r, i (r.chunk.id)}
					<li class:sel={selectedChunkId === r.chunk.id}>
						<button class="result" onclick={() => (selectedChunkId = r.chunk.id)}>
							<span class="res-head">
								<span class="rank tabular">#{i + 1}</span>
								<span class="scores tabular">cos {r.sim.toFixed(3)} · eucl {r.dist.toFixed(3)}</span>
							</span>
							<!-- eslint-disable-next-line svelte/no-at-html-tags — text is HTML-escaped in highlight() -->
							<span class="res-text">{@html highlight(r.chunk.text, lab.query)}</span>
						</button>
					</li>
				{/each}
			</ol>
		{/if}
	{/snippet}
</LabShell>

<style>
	.busy {
		color: var(--lab);
	}
	.count {
		font-size: 10px;
		color: var(--text-subtle);
		text-transform: none;
		letter-spacing: 0;
	}
	.file-input {
		display: none;
	}
	.doc-list {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.doc {
		display: flex;
		flex-direction: column;
		gap: 1px;
		text-align: left;
		background: oklch(1 0 0 / 0.035);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 7px 10px;
		cursor: pointer;
		transition: border-color 0.15s ease;
		color: inherit;
	}
	.doc:hover {
		border-color: color-mix(in oklab, var(--lab) 55%, transparent);
	}
	.doc.on {
		border-color: color-mix(in oklab, var(--lab) 55%, transparent);
		background: var(--lab-dim);
	}
	.doc-title {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-primary);
	}
	.doc-src {
		font-size: 10px;
		color: var(--text-subtle);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.num-row {
		display: flex;
		gap: 10px;
	}
	.num-row label,
	.topn {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 10.5px;
		color: var(--text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.fld.num {
		width: 60px;
		padding: 4px 7px;
		font-size: 12px;
	}
	ol.chunk-list,
	ol.results {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.chunk,
	.result {
		display: block;
		width: 100%;
		text-align: left;
		background: oklch(1 0 0 / 0.025);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 6px 9px;
		cursor: pointer;
		color: inherit;
		font: inherit;
		transition: border-color 0.15s ease;
	}
	.chunk:hover,
	.result:hover {
		border-color: var(--border-strong);
	}
	li.top .chunk {
		border-color: color-mix(in oklab, var(--lab) 45%, transparent);
	}
	li.sel .chunk,
	li.sel .result {
		background: var(--lab-dim);
		border-color: color-mix(in oklab, var(--lab) 55%, transparent);
	}
	.chunk-num {
		font-size: 9px;
		color: var(--text-subtle);
		margin-right: 6px;
	}
	.chunk-rank {
		font-size: 9px;
		font-weight: 650;
		color: var(--lab);
		margin-right: 6px;
	}
	.chunk-text {
		font-size: 10.5px;
		line-height: 1.45;
		color: var(--text-muted);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.ranker-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.res-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 3px;
	}
	.rank {
		font-size: 11px;
		font-weight: 700;
		color: var(--lab);
	}
	.scores {
		font-size: 9.5px;
		color: var(--text-subtle);
	}
	.res-text {
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--text-secondary);
		display: block;
	}
	.res-text :global(mark) {
		background: color-mix(in oklab, var(--lab) 25%, transparent);
		color: var(--text-primary);
		border-radius: 3px;
		padding: 0 2px;
	}
</style>
