<script lang="ts">
	import type { EmbeddingResult } from '$lib/models/types.js';
	import { theme } from '$lib/theme/theme.svelte.js';
	import { divergingRgb } from '$lib/theme/palette.js';
	import { absMax } from '$lib/math/stats.js';

	interface Props {
		result: EmbeddingResult | null;
		onRefresh?: () => void;
		emptyText?: string;
	}
	let { result: r, onRefresh, emptyText = 'Awaiting input.' }: Props = $props();

	let canvas = $state<HTMLCanvasElement | undefined>();
	let container = $state<HTMLDivElement | undefined>();
	let hover = $state<{ token: number; dim: number; value: number } | null>(null);

	const hasTokens = $derived(!!r?.tokens && !!r?.tokenVectors);
	let cellH = $state(0);
	let cellW = $state(0);
	let offsetX = $state(0);

	$effect(() => {
		if (!canvas || !r || !r.tokens || !r.tokenVectors) return;
		void theme.tokens;
		draw();
	});

	function draw() {
		if (!r?.tokens || !r?.tokenVectors || !canvas || !container) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const dpr = window.devicePixelRatio || 1;

		const tokens = r.tokens;
		const dim = r.dim;
		const data = r.tokenVectors;

		const cssW = container.clientWidth;
		const labelW = 92;
		const matW = Math.max(80, cssW - labelW - 8);
		const cssH = Math.max(120, Math.min(420, tokens.length * 16));
		const rowH = cssH / tokens.length;

		canvas.style.width = cssW + 'px';
		canvas.style.height = cssH + 'px';
		canvas.width = cssW * dpr;
		canvas.height = cssH * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		cellH = rowH;
		cellW = matW / dim;
		offsetX = labelW;

		ctx.clearRect(0, 0, cssW, cssH);
		const max = absMax(data) || 1;

		for (let i = 0; i < tokens.length; i++) {
			const y = i * rowH;
			const base = i * dim;
			for (let d = 0; d < dim; d++) {
				const v = data[base + d] / max;
				const [r0, g0, b0] = divergingRgb(v, theme.primitives);
				ctx.fillStyle = `rgb(${(r0 * 255) | 0},${(g0 * 255) | 0},${(b0 * 255) | 0})`;
				ctx.fillRect(labelW + d * cellW, y, Math.max(1, cellW + 0.5), rowH);
			}
		}

		ctx.fillStyle = getCss('--text-secondary');
		ctx.font = '11px Inter, sans-serif';
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'right';
		for (let i = 0; i < tokens.length; i++) {
			const y = i * rowH + rowH / 2;
			const t = tokens[i];
			const label = displayToken(t.text);
			ctx.fillStyle = t.isSpecial ? getCss('--text-subtle') : getCss('--text-secondary');
			ctx.fillText(label, labelW - 6, y);
		}

		ctx.strokeStyle = getCss('--border');
		ctx.lineWidth = 0.5;
		for (let i = 1; i < tokens.length; i++) {
			const y = i * rowH;
			ctx.beginPath();
			ctx.moveTo(labelW, y);
			ctx.lineTo(cssW, y);
			ctx.stroke();
		}
	}

	function getCss(varName: string): string {
		return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#999';
	}

	function displayToken(s: string): string {
		const trimmed = s.replace(/^\s+/, '·').replace(/▁/g, '·');
		return trimmed.length > 11 ? trimmed.slice(0, 10) + '…' : trimmed;
	}

	function onmove(e: MouseEvent) {
		if (!r?.tokens || !r?.tokenVectors || !canvas) return;
		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		if (x < offsetX || cellH === 0 || cellW === 0) {
			hover = null;
			return;
		}
		const t = Math.floor(y / cellH);
		const d = Math.floor((x - offsetX) / cellW);
		if (t < 0 || t >= r.tokens.length || d < 0 || d >= r.dim) {
			hover = null;
			return;
		}
		hover = { token: t, dim: d, value: r.tokenVectors[t * r.dim + d] };
	}

	function onleave() {
		hover = null;
	}
</script>

<div class="card glass" bind:this={container}>
	<div class="head">
		<span class="eyebrow">Token × Dimension</span>
		{#if hover && r?.tokens}
			<span class="hover tabular">
				<span class="tk">{displayToken(r.tokens[hover.token].text)}</span>
				<span class="sep">·</span>
				<span class="d">d{hover.dim}</span>
				<span class="sep">·</span>
				<span class="v" style:color={hover.value < 0 ? 'var(--accent)' : 'var(--contrast)'}>
					{hover.value > 0 ? '+' : ''}{hover.value.toFixed(4)}
				</span>
			</span>
		{:else if r?.tokens}
			<span class="meta tabular">{r.tokens.length} tokens × {r.dim} dims</span>
		{/if}
	</div>
	{#if hasTokens}
		<div class="canvas-wrap">
			<canvas bind:this={canvas} onmousemove={onmove} onmouseleave={onleave}></canvas>
		</div>
	{:else if r && onRefresh}
		<p class="empty">
			Cached embedding — token-level vectors weren't kept.
			<button class="refresh" onclick={onRefresh}>refresh</button>
		</p>
	{:else if r}
		<p class="empty">Per-token vectors not exposed by this backend.</p>
	{:else}
		<p class="empty">{emptyText}</p>
	{/if}
</div>

<style>
	.card {
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-height: 0;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}
	.meta {
		font-size: 10px;
		color: var(--text-subtle);
	}
	.hover {
		font-size: 10px;
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.hover .tk {
		color: var(--text-primary);
		font-weight: 500;
	}
	.hover .d {
		color: var(--text-muted);
	}
	.hover .sep {
		color: var(--text-subtle);
	}
	.canvas-wrap {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
	canvas {
		display: block;
	}
	.empty {
		font-size: 12px;
		color: var(--text-subtle);
		font-style: italic;
	}
	.refresh {
		display: inline-block;
		margin-left: 6px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 3px;
		color: var(--text-secondary);
		font-size: 10px;
		padding: 2px 6px;
		cursor: pointer;
	}
	.refresh:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
</style>
