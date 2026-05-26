<script lang="ts">
	/**
	 * The "what's actually inside this embedding" inspector. Sits across the
	 * bottom of every lab, hooked up to whichever point the user last clicked.
	 *
	 * Three panes:
	 *   • StatsCard      — dim, norm, mean, std-dev, elapsed
	 *   • TokenHeatmap   — per-token × dim activations (when the model exposes
	 *                      token-level vectors; Gemma's sentence_embedding
	 *                      head collapses these and the heatmap shows a hint
	 *                      to refresh).
	 *   • DimensionBars  — signed bar chart of the pooled vector.
	 */

	import type { EmbeddingResult } from '$lib/models/types.js';
	import StatsCard from '$lib/components/StatsCard.svelte';
	import TokenHeatmap from '$lib/viz/TokenHeatmap.svelte';
	import DimensionBars from '$lib/viz/DimensionBars.svelte';

	interface Props {
		result: EmbeddingResult | null;
		modelShortName?: string;
		title?: string;
		emptyText?: string;
		onRefresh?: () => void;
	}
	let {
		result,
		modelShortName,
		title = 'Selected',
		emptyText = 'Click a point in the cloud to inspect its embedding.',
		onRefresh
	}: Props = $props();
</script>

<div class="row">
	<div class="cell stats">
		<StatsCard {result} {modelShortName} {title} {emptyText} />
	</div>
	<div class="cell heatmap">
		<TokenHeatmap {result} {onRefresh} {emptyText} />
	</div>
	<div class="cell bars">
		<DimensionBars vector={result?.vector ?? null} {emptyText} />
	</div>
</div>

<style>
	.row {
		display: grid;
		grid-template-columns: 240px 1.4fr 1fr;
		gap: 10px;
		height: 100%;
		min-height: 0;
	}
	.cell {
		min-height: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.cell :global(.card) {
		flex: 1;
		min-height: 0;
	}
</style>
