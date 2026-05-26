/**
 * K-means clustering — straightforward Lloyd's algorithm with k-means++ init.
 *
 * Operates on unit vectors (cosine distance behaves correctly), and centroids
 * are L2-renormalized each iteration so they stay on the same hypersphere
 * as the data.
 */

import { cosine } from './similarity.ts';
import { columnMeans, l2NormalizeInPlace } from './stats.ts';

export interface KMeansResult {
	/** Cluster assignment per input point. */
	assignments: number[];
	/** k centroid vectors. */
	centroids: Float32Array[];
	/** Number of iterations until convergence. */
	iterations: number;
	/** Inertia (sum of squared cosine distances from each point to its centroid). */
	inertia: number;
}

export interface KMeansOpts {
	k: number;
	maxIter?: number;
	tol?: number;
	seed?: number;
}

export function kmeans(points: Float32Array[], opts: KMeansOpts): KMeansResult {
	const k = opts.k;
	const maxIter = opts.maxIter ?? 100;
	const tol = opts.tol ?? 1e-4;
	const seed = opts.seed ?? 0xc0ffee;
	const rng = makeRng(seed);

	const N = points.length;
	if (N === 0 || k === 0) {
		return { assignments: [], centroids: [], iterations: 0, inertia: 0 };
	}
	const D = points[0].length;
	const kEff = Math.min(k, N);

	// k-means++ initialization for better starting centroids
	const centroids: Float32Array[] = [];
	const firstIdx = Math.floor(rng() * N);
	centroids.push(new Float32Array(points[firstIdx]));

	const dist2 = new Float64Array(N);
	for (let c = 1; c < kEff; c++) {
		// For each point, its squared distance to the nearest existing centroid.
		let totalD2 = 0;
		for (let i = 0; i < N; i++) {
			let best = Infinity;
			for (const ctr of centroids) {
				const d = 1 - cosine(points[i], ctr); // cosine distance in [0, 2]
				const d2 = d * d;
				if (d2 < best) best = d2;
			}
			dist2[i] = best;
			totalD2 += best;
		}
		// Sample next centroid weighted by squared distance.
		let target = rng() * totalD2;
		let chosen = N - 1;
		for (let i = 0; i < N; i++) {
			target -= dist2[i];
			if (target <= 0) {
				chosen = i;
				break;
			}
		}
		centroids.push(new Float32Array(points[chosen]));
	}

	// Lloyd's iteration
	const assignments = new Array<number>(N).fill(0);
	let iter = 0;
	let prevInertia = Infinity;
	let inertia = 0;

	for (iter = 0; iter < maxIter; iter++) {
		// Assign each point to nearest centroid (by cosine distance).
		inertia = 0;
		for (let i = 0; i < N; i++) {
			let bestC = 0;
			let bestDist = Infinity;
			for (let c = 0; c < kEff; c++) {
				const d = 1 - cosine(points[i], centroids[c]);
				if (d < bestDist) {
					bestDist = d;
					bestC = c;
				}
			}
			assignments[i] = bestC;
			inertia += bestDist * bestDist;
		}

		// Recompute centroids
		for (let c = 0; c < kEff; c++) {
			const members = points.filter((_, i) => assignments[i] === c);
			if (members.length === 0) continue;
			const mean = columnMeans(members);
			const newC = new Float32Array(D);
			for (let d = 0; d < D; d++) newC[d] = mean[d];
			l2NormalizeInPlace(newC);
			centroids[c] = newC;
		}

		// Check for convergence.
		if (Math.abs(prevInertia - inertia) < tol) {
			iter++;
			break;
		}
		prevInertia = inertia;
	}

	return { assignments, centroids, iterations: iter, inertia };
}

/**
 * Silhouette coefficient: how well each point fits in its cluster vs the
 * next-nearest cluster. Mean over all points; range is approximately [-1, 1].
 * Higher is better. Useful as a "how good are these clusters?" readout.
 */
export function silhouette(
	points: Float32Array[],
	assignments: number[],
	k: number
): number {
	const N = points.length;
	if (N < 2) return 0;

	let total = 0;
	let counted = 0;
	for (let i = 0; i < N; i++) {
		const cluster = assignments[i];
		// Mean distance within own cluster (excluding self).
		let aSum = 0;
		let aCount = 0;
		for (let j = 0; j < N; j++) {
			if (j === i || assignments[j] !== cluster) continue;
			aSum += 1 - cosine(points[i], points[j]);
			aCount++;
		}
		if (aCount === 0) continue; // singleton cluster
		const a = aSum / aCount;

		// Smallest mean distance to any other cluster.
		let b = Infinity;
		for (let c = 0; c < k; c++) {
			if (c === cluster) continue;
			let bSum = 0;
			let bCount = 0;
			for (let j = 0; j < N; j++) {
				if (assignments[j] !== c) continue;
				bSum += 1 - cosine(points[i], points[j]);
				bCount++;
			}
			if (bCount > 0) b = Math.min(b, bSum / bCount);
		}
		if (b === Infinity) continue;

		const s = (b - a) / Math.max(a, b);
		total += s;
		counted++;
	}
	return counted > 0 ? total / counted : 0;
}

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
