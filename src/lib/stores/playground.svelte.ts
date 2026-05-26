/**
 * Shared shell store. Each lab manages its own state — this store is just
 * the things every lab needs: the active model, the embedder, the cache,
 * the corpus, the lab switcher.
 *
 * Slot / pair / arithmetic / projection-mode state used to live here and
 * leaked across tabs. Those now live inside the individual labs.
 */

import { SEED_CORPUS, type CorpusItem } from '$lib/corpus/seed.js';
import { detectBackends } from '$lib/models/detect.js';
import { chooseEmbedder, type BackendPreference, type SelectionPlan } from '$lib/models/orchestrator.js';
import { DEFAULT_MODEL_ID, getModel, MODELS } from '$lib/models/registry.js';
import type {
	Backend,
	BackendAvailability,
	Embedder,
	EmbeddingResult,
	LoadProgress,
	ModelInfo
} from '$lib/models/types.js';
import { getVectorCache } from '$lib/models/vector-cache.js';

const STATE_KEY = 'embedding-playground:shell:v1';

export type LabId = 'compare' | 'trajectory' | 'rag' | 'classify' | 'cluster';

export interface CorpusEmbedding {
	item: CorpusItem;
	vector: Float32Array;
}

interface PersistedState {
	modelId: string;
	preference: BackendPreference;
	lab: LabId;
	tourSeen: boolean;
}

function defaultPersisted(): PersistedState {
	return {
		modelId: DEFAULT_MODEL_ID,
		preference: 'auto',
		lab: 'compare',
		tourSeen: false
	};
}

function loadPersisted(): PersistedState {
	try {
		const raw = localStorage.getItem(STATE_KEY);
		if (!raw) return defaultPersisted();
		const parsed = JSON.parse(raw) as Partial<PersistedState>;
		const d = defaultPersisted();
		return {
			modelId: parsed.modelId ?? d.modelId,
			preference: parsed.preference ?? d.preference,
			lab: parsed.lab ?? d.lab,
			tourSeen: parsed.tourSeen ?? false
		};
	} catch {
		return defaultPersisted();
	}
}

