<script lang="ts">
	/**
	 * Anatomy — "What is the model actually doing?"
	 *
	 * Runs a custom MiniLM ONNX export that exposes every internal tensor,
	 * and walks the full pipeline as stages: tokenize → embed → 6 attention
	 * blocks → mean pool → normalize → layer trajectories. Always MiniLM
	 * (6×12×384 is the right size to actually see), regardless of the
	 * playground's selected model.
	 */

	import { IconHeatmap, IconLoader } from '$lib/icons.js';
	import { ANATOMY, loadAnatomy, runAnatomy, type AnatomyLoadState, type AnatomyRun } from '$lib/anatomy/model.js';
	import { computeHeadStats, headHue } from '$lib/anatomy/stats.js';
	import AnatomyFlow, { type StageKind } from '$lib/anatomy/AnatomyFlow.svelte';
	import { cosine } from '$lib/math/similarity.js';
	import { getModel } from '$lib/models/registry.js';
	import type { EmbeddingResult, Token } from '$lib/models/types.js';
	import InfoPop from '$lib/shell/InfoPop.svelte';
	import LabShell from '$lib/shell/LabShell.svelte';
	import { theme } from '$lib/theme/theme.svelte.js';
	import { oklchToRgb } from '$lib/theme/palette.js';
	import SemanticCloud, { type CloudPoint } from '$lib/viz/SemanticCloud.svelte';
	import { createLabState } from './labState.svelte.js';

	const lab = createLabState('anatomy', {
		sentence: 'The trophy would not fit in the suitcase because it was too big.'
	});

	const presets = [
		{ label: 'it = ?', sentence: 'The trophy would not fit in the suitcase because it was too big.', note: 'Winograd — which noun does "it" attend to?' },
		{ label: 'two banks', sentence: 'He sat on the bank of the river, then walked to the bank for cash.', note: 'Same token, two meanings — watch the copies drift apart in the layer trajectories.' },
		{ label: 'subwords', sentence: 'The unbelievably electrifying juggler mesmerized everyone.', note: 'Rare words shatter into WordPiece fragments.' },
		{ label: 'negation', sentence: 'The movie was not good at all.', note: 'Where does "not" send its attention?' }
	];

	// ---------- pipeline stages ----------
	interface StageDef {
		id: string;
		kind: StageKind;
		blockIdx: number;
		title: string;
	}
	const STAGES: StageDef[] = [
		{ id: 'tokenize', kind: 'tokenize', blockIdx: 0, title: 'Tokenize' },
		{ id: 'embed', kind: 'embed', blockIdx: 0, title: 'Embed + position' },
		...Array.from({ length: ANATOMY.layers }, (_, i) => ({
			id: `block-${i}`,
			kind: 'block' as StageKind,
			blockIdx: i,
			title: `Block ${i + 1}`
		})),
		{ id: 'pool', kind: 'pool', blockIdx: 0, title: 'Mean pool' },
		{ id: 'normalize', kind: 'normalize', blockIdx: 0, title: 'Normalize' },
		{ id: 'layers', kind: 'layers', blockIdx: 0, title: 'Layer trajectories' }
	];
	let stageId = $state('block-0');
	const stage = $derived(STAGES.find((s) => s.id === stageId) ?? STAGES[2]);

	function stageShape(s: StageDef, seq: number | null): string {
		const n = seq ?? '·';
		switch (s.kind) {
			case 'tokenize':
				return `${n} ids`;
			case 'embed':
				return `${n}×${ANATOMY.dim}`;
			case 'block':
				return `${ANATOMY.heads} heads`;
			case 'pool':
				return `${n}×${ANATOMY.dim} → ${ANATOMY.dim}`;
			case 'normalize':
				return '‖v‖ = 1';
			case 'layers':
				return `${n}×${ANATOMY.layers + 1} pts`;
		}
	}

	// ---------- model load + run ----------
	let loadState = $state<AnatomyLoadState>({ status: 'idle' });
	let run = $state<AnatomyRun | null>(null);
	let running = $state(false);
	let runError = $state<string | null>(null);

	$effect(() => {
		loadAnatomy((s) => (loadState = s)).catch(() => {});
	});

	let gen = 0;
	$effect(() => {
		const text = lab.sentence;
		if (loadState.status !== 'ready') return;
		const g = ++gen;
		running = true;
		const timer = setTimeout(async () => {
			try {
				const r = await runAnatomy(text.trim() || 'Hello world.');
				if (g === gen) {
					run = r;
					runError = null;
				}
			} catch (e) {
				if (g === gen) runError = e instanceof Error ? e.message : String(e);
			} finally {
				if (g === gen) running = false;
			}
		}, 350);
		return () => clearTimeout(timer);
	});

	// ---------- selection ----------
	let headIdx = $state<number | null>(null);
	let selTokRaw = $state<number | null>(null);
	const selectedToken = $derived(run && selTokRaw != null && selTokRaw < run.seq ? selTokRaw : null);
	$effect(() => {
		void lab.sentence;
		selTokRaw = null;
	});
	$effect(() => {
		void stageId;
		headIdx = null;
	});

	// ---------- heads (block stages) ----------
	const headStats = $derived.by(() => {
		if (!run || stage.kind !== 'block') return [];
		return computeHeadStats(run.attn[stage.blockIdx], run.seq, ANATOMY.heads, stage.blockIdx);
	});

	/** Paint one head's seq×seq attention matrix into a tiny canvas. */
	function thumb(canvas: HTMLCanvasElement, p: { attn: Float32Array; seq: number; head: number }) {
		function draw(pp: { attn: Float32Array; seq: number; head: number }) {
			const { attn, seq, head } = pp;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			canvas.width = seq;
			canvas.height = seq;
			const img = ctx.createImageData(seq, seq);
			const hue = headHue(head);
			const chroma = theme.primitives.accentChroma;
			const base = head * seq * seq;
			for (let q = 0; q < seq; q++) {
				for (let k = 0; k < seq; k++) {
					const w = attn[base + q * seq + k];
					// sqrt lifts the low weights so structure reads at 40px.
					const [r, g, b] = oklchToRgb(0.13 + 0.72 * Math.sqrt(w), chroma * (0.15 + 1.1 * w), hue);
					const o = (q * seq + k) * 4;
					img.data[o] = (r * 255) | 0;
					img.data[o + 1] = (g * 255) | 0;
					img.data[o + 2] = (b * 255) | 0;
					img.data[o + 3] = 255;
				}
			}
			ctx.putImageData(img, 0, 0);
		}
		draw(p);
		return { update: draw };
	}

	// ---------- pool contributions (right dock, pool stage) ----------
	const contributions = $derived.by(() => {
		if (!run || stage.kind !== 'pool') return [] as { t: number; text: string; cos: number }[];
		const dim = ANATOMY.dim;
		const last = run.hidden[ANATOMY.layers];
		return run.tokens
			.map((tok, t) => ({ t, text: tok.text, cos: cosine(last.subarray(t * dim, (t + 1) * dim), run!.pooled) }))
			.sort((a, b) => b.cos - a.cos);
	});

	// ---------- layer-trajectory cloud ----------
	const layerPoints = $derived.by<CloudPoint[]>(() => {
		if (!run || stage.kind !== 'layers') return [];
		const dim = ANATOMY.dim;
		const pts: CloudPoint[] = [];
		for (let t = 0; t < run.seq; t++) {
			const tok = run.tokens[t];
			const hue = (t / Math.max(1, run.seq - 1)) * 300;
			for (let l = 0; l <= ANATOMY.layers; l++) {
				pts.push({
					id: `t${t}_l${l}`,
					vector: run.hidden[l].subarray(t * dim, (t + 1) * dim),
					hue,
					label: l === ANATOMY.layers ? tok.text.replace(/^##/, '·') : undefined,
					hoverText: `«${tok.text}» — ${l === 0 ? 'embedding' : `after block ${l}`}`,
					size: l === ANATOMY.layers ? 1 : 0.45 + 0.07 * l,
					variant: tok.isSpecial ? 'ring' : l === ANATOMY.layers ? 'sphere' : 'dot'
				});
			}
		}
		return pts;
	});
	const layerPaths = $derived.by<string[][]>(() => {
		if (!run || stage.kind !== 'layers') return [];
		return Array.from({ length: run.seq }, (_, t) =>
			Array.from({ length: ANATOMY.layers + 1 }, (_, l) => `t${t}_l${l}`)
		);
	});
	const cloudSelectedId = $derived(
		stage.kind === 'layers' && selectedToken != null ? `t${selectedToken}_l${ANATOMY.layers}` : null
	);
	function onCloudClick(id: string) {
		const m = /^t(\d+)_l\d+$/.exec(id);
		if (m) selTokRaw = Number(m[1]);
	}

	// ---------- scope bar: real result, or a token's 7-layer journey ----------
	const minilmInfo = getModel('minilm-l6');
	const selectedResult = $derived.by<EmbeddingResult | null>(() => {
		if (!run) return null;
		const dim = ANATOMY.dim;
		if (selectedToken != null) {
			// The inspector's token heatmap becomes the LAYER heatmap: rows are
			// this one token's stops through the network.
			const journey = new Float32Array((ANATOMY.layers + 1) * dim);
			const layerTokens: Token[] = [];
			for (let l = 0; l <= ANATOMY.layers; l++) {
				journey.set(run.hidden[l].subarray(selectedToken * dim, (selectedToken + 1) * dim), l * dim);
				layerTokens.push({ text: l === 0 ? 'emb' : `L${l}`, id: l, position: l, isSpecial: false });
			}
			return {
				vector: journey.subarray(ANATOMY.layers * dim),
				dim,
				tokens: layerTokens,
				tokenVectors: journey,
				backend: 'transformers',
				model: minilmInfo,
				text: `«${run.tokens[selectedToken].text}» through ${ANATOMY.layers} blocks`,
				elapsedMs: run.elapsedMs
			};
		}
		return {
			vector: run.pooled,
			dim,
			tokens: run.tokens,
			tokenVectors: run.hidden[ANATOMY.layers],
			backend: 'transformers',
			model: minilmInfo,
			text: run.text,
			elapsedMs: run.elapsedMs
		};
	});
	const selectedLabel = $derived(
		run == null ? null : selectedToken != null ? run.tokens[selectedToken].text : 'sentence'
	);

	// ---------- right-dock explainers for non-block stages ----------
	const EXPLAIN: Partial<Record<StageKind, { title: string; body: string[] }>> = {
		tokenize: {
			title: 'WordPiece',
			body: [
				`The tokenizer knows ${ANATOMY.vocab.toLocaleString()} pieces. Common words are one piece; rare words shatter into ## fragments.`,
				'[CLS] and [SEP] are bookkeeping tokens added to every input — watch how much attention they soak up in later blocks.'
			]
		},
		embed: {
			title: 'Just a lookup table',
			body: [
				'Each id indexes a row of a 30,522 × 384 matrix — no context yet. The same word gets the same column every time.',
				'A learned position vector is added so "dog bites man" ≠ "man bites dog". Context arrives in the blocks.'
			]
		},
		pool: {
			title: 'Many vectors → one',
			body: [
				'The sentence embedding is nothing fancier than the average of all final token vectors.',
				'Sorted below: how aligned each token already is with the average it helped create.'
			]
		},
		normalize: {
			title: 'Onto the unit sphere',
			body: [
				'Dividing by the length puts every sentence on the unit sphere, where cosine similarity is just a dot product.',
				'Direction is the meaning; the length carried none the model wants to keep.'
			]
		},
		layers: {
			title: 'Watching context happen',
			body: [
				'Every token leaves a 7-stop trail: its raw embedding, then its position after each block. Same-word tokens start at the same spot — context pulls them apart.',
				'Try the "two banks" preset, then click either bank to trace its journey in the inspector.'
			]
		}
	};

	const guide = [
		{
			title: 'One model, dissected',
			body: `This lab always runs ${ANATOMY.modelName} — 6 blocks × 12 heads × 384 dims, exported with every internal tensor exposed. The left rail is the actual pipeline; click any stage to watch it work on your sentence.`,
			apply: () => (stageId = 'tokenize'),
			applyLabel: 'Start at tokenize'
		},
		{
			title: 'Heads have jobs',
			body: 'Each block runs 12 attention heads in parallel, and they specialize: some track the previous word, some the next, some hunt syntax. The badges on the right are computed live from your sentence (Clark et al. 2019).',
			apply: () => (stageId = 'block-0'),
			applyLabel: 'Open block 1'
		},
		{
			title: 'The attention sink',
			body: 'By the later blocks, many heads dump most of their attention on [SEP]. That is the model\'s no-op: a head that has nothing to say parks its attention on a delimiter.',
			apply: () => (stageId = 'block-4'),
			applyLabel: 'Open block 5'
		},
		{
			title: 'Words drift apart',
			body: 'The layer-trajectory view plots every token at all 7 stops. Load "two banks": both bank tokens start at the same point — identical rows of the lookup table — and attention drags them to different meanings.',
			apply: () => {
				lab.sentence = presets[1].sentence;
				stageId = 'layers';
			},
			applyLabel: 'Show the trajectories'
		}
	];
</script>

<LabShell
	labId="anatomy"
	dockTitle="Pipeline"
	resultsTitle={stage.kind === 'block' ? 'Attention heads' : 'What is happening'}
	resultsIcon={IconHeatmap}
	selected={selectedResult}
	{selectedLabel}
	scopeHint="Click any token to trace its journey through the network."
	modelName={minilmInfo.shortName}
	{guide}
>
	{#snippet cloud()}
		{#if loadState.status !== 'ready'}
			<div class="load-veil no-select">
				<div class="load-card">
					{#if loadState.status === 'error'}
						<span class="load-err">model failed to load — {loadState.message}</span>
					{:else}
						<IconLoader size={18} class="spin" />
						<span>dissecting {ANATOMY.modelName}</span>
						<div class="track">
							<div class="fill" style:width={`${(loadState.progress ?? 0) * 100}%`}></div>
						</div>
						<span class="load-sub tabular">one-time download · ~23 MB</span>
					{/if}
				</div>
			</div>
		{:else if stage.kind === 'layers'}
			<SemanticCloud points={layerPoints} paths={layerPaths} selectedId={cloudSelectedId} onPointClick={onCloudClick} />
		{:else}
			<AnatomyFlow
				{run}
				stage={stage.kind}
				blockIdx={stage.blockIdx}
				{headIdx}
				{selectedToken}
				onSelectToken={(i) => (selTokRaw = i)}
			/>
		{/if}
	{/snippet}

	{#snippet dock()}
		<div>
			<div class="fld-label">
				<span>Sentence
					<InfoPop title="The specimen">
						<p>Whatever you type here is pushed through <b>{ANATOMY.modelName}</b> and every internal tensor is captured — all {ANATOMY.layers + 1} hidden states and all {ANATOMY.layers * ANATOMY.heads} attention maps.</p>
						<p>Capped at {ANATOMY.maxTokens} tokens so the attention matrices stay readable.</p>
					</InfoPop>
				</span>
				{#if running}
					<span class="busy tabular">running…</span>
				{:else if run}
					<span class="sum tabular">{run.seq}/{ANATOMY.maxTokens} tokens · {run.elapsedMs.toFixed(0)} ms</span>
				{/if}
			</div>
			<textarea class="fld" bind:value={lab.sentence} rows="3" spellcheck="false"
				placeholder="Type a short sentence to dissect."></textarea>
			{#if runError}
				<p class="run-err">{runError}</p>
			{/if}
		</div>

		<div class="chips">
			{#each presets as p (p.label)}
				<button
					class="chip-btn"
					class:on={lab.sentence === p.sentence}
					onclick={() => (lab.sentence = p.sentence)}
					title={p.note}
				>
					{p.label}
				</button>
			{/each}
		</div>

		<div class="hairline"></div>

		<div class="fld-label"><span>The pipeline</span></div>
		<ol class="stages">
			{#each STAGES as s, i (s.id)}
				<li class:indent={s.kind === 'block'} class:last={i === STAGES.length - 1}>
					<button class="stage-row no-select" class:on={stageId === s.id} onclick={() => (stageId = s.id)}>
						<span class="dot" class:block-dot={s.kind === 'block'}></span>
						<span class="st-title">{s.title}</span>
						<span class="st-shape tabular">{stageShape(s, run?.seq ?? null)}</span>
					</button>
				</li>
			{/each}
		</ol>
	{/snippet}

	{#snippet results()}
		{#if stage.kind === 'block'}
			{#if run}
				<div class="fld-label">
					<span>Block {stage.blockIdx + 1} · 12 heads
						<InfoPop title="Reading the grid">
							<p>Each tile is one head's {run.seq}×{run.seq} attention matrix — rows are queries, columns are keys, brightness is weight.</p>
							<p>Badges are computed live from your sentence: a <b>← prev</b> head puts &gt;40% of its attention one token back, a <b>[SEP] sink</b> parks it on the delimiter, and so on.</p>
							<p>Click a tile to solo that head's arcs in the center view.</p>
						</InfoPop>
					</span>
					{#if headIdx != null}
						<button class="chip-btn on" onclick={() => (headIdx = null)}>all heads</button>
					{/if}
				</div>
				<div class="head-grid">
					{#each headStats as h (h.head)}
						<button
							class="head-cell no-select"
							class:on={headIdx === h.head}
							class:dim={headIdx != null && headIdx !== h.head}
							onclick={() => (headIdx = headIdx === h.head ? null : h.head)}
						>
							<canvas use:thumb={{ attn: run.attn[stage.blockIdx], seq: run.seq, head: h.head }}></canvas>
							<span class="hc-row">
								<i class="hc-dot" style:background={theme.hueCss(headHue(h.head), { l: 0.72 })}></i>
								<span class="hc-name tabular">H{h.head + 1}</span>
							</span>
							<span class="hc-badge">{h.label}</span>
						</button>
					{/each}
				</div>
			{:else}
				<p class="empty-note">Waiting for the first forward pass…</p>
			{/if}
		{:else if stage.kind === 'pool' && run}
			{@const ex = EXPLAIN.pool!}
			<div class="fld-label"><span>{ex.title}</span></div>
			{#each ex.body as para (para)}
				<p class="explain">{para}</p>
			{/each}
			<ol class="contribs">
				{#each contributions as c (c.t)}
					<li>
						<button class="disp-row" class:sel={selectedToken === c.t} onclick={() => (selTokRaw = c.t)}>
							<span class="word">{c.text}</span>
							<div class="track"><div class="fill" style:width={`${Math.max(0, c.cos) * 100}%`}></div></div>
							<span class="dist tabular">{c.cos.toFixed(2)}</span>
						</button>
					</li>
				{/each}
			</ol>
		{:else if EXPLAIN[stage.kind]}
			{@const ex = EXPLAIN[stage.kind]!}
			<div class="fld-label"><span>{ex.title}</span></div>
			{#each ex.body as para (para)}
				<p class="explain">{para}</p>
			{/each}
		{/if}
	{/snippet}
</LabShell>

<style>
	.busy {
		color: var(--lab);
	}
	.sum {
		font-size: 10px;
		color: var(--text-subtle);
		text-transform: none;
		letter-spacing: 0;
	}
	.run-err {
		font-size: 11px;
		color: var(--bad);
		margin: 6px 0 0;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}

	/* ---------- pipeline stage rail ---------- */
	ol.stages {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	ol.stages li {
		position: relative;
		padding-left: 2px;
	}
	/* connector spine */
	ol.stages li::before {
		content: '';
		position: absolute;
		left: 12px;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--border);
	}
	ol.stages li.last::before {
		bottom: 50%;
	}
	ol.stages li:first-child::before {
		top: 50%;
	}
	.stage-row {
		position: relative;
		display: grid;
		grid-template-columns: 20px 1fr auto;
		align-items: center;
		gap: 8px;
		width: 100%;
		background: transparent;
		border: none;
		border-radius: 7px;
		padding: 5.5px 6px;
		cursor: pointer;
		color: var(--text-muted);
		font-size: 12px;
		text-align: left;
		transition: background 0.14s ease, color 0.14s ease;
	}
	li.indent .stage-row {
		padding-left: 18px;
	}
	.stage-row:hover {
		background: oklch(1 0 0 / 0.05);
		color: var(--text-primary);
	}
	.stage-row.on {
		background: var(--lab-dim);
		color: var(--text-primary);
	}
	.stage-row .dot {
		position: relative;
		z-index: 1;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--border-strong);
		justify-self: center;
		transition: background 0.14s ease, box-shadow 0.14s ease;
	}
	.stage-row .dot.block-dot {
		border-radius: 2px;
		width: 6px;
		height: 6px;
	}
	.stage-row.on .dot {
		background: var(--lab);
		box-shadow: 0 0 8px color-mix(in oklab, var(--lab) 60%, transparent);
	}
	.st-title {
		font-weight: 550;
	}
	.st-shape {
		font-size: 9.5px;
		color: var(--text-subtle);
	}
	.stage-row.on .st-shape {
		color: color-mix(in oklab, var(--lab) 75%, var(--text-muted));
	}

	/* ---------- head grid ---------- */
	.head-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 7px;
	}
	.head-cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		background: oklch(1 0 0 / 0.025);
		border: 1px solid var(--border);
		border-radius: 9px;
		padding: 7px 5px 6px;
		cursor: pointer;
		transition: border-color 0.14s ease, opacity 0.14s ease, transform 0.14s ease;
	}
	.head-cell:hover {
		border-color: color-mix(in oklab, var(--lab) 55%, transparent);
		transform: translateY(-1px);
	}
	.head-cell.on {
		border-color: var(--lab);
		box-shadow: 0 0 10px color-mix(in oklab, var(--lab) 30%, transparent);
	}
	.head-cell.dim {
		opacity: 0.45;
	}
	.head-cell canvas {
		width: 100%;
		aspect-ratio: 1;
		border-radius: 5px;
		image-rendering: pixelated;
	}
	.hc-row {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.hc-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}
	.hc-name {
		font-size: 9.5px;
		color: var(--text-muted);
	}
	.hc-badge {
		font-size: 9px;
		color: var(--text-subtle);
		white-space: nowrap;
		overflow: hidden;
		max-width: 100%;
		text-overflow: ellipsis;
	}
	.head-cell.on .hc-badge {
		color: var(--lab);
	}

	/* ---------- explainers + contributions ---------- */
	.explain {
		font-size: 11.5px;
		line-height: 1.55;
		color: var(--text-muted);
		margin: 0 0 8px;
	}
	ol.contribs {
		list-style: none;
		margin: 6px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.disp-row {
		display: grid;
		grid-template-columns: minmax(48px, auto) 1fr 40px;
		gap: 8px;
		align-items: center;
		font-size: 11.5px;
		width: 100%;
		background: transparent;
		border: none;
		border-radius: 6px;
		padding: 3px 5px;
		cursor: pointer;
		color: inherit;
		text-align: left;
	}
	.disp-row:hover {
		background: oklch(1 0 0 / 0.05);
	}
	.disp-row.sel {
		background: var(--lab-dim);
	}
	.word {
		font-family: ui-monospace, Menlo, monospace;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dist {
		text-align: right;
		color: var(--text-muted);
	}

	/* ---------- load veil ---------- */
	.load-veil {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
	}
	.load-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 22px 30px;
		border-radius: 14px;
		border: 1px solid var(--border);
		background: var(--surface1);
		backdrop-filter: blur(12px);
		font-size: 12.5px;
		color: var(--text-muted);
	}
	.load-card .track {
		width: 190px;
	}
	.load-sub {
		font-size: 10px;
		color: var(--text-subtle);
	}
	.load-err {
		color: var(--bad);
		max-width: 300px;
	}
	.load-card :global(.spin) {
		animation: spin 1.1s linear infinite;
		color: var(--lab);
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
