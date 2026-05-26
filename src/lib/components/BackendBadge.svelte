<script lang="ts">
	import { playground } from '$lib/stores/playground.svelte.js';

	const status = $derived(playground.modelLoad?.status ?? 'idle');
	const progress = $derived(playground.modelLoad?.progress ?? 0);
	const message = $derived(playground.modelLoad?.message ?? '');
	const rationale = $derived(playground.selection?.rationale ?? '—');
</script>

<div class="badge" data-status={status} title={message}>
	<div class="dot"></div>
	<div class="col">
		<span class="eyebrow">Backend</span>
		<span class="name">{rationale}</span>
	</div>
	{#if status === 'loading'}
		<div class="bar">
			<div class="fill" style:width={`${Math.round(progress * 100)}%`}></div>
		</div>
	{/if}
</div>

<style>
	.badge {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 12px;
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: 11px;
		color: var(--text-secondary);
		min-width: 180px;
		position: relative;
		overflow: hidden;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--text-subtle);
		box-shadow: 0 0 0 0 transparent;
	}
	.badge[data-status='ready'] .dot {
		background: var(--good);
		box-shadow: 0 0 8px var(--good);
	}
	.badge[data-status='loading'] .dot {
		background: var(--accent);
		box-shadow: 0 0 8px var(--accent);
		animation: pulse 1.2s ease-in-out infinite;
	}
	.badge[data-status='error'] .dot {
		background: var(--bad);
		box-shadow: 0 0 8px var(--bad);
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
	}
	.col {
		display: flex;
		flex-direction: column;
		line-height: 1.15;
	}
	.name {
		font-weight: 500;
		color: var(--text-primary);
		font-variant-numeric: tabular-nums;
	}
	.bar {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--border);
	}
	.fill {
		height: 100%;
		background: var(--accent);
		transition: width 0.2s ease;
	}
</style>
