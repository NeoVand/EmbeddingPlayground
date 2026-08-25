<script lang="ts">
	/**
	 * Trajectory — "How does meaning build up?"
	 *
	 * Every prefix word_1..k of the sentence is embedded independently and the
	 * cloud connects them in order — the sentence's path through latent space.
	 * The play button replays the path word by word.
	 */

	import { IconDims, IconPause, IconPlay } from '$lib/icons.js';
	import { cosine } from '$lib/math/similarity.js';
	import type { EmbeddingResult } from '$lib/models/types.js';
	import { playground } from '$lib/stores/playground.svelte.js';
	import InfoPop from '$lib/shell/InfoPop.svelte';
	import LabShell from '$lib/shell/LabShell.svelte';
	import SemanticCloud, { type CloudPoint } from '$lib/viz/SemanticCloud.svelte';
	import { createBatchEmbed } from './embed.svelte.js';
	import { createLabState } from './labState.svelte.js';

	const lab = createLabState('trajectory', {
		sentence: 'The food was great until I got food poisoning.',
		/** Playback speed multiplier — 450ms per step at 1×. */
		speed: 1
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
	const words = $derived(lab.sentence.match(/\S+/g) ?? []);
	/**
	 * Long texts sample every Nth word instead of every word. Prefix k costs
	 * O(k²) attention, so a 150-word paragraph means ~150 increasingly slow
	 * forward passes plus 150 scene nodes — sampling caps the path at ~48
	 * points while each sampled prefix still embeds the full text up to it.
	 */
	const MAX_STEPS = 48;
	const stride = $derived(words.length <= MAX_STEPS ? 1 : Math.ceil(words.length / MAX_STEPS));
	const prefixes = $derived.by<Prefix[]>(() => {
		const mk = (i: number): Prefix => ({
			k: i + 1,
			word: words[i].replace(/[.,;:!?—]+$/, ''),
			text: words.slice(0, i + 1).join(' ')
		});
		const out: Prefix[] = [];
		for (let i = 0; i < words.length; i += stride) out.push(mk(i));
		if (words.length > 0 && (words.length - 1) % stride !== 0) out.push(mk(words.length - 1));
		return out;
	});

	const batch = createBatchEmbed({ delay: 350, flushEvery: 4 });
	$effect(() => {
		void playground.modelId;
		batch.run(prefixes.map((p) => ({ id: `p${p.k}`, text: p.text })));
	});

	function vecOf(k: number): Float32Array | null {
		return batch.results.get(`p${k}`)?.vector ?? null;
	}

	/**
	 * The cloud waits for the COMPLETE set of prefix embeddings, then projects
	 * once and plays the path back. Progressive fill-in meant re-running PCA
	 * and re-basing the whole projection on every arrival — wobbly and heavy.
	 * During the embed phase the dock shows a real progress bar instead.
	 */
	const complete = $derived(
		prefixes.length > 0 && !batch.loading && prefixes.every((p) => batch.results.has(`p${p.k}`))
	);

	let userSelectedK = $state<number | null>(null);
	let autoPlayPending = $state(false);
	// Reset selection and queue an auto-play when a new batch starts.
	$effect(() => {
		void lab.sentence;
		userSelectedK = null;
		stopPlayback();
	});
	$effect(() => {
		if (batch.loading) autoPlayPending = true;
	});
	// The payoff moment: embeddings done → project once → play the walk.
	$effect(() => {
		if (complete && autoPlayPending) {
			autoPlayPending = false;
			startPlayback();
		}
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
	let playIdx = $state<number | null>(null);
	let playTimer: ReturnType<typeof setTimeout> | null = null;
	const playing = $derived(playIdx != null);

	// Self-rescheduling timeout (not setInterval) so dragging the speed
	// slider mid-playback takes effect on the very next step.
	function scheduleStep() {
		playTimer = setTimeout(() => {
			if (playIdx == null) return;
			if (playIdx + 1 < prefixes.length) {
				playIdx = playIdx + 1;
				scheduleStep();
			} else {
				stopPlayback();
			}
		}, 450 / (lab.speed || 1));
	}
	function startPlayback() {
		stopPlayback();
		if (!complete || prefixes.length < 2) return;
		playIdx = 0;
		scheduleStep();
	}
	function stopPlayback() {
		if (playTimer) clearTimeout(playTimer);
		playTimer = null;
		playIdx = null;
	}
	$effect(() => {
		return () => {
			if (playTimer) clearTimeout(playTimer);
		};
	});

	const visibleK = $derived(
		playIdx != null && prefixes.length > 0
			? prefixes[Math.min(playIdx, prefixes.length - 1)].k
			: Number.MAX_SAFE_INTEGER
	);

	const selectedK = $derived(
		playIdx != null && prefixes.length > 0
			? prefixes[Math.min(playIdx, prefixes.length - 1)].k
			: (userSelectedK ?? biggestJumpK)
	);
	const selectedId = $derived(selectedK != null ? `p${selectedK}` : null);
	const selectedResult = $derived.by<EmbeddingResult | null>(() =>
		selectedK != null ? (batch.results.get(`p${selectedK}`) ?? null) : null
	);
	const selectedPrefix = $derived(prefixes.find((p) => p.k === selectedK) ?? null);

	// On long paths, labeling every word turns into overlapping mush and 40+
	// DOM labels — thin to ~24, always keeping endpoints, the lurch, and the
	// selection.
	const labelEvery = $derived(Math.max(1, Math.ceil(prefixes.length / 24)));

	const points = $derived.by<CloudPoint[]>(() => {
		const out: CloudPoint[] = [];
		if (!complete) return out;
		const N = prefixes.length;
		const lastK = prefixes[N - 1]?.k;
		for (let idx = 0; idx < N; idx++) {
			const p = prefixes[idx];
			if (p.k > visibleK) continue;
			const v = vecOf(p.k);
			if (!v) continue;
			const tFrac = idx / Math.max(1, N - 1);
			const hue = 220 - 190 * tFrac;
			const isEdge = p.k === 1 || p.k === lastK;
			const isLurch = p.k === biggestJumpK;
			const showLabel = isEdge || isLurch || p.k === selectedK || idx % labelEvery === 0;
			out.push({
				id: `p${p.k}`,
				vector: v,
				hue,
				label: showLabel ? p.word : undefined,
				hoverText: `[${p.k}] …${p.text.slice(-90)}`,
				size: isEdge || isLurch ? 1.05 : 0.8
			});
		}
		return out;
	});

	const pathIds = $derived(
		complete ? prefixes.filter((p) => p.k <= visibleK).map((p) => `p${p.k}`) : []
	);

	function selectPoint(id: string) {
		const m = /^p(\d+)$/.exec(id);
		if (m) userSelectedK = Number(m[1]);
	}

	const displacements = $derived.by(() => {
		const out: { k: number; word: string; dist: number }[] = [];
		if (!complete) return out;
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
	dockTitle="Trajectory"
	resultsTitle="Displacement"
	resultsIcon={IconDims}
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
						<p>Texts longer than {MAX_STEPS} words are sampled every few words — each sampled point still embeds the full text up to it.</p>
					</InfoPop>
				</span>
				{#if batch.loading}
					<span class="busy tabular">{batch.done}/{batch.total}</span>
				{:else if prefixes.length > 1}
					<span class="sum tabular">
						{prefixes.length} steps{stride > 1 ? ` · every ${stride} words` : ''} · Σ {totalPath.toFixed(3)}
					</span>
				{/if}
			</div>
			<textarea class="fld" bind:value={lab.sentence} rows="3" spellcheck="false"
				placeholder="Type a sentence — watch its meaning build up word by word."></textarea>
		</div>

		{#if batch.loading}
			<div class="embed-progress no-select">
				<div class="ep-row">
					<span>embedding prefixes</span>
					<span class="tabular">{batch.done}/{batch.total}</span>
				</div>
				<div class="track">
					<div class="fill" style:width={`${batch.total > 0 ? (batch.done / batch.total) * 100 : 0}%`}></div>
				</div>
			</div>
		{:else}
			<div class="play-row">
				<button
					class="play-btn no-select"
					onclick={() => (playing ? stopPlayback() : startPlayback())}
					disabled={!complete || prefixes.length < 2}
				>
					{#if playing}<IconPause size={14} /> stop{:else}<IconPlay size={14} /> replay the path{/if}
				</button>
				<label class="speed no-select" title="Playback speed">
					<input type="range" min="0.5" max="4" step="0.5" bind:value={lab.speed} />
					<span class="tabular">{lab.speed}×</span>
				</label>
			</div>
		{/if}

		<div class="hairline"></div>

		<div class="fld-label"><span>Curated sentences</span></div>
		<div class="chips">
			{#each presets as p (p.label)}
				<button
					class="chip-btn"
					class:on={lab.sentence === p.sentence}
					onclick={() => (lab.sentence = p.sentence)}
					title={`${p.sentence} — ${p.note}`}
				>
					{p.label}
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
	.embed-progress {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 9px 12px;
		border: 1px solid var(--border);
		border-radius: 9px;
		background: oklch(1 0 0 / 0.025);
	}
	.ep-row {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		color: var(--text-muted);
	}
	.ep-row .tabular {
		color: var(--lab);
		font-weight: 600;
	}
	.sum {
		font-size: 10px;
		color: var(--text-subtle);
		text-transform: none;
		letter-spacing: 0;
	}
	.play-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.play-row .play-btn {
		flex: 1;
	}
	.speed {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.speed input {
		width: 74px;
		accent-color: var(--lab);
	}
	.speed span {
		font-size: 10.5px;
		color: var(--text-subtle);
		min-width: 24px;
		text-align: right;
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
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
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
