<script lang="ts">
	/**
	 * Plane Lab — "What does a single direction in embedding space mean?"
	 *
	 * Pick two anchor texts. Project every sample point onto the axis between
	 * them. Long-axis position is the score along that direction.
	 *
	 * This is how learned directions (sentiment, formality, gender bias) get
	 * surfaced as 1D scalars. Presets show off interesting axes.
	 */

	import { playground } from '$lib/stores/playground.svelte.js';
	import SemanticCloud, { type CloudPoint } from '$lib/viz/SemanticCloud.svelte';
	import type { EmbeddingResult } from '$lib/models/types.js';
	import { dot, norm } from '$lib/math/similarity.js';
	import { createLabState } from './labState.svelte.js';

	type Item = { id: string; text: string };

	const presets = [
		{
			label: 'sentiment',
			anchorA: 'wonderful, amazing, delightful',
			anchorB: 'awful, terrible, miserable',
			items: [
				'The food was great.',
				'The food was decent.',
				'The food was disappointing.',
				'The movie made me cry happy tears.',
				'The movie was a complete waste of time.',
				'A peaceful walk on a sunny morning.',
				'A dreary commute through rain and traffic.'
			]
		},
		{
			label: 'formality',
			anchorA: 'a formal academic treatise on the philosophy of mind',
			anchorB: 'lol ok whatever dude that movie was kinda sick',
			items: [
				'We hereby invite you to attend our annual symposium.',
				'Yo, you wanna grab dinner later?',
				'Per our previous discussion, the proposal is approved.',
				'omg this is the best thing ever',
				'Kindly find attached the report.',
				"It's been ages, mate, we should catch up."
			]
		},
		{
			label: 'concreteness',
			anchorA: 'a rusty red bicycle leaning against a brick wall',
			anchorB: 'the abstract concept of duty in deontological ethics',
			items: [
				'A wooden chair with one wobbly leg.',
				'The principle of charity in argument.',
				'A bowl of steaming ramen.',
				'Bayesian inference under uncertainty.',
				'The fragrance of cut grass.',
				'Marginal utility in microeconomics.'
			]
		}
	];

	const lab = createLabState('plane', {
		anchorA: presets[0].anchorA,
		anchorB: presets[0].anchorB,
		items: presets[0].items.map((t, i) => ({ id: `i${i}`, text: t })) as Item[]
	});

	let anchorAResult = $state<EmbeddingResult | null>(null);
	let anchorBResult = $state<EmbeddingResult | null>(null);
	let itemResults = $state(new Map<string, EmbeddingResult>());
	let loading = $state(false);

	let runSeq = 0;
	async function embedAll() {
		const seq = ++runSeq;
		loading = true;
		try {
			const aR = lab.anchorA.trim() ? await playground.embedText(lab.anchorA) : null;
			const bR = lab.anchorB.trim() ? await playground.embedText(lab.anchorB) : null;
			if (seq !== runSeq) return;
			anchorAResult = aR;
			anchorBResult = bR;
			const m = new Map<string, EmbeddingResult>();
			for (const it of lab.items) {
				if (!it.text.trim()) continue;
				const r = await playground.embedText(it.text);
				if (seq !== runSeq) return;
				m.set(it.id, r);
			}
			itemResults = m;
		} finally {
			if (seq === runSeq) loading = false;
		}
	}

	let timer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		void lab.anchorA;
		void lab.anchorB;
		void lab.items.map((i) => i.id + i.text).join('|');
		void playground.modelId;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => void embedAll(), 350);
	});

	// Compute each item's projection onto the A→B axis.
	const scores = $derived.by<{ id: string; text: string; score: number }[]>(() => {
		if (!anchorAResult || !anchorBResult) return [];
		const a = anchorAResult.vector;
		const b = anchorBResult.vector;
		if (a.length !== b.length) return [];
		const D = a.length;
		const u = new Float32Array(D);
		const center = new Float32Array(D);
		let un = 0;
		for (let i = 0; i < D; i++) {
			center[i] = (a[i] + b[i]) * 0.5;
			u[i] = b[i] - a[i];
			un += u[i] * u[i];
		}
		un = Math.sqrt(un);
		if (un === 0) return [];
		for (let i = 0; i < D; i++) u[i] /= un;
		const out: { id: string; text: string; score: number }[] = [];
		for (const it of lab.items) {
			const r = itemResults.get(it.id);
			if (!r || r.vector.length !== D) continue;
			// Project onto axis: (v - center) · u
			let s = 0;
			for (let i = 0; i < D; i++) s += (r.vector[i] - center[i]) * u[i];
			out.push({ id: it.id, text: it.text, score: s });
		}
		out.sort((a, b) => a.score - b.score);
		return out;
	});

	const points = $derived.by<CloudPoint[]>(() => {
		const out: CloudPoint[] = [];
		if (anchorAResult)
			out.push({
				id: 'anchorA',
				vector: anchorAResult.vector,
				hue: 200,
				label: 'A',
				hoverText: `anchor A: ${lab.anchorA}`,
				size: 1.1
			});
		if (anchorBResult)
			out.push({
				id: 'anchorB',
				vector: anchorBResult.vector,
				hue: 30,
				label: 'B',
				hoverText: `anchor B: ${lab.anchorB}`,
				size: 1.1
			});
		for (const it of lab.items) {
			const r = itemResults.get(it.id);
			if (!r) continue;
			out.push({
				id: it.id,
				vector: r.vector,
				hue: 270,
				hoverText: it.text,
				size: 0.8
			});
		}
		return out;
	});

	function setItemText(id: string, text: string) {
		lab.items = lab.items.map((it) => (it.id === id ? { ...it, text } : it));
	}
	function removeItem(id: string) {
		lab.items = lab.items.filter((it) => it.id !== id);
	}
	function addItem() {
		lab.items = [...lab.items, { id: `i${Date.now()}`, text: '' }];
	}
	function applyPreset(p: (typeof presets)[number]) {
		lab.anchorA = p.anchorA;
		lab.anchorB = p.anchorB;
		lab.items = p.items.map((t, i) => ({ id: `i${Date.now() + i}`, text: t }));
	}

	const maxAbs = $derived(scores.length > 0 ? Math.max(...scores.map((s) => Math.abs(s.score)), 0.001) : 1);
