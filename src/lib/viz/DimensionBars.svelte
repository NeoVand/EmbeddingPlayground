<script lang="ts">
	/**
	 * Signed per-dimension bar chart of a pooled vector. Chrome-free; fills
	 * its box, redraws on resize and theme change.
	 */

	import { theme } from '$lib/theme/theme.svelte.js';
	import { divergingRgb } from '$lib/theme/palette.js';
	import { absMax } from '$lib/math/stats.js';
	import { onMount } from 'svelte';

	interface Props {
		vector: Float32Array | null;
	}
	let { vector }: Props = $props();

	let canvas = $state<HTMLCanvasElement | undefined>();
	let container = $state<HTMLDivElement | undefined>();
	let hover = $state<{ dim: number; value: number } | null>(null);

	onMount(() => {
		const ro = new ResizeObserver(() => draw());
		if (container) ro.observe(container);
		return () => ro.disconnect();
	});

	$effect(() => {
		void vector;
		void theme.tokens;
		draw();
	});

	function draw() {
		if (!vector || !canvas || !container) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const dpr = window.devicePixelRatio || 1;
		const cssW = container.clientWidth;
		const cssH = container.clientHeight;
		if (cssW < 40 || cssH < 30) return;
		canvas.style.width = cssW + 'px';
		canvas.style.height = cssH + 'px';
		canvas.width = cssW * dpr;
		canvas.height = cssH * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, cssW, cssH);

		const dim = vector.length;
		const v = vector;
		const max = absMax(v) || 1;
		const cw = cssW / dim;
		const midY = cssH / 2;
		const halfH = cssH / 2 - 2;

		ctx.strokeStyle = theme.tokens.border;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, midY);
		ctx.lineTo(cssW, midY);
		ctx.stroke();

		for (let d = 0; d < dim; d++) {
			const t = v[d] / max;
			const barH = Math.max(0.5, Math.abs(t) * halfH);
			const y = t >= 0 ? midY - barH : midY;
			const [rr, gg, bb] = divergingRgb(t, theme.primitives);
			ctx.fillStyle = `rgb(${(rr * 255) | 0},${(gg * 255) | 0},${(bb * 255) | 0})`;
			ctx.fillRect(d * cw, y, Math.max(0.6, cw - 0.5), barH);
		}
	}

	function onmove(e: MouseEvent) {
		if (!vector || !canvas) return;
		const rect = canvas.getBoundingClientRect();
		const cw = rect.width / vector.length;
		const d = Math.floor((e.clientX - rect.left) / cw);
		if (d < 0 || d >= vector.length) {
			hover = null;
			return;
		}
		hover = { dim: d, value: vector[d] };
	}
</script>

<div class="pane">
	<div class="head no-select">
		<span class="eyebrow">Dimensions</span>
		{#if hover}
			<span class="hover tabular">
				<span class="d">d{hover.dim}</span>
				<span class="sep">·</span>
				<span style:color={hover.value < 0 ? 'var(--accent)' : 'var(--contrast)'}>
					{hover.value > 0 ? '+' : ''}{hover.value.toFixed(4)}
				</span>
			</span>
		{:else if vector}
			<span class="meta tabular">{vector.length} dims · max |·| {absMax(vector).toFixed(3)}</span>
		{/if}
	</div>
	<div class="canvas-wrap" bind:this={container}>
		{#if vector}
			<canvas bind:this={canvas} onmousemove={onmove} onmouseleave={() => (hover = null)}></canvas>
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
	.hover .d {
		color: var(--text-primary);
	}
	.canvas-wrap {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
	canvas {
		display: block;
	}
</style>
