<script lang="ts">
	/**
	 * Analogies Lab — "R = A − B + C, what lives near R?"
	 *
	 * Three or four named term inputs and a signed expression. Cloud shows
	 * the terms + R (as a ring) with colored lines from each term to R.
	 * Templates pre-load classic analogy pairs. The classic does NOT fully
	 * land on sentence transformers — caveat in the tour content, not in
	 * the workspace.
	 */

	import { playground } from '$lib/stores/playground.svelte.js';
	import SemanticCloud, { type CloudPoint, type CloudLink } from '$lib/viz/SemanticCloud.svelte';
	import { cosine } from '$lib/math/similarity.js';
	import { CATEGORY_HUES } from '$lib/corpus/seed.js';
	import type { EmbeddingResult } from '$lib/models/types.js';
	import { createLabState } from './labState.svelte.js';

	type Term = { id: string; label: string; text: string; hue: number; sign: 1 | -1 };

	const HUES = [200, 30, 130, 280, 350, 60];
	const defaultTerms: Term[] = [
		{ id: 't0', label: 'king', text: 'king', hue: 200, sign: 1 },
		{ id: 't1', label: 'man', text: 'man', hue: 30, sign: -1 },
		{ id: 't2', label: 'woman', text: 'woman', hue: 130, sign: 1 }
	];

	const lab = createLabState('analogies', {
		terms: defaultTerms,
		targetText: 'queen'
	});

	const templates = [
		{ a: 'king', b: 'man', c: 'woman', target: 'queen', tag: 'royalty' },
		{ a: 'Paris', b: 'France', c: 'Germany', target: 'Berlin', tag: 'capitals' },
		{ a: 'Tokyo', b: 'Japan', c: 'Italy', target: 'Rome', tag: 'capitals' },
		{ a: 'walking', b: 'walked', c: 'flew', target: 'flying', tag: 'tenses' },
		{ a: 'good', b: 'better', c: 'small', target: 'smaller', tag: 'comparatives' },
		{ a: 'sun', b: 'day', c: 'moon', target: 'night', tag: 'time of day' }
	];

	let results = $state(new Map<string, EmbeddingResult>());
	let targetResult = $state<EmbeddingResult | null>(null);
	let loading = $state(false);

	let runSeq = 0;
	async function embedAll() {
		const seq = ++runSeq;
		loading = true;
		try {
			const map = new Map<string, EmbeddingResult>();
			for (const t of lab.terms) {
				if (!t.text.trim()) continue;
				const r = await playground.embedText(t.text);
				if (seq !== runSeq) return;
				map.set(t.id, r);
			}
			let tr: EmbeddingResult | null = null;
			if (lab.targetText.trim()) {
				tr = await playground.embedText(lab.targetText);
			}
			if (seq !== runSeq) return;
			results = map;
			targetResult = tr;
		} catch (e) {
			console.error('analogy embed error', e);
		} finally {
			if (seq === runSeq) loading = false;
		}
	}

	let timer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		// Reactivity hooks: term texts + target + model
		void lab.terms.map((t) => t.text).join('|');
		void lab.targetText;
		void playground.modelId;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => void embedAll(), 350);
	});

	const arithR = $derived.by<Float32Array | null>(() => {
		const vs = lab.terms.map((t) => ({ sign: t.sign, vec: results.get(t.id)?.vector }));
		const allReady = vs.every((v) => v.vec);
		if (!allReady || vs.length === 0) return null;
		const D = vs[0].vec!.length;
		if (vs.some((v) => v.vec!.length !== D)) return null;
		const out = new Float32Array(D);
		for (const v of vs) {
			for (let i = 0; i < D; i++) out[i] += v.sign * v.vec![i];
		}
		return out;
	});

	const points = $derived.by<CloudPoint[]>(() => {
		const out: CloudPoint[] = [];
		for (const t of lab.terms) {
			const r = results.get(t.id);
			if (!r) continue;
			out.push({
				id: t.id,
				vector: r.vector,
				hue: t.hue,
				label: t.label,
				hoverText: `${t.sign > 0 ? '+' : '−'}${t.label}: "${t.text}"`,
				size: 1.05
			});
		}
		if (targetResult && lab.targetText.trim()) {
			out.push({
				id: 'target',
				vector: targetResult.vector,
				hue: 60,
				label: lab.targetText,
				hoverText: `target: "${lab.targetText}"`,
				size: 0.9
			});
		}
		if (arithR) {
			out.push({
				id: 'R',
				vector: arithR,
				hue: 0,
				label: 'R',
				hoverText: 'R = ' + lab.terms.map((t) => `${t.sign > 0 ? '+' : '−'}${t.label}`).join(''),
				variant: 'ring',
				size: 1
			});
		}
		return out;
	});

	const links = $derived.by<CloudLink[]>(() => {
		if (!arithR) return [];
		return lab.terms
			.filter((t) => results.has(t.id))
			.map((t) => ({
				from: t.id,
				to: 'R',
				style: 'solid' as const,
				color: t.sign > 0 ? 0x6ec1d4 : 0xd6915c,
				opacity: 0.55
			}));
	});

	type Hit = { id: string; label: string; text: string; sim: number; hue: number; src: string };
	const nearest = $derived.by<Hit[]>(() => {
		if (!arithR) return [];
		const hits: Hit[] = [];
		// Terms themselves
		for (const t of lab.terms) {
			const r = results.get(t.id);
			if (r && r.vector.length === arithR.length) {
				hits.push({
					id: t.id,
					label: t.label,
					text: t.text,
					sim: cosine(arithR, r.vector),
					hue: t.hue,
					src: 'term'
				});
			}
		}
		// Target
		if (targetResult && lab.targetText.trim() && targetResult.vector.length === arithR.length) {
			hits.push({
				id: 'target',
				label: lab.targetText,
				text: lab.targetText,
				sim: cosine(arithR, targetResult.vector),
				hue: 60,
				src: 'target'
			});
		}
		// Corpus
		const corpus = playground.corpus;
		if (corpus) {
			for (const c of corpus.items) {
				if (c.vector.length !== arithR.length) continue;
				hits.push({
					id: c.item.id,
					label: '·',
					text: c.item.text,
					sim: cosine(arithR, c.vector),
					hue: CATEGORY_HUES[c.item.category],
					src: 'corpus'
				});
			}
		}
		hits.sort((a, b) => b.sim - a.sim);
		return hits.slice(0, 8);
	});

	function setTermText(id: string, text: string) {
		lab.terms = lab.terms.map((t) => (t.id === id ? { ...t, text, label: text.length > 12 ? t.label : text } : t));
	}
	function flipSign(id: string) {
		lab.terms = lab.terms.map((t) => (t.id === id ? { ...t, sign: -t.sign as 1 | -1 } : t));
	}
	function removeTerm(id: string) {
		if (lab.terms.length <= 2) return;
		lab.terms = lab.terms.filter((t) => t.id !== id);
	}
	function addTerm() {
		const i = lab.terms.length;
		lab.terms = [
			...lab.terms,
			{ id: `t${Date.now()}`, label: `T${i + 1}`, text: '', hue: HUES[i % HUES.length], sign: 1 }
		];
	}

	function applyTemplate(t: (typeof templates)[number]) {
		lab.terms = [
			{ id: 't0', label: t.a, text: t.a, hue: 200, sign: 1 },
			{ id: 't1', label: t.b, text: t.b, hue: 30, sign: -1 },
			{ id: 't2', label: t.c, text: t.c, hue: 130, sign: 1 }
		];
		lab.targetText = t.target;
	}
