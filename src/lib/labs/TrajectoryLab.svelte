<script lang="ts">
	/**
	 * Trajectory Lab — "How does meaning build up?"
	 *
	 * Type a sentence. For each prefix length k = 1..N, embed the prefix
	 * "word_1 word_2 ... word_k". Project all N vectors into one PCA basis.
	 * The polyline connecting them is the sentence's path through latent
	 * space. Per-step cosine distance shows where the meaning lurched.
	 */

	import { playground } from '$lib/stores/playground.svelte.js';
	import SemanticCloud, { type CloudPoint } from '$lib/viz/SemanticCloud.svelte';
	import InspectorRow from '$lib/components/InspectorRow.svelte';
	import type { EmbeddingResult } from '$lib/models/types.js';
	import { cosine } from '$lib/math/similarity.js';
	import { createLabState } from './labState.svelte.js';

	const lab = createLabState('trajectory', {
		sentence: 'The food was great until I got food poisoning.'
	});

	const presets = [
		{
			label: 'smooth',
			sentence: 'A red-tailed hawk circling thermal updrafts above the canyon.',
			note: 'Tightly themed sentence — each word adds detail to the same scene.'
		},
		{
			label: 'twist',
			sentence: 'The food was great until I got food poisoning.',
			note: 'Watch for the lurch when sentiment flips.'
		},
		{
			label: 'reveal',
			sentence: 'She opened the door and saw the body.',
			note: 'Innocuous start, dramatic ending.'
		},
		{
			label: 'homonym A',
			sentence: 'He walked to the bank to fish for trout.',
			note: 'Disambiguation toward riverbank meaning.'
		},
		{
			label: 'homonym B',
			sentence: 'He walked to the bank to deposit a check.',
			note: 'Same opening, financial meaning instead.'
		},
		{
			label: 'negation',
			sentence: 'I really love this movie not at all.',
			note: '"not" should drag the trajectory across the sentiment axis.'
		}
	];

	type Prefix = {
		k: number;
		word: string;
		text: string;
		vector: Float32Array | null;
		result: EmbeddingResult | null;
	};
	let prefixes = $state<Prefix[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	// Click-to-inspect selection, defaults to the lurch word (set further down).
	let userSelectedK = $state<number | null>(null);

	function tokenize(sentence: string): string[] {
		// Word boundaries with attached trailing punctuation.
		const m = sentence.match(/\S+/g);
		return m ?? [];
	}

	let runSeq = 0;
	async function rebuild() {
		const words = tokenize(lab.sentence);
		// Reset prefixes shell — empty vectors until each finishes.
		prefixes = words.map((w, i) => ({
			k: i + 1,
			word: w.replace(/[.,;:!?]+$/, ''),
			text: words.slice(0, i + 1).join(' '),
			vector: null,
			result: null
		}));
		userSelectedK = null;
		if (prefixes.length === 0) return;

		const seq = ++runSeq;
		loading = true;
		error = null;
		try {
			// Embed sequentially. The embedder queue serializes anyway; this just
			// lets us update UI progressively.
			for (let i = 0; i < prefixes.length; i++) {
				if (seq !== runSeq) return;
				const r = await playground.embedText(prefixes[i].text);
				if (seq !== runSeq) return;
				// Re-fetch by index in case the array identity changed (it shouldn't here).
				prefixes[i] = { ...prefixes[i], vector: r.vector, result: r };
				// Trigger reactivity by reassigning.
				prefixes = [...prefixes];
			}
		} catch (e) {
			if (seq === runSeq) error = e instanceof Error ? e.message : String(e);
		} finally {
			if (seq === runSeq) loading = false;
		}
	}

	// Debounced rebuild whenever sentence or model changes.
	let timer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		void lab.sentence;
		void playground.modelId;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => void rebuild(), 350);
	});

	// Find the largest per-step jump so we can call it out visually (the "lurch").
	const biggestJumpK = $derived.by<number | null>(() => {
		let bestK = -1;
		let bestDist = 0;
		for (let i = 1; i < prefixes.length; i++) {
			const a = prefixes[i - 1].vector;
			const b = prefixes[i].vector;
			if (!a || !b || a.length !== b.length) continue;
			const dist = 1 - cosine(a, b);
			if (dist > bestDist) {
				bestDist = dist;
				bestK = prefixes[i].k;
			}
		}
		return bestK > 0 ? bestK : null;
	});

	const points = $derived.by<CloudPoint[]>(() => {
		const out: CloudPoint[] = [];
		const N = prefixes.length;
		for (const p of prefixes) {
			if (!p.vector) continue;
			// hue gradient cool → warm along the sentence
			const tFrac = (p.k - 1) / Math.max(1, N - 1);
			const hue = 220 - 220 * tFrac;
			const isEdge = p.k === 1 || p.k === N;
			const isLurch = p.k === biggestJumpK;
			out.push({
				id: `p${p.k}`,
				vector: p.vector,
				hue,
				// Every node gets a label — the whole point of this lab is to
				// read the path word-by-word. Endpoints and the biggest-jump
				// word get a slightly bigger sphere to draw the eye.
				label: p.word,
				hoverText: `[${p.k}] ${p.text}`,
				size: isEdge || isLurch ? 1.05 : 0.8
			});
		}
		return out;
	});

	const pathIds = $derived(prefixes.filter((p) => p.vector).map((p) => `p${p.k}`));
	// Selection: user click wins, otherwise the auto-detected lurch word.
	const selectedK = $derived(userSelectedK ?? biggestJumpK);
	const selectedId = $derived(selectedK != null ? `p${selectedK}` : null);
	const selectedResult = $derived.by<EmbeddingResult | null>(() => {
		if (selectedK == null) return null;
		return prefixes.find((p) => p.k === selectedK)?.result ?? null;
	});

	function selectPoint(id: string) {
		const m = /^p(\d+)$/.exec(id);
		if (m) userSelectedK = Number(m[1]);
	}

	// Per-step displacement: cosine distance from previous prefix.
	const displacements = $derived.by(() => {
		const out: { k: number; word: string; dist: number }[] = [];
		for (let i = 1; i < prefixes.length; i++) {
			const a = prefixes[i - 1].vector;
			const b = prefixes[i].vector;
			if (!a || !b || a.length !== b.length) continue;
			out.push({ k: prefixes[i].k, word: prefixes[i].word, dist: 1 - cosine(a, b) });
		}
		return out;
	});

	const maxDist = $derived(
		displacements.length > 0 ? Math.max(...displacements.map((d) => d.dist), 0.001) : 1
	);
	const totalPath = $derived(displacements.reduce((s, d) => s + d.dist, 0));

	function applyPreset(p: (typeof presets)[number]) {
		lab.sentence = p.sentence;
	}
