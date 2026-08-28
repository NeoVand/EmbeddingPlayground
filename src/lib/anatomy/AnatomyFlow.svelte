<script module lang="ts">
	/** Which act of the pipeline the center stage is showing. */
	export type StageKind = 'tokenize' | 'embed' | 'block' | 'pool' | 'normalize' | 'layers';
</script>

<script lang="ts">
	/**
	 * The Anatomy center stage — the full-bleed visual between the docks.
	 * One component, five acts:
	 *   tokenize  — the sentence splits into WordPiece chips
	 *   embed     — each token becomes a 384-d column (token + position)
	 *   block N   — attention arcs between the actual tokens, per head
	 *   pool      — every token's vector averages into one
	 *   normalize — the vector lands on the unit sphere
	 * (The 'layers' act is rendered by SemanticCloud in the lab, not here.)
	 */

	import { tick } from 'svelte';
	import { cosine } from '$lib/math/similarity.js';
	import { divergingRgb } from '$lib/theme/palette.js';
	import { theme } from '$lib/theme/theme.svelte.js';
	import type { AnatomyRun } from './model.js';
	import { headHue } from './stats.js';

	interface Props {
		run: AnatomyRun | null;
		stage: StageKind;
		blockIdx: number;
		headIdx: number | null;
		selectedToken: number | null;
		onSelectToken: (i: number | null) => void;
	}
	let { run, stage, blockIdx, headIdx, selectedToken, onSelectToken }: Props = $props();

	let hoverToken = $state<number | null>(null);

	// ---------- chip geometry for the arc layer ----------
	let rowEl = $state<HTMLDivElement | undefined>();
	let boxEl = $state<HTMLDivElement | undefined>();
	let chipEls: HTMLButtonElement[] = $state([]);
	let centers = $state<number[]>([]);
	let centersY = $state<number[]>([]);
	let rowW = $state(0);
	let colH = $state(0);

	function measure() {
		if (!rowEl || !boxEl) return;
		// Chips' offsetParent is the positioned container (.stage-box or .vcol),
		// so the SVGs share its coordinate frame — wrapped, centered rows included.
		rowW = boxEl.offsetWidth;
		colH = rowEl.scrollHeight;
		const chips = chipEls.filter(Boolean);
		centers = chips.map((el) => el.offsetLeft + el.offsetWidth / 2);
		centersY = chips.map((el) => el.offsetTop + el.offsetHeight / 2);
	}
	$effect(() => {
		void run;
		void stage;
		void tick().then(measure);
	});
	$effect(() => {
		if (!rowEl) return;
		const ro = new ResizeObserver(() => measure());
		ro.observe(rowEl);
		return () => ro.disconnect();
	});

	// ---------- attention arcs ----------
	interface Arc {
		q: number;
		k: number;
		w: number;
		head: number;
	}
	/** Width of the arc gutter to the left of the vertical token column. */
	const ARC_W = 180;

	const arcs = $derived.by<Arc[]>(() => {
		if (!run || stage !== 'block') return [];
		const { seq } = run;
		const a = run.attn[blockIdx];
		const out: Arc[] = [];
		if (headIdx != null) {
			const base = headIdx * seq * seq;
			for (let q = 0; q < seq; q++) {
				for (let k = 0; k < seq; k++) {
					const w = a[base + q * seq + k];
					if (w >= 0.07 && k !== q) out.push({ q, k, w, head: headIdx });
				}
			}
		} else {
			// All heads: each head contributes its strongest link per query row.
			for (let h = 0; h < 12; h++) {
				const base = h * seq * seq;
				for (let q = 0; q < seq; q++) {
					let bk = -1;
					let bw = 0;
					for (let k = 0; k < seq; k++) {
						const w = a[base + q * seq + k];
						if (k !== q && w > bw) {
							bw = w;
							bk = k;
						}
					}
					if (bk >= 0 && bw >= 0.12) out.push({ q, k: bk, w: bw, head: h });
				}
			}
		}
		return out;
	});

	const visibleArcs = $derived.by<Arc[]>(() => {
		const focus = hoverToken ?? selectedToken;
		if (focus == null) return arcs;
		return arcs.filter((a) => a.q === focus);
	});

	/** Tokens run top-to-bottom; arcs bow left from the column's shared edge. */
	function arcPath(a: Arc): string {
		const y1 = centersY[a.q] ?? 0;
		const y2 = centersY[a.k] ?? 0;
		const bow = Math.min(ARC_W - 12, 28 + Math.abs(y2 - y1) * 0.26 + a.w * 55);
		return `M ${ARC_W} ${y1} Q ${ARC_W - bow} ${(y1 + y2) / 2} ${ARC_W} ${y2}`;
	}

	const selfLoops = $derived.by(() => {
		if (!run || stage !== 'block') return [] as { q: number; w: number; head: number }[];
		const { seq } = run;
		const a = run.attn[blockIdx];
		const out: { q: number; w: number; head: number }[] = [];
		const hs = headIdx != null ? [headIdx] : [...Array(12).keys()];
		for (const h of hs) {
			const base = h * seq * seq;
			for (let q = 0; q < seq; q++) {
				const w = a[base + q * seq + q];
				if (w >= (headIdx != null ? 0.2 : 0.45)) out.push({ q, w, head: h });
			}
		}
		const focus = hoverToken ?? selectedToken;
		return focus == null ? out : out.filter((s) => s.q === focus);
	});

	// ---------- per-stage derived data ----------
	/** How far each token's vector moved through this block. */
	const deltaNorms = $derived.by<number[]>(() => {
		if (!run || stage !== 'block') return [];
		const { seq } = run;
		const dim = 384;
		const a = run.hidden[blockIdx];
		const b = run.hidden[blockIdx + 1];
		const out: number[] = [];
		for (let t = 0; t < seq; t++) {
			let s = 0;
			const off = t * dim;
			for (let d = 0; d < dim; d++) {
				const dd = b[off + d] - a[off + d];
				s += dd * dd;
			}
			out.push(Math.sqrt(s));
		}
		return out;
	});
	const maxDelta = $derived(Math.max(...deltaNorms, 1e-6));

	/** Each token's alignment with the final pooled embedding. */
	const contributions = $derived.by<number[]>(() => {
		if (!run || stage !== 'pool') return [];
		const dim = 384;
		const last = run.hidden[6];
		const out: number[] = [];
		for (let t = 0; t < run.seq; t++) {
			out.push(cosine(last.subarray(t * dim, (t + 1) * dim), run.pooled));
		}
		return out;
	});

	const rawNorm = $derived.by(() => {
		if (!run) return 0;
		let s = 0;
		for (const x of run.pooledRaw) s += x * x;
		return Math.sqrt(s);
	});

	// ---------- vector strip painter (svelte action) ----------
	function strip(canvas: HTMLCanvasElement, vec: Float32Array) {
		function draw(v: Float32Array) {
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			const n = v.length;
			canvas.width = 1;
			canvas.height = n;
			const img = ctx.createImageData(1, n);
			let max = 1e-6;
			for (let i = 0; i < n; i++) max = Math.max(max, Math.abs(v[i]));
			for (let i = 0; i < n; i++) {
				const [r, g, b] = divergingRgb(v[i] / max, theme.primitives);
				img.data[i * 4] = (r * 255) | 0;
				img.data[i * 4 + 1] = (g * 255) | 0;
				img.data[i * 4 + 2] = (b * 255) | 0;
				img.data[i * 4 + 3] = 255;
			}
			ctx.putImageData(img, 0, 0);
		}
		draw(vec);
		return {
			update(v: Float32Array) {
				draw(v);
			}
		};
	}

	function tokenVec(t: number, layer: number): Float32Array {
		const dim = 384;
		return run!.hidden[layer].subarray(t * dim, (t + 1) * dim);
	}

	function displayTok(s: string): string {
		return s.replace(/^\s+/, '');
	}

	const stageCaption = $derived.by(() => {
		switch (stage) {
			case 'tokenize':
				return { title: 'tokenize', sub: 'WordPiece · vocab 30,522' };
			case 'embed':
				return { title: 'embed', sub: 'token[id] + position[i] → 384-d' };
			case 'block':
				return {
					title: `block ${blockIdx + 1} · attention`,
					sub: headIdx != null ? `head ${headIdx + 1} · softmax(QKᵀ/√32)·V` : 'all 12 heads · strongest link each'
				};
			case 'pool':
				return { title: 'mean pool', sub: `average of ${run?.seq ?? '…'} token vectors` };
			case 'normalize':
				return { title: 'L2 normalize', sub: 'v / ‖v‖ — onto the unit sphere' };
			default:
				return { title: '', sub: '' };
		}
	});