</script>

<main class="lab">
	<div class="cloud-fill">
		<SemanticCloud
			{points}
			mode="plane"
			planeAxis={{ aId: 'anchorA', bId: 'anchorB' }}
			links={anchorAResult && anchorBResult
				? [{ from: 'anchorA', to: 'anchorB', style: 'dashed', opacity: 0.7 }]
				: []}
		/>
	</div>
	<aside class="left">
		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Axes (presets)</span>
			</div>
			<div class="presets">
				{#each presets as p, i (i)}
					<button class="preset" onclick={() => applyPreset(p)}>
						<div class="preset-label">{p.label}</div>
						<div class="preset-poles">
							<span class="poleA">{p.anchorA.split(',')[0]}</span>
							<span class="op">↔</span>
							<span class="poleB">{p.anchorB.split(',')[0]}</span>
						</div>
					</button>
				{/each}
			</div>
		</div>
		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Anchor A (− pole)</span>
			</div>
			<textarea bind:value={lab.anchorA} rows="2" spellcheck="false"></textarea>
			<div class="head">
				<span class="eyebrow">Anchor B (+ pole)</span>
			</div>
			<textarea bind:value={lab.anchorB} rows="2" spellcheck="false"></textarea>
		</div>
		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Sample items</span>
				<button class="add" onclick={addItem} title="Add an item">＋</button>
			</div>
			<div class="items">
				{#each lab.items as it (it.id)}
					<div class="item">
						<input
							value={it.text}
							oninput={(e) => setItemText(it.id, (e.target as HTMLInputElement).value)}
						/>
						<button class="x" onclick={() => removeItem(it.id)} title="Remove">×</button>
					</div>
				{/each}
			</div>
		</div>
	</aside>

	<aside class="right">
		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Axis projection</span>
				{#if loading}<span class="loading">…</span>{/if}
			</div>
			{#if scores.length === 0}
				<p class="empty">Fill in anchors and items.</p>
			{:else}
				<ul class="scores">
					{#each scores as s (s.id)}
						<li>
							<span class="item-text" title={s.text}>{s.text}</span>
							<div class="axis">
								<div class="axis-line"></div>
								<div
									class="axis-dot"
									style:left={`${50 + (s.score / maxAbs) * 45}%`}
									style:background={s.score > 0
										? 'oklch(0.78 0.18 30)'
										: 'oklch(0.78 0.18 200)'}
								></div>
							</div>
							<span class="score tabular" class:pos={s.score > 0} class:neg={s.score < 0}
								>{s.score > 0 ? '+' : ''}{s.score.toFixed(3)}</span
							>
						</li>
					{/each}
				</ul>
				<div class="axis-legend no-select">
					<span class="legend-poleA">← A</span>
					<span class="legend-poleB">B →</span>
				</div>
			{/if}
		</div>
	</aside>
</main>

<style>
	.lab {
		position: relative;
		display: flex;
		gap: 10px;
		min-height: 0;
		height: 100%;
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
	.presets {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.preset {
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 6px 8px;
		cursor: pointer;
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
		margin-bottom: 2px;
	}
	.preset:hover .preset-label {
		color: var(--accent);
	}
	.preset-poles {
		font-size: 11px;
		color: var(--text-secondary);
		display: flex;
		gap: 6px;
		align-items: baseline;
	}
	.poleA {
		color: oklch(0.78 0.18 200);
	}
	.poleB {
		color: oklch(0.78 0.18 30);
	}
	.op {
		color: var(--text-subtle);
	}
	textarea,
	input {
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text-primary);
		font-family: 'Inter', sans-serif;
		font-size: 12px;
		padding: 5px 8px;
		min-width: 0;
		box-sizing: border-box;
		width: 100%;
	}
	textarea {
		resize: vertical;
	}
	.items {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.item {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 4px;
		align-items: center;
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
	.loading {
		font-size: 10px;
		color: var(--accent);
	}
	.empty {
		font-size: 12px;
		color: var(--text-subtle);
		font-style: italic;
	}
	ul.scores {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	ul.scores li {
		display: grid;
		grid-template-columns: 1fr;
		gap: 2px;
	}
	.item-text {
		font-size: 11px;
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.axis {
		position: relative;
		height: 14px;
		display: flex;
		align-items: center;
	}
	.axis-line {
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		height: 1px;
		background: var(--border-strong);
	}
	.axis-dot {
		position: absolute;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		transform: translate(-50%, -50%);
		top: 50%;
		box-shadow: 0 0 6px currentColor;
	}
	.score {
		font-size: 10px;
		text-align: right;
		color: var(--text-muted);
	}
	.score.pos {
		color: oklch(0.78 0.18 30);
	}
	.score.neg {
		color: oklch(0.78 0.18 200);
	}
	.axis-legend {
		display: flex;
		justify-content: space-between;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 0 4px;
		margin-top: 4px;
	}
	.legend-poleA {
		color: oklch(0.78 0.18 200);
	}
	.legend-poleB {
		color: oklch(0.78 0.18 30);
	}
</style>
