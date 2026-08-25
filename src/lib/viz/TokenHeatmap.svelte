<script lang="ts">
	/**
	 * token × dimension canvas heatmap. Chrome-free — the inspector drawer
	 * provides the panel; this fills whatever box it's given and redraws on
	 * resize and theme change.
	 */

	import type { EmbeddingResult } from '$lib/models/types.js';
	import { theme } from '$lib/theme/theme.svelte.js';
	import { divergingRgb } from '$lib/theme/palette.js';
	import { absMax } from '$lib/math/stats.js';
	import { onMount } from 'svelte';

	interface Props {
		result: EmbeddingResult | null;
	}
	let { result: r }: Props = $props();

	let canvas = $state<HTMLCanvasElement | undefined>();
	let container = $state<HTMLDivElement | undefined>();
	let hover = $state<{ token: number; dim: number; value: number } | null>(null);

	const hasTokens = $derived(!!r?.tokens && !!r?.tokenVectors);
	let cellH = $state(0);
	let cellW = $state(0);
	let offsetX = $state(0);

	onMount(() => {
		const ro = new ResizeObserver(() => draw());
		if (container) ro.observe(container);
		return () => ro.disconnect();
	});

	// Follow the newest tokens: when the token count grows (trajectory
	// playback appends words), glide the view to the bottom of the matrix so
	// the arriving rows stay in frame. Only when the content overflows.
	let lastTokenCount = 0;
	function followNewestTokens() {
		if (!container || !r?.tokens) return;
		const n = r.tokens.length;
		if (n === lastTokenCount) return;
		lastTokenCount = n;
		requestAnimationFrame(() => {
			if (!container) return;
			if (container.scrollHeight > container.clientHeight + 4) {
				container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
			}
		});
	}

	$effect(() => {
		void r;
		void theme.tokens;
		draw();
		followNewestTokens();
	});

	function draw() {
		if (!canvas || !container) return;
		if (!r?.tokens || !r?.tokenVectors) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const dpr = window.devicePixelRatio || 1;

		const tokens = r.tokens;
		const dim = r.dim;
		const data = r.tokenVectors;

		const cssW = container.clientWidth;
		const availH = container.clientHeight;
		if (cssW < 40 || availH < 40) return;
		const labelW = 92;
		const matW = Math.max(80, cssW - labelW - 4);
		// Rows fit the available height when possible; floor at 9px/row and let
		// the wrap scroll for very long token sequences.
		const rowH = Math.min(18, Math.max(9, availH / tokens.length));
		const cssH = rowH * tokens.length;

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
				ctx.fillRect(labelW + d * cellW, y + 0.5, Math.max(1, cellW + 0.5), rowH - 1);
			}
		}

		// When rows get shorter than the type, label every Nth token instead of
		// letting labels overlap into mush.
		const labelStep = rowH >= 11 ? 1 : Math.ceil(12 / rowH);
		ctx.font = '10.5px Inter, sans-serif';
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'right';
		for (let i = 0; i < tokens.length; i += labelStep) {
			const y = i * rowH + rowH / 2;
			const t = tokens[i];
			ctx.fillStyle = t.isSpecial ? theme.tokens.textSubtle : theme.tokens.textSecondary;
			ctx.fillText(displayToken(t.text), labelW - 8, y);
		}
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
</script>

<div class="pane">
	<div class="head no-select">
		<span class="eyebrow">Token × Dimension</span>
		{#if hover && r?.tokens}
			<span class="hover tabular">
				<span class="tk">{displayToken(r.tokens[hover.token].text)}</span>
				<span class="sep">·</span>
				<span class="d">d{hover.dim}</span>
				<span class="sep">·</span>
				<span style:color={hover.value < 0 ? 'var(--accent)' : 'var(--contrast)'}>
					{hover.value > 0 ? '+' : ''}{hover.value.toFixed(4)}
				</span>
			</span>
		{:else if r?.tokens}
			<span class="meta tabular">{r.tokens.length} tokens × {r.dim} dims</span>
		{/if}
	</div>
	<div class="canvas-wrap" bind:this={container}>
		{#if hasTokens}
			<canvas bind:this={canvas} onmousemove={onmove} onmouseleave={() => (hover = null)}></canvas>
		{:else if r}
			<p class="empty-note">Per-token vectors aren't exposed by this backend — the pooled vector on the right is still live.</p>
		{:else}
			<p class="empty-note">Nothing selected.</p>
		{/if}
	</div>
</div>

<style>
	.pane {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-height: 0;
		min-width: 0;
		height: 100%;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
		flex-shrink: 0;
	}
	.meta,
	.hover {
		font-size: 10px;
		color: var(--text-subtle);
	}
	.hover {
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
	.canvas-wrap {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
	}
	canvas {
		display: block;
	}
</style>
