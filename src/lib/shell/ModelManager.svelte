<script lang="ts">
	/**
	 * The model manager — the local-model superpower made visible. Every
	 * registry model as a card: dims, params, download size, pooling,
	 * backend badges, and live state (active / downloading / cached /
	 * available). Doubles as the first-run screen.
	 */

	import {
		IconCheck,
		IconClose,
		IconDownload,
		IconDownloaded,
		IconGpu,
		IconLoader,
		IconServer
	} from '$lib/icons.js';
	import { MODELS } from '$lib/models/registry.js';
	import type { ModelInfo } from '$lib/models/types.js';
	import { playground } from '$lib/stores/playground.svelte.js';

	let cachedIds = $state<Set<string>>(new Set());

	// Best-effort: transformers.js stores model files in the browser Cache
	// Storage — scan request URLs for registry repos to mark what's already
	// on disk. Soft-fails to "unknown" without the API.
	async function refreshCached() {
		const found = new Set<string>();
		try {
			const names = await caches.keys();
			for (const name of names) {
				const c = await caches.open(name);
				const keys = await c.keys();
				for (const req of keys) {
					for (const m of MODELS) {
						if (m.hf && req.url.includes(m.hf.repo)) found.add(m.id);
					}
				}
			}
		} catch {
			/* Cache API unavailable — leave empty */
		}
		cachedIds = found;
	}

	$effect(() => {
		if (playground.modelManagerOpen) void refreshCached();
	});

	// Re-scan when the active model finishes loading, so its card flips to ✓.
	$effect(() => {
		if (playground.modelReady && playground.modelManagerOpen) void refreshCached();
	});

	const load = $derived(playground.modelLoad);

	function stateOf(m: ModelInfo): 'active' | 'loading' | 'error' | 'cached' | 'available' {
		if (m.id === playground.modelId) {
			if (load?.status === 'error') return 'error';
			return playground.modelReady ? 'active' : 'loading';
		}
		return cachedIds.has(m.id) ? 'cached' : 'available';
	}

	function pick(m: ModelInfo) {
		playground.modelId = m.id;
	}

	function close() {
		playground.modelManagerOpen = false;
	}

	function deviceBadge(m: ModelInfo): string {
		if (m.preferredDevice === 'wasm') return 'WASM';
		return playground.availability?.webgpu === false ? 'WASM' : 'WebGPU';
	}

	const avail = $derived(playground.availability);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && playground.modelManagerOpen && close()} />

