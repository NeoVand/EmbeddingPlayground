<script lang="ts">
	/**
	 * Cluster — k-means on sentence embeddings, watch structure fall out.
	 *
	 * Pick a sentence set, choose K; silhouette scores the clustering and,
	 * when ground-truth topics exist, a pair-counting Rand index reports how
	 * well the clusters recover them.
	 */

	import { IconAdd, IconQuality, IconRemove, IconUpload } from '$lib/icons.js';
	import { kmeans, silhouette } from '$lib/math/kmeans.js';
	import type { EmbeddingResult } from '$lib/models/types.js';
	import { playground } from '$lib/stores/playground.svelte.js';
	import { theme } from '$lib/theme/theme.svelte.js';
	import DockSection from '$lib/shell/DockSection.svelte';
	import InfoPop from '$lib/shell/InfoPop.svelte';
	import LabShell from '$lib/shell/LabShell.svelte';
	import SemanticCloud, { type CloudPoint } from '$lib/viz/SemanticCloud.svelte';
	import { CLUSTER_DATASETS, getClusterDataset, parseClusterCsv, type ClusterSentence } from './clusterData.js';
	import { createBatchEmbed } from './embed.svelte.js';
	import { createLabState } from './labState.svelte.js';

	const lab = createLabState('cluster', {
		datasetId: 'mixed-topics' as string,
		sentences: [...CLUSTER_DATASETS[0].sentences] as ClusterSentence[],
		k: CLUSTER_DATASETS[0].defaultK as number,
		showGroundTruth: false,
		uploadError: '' as string
	});

	const batch = createBatchEmbed({ delay: 250, flushEvery: 4 });
	$effect(() => {
		void playground.modelId;
		void lab.sentences.map((s) => s.id + s.text.slice(0, 20)).join('|');
		batch.run(lab.sentences.map((s) => ({ id: s.id, text: s.text })));
	});

	let selectedId = $state<string | null>(null);
	const selectedResult = $derived.by<EmbeddingResult | null>(() =>
		selectedId ? (batch.results.get(selectedId) ?? null) : null
	);

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

	// ---------- clustering ----------
	const clustering = $derived.by(() => {
		const ready = lab.sentences
			.map((s) => ({ s, v: batch.results.get(s.id)?.vector }))
			.filter((r): r is { s: ClusterSentence; v: Float32Array } => !!r.v);
		if (ready.length < 2 || lab.k < 2) {
			return { assignments: [] as number[], centroids: [] as Float32Array[], silh: 0, idx: ready };
		}
		const points = ready.map((r) => r.v);
		const result = kmeans(points, { k: lab.k, seed: 0xc0ffee });
		const silh = ready.length >= 3 ? silhouette(points, result.assignments, lab.k) : 0;
		return { ...result, silh, idx: ready };
	});

	// Pair-counting Rand index vs ground truth.
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

	const PALETTE = [200, 30, 145, 280, 60, 320, 170, 0, 240, 100];
	function clusterHue(c: number): number {
		return PALETTE[c % PALETTE.length];
	}
	const topicHueMap = $derived.by(() => {
		const m = new Map<string, number>();
		const topics = Array.from(new Set(lab.sentences.map((s) => s.topic).filter((t): t is string => !!t)));
		topics.forEach((t, i) => m.set(t, PALETTE[i % PALETTE.length]));
		return m;
	});

	const points = $derived.by<CloudPoint[]>(() => {
		const out: CloudPoint[] = [];
		for (let i = 0; i < clustering.idx.length; i++) {
			const { s, v } = clustering.idx[i];
			const assigned = clustering.assignments[i] ?? 0;
			const hue = lab.showGroundTruth ? (topicHueMap.get(s.topic ?? '') ?? 0) : clusterHue(assigned);
			out.push({
				id: s.id,
				vector: v,
				hue,
				hoverText: s.topic ? `[${s.topic}] ${s.text}` : s.text,
				variant: 'dot'
			});
		}
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

	function selectPoint(id: string) {
		// Centroids are synthetic — no source text to inspect.
		if (id.startsWith('centroid_')) return;
		selectedId = id;
	}

	const clusterPreview = $derived.by<{ cluster: number; hue: number; count: number; texts: string[] }[]>(() => {
		const groups: { cluster: number; hue: number; count: number; texts: string[] }[] = [];
		for (let c = 0; c < lab.k; c++) {
			const texts: string[] = [];
			let count = 0;
			for (let i = 0; i < clustering.idx.length; i++) {
				if (clustering.assignments[i] === c) {
					count++;
					if (texts.length < 3) texts.push(clustering.idx[i].s.text);
				}
			}
			groups.push({ cluster: c, hue: clusterHue(c), count, texts });
		}
		return groups;
	});

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

	const guide = [
		{
			title: 'Structure without labels',
			body: 'Nobody told the model there are four topics here. K-means only sees geometry — sentences about the same thing simply land near each other, so K=4 recovers travel, cooking, programming and finance.',
			apply: () => pickDataset('mixed-topics'),
			applyLabel: 'Load mixed topics'
		},
		{
			title: 'Check the answer key',
			body: 'Toggle "color by ground truth" to swap cluster colors for the true topics. Dots that change color are the ones k-means got wrong. The Rand index summarizes that agreement as one number.',
			apply: () => (lab.showGroundTruth = !lab.showGroundTruth),
			applyLabel: 'Toggle ground truth'
		},
		{
			title: 'Wrong K, wrong story',
			body: 'Set K=2 on four topics and watch it merge things arbitrarily; set K=8 and it splinters real clusters. Silhouette drops both ways — that is how you pick K in practice.',
			apply: () => (lab.k = 2),
			applyLabel: 'Try K = 2'
		},
		{
			title: 'A harder case: emotions',
			body: 'Joy / sadness / anger are subtler than topics — sentences share vocabulary across classes. Watch silhouette drop compared to the topic dataset. Embedding spaces organize by topic first, tone second.',
			apply: () => pickDataset('emotions'),
			applyLabel: 'Load emotions'
		}
	];
</script>

<LabShell
	labId="cluster"
	dockTitle="Sentences"
	resultsTitle="Clusters"
	resultsIcon={IconQuality}
	selected={selectedResult}
	selectedLabel={selectedId ? 'sentence' : null}
	scopeHint="Click any sentence dot to inspect its embedding."
	{guide}
>
	{#snippet cloud()}
		<SemanticCloud {points} selectedId={selectedId} onPointClick={selectPoint} />
	{/snippet}

	{#snippet dockHeader()}
		<label class="icon-btn" title="Upload a CSV with a text column (+ optional topic)">
			<input class="file-input" type="file" accept=".csv,.tsv,.txt" onchange={onUpload} />
			<IconUpload size={14} />
		</label>
	{/snippet}

	{#snippet dock()}
		<div class="chips">
			{#each CLUSTER_DATASETS as d (d.id)}
				<button class="chip-btn" class:on={lab.datasetId === d.id} onclick={() => pickDataset(d.id)} title={d.description}>
					{d.name}
				</button>
			{/each}
		</div>
		{#if lab.uploadError}
			<p class="err">{lab.uploadError}</p>
		{/if}

		<div class="hairline"></div>

		<div class="fld-label">
			<span>K-means
				<InfoPop title="K-means on the hypersphere">
					<p>K-means++ initialization, cosine distance, centroids re-normalized each iteration (embeddings live on a unit sphere).</p>
					<p>Seeded, so the same data always gives the same clusters.</p>
				</InfoPop>
			</span>
			<span class="count tabular">K = {lab.k}</span>
		</div>
		<input class="k-slider" type="range" min="2" max="8" step="1" bind:value={lab.k} />
		{#if groundTruthAvailable}
			<label class="toggle no-select">
				<input type="checkbox" bind:checked={lab.showGroundTruth} />
				<span>color by ground truth</span>
			</label>
		{/if}

		<div class="hairline"></div>

		<DockSection
			label="Edit sentences"
			count={batch.loading ? `${batch.done}/${batch.total}` : `${lab.sentences.length}`}
		>
			{#snippet extra()}
				<button class="icon-btn" onclick={addSentence} aria-label="Add a sentence"><IconAdd size={14} /></button>
			{/snippet}
			<ul class="sent-list">
				{#each lab.sentences as s (s.id)}
					<li class="item-row">
						<textarea
							class="fld row"
							rows="1"
							spellcheck="false"
							value={s.text}
							oninput={(e) => setSentenceText(s.id, (e.target as HTMLTextAreaElement).value)}
							placeholder="a sentence to cluster…"
						></textarea>
						<button class="icon-btn danger" onclick={() => removeSentence(s.id)} aria-label="Remove">
							<IconRemove size={13} />
						</button>
					</li>
				{/each}
			</ul>
		</DockSection>
	{/snippet}

	{#snippet results()}
		<div class="quality">
			<div class="q-block">
				<div class="q-label no-select">silhouette
					<InfoPop title="Silhouette score">
						<p>How tight and well-separated the clusters are: near <b>1</b> = compact and distinct, near <b>0</b> = overlapping, negative = points sit closer to another cluster than their own.</p>
					</InfoPop>
				</div>
				<div class="q-val tabular">{clustering.silh.toFixed(3)}</div>
			</div>
			{#if groundAgreement != null}
				<div class="q-block">
					<div class="q-label no-select">vs. topics
						<InfoPop title="Rand index">
							<p>For every pair of sentences: do the clustering and the ground-truth topics agree on "same group / different group"?</p>
							<p>The fraction of agreeing pairs — 1.0 means k-means recovered the topics exactly.</p>
						</InfoPop>
					</div>
					<div class="q-val tabular">{(groundAgreement * 100).toFixed(1)}%</div>
				</div>
			{/if}
		</div>

		<div class="hairline"></div>

		{#if clustering.centroids.length === 0}
			<p class="empty-note">
				{#if batch.loading}Embedding sentences…{:else}Need at least 2 sentences and K ≥ 2.{/if}
			</p>
		{:else}
			<div class="groups">
				{#each clusterPreview as g (g.cluster)}
					<div class="group" style:--c={theme.hueCss(g.hue)}>
						<div class="g-head no-select">
							<span class="hue-badge">C{g.cluster + 1}</span>
							<span class="g-count tabular">{g.count} sentences</span>
						</div>
						<ul>
							{#each g.texts as t, i (i)}
								<li>{t}</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		{/if}
	{/snippet}
</LabShell>

<style>
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.count {
		font-size: 10px;
		color: var(--text-subtle);
		text-transform: none;
		letter-spacing: 0;
		margin-left: auto;
	}
	.err {
		font-size: 11px;
		color: var(--bad);
		margin: 0;
	}
	.file-input {
		display: none;
	}
	.k-slider {
		width: 100%;
		accent-color: var(--lab);
	}
	.toggle {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 12px;
		color: var(--text-secondary);
		cursor: pointer;
	}
	.toggle input {
		accent-color: var(--lab);
	}
	ul.sent-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.quality {
		display: flex;
		gap: 10px;
	}
	.q-block {
		flex: 1;
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 9px 12px;
		background: oklch(1 0 0 / 0.025);
	}
	.q-label {
		font-size: 10px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-subtle);
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.q-val {
		font-size: 21px;
		font-weight: 650;
		color: var(--lab);
		margin-top: 2px;
	}
	.groups {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.group {
		border-left: 2px solid var(--c);
		padding-left: 10px;
	}
	.g-head {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-bottom: 3px;
	}
	.g-count {
		font-size: 10px;
		color: var(--text-subtle);
	}
	.group ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.group li {
		font-size: 11px;
		line-height: 1.45;
		color: var(--text-muted);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
