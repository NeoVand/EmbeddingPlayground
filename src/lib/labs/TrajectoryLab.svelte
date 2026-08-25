<script lang="ts">
	/**
	 * Trajectory — "How does meaning build up?"
	 *
	 * Every prefix word_1..k of the sentence is embedded independently and the
	 * cloud connects them in order — the sentence's path through latent space.
	 * The play button replays the path word by word.
	 */

	import { IconPause, IconPlay } from '$lib/icons.js';
	import { cosine } from '$lib/math/similarity.js';
	import type { EmbeddingResult } from '$lib/models/types.js';
	import { playground } from '$lib/stores/playground.svelte.js';
	import InfoPop from '$lib/shell/InfoPop.svelte';
	import LabShell from '$lib/shell/LabShell.svelte';
	import SemanticCloud, { type CloudPoint } from '$lib/viz/SemanticCloud.svelte';
	import { createBatchEmbed } from './embed.svelte.js';
	import { createLabState } from './labState.svelte.js';

	const lab = createLabState('trajectory', {
		sentence: 'The food was great until I got food poisoning.'
	});

	const presets = [
		{ label: 'smooth', sentence: 'A red-tailed hawk circling thermal updrafts above the canyon.', note: 'Tightly themed — each word adds detail to the same scene.' },
		{ label: 'twist', sentence: 'The food was great until I got food poisoning.', note: 'Watch for the lurch when sentiment flips.' },
		{ label: 'reveal', sentence: 'She opened the door and saw the body.', note: 'Innocuous start, dramatic ending.' },
		{ label: 'homonym A', sentence: 'He walked to the bank to fish for trout.', note: 'Disambiguates toward the riverbank meaning.' },
		{ label: 'homonym B', sentence: 'He walked to the bank to deposit a check.', note: 'Same opening, financial meaning instead.' },
		{ label: 'negation', sentence: 'I really love this movie not at all.', note: '"not" drags the trajectory across the sentiment axis.' }
	];

	interface Prefix {
		k: number;
		word: string;
		text: string;
	}
	const prefixes = $derived.by<Prefix[]>(() => {
		const words = lab.sentence.match(/\S+/g) ?? [];
		return words.map((w, i) => ({
			k: i + 1,
			word: w.replace(/[.,;:!?]+$/, ''),
			text: words.slice(0, i + 1).join(' ')
		}));
	});

	const batch = createBatchEmbed({ delay: 350, flushEvery: 1 });
	$effect(() => {
		void playground.modelId;
		batch.run(prefixes.map((p) => ({ id: `p${p.k}`, text: p.text })));
	});

	function vecOf(k: number): Float32Array | null {
		return batch.results.get(`p${k}`)?.vector ?? null;
	}

	let userSelectedK = $state<number | null>(null);
	// Reset manual selection when the sentence changes.
	$effect(() => {
		void lab.sentence;
		userSelectedK = null;
		stopPlayback();
	});

	// The "lurch" — the biggest per-step jump.
	const biggestJumpK = $derived.by<number | null>(() => {
		let bestK = -1;
		let bestDist = 0;
		for (let i = 1; i < prefixes.length; i++) {
			const a = vecOf(prefixes[i - 1].k);
			const b = vecOf(prefixes[i].k);
			if (!a || !b || a.length !== b.length) continue;
			const dist = 1 - cosine(a, b);
			if (dist > bestDist) {
				bestDist = dist;
				bestK = prefixes[i].k;
			}
		}
		return bestK > 0 ? bestK : null;
	});

	// ---------- playback ----------
	let playK = $state<number | null>(null);
	let playTimer: ReturnType<typeof setInterval> | null = null;
	const playing = $derived(playK != null);

	function startPlayback() {
		stopPlayback();
		playK = 1;
		playTimer = setInterval(() => {
			if (playK == null) return;
			if (playK >= prefixes.length) {
				stopPlayback();
				return;
			}
			playK = playK + 1;
		}, 650);
	}
	function stopPlayback() {
		if (playTimer) clearInterval(playTimer);
		playTimer = null;
		playK = null;
	}
	$effect(() => {
		return () => {
			if (playTimer) clearInterval(playTimer);
		};
	});

	const visibleK = $derived(playK ?? prefixes.length);

	const selectedK = $derived(playK ?? userSelectedK ?? biggestJumpK);
	const selectedId = $derived(selectedK != null ? `p${selectedK}` : null);
	const selectedResult = $derived.by<EmbeddingResult | null>(() =>
		selectedK != null ? (batch.results.get(`p${selectedK}`) ?? null) : null
	);
	const selectedPrefix = $derived(prefixes.find((p) => p.k === selectedK) ?? null);

	const points = $derived.by<CloudPoint[]>(() => {
		const out: CloudPoint[] = [];
		const N = prefixes.length;
		for (const p of prefixes) {
			if (p.k > visibleK) continue;
			const v = vecOf(p.k);
			if (!v) continue;
			const tFrac = (p.k - 1) / Math.max(1, N - 1);
			const hue = 220 - 190 * tFrac;
			const isEdge = p.k === 1 || p.k === N;
			const isLurch = p.k === biggestJumpK;
			out.push({
				id: `p${p.k}`,
				vector: v,
				hue,
				label: p.word,
				hoverText: `[${p.k}] ${p.text}`,
				size: isEdge || isLurch ? 1.05 : 0.8
			});
		}
		return out;
	});

	const pathIds = $derived(
		prefixes.filter((p) => p.k <= visibleK && vecOf(p.k)).map((p) => `p${p.k}`)
	);

	function selectPoint(id: string) {
		const m = /^p(\d+)$/.exec(id);
		if (m) userSelectedK = Number(m[1]);
	}

	const displacements = $derived.by(() => {
		const out: { k: number; word: string; dist: number }[] = [];
		for (let i = 1; i < prefixes.length; i++) {
			const a = vecOf(prefixes[i - 1].k);
			const b = vecOf(prefixes[i].k);
			if (!a || !b || a.length !== b.length) continue;
			out.push({ k: prefixes[i].k, word: prefixes[i].word, dist: 1 - cosine(a, b) });
		}
		return out;
	});
	const maxDist = $derived(
		displacements.length > 0 ? Math.max(...displacements.map((d) => d.dist), 0.001) : 1
	);
	const totalPath = $derived(displacements.reduce((s, d) => s + d.dist, 0));

	const guide = [
		{
			title: 'A sentence is a walk',
			body: 'Each prefix "word₁ … wordₖ" is embedded on its own, then connected in order. Cool colors are the start of the sentence, warm colors the end. Press play to watch the walk.',
			apply: () => {
				lab.sentence = presets[0].sentence;
				setTimeout(startPlayback, 1200);
			},
			applyLabel: 'Play a smooth walk'
		},
		{
			title: 'The lurch',
			body: 'When one word flips the meaning of everything before it, the path jumps. "…until I got food poisoning" yanks the sentence across sentiment space — that word is auto-highlighted.',
			apply: () => (lab.sentence = presets[1].sentence),
			applyLabel: 'Load the twist'
		},
		{
			title: 'Same start, two endings',
			body: 'Run "homonym A" and then "homonym B". Both begin "He walked to the bank" — identical prefixes, identical path — until fishing or finance pulls them apart.',
			apply: () => (lab.sentence = presets[3].sentence),
			applyLabel: 'Load homonym A'
		},
		{
			title: 'Negation is hard',
			body: '"I really love this movie not at all." Does "not" drag the path back across the sentiment axis, or does the model shrug? This is a known weak spot for embeddings — see for yourself.',
			apply: () => (lab.sentence = presets[5].sentence),
			applyLabel: 'Load negation'
		}
	];
