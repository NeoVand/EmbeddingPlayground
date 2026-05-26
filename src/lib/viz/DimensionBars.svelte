<script lang="ts">
	import { theme } from '$lib/theme/theme.svelte.js';
	import { divergingRgb } from '$lib/theme/palette.js';
	import { absMax } from '$lib/math/stats.js';

	interface Props {
		vector: Float32Array | null;
		emptyText?: string;
	}
	let { vector, emptyText = 'Awaiting input.' }: Props = $props();

	let canvas = $state<HTMLCanvasElement | undefined>();
	let container = $state<HTMLDivElement | undefined>();
	let hover = $state<{ dim: number; value: number } | null>(null);

	$effect(() => {
		if (!canvas || !vector) return;
		void theme.tokens;
		draw();
	});

	function draw() {
		if (!vector || !canvas || !container) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const dpr = window.devicePixelRatio || 1;
		const cssW = container.clientWidth;
		const cssH = 96;
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

		ctx.strokeStyle = getCss('--border');
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

	function getCss(varName: string): string {
		return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#999';
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

	function onleave() {
		hover = null;
	}
</script>

<div class="card glass" bind:this={container}>
	<div class="head">
		<span class="eyebrow">Dimensions</span>
		{#if hover}
			<span class="hover tabular">
				<span class="d">d{hover.dim}</span>
				<span class="sep">·</span>
				<span class="v" style:color={hover.value < 0 ? 'var(--accent)' : 'var(--contrast)'}>
					{hover.value > 0 ? '+' : ''}{hover.value.toFixed(4)}
				</span>
			</span>
		{:else if vector}
			<span class="meta tabular">{vector.length} dims · max |·| = {absMax(vector).toFixed(3)}</span>
		{/if}
	</div>
	{#if vector}
		<canvas bind:this={canvas} onmousemove={onmove} onmouseleave={onleave}></canvas>
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
	.hover .d {
		color: var(--text-primary);
	}
	.hover .sep {
		color: var(--text-subtle);
	}
	canvas {
		display: block;
		width: 100%;
	}
	.empty {
		font-size: 12px;
		color: var(--text-subtle);
		font-style: italic;
	}
</style>
