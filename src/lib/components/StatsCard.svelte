<script lang="ts">
	import type { EmbeddingResult } from '$lib/models/types.js';
	import { norm } from '$lib/math/similarity.js';
	import { absMax, mean, stddev } from '$lib/math/stats.js';

	interface Props {
		result: EmbeddingResult | null;
		modelShortName?: string;
		title?: string;
		emptyText?: string;
	}
	let { result, modelShortName, title = 'Embedding', emptyText = 'Awaiting input.' }: Props = $props();

	const stats = $derived.by(() => {
		if (!result) return null;
		return {
			dim: result.dim,
			tokens: result.tokens?.length ?? null,
			elapsedMs: result.elapsedMs,
			normVal: norm(result.vector),
			meanVal: mean(result.vector),
			stdVal: stddev(result.vector),
			absMaxVal: absMax(result.vector)
		};
	});
</script>

<div class="card glass">
	<div class="head">
		<span class="eyebrow">{title}</span>
		{#if modelShortName}<span class="model tabular">{modelShortName}</span>{/if}
	</div>
	{#if stats}
		<dl>
			<div class="row">
				<dt>dimensions</dt>
				<dd class="tabular">{stats.dim}</dd>
			</div>
			<div class="row">
				<dt>‖vector‖</dt>
				<dd class="tabular">{stats.normVal.toFixed(4)}</dd>
			</div>
			<div class="row">
				<dt>mean</dt>
				<dd class="tabular">{stats.meanVal.toExponential(2)}</dd>
			</div>
			<div class="row">
				<dt>std-dev</dt>
				<dd class="tabular">{stats.stdVal.toFixed(4)}</dd>
			</div>
			<div class="row">
				<dt>max |·|</dt>
				<dd class="tabular">{stats.absMaxVal.toFixed(4)}</dd>
			</div>
			{#if stats.tokens != null}
				<div class="row">
					<dt>tokens</dt>
					<dd class="tabular">{stats.tokens}</dd>
				</div>
			{/if}
			<div class="row">
				<dt>elapsed</dt>
				<dd class="tabular">{stats.elapsedMs > 0 ? `${stats.elapsedMs.toFixed(1)} ms` : 'cache'}</dd>
			</div>
		</dl>
	{:else}
		<p class="empty">{emptyText}</p>
	{/if}
</div>

<style>
	.card {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.model {
		font-size: 10px;
		color: var(--accent);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		font-weight: 600;
	}
	dl {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 0;
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-size: 12px;
	}
	dt {
		color: var(--text-muted);
	}
	dd {
		margin: 0;
		color: var(--text-primary);
	}
	.empty {
		font-size: 12px;
		color: var(--text-subtle);
		font-style: italic;
		margin: 4px 0 0;
	}
</style>
