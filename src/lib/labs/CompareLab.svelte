<script lang="ts">
	/**
	 * Compare Lab — "What does cosine similarity mean?"
	 *
	 * Two text inputs A and B with the headline pair metrics. The cloud also
	 * needs reference points so distances are interpretable — without them, A
	 * and B always land at the projection's extremes and the visual carries
	 * no information. So users can add N additional reference texts (C, D,
	 * E…) that show up as smaller cloud points + a pairwise cosine list.
	 */

	import { playground } from '$lib/stores/playground.svelte.js';
	import SemanticCloud, { type CloudPoint, type CloudLink } from '$lib/viz/SemanticCloud.svelte';
	import { cosine, dot, euclidean, norm } from '$lib/math/similarity.js';
	import type { EmbeddingResult } from '$lib/models/types.js';
	import { CATEGORY_HUES } from '$lib/corpus/seed.js';
	import { createLabState } from './labState.svelte.js';

	type Extra = { id: string; text: string };

	const lab = createLabState('compare', {
		textA: 'A cat curled on a sunny windowsill.',
		textB: 'A kitten napping in a patch of sunlight.',
		extras: [
			{ id: 'c1', text: 'Debugging a race condition between two async workers.' },
			{ id: 'c2', text: 'The Atacama desert at dawn, stars still visible above the salt flats.' }
		] as Extra[],
		showCorpus: false
	});

	let resultA = $state<EmbeddingResult | null>(null);
	let resultB = $state<EmbeddingResult | null>(null);
	let extraResults = $state(new Map<string, EmbeddingResult>());
	let loadingA = $state(false);
	let loadingB = $state(false);
	let loadingExtras = $state(false);

	// Hues for extras: cycle through perceptually distinct OKLCH hues.
	const EXTRA_HUES = [130, 280, 60, 320, 170, 350];
	function extraLabel(idx: number): string {
		return String.fromCharCode(67 + idx); // C, D, E, F, ...
	}

	const presets = [
		{
			a: 'A cat curled on a sunny windowsill.',
			b: 'A kitten napping in a patch of sunlight.',
			extras: ['Debugging a race condition.', 'The Atacama desert at dawn.'],
			label: 'synonyms'
		},
		{
			a: 'I love this movie.',
			b: 'I hate this movie.',
			extras: ['I love this album.', 'This restaurant is amazing.'],
			label: 'antonyms'
		},
		{
			a: 'The bank by the river.',
			b: 'The bank that gave me a loan.',
			extras: ['A trout swimming upstream.', 'Filling out a mortgage application.'],
			label: 'homonym'
		},
		{
			a: 'Time flies like an arrow.',
			b: 'Fruit flies like a banana.',
			extras: ['An hour passes quickly.', 'Bananas attract small insects.'],
			label: 'structure'
		}
	];

	let seqA = 0;
	let seqB = 0;
	let seqExtras = 0;

	async function embedA() {
		const t = lab.textA.trim();
		if (!t) {
			resultA = null;
			return;
		}
		const s = ++seqA;
		loadingA = true;
		try {
			const r = await playground.embedText(t);
			if (s === seqA) resultA = r;
		} catch {
			if (s === seqA) resultA = null;
		} finally {
			if (s === seqA) loadingA = false;
		}
	}
	async function embedB() {
		const t = lab.textB.trim();
		if (!t) {
			resultB = null;
			return;
		}
		const s = ++seqB;
		loadingB = true;
		try {
			const r = await playground.embedText(t);
			if (s === seqB) resultB = r;
		} catch {
			if (s === seqB) resultB = null;
		} finally {
			if (s === seqB) loadingB = false;
		}
	}
	async function embedExtras() {
		const s = ++seqExtras;
		loadingExtras = true;
		try {
			const map = new Map<string, EmbeddingResult>();
			for (const ex of lab.extras) {
				if (!ex.text.trim()) continue;
				const r = await playground.embedText(ex.text);
				if (s !== seqExtras) return;
				map.set(ex.id, r);
			}
			if (s === seqExtras) extraResults = map;
		} finally {
			if (s === seqExtras) loadingExtras = false;
		}
	}

	let timerA: ReturnType<typeof setTimeout> | null = null;
	let timerB: ReturnType<typeof setTimeout> | null = null;
	let timerEx: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		void lab.textA;
		void playground.modelId;
		if (timerA) clearTimeout(timerA);
		timerA = setTimeout(() => void embedA(), 300);
	});
	$effect(() => {
		void lab.textB;
		void playground.modelId;
		if (timerB) clearTimeout(timerB);
		timerB = setTimeout(() => void embedB(), 300);
	});
	$effect(() => {
		void lab.extras.map((e) => e.id + e.text).join('|');
		void playground.modelId;
		if (timerEx) clearTimeout(timerEx);
		timerEx = setTimeout(() => void embedExtras(), 350);
	});

	const metrics = $derived.by(() => {
		if (!resultA || !resultB) return null;
		if (resultA.vector.length !== resultB.vector.length) return null;
		const va = resultA.vector;
		const vb = resultB.vector;
		return {
			cos: cosine(va, vb),
			dotV: dot(va, vb),
			eucl: euclidean(va, vb),
			normA: norm(va),
			normB: norm(vb)
		};
	});

	// All labeled-and-embedded items: A, B, and the extras. Used for the
	// pairwise distance list and the cloud.
	type Labeled = { id: 'A' | 'B' | string; label: string; hue: number; vector: Float32Array; text: string };
	const labeled = $derived.by<Labeled[]>(() => {
		const out: Labeled[] = [];
		if (resultA) out.push({ id: 'A', label: 'A', hue: 200, vector: resultA.vector, text: lab.textA });
		if (resultB) out.push({ id: 'B', label: 'B', hue: 30, vector: resultB.vector, text: lab.textB });
		lab.extras.forEach((ex, i) => {
			const r = extraResults.get(ex.id);
			if (!r) return;
			out.push({
				id: ex.id,
				label: extraLabel(i),
				hue: EXTRA_HUES[i % EXTRA_HUES.length],
				vector: r.vector,
				text: ex.text
			});
		});
		return out;
	});

	// Pairwise cosines among A, B, and extras.
	type Pair = { aLabel: string; bLabel: string; aHue: number; bHue: number; cos: number };
	const pairs = $derived.by<Pair[]>(() => {
		const items = labeled;
		const out: Pair[] = [];
		for (let i = 0; i < items.length; i++) {
			for (let j = i + 1; j < items.length; j++) {
				if (items[i].vector.length !== items[j].vector.length) continue;
				out.push({
					aLabel: items[i].label,
					bLabel: items[j].label,
					aHue: items[i].hue,
					bHue: items[j].hue,
					cos: cosine(items[i].vector, items[j].vector)
				});
			}
		}
		// Sort by cosine descending so the closest pairs surface first.
		out.sort((x, y) => y.cos - x.cos);
		return out;
	});

	const points = $derived.by<CloudPoint[]>(() => {
		const out: CloudPoint[] = [];
		for (const item of labeled) {
			const isAB = item.id === 'A' || item.id === 'B';
			out.push({
				id: item.id,
				vector: item.vector,
				hue: item.hue,
				label: item.label,
				hoverText: item.text,
				size: isAB ? 1.1 : 0.8
			});
		}
		if (lab.showCorpus && playground.corpus) {
			const dim = resultA?.vector.length ?? resultB?.vector.length;
			if (!dim || playground.corpus.items[0]?.vector.length === dim) {
				for (const c of playground.corpus.items) {
					out.push({
						id: c.item.id,
						vector: c.vector,
						hue: CATEGORY_HUES[c.item.category],
						hoverText: c.item.text,
						variant: 'dot'
					});
				}
			}
		}
		return out;
	});

	const links = $derived.by<CloudLink[]>(() =>
		resultA && resultB ? [{ from: 'A', to: 'B', style: 'dashed', opacity: 0.65 }] : []
	);

	function applyPreset(p: (typeof presets)[number]) {
		lab.textA = p.a;
		lab.textB = p.b;
		lab.extras = p.extras.map((t, i) => ({ id: `c${Date.now() + i}`, text: t }));
	}

	function setExtra(id: string, text: string) {
		lab.extras = lab.extras.map((e) => (e.id === id ? { ...e, text } : e));
	}
	function removeExtra(id: string) {
		lab.extras = lab.extras.filter((e) => e.id !== id);
	}
	function addExtra() {
		lab.extras = [...lab.extras, { id: `c${Date.now()}`, text: '' }];
	}