</script>

<main class="lab">
	<section class="top">
		<div class="cloud-fill">
			<SemanticCloud
				{points}
				{selectedId}
				pathPoints={pathIds}
				mode="pca"
				onPointClick={selectPoint}
			/>
		</div>
	<aside class="left">
		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Sentence</span>
				{#if loading}
					<span class="status loading tabular"
						>{prefixes.filter((p) => p.vector).length}/{prefixes.length}</span
					>
				{:else if error}
					<span class="status err" title={error}>error</span>
				{:else if prefixes.length > 0}
					<span class="status tabular">{prefixes.length} steps · Σ {totalPath.toFixed(3)}</span>
				{/if}
			</div>
			<textarea
				bind:value={lab.sentence}
				rows="3"
				spellcheck="false"
				placeholder="Type a sentence — watch its meaning build up word by word."
			></textarea>
			<p class="note no-select">
				Each prefix <code>word_1 … word_k</code> is embedded independently. The cloud connects them
				in order — that's the sentence's <b>path</b> through embedding space.
			</p>
		</div>

		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Curated sentences</span>
			</div>
			<div class="presets">
				{#each presets as p, i (i)}
					<button class="preset" onclick={() => applyPreset(p)} title={p.note}>
						<span class="preset-label">{p.label}</span>
						<span class="preset-snippet">{p.sentence}</span>
					</button>
				{/each}
			</div>
		</div>
	</aside>

	<aside class="right">
		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Per-word displacement</span>
				<span class="meta">cosine distance from previous prefix</span>
			</div>
			{#if displacements.length === 0}
				<p class="empty">
					{#if loading}Computing…{:else}Type a sentence with at least two words.{/if}
				</p>
			{:else}
				<ol class="disps">
					{#each displacements as d (d.k)}
						<li>
							<span class="step tabular">+{d.k}</span>
							<span class="word">{d.word}</span>
							<div class="bar">
								<div
									class="fill"
									style:width={`${(d.dist / maxDist) * 100}%`}
									class:big={d.dist > 0.2}
								></div>
							</div>
							<span class="dist tabular" class:big={d.dist > 0.2}>{d.dist.toFixed(3)}</span>
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	</aside>
	</section>

	<section class="bottom">
		<InspectorRow
			result={selectedResult}
			modelShortName={playground.model.shortName}
			title={selectedK != null ? `Prefix #${selectedK}` : 'Selected'}
			emptyText="Click any word along the path to inspect that prefix's embedding."
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
		overflow-y: auto;
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
	.status.err {
		color: var(--bad);
	}
	textarea {
		width: 100%;
		resize: vertical;
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 5px;
		color: var(--text-primary);
		font-family: 'Inter', sans-serif;
		font-size: 13px;
		line-height: 1.45;
		padding: 6px 8px;
		min-height: 50px;
		box-sizing: border-box;
	}
	.note {
		font-size: 11px;
		color: var(--text-muted);
		line-height: 1.5;
		margin: 4px 0 0;
	}
	.note code {
		background: var(--surface-2);
		padding: 1px 4px;
		border-radius: 3px;
		font-size: 10px;
	}
	.note b {
		color: var(--text-primary);
	}
	.presets {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
	}
	.preset {
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 6px 8px;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 2px;
		text-align: left;
	}
	.preset:hover {
		border-color: var(--accent);
	}
	.preset-label {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}
	.preset:hover .preset-label {
		color: var(--accent);
	}
	.preset-snippet {
		font-size: 10px;
		color: var(--text-secondary);
		line-height: 1.3;
	}
	.empty {
		font-size: 12px;
		color: var(--text-subtle);
		font-style: italic;
		margin: 0;
	}
	ol.disps {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		overflow-y: auto;
	}
	ol.disps li {
		display: grid;
		grid-template-columns: 28px 1fr 90px 50px;
		gap: 8px;
		align-items: center;
		font-size: 11px;
	}
	.step {
		font-size: 9px;
		color: var(--text-subtle);
	}
	.word {
		color: var(--text-primary);
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bar {
		height: 4px;
		background: var(--surface-2);
		border-radius: 2px;
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: var(--accent-muted);
		transition: width 0.25s ease;
	}
	.fill.big {
		background: var(--contrast);
	}
	.dist {
		text-align: right;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.dist.big {
		color: var(--contrast);
		font-weight: 600;
	}
</style>