</script>

<LabShell
	labId="trajectory"
	dockTitle="Sentence"
	resultsTitle="Displacement"
	selected={selectedResult}
	selectedLabel={selectedPrefix ? `+${selectedPrefix.k} ${selectedPrefix.word}` : null}
	scopeHint="Click any word along the path to inspect that prefix's embedding."
	{guide}
>
	{#snippet cloud()}
		<SemanticCloud {points} pathPoints={pathIds} {selectedId} onPointClick={selectPoint} />
	{/snippet}

	{#snippet dock()}
		<div>
			<div class="fld-label">
				<span>Sentence
					<InfoPop title="What am I looking at?">
						<p>Each prefix <code>word₁ … wordₖ</code> is embedded independently and projected into one shared PCA basis.</p>
						<p>The polyline connects them in order — the sentence's <b>path</b> through embedding space.</p>
					</InfoPop>
				</span>
				{#if batch.loading}
					<span class="busy tabular">{batch.done}/{batch.total}</span>
				{:else if prefixes.length > 1}
					<span class="sum tabular">{prefixes.length} steps · Σ {totalPath.toFixed(3)}</span>
				{/if}
			</div>
			<textarea class="fld" bind:value={lab.sentence} rows="3" spellcheck="false"
				placeholder="Type a sentence — watch its meaning build up word by word."></textarea>
		</div>

		<button class="play-btn no-select" onclick={() => (playing ? stopPlayback() : startPlayback())}
			disabled={prefixes.length < 2 || batch.loading}>
			{#if playing}<IconPause size={14} /> stop{:else}<IconPlay size={14} /> play the path{/if}
		</button>

		<div class="hairline"></div>

		<div class="fld-label"><span>Curated sentences</span></div>
		<div class="preset-grid">
			{#each presets as p (p.label)}
				<button class="preset" onclick={() => (lab.sentence = p.sentence)} title={p.note}>
					<span class="p-label">{p.label}</span>
					<span class="p-snippet">{p.sentence}</span>
				</button>
			{/each}
		</div>
	{/snippet}

	{#snippet results()}
		<div class="fld-label">
			<span>Per-word displacement
				<InfoPop title="Displacement">
					<p>Cosine <b>distance</b> (1 − cos) between prefix k−1 and prefix k: how far the sentence's meaning moved when that word arrived.</p>
					<p>Big bars are the words that changed everything.</p>
				</InfoPop>
			</span>
		</div>
		{#if displacements.length === 0}
			<p class="empty-note">
				{#if batch.loading}Embedding prefixes…{:else}Type a sentence with at least two words.{/if}
			</p>
		{:else}
			<ol class="disps">
				{#each displacements as d (d.k)}
					<li class:sel={d.k === selectedK}>
						<button class="disp-row" onclick={() => (userSelectedK = d.k)}>
							<span class="step tabular">+{d.k}</span>
							<span class="word">{d.word}</span>
							<div class="track"><div class="fill" class:big={d.dist > 0.2} style:width={`${(d.dist / maxDist) * 100}%`}></div></div>
							<span class="dist tabular" class:big={d.dist > 0.2}>{d.dist.toFixed(3)}</span>
						</button>
					</li>
				{/each}
			</ol>
		{/if}
	{/snippet}
</LabShell>

<style>
	.busy {
		color: var(--lab);
	}
	.sum {
		font-size: 10px;
		color: var(--text-subtle);
		text-transform: none;
		letter-spacing: 0;
	}
	.play-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		background: var(--lab-dim);
		border: 1px solid color-mix(in oklab, var(--lab) 50%, transparent);
		color: var(--lab);
		font-size: 12.5px;
		font-weight: 600;
		border-radius: 9px;
		padding: 8px 12px;
		cursor: pointer;
		transition: background 0.15s ease;
	}
	.play-btn:hover:not(:disabled) {
		background: color-mix(in oklab, var(--lab) 24%, transparent);
	}
	.play-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.preset-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 5px;
	}
	.preset {
		background: oklch(1 0 0 / 0.035);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 7px 9px;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 2px;
		text-align: left;
		transition: border-color 0.15s ease;
	}
	.preset:hover {
		border-color: color-mix(in oklab, var(--lab) 55%, transparent);
	}
	.p-label {
		font-size: 9.5px;
		font-weight: 650;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-muted);
	}
	.preset:hover .p-label {
		color: var(--lab);
	}
	.p-snippet {
		font-size: 10.5px;
		color: var(--text-secondary);
		line-height: 1.35;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	ol.disps {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.disp-row {
		display: grid;
		grid-template-columns: 26px 1fr 80px 46px;
		gap: 8px;
		align-items: center;
		font-size: 11.5px;
		width: 100%;
		background: transparent;
		border: none;
		border-radius: 6px;
		padding: 3px 5px;
		cursor: pointer;
		color: inherit;
		text-align: left;
	}
	.disp-row:hover {
		background: oklch(1 0 0 / 0.05);
	}
	li.sel .disp-row {
		background: var(--lab-dim);
	}
	.step {
		font-size: 9px;
		color: var(--text-subtle);
	}
	.word {
		color: var(--text-primary);
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.fill.big {
		background: var(--contrast);
	}
	.dist {
		text-align: right;
		color: var(--text-muted);
	}
	.dist.big {
		color: var(--contrast);
		font-weight: 600;
	}
</style>