</script>

<main class="lab">
	<div class="cloud-fill">
		<SemanticCloud {points} {links} mode="pca" />
	</div>
	<aside class="left">
		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Templates</span>
			</div>
			<div class="tmpl-grid">
				{#each templates as t, i (i)}
					<button class="tmpl" onclick={() => applyTemplate(t)}>
						<div class="tmpl-expr">
							<span>{t.a}</span><span class="op">−</span><span>{t.b}</span><span class="op">+</span><span>{t.c}</span>
						</div>
						<div class="tmpl-target">→ <i>{t.target}</i> · {t.tag}</div>
					</button>
				{/each}
			</div>
		</div>

		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Terms</span>
				<button class="add" onclick={addTerm} title="Add a term">＋</button>
			</div>
			<div class="terms">
				{#each lab.terms as t (t.id)}
					{@const color = `oklch(0.78 0.18 ${t.hue})`}
					<div class="term" style:--c={color}>
						<button class="sign" class:neg={t.sign < 0} onclick={() => flipSign(t.id)} title="Flip sign"
							>{t.sign > 0 ? '+' : '−'}</button
						>
						<input
							value={t.text}
							oninput={(e) => setTermText(t.id, (e.target as HTMLInputElement).value)}
							placeholder="term"
						/>
						{#if lab.terms.length > 2}
							<button class="x" onclick={() => removeTerm(t.id)} title="Remove">×</button>
						{/if}
					</div>
				{/each}
			</div>
			<div class="head">
				<span class="eyebrow">Target (expected)</span>
			</div>
			<input
				class="target"
				bind:value={lab.targetText}
				placeholder="expected nearest word (optional)"
			/>
		</div>
	</aside>

	<aside class="right">
		<div class="card glass">
			<div class="head">
				<span class="eyebrow">R =</span>
				<span class="status">
					{#if loading}<span class="loading">…</span>{:else if !arithR}<span class="muted"
								>fill terms</span
							>{/if}
				</span>
			</div>
			<div class="expr">
				{#each lab.terms as t (t.id)}
					{@const c = `oklch(0.78 0.18 ${t.hue})`}
					<span class="expr-sign" class:neg={t.sign < 0}>{t.sign > 0 ? '+' : '−'}</span>
					<span class="expr-tk" style:--c={c}>{t.label}</span>
				{/each}
			</div>
		</div>

		<div class="card glass">
			<div class="head">
				<span class="eyebrow">Nearest to R</span>
			</div>
			{#if nearest.length === 0}
				<p class="empty">Fill in the terms above to compute R.</p>
			{:else}
				<ol class="hits">
					{#each nearest as h, i (h.id)}
						<li>
							<span class="rank tabular">{i + 1}</span>
							<span class="badge" style:--c={`oklch(0.78 0.18 ${h.hue})`}>{h.label}</span>
							<span class="hit-text" title={h.text}>{h.text}</span>
							<span class="hit-sim tabular" class:hot={h.sim > 0.5}>{h.sim.toFixed(3)}</span>
						</li>
					{/each}
				</ol>
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
		width: 320px;
	}
	.right {
		width: 360px;
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
	.tmpl-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
	}
	.tmpl {
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 6px 8px;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 2px;
		text-align: left;
		color: var(--text-secondary);
	}
	.tmpl:hover {
		border-color: var(--accent);
		color: var(--text-primary);
	}
	.tmpl-expr {
		font-size: 12px;
		display: flex;
		gap: 3px;
		align-items: baseline;
	}
	.tmpl-expr .op {
		color: var(--text-subtle);
	}
	.tmpl-target {
		font-size: 10px;
		color: var(--text-subtle);
	}
	.tmpl-target i {
		color: var(--accent);
		font-style: normal;
		font-weight: 600;
	}
	.terms {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.term {
		display: grid;
		grid-template-columns: 24px 1fr auto;
		gap: 4px;
		align-items: center;
	}
	.sign {
		background: transparent;
		border: 0;
		color: var(--c);
		font-size: 16px;
		font-weight: 700;
		cursor: pointer;
		padding: 0;
	}
	.sign.neg {
		color: var(--contrast);
	}
	input {
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text-primary);
		font-family: 'Inter', sans-serif;
		font-size: 13px;
		padding: 4px 8px;
		min-width: 0;
	}
	.target {
		font-style: italic;
		color: var(--accent);
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
	.expr {
		display: flex;
		gap: 3px;
		align-items: baseline;
		flex-wrap: wrap;
		font-size: 14px;
		padding: 6px 8px;
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 5px;
		min-height: 32px;
	}
	.expr-sign {
		color: var(--accent);
		font-weight: 700;
	}
	.expr-sign.neg {
		color: var(--contrast);
	}
	.expr-tk {
		color: var(--c);
		font-weight: 600;
		padding: 0 4px;
		background: color-mix(in oklab, var(--c) 18%, transparent);
		border-radius: 3px;
	}
	.status {
		font-size: 10px;
	}
	.loading {
		color: var(--accent);
	}
	.muted {
		color: var(--text-subtle);
		font-style: italic;
	}
	.empty {
		font-size: 12px;
		color: var(--text-subtle);
		font-style: italic;
	}
	ol.hits {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	ol.hits li {
		display: grid;
		grid-template-columns: 18px 30px 1fr 50px;
		gap: 6px;
		align-items: center;
		font-size: 11px;
	}
	.rank {
		font-size: 9px;
		color: var(--text-subtle);
	}
	.badge {
		text-align: center;
		font-size: 9px;
		font-weight: 700;
		padding: 1px 4px;
		border-radius: 3px;
		background: color-mix(in oklab, var(--c) 22%, transparent);
		color: var(--c);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hit-text {
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hit-sim {
		text-align: right;
		color: var(--text-muted);
	}
	.hit-sim.hot {
		color: var(--accent);
		font-weight: 600;
	}
</style>
