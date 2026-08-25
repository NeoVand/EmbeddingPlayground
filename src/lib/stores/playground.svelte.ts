/**
 * Shared shell store. Each lab manages its own state — this store is just
 * the things every lab needs: the active model, the embedder, the caches,
 * the lab switcher, and shell-level UI state (model manager, first run).
 */

import { detectBackends } from '$lib/models/detect.js';
import { chooseEmbedder, type BackendPreference, type SelectionPlan } from '$lib/models/orchestrator.js';
import { DEFAULT_MODEL_ID, getModel, MODELS } from '$lib/models/registry.js';
import type {
	BackendAvailability,
	EmbedRole,
	Embedder,
	EmbeddingResult,
	LoadProgress,
	ModelInfo
} from '$lib/models/types.js';
import { getVectorCache } from '$lib/models/vector-cache.js';

const STATE_KEY = 'embedding-playground:shell:v1';

export type LabId = 'compare' | 'trajectory' | 'rag' | 'classify' | 'cluster';

interface PersistedState {
	modelId: string;
	preference: BackendPreference;
	lab: LabId;
}

function defaultPersisted(): PersistedState {
	return {
		modelId: DEFAULT_MODEL_ID,
		preference: 'auto',
		lab: 'compare'
	};
}

function loadPersisted(): { state: PersistedState; existed: boolean } {
	try {
		const raw = localStorage.getItem(STATE_KEY);
		if (!raw) return { state: defaultPersisted(), existed: false };
		const parsed = JSON.parse(raw) as Partial<PersistedState>;
		const d = defaultPersisted();
		return {
			state: {
				modelId: parsed.modelId ?? d.modelId,
				preference: parsed.preference ?? d.preference,
				lab: parsed.lab ?? d.lab
			},
			existed: true
		};
	} catch {
		return { state: defaultPersisted(), existed: false };
	}
}

/**
 * Two-tier caching:
 *   • memory — the full EmbeddingResult (tokens + token vectors included), so
 *     re-embedding the same text — including after a lab switch — is free and
 *     the inspector stays complete. LRU-capped.
 *   • localStorage (VectorCache) — pooled vectors only, survives reloads.
 *     Write-through; read is only used as a hint that nothing changed.
 */
const MEMORY_CACHE_MAX = 400;

function createPlayground() {
	const vectorCache = getVectorCache();
	const loaded = typeof localStorage !== 'undefined' ? loadPersisted() : { state: defaultPersisted(), existed: true };
	const persisted = loaded.state;

	let modelId = $state<string>(persisted.modelId);
	let preference = $state<BackendPreference>(persisted.preference);
	let lab = $state<LabId>(persisted.lab);

	let availability = $state<BackendAvailability | null>(null);
	let selection = $state<SelectionPlan | null>(null);
	let modelLoad = $state<LoadProgress | null>(null);
	let modelReady = $state(false);

	// Shell UI state.
	let modelManagerOpen = $state(!loaded.existed);
	const firstRun = !loaded.existed;

	// Aggregate "what is the app currently doing?" counters. Every embedText
	// call increments embedQueueDepth on entry and decrements on exit so the
	// shell can render a global progress indicator without each lab
	// reporting its own state.
	let embedQueueDepth = $state(0);
	let embedTotalThisSession = $state(0);

	const model = $derived<ModelInfo>(getModel(modelId));

	// Memory tier — full results, keyed by model|backend|role|text.
	const memoryCache = new Map<string, EmbeddingResult>();

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
	 * Embed a single text with a role ('document' unless it's a search query).
	 * Memory-cache-aware: a hit returns the complete previous result, tokens
	 * included, without touching the model.
	 */
	async function embedText(text: string, opts: { role?: EmbedRole } = {}): Promise<EmbeddingResult> {
		const t = text.trim();
		if (!t) throw new Error('Empty text');
		const role = opts.role ?? 'document';

		const e = await ensureEmbedder();
		const backend = e.backend;
		const memKey = `${modelId}|${backend}|${role}|${t.replace(/\s+/g, ' ')}`;
		const hit = memoryCache.get(memKey);
		if (hit) {
			// LRU touch.
			memoryCache.delete(memKey);
			memoryCache.set(memKey, hit);
			return hit;
		}

		embedQueueDepth++;
		embedTotalThisSession++;
		try {
			const r = await e.embed(t, { role });
			memoryCache.set(memKey, r);
			if (memoryCache.size > MEMORY_CACHE_MAX) {
				const oldest = memoryCache.keys().next().value;
				if (oldest !== undefined) memoryCache.delete(oldest);
			}
			// Persist the pooled vector. Query-role embeddings get a marked key so
			// they never collide with document embeddings of the same text.
			vectorCache.set(modelId, backend, role === 'query' ? `q:${t}` : t, r.vector);
			return r;
		} finally {
			embedQueueDepth--;
		}
	}

	function persist(): void {
		try {
			const state: PersistedState = { modelId, preference, lab };
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
			persist();
		});

		// On model / backend change, eagerly load so the first embed is instant.
		$effect(() => {
			void modelId;
			void preference;
			void (async () => {
				try {
					await ensureEmbedder();
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

		// shell UI
		get modelManagerOpen() {
			return modelManagerOpen;
		},
		set modelManagerOpen(v: boolean) {
			modelManagerOpen = v;
		},
		get firstRun() {
			return firstRun;
		},

		// Aggregate processing state for the global progress indicator.
		get embedQueueDepth() {
			return embedQueueDepth;
		},
		get embedTotalThisSession() {
			return embedTotalThisSession;
		},
		get isBusy() {
			return embedQueueDepth > 0 || modelLoad?.status === 'loading';
		},

		// actions
		embedText,
		async probeBackends() {
			availability = await detectBackends();
		}
	};
}

export const playground = createPlayground();

if (import.meta.env.DEV && typeof window !== 'undefined') {
	(window as unknown as { __playground: unknown }).__playground = playground;
}
