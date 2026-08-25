<script lang="ts">
	/**
	 * The one lab layout. Full-bleed cloud, floating input/results docks,
	 * scope bar inspector, optional guide. Sets the lab's identity hue as
	 * `--lab` so every shared element (chips, tracks, dock accents) colors
	 * itself without per-lab CSS.
	 */

	import type { Component, Snippet } from 'svelte';
	import type { EmbeddingResult } from '$lib/models/types.js';
	import { playground } from '$lib/stores/playground.svelte.js';
	import { theme } from '$lib/theme/theme.svelte.js';
	import Dock from './Dock.svelte';
	import Guide, { type GuideStep } from './Guide.svelte';
	import ScopeBar from './ScopeBar.svelte';
	import { labMeta } from './labsMeta.js';
	import { shellUI } from './shellState.svelte.js';
	import type { LabId } from '$lib/stores/playground.svelte.js';

	interface Props {
		labId: LabId;
		cloud: Snippet;
		dock: Snippet;
		dockTitle: string;
		dockHeader?: Snippet;
		results?: Snippet;
		resultsTitle?: string;
		resultsIcon?: Component<{ size?: number | string }>;
		resultsHeader?: Snippet;
		/** Selection feeding the scope bar / inspector drawer. */
		selected?: EmbeddingResult | null;
		selectedLabel?: string | null;
		scopeHint?: string;
		guide?: GuideStep[];
	}
	let {
		labId,
		cloud,
		dock,
		dockTitle,
		dockHeader,
		results,
		resultsTitle = 'Results',
		resultsIcon,
		resultsHeader,
		selected = null,
		selectedLabel = null,
		scopeHint,
		guide
	}: Props = $props();

	const meta = $derived(labMeta(labId));
	const labCss = $derived(theme.hueCss(meta.hue));
	const ResultsIcon = $derived(resultsIcon ?? meta.icon);
</script>

<div
	class="shell"
	class:inspector-open={shellUI.inspectorOpen}
	style:--lab={labCss}
	style:--lab-dim={`color-mix(in oklab, ${labCss} 15%, transparent)`}
>
	<div class="cloud-layer">
		{@render cloud()}
	</div>

	<Dock side="left" title={dockTitle} icon={meta.icon} bind:open={shellUI.leftOpen} header={dockHeader}>
		{@render dock()}
	</Dock>

	{#if results}
		<Dock side="right" title={resultsTitle} icon={ResultsIcon} bind:open={shellUI.rightOpen} header={resultsHeader}>
			{@render results()}
		</Dock>
	{/if}

	<ScopeBar
		result={selected}
		label={selectedLabel}
		hint={scopeHint}
		modelShortName={playground.model.shortName}
	/>

	{#if guide && shellUI.guideOpen}
		<Guide steps={guide} />
	{/if}
</div>

<style>
	.shell {
		position: absolute;
		inset: 0;
		overflow: hidden;
		/* Geometry shared with the docks: when the inspector drawer opens,
		   --dock-bottom grows and the docks shrink to sit above it — the
		   drawer never occludes dock content. */
		--inspector-h: min(300px, 38vh);
		--dock-bottom: 62px;
	}
	.shell.inspector-open {
		--dock-bottom: calc(var(--inspector-h) + 24px);
	}
	.cloud-layer {
		position: absolute;
		inset: 0;
		z-index: 0;
	}
</style>