{#if playground.modelManagerOpen}
	<div
		class="overlay"
		role="presentation"
		onclick={(e) => e.target === e.currentTarget && close()}
	>
		<div class="panel glass-strong" role="dialog" aria-modal="true" aria-label="Models" tabindex="-1">
			<header class="no-select">
				<div class="head-txt">
					<h2>{playground.firstRun ? 'Pick a model to begin' : 'Models'}</h2>
					<p>
						{playground.firstRun
							? 'Everything runs on your machine — the model downloads once, then embeds locally in your browser.'
							: 'On-device embedding models. Downloaded weights are cached by your browser.'}
					</p>
				</div>
				<button class="icon-btn" onclick={close} aria-label="Close"><IconClose size={16} /></button>
			</header>

			<div class="grid">
				{#each MODELS as m (m.id)}
					{@const st = stateOf(m)}
					<button class="card" class:on={st === 'active' || st === 'loading'} onclick={() => pick(m)}>
						<div class="row1">
							<span class="nm">{m.shortName}</span>
							<span class="state {st}">
								{#if st === 'active'}<IconCheck size={13} /> active
								{:else if st === 'loading'}
									<span class="spin"><IconLoader size={12} /></span>
									{load?.progress != null ? `${Math.round(load.progress * 100)}%` : 'loading'}
								{:else if st === 'error'}failed
								{:else if st === 'cached'}<IconDownloaded size={13} /> ready
								{:else}<IconDownload size={13} /> {m.approxDownloadMB} MB{/if}
							</span>
						</div>
						<div class="specs tabular no-select">
							{m.dimensions}d · {m.approxParamsM}M · {m.pooling.replace('_', '-')} pool
						</div>
						<p class="desc">{m.description}</p>
						<div class="badges no-select">
							<span class="bdg gpu"><IconGpu size={10} />{deviceBadge(m)}</span>
							{#if m.ollama}<span class="bdg"><IconServer size={10} />Ollama</span>{/if}
							{#if m.matryoshkaDims}<span class="bdg">Matryoshka</span>{/if}
							{#if m.prefixes}<span class="bdg">Prefixes</span>{/if}
						</div>
						{#if st === 'loading' && load?.progress != null}
							<div class="track dl-track"><div class="fill" style:width={`${load.progress * 100}%`}></div></div>
						{/if}
					</button>
				{/each}
			</div>

			<footer class="no-select">
				<div class="backends tabular">
					<span class:ok={avail?.webgpu}>WebGPU {avail ? (avail.webgpu ? '✓' : '—') : '…'}</span>
					<span class="sep">·</span>
					<span class:ok={avail?.wasm}>WASM {avail ? (avail.wasm ? '✓' : '—') : '…'}</span>
					<span class="sep">·</span>
					<span class:ok={avail?.ollama}>
						Ollama {avail ? (avail.ollama ? `✓ ${avail.ollamaVersion ?? ''}` : 'not detected') : '…'}
					</span>
				</div>
				<label class="pref">
					<span>backend</span>
					<select bind:value={playground.preference}>
						<option value="auto">auto</option>
						<option value="transformers">HuggingFace</option>
						<option value="ollama">Ollama</option>
					</select>
				</label>
			</footer>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 80;
		background: oklch(0.05 0.008 200 / 0.55);
		backdrop-filter: blur(6px);
		display: grid;
		place-items: center;
		padding: 24px;
	}
	.panel {
		width: min(880px, 100%);
		max-height: min(680px, 92vh);
		display: flex;
		flex-direction: column;
		padding: 20px 22px 16px;
	}
	header {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 14px;
	}
	.head-txt {
		flex: 1;
	}
	h2 {
		margin: 0 0 3px;
		font-size: 18px;
		font-weight: 650;
		letter-spacing: -0.01em;
	}
	header p {
		margin: 0;
		font-size: 12.5px;
		color: var(--text-muted);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 10px;
		overflow-y: auto;
		min-height: 0;
		padding: 2px;
	}
	.card {
		position: relative;
		text-align: left;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: oklch(1 0 0 / 0.025);
		padding: 12px 14px;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 5px;
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
		color: inherit;
		font: inherit;
	}
	.card:hover {
		border-color: var(--border-strong);
		background: oklch(1 0 0 / 0.045);
	}
	.card.on {
		border-color: color-mix(in oklab, var(--accent) 55%, transparent);
		background: color-mix(in oklab, var(--accent) 9%, transparent);
	}
	.row1 {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.nm {
		font-size: 13.5px;
		font-weight: 650;
		color: var(--text-primary);
	}
	.state {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 10.5px;
		font-variant-numeric: tabular-nums;
		color: var(--text-subtle);
	}
	.state.active {
		color: var(--good);
	}
	.state.loading {
		color: var(--accent);
	}
	.state.error {
		color: var(--bad);
	}
	.state.cached {
		color: var(--text-muted);
	}
	.spin {
		display: inline-grid;
		place-items: center;
		animation: rot 1s linear infinite;
	}
	@keyframes rot {
		to {
			transform: rotate(360deg);
		}
	}
	.specs {
		font-size: 10.5px;
		color: var(--text-subtle);
	}
	.desc {
		margin: 0;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--text-muted);
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 2px;
	}
	.bdg {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: 5px;
		border: 1px solid var(--border);
		color: var(--text-muted);
	}
	.bdg.gpu {
		color: var(--accent);
		border-color: color-mix(in oklab, var(--accent) 40%, transparent);
	}
	.dl-track {
		margin-top: 4px;
	}
	.dl-track .fill {
		background: var(--accent);
	}
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 14px;
		padding-top: 12px;
		border-top: 1px solid oklch(1 0 0 / 0.06);
	}
	.backends {
		font-size: 11px;
		color: var(--text-subtle);
		display: flex;
		gap: 8px;
	}
	.backends .ok {
		color: var(--text-muted);
	}
	.backends .sep {
		opacity: 0.5;
	}
	.pref {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 10.5px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-subtle);
	}
	.pref select {
		background: oklch(1 0 0 / 0.05);
		border: 1px solid var(--border);
		border-radius: 7px;
		color: var(--text-primary);
		font-size: 12px;
		padding: 4px 8px;
	}
</style>
