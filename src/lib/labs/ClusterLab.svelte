<script lang="ts">
	/**
	 * Cluster Lab — "K-means on sentence embeddings, see what falls out"
	 *
	 * Pick a sentence set, choose K, watch the model decide which sentences
	 * belong together. Each cluster gets a color; centroids are rendered as
	 * larger spheres. Silhouette score gives a one-number quality readout.
	 * When the dataset has ground-truth topics, we also report the rand-index
	 * (agreement between our clustering and the true labels).
	 */

	import { playground } from '$lib/stores/playground.svelte.js';
	import SemanticCloud, { type CloudPoint } from '$lib/viz/SemanticCloud.svelte';
	import InspectorRow from '$lib/components/InspectorRow.svelte';
	import type { EmbeddingResult } from '$lib/models/types.js';
	import { kmeans, silhouette } from '$lib/math/kmeans.js';
	import { createLabState } from './labState.svelte.js';
	import {
		CLUSTER_DATASETS,
		getClusterDataset,
		parseClusterCsv,
		type ClusterSentence
	} from './clusterData.js';

	const lab = createLabState('cluster', {
		datasetId: 'mixed-topics' as string,
		sentences: [...CLUSTER_DATASETS[0].sentences] as ClusterSentence[],
		k: CLUSTER_DATASETS[0].defaultK as number,
		showGroundTruth: false,
		uploadError: '' as string
	});

	let results = $state(new Map<string, EmbeddingResult>());
	const embeddings = $derived.by<Map<string, Float32Array>>(() => {
		const m = new Map<string, Float32Array>();
		for (const [id, r] of results) m.set(id, r.vector);
		return m;
	});
	let loadingCount = $state(0);
	let loadingTotal = $state(0);
	let selectedSentenceId = $state<string | null>(null);

	const selectedResult = $derived.by<EmbeddingResult | null>(() => {
		if (selectedSentenceId && results.has(selectedSentenceId)) {
			return results.get(selectedSentenceId) ?? null;
		}
		return null;
	});

	function selectPoint(id: string) {
		// Ignore centroid clicks — they're synthetic points without source embeddings.
		if (id.startsWith('centroid_')) return;
		selectedSentenceId = id;
	}

	const dataset = $derived(getClusterDataset(lab.datasetId));
	const groundTruthAvailable = $derived(lab.sentences.every((s) => s.topic));

	function pickDataset(id: string) {
		const d = getClusterDataset(id);
		if (!d) return;
		lab.datasetId = id;
		lab.sentences = [...d.sentences];
		lab.k = d.defaultK;
		lab.showGroundTruth = false;
	}

	// ---------- embedding ----------
	let exSeq = 0;
	async function embedAll() {
		const mySeq = ++exSeq;
		loadingTotal = lab.sentences.length;
		loadingCount = 0;
		const map = new Map<string, EmbeddingResult>();
		try {
			for (let i = 0; i < lab.sentences.length; i++) {
				if (mySeq !== exSeq) return;
				const s = lab.sentences[i];
				if (!s.text.trim()) continue;
				const r = await playground.embedText(s.text);
				if (mySeq !== exSeq) return;
				map.set(s.id, r);
				loadingCount = i + 1;
				if (i % 4 === 0 || i === lab.sentences.length - 1) {
					results = new Map(map);
				}
			}
			results = map;
		} finally {
			if (mySeq === exSeq) loadingTotal = 0;
		}
	}

	let timer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		void lab.sentences.map((s) => s.id + s.text.slice(0, 20)).join('|');
		void playground.modelId;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => void embedAll(), 250);
	});

	// ---------- clustering ----------
	const clustering = $derived.by(() => {
		const ready = lab.sentences
			.map((s) => ({ s, v: embeddings.get(s.id) }))
			.filter((r): r is { s: ClusterSentence; v: Float32Array } => !!r.v);
		if (ready.length < 2 || lab.k < 2) {
			return { assignments: [] as number[], centroids: [] as Float32Array[], silh: 0, idx: ready };
		}
		const points = ready.map((r) => r.v);
		const result = kmeans(points, { k: lab.k, seed: 0xc0ffee });
		const silh = ready.length >= 3 ? silhouette(points, result.assignments, lab.k) : 0;
		return { ...result, silh, idx: ready };
	});

	// Optional: rand-index style agreement vs ground truth
	const groundAgreement = $derived.by(() => {
		if (!groundTruthAvailable) return null;
		const ready = clustering.idx;
		if (ready.length < 2) return null;
		const topics = ready.map((r) => r.s.topic ?? '');
		const cls = clustering.assignments;
		let agree = 0;
		let total = 0;
		for (let i = 0; i < ready.length; i++) {
			for (let j = i + 1; j < ready.length; j++) {
				const sameTopic = topics[i] === topics[j];
				const sameCluster = cls[i] === cls[j];
				if (sameTopic === sameCluster) agree++;
				total++;
			}
		}
		return total === 0 ? null : agree / total;
	});

	// ---------- color palette per cluster ----------
	const PALETTE = [200, 30, 145, 280, 60, 320, 170, 0, 240, 100];
	function clusterHue(c: number): number {
		return PALETTE[c % PALETTE.length];
	}

	// Map distinct topics to hues for ground-truth overlay.
	const topicHueMap = $derived.by(() => {
		const m = new Map<string, number>();
		const topics = Array.from(new Set(lab.sentences.map((s) => s.topic).filter((t): t is string => !!t)));
		topics.forEach((t, i) => m.set(t, PALETTE[i % PALETTE.length]));
		return m;
	});

	// ---------- cloud ----------
	const points = $derived.by<CloudPoint[]>(() => {
		const out: CloudPoint[] = [];
		for (let i = 0; i < clustering.idx.length; i++) {
			const { s, v } = clustering.idx[i];
			const assigned = clustering.assignments[i] ?? 0;
			const hue = lab.showGroundTruth
				? topicHueMap.get(s.topic ?? '') ?? 0
				: clusterHue(assigned);
			out.push({
				id: s.id,
				vector: v,
				hue,
				hoverText: s.topic ? `[${s.topic}] ${s.text}` : s.text,
				variant: 'dot'
			});
		}
		// Centroids (only when k-means actually ran)
		for (let c = 0; c < clustering.centroids.length; c++) {
			const cv = clustering.centroids[c];
			if (!cv) continue;
			out.push({
				id: `centroid_${c}`,
				vector: cv,
				hue: clusterHue(c),
				label: `C${c + 1}`,
				hoverText: `centroid #${c + 1}`,
				size: 1.1
			});
		}
		return out;
	});

	// ---------- sentence editing + upload ----------
	function addSentence() {
		lab.sentences = [...lab.sentences, { id: `s_${Date.now()}`, text: '' }];
	}
	function setSentenceText(id: string, text: string) {
		lab.sentences = lab.sentences.map((s) => (s.id === id ? { ...s, text } : s));
	}
	function removeSentence(id: string) {
		lab.sentences = lab.sentences.filter((s) => s.id !== id);
	}
	function onUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const f = input.files?.[0];
		if (!f) return;
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const parsed = parseClusterCsv(String(reader.result ?? ''));
				if (parsed.length === 0) {
					lab.uploadError = 'No rows parsed.';
					return;
				}
				lab.sentences = parsed;
				lab.uploadError = '';
			} catch (err) {
				lab.uploadError = err instanceof Error ? err.message : String(err);
			}
		};
		reader.readAsText(f);
	}

	// Counts per cluster for the readout
	const clusterCounts = $derived.by(() => {
		const counts = new Array<number>(lab.k).fill(0);
		for (const a of clustering.assignments) counts[a] = (counts[a] ?? 0) + 1;
		return counts;
	});

	// Per-cluster sentence previews (first 3 per cluster)
	const clusterPreview = $derived.by<{ cluster: number; hue: number; texts: string[] }[]>(() => {
		const groups: { cluster: number; hue: number; texts: string[] }[] = [];
		for (let c = 0; c < lab.k; c++) {
			const texts: string[] = [];
			for (let i = 0; i < clustering.idx.length; i++) {
				if (clustering.assignments[i] === c) {
					texts.push(clustering.idx[i].s.text);
					if (texts.length >= 3) break;
				}
			}
			groups.push({ cluster: c, hue: clusterHue(c), texts });
		}
		return groups;
	});
