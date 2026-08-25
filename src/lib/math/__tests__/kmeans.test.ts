import { describe, expect, it } from 'vitest';
import { kmeans, silhouette } from '../kmeans.ts';
import { l2NormalizeInPlace } from '../stats.ts';

/** Two tight clusters of unit vectors around orthogonal directions. */
function twoBlobs(perBlob = 8, dim = 16, spread = 0.05): { points: Float32Array[]; truth: number[] } {
	const points: Float32Array[] = [];
	const truth: number[] = [];
	// Deterministic pseudo-noise so the test never flakes.
	let s = 42;
	const rnd = () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296 - 0.5;
	};
	for (let b = 0; b < 2; b++) {
		for (let i = 0; i < perBlob; i++) {
			const v = new Float32Array(dim);
			v[b] = 1; // blob 0 along e0, blob 1 along e1
			for (let d = 0; d < dim; d++) v[d] += rnd() * spread;
			l2NormalizeInPlace(v);
			points.push(v);
			truth.push(b);
		}
	}
	return { points, truth };
}

describe('kmeans', () => {
	it('recovers two well-separated clusters exactly', () => {
		const { points, truth } = twoBlobs();
		const res = kmeans(points, { k: 2, seed: 0xc0ffee });
		// Cluster ids are arbitrary — check that partitions match.
		const mapping = new Map<number, number>();
		for (let i = 0; i < truth.length; i++) {
			const got = res.assignments[i];
			if (!mapping.has(got)) mapping.set(got, truth[i]);
			expect(mapping.get(got)).toBe(truth[i]);
		}
		expect(mapping.size).toBe(2);
	});

	it('is deterministic for a fixed seed', () => {
		const { points } = twoBlobs(10);
		const a = kmeans(points, { k: 2, seed: 123 });
		const b = kmeans(points, { k: 2, seed: 123 });
		expect(a.assignments).toEqual(b.assignments);
		expect(a.inertia).toBe(b.inertia);
	});

	it('returns unit-norm centroids', () => {
		const { points } = twoBlobs();
		const res = kmeans(points, { k: 2, seed: 7 });
		for (const c of res.centroids) {
			let n = 0;
			for (const x of c) n += x * x;
			expect(Math.sqrt(n)).toBeCloseTo(1, 4);
		}
	});

	it('caps k at the number of points and handles empty input', () => {
		const { points } = twoBlobs(2, 8); // 4 points total
		const res = kmeans(points, { k: 10, seed: 1 });
		expect(res.centroids.length).toBeLessThanOrEqual(4);
		expect(res.assignments.length).toBe(4);

		const empty = kmeans([], { k: 3 });
		expect(empty.assignments).toEqual([]);
		expect(empty.centroids).toEqual([]);
	});
});

describe('silhouette', () => {
	it('scores separated clusters near 1 and shuffled labels much lower', () => {
		const { points, truth } = twoBlobs();
		const good = silhouette(points, truth, 2);
		expect(good).toBeGreaterThan(0.8);

		// Alternating labels cut across the real structure.
		const bad = silhouette(points, truth.map((_, i) => i % 2), 2);
		expect(bad).toBeLessThan(good - 0.5);
	});

	it('returns 0 for fewer than two points', () => {
		expect(silhouette([], [], 2)).toBe(0);
		expect(silhouette([new Float32Array([1, 0])], [0], 1)).toBe(0);
	});
});
