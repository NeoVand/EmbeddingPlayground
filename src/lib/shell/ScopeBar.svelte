<script lang="ts">
	/**
	 * The scope bar — a slim strip along the bottom showing the selected
	 * point's vitals inline. Pulling it up opens the full inspector drawer
	 * (stats · token×dimension heatmap · dimension bars). Opening the drawer
	 * shrinks the docks (via --dock-bottom on the shell) so it never hides
	 * dock content behind an overlay.
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
		<header class="d-head no-select">
			<span class="sel-chip"><IconTarget size={12} />{label ?? '—'}</span>
			{#if modelShortName}<span class="model tabular">{modelShortName}</span>{/if}
			{#if result?.text}
				<span class="src" title={result.text}>{result.text}</span>
			{:else}
				<span class="src empty">{hint}</span>
			{/if}
			<span class="scale-chip tabular" title="Diverging value scale: teal negative, dark zero, amber positive">
				<i>−</i><span class="grad"></span><i>+</i>
			</span>
			<button class="icon-btn" onclick={toggle} aria-label="Collapse inspector">
				<IconChevronDown size={15} />
			</button>
		</header>

		<div class="panes">
			<div class="stats">
				{#if stats}
					<div class="tiles">
						<div class="tile">
							<span class="tl no-select">dims</span>
							<span class="tv tabular">{stats.dim}</span>
						</div>
						<div class="tile">
							<span class="tl no-select">‖v‖</span>
							<span class="tv tabular">{stats.normVal.toFixed(3)}</span>
						</div>
					</div>
					<dl>
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
				{:else}
					<p class="empty-note">{hint}</p>
				{/if}
			</div>
			<div class="heat"><TokenHeatmap {result} /></div>
			<div class="bars"><DimensionBars vector={result?.vector ?? null} /></div>
		</div>
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

	/* ---------------- drawer ---------------- */
	.drawer {
		position: absolute;
		left: 78px;
		right: 12px;
		bottom: 12px;
		height: var(--inspector-h, min(300px, 38vh));
		z-index: 25;
		display: flex;
		flex-direction: column;
		padding: 10px 16px 14px;
	}
	.d-head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding-bottom: 9px;
		margin-bottom: 10px;
		border-bottom: 1px solid oklch(1 0 0 / 0.07);
		flex-shrink: 0;
	}
	.model {
		font-size: 10px;
		color: var(--text-subtle);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-weight: 600;
		flex-shrink: 0;
	}
	.src {
		flex: 1;
		min-width: 0;
		font-size: 11.5px;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.src.empty {
		color: var(--text-subtle);
	}
	.scale-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 10px;
		color: var(--text-subtle);
		flex-shrink: 0;
	}
	.scale-chip .grad {
		width: 56px;
		height: 6px;
		border-radius: 3px;
		background: linear-gradient(
			90deg,
			var(--accent),
			oklch(0.22 0.01 200) 50%,
			var(--contrast)
		);
	}
	.panes {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: 200px 1.6fr 1fr;
		gap: 0;
	}
	.stats {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
		overflow-y: auto;
		padding-right: 16px;
	}
	.tiles {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.tile {
		border: 1px solid var(--border);
		border-radius: 9px;
		padding: 7px 10px;
		background: oklch(1 0 0 / 0.025);
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.tl {
		font-size: 9px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-subtle);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tv {
		font-size: 16px;
		font-weight: 650;
		color: var(--lab);
	}
	dl {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
	}
	.srow {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-size: 11.5px;
		padding: 2.5px 1px;
	}
	dt {
		color: var(--text-subtle);
	}
	dd {
		margin: 0;
		color: var(--text-secondary);
	}
	.heat {
		border-left: 1px solid oklch(1 0 0 / 0.07);
		padding: 0 16px;
		min-width: 0;
		min-height: 0;
	}
	.bars {
		border-left: 1px solid oklch(1 0 0 / 0.07);
		padding-left: 16px;
		min-width: 0;
		min-height: 0;
	}

	@media (max-width: 1000px) {
		.panes {
			grid-template-columns: 1.5fr 1fr;
		}
		.stats {
			display: none;
		}
		.heat {
			border-left: none;
			padding-left: 0;
		}
	}
</style>
