<script lang="ts">
	/**
	 * Compare — "How close are two meanings?"
	 *
	 * Two texts A and B, plus reference texts for scale, with cosine as the
	 * hero metric. Optional corpus context scatters 29 seed sentences behind
	 * them (embedded lazily, only when toggled on).
	 */

	import { IconAdd, IconRemove, IconStats } from '$lib/icons.js';
	import { cosine, dot, euclidean, norm } from '$lib/math/similarity.js';
	import type { EmbeddingResult } from '$lib/models/types.js';
	import { playground } from '$lib/stores/playground.svelte.js';
	import { theme } from '$lib/theme/theme.svelte.js';
	import { CATEGORY_HUES, SEED_CORPUS } from '$lib/corpus/seed.js';
	import InfoPop from '$lib/shell/InfoPop.svelte';
	import LabShell from '$lib/shell/LabShell.svelte';
	import SemanticCloud, { type CloudLink, type CloudPoint } from '$lib/viz/SemanticCloud.svelte';
	import { createBatchEmbed, createSingleEmbed } from './embed.svelte.js';
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

	const HUE_A = 200;
	const HUE_B = 30;
	const EXTRA_HUES = [130, 280, 60, 320, 170, 350];

	const embedA = createSingleEmbed();
	const embedB = createSingleEmbed();
	const extrasBatch = createBatchEmbed({ delay: 350 });
	const corpusBatch = createBatchEmbed({ delay: 150, flushEvery: 4 });

	$effect(() => {
		void playground.modelId;
		embedA.run(lab.textA);
	});
	$effect(() => {
		void playground.modelId;
		embedB.run(lab.textB);
	});
	$effect(() => {
		void playground.modelId;
		void lab.extras.map((e) => e.id + e.text).join('|');
		extrasBatch.run(lab.extras.map((e) => ({ id: e.id, text: e.text })));
	});
	$effect(() => {
		void playground.modelId;
		if (lab.showCorpus) {
			corpusBatch.run(SEED_CORPUS.map((c) => ({ id: c.id, text: c.text })));
		} else {
			corpusBatch.clear();
		}
	});

	let selectedId = $state<string | null>('A');
	const selectedResult = $derived.by<EmbeddingResult | null>(() => {
		if (selectedId === 'A') return embedA.result;
		if (selectedId === 'B') return embedB.result;
		if (selectedId && extrasBatch.results.has(selectedId)) return extrasBatch.results.get(selectedId) ?? null;
		return null;
	});

	function extraLabel(idx: number): string {
		return String.fromCharCode(67 + idx); // C, D, E, …
	}

	const metrics = $derived.by(() => {
		const a = embedA.result;
		const b = embedB.result;
		if (!a || !b || a.vector.length !== b.vector.length) return null;
		return {
			cos: cosine(a.vector, b.vector),
			dotV: dot(a.vector, b.vector),
			eucl: euclidean(a.vector, b.vector),
			normA: norm(a.vector),
			normB: norm(b.vector)
		};
	});

	type Labeled = { id: string; label: string; hue: number; vector: Float32Array; text: string };
	const labeled = $derived.by<Labeled[]>(() => {
		const out: Labeled[] = [];
		if (embedA.result) out.push({ id: 'A', label: 'A', hue: HUE_A, vector: embedA.result.vector, text: lab.textA });
		if (embedB.result) out.push({ id: 'B', label: 'B', hue: HUE_B, vector: embedB.result.vector, text: lab.textB });
		lab.extras.forEach((ex, i) => {
			const r = extrasBatch.results.get(ex.id);
			if (!r) return;
			out.push({ id: ex.id, label: extraLabel(i), hue: EXTRA_HUES[i % EXTRA_HUES.length], vector: r.vector, text: ex.text });
		});
		return out;
	});

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
		out.sort((x, y) => y.cos - x.cos);
		return out;
	});

	const points = $derived.by<CloudPoint[]>(() => {
		const out: CloudPoint[] = [];
		for (const item of labeled) {
			out.push({
				id: item.id,
				vector: item.vector,
				hue: item.hue,
				label: item.label,
				hoverText: item.text,
				size: item.id === 'A' || item.id === 'B' ? 1.1 : 0.8
			});
		}
		if (lab.showCorpus) {
			const dim = embedA.result?.vector.length ?? embedB.result?.vector.length;
			for (const c of SEED_CORPUS) {
				const r = corpusBatch.results.get(c.id);
				if (!r) continue;
				if (dim && r.vector.length !== dim) continue;
				out.push({
					id: c.id,
					vector: r.vector,
					hue: CATEGORY_HUES[c.category],
					hoverText: c.text,
					variant: 'dot'
				});
			}
		}
		return out;
	});

	const links = $derived.by<CloudLink[]>(() =>
		embedA.result && embedB.result ? [{ from: 'A', to: 'B', style: 'dashed', opacity: 0.65 }] : []
	);

	const presets = [
		{
			label: 'synonyms',
			a: 'A cat curled on a sunny windowsill.',
			b: 'A kitten napping in a patch of sunlight.',
			extras: ['Debugging a race condition.', 'The Atacama desert at dawn.']
		},
		{
			label: 'antonyms',
			a: 'I love this movie.',
			b: 'I hate this movie.',
			extras: ['I love this album.', 'This restaurant is amazing.']
		},
		{
			label: 'homonym',
			a: 'The bank by the river.',
			b: 'The bank that gave me a loan.',
			extras: ['A trout swimming upstream.', 'Filling out a mortgage application.']
		},
		{
			label: 'structure',
			a: 'Time flies like an arrow.',
			b: 'Fruit flies like a banana.',
			extras: ['An hour passes quickly.', 'Bananas attract small insects.']
		}
	];

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

	const guide = [
		{
			title: 'Two ways to say one thing',
			body: 'A and B describe the same scene in different words. Their cosine sits near 1 — the model reads meaning, not spelling. The reference texts C and D show what "far" looks like.',
			apply: () => applyPreset(presets[0]),
			applyLabel: 'Load synonyms'
		},
		{
			title: 'Opposites are close, too',
			body: '"I love this movie" vs "I hate this movie" — opposite sentiment, yet high cosine. Both are short opinions about the same movie, and that shared topic dominates the geometry. Sentiment is one direction among hundreds.',
			apply: () => applyPreset(presets[1]),
			applyLabel: 'Load antonyms'
		},
		{
			title: 'One word, two meanings',
			body: 'Both texts contain "bank", but the model reads context: the river bank lands near the trout, the loan bank near the mortgage. That is what "contextual embedding" means.',
			apply: () => applyPreset(presets[2]),
			applyLabel: 'Load homonym'
		},
		{
			title: 'Add scale with context',
			body: 'Two points alone tell you nothing about what "close" means. Toggle the corpus to scatter 29 varied sentences behind your texts — now distances have a ruler.',
			apply: () => (lab.showCorpus = true),
			applyLabel: 'Show corpus'
		}
	];
