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
	<div class="mark no-select" title="Embedding Playground">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
			<circle cx="12" cy="12" r="2.6" />
			<circle cx="5" cy="6.5" r="1.5" />
			<circle cx="19.5" cy="5.5" r="1.5" />
			<circle cx="18.5" cy="18.5" r="1.5" />
			<circle cx="5.5" cy="18" r="1.5" />
			<path d="M6.4 7.5 L10 10.4 M18.2 6.4 L14.2 10 M17.3 17.5 L14 13.9 M6.9 17 L10.1 13.7" opacity="0.5" />
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
		width: 34px;
		height: 34px;
		border-radius: 10px;
		display: grid;
		place-items: center;
		color: var(--accent);
		background: color-mix(in oklab, var(--accent) 12%, transparent);
		border: 1px solid color-mix(in oklab, var(--accent) 35%, transparent);
		margin-bottom: 10px;
		flex-shrink: 0;
	}
	.mark svg {
		width: 20px;
		height: 20px;
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
		background: color-mix(in oklab, var(--c, var(--accent)) 14%, transparent);
		color: var(--c, var(--accent));
	}
	.lab-btn.active::before {
		content: '';
		position: absolute;
		left: -8px;
		top: 9px;
		bottom: 9px;
		width: 3px;
		border-radius: 2px;
		background: var(--c, var(--accent));
	}
	.guide-btn.active {
		background: color-mix(in oklab, var(--accent) 14%, transparent);
		color: var(--accent);
	}
	.guide-btn.active::before {
		background: var(--accent);
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
