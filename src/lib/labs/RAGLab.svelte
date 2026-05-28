<script lang="ts">
	/**
	 * RAG Lab — "Semantic search, the retrieval half of RAG"
	 *
	 * Pick a document, choose a chunking strategy, type a query. Each chunk
	 * gets embedded; the query gets embedded; we rank chunks by cosine or
	 * euclidean distance and show the top matches with their cloud positions
	 * highlighted. No generation — this lab is purely about *retrieval*.
	 */

	import { playground } from '$lib/stores/playground.svelte.js';
	import SemanticCloud, { type CloudPoint, type CloudLink } from '$lib/viz/SemanticCloud.svelte';
	import InspectorRow from '$lib/components/InspectorRow.svelte';
	import { cosine, euclidean } from '$lib/math/similarity.js';
	import type { EmbeddingResult } from '$lib/models/types.js';
	import { createLabState } from './labState.svelte.js';
	import { SAMPLE_DOCS, getDoc } from '$lib/rag/documents.js';
	import {
		chunkText,
		STRATEGY_LABELS,
		STRATEGY_DESCRIPTIONS,
		type Chunk,
		type ChunkStrategy
	} from '$lib/rag/chunking.js';

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

	// ---------- text source resolution ----------
	const activeText = $derived.by(() => {
		if (lab.docId === 'custom') return lab.customText;
		const d = getDoc(lab.docId);
		return d?.text ?? '';
	});
	const activeTitle = $derived.by(() => {
		if (lab.docId === 'custom') return 'Custom document';
		return getDoc(lab.docId)?.title ?? '';
	});

	// ---------- chunking ----------
	const chunks = $derived.by<Chunk[]>(() =>
		chunkText(activeText, {
			strategy: lab.strategy,
			size: lab.chunkSize,
			overlap: lab.chunkOverlap
		})
	);

	// ---------- embedding ----------
	let chunkResults = $state(new Map<string, EmbeddingResult>());
	let chunkEmbeddings = $derived.by<Map<string, Float32Array>>(() => {
		const m = new Map<string, Float32Array>();
		for (const [id, r] of chunkResults) m.set(id, r.vector);
		return m;
	});
	let chunksEmbedded = $state(0);
	let totalChunks = $state(0);
	let embeddingChunks = $state(false);
	let queryResult = $state<EmbeddingResult | null>(null);
	let queryEmbedding = $state(false);
	let selectedChunkId = $state<string | null>(null);

	const selectedResult = $derived.by<EmbeddingResult | null>(() => {
		if (selectedChunkId === 'query') return queryResult;
		if (selectedChunkId && chunkResults.has(selectedChunkId)) {
			return chunkResults.get(selectedChunkId) ?? null;
		}
		return null;
	});

	function selectPoint(id: string) {
		selectedChunkId = id;
	}

	let chunkSeq = 0;
	async function embedChunks() {
		const ch = chunks;
		const mySeq = ++chunkSeq;
		void ch;
		totalChunks = ch.length;
		chunksEmbedded = 0;
		embeddingChunks = true;
		const map = new Map<string, EmbeddingResult>();
		try {
			for (let i = 0; i < ch.length; i++) {
				if (mySeq !== chunkSeq) return;
				const c = ch[i];
				if (!c.text.trim()) continue;
				const r = await playground.embedText(c.text);
				if (mySeq !== chunkSeq) return;
				map.set(c.id, r);
				chunksEmbedded = i + 1;
				if (i % 3 === 0 || i === ch.length - 1) {
					chunkResults = new Map(map);
				}
			}
			chunkResults = map;
		} finally {
			if (mySeq === chunkSeq) embeddingChunks = false;
		}
	}

	let querySeq = 0;
	async function embedQuery() {
		const q = lab.query.trim();
		if (!q) {
			queryResult = null;
			return;
		}
		const mySeq = ++querySeq;
		queryEmbedding = true;
		try {
			const r = await playground.embedText(q);
			if (mySeq === querySeq) queryResult = r;
		} catch {
			if (mySeq === querySeq) queryResult = null;
		} finally {
			if (mySeq === querySeq) queryEmbedding = false;
		}
	}

	// Re-embed chunks whenever the chunk set or model changes
	let chunkTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		// dependencies: chunk ids + model
		void chunks.map((c: Chunk) => c.id + c.text.slice(0, 20)).join('|');
		void playground.modelId;
		if (chunkTimer) clearTimeout(chunkTimer);
		chunkTimer = setTimeout(() => void embedChunks(), 200);
	});

	let queryTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		void lab.query;
		void playground.modelId;
		if (queryTimer) clearTimeout(queryTimer);
		queryTimer = setTimeout(() => void embedQuery(), 300);
	});

	// ---------- ranking ----------
	type Ranked = { chunk: Chunk; score: number; sim: number; dist: number };
	const ranked = $derived.by<Ranked[]>(() => {
		const q = queryResult?.vector;
		const ch = chunks;
		if (!q) return [];
		const out: Ranked[] = [];
		for (const c of ch) {
			const v = chunkEmbeddings.get(c.id);
			if (!v) continue;
			if (v.length !== q.length) continue;
			const sim = cosine(q, v);
			const dist = euclidean(q, v);
			const score = lab.metric === 'cosine' ? sim : -dist; // higher = closer
			out.push({ chunk: c, score, sim, dist });
		}
		out.sort((a, b) => b.score - a.score);
		return out;
	});

	const topRanked = $derived(ranked.slice(0, lab.topN));
	const topIds = $derived(new Set(topRanked.map((r) => r.chunk.id)));

	// ---------- cloud points ----------
	const points = $derived.by<CloudPoint[]>(() => {
		const out: CloudPoint[] = [];
		const ch = chunks;
		const N = ch.length;
		for (let i = 0; i < ch.length; i++) {
			const c = ch[i];
			const vec = chunkEmbeddings.get(c.id);
			if (!vec) continue;
			const isTop = topIds.has(c.id);
			// hue gradient along document position: cool → warm
			const tFrac = i / Math.max(1, N - 1);
			const hue = 220 - 220 * tFrac;
			out.push({
				id: c.id,
				vector: vec,
				hue,
				hoverText: `[chunk ${c.index + 1}/${N}] ${c.text.slice(0, 80)}${c.text.length > 80 ? '…' : ''}`,
				size: isTop ? 0.95 : 0.6,
				variant: isTop ? 'sphere' : 'dot',
				label: isTop ? `#${topRanked.findIndex((r) => r.chunk.id === c.id) + 1}` : undefined
			});
		}
		if (queryResult) {
			out.push({
				id: 'query',
				vector: queryResult.vector,
				hue: 60, // distinct yellow-gold
				label: 'QUERY',
				hoverText: `query: "${lab.query}"`,
				size: 1.2,
				variant: 'ring',
				// Always visible billboard ring — the QUERY shouldn't lose its
				// anchor when the user clicks a chunk to inspect it.
				pinned: true
			});
		}
		return out;
	});

	const links = $derived.by<CloudLink[]>(() => {
		if (!queryResult) return [];
		return topRanked.map((r) => ({
			from: 'query',
			to: r.chunk.id,
			style: 'solid' as const,
			color: 0xd8c068,
			opacity: 0.55
		}));
	});

	// ---------- file upload ----------
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

	function pickDoc(id: string) {
		lab.docId = id;
	}

	function highlightedChunkText(c: Chunk, query: string): string {
		// Minimal highlight: case-insensitive contains. The lab is about
		// semantic similarity, not lexical match, but this is a useful tell
		// that confirms or contradicts the model's choice.
		if (!query.trim()) return c.text;
		return c.text;
	}
