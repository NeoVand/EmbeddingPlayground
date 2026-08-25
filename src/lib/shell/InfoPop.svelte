<script lang="ts">
	/**
	 * The ⓘ teaching popover. A tiny trigger that opens a rich card:
	 * definition, formula, and a one-line "why you care". Replaces the
	 * always-on explainer prose of the old UI.
	 */

	import type { Snippet } from 'svelte';
	import { IconInfo } from '$lib/icons.js';

	interface Props {
		title: string;
		children: Snippet;
	}
	let { title, children }: Props = $props();

	let open = $state(false);
	let btn = $state<HTMLButtonElement | undefined>();
	let pop = $state<HTMLDivElement | undefined>();
	let pos = $state({ top: 0, left: 0 });

	function toggle() {
		if (!open && btn) {
			const r = btn.getBoundingClientRect();
			// Fixed positioning so the card escapes scrolling docks; clamp to viewport.
			const width = 280;
			const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.left - width / 2 + r.width / 2));
			const top = Math.min(window.innerHeight - 60, r.bottom + 8);
			pos = { top, left };
		}
		open = !open;
	}

	function onWindowDown(e: MouseEvent) {
		if (!open) return;
		const t = e.target as Node;
		if (btn?.contains(t) || pop?.contains(t)) return;
		open = false;
	}
</script>

<svelte:window onmousedown={onWindowDown} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<button class="i-btn" class:on={open} bind:this={btn} onclick={toggle} aria-label="Explain: {title}">
	<IconInfo size={12} />
</button>

{#if open}
	<div class="pop glass-strong" bind:this={pop} style:top={`${pos.top}px`} style:left={`${pos.left}px`}>
		<header class="no-select">{title}</header>
		<div class="body">{@render children()}</div>
	</div>
{/if}

<style>
	.i-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 17px;
		height: 17px;
		border-radius: 50%;
		border: none;
		background: transparent;
		color: var(--text-subtle);
		cursor: pointer;
		padding: 0;
		vertical-align: middle;
		transition: color 0.15s ease;
	}
	.i-btn:hover,
	.i-btn.on {
		color: var(--lab, var(--accent));
	}
	.pop {
		position: fixed;
		width: 280px;
		z-index: 90;
		padding: 12px 14px;
	}
	header {
		font-size: 12.5px;
		font-weight: 650;
		color: var(--text-primary);
		margin-bottom: 6px;
	}
	.body {
		font-size: 12px;
		line-height: 1.6;
		color: var(--text-secondary);
	}
	.body :global(code) {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 11px;
		background: oklch(1 0 0 / 0.07);
		padding: 1px 5px;
		border-radius: 4px;
		color: var(--text-muted);
	}
	.body :global(b) {
		color: var(--text-primary);
		font-weight: 600;
	}
	.body :global(p) {
		margin: 0 0 6px;
	}
	.body :global(p:last-child) {
		margin-bottom: 0;
	}
</style>