</script>

<main class="lab">
	<aside class="left">
		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Text A</span>
				{#if loadingA}<span class="status loading">…</span>{/if}
			</div>
			<textarea bind:value={lab.textA} rows="3" spellcheck="false" placeholder="…"></textarea>
		</div>
		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Text B</span>
				{#if loadingB}<span class="status loading">…</span>{/if}
			</div>
			<textarea bind:value={lab.textB} rows="3" spellcheck="false" placeholder="…"></textarea>
		</div>
		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Reference texts</span>
				<button class="add" onclick={addExtra} title="Add another reference text">＋</button>
			</div>
			<p class="hint no-select">
				Two points alone tell you nothing about scale. Add a few more so you can <i>see</i> what "close"
				means here.
			</p>
			<div class="extras">
				{#each lab.extras as ex, i (ex.id)}
					<div class="extra" style:--c={`oklch(0.78 0.18 ${EXTRA_HUES[i % EXTRA_HUES.length]})`}>
						<span class="extra-label">{extraLabel(i)}</span>
						<input
							value={ex.text}
							oninput={(e) => setExtra(ex.id, (e.target as HTMLInputElement).value)}
							placeholder="another sentence to compare against…"
						/>
						<button class="x" onclick={() => removeExtra(ex.id)} title="Remove">×</button>
					</div>
				{/each}
			</div>
		</div>
		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Presets</span>
			</div>
			<div class="presets">
				{#each presets as p, i (i)}
					<button class="preset" onclick={() => applyPreset(p)} title={p.a + ' / ' + p.b}>
						<span class="preset-label">{p.label}</span>
					</button>
				{/each}
			</div>
			<label class="corpus-toggle no-select">
				<input type="checkbox" bind:checked={lab.showCorpus} />
				<span>Show corpus context</span>
			</label>
		</div>
	</aside>

	<section class="center">
		<SemanticCloud {points} {links} mode="pca" />
	</section>

	<aside class="right">
		<div class="card glass">
			<div class="head">
				<span class="eyebrow">A · B metrics</span>
				<span class="meta tabular">{playground.model.shortName}</span>
			</div>
			{#if !metrics}
				<p class="empty">Embed both A and B to compare.</p>
			{:else}
				<dl class="metrics">
					<div class="row hero">
						<dt>cosine</dt>
						<dd class="tabular">{metrics.cos.toFixed(4)}</dd>
						<div class="meter">
							<div
								class="fill"
								style:width={`${Math.abs(metrics.cos) * 100}%`}
								class:neg={metrics.cos < 0}
							></div>
						</div>
					</div>
					<div class="row">
						<dt>dot product</dt>
						<dd class="tabular">{metrics.dotV.toFixed(4)}</dd>
					</div>
					<div class="row">
						<dt>euclidean</dt>
						<dd class="tabular">{metrics.eucl.toFixed(4)}</dd>
					</div>
				</dl>
			{/if}
		</div>

		<div class="card glass">
			<div class="head">
				<span class="eyebrow">All pairs</span>
				<span class="meta">cosine · sorted by closeness</span>
			</div>
			{#if pairs.length === 0}
				<p class="empty">Need at least two embedded texts.</p>
			{:else}
				<ul class="pairs">
					{#each pairs as p, i (`${p.aLabel}-${p.bLabel}-${i}`)}
						<li>
							<span class="pair-badge" style:--c={`oklch(0.78 0.18 ${p.aHue})`}>{p.aLabel}</span>
							<span class="pair-sep">·</span>
							<span class="pair-badge" style:--c={`oklch(0.78 0.18 ${p.bHue})`}>{p.bLabel}</span>
							<div class="pair-bar">
								<div
									class="pair-fill"
									style:width={`${Math.max(0, Math.min(100, p.cos * 100))}%`}
									class:hot={p.cos > 0.6}
								></div>
							</div>
							<span class="pair-cos tabular" class:hot={p.cos > 0.6}>{p.cos.toFixed(3)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</aside>
</main>

<style>
	.lab {
		display: grid;
		grid-template-columns: 360px 1fr 360px;
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
		overflow-y: auto;
	}
	.center {
		min-height: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
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
	.hint {
		font-size: 10px;
		color: var(--text-muted);
		line-height: 1.45;
		margin: 0;
		font-style: italic;
	}
	.hint i {
		color: var(--accent);
		font-style: italic;
	}
	textarea,
	input {
		width: 100%;
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 5px;
		color: var(--text-primary);
		font-family: 'Inter', sans-serif;
		font-size: 13px;
		line-height: 1.45;
		padding: 6px 8px;
		box-sizing: border-box;
		min-width: 0;
	}
	textarea {
		resize: vertical;
		min-height: 50px;
	}
	.extras {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.extra {
		display: grid;
		grid-template-columns: 22px 1fr auto;
		gap: 4px;
		align-items: center;
	}
	.extra-label {
		font-size: 11px;
		font-weight: 700;
		color: var(--c);
		text-align: center;
		padding: 1px 0;
		border-radius: 3px;
		background: color-mix(in oklab, var(--c) 18%, transparent);
	}
	.x {
		background: transparent;
		border: 0;
		color: var(--text-subtle);
		font-size: 14px;
		cursor: pointer;
		padding: 0 4px;
	}
	.x:hover {
		color: var(--bad);
	}
	.presets {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.preset {
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 4px 10px;
		cursor: pointer;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.preset:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.preset-label {
		display: block;
	}
	.corpus-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: var(--text-secondary);
		margin-top: 4px;
		cursor: pointer;
	}
	.corpus-toggle input {
		width: auto;
	}
	.empty {
		font-size: 12px;
		color: var(--text-subtle);
		font-style: italic;
		margin: 0;
	}
	dl.metrics {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 8px;
		align-items: baseline;
		font-size: 12px;
	}
	.row.hero {
		font-size: 14px;
	}
	.row.hero dt {
		color: var(--text-primary);
		font-weight: 600;
	}
	.row.hero dd {
		color: var(--accent);
		font-weight: 700;
	}
	dt {
		color: var(--text-muted);
	}
	dd {
		margin: 0;
		color: var(--text-primary);
	}
	.meter {
		grid-column: 1 / -1;
		height: 4px;
		background: var(--surface-2);
		border-radius: 2px;
		overflow: hidden;
		margin-top: 2px;
	}
	.fill {
		height: 100%;
		background: var(--accent);
		transition: width 0.25s ease;
	}
	.fill.neg {
		background: var(--contrast);
	}
	ul.pairs {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	ul.pairs li {
		display: grid;
		grid-template-columns: 20px 8px 20px 1fr 46px;
		gap: 4px;
		align-items: center;
		font-size: 11px;
	}
	.pair-badge {
		text-align: center;
		font-size: 10px;
		font-weight: 700;
		padding: 1px 0;
		border-radius: 3px;
		background: color-mix(in oklab, var(--c) 18%, transparent);
		color: var(--c);
	}
	.pair-sep {
		color: var(--text-subtle);
		text-align: center;
	}
	.pair-bar {
		height: 4px;
		background: var(--surface-2);
		border-radius: 2px;
		overflow: hidden;
	}
	.pair-fill {
		height: 100%;
		background: var(--accent-muted);
		transition: width 0.25s ease;
	}
	.pair-fill.hot {
		background: var(--accent);
	}
	.pair-cos {
		text-align: right;
		color: var(--text-muted);
	}
	.pair-cos.hot {
		color: var(--accent);
		font-weight: 600;
	}
</style>