</script>

<LabShell
	labId="compare"
	dockTitle="Texts"
	resultsTitle="Similarity"
	resultsIcon={IconStats}
	selected={selectedResult}
	selectedLabel={selectedId}
	scopeHint="Click any labeled point in the cloud to see its embedding broken apart."
	{guide}
>
	{#snippet cloud()}
		<SemanticCloud {points} {links} {selectedId} onPointClick={(id) => (selectedId = id)} />
	{/snippet}

	{#snippet dock()}
		<div>
			<div class="fld-label"><span>Text A</span>{#if embedA.loading}<span class="busy">…</span>{/if}</div>
			<textarea class="fld" bind:value={lab.textA} rows="2" spellcheck="false"></textarea>
		</div>
		<div>
			<div class="fld-label"><span>Text B</span>{#if embedB.loading}<span class="busy">…</span>{/if}</div>
			<textarea class="fld" bind:value={lab.textB} rows="2" spellcheck="false"></textarea>
		</div>

		<div>
			<div class="fld-label">
				<span>References
					<InfoPop title="Why reference texts?">
						<p>Two points alone tell you nothing about scale — A and B always land at the projection's extremes.</p>
						<p>A few unrelated sentences give the space a <b>ruler</b>: now you can see what "close" and "far" actually look like for this model.</p>
					</InfoPop>
				</span>
				<button class="icon-btn" onclick={addExtra} aria-label="Add reference text"><IconAdd size={14} /></button>
			</div>
			<div class="list">
				{#each lab.extras as ex, i (ex.id)}
					<div class="item-row" style:--c={theme.hueCss(EXTRA_HUES[i % EXTRA_HUES.length])}>
						<span class="hue-badge">{extraLabel(i)}</span>
						<textarea
							class="fld row"
							rows="1"
							spellcheck="false"
							value={ex.text}
							oninput={(e) => setExtra(ex.id, (e.target as HTMLTextAreaElement).value)}
							placeholder="another sentence for scale…"
						></textarea>
						<button class="icon-btn danger" onclick={() => removeExtra(ex.id)} aria-label="Remove">
							<IconRemove size={13} />
						</button>
					</div>
				{/each}
			</div>
		</div>

		<div class="hairline"></div>

		<div class="chips">
			{#each presets as p (p.label)}
				<button class="chip-btn" onclick={() => applyPreset(p)} title={`${p.a} / ${p.b}`}>{p.label}</button>
			{/each}
		</div>
		<label class="toggle no-select">
			<input type="checkbox" bind:checked={lab.showCorpus} />
			<span>Corpus context
				{#if lab.showCorpus && corpusBatch.loading}
					<em class="busy tabular">{corpusBatch.done}/{corpusBatch.total}</em>
				{/if}
			</span>
			<InfoPop title="Corpus context">
				<p>Scatters 29 seed sentences (7 themes) behind your texts, embedded with the current model.</p>
				<p>They anchor the PCA projection so A and B stop hogging the extremes.</p>
			</InfoPop>
		</label>
	{/snippet}

	{#snippet results()}
		{#if !metrics}
			<p class="empty-note">Embed both A and B to compare them.</p>
		{:else}
			<div class="metric-hero">
				<span class="val">{metrics.cos.toFixed(4)}</span>
				<span class="unit">cosine · A↔B
					<InfoPop title="Cosine similarity">
						<p>How similar in <b>direction</b> two vectors are: 1 = same heading, 0 = perpendicular (unrelated), −1 = opposite.</p>
						<p><code>cos(A,B) = A·B / (‖A‖·‖B‖)</code></p>
						<p>The default "how similar are these texts" metric for embeddings.</p>
					</InfoPop>
				</span>
			</div>
			<div class="cos-scale no-select">
				<div class="cos-track">
					<div class="cos-marker" style:left={`${50 + metrics.cos * 50}%`}></div>
					<div class="cos-zero"></div>
				</div>
				<div class="cos-ticks tabular"><span>−1</span><span>0</span><span>+1</span></div>
			</div>

			<div class="metric-row">
				<span class="k">dot product
					<InfoPop title="Dot product">
						{#if Math.abs(metrics.normA - 1) < 0.001 && Math.abs(metrics.normB - 1) < 0.001}
							<p>Equal to cosine here because both vectors are unit length (‖A‖=‖B‖=1) — this model normalizes its embeddings.</p>
						{:else}
							<p>Unnormalized projection of one vector onto the other. ‖A‖={metrics.normA.toFixed(3)}, ‖B‖={metrics.normB.toFixed(3)}.</p>
						{/if}
					</InfoPop>
				</span>
				<span class="v">{metrics.dotV.toFixed(4)}</span>
			</div>
			<div class="metric-row">
				<span class="k">euclidean
					<InfoPop title="Euclidean distance">
						<p>Straight-line <b>distance</b>: 0 = identical, √2 ≈ 1.41 = perpendicular, 2 = opposite.</p>
						<p>For unit vectors it carries the same information as cosine: <code>‖A−B‖ = √(2 − 2·cos)</code></p>
					</InfoPop>
				</span>
				<span class="v">{metrics.eucl.toFixed(4)}</span>
			</div>

			<div class="hairline"></div>

			<div class="fld-label"><span>All pairs</span><span class="dim-note">by cosine</span></div>
			{#if pairs.length === 0}
				<p class="empty-note">Need at least two embedded texts.</p>
			{:else}
				<ul class="pairs">
					{#each pairs as p, i (`${p.aLabel}-${p.bLabel}-${i}`)}
						<li>
							<span class="hue-badge" style:--c={theme.hueCss(p.aHue)}>{p.aLabel}</span>
							<span class="hue-badge" style:--c={theme.hueCss(p.bHue)}>{p.bLabel}</span>
							<div class="track"><div class="fill" style:width={`${Math.max(0, Math.min(100, p.cos * 100))}%`}></div></div>
							<span class="pair-cos tabular" class:hot={p.cos > 0.6}>{p.cos.toFixed(3)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	{/snippet}
</LabShell>

<style>
	.busy {
		color: var(--lab);
		font-style: normal;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.toggle {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 12px;
		color: var(--text-secondary);
		cursor: pointer;
		margin-top: 2px;
	}
	.toggle input {
		accent-color: var(--lab);
	}
	.toggle em {
		font-style: normal;
		color: var(--lab);
		margin-left: 5px;
		font-size: 10.5px;
	}
	.cos-scale {
		margin: 4px 0 10px;
	}
	.cos-track {
		position: relative;
		height: 4px;
		border-radius: 2px;
		background: linear-gradient(
			to right,
			color-mix(in oklab, var(--contrast) 45%, transparent),
			oklch(1 0 0 / 0.07) 50%,
			color-mix(in oklab, var(--lab) 55%, transparent)
		);
	}
	.cos-zero {
		position: absolute;
		left: 50%;
		top: -3px;
		bottom: -3px;
		width: 1px;
		background: var(--text-subtle);
		opacity: 0.5;
	}
	.cos-marker {
		position: absolute;
		top: 50%;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		transform: translate(-50%, -50%);
		background: var(--lab);
		box-shadow: 0 0 10px color-mix(in oklab, var(--lab) 60%, transparent);
		transition: left 0.25s ease;
	}
	.cos-ticks {
		display: flex;
		justify-content: space-between;
		font-size: 9px;
		color: var(--text-subtle);
		margin-top: 5px;
	}
	.dim-note {
		font-size: 10px;
		color: var(--text-subtle);
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
	}
	ul.pairs {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	ul.pairs li {
		display: grid;
		grid-template-columns: 22px 22px 1fr 46px;
		gap: 6px;
		align-items: center;
		font-size: 11px;
	}
	.pair-cos {
		text-align: right;
		color: var(--text-muted);
	}
	.pair-cos.hot {
		color: var(--lab);
		font-weight: 600;
	}
</style>
