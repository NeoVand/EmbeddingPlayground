<script lang="ts">
	/**
	 * Lab stories — a short guided sequence per lab ("watch what happens
	 * when…") that drives real state via each step's apply(). Replaces the
	 * old static driver.js tour.
	 */

	import { IconChevronLeft, IconChevronRight, IconClose, IconPlay } from '$lib/icons.js';
	import { playground } from '$lib/stores/playground.svelte.js';
	import { labMeta } from './labsMeta.js';
	import { shellUI } from './shellState.svelte.js';

	export interface GuideStep {
		title: string;
		body: string;
		/** Applies the step's scenario to the lab (sets inputs, toggles, …). */
		apply?: () => void;
		applyLabel?: string;
	}

	interface Props {
		steps: GuideStep[];
	}
	let { steps }: Props = $props();

	let idx = $state(0);
	const step = $derived(steps[Math.min(idx, steps.length - 1)]);
	const meta = $derived(labMeta(playground.lab));

	// Reset to the first step whenever the lab changes.
	$effect(() => {
		void playground.lab;
		idx = 0;
	});

	function tryIt() {
		step?.apply?.();
	}
</script>

{#if step}
	<aside class="guide glass-strong" aria-label="Lab guide">
		<header class="no-select">
			<meta.icon size={14} />
			<span class="g-title">{meta.name} — guide</span>
			<span class="count tabular">{idx + 1}/{steps.length}</span>
			<button class="icon-btn" onclick={() => (shellUI.guideOpen = false)} aria-label="Close guide">
				<IconClose size={13} />
			</button>
		</header>
		<h3>{step.title}</h3>
		<p>{step.body}</p>
		<footer class="no-select">
			{#if step.apply}
				<button class="try" onclick={tryIt}>
					<IconPlay size={12} />
					{step.applyLabel ?? 'Try it'}
				</button>
			{/if}
			<span class="grow"></span>
			<button class="nav" disabled={idx === 0} onclick={() => (idx = Math.max(0, idx - 1))} aria-label="Previous step">
				<IconChevronLeft size={14} />
			</button>
			<button
				class="nav"
				disabled={idx >= steps.length - 1}
				onclick={() => (idx = Math.min(steps.length - 1, idx + 1))}
				aria-label="Next step"
			>
				<IconChevronRight size={14} />
			</button>
		</footer>
	</aside>
{/if}

<style>
	.guide {
		position: absolute;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		width: min(360px, 60vw);
		z-index: 45;
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	header {
		display: flex;
		align-items: center;
		gap: 7px;
		color: var(--lab);
	}
	.g-title {
		font-size: 10.5px;
		font-weight: 650;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.count {
		margin-left: auto;
		font-size: 10px;
		color: var(--text-subtle);
	}
	h3 {
		margin: 2px 0 0;
		font-size: 14px;
		font-weight: 650;
		color: var(--text-primary);
	}
	p {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.6;
		color: var(--text-secondary);
	}
	footer {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 6px;
	}
	.try {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: var(--lab-dim);
		border: 1px solid color-mix(in oklab, var(--lab) 50%, transparent);
		color: var(--lab);
		font-size: 12px;
		font-weight: 600;
		border-radius: 8px;
		padding: 5px 12px;
		cursor: pointer;
	}
	.try:hover {
		background: color-mix(in oklab, var(--lab) 24%, transparent);
	}
	.grow {
		flex: 1;
	}
	.nav {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 7px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
	}
	.nav:hover:not(:disabled) {
		border-color: var(--border-strong);
		color: var(--text-primary);
	}
	.nav:disabled {
		opacity: 0.3;
		cursor: default;
	}
</style>
