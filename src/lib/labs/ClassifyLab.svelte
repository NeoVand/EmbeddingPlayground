<script lang="ts">
	/**
	 * Classification Lab — "Embed the prototypes, classify by nearest neighbor"
	 *
	 * For each class we average the embeddings of its labeled examples to get
	 * a prototype vector. To classify a query we compute cosine similarity to
	 * each prototype, then softmax those similarities into a probability-like
	 * distribution. The cloud shows training points colored by class, the
	 * prototypes as larger rings, and the query as a gold marker with lines
	 * to each prototype (line thickness ∝ similarity).
	 *
	 * Users can edit examples inline, add new ones, or upload a `text,label`
	 * CSV to drop in their own dataset.
	 */

	import { playground } from '$lib/stores/playground.svelte.js';
	import SemanticCloud, { type CloudPoint, type CloudLink } from '$lib/viz/SemanticCloud.svelte';
	import InspectorRow from '$lib/components/InspectorRow.svelte';
	import { cosine } from '$lib/math/similarity.js';
	import { columnMeans, l2NormalizeInPlace } from '$lib/math/stats.js';
	import { createLabState } from './labState.svelte.js';
	import type { EmbeddingResult } from '$lib/models/types.js';
	import {
		CLASSIFY_DATASETS,
		getDataset,
		parseCsv,
		type LabeledExample
	} from './classifyData.js';

	const lab = createLabState('classify', {
		datasetId: 'sentiment' as string,
		examples: [...CLASSIFY_DATASETS[0].examples] as LabeledExample[],
		query: 'I absolutely loved every minute of it.',
		uploadError: '' as string
	});

	let exampleResults = $state(new Map<string, EmbeddingResult>());
	const exampleEmbeddings = $derived.by<Map<string, Float32Array>>(() => {
		const m = new Map<string, Float32Array>();
		for (const [id, r] of exampleResults) m.set(id, r.vector);
		return m;
	});
	let queryResult = $state<EmbeddingResult | null>(null);
	let queryVector = $derived(queryResult?.vector ?? null);
	let loadingCount = $state(0);
	let loadingTotal = $state(0);
	let embeddingQuery = $state(false);
	let selectedExampleId = $state<string | null>(null);

	const selectedResult = $derived.by<EmbeddingResult | null>(() => {
		if (selectedExampleId === 'query') return queryResult;
		if (selectedExampleId && exampleResults.has(selectedExampleId)) {
			return exampleResults.get(selectedExampleId) ?? null;
		}
		return null;
	});

	function selectPoint(id: string) {
		selectedExampleId = id;
	}

	// ---------- dataset switching ----------
	const dataset = $derived.by<ReturnType<typeof getDataset>>(() => getDataset(lab.datasetId));

	function pickDataset(id: string) {
		const d = getDataset(id);
		if (!d) return;
		lab.datasetId = id;
		lab.examples = [...d.examples];
		lab.uploadError = '';
	}

	// ---------- embedding ----------
	let exSeq = 0;
	async function embedExamples() {
		const mySeq = ++exSeq;
		loadingTotal = lab.examples.length;
		loadingCount = 0;
		const map = new Map<string, EmbeddingResult>();
		try {
			for (let i = 0; i < lab.examples.length; i++) {
				if (mySeq !== exSeq) return;
				const ex = lab.examples[i];
				if (!ex.text.trim()) continue;
				const r = await playground.embedText(ex.text);
				if (mySeq !== exSeq) return;
				map.set(ex.id, r);
				loadingCount = i + 1;
				if (i % 3 === 0 || i === lab.examples.length - 1) {
					exampleResults = new Map(map);
				}
			}
			exampleResults = map;
		} finally {
			if (mySeq === exSeq) loadingTotal = 0;
		}
	}

	let querySeq = 0;
	async function embedQuery() {
		const q = lab.query.trim();
		if (!q) {
			queryResult = null;
			return;
		}
		const s = ++querySeq;
		embeddingQuery = true;
		try {
			const r = await playground.embedText(q);
			if (s === querySeq) queryResult = r;
		} finally {
			if (s === querySeq) embeddingQuery = false;
		}
	}

	let exTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		void lab.examples.map((e) => e.id + e.text + e.label).join('|');
		void playground.modelId;
		if (exTimer) clearTimeout(exTimer);
		exTimer = setTimeout(() => void embedExamples(), 300);
	});

	let qTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		void lab.query;
		void playground.modelId;
		if (qTimer) clearTimeout(qTimer);
		qTimer = setTimeout(() => void embedQuery(), 300);
	});

	// ---------- prototypes ----------
	type Prototype = { label: string; vector: Float32Array; count: number; hue: number };
	const classHues: Record<string, number> = {
		positive: 145,
		negative: 25,
		neutral: 215,
		tech: 215,
		sports: 25,
		politics: 280,
		food: 60,
		science: 165,
		ham: 145,
		spam: 25
	};
	function labelHue(label: string, idx: number): number {
		const palette = [200, 30, 145, 280, 60, 320, 170, 0];
		return classHues[label] ?? palette[idx % palette.length];
	}

	const prototypes = $derived.by<Prototype[]>(() => {
		const classes = dataset?.classes ?? Array.from(new Set(lab.examples.map((e) => e.label)));
		const out: Prototype[] = [];
		for (let i = 0; i < classes.length; i++) {
			const cls = classes[i];
			const vecs = lab.examples
				.filter((e) => e.label === cls)
				.map((e) => exampleEmbeddings.get(e.id))
				.filter((v): v is Float32Array => !!v);
			if (vecs.length === 0) continue;
			const mean = columnMeans(vecs);
			const meanArr = new Float32Array(mean.length);
			for (let d = 0; d < mean.length; d++) meanArr[d] = mean[d];
			l2NormalizeInPlace(meanArr);
			out.push({ label: cls, vector: meanArr, count: vecs.length, hue: labelHue(cls, i) });
		}
		return out;
	});

	// ---------- prediction ----------
	type Prediction = { label: string; sim: number; prob: number; hue: number };
	const predictions = $derived.by<Prediction[]>(() => {
		if (!queryVector || prototypes.length === 0) return [];
		const dim = queryVector.length;
		if (prototypes.some((p) => p.vector.length !== dim)) return [];
		const raw = prototypes.map((p) => ({
			label: p.label,
			sim: cosine(queryVector!, p.vector),
			hue: p.hue
		}));
		// Softmax with a temperature for sharper probabilities; cosines are
		// already in [-1, 1] so we scale up first.
		const T = 0.08;
		const logits = raw.map((r) => r.sim / T);
		const m = Math.max(...logits);
		const exps = logits.map((l) => Math.exp(l - m));
		const sum = exps.reduce((s, x) => s + x, 0);
		const out = raw.map((r, i) => ({ ...r, prob: exps[i] / sum }));
		out.sort((a, b) => b.prob - a.prob);
		return out;
	});

	// ---------- cloud ----------
	const points = $derived.by<CloudPoint[]>(() => {
		const out: CloudPoint[] = [];
		// Training examples as small dots, hue by class.
		for (const ex of lab.examples) {
			const v = exampleEmbeddings.get(ex.id);
			if (!v) continue;
			const classIdx = (dataset?.classes ?? []).indexOf(ex.label);
			out.push({
				id: ex.id,
				vector: v,
				hue: labelHue(ex.label, classIdx),
				hoverText: `[${ex.label}] ${ex.text}`,
				variant: 'dot'
			});
		}
		// Prototypes as larger spheres labeled by class.
		for (const p of prototypes) {
			out.push({
				id: `proto_${p.label}`,
				vector: p.vector,
				hue: p.hue,
				label: p.label,
				hoverText: `prototype · ${p.label} · n=${p.count}`,
				size: 1.1
			});
		}
		// Query as a gold ring.
		if (queryVector) {
			out.push({
				id: 'query',
				vector: queryVector,
				hue: 60,
				label: 'QUERY',
				hoverText: `query: "${lab.query}"`,
				size: 1.2,
				variant: 'ring',
				pinned: true
			});
		}
		return out;
	});

	const links = $derived.by<CloudLink[]>(() => {
		if (!queryVector) return [];
		// Line to every prototype, opacity ∝ probability.
		return predictions.map((p) => ({
			from: 'query',
			to: `proto_${p.label}`,
			style: 'solid' as const,
			color: 0xd8c068,
			opacity: 0.25 + p.prob * 0.55
		}));
	});

	// ---------- editing ----------
	function addExample() {
		const classes = dataset?.classes ?? Array.from(new Set(lab.examples.map((e) => e.label)));
		const defaultLabel = classes[0] ?? 'class';
		lab.examples = [
			...lab.examples,
			{ id: `ex_${Date.now()}`, text: '', label: defaultLabel }
		];
	}
	function setExampleText(id: string, text: string) {
		lab.examples = lab.examples.map((e) => (e.id === id ? { ...e, text } : e));
	}
	function setExampleLabel(id: string, label: string) {
		lab.examples = lab.examples.map((e) => (e.id === id ? { ...e, label } : e));
	}
	function removeExample(id: string) {
		lab.examples = lab.examples.filter((e) => e.id !== id);
	}

	function onUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const f = input.files?.[0];
		if (!f) return;
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const parsed = parseCsv(String(reader.result ?? ''));
				if (parsed.length === 0) {
					lab.uploadError = 'No rows parsed. Need a text + label CSV.';
					return;
				}
				lab.examples = parsed;
				lab.uploadError = '';
			} catch (err) {
				lab.uploadError = err instanceof Error ? err.message : String(err);
			}
		};
		reader.readAsText(f);
	}

	function applyTestQuery(q: string) {
		lab.query = q;
	}

	const datasetClasses = $derived(dataset?.classes ?? Array.from(new Set(lab.examples.map((e) => e.label))));
	const testQueries = $derived(dataset?.testQueries ?? []);
