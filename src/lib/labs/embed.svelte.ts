/**
 * Shared embed orchestration for labs. Two primitives, both debounced and
 * generation-guarded so a stale async result can never clobber a newer one —
 * the pattern every lab used to hand-roll.
 *
 *   const q = createSingleEmbed({ role: 'query' });
 *   $effect(() => { void playground.modelId; q.run(lab.query); });
 *   // ...then read q.result / q.loading
 *
 *   const batch = createBatchEmbed();
 *   $effect(() => { void playground.modelId; batch.run(items); });
 *   // ...then read batch.results (Map by id) / batch.done / batch.total
 *
 * Results flush progressively during a batch so the cloud fills in as
 * embeddings arrive instead of popping in all at once.
 */

import type { EmbedRole, EmbeddingResult } from '$lib/models/types.js';
import { playground } from '$lib/stores/playground.svelte.js';

export interface SingleEmbed {
	readonly result: EmbeddingResult | null;
	readonly loading: boolean;
	readonly error: string | null;
	run(text: string): void;
	clear(): void;
}

export function createSingleEmbed(opts: { delay?: number; role?: EmbedRole } = {}): SingleEmbed {
	const delay = opts.delay ?? 300;
	let result = $state<EmbeddingResult | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let seq = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;

	function run(text: string) {
		if (timer) clearTimeout(timer);
		const t = text.trim();
		const s = ++seq;
		if (!t) {
			result = null;
			loading = false;
			error = null;
			return;
		}
		loading = true;
		timer = setTimeout(() => {
			void (async () => {
				try {
					const r = await playground.embedText(t, { role: opts.role });
					if (s === seq) {
						result = r;
						error = null;
					}
				} catch (e) {
					if (s === seq) {
						result = null;
						error = e instanceof Error ? e.message : String(e);
					}
				} finally {
					if (s === seq) loading = false;
				}
			})();
		}, delay);
	}

	return {
		get result() {
			return result;
		},
		get loading() {
			return loading;
		},
		get error() {
			return error;
		},
		run,
		clear() {
			seq++;
			if (timer) clearTimeout(timer);
			result = null;
			loading = false;
			error = null;
		}
	};
}

export interface BatchItem {
	id: string;
	text: string;
}

export interface BatchEmbed {
	/** Results keyed by item id. Reassigned progressively during a run. */
	readonly results: Map<string, EmbeddingResult>;
	readonly loading: boolean;
	readonly done: number;
	readonly total: number;
	run(items: BatchItem[]): void;
	clear(): void;
}

export function createBatchEmbed(
	opts: { delay?: number; role?: EmbedRole; flushEvery?: number } = {}
): BatchEmbed {
	const delay = opts.delay ?? 250;
	const flushEvery = opts.flushEvery ?? 3;
	let results = $state(new Map<string, EmbeddingResult>());
	let loading = $state(false);
	let done = $state(0);
	let total = $state(0);
	let seq = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;

	function run(items: BatchItem[]) {
		if (timer) clearTimeout(timer);
		const s = ++seq;
		const work = items.filter((it) => it.text.trim().length > 0);
		total = work.length;
		done = 0;
		if (work.length === 0) {
			results = new Map();
			loading = false;
			return;
		}
		loading = true;
		timer = setTimeout(() => {
			void (async () => {
				const acc = new Map<string, EmbeddingResult>();
				try {
					for (let i = 0; i < work.length; i++) {
						if (s !== seq) return; // superseded — abandon quietly
						try {
							const r = await playground.embedText(work[i].text, { role: opts.role });
							acc.set(work[i].id, r);
						} catch {
							/* skip failed item; the lab shows what it has */
						}
						if (s !== seq) return;
						done = i + 1;
						if ((i + 1) % flushEvery === 0) results = new Map(acc);
					}
					if (s === seq) results = new Map(acc);
				} finally {
					if (s === seq) loading = false;
				}
			})();
		}, delay);
	}

	return {
		get results() {
			return results;
		},
		get loading() {
			return loading;
		},
		get done() {
			return done;
		},
		get total() {
			return total;
		},
		run,
		clear() {
			seq++;
			if (timer) clearTimeout(timer);
			results = new Map();
			loading = false;
			done = 0;
			total = 0;
		}
	};
}
