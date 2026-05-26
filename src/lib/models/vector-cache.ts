/**
 * Vector cache — persistent, content-addressed embedding cache backed by
 * localStorage.
 *
 * Why: every model switch, page reload, and back-and-forth was rebuilding the
 * corpus from scratch. With this cache, embedding any text under any model is
 * O(1) the second time, even across browser sessions.
 *
 * Storage layout (single key, JSON envelope):
 *   embedding-playground:vectors:v1 = {
 *     entries: [{ k: "modelId|backend|text", v: "<base64 of f32>", t: <ms> }],
 *   }
 *
 * Eviction: LRU by `t`, capped at MAX_ENTRIES so we stay well under the 5MB
 * localStorage budget. A 1024-dim f32 vector is 4KB raw, ~5.5KB base64; with
 * MAX_ENTRIES=400 the worst-case is ~2.2MB.
 */

const STORAGE_KEY = 'embedding-playground:vectors:v1';
const MAX_ENTRIES = 400;
const PERSIST_DEBOUNCE_MS = 250;

interface Envelope {
	entries: { k: string; v: string; t: number }[];
}

export class VectorCache {
	private map = new Map<string, { vec: Float32Array; t: number }>();
	private dirty = false;
	private persistTimer: ReturnType<typeof setTimeout> | null = null;

	constructor() {
		this.load();
	}

	private static makeKey(modelId: string, backend: string, text: string): string {
		// Normalize whitespace so "hello " and "hello" share a cache entry.
		const t = text.replace(/\s+/g, ' ').trim();
		return `${modelId}|${backend}|${t}`;
	}

	get(modelId: string, backend: string, text: string): Float32Array | null {
		const k = VectorCache.makeKey(modelId, backend, text);
		const hit = this.map.get(k);
		if (!hit) return null;
		// LRU touch
		hit.t = Date.now();
		this.dirty = true;
		this.schedulePersist();
		return hit.vec;
	}

	set(modelId: string, backend: string, text: string, vec: Float32Array): void {
		const k = VectorCache.makeKey(modelId, backend, text);
		this.map.set(k, { vec, t: Date.now() });
		this.dirty = true;
		this.schedulePersist();
	}

	has(modelId: string, backend: string, text: string): boolean {
		return this.map.has(VectorCache.makeKey(modelId, backend, text));
	}

	/** Evict everything for a specific model (e.g. on model uninstall). */
	clearModel(modelId: string): void {
		for (const k of Array.from(this.map.keys())) {
			if (k.startsWith(`${modelId}|`)) this.map.delete(k);
		}
		this.dirty = true;
		this.schedulePersist();
	}

	clearAll(): void {
		this.map.clear();
		this.dirty = true;
		this.persistNow();
	}

	get size(): number {
		return this.map.size;
	}

	private schedulePersist(): void {
		if (this.persistTimer) clearTimeout(this.persistTimer);
		this.persistTimer = setTimeout(() => this.persistNow(), PERSIST_DEBOUNCE_MS);
	}

	private persistNow(): void {
		if (!this.dirty) return;
		this.dirty = false;
		try {
			// LRU keep: sort by t desc, take top MAX_ENTRIES.
			const all = Array.from(this.map.entries()).sort((a, b) => b[1].t - a[1].t);
			const keep = all.slice(0, MAX_ENTRIES);
			// Rebuild map so size matches what's persisted.
			this.map = new Map(keep);
			const env: Envelope = {
				entries: keep.map(([k, { vec, t }]) => ({ k, v: f32ToBase64(vec), t }))
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(env));
		} catch (e) {
			// Quota exceeded or storage unavailable — soft-fail. The cache will
			// continue to work in memory.
			console.warn('VectorCache persist failed', e);
		}
	}

	private load(): void {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const env = JSON.parse(raw) as Envelope;
			for (const e of env.entries ?? []) {
				this.map.set(e.k, { vec: base64ToF32(e.v), t: e.t });
			}
		} catch (e) {
			console.warn('VectorCache load failed; starting empty', e);
		}
	}
}

// ---------- base64 <-> Float32Array ----------

function f32ToBase64(arr: Float32Array): string {
	const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

function base64ToF32(s: string): Float32Array {
	const binary = atob(s);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	// Copy into an aligned buffer (atob output may not be aligned to 4 bytes).
	const aligned = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(aligned).set(bytes);
	return new Float32Array(aligned);
}

// Singleton — there's only one cache per browser session.
let _instance: VectorCache | null = null;
export function getVectorCache(): VectorCache {
	if (!_instance) _instance = new VectorCache();
	return _instance;
}
