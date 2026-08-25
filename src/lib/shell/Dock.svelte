<script lang="ts">
	/**
	 * A floating glass dock — the input (left) or results (right) panel of a
	 * lab. Collapsible to a slim icon pill so the cloud always wins.
	 */

	import type { Component, Snippet } from 'svelte';
	import { IconChevronLeft, IconChevronRight } from '$lib/icons.js';

	interface Props {
		side?: 'left' | 'right';
		title: string;
		icon: Component<{ size?: number | string }>;
		open?: boolean;
		/** Extra header controls (e.g. an add button), right-aligned. */
		header?: Snippet;
		children: Snippet;
	}
	let { side = 'left', title, icon: Icon, open = $bindable(true), header, children }: Props = $props();
</script>

{#if open}
	<aside class="dock glass {side}">
		<header class="no-select">
			<span class="d-ic"><Icon size={15} /></span>
			<span class="d-title">{title}</span>
			<span class="d-extra">{#if header}{@render header()}{/if}</span>
			<button class="icon-btn" onclick={() => (open = false)} aria-label="Collapse panel">
				{#if side === 'left'}<IconChevronLeft size={14} />{:else}<IconChevronRight size={14} />{/if}
			</button>
		</header>
		<div class="body">
			{@render children()}
		</div>
	</aside>
{:else}
	<button class="pill glass {side}" onclick={() => (open = true)} aria-label="Open {title}">
		<Icon size={17} />
	</button>
{/if}

<style>
	.dock {
		position: absolute;
		top: 12px;
		width: clamp(264px, 23vw, 336px);
		max-height: calc(100% - 12px - var(--dock-bottom, 62px));
		z-index: 20;
		display: flex;
		flex-direction: column;
		transition: max-height 0.28s ease;
	}
	.dock.left {
		left: 78px;
	}
	.dock.right {
		right: 12px;
	}
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 8px 8px 14px;
		flex-shrink: 0;
	}
	.d-ic {
		display: grid;
		place-items: center;
		color: var(--lab);
	}
	.d-title {
		font-size: 10.5px;
		font-weight: 650;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.d-extra {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 2px 14px 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.pill {
		position: absolute;
		top: 12px;
		z-index: 20;
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
		color: var(--lab);
		cursor: pointer;
		border-radius: 12px;
	}
	.pill.left {
		left: 78px;
	}
	.pill.right {
		right: 12px;
	}
	.pill:hover {
		border-color: color-mix(in oklab, var(--lab) 55%, transparent);
	}

	@media (max-width: 1100px) {
		.dock {
			width: clamp(240px, 30vw, 300px);
		}
	}
</style>
