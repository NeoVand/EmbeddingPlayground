<script lang="ts">
	/**
	 * Floating global activity pill, top-center. Two states:
	 *   1. Model downloading — determinate ring + filename + percent.
	 *   2. Embeds in flight — small spinner + count.
	 * Hidden when idle.
	 */

	import { IconLoader } from '$lib/icons.js';
	import { playground } from '$lib/stores/playground.svelte.js';

	const load = $derived(playground.modelLoad);
	const isModelLoading = $derived(load?.status === 'loading');
	const queueDepth = $derived(playground.embedQueueDepth);
	const visible = $derived(playground.isBusy);

	const pct = $derived.by(() => {
		if (isModelLoading && load?.progress != null) return Math.round(load.progress * 100);
		return null;
	});

	const text = $derived.by(() => {
		if (isModelLoading) {
			const f = load?.file ?? load?.message ?? 'loading model';
			const lastSlash = f.lastIndexOf('/');
			const name = lastSlash >= 0 ? f.slice(lastSlash + 1) : f;
			return name.length > 42 ? name.slice(0, 41) + '…' : name;
		}
		return queueDepth === 1 ? 'embedding…' : `embedding · ${queueDepth} in flight`;
	});
</script>

{#if visible}
	<div class="pill glass-strong no-select">
		<span class="spin"><IconLoader size={13} /></span>
		<span class="txt">{text}</span>
		{#if pct != null}
			<span class="pct tabular">{pct}%</span>
		{/if}
		{#if isModelLoading && load?.progress != null}
			<span class="mini-track"><span class="mini-fill" style:width={`${pct}%`}></span></span>
		{/if}
	</div>
{/if}

<style>
	.pill {
		position: absolute;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 60;
		display: flex;
		align-items: center;
		gap: 8px;
		height: 32px;
		padding: 0 14px;
		border-radius: 999px;
		font-size: 11.5px;
		color: var(--text-secondary);
		max-width: min(480px, 60vw);
	}
	.spin {
		display: grid;
		place-items: center;
		color: var(--accent);
		animation: rot 1s linear infinite;
	}
	@keyframes rot {
		to {
			transform: rotate(360deg);
		}
	}
	.txt {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.pct {
		color: var(--accent);
		font-weight: 600;
	}
	.mini-track {
		width: 64px;
		height: 3px;
		border-radius: 2px;
		background: oklch(1 0 0 / 0.1);
		overflow: hidden;
		flex-shrink: 0;
	}
	.mini-fill {
		display: block;
		height: 100%;
		background: var(--accent);
		border-radius: 2px;
		transition: width 0.25s ease;
	}
</style>
