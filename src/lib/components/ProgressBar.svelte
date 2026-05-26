<script lang="ts">
	/**
	 * Global "what is the app currently doing?" indicator. Sits at the top of
	 * the page, fades in only when something is happening.
	 *
	 * Three states it has to express:
	 *   1. Model is downloading — determinate bar with filename + percent.
	 *   2. Corpus / batch is being built — determinate bar with x/N.
	 *   3. An embed call is in flight (single short op) — indeterminate sweep.
	 *
	 * #1 wins when present; otherwise #2; otherwise #3.
	 */

	import { playground } from '$lib/stores/playground.svelte.js';

	const load = $derived(playground.modelLoad);
	const isLoading = $derived(load?.status === 'loading');
	const corpusBuilding = $derived(playground.corpusBuilding);
	const corpusProgress = $derived(playground.corpusProgress);
	const queueDepth = $derived(playground.embedQueueDepth);
	const visible = $derived(playground.isBusy);

	const mode = $derived.by<'model' | 'corpus' | 'embed' | 'idle'>(() => {
		if (isLoading) return 'model';
		if (corpusBuilding) return 'corpus';
		if (queueDepth > 0) return 'embed';
		return 'idle';
	});

	const label = $derived.by(() => {
		if (mode === 'model') {
			const file = load?.file ?? load?.message ?? 'loading model';
			const pct = load?.progress != null ? `${Math.round(load.progress * 100)}%` : '';
			return { left: cleanFile(file), right: pct };
		}
		if (mode === 'corpus') {
			return {
				left: 'Building corpus',
				right: `${Math.round(corpusProgress * 100)}%`
			};
		}
		if (mode === 'embed') {
			return {
				left: queueDepth === 1 ? 'Embedding…' : `Embedding (${queueDepth} in flight)`,
				right: `${playground.embedTotalThisSession} total`
			};
		}
		return { left: '', right: '' };
	});

	const fillPct = $derived.by(() => {
		if (mode === 'model' && load?.progress != null) return load.progress * 100;
		if (mode === 'corpus') return corpusProgress * 100;
		return 0;
	});

	function cleanFile(s: string): string {
		// "loading · onnx/model_quantized.onnx_data" → keep the filename part
		const lastSlash = s.lastIndexOf('/');
		const trimmed = lastSlash >= 0 ? s.slice(lastSlash + 1) : s;
		return trimmed.length > 50 ? trimmed.slice(0, 49) + '…' : trimmed;
	}
</script>

{#if visible}
	<div class="bar" class:indeterminate={mode === 'embed'}>
		<div class="bar-fill" style:width={`${fillPct}%`}></div>
		<div class="bar-sweep"></div>
		<div class="bar-text no-select">
			<span class="left">{label.left}</span>
			<span class="right tabular">{label.right}</span>
		</div>
	</div>
{/if}

<style>
	.bar {
		position: relative;
		height: 22px;
		background: color-mix(in oklab, var(--surface-0) 75%, transparent);
		border: 1px solid var(--border);
		border-radius: 5px;
		overflow: hidden;
		backdrop-filter: blur(10px);
	}
	.bar-fill {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			90deg,
			color-mix(in oklab, var(--accent) 65%, transparent),
			var(--accent)
		);
		opacity: 0.5;
		transition: width 0.25s ease;
	}
	/* Indeterminate sweep — shown only when bar-fill is empty (mode='embed'). */
	.bar.indeterminate .bar-fill {
		display: none;
	}
	.bar-sweep {
		display: none;
		position: absolute;
		top: 0;
		bottom: 0;
		width: 30%;
		background: linear-gradient(
			90deg,
			transparent,
			color-mix(in oklab, var(--accent) 65%, transparent),
			var(--accent),
			color-mix(in oklab, var(--accent) 65%, transparent),
			transparent
		);
		opacity: 0.55;
		animation: sweep 1.2s ease-in-out infinite;
	}
	.bar.indeterminate .bar-sweep {
		display: block;
	}
	@keyframes sweep {
		0% {
			left: -30%;
		}
		100% {
			left: 100%;
		}
	}
	.bar-text {
		position: relative;
		z-index: 1;
		display: flex;
		justify-content: space-between;
		align-items: center;
		height: 100%;
		padding: 0 10px;
		font-size: 11px;
		font-weight: 500;
		color: var(--text-primary);
	}
	.bar-text .left {
		text-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
	}
	.bar-text .right {
		color: var(--text-secondary);
		font-size: 10px;
		letter-spacing: 0.04em;
	}
</style>