</script>

<main class="lab">
	<section class="lab-top">
		<div class="cloud-fill">
			<SemanticCloud
				{points}
				{links}
				mode="pca"
				selectedId={selectedExampleId ?? (queryVector ? 'query' : null)}
				onPointClick={selectPoint}
			/>
		</div>

	<aside class="left">
		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Dataset</span>
				<label class="upload no-select" title="Upload a CSV with text,label columns">
					<input type="file" accept=".csv,.tsv,.txt" onchange={onUpload} />
					<span>+ csv</span>
				</label>
			</div>
			<div class="ds-list">
				{#each CLASSIFY_DATASETS as d (d.id)}
					{@const active = lab.datasetId === d.id}
					<button class="ds" class:active onclick={() => pickDataset(d.id)}>
						<span class="ds-name">{d.name}</span>
						<span class="ds-desc">{d.description}</span>
					</button>
				{/each}
			</div>
			{#if lab.uploadError}
				<p class="upload-err">{lab.uploadError}</p>
			{/if}
		</div>

		<div class="card glass scrollable">
			<div class="head">
				<span class="eyebrow">Examples</span>
				<div class="head-right">
					{#if loadingTotal > 0}
						<span class="status loading tabular">{loadingCount}/{loadingTotal}</span>
					{:else}
						<span class="status tabular">{lab.examples.length} · {datasetClasses.length} classes</span>
					{/if}
					<button class="add" onclick={addExample} title="Add an example">＋</button>
				</div>
			</div>
			<ul class="ex-list">
				{#each lab.examples as ex (ex.id)}
					{@const classIdx = datasetClasses.indexOf(ex.label)}
					<li style:--c={`oklch(0.78 0.18 ${labelHue(ex.label, classIdx)})`}>
						<div class="ex-row">
							<input
								class="ex-text"
								value={ex.text}
								oninput={(e) => setExampleText(ex.id, (e.target as HTMLInputElement).value)}
								placeholder="example text…"
							/>
							<input
								class="ex-label"
								value={ex.label}
								oninput={(e) => setExampleLabel(ex.id, (e.target as HTMLInputElement).value)}
								title="class label"
							/>
							<button class="x" onclick={() => removeExample(ex.id)} title="Remove">×</button>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	</aside>

	<aside class="right">
		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Query</span>
				{#if embeddingQuery}<span class="status loading">…</span>{/if}
			</div>
			<textarea
				bind:value={lab.query}
				rows="2"
				placeholder="text to classify"
				spellcheck="false"
			></textarea>
			{#if testQueries.length > 0}
				<div class="test-queries">
					<span class="eyebrow no-select">try:</span>
					{#each testQueries as q, i (i)}
						<button class="test-q" onclick={() => applyTestQuery(q)} title={q}>
							{q.split(' ').slice(0, 5).join(' ')}…
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Prediction</span>
				<span class="meta">softmax(cosine / T)</span>
			</div>
			{#if predictions.length === 0}
				<p class="empty">
					{#if loadingTotal > 0}Building prototypes…{:else if !queryVector}Type a query.{:else}—{/if}
				</p>
			{:else}
				<ol class="preds">
					{#each predictions as p, i (p.label)}
						<li style:--c={`oklch(0.78 0.18 ${p.hue})`} class:top={i === 0}>
							<div class="pred-head">
								<span class="pred-badge">{p.label}</span>
								<span class="pred-prob tabular">{(p.prob * 100).toFixed(1)}%</span>
							</div>
							<div class="pred-bar">
								<div class="pred-fill" style:width={`${p.prob * 100}%`}></div>
							</div>
							<div class="pred-cos no-select tabular">cos {p.sim.toFixed(3)}</div>
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
			title={selectedExampleId === 'query' ? 'Query' : selectedExampleId ? 'Example' : 'Selected'}
			emptyText="Click any training example or the QUERY ring to inspect its embedding."
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
		width: 360px;
	}
	.right {
		width: 380px;
		margin-left: auto;
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
	.card.scrollable .ex-list {
		overflow-y: auto;
		min-height: 0;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.head-right {
		display: flex;
		align-items: center;
		gap: 8px;
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
	.add {
		width: 22px;
		height: 22px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 13px;
	}
	.add:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
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
	.upload-err {
		font-size: 10px;
		color: var(--bad);
		margin: 0;
	}

	.ds-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.ds {
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
	.ds:hover {
		border-color: var(--border-strong);
	}
	.ds.active {
		background: var(--accent-glow);
		border-color: var(--accent);
	}
	.ds-name {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-primary);
	}
	.ds-desc {
		font-size: 9px;
		color: var(--text-subtle);
		line-height: 1.4;
	}

	.ex-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.ex-list li {
		border-left: 2px solid var(--c, transparent);
		padding-left: 6px;
	}
	.ex-row {
		display: grid;
		grid-template-columns: 1fr 80px 18px;
		gap: 4px;
		align-items: center;
	}
	.ex-text,
	.ex-label,
	textarea,
	.test-q {
		font-family: 'Inter', sans-serif;
		font-size: 11px;
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 3px;
		color: var(--text-primary);
		padding: 3px 6px;
		min-width: 0;
		box-sizing: border-box;
	}
	.ex-label {
		color: var(--c, var(--text-primary));
		font-weight: 600;
		text-transform: lowercase;
	}
	.x {
		background: transparent;
		border: 0;
		color: var(--text-subtle);
		font-size: 13px;
		cursor: pointer;
		padding: 0;
	}
	.x:hover {
		color: var(--bad);
	}

	textarea {
		width: 100%;
		font-size: 13px;
		line-height: 1.45;
		min-height: 44px;
		padding: 6px 8px;
		resize: vertical;
	}
	.test-queries {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
	}
	.test-q {
		cursor: pointer;
		color: var(--text-muted);
		font-size: 10px;
		max-width: 130px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.test-q:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.empty {
		font-size: 12px;
		color: var(--text-subtle);
		font-style: italic;
		margin: 0;
	}
	.preds {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.preds li {
		background: var(--surface-1);
		border-left: 2px solid var(--c, transparent);
		padding: 6px 8px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.preds li.top {
		background: color-mix(in oklab, var(--c) 12%, var(--surface-1));
	}
	.pred-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.pred-badge {
		font-size: 11px;
		font-weight: 700;
		color: var(--c);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.pred-prob {
		font-size: 14px;
		font-weight: 700;
		color: var(--c);
	}
	.pred-bar {
		height: 4px;
		background: var(--surface-2);
		border-radius: 2px;
		overflow: hidden;
	}
	.pred-fill {
		height: 100%;
		background: var(--c);
		transition: width 0.25s ease;
		opacity: 0.85;
	}
	.pred-cos {
		font-size: 9px;
		color: var(--text-subtle);
	}
</style>
