<script lang="ts">
	/**
	 * The scope bar — a slim strip along the bottom showing the selected
	 * point's vitals inline. Pulling it up opens the full inspector drawer
	 * (stats · token×dimension heatmap · dimension bars) as an overlay, so
	 * no space is permanently reserved.
	 */

	import { IconChevronDown, IconChevronUp, IconTarget } from '$lib/icons.js';
	import { norm } from '$lib/math/similarity.js';
	import { absMax, mean, stddev } from '$lib/math/stats.js';
	import type { EmbeddingResult } from '$lib/models/types.js';
	import DimensionBars from '$lib/viz/DimensionBars.svelte';
	import TokenHeatmap from '$lib/viz/TokenHeatmap.svelte';
	import { shellUI } from './shellState.svelte.js';

	interface Props {
		result: EmbeddingResult | null;
		/** Short label for what's selected — "A", "#1", a word… */
		label?: string | null;
		/** Shown when nothing is selected. */
		hint?: string;
		modelShortName?: string;
	}
	let {
		result,
		label = null,
		hint = 'Click any point in the cloud to inspect its embedding.',
		modelShortName
	}: Props = $props();

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

	function toggle() {
		shellUI.inspectorOpen = !shellUI.inspectorOpen;
	}
</script>

{#if shellUI.inspectorOpen}
	<section class="drawer glass-strong">
		<div class="stats">
			<div class="stats-head no-select">
				<span class="sel-chip"><IconTarget size={12} />{label ?? '—'}</span>
				{#if modelShortName}<span class="model tabular">{modelShortName}</span>{/if}
			</div>
			{#if stats}
				<dl>
					<div class="srow"><dt>dimensions</dt><dd class="tabular">{stats.dim}</dd></div>
					<div class="srow"><dt>‖vector‖</dt><dd class="tabular">{stats.normVal.toFixed(4)}</dd></div>
					<div class="srow"><dt>mean</dt><dd class="tabular">{stats.meanVal.toExponential(2)}</dd></div>
					<div class="srow"><dt>std-dev</dt><dd class="tabular">{stats.stdVal.toFixed(4)}</dd></div>
					<div class="srow"><dt>max |·|</dt><dd class="tabular">{stats.absMaxVal.toFixed(4)}</dd></div>
					{#if stats.tokens != null}
						<div class="srow"><dt>tokens</dt><dd class="tabular">{stats.tokens}</dd></div>
					{/if}
					<div class="srow">
						<dt>elapsed</dt>
						<dd class="tabular">{stats.elapsedMs > 0 ? `${stats.elapsedMs.toFixed(1)} ms` : 'cached'}</dd>
					</div>
				</dl>
				{#if result?.text}
					<p class="src-text">{result.text}</p>
				{/if}
			{:else}
				<p class="empty-note">{hint}</p>
			{/if}
		</div>
		<div class="heat"><TokenHeatmap {result} /></div>
		<div class="bars"><DimensionBars vector={result?.vector ?? null} /></div>
		<button class="close-tab no-select" onclick={toggle} aria-label="Collapse inspector">
			<IconChevronDown size={14} />
		</button>
	</section>
{:else}
	<button class="bar glass no-select" onclick={toggle} aria-label="Open inspector">
		{#if result && stats}
			<span class="sel-chip"><IconTarget size={12} />{label ?? '·'}</span>
			{#if modelShortName}<span class="v tabular dim-txt">{modelShortName}</span><span class="sep">·</span>{/if}
			<span class="v tabular">{stats.dim}d</span>
			<span class="sep">·</span>
			<span class="v tabular">‖v‖ {stats.normVal.toFixed(3)}</span>
			{#if stats.tokens != null}
				<span class="sep">·</span>
				<span class="v tabular">{stats.tokens} tokens</span>
			{/if}
			<span class="sep">·</span>
			<span class="v tabular">{stats.elapsedMs > 0 ? `${stats.elapsedMs.toFixed(0)} ms` : 'cached'}</span>
			<span class="spark" aria-hidden="true">
				{#each { length: 24 } as _, i (i)}
					<i style:height={`${Math.min(12, Math.abs(result.vector[Math.floor((i / 24) * result.vector.length)] ?? 0) / (stats.absMaxVal || 1) * 12 + 1.5)}px`}></i>
				{/each}
			</span>
		{:else}
			<span class="hint-txt">{hint}</span>
		{/if}
		<span class="grow"></span>
		<span class="open-lbl">inspect</span>
		<IconChevronUp size={14} />
	</button>
{/if}

<style>
	.bar {
		position: absolute;
		left: 78px;
		right: 12px;
		bottom: 12px;
		height: 38px;
		z-index: 25;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 14px;
		font-size: 11.5px;
		color: var(--text-secondary);
		cursor: pointer;
		text-align: left;
	}
	.bar:hover {
		border-color: var(--border-strong);
	}
	.sel-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 2px 9px;
		border-radius: 7px;
		background: var(--lab-dim);
		color: var(--lab);
		font-weight: 650;
		font-size: 11px;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.v {
		color: var(--text-muted);
		white-space: nowrap;
	}
	.dim-txt {
		color: var(--text-subtle);
	}
	.sep {
		color: var(--text-subtle);
		opacity: 0.6;
	}
	.spark {
		display: inline-flex;
		align-items: flex-end;
		gap: 1.5px;
		height: 14px;
		margin-left: 6px;
	}
	.spark i {
		width: 2px;
		border-radius: 1px;
		background: var(--lab);
		opacity: 0.65;
	}
	.hint-txt {
		color: var(--text-subtle);
		font-size: 12px;
	}
	.grow {
		flex: 1;
	}
	.open-lbl {
		font-size: 10px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-subtle);
	}

	.drawer {
		position: absolute;
		left: 78px;
		right: 12px;
		bottom: 12px;
		height: min(320px, 44vh);
		z-index: 25;
		display: grid;
		grid-template-columns: 220px 1.5fr 1fr;
		gap: 18px;
		padding: 14px 16px;
	}
	.stats {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
		overflow-y: auto;
	}
	.stats-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.model {
		font-size: 10px;
		color: var(--lab);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-weight: 600;
	}
	dl {
		display: flex;
		flex-direction: column;
		gap: 3px;
		margin: 0;
	}
	.srow {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-size: 12px;
		padding: 2px 0;
	}
	dt {
		color: var(--text-muted);
	}
	dd {
		margin: 0;
		color: var(--text-primary);
	}
	.src-text {
		font-size: 11px;
		line-height: 1.5;
		color: var(--text-subtle);
		margin: 4px 0 0;
		border-top: 1px solid oklch(1 0 0 / 0.06);
		padding-top: 8px;
		display: -webkit-box;
		-webkit-line-clamp: 4;
		line-clamp: 4;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.heat,
	.bars {
		min-width: 0;
		min-height: 0;
	}
	.close-tab {
		position: absolute;
		top: -12px;
		right: 18px;
		width: 34px;
		height: 24px;
		border-radius: 8px 8px 0 0;
		border: 1px solid var(--border-strong);
		border-bottom: none;
		background: inherit;
		color: var(--text-muted);
		cursor: pointer;
		display: grid;
		place-items: center;
	}
	.close-tab:hover {
		color: var(--text-primary);
	}

	@media (max-width: 1000px) {
		.drawer {
			grid-template-columns: 1.4fr 1fr;
		}
		.stats {
			display: none;
		}
	}
</style>
