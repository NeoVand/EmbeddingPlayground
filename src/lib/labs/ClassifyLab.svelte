<script lang="ts">
	/**
	 * Classify — nearest-prototype classification.
	 *
	 * Each class prototype is the L2-normalized mean of its example
	 * embeddings; a query is scored by cosine to every prototype, softmaxed
	 * with a *visible* temperature. (The old UI hard-coded T=0.08, which
	 * faked near-certainty — now the uncertainty is honest and explorable.)
	 */

	import { IconAdd, IconRemove, IconTemperature, IconUpload } from '$lib/icons.js';
	import { cosine } from '$lib/math/similarity.js';
	import { columnMeans, l2NormalizeInPlace } from '$lib/math/stats.js';
	import type { EmbeddingResult } from '$lib/models/types.js';
	import { playground } from '$lib/stores/playground.svelte.js';
	import { PIN_HUE } from '$lib/theme/palette.js';
	import { theme } from '$lib/theme/theme.svelte.js';
	import DockSection from '$lib/shell/DockSection.svelte';
	import InfoPop from '$lib/shell/InfoPop.svelte';
	import LabShell from '$lib/shell/LabShell.svelte';
	import SemanticCloud, { type CloudLink, type CloudPoint } from '$lib/viz/SemanticCloud.svelte';
	import { CLASSIFY_DATASETS, getDataset, parseCsv, type LabeledExample } from './classifyData.js';
	import { createBatchEmbed, createSingleEmbed } from './embed.svelte.js';
	import { createLabState } from './labState.svelte.js';

	const lab = createLabState('classify', {
		datasetId: 'sentiment' as string,
		examples: [...CLASSIFY_DATASETS[0].examples] as LabeledExample[],
		query: 'I absolutely loved every minute of it.',
		temperature: 0.25,
		uploadError: '' as string
	});

	const exBatch = createBatchEmbed({ delay: 300 });
	const queryEmbed = createSingleEmbed({ delay: 300 });

	$effect(() => {
		void playground.modelId;
		void lab.examples.map((e) => e.id + e.text + e.label).join('|');
		exBatch.run(lab.examples.map((e) => ({ id: e.id, text: e.text })));
	});
	$effect(() => {
		void playground.modelId;
		queryEmbed.run(lab.query);
	});

	let selectedId = $state<string | null>(null);
	const selectedResult = $derived.by<EmbeddingResult | null>(() => {
		if (selectedId === 'query') return queryEmbed.result;
		if (selectedId) return exBatch.results.get(selectedId) ?? null;
		return null;
	});

	const dataset = $derived(getDataset(lab.datasetId));
	const datasetClasses = $derived(
		dataset?.classes ?? Array.from(new Set(lab.examples.map((e) => e.label)))
	);
	const testQueries = $derived(dataset?.testQueries ?? []);

	function pickDataset(id: string) {
		const d = getDataset(id);
		if (!d) return;
		lab.datasetId = id;
		lab.examples = [...d.examples];
		lab.uploadError = '';
	}

	const classHues: Record<string, number> = {
		positive: 145,
		negative: 25,
		neutral: 215,
		tech: 215,
		sports: 25,
		politics: 280,
		food: 60,
		science: 165,
		ham: 145,
		spam: 25
	};
	function labelHue(label: string, idx: number): number {
		const palette = [200, 30, 145, 280, 60, 320, 170, 0];
		return classHues[label] ?? palette[((idx % palette.length) + palette.length) % palette.length];
	}

	type Prototype = { label: string; vector: Float32Array; count: number; hue: number };
	const prototypes = $derived.by<Prototype[]>(() => {
		const classes = datasetClasses;
		const out: Prototype[] = [];
		for (let i = 0; i < classes.length; i++) {
			const cls = classes[i];
			const vecs = lab.examples
				.filter((e) => e.label === cls)
				.map((e) => exBatch.results.get(e.id)?.vector)
				.filter((v): v is Float32Array => !!v);
			if (vecs.length === 0) continue;
			const mean = columnMeans(vecs);
			const meanArr = new Float32Array(mean.length);
			for (let d = 0; d < mean.length; d++) meanArr[d] = mean[d];
			l2NormalizeInPlace(meanArr);
			out.push({ label: cls, vector: meanArr, count: vecs.length, hue: labelHue(cls, i) });
		}
		return out;
	});

	type Prediction = { label: string; sim: number; prob: number; hue: number };
	const predictions = $derived.by<Prediction[]>(() => {
		const q = queryEmbed.result?.vector;
		if (!q || prototypes.length === 0) return [];
		if (prototypes.some((p) => p.vector.length !== q.length)) return [];
		const raw = prototypes.map((p) => ({ label: p.label, sim: cosine(q, p.vector), hue: p.hue }));
		const T = Math.max(0.02, lab.temperature);
		const logits = raw.map((r) => r.sim / T);
		const m = Math.max(...logits);
		const exps = logits.map((l) => Math.exp(l - m));
		const sum = exps.reduce((s, x) => s + x, 0);
		const out = raw.map((r, i) => ({ ...r, prob: exps[i] / sum }));
		out.sort((a, b) => b.prob - a.prob);
		return out;
	});

	const points = $derived.by<CloudPoint[]>(() => {
		const out: CloudPoint[] = [];
		for (const ex of lab.examples) {
			const v = exBatch.results.get(ex.id)?.vector;
			if (!v) continue;
			const classIdx = datasetClasses.indexOf(ex.label);
			out.push({
				id: ex.id,
				vector: v,
				hue: labelHue(ex.label, classIdx),
				hoverText: `[${ex.label}] ${ex.text}`,
				variant: 'dot'
			});
		}
		for (const p of prototypes) {
			out.push({
				id: `proto_${p.label}`,
				vector: p.vector,
				hue: p.hue,
				label: p.label,
				hoverText: `prototype · ${p.label} · mean of ${p.count} examples`,
				size: 1.1
			});
		}
		if (queryEmbed.result) {
			out.push({
				id: 'query',
				vector: queryEmbed.result.vector,
				hue: PIN_HUE,
				label: 'QUERY',
				hoverText: `query: "${lab.query}"`,
				size: 1.2,
				pinned: true
			});
		}
		return out;
	});

	const links = $derived.by<CloudLink[]>(() => {
		if (!queryEmbed.result) return [];
		return predictions.map((p) => ({
			from: 'query',
			to: `proto_${p.label}`,
			style: 'solid' as const,
			hue: PIN_HUE,
			opacity: 0.2 + p.prob * 0.6
		}));
	});

	// Per-class counts for the always-visible summary chips.
	const classSummary = $derived.by(() =>
		datasetClasses.map((cls, i) => ({
			label: cls,
			hue: labelHue(cls, i),
			count: lab.examples.filter((e) => e.label === cls).length
		}))
	);

	function addExample() {
		const defaultLabel = datasetClasses[0] ?? 'class';
		lab.examples = [...lab.examples, { id: `ex_${Date.now()}`, text: '', label: defaultLabel }];
	}
	function setExampleText(id: string, text: string) {
		lab.examples = lab.examples.map((e) => (e.id === id ? { ...e, text } : e));
	}
	function setExampleLabel(id: string, label: string) {
		lab.examples = lab.examples.map((e) => (e.id === id ? { ...e, label } : e));
	}
	function removeExample(id: string) {
		lab.examples = lab.examples.filter((e) => e.id !== id);
	}

	function onUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const f = input.files?.[0];
		if (!f) return;
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const parsed = parseCsv(String(reader.result ?? ''));
				if (parsed.length === 0) {
					lab.uploadError = 'No rows parsed — need a text + label CSV.';
					return;
				}
				lab.examples = parsed;
				lab.uploadError = '';
			} catch (err) {
				lab.uploadError = err instanceof Error ? err.message : String(err);
			}
		};
		reader.readAsText(f);
	}

	const guide = [
		{
			title: 'Classification without training',
			body: 'No gradient descent here. Each class prototype is just the average of its examples’ embeddings; the query goes to whichever prototype it is closest to. A dozen labeled examples is enough.',
			apply: () => pickDataset('sentiment'),
			applyLabel: 'Load sentiment'
		},
		{
			title: 'Watch the uncertainty',
			body: 'Try "It was fine, I guess." — genuinely ambiguous between neutral and positive. Now drag the temperature down and watch the model pretend to be certain. Softmax temperature doesn’t change the decision, only the confidence theater.',
			apply: () => (lab.query = 'It was fine, I guess.'),
			applyLabel: 'Try the ambiguous one'
		},
		{
			title: 'Break a prototype',
			body: 'Delete a few positive examples, or relabel them. The prototype drifts, the decision boundary moves, and misclassifications appear — the whole classifier is just geometry.',
			apply: () => pickDataset('spam'),
			applyLabel: 'Load spam vs ham'
		}
	];
