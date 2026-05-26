/**
 * PCA via the Gram-matrix trick (dual PCA).
 *
 * For embedding-playground use, N (number of points) is small (tens to a
 * few hundred) and D (embedding dimension) is large (384–1024). The Gram
 * matrix K = X Xᵀ is N×N — far cheaper than the D×D covariance matrix and
 * has the same non-zero eigenvalues.
 *
 * Algorithm:
 *   1. Mean-center the data row-wise.
 *   2. K = Xc Xcᵀ  (N×N).
 *   3. Top-k eigenpairs of K via power iteration with Hotelling deflation.
 *   4. Principal scores = U · sqrt(Λ), an N×k matrix where row i is point i.
 *   5. Loadings (principal directions) = Xcᵀ U / sqrt(Λ), a D×k matrix —
 *      returned so callers can project new (out-of-sample) points later.
 *
 * Determinism: power iteration with a seeded RNG so projections are stable
 * across runs (no flickering when the corpus is re-embedded).
 */

import type { Vec } from './similarity.ts';
import { columnMeans } from './stats.ts';

export interface PcaResult {
	/** N × k matrix of projections, row i = point i's coordinates in PC space. */
	scores: number[][];
	/** k eigenvalues, descending. The fraction of variance is λ_k / Σ trace. */
	eigenvalues: number[];
	/** D × k matrix of principal directions, column j = j-th principal direction in original space. */
	loadings: number[][];
	/** Per-column means of the input (length D). Subtract before projecting new points. */
	mean: Float32Array;
	/** Total variance (trace of covariance) for variance-explained calculation. */
	totalVariance: number;
}

export interface PcaOptions {
	/** Number of components, default 3. */
	k?: number;
	/** Max power-iteration steps per component, default 200. */
	maxIter?: number;
	/** Convergence tolerance on eigenvalue, default 1e-7. */
	tol?: number;
	/** Seed for the deterministic RNG, default 0x9e3779b9. */
	seed?: number;
}

export function pca(points: Vec[], opts: PcaOptions = {}): PcaResult {
	const k = opts.k ?? 3;
	const maxIter = opts.maxIter ?? 200;
	const tol = opts.tol ?? 1e-7;
	const seed = opts.seed ?? 0x9e3779b9;

	const N = points.length;
	if (N === 0) {
		return { scores: [], eigenvalues: [], loadings: [], mean: new Float32Array(0), totalVariance: 0 };
	}
	const D = points[0].length;
	if (D === 0) {
		return { scores: points.map(() => []), eigenvalues: [], loadings: [], mean: new Float32Array(0), totalVariance: 0 };
	}

	// 1. Mean-center
	const mean = columnMeans(points);
	const Xc: Float32Array[] = points.map((p) => {
		const r = new Float32Array(D);
		for (let i = 0; i < D; i++) r[i] = p[i] - mean[i];
		return r;
	});

	// trace(cov) = (1/N) Σ ||Xc_i||² — total variance, used for variance-explained
	let totalVariance = 0;
	for (const row of Xc) {
		for (let i = 0; i < D; i++) totalVariance += row[i] * row[i];
	}
	totalVariance /= N;

	// 2. Gram matrix K = Xc Xcᵀ (N×N)
	const K = new Float64Array(N * N);
	for (let i = 0; i < N; i++) {
		for (let j = i; j < N; j++) {
			let s = 0;
			const ri = Xc[i];
			const rj = Xc[j];
			for (let d = 0; d < D; d++) s += ri[d] * rj[d];
			K[i * N + j] = s;
			K[j * N + i] = s;
		}
	}

	// 3. Top-k eigenpairs via power iteration with deflation
	const rng = makeRng(seed);
	const eigenvectors: Float64Array[] = []; // each length N
	const eigenvalues: number[] = [];
	const kEff = Math.min(k, N);

	for (let comp = 0; comp < kEff; comp++) {
		// initialise a random unit vector. Explicit widened type so we can later
		// reassign with the result of matVec (TS 5.7 typed-array generics).
		let v: Float64Array = new Float64Array(N);
		for (let i = 0; i < N; i++) v[i] = rng() * 2 - 1;
		normalizeInPlace(v);

		let lambda = 0;
		for (let iter = 0; iter < maxIter; iter++) {
			const Kv = matVec(K, v, N);
			const newLambda = Math.sqrt(dotF64(Kv, Kv));
			if (newLambda === 0) {
				// degenerate — fill with random and bail
				break;
			}
			for (let i = 0; i < N; i++) Kv[i] /= newLambda;
			const diff = Math.abs(newLambda - lambda);
			lambda = newLambda;
			v = Kv;
			if (diff / Math.max(newLambda, 1e-12) < tol) break;
		}

		eigenvalues.push(lambda);
		eigenvectors.push(v);

		// Hotelling deflation: K -= λ v vᵀ
		for (let i = 0; i < N; i++) {
			for (let j = 0; j < N; j++) {
				K[i * N + j] -= lambda * v[i] * v[j];
			}
		}
	}

	// 4. Scores = U · sqrt(Λ).  scores[i][c] = u_c[i] * sqrt(λ_c).
	const scores: number[][] = new Array(N);
	for (let i = 0; i < N; i++) scores[i] = new Array(kEff);
	for (let c = 0; c < kEff; c++) {
		const s = Math.sqrt(Math.max(0, eigenvalues[c]));
		const u = eigenvectors[c];
		for (let i = 0; i < N; i++) scores[i][c] = u[i] * s;
	}

	// 5. Loadings = Xcᵀ U / sqrt(Λ), D×k.  loadings[d][c] is direction c, dim d.
	const loadings: number[][] = new Array(D);
	for (let d = 0; d < D; d++) loadings[d] = new Array(kEff);
	for (let c = 0; c < kEff; c++) {
		const sLambda = Math.sqrt(Math.max(0, eigenvalues[c]));
		const u = eigenvectors[c];
		const invS = sLambda === 0 ? 0 : 1 / sLambda;
		for (let d = 0; d < D; d++) {
			let s = 0;
			for (let i = 0; i < N; i++) s += Xc[i][d] * u[i];
			loadings[d][c] = s * invS;
		}
	}

	return { scores, eigenvalues, loadings, mean, totalVariance };
}

/** Project a new point into an existing PCA basis. Out-of-sample extension. */
export function projectInto(pt: Vec, res: PcaResult): number[] {
	const D = res.mean.length;
	if (pt.length !== D) throw new Error(`projectInto: dim mismatch ${pt.length} vs ${D}`);
	const k = res.eigenvalues.length;
	const out = new Array<number>(k).fill(0);
	for (let d = 0; d < D; d++) {
		const v = pt[d] - res.mean[d];
		const row = res.loadings[d];
		for (let c = 0; c < k; c++) out[c] += v * row[c];
	}
	return out;
}

// ---------- helpers ----------

function matVec(M: Float64Array, v: Float64Array, n: number): Float64Array {
	const out = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		let s = 0;
		const base = i * n;
		for (let j = 0; j < n; j++) s += M[base + j] * v[j];
		out[i] = s;
	}
	return out;
}

function dotF64(a: Float64Array, b: Float64Array): number {
	let s = 0;
	for (let i = 0; i < a.length; i++) s += a[i] * b[i];
	return s;
}

function normalizeInPlace(v: Float64Array): void {
	let s = 0;
	for (let i = 0; i < v.length; i++) s += v[i] * v[i];
	const n = Math.sqrt(s);
	if (n === 0) return;
	for (let i = 0; i < v.length; i++) v[i] /= n;
}

/** Mulberry32 — small, fast, seedable. */
function makeRng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
