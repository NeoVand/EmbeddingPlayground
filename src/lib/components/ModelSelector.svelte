<script lang="ts">
	import { playground } from '$lib/stores/playground.svelte.js';

	let open = $state(false);
	let rootEl = $state<HTMLDivElement | undefined>();

	const current = $derived(playground.model);
	const models = playground.models;

	function toggle() {
		open = !open;
	}

	function pick(id: string) {
		playground.modelId = id;
		open = false;
	}

	function onDocClick(e: MouseEvent) {
		if (!open || !rootEl) return;
		if (!rootEl.contains(e.target as Node)) open = false;
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}

	$effect(() => {
		if (open) {
			document.addEventListener('mousedown', onDocClick);
			document.addEventListener('keydown', onKey);
			return () => {
				document.removeEventListener('mousedown', onDocClick);
				document.removeEventListener('keydown', onKey);
			};
		}
	});
</script>

<div class="wrap" bind:this={rootEl}>
	<button class="trigger" onclick={toggle} aria-haspopup="listbox" aria-expanded={open}>
		<span class="eyebrow no-select">Model</span>
		<span class="name">{current.shortName}</span>
		<span class="meta tabular no-select">{current.dimensions}d · {current.approxParamsM}M</span>
		<span class="caret no-select" class:open>▾</span>
	</button>

	{#if open}
		<div class="menu glass" role="listbox">
			{#each models as m (m.id)}
				{@const active = m.id === playground.modelId}
				<button
					class="opt"
					class:active
					role="option"
					aria-selected={active}
					onclick={() => pick(m.id)}
				>
					<div class="row1">
						<span class="opt-name">{m.shortName}</span>
						<span class="opt-meta tabular">{m.dimensions}d · {m.approxParamsM}M</span>
					</div>
					<div class="row2">
						<span class="full-name">{m.name}</span>
						<span class="dl tabular">~{m.approxDownloadMB} MB</span>
					</div>
					<div class="desc">{m.description}</div>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
	}
	.trigger {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 6px;
		cursor: pointer;
		color: var(--text-secondary);
		min-width: 220px;
		transition: all 0.15s ease;
	}
	.trigger:hover {
		border-color: var(--border-strong);
		color: var(--text-primary);
	}
	.eyebrow {
		font-size: 9px;
		color: var(--text-subtle);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		font-weight: 600;
	}
	.name {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-primary);
		flex: 1;
		text-align: left;
	}
	.meta {
		font-size: 9px;
		color: var(--text-muted);
		letter-spacing: 0.04em;
	}
	.caret {
		color: var(--text-subtle);
		font-size: 10px;
		transition: transform 0.15s ease;
	}
	.caret.open {
		transform: rotate(180deg);
	}
	.menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		min-width: 360px;
		max-width: 440px;
		z-index: 100;
		padding: 4px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 70vh;
		overflow-y: auto;
		animation: menu-in 0.12s ease;
	}
	@keyframes menu-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.opt {
		text-align: left;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 5px;
		padding: 8px 10px;
		cursor: pointer;
		color: var(--text-secondary);
		display: flex;
		flex-direction: column;
		gap: 2px;
		transition: all 0.1s ease;
	}
	.opt:hover {
		background: var(--surface-1);
		color: var(--text-primary);
	}
	.opt.active {
		background: var(--accent-glow);
		border-color: var(--accent);
	}
	.row1 {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.row2 {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.opt-name {
		font-size: 13px;
		font-weight: 700;
		color: var(--text-primary);
	}
	.opt.active .opt-name {
		color: var(--accent-strong);
	}
	.opt-meta {
		font-size: 10px;
		color: var(--text-muted);
		letter-spacing: 0.04em;
	}
	.full-name {
		font-size: 10px;
		color: var(--text-subtle);
		font-family: ui-monospace, SFMono-Regular, monospace;
	}
	.dl {
		font-size: 9px;
		color: var(--text-subtle);
		letter-spacing: 0.04em;
	}
	.desc {
		font-size: 11px;
		color: var(--text-muted);
		line-height: 1.45;
		margin-top: 3px;
	}
	.opt.active .desc {
		color: var(--text-secondary);
	}
</style>