</script>

<main class="lab">
	<section class="lab-top">
		<div class="cloud-fill">
			<SemanticCloud
				{points}
				{links}
				mode="pca"
				selectedId={selectedChunkId ?? (queryResult ? 'query' : null)}
				onPointClick={selectPoint}
			/>
		</div>
	<aside class="left">
		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Document</span>
				<label class="upload no-select" title="Upload a .txt file">
					<input type="file" accept=".txt,.md,text/plain" onchange={onFileChange} />
					<span>+ upload</span>
				</label>
			</div>
			<div class="doc-list">
				{#each SAMPLE_DOCS as d (d.id)}
					{@const active = lab.docId === d.id}
					<button class="doc" class:active onclick={() => pickDoc(d.id)} title={d.title}>
						<span class="doc-title">{d.title}</span>
						<span class="doc-src">{d.source}</span>
					</button>
				{/each}
				{#if lab.customText}
					<button
						class="doc"
						class:active={lab.docId === 'custom'}
						onclick={() => pickDoc('custom')}
					>
						<span class="doc-title">Custom document</span>
						<span class="doc-src">{lab.customText.length.toLocaleString()} chars</span>
					</button>
				{/if}
			</div>
		</div>

		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Chunking</span>
				<span class="meta tabular">{chunks.length} chunks</span>
			</div>
			<div class="strategies">
				{#each (Object.keys(STRATEGY_LABELS) as ChunkStrategy[]) as s (s)}
					{@const active = lab.strategy === s}
					<button
						class="strat"
						class:active
						onclick={() => (lab.strategy = s)}
						title={STRATEGY_DESCRIPTIONS[s]}
					>
						{STRATEGY_LABELS[s]}
					</button>
				{/each}
			</div>
			{#if lab.strategy === 'fixed' || lab.strategy === 'sliding'}
				<label class="control">
					<span>Size (words)</span>
					<input
						type="number"
						min="5"
						max="200"
						step="5"
						bind:value={lab.chunkSize}
					/>
				</label>
			{/if}
			{#if lab.strategy === 'sliding'}
				<label class="control">
					<span>Overlap</span>
					<input type="number" min="0" max="100" step="5" bind:value={lab.chunkOverlap} />
				</label>
			{/if}
			<p class="hint no-select">{STRATEGY_DESCRIPTIONS[lab.strategy]}</p>
		</div>

		<div class="card glass scrollable">
			<div class="head">
				<span class="eyebrow">Chunks</span>
				{#if embeddingChunks}
					<span class="status loading tabular"
						>{chunksEmbedded}/{totalChunks}</span
					>
				{:else}
					<span class="status tabular">{chunks.length} ready</span>
				{/if}
			</div>
			<ol class="chunk-list">
				{#each chunks as c, i (c.id)}
					{@const isTop = topIds.has(c.id)}
					{@const rank = topRanked.findIndex((r) => r.chunk.id === c.id)}
					<li class:top={isTop}>
						<div class="chunk-meta">
							<span class="chunk-num tabular">#{i + 1}</span>
							{#if rank >= 0}
								<span class="chunk-rank">match {rank + 1}</span>
							{/if}
						</div>
						<div class="chunk-text">{c.text}</div>
					</li>
				{/each}
			</ol>
		</div>
	</aside>

	<aside class="right">
		<div class="card glass query-card">
			<div class="head">
				<span class="eyebrow">Query</span>
				{#if queryEmbedding}<span class="status loading">…</span>{/if}
			</div>
			<textarea
				bind:value={lab.query}
				rows="2"
				placeholder="what are you trying to find in this document?"
				spellcheck="false"
			></textarea>
			<div class="ranker-row no-select">
				<div class="metric-toggle">
					<button
						class="metric"
						class:active={lab.metric === 'cosine'}
						onclick={() => (lab.metric = 'cosine')}
						title="Rank by cosine similarity (higher = closer)">cosine</button
					>
					<button
						class="metric"
						class:active={lab.metric === 'euclidean'}
						onclick={() => (lab.metric = 'euclidean')}
						title="Rank by euclidean distance (lower = closer)">euclidean</button
					>
				</div>
				<label class="topn">
					<span>top</span>
					<input type="number" min="1" max="20" bind:value={lab.topN} />
				</label>
			</div>
		</div>

		<div class="card glass results-card">
			<div class="head">
				<span class="eyebrow">Results</span>
				<span class="meta">ranked by {lab.metric}</span>
			</div>
			{#if topRanked.length === 0}
				<p class="empty">
					{#if !lab.query.trim()}
						Type a query above.
					{:else if embeddingChunks}
						Embedding chunks…
					{:else if queryEmbedding}
						Embedding query…
					{:else}
						No matches.
					{/if}
				</p>
			{:else}
				<ol class="results">
					{#each topRanked as r, i (r.chunk.id)}
						<li>
							<div class="result-head">
								<span class="rank tabular">#{i + 1}</span>
								<span class="result-meta tabular">
									<span class="cos" title="cosine similarity">cos {r.sim.toFixed(3)}</span>
									<span class="dot">·</span>
									<span class="dist" title="euclidean distance">eucl {r.dist.toFixed(3)}</span>
								</span>
							</div>
							<div class="result-text">{highlightedChunkText(r.chunk, lab.query)}</div>
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	</aside>
	</section>

	<section class="lab-bottom">
		<InspectorRow
			result={selectedResult}
			modelShortName={playground.model.shortName}
			title={selectedChunkId === 'query'
				? 'Query'
				: selectedChunkId
					? `Chunk ${selectedChunkId}`
					: 'Selected'}
			emptyText="Click any chunk or the QUERY ring to inspect its embedding."
		/>
	</section>
</main>

<style>
	.lab {
		display: grid;
		grid-template-rows: 1fr 220px;
		gap: 10px;
		min-height: 0;
		height: 100%;
	}
	.lab-top {
		position: relative;
		display: flex;
		gap: 10px;
		min-height: 0;
	}
	.lab-bottom {
		min-height: 0;
		min-width: 0;
	}
	.cloud-fill {
		position: absolute;
		inset: 0;
		z-index: 0;
	}
	.left,
	.right {
		position: relative;
		z-index: 2;
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
		flex-shrink: 0;
	}
	.left {
		width: 320px;
	}
	.right {
		width: 400px;
		margin-left: auto;
	}
	.left :global(.scrollable),
	.right :global(.scrollable),
	.left :global(.results-card),
	.right :global(.results-card) {
		flex: 1;
		min-height: 0;
	}
	.card {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.card.scrollable {
		min-height: 0;
		flex: 1;
	}
	.card.scrollable .chunk-list {
		overflow-y: auto;
		min-height: 0;
	}
	.card.results-card {
		min-height: 0;
		flex: 1;
	}
	.card.results-card .results {
		overflow-y: auto;
		min-height: 0;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.meta {
		font-size: 10px;
		color: var(--text-subtle);
	}
	.status {
		font-size: 10px;
		color: var(--text-subtle);
	}
	.status.loading {
		color: var(--accent);
	}

	/* upload */
	.upload {
		font-size: 10px;
		color: var(--text-muted);
		cursor: pointer;
		padding: 2px 6px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 3px;
	}
	.upload:hover {
		color: var(--accent);
		border-color: var(--accent);
	}
	.upload input {
		display: none;
	}

	/* doc list */
	.doc-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.doc {
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 6px 8px;
		cursor: pointer;
		text-align: left;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.doc:hover {
		border-color: var(--border-strong);
	}
	.doc.active {
		background: var(--accent-glow);
		border-color: var(--accent);
	}
	.doc-title {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-primary);
	}
	.doc-src {
		font-size: 9px;
		color: var(--text-subtle);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	/* chunking */
	.strategies {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 3px;
	}
	.strat {
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 3px;
		padding: 4px 6px;
		cursor: pointer;
		font-size: 11px;
		color: var(--text-muted);
		font-weight: 500;
	}
	.strat:hover {
		border-color: var(--border-strong);
		color: var(--text-primary);
	}
	.strat.active {
		background: var(--accent-glow);
		border-color: var(--accent);
		color: var(--text-primary);
	}
	.control {
		display: grid;
		grid-template-columns: 1fr 70px;
		gap: 6px;
		align-items: center;
		font-size: 11px;
		color: var(--text-secondary);
	}
	.control input {
		width: 100%;
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 3px;
		color: var(--text-primary);
		padding: 3px 6px;
		font-family: inherit;
		font-size: 11px;
		text-align: right;
	}
	.hint {
		font-size: 10px;
		color: var(--text-subtle);
		line-height: 1.45;
		margin: 4px 0 0;
		font-style: italic;
	}

	/* chunk list */
	.chunk-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.chunk-list li {
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 6px 8px;
		font-size: 11px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.chunk-list li.top {
		border-color: var(--accent);
		background: color-mix(in oklab, var(--accent) 6%, var(--surface-1));
	}
	.chunk-meta {
		display: flex;
		gap: 6px;
		align-items: baseline;
	}
	.chunk-num {
		font-size: 9px;
		color: var(--text-subtle);
		font-weight: 600;
	}
	.chunk-rank {
		font-size: 9px;
		font-weight: 700;
		color: var(--accent);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.chunk-text {
		color: var(--text-secondary);
		line-height: 1.4;
		max-height: 4.2em;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
	}

	/* query */
	.query-card textarea {
		width: 100%;
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 5px;
		color: var(--text-primary);
		font-family: 'Inter', sans-serif;
		font-size: 13px;
		line-height: 1.45;
		padding: 6px 8px;
		min-height: 40px;
		box-sizing: border-box;
		resize: vertical;
	}
	.ranker-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}
	.metric-toggle {
		display: flex;
		gap: 0;
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 4px;
		overflow: hidden;
	}
	.metric {
		background: transparent;
		border: 0;
		color: var(--text-muted);
		font-size: 11px;
		padding: 4px 10px;
		cursor: pointer;
		font-weight: 500;
	}
	.metric:hover {
		color: var(--text-primary);
	}
	.metric.active {
		background: var(--accent-glow);
		color: var(--text-primary);
	}
	.topn {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 10px;
		color: var(--text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.topn input {
		width: 44px;
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 3px;
		color: var(--text-primary);
		padding: 3px 4px;
		font-family: inherit;
		font-size: 11px;
		text-align: right;
	}

	/* results */
	.results {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.results li {
		background: var(--surface-1);
		border-left: 2px solid var(--accent);
		padding: 6px 8px;
		font-size: 11px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.result-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.rank {
		font-size: 12px;
		font-weight: 700;
		color: var(--accent);
	}
	.result-meta {
		font-size: 10px;
		color: var(--text-muted);
		display: flex;
		gap: 5px;
	}
	.result-meta .dot {
		color: var(--text-subtle);
	}
	.result-meta .cos {
		color: var(--accent);
	}
	.result-meta .dist {
		color: var(--contrast);
	}
	.result-text {
		color: var(--text-secondary);
		line-height: 1.5;
	}
	.empty {
		font-size: 12px;
		color: var(--text-subtle);
		font-style: italic;
		margin: 0;
	}
</style>