</script>

{#if run}
	<div class="flow" role="presentation" onclick={(e) => e.target === e.currentTarget && onSelectToken(null)}>
		<div class="caption no-select">
			<span class="c-title">{stageCaption.title}</span>
			<span class="c-sub tabular">{stageCaption.sub}</span>
		</div>

		{#key stage + ':' + blockIdx}
			<div class="scroller">
				{#if stage === 'block'}
					<!-- Vertical layout: tokens read downward, arcs bow into the
					     left gutter — fits any sentence between the docks. -->
					<div class="vblock" bind:this={boxEl}>
						<svg class="varcs" width={ARC_W} height={colH} aria-hidden="true">
							{#each visibleArcs as a (a.head + '-' + a.q + '-' + a.k)}
								<path
									d={arcPath(a)}
									fill="none"
									stroke={theme.hueCss(headHue(a.head), { l: 0.72, a: Math.min(1, 0.12 + a.w) })}
									stroke-width={0.8 + a.w * 4.5}
									stroke-linecap="round"
								/>
							{/each}
							{#each selfLoops as s (s.head + 'l' + s.q)}
								<circle
									cx={ARC_W - 9}
									cy={centersY[s.q] ?? 0}
									r={4 + s.w * 5}
									fill="none"
									stroke={theme.hueCss(headHue(s.head), { l: 0.72, a: 0.5 })}
									stroke-width="1.5"
								/>
							{/each}
						</svg>
						<div class="vcol" bind:this={rowEl}>
							{#each run.tokens as t, i (i)}
								<div class="vrow">
									<button
										class="tok no-select"
										class:special={t.isSpecial}
										class:sel={selectedToken === i}
										class:subword={t.text.startsWith('##')}
										bind:this={chipEls[i]}
										onmouseenter={() => (hoverToken = i)}
										onmouseleave={() => (hoverToken = null)}
										onclick={() => onSelectToken(selectedToken === i ? null : i)}
									>
										{displayTok(t.text)}
									</button>
									<span class="dbar" title={`‖Δh‖ = ${deltaNorms[i]?.toFixed(3)}`}>
										<i style:width={`${((deltaNorms[i] ?? 0) / maxDelta) * 100}%`}></i>
									</span>
								</div>
							{/each}
						</div>
					</div>
				{:else}
					<div class="stage-box" bind:this={boxEl}>
					<div class="tokens-row wrap" bind:this={rowEl} class:tall={stage === 'tokenize'}>
						{#each run.tokens as t, i (i)}
							<div class="tok-unit">
								<button
									class="tok no-select"
									class:special={t.isSpecial}
									class:sel={selectedToken === i}
									class:subword={t.text.startsWith('##')}
									bind:this={chipEls[i]}
									onmouseenter={() => (hoverToken = i)}
									onmouseleave={() => (hoverToken = null)}
									onclick={() => onSelectToken(selectedToken === i ? null : i)}
								>
									{displayTok(t.text)}
								</button>

								{#if stage === 'tokenize'}
									<span class="tok-id tabular no-select">{t.id}</span>
								{:else if stage === 'embed'}
									<canvas class="vstrip" use:strip={tokenVec(i, 0)}></canvas>
									<span class="tok-id no-select">+ pos {i}</span>
								{:else if stage === 'pool'}
									<canvas class="vstrip small" use:strip={tokenVec(i, 6)}></canvas>
									<span class="tok-id tabular no-select">{(contributions[i] ?? 0).toFixed(2)}</span>
								{/if}
							</div>
						{/each}
					</div>

					{#if stage === 'pool'}
						<div class="pool-funnel" aria-hidden="true">
							<svg width={rowW} height="90">
								{#each run.tokens as _, i (i)}
									<path
										d={`M ${centers[i] ?? 0} 0 C ${centers[i] ?? 0} 55, ${rowW / 2} 30, ${rowW / 2} 86`}
										fill="none"
										stroke={theme.hueCss(340, { l: 0.7, a: 0.12 + (contributions[i] ?? 0) * 0.4 })}
										stroke-width="1.4"
									/>
								{/each}
							</svg>
						</div>
						<div class="pool-result">
							<canvas class="vstrip wide" use:strip={run.pooled}></canvas>
							<div class="pool-meta no-select">
								<span class="pm-big">v̄</span>
								<span class="tabular">384-d · mean of {run.seq}</span>
							</div>
						</div>
					{:else if stage === 'normalize'}
						<div class="norm-row">
							<div class="norm-cell">
								<canvas class="vstrip wide" use:strip={run.pooledRaw}></canvas>
								<span class="tabular no-select">‖v‖ = {rawNorm.toFixed(3)}</span>
							</div>
							<span class="norm-arrow no-select">÷ ‖v‖ →</span>
							<div class="norm-cell">
								<canvas class="vstrip wide" use:strip={run.pooled}></canvas>
								<span class="tabular hot no-select">‖v‖ = 1.000</span>
							</div>
						</div>
					{/if}
					</div>
				{/if}
			</div>
		{/key}
	</div>
{:else}
	<div class="flow empty"></div>
{/if}

<style>
	.flow {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px calc(clamp(264px, 23vw, 336px) + 26px) 100px calc(clamp(264px, 23vw, 336px) + 92px);
		overflow: hidden;
	}
	.caption {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		margin-bottom: 6px;
	}
	.c-title {
		font-size: 13px;
		font-weight: 650;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--lab);
	}
	.c-sub {
		font-size: 11px;
		color: var(--text-subtle);
	}
	.scroller {
		width: 100%;
		max-width: 100%;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		padding-bottom: 6px;
	}
	.stage-box {
		position: relative;
		width: 100%;
	}

	/* ---------- vertical attention layout ---------- */
	.vblock {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 4px 0;
	}
	svg.varcs {
		display: block;
		flex: none;
	}
	.vcol {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 7px;
	}
	.vrow {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.vrow .dbar {
		flex: none;
		width: 64px;
	}
	.tokens-row {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		justify-content: center;
		padding: 6px 4px;
	}
	.tokens-row.wrap {
		flex-wrap: wrap;
		row-gap: 16px;
		max-width: min(760px, 100%);
		margin: 0 auto;
	}
	.tok-unit {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
	}
	.tok {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 14px;
		color: var(--text-primary);
		background: oklch(0.11 0.012 200 / 0.85);
		border: 1px solid var(--border-strong);
		padding: 5px 11px;
		border-radius: 8px;
		cursor: pointer;
		white-space: nowrap;
		transition:
			border-color 0.15s ease,
			color 0.15s ease,
			transform 0.15s ease;
	}
	.tok:hover {
		border-color: color-mix(in oklab, var(--lab) 65%, transparent);
		transform: translateY(-1px);
	}
	.tok.sel {
		border-color: var(--lab);
		color: var(--lab);
		box-shadow: 0 0 12px color-mix(in oklab, var(--lab) 35%, transparent);
	}
	.tok.special {
		color: var(--text-subtle);
		border-style: dashed;
	}
	.tok.subword {
		margin-left: -6px;
		border-left-style: dotted;
	}
	.tok-id {
		font-family: ui-monospace, Menlo, monospace;
		font-size: 9px;
		color: var(--text-subtle);
	}
	.tokens-row.tall .tok {
		font-size: 16px;
		padding: 8px 14px;
	}
	.vstrip {
		width: 16px;
		height: 120px;
		border-radius: 4px;
		border: 1px solid var(--border);
		image-rendering: pixelated;
	}
	.vstrip.small {
		height: 84px;
	}
	.vstrip.wide {
		width: 26px;
		height: 150px;
	}
	.dbar {
		width: 100%;
		max-width: 64px;
		height: 3.5px;
		border-radius: 2px;
		background: oklch(1 0 0 / 0.08);
		overflow: hidden;
	}
	.dbar i {
		display: block;
		height: 100%;
		background: var(--lab);
		border-radius: 2px;
	}
	.pool-funnel {
		margin-top: -4px;
	}
	.pool-funnel svg {
		display: block;
	}
	/* Column, so the pooled strip sits exactly under the funnel tip. */
	.pool-result {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 7px;
		margin-top: -2px;
	}
	.pool-meta {
		display: flex;
		align-items: baseline;
		gap: 7px;
		font-size: 10.5px;
		color: var(--text-subtle);
	}
	.pm-big {
		font-size: 20px;
		color: var(--lab);
		font-weight: 650;
	}
	.norm-row {
		display: flex;
		align-items: center;
		gap: 26px;
		justify-content: center;
		margin-top: 26px;
	}
	.norm-cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 7px;
		font-size: 11px;
		color: var(--text-muted);
	}
	.norm-cell .hot {
		color: var(--lab);
		font-weight: 650;
	}
	.norm-arrow {
		font-family: ui-monospace, Menlo, monospace;
		font-size: 13px;
		color: var(--text-subtle);
	}

	@media (max-width: 1100px) {
		.flow {
			padding-left: calc(clamp(240px, 30vw, 300px) + 92px);
			padding-right: calc(clamp(240px, 30vw, 300px) + 26px);
		}
	}
</style>
