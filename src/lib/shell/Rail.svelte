<script lang="ts">
	/**
	 * The icon rail — replaces the old header + tab bar entirely. App mark,
	 * five labs (big icons, hover tooltips), then the model chip and guide
	 * toggle at the bottom. 56px wide, always visible.
	 */

	import { IconGuide, IconModel } from '$lib/icons.js';
	import { playground } from '$lib/stores/playground.svelte.js';
	import { theme } from '$lib/theme/theme.svelte.js';
	import { LABS } from './labsMeta.js';
	import { shellUI } from './shellState.svelte.js';

	const load = $derived(playground.modelLoad);
	const modelState = $derived.by<'ready' | 'loading' | 'error'>(() => {
		if (load?.status === 'error') return 'error';
		if (playground.modelReady) return 'ready';
		return 'loading';
	});
</script>

<nav class="rail glass" aria-label="Labs">
	<!-- The mark: the app's own data cube with two points inside. Plain glyph,
	     no fill or border, so it never reads as a pressed button. -->
	<div class="mark no-select" title="Embedding Playground" aria-hidden="true">
		<svg viewBox="0 0 24 24" fill="none">
			<g stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" opacity="0.55">
				<path d="M12 2.6 L20.2 7.3 V16.7 L12 21.4 L3.8 16.7 V7.3 Z" />
				<path d="M3.8 7.3 L12 12 L20.2 7.3 M12 12 V21.4" />
			</g>
			<circle cx="9.2" cy="9.1" r="1.7" fill="var(--accent)" />
			<circle cx="15.4" cy="15.6" r="1.4" fill="var(--contrast)" opacity="0.9" />
		</svg>
	</div>

	<div class="labs" role="tablist" aria-label="Labs">
		{#each LABS as l (l.id)}
			{@const active = playground.lab === l.id}
			<button
				class="lab-btn"
				class:active
				role="tab"
				aria-selected={active}
				style:--c={theme.hueCss(l.hue)}
				onclick={() => (playground.lab = l.id)}
			>
				<l.icon size={21} />
				<span class="tip glass-strong no-select">
					<b>{l.name}</b>
					<em>{l.tagline}</em>
				</span>
			</button>
		{/each}
	</div>

	<div class="spacer"></div>

	<button
		class="lab-btn guide-btn"
		class:active={shellUI.guideOpen}
		onclick={() => (shellUI.guideOpen = !shellUI.guideOpen)}
		aria-label="Lab guide"
	>
		<IconGuide size={19} />
		<span class="tip glass-strong no-select"><b>Guide</b><em>What to try in this lab</em></span>
	</button>

	<button
		class="model-btn"
		class:err={modelState === 'error'}
		onclick={() => (playground.modelManagerOpen = true)}
		aria-label="Models"
	>
		<IconModel size={19} />
		<span class="dot {modelState}"></span>
		<span class="tip glass-strong no-select">
			<b>{playground.model.shortName}</b>
			<em>{playground.selection?.rationale ?? 'Models — pick, download, switch'}</em>
		</span>
	</button>
</nav>

<style>
	.rail {
		position: absolute;
		left: 12px;
		top: 12px;
		bottom: 12px;
		width: 54px;
		z-index: 40;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 10px 0;
		gap: 6px;
	}
	.mark {
		width: 38px;
		height: 38px;
		display: grid;
		place-items: center;
		color: var(--text-muted);
		margin-bottom: 10px;
		flex-shrink: 0;
	}
	.mark svg {
		width: 24px;
		height: 24px;
	}
	.labs {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.lab-btn,
	.model-btn {
		position: relative;
		width: 38px;
		height: 38px;
		display: grid;
		place-items: center;
		border: none;
		background: transparent;
		border-radius: 10px;
		color: var(--text-subtle);
		cursor: pointer;
		transition:
			background 0.15s ease,
			color 0.15s ease;
		flex-shrink: 0;
	}
	.lab-btn:hover,
	.model-btn:hover {
		background: oklch(1 0 0 / 0.06);
		color: var(--text-secondary);
	}
	.lab-btn.active {
		background: color-mix(in oklab, var(--c, var(--accent)) 15%, transparent);
		color: var(--c, var(--accent));
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--c, var(--accent)) 30%, transparent);
	}
	.guide-btn.active {
		background: color-mix(in oklab, var(--accent) 15%, transparent);
		color: var(--accent);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--accent) 30%, transparent);
	}
	.spacer {
		flex: 1;
	}
	.model-btn .dot {
		position: absolute;
		right: 7px;
		top: 7px;
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	.model-btn .dot.ready {
		background: var(--good);
		box-shadow: 0 0 6px color-mix(in oklab, var(--good) 70%, transparent);
	}
	.model-btn .dot.loading {
		background: var(--warn);
		animation: pulse 1.1s ease-in-out infinite;
	}
	.model-btn .dot.error {
		background: var(--bad);
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.35;
		}
	}

	/* Hover tooltip flying out to the right. */
	.tip {
		position: absolute;
		left: calc(100% + 12px);
		top: 50%;
		transform: translateY(-50%) translateX(-4px);
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 7px 11px;
		white-space: nowrap;
		pointer-events: none;
		opacity: 0;
		transition:
			opacity 0.12s ease,
			transform 0.12s ease;
		z-index: 50;
		text-align: left;
	}
	.tip b {
		font-size: 12.5px;
		font-weight: 600;
		color: var(--text-primary);
	}
	.tip em {
		font-size: 11px;
		font-style: normal;
		color: var(--text-muted);
	}
	.lab-btn:hover .tip,
	.model-btn:hover .tip {
		opacity: 1;
		transform: translateY(-50%) translateX(0);
	}
</style>