</script>

<main class="lab">
	<section class="top">
		<div class="cloud-fill">
			<SemanticCloud
				{points}
				mode="pca"
				selectedId={selectedSentenceId}
				onPointClick={selectPoint}
			/>
		</div>

	<aside class="left">
		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Dataset</span>
				<label class="upload no-select" title="Upload a CSV with a text column">
					<input type="file" accept=".csv,.tsv,.txt" onchange={onUpload} />
					<span>+ csv</span>
				</label>
			</div>
			<div class="ds-list">
				{#each CLUSTER_DATASETS as d (d.id)}
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

		<div class="card glass">
			<div class="head">
				<span class="eyebrow">K-means</span>
				<span class="meta">cosine distance</span>
			</div>
			<label class="control">
				<span>K</span>
				<input type="number" min="2" max="10" bind:value={lab.k} />
			</label>
			{#if groundTruthAvailable}
				<label class="control toggle no-select">
					<input type="checkbox" bind:checked={lab.showGroundTruth} />
					<span>color by ground truth</span>
				</label>
			{/if}
		</div>

		<div class="card glass scrollable">
			<div class="head">
				<span class="eyebrow">Sentences</span>
				<div class="head-right">
					{#if loadingTotal > 0}
						<span class="status loading tabular">{loadingCount}/{loadingTotal}</span>
					{:else}
						<span class="status tabular">{lab.sentences.length}</span>
					{/if}
					<button class="add" onclick={addSentence} title="Add a sentence">＋</button>
				</div>
			</div>
			<ul class="sent-list">
				{#each lab.sentences as s (s.id)}
					<li>
						<input
							class="sent-text"
							value={s.text}
							oninput={(e) => setSentenceText(s.id, (e.target as HTMLInputElement).value)}
							placeholder="sentence…"
						/>
						<button class="x" onclick={() => removeSentence(s.id)} title="Remove">×</button>
					</li>
				{/each}
			</ul>
		</div>
	</aside>

	<aside class="right">
		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Quality</span>
				<span class="meta">k = {lab.k}</span>
			</div>
			<div class="quality">
				<div class="qm">
					<div class="qm-label">silhouette</div>
					<div class="qm-value tabular" class:good={clustering.silh > 0.25}>
						{clustering.silh.toFixed(3)}
					</div>
				</div>
				{#if groundAgreement != null}
					<div class="qm">
						<div class="qm-label">rand index vs. topic</div>
						<div class="qm-value tabular" class:good={groundAgreement > 0.7}>
							{(groundAgreement * 100).toFixed(1)}%
						</div>
					</div>
				{/if}
			</div>
			<p class="note no-select">
				Silhouette near 1 = tight, well-separated clusters. Near 0 = overlapping. Negative =
				most points are closer to another cluster than their own.
			</p>
		</div>

		<div class="card glass scrollable">
			<div class="head">
				<span class="eyebrow">Cluster preview</span>
			</div>
			{#if clusterPreview.every((c) => c.texts.length === 0)}
				<p class="empty">
					{#if loadingTotal > 0}Embedding…{:else}—{/if}
				</p>
			{:else}
				<div class="clusters">
					{#each clusterPreview as cp (cp.cluster)}
						<div class="cluster" style:--c={`oklch(0.78 0.18 ${cp.hue})`}>
							<div class="cluster-head">
								<span class="cluster-badge">C{cp.cluster + 1}</span>
								<span class="cluster-count">{clusterCounts[cp.cluster] ?? 0} sentences</span>
							</div>
							<ul class="cluster-texts">
								{#each cp.texts as t, i (i)}
									<li>{t}</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</aside>
	</section>

	<section class="bottom">
		<InspectorRow
			result={selectedResult}
			modelShortName={playground.model.shortName}
			title={selectedSentenceId ? 'Sentence' : 'Selected'}
			emptyText="Click any sentence dot to inspect its embedding."
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
	.top {
		position: relative;
		display: flex;
		gap: 10px;
		min-height: 0;
	}
	.bottom {
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
		width: 340px;
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
	.card.scrollable .sent-list,
	.card.scrollable .clusters {
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
	.control {
		display: grid;
		grid-template-columns: 1fr 70px;
		gap: 6px;
		align-items: center;
		font-size: 11px;
		color: var(--text-secondary);
	}
	.control.toggle {
		grid-template-columns: 1fr;
	}
	.control input[type='number'] {
		width: 100%;
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 3px;
		color: var(--text-primary);
		padding: 3px 6px;
		font-family: inherit;
		font-size: 11px;
		text-align: right;
		box-sizing: border-box;
	}
	.control.toggle {
		display: flex;
		gap: 6px;
		cursor: pointer;
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

	.sent-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.sent-list li {
		display: grid;
		grid-template-columns: 1fr 18px;
		gap: 4px;
		align-items: center;
	}
	.sent-text {
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

	.quality {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.qm {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 6px 8px;
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 5px;
	}
	.qm-label {
		font-size: 9px;
		color: var(--text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 600;
	}
	.qm-value {
		font-size: 18px;
		font-weight: 700;
		color: var(--text-primary);
	}
	.qm-value.good {
		color: var(--accent);
	}
	.note {
		font-size: 10px;
		color: var(--text-subtle);
		line-height: 1.5;
		margin: 0;
		font-style: italic;
	}

	.empty {
		font-size: 12px;
		color: var(--text-subtle);
		font-style: italic;
		margin: 0;
	}
	.clusters {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.cluster {
		background: var(--surface-1);
		border-left: 2px solid var(--c, transparent);
		padding: 6px 8px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.cluster-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.cluster-badge {
		font-size: 10px;
		font-weight: 700;
		color: var(--c);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.cluster-count {
		font-size: 9px;
		color: var(--text-subtle);
		font-variant-numeric: tabular-nums;
	}
	.cluster-texts {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.cluster-texts li {
		font-size: 10px;
		color: var(--text-muted);
		line-height: 1.4;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
</style>