</script>

<LabShell
	labId="classify"
	dockTitle="Training data"
	resultsTitle="Prediction"
	selected={selectedResult}
	selectedLabel={selectedId === 'query' ? 'QUERY' : selectedId ? 'example' : null}
	scopeHint="Click any training example or the QUERY reticle to inspect its embedding."
	{guide}
>
	{#snippet cloud()}
		<SemanticCloud
			{points}
			{links}
			selectedId={selectedId ?? (queryEmbed.result ? 'query' : null)}
			onPointClick={(id) => (selectedId = id)}
		/>
	{/snippet}

	{#snippet dockHeader()}
		<label class="icon-btn" title="Upload a CSV with text,label columns">
			<input class="file-input" type="file" accept=".csv,.tsv,.txt" onchange={onUpload} />
			<IconUpload size={14} />
		</label>
	{/snippet}

	{#snippet dock()}
		<div class="chips">
			{#each CLASSIFY_DATASETS as d (d.id)}
				<button class="chip-btn" class:on={lab.datasetId === d.id} onclick={() => pickDataset(d.id)} title={d.description}>
					{d.name}
				</button>
			{/each}
		</div>
		{#if lab.uploadError}
			<p class="err">{lab.uploadError}</p>
		{/if}

		<div class="hairline"></div>

		<div class="class-chips no-select">
			{#each classSummary as c (c.label)}
				<span class="hue-badge" style:--c={theme.hueCss(c.hue)}>{c.label} · {c.count}</span>
			{/each}
			<InfoPop title="Prototypes">
				<p>All examples with the same label are averaged into one <b>prototype</b> vector (then re-normalized).</p>
				<p>Edit, relabel or delete examples and watch the prototypes move in the cloud.</p>
			</InfoPop>
		</div>

		<DockSection
			label="Edit examples"
			count={exBatch.loading ? `${exBatch.done}/${exBatch.total}` : `${lab.examples.length}`}
		>
			{#snippet extra()}
				<button class="icon-btn" onclick={addExample} aria-label="Add an example"><IconAdd size={14} /></button>
			{/snippet}
			<ul class="ex-list">
				{#each lab.examples as ex (ex.id)}
					{@const classIdx = datasetClasses.indexOf(ex.label)}
					<li class="item-row" style:--c={theme.hueCss(labelHue(ex.label, classIdx))}>
						<input
							class="fld"
							value={ex.text}
							oninput={(e) => setExampleText(ex.id, (e.target as HTMLInputElement).value)}
							placeholder="example text…"
						/>
						<input
							class="fld label-fld"
							value={ex.label}
							oninput={(e) => setExampleLabel(ex.id, (e.target as HTMLInputElement).value)}
							title="class label"
							style:color="var(--c)"
						/>
						<button class="icon-btn danger" onclick={() => removeExample(ex.id)} aria-label="Remove">
							<IconRemove size={13} />
						</button>
					</li>
				{/each}
			</ul>
		</DockSection>
	{/snippet}

	{#snippet results()}
		<div>
			<div class="fld-label">
				<span>Query</span>
				{#if queryEmbed.loading}<span class="busy">…</span>{/if}
			</div>
			<textarea class="fld" bind:value={lab.query} rows="2" spellcheck="false" placeholder="text to classify"></textarea>
		</div>
		{#if testQueries.length > 0}
			<div class="chips">
				{#each testQueries as q, i (i)}
					<button class="chip-btn tq" onclick={() => (lab.query = q)} title={q}>
						{q.split(' ').slice(0, 4).join(' ')}…
					</button>
				{/each}
			</div>
		{/if}

		<div class="hairline"></div>

		{#if predictions.length === 0}
			<p class="empty-note">
				{#if exBatch.loading}Building prototypes…{:else if !queryEmbed.result}Type a query to classify it.{:else}—{/if}
			</p>
		{:else}
			<ol class="preds">
				{#each predictions as p, i (p.label)}
					<li style:--c={theme.hueCss(p.hue)} class:top={i === 0}>
						<div class="pred-head">
							<span class="hue-badge">{p.label}</span>
							<span class="pred-prob tabular">{(p.prob * 100).toFixed(1)}%</span>
						</div>
						<div class="track"><div class="fill pred-fill" style:width={`${p.prob * 100}%`}></div></div>
						<div class="pred-cos tabular no-select">cos {p.sim.toFixed(3)}</div>
					</li>
				{/each}
			</ol>

			<div class="hairline"></div>

			<div class="fld-label">
				<span><IconTemperature size={11} /> temperature
					<InfoPop title="Softmax temperature">
						<p><code>softmax(cos / T)</code> turns similarities into probability-like scores.</p>
						<p><b>Low T</b> exaggerates small differences into near-certainty; <b>high T</b> flattens everything toward equal odds. The winning class never changes — only the confidence.</p>
					</InfoPop>
				</span>
				<span class="count tabular">T = {lab.temperature.toFixed(2)}</span>
			</div>
			<input class="t-slider" type="range" min="0.05" max="1" step="0.05" bind:value={lab.temperature} />
		{/if}
	{/snippet}
</LabShell>

<style>
	.busy {
		color: var(--lab);
	}
	.count {
		font-size: 10px;
		color: var(--text-subtle);
		text-transform: none;
		letter-spacing: 0;
		margin-left: auto;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.chip-btn.tq {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.class-chips {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 5px;
	}
	.err {
		font-size: 11px;
		color: var(--bad);
		margin: 0;
	}
	.file-input {
		display: none;
	}
	ul.ex-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.label-fld {
		width: 74px;
		flex: none;
		font-weight: 600;
		font-size: 11px;
	}
	ol.preds {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.pred-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 4px;
	}
	.pred-prob {
		font-size: 15px;
		font-weight: 650;
		color: var(--text-primary);
	}
	ol.preds li.top .pred-prob {
		color: var(--c);
	}
	.pred-fill {
		background: linear-gradient(90deg, color-mix(in oklab, var(--c) 40%, transparent), var(--c));
	}
	.pred-cos {
		font-size: 9.5px;
		color: var(--text-subtle);
		margin-top: 3px;
	}
	.t-slider {
		width: 100%;
		accent-color: var(--lab);
	}
</style>