function createPlayground() {
	const cache = getVectorCache();
	const persisted = typeof localStorage !== 'undefined' ? loadPersisted() : defaultPersisted();

	let modelId = $state<string>(persisted.modelId);
	let preference = $state<BackendPreference>(persisted.preference);
	let lab = $state<LabId>(persisted.lab);
	let tourSeen = $state<boolean>(persisted.tourSeen);

	let availability = $state<BackendAvailability | null>(null);
	let selection = $state<SelectionPlan | null>(null);
	let modelLoad = $state<LoadProgress | null>(null);
	let modelReady = $state(false);

	let corpusBuilding = $state(false);
	let corpusProgress = $state(0);
	let corpusCache = $state<{ modelId: string; backend: Backend; items: CorpusEmbedding[] } | null>(null);

	// Aggregate "what is the app currently doing?" counters. Every embedText
	// call increments embedQueueDepth on entry and decrements on exit so the
	// page shell can render a global progress indicator without each lab
	// reporting its own state.
	let embedQueueDepth = $state(0);
	let embedTotalThisSession = $state(0);

	const model = $derived<ModelInfo>(getModel(modelId));
	const corpusReady = $derived(
		corpusCache != null && corpusCache.modelId === modelId && corpusCache.backend === selection?.backend
	);

	let activeEmbedder: Embedder | null = null;
	let activeKey = '';

	async function ensureEmbedder(): Promise<Embedder> {
		const key = `${modelId}|${preference}`;
		if (activeEmbedder && activeKey === key && modelReady) return activeEmbedder;

		if (activeEmbedder) {
			await activeEmbedder.dispose().catch(() => {});
			activeEmbedder = null;
			modelReady = false;
		}

		if (!availability) availability = await detectBackends();
		const plan = await chooseEmbedder(model, preference, availability);
		selection = plan;
		activeEmbedder = plan.embedder;
		activeKey = key;

		modelLoad = {
			modelId: model.id,
			backend: plan.backend,
			status: 'loading',
			progress: 0,
			message: 'Initializing…'
		};

		await plan.embedder.load((p) => {
			modelLoad = p;
		});
		modelReady = true;
		return plan.embedder;
	}

	/**
	 * Embed a single text. Cache-aware. Returns the full EmbeddingResult
	 * (vector, tokens if available, etc.). `force: true` bypasses the cache.
	 */
	async function embedText(text: string, _opts: { force?: boolean } = {}): Promise<EmbeddingResult> {
		const t = text.trim();
		if (!t) throw new Error('Empty text');

		embedQueueDepth++;
		embedTotalThisSession++;
		try {
			const e = await ensureEmbedder();
			const backend = e.backend;

			// IMPORTANT: don't return a cache stub here. The cache holds only
			// the pooled vector — re-using it loses per-token vectors and the
			// inspector falls through to "no tokens available" the next time
			// the same text is embedded. Always run a fresh forward pass so
			// the result is complete; still write to the cache so the
			// corpus-build path (which only needs vectors) stays fast.
			const r = await e.embed(t);
			cache.set(modelId, backend, t, r.vector);
			return r;
		} finally {
			embedQueueDepth--;
		}
	}

	async function buildCorpus(): Promise<void> {
		const e = await ensureEmbedder();
		const targetModelId = modelId;
		const targetBackend = e.backend;
		if (
			corpusCache &&
			corpusCache.modelId === targetModelId &&
			corpusCache.backend === targetBackend
		)
			return;
		if (corpusBuilding) return;

		corpusBuilding = true;
		corpusProgress = 0;
		try {
			const out: CorpusEmbedding[] = [];
			for (let i = 0; i < SEED_CORPUS.length; i++) {
				if (modelId !== targetModelId) return;
				const item = SEED_CORPUS[i];
				const cached = cache.get(targetModelId, targetBackend, item.text);
				if (cached) {
					out.push({ item, vector: cached });
				} else {
					const r = await e.embed(item.text);
					cache.set(targetModelId, targetBackend, item.text, r.vector);
					out.push({ item, vector: r.vector });
				}
				corpusProgress = (i + 1) / SEED_CORPUS.length;
			}
			if (modelId === targetModelId) {
				corpusCache = { modelId: targetModelId, backend: targetBackend, items: out };
			}
		} finally {
			corpusBuilding = false;
		}
	}

	function persist(): void {
		try {
			const state: PersistedState = { modelId, preference, lab, tourSeen };
			localStorage.setItem(STATE_KEY, JSON.stringify(state));
		} catch {
			/* quota; ignore */
		}
	}

	$effect.root(() => {
		// Persist shell state.
		$effect(() => {
			void modelId;
			void preference;
			void lab;
			void tourSeen;
			persist();
		});

		// On model / backend change, eagerly load and start a corpus build.
		$effect(() => {
			void modelId;
			void preference;
			void (async () => {
				try {
					await ensureEmbedder();
					void buildCorpus();
				} catch (err) {
					console.error('Model change failed', err);
				}
			})();
		});
	});

	return {
		// model state
		get models() {
			return MODELS;
		},
		get modelId() {
			return modelId;
		},
		set modelId(v: string) {
			modelId = v;
		},
		get model() {
			return model;
		},
		get preference() {
			return preference;
		},
		set preference(v: BackendPreference) {
			preference = v;
		},
		get availability() {
			return availability;
		},
		get selection() {
			return selection;
		},
		get modelLoad() {
			return modelLoad;
		},
		get modelReady() {
			return modelReady;
		},

		// lab switcher
		get lab() {
			return lab;
		},
		set lab(v: LabId) {
			lab = v;
		},

		// tour
		get tourSeen() {
			return tourSeen;
		},
		set tourSeen(v: boolean) {
			tourSeen = v;
		},

		// corpus
		get corpus() {
			return corpusCache;
		},
		get corpusReady() {
			return corpusReady;
		},
		get corpusBuilding() {
			return corpusBuilding;
		},
		get corpusProgress() {
			return corpusProgress;
		},

		// Aggregate processing state for the global progress indicator.
		get embedQueueDepth() {
			return embedQueueDepth;
		},
		get embedTotalThisSession() {
			return embedTotalThisSession;
		},
		get isBusy() {
			return (
				embedQueueDepth > 0 ||
				corpusBuilding ||
				modelLoad?.status === 'loading'
			);
		},

		// actions
		embedText,
		async probeBackends() {
			availability = await detectBackends();
		}
	};
}

export const playground = createPlayground();

if (typeof window !== 'undefined') {
	(window as unknown as { __playground: unknown }).__playground = playground;
}
