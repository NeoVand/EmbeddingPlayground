<script lang="ts">
	/**
	 * A collapsible section inside a dock. Long editable lists (examples,
	 * sentences, chunks) live here folded by default, so the dock reads as a
	 * few calm lines instead of a wall of text — the data is on the canvas.
	 */

	import type { Snippet } from 'svelte';
	import { IconChevronDown, IconChevronRight } from '$lib/icons.js';

	interface Props {
		label: string;
		count?: string;
		open?: boolean;
		/** Controls rendered next to the toggle (add / upload buttons). */
		extra?: Snippet;
		children: Snippet;
	}
	let { label, count, open = $bindable(false), extra, children }: Props = $props();
</script>

<div class="sect">
	<div class="sect-head">
		<button class="tog no-select" onclick={() => (open = !open)} aria-expanded={open}>
			{#if open}<IconChevronDown size={13} />{:else}<IconChevronRight size={13} />{/if}
			<span class="lbl">{label}</span>
			{#if count}<span class="cnt tabular">{count}</span>{/if}
		</button>
		{#if extra}
			<span class="extra">{@render extra()}</span>
		{/if}
	</div>
	{#if open}
		<div class="body">{@render children()}</div>
	{/if}
</div>

<style>
	.sect {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.sect-head {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.tog {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 6px;
		background: transparent;
		border: none;
		padding: 3px 2px;
		cursor: pointer;
		color: var(--text-subtle);
		border-radius: 6px;
		text-align: left;
	}
	.tog:hover {
		color: var(--text-secondary);
	}
	.lbl {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.cnt {
		font-size: 10px;
		color: var(--text-subtle);
		margin-left: auto;
	}
	.extra {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
</style>
