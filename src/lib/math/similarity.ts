/**
 * Similarity functions for embedding vectors.
 * All take `ReadonlyArray<number>` so callers can pass either number[] or
 * Float32Array views (which are array-like and iterable).
 */

export type Vec = ArrayLike<number>;

export function dot(a: Vec, b: Vec): number {
	if (a.length !== b.length) throw new Error(`dot: length mismatch ${a.length} vs ${b.length}`);
	let s = 0;
	for (let i = 0; i < a.length; i++) s += a[i] * b[i];
	return s;
}

export function norm(a: Vec): number {
	let s = 0;
	for (let i = 0; i < a.length; i++) s += a[i] * a[i];
	return Math.sqrt(s);
}

/** Cosine similarity in [-1, 1]. Returns 0 for zero-norm vectors. */
export function cosine(a: Vec, b: Vec): number {
	const na = norm(a);
	const nb = norm(b);
	if (na === 0 || nb === 0) return 0;
	return dot(a, b) / (na * nb);
}

/**
 * Cosine for vectors that are already L2-normalized. Skips the norm
 * computation — embedding models that emit normalized output (most do)
 * make this the right call.
 */
export function cosineNormalized(a: Vec, b: Vec): number {
	return dot(a, b);
}

export function euclidean(a: Vec, b: Vec): number {
	if (a.length !== b.length) throw new Error(`euclidean: length mismatch`);
	let s = 0;
	for (let i = 0; i < a.length; i++) {
		const d = a[i] - b[i];
		s += d * d;
	}
	return Math.sqrt(s);
}
