import { describe, it, expect } from 'vitest';
import { pca, projectInto } from '../pca.ts';

describe('pca', () => {
	it('handles empty input', () => {
		const r = pca([]);
		expect(r.scores).toEqual([]);
		expect(r.eigenvalues).toEqual([]);
	});

	it('finds the dominant axis of axis-aligned data', () => {
		// Points strung out along the x-axis with tiny y noise.
		// First PC should explain ~all variance.
		const pts = [
			[-5, 0.01],
			[-3, -0.02],
			[-1, 0.0],
			[1, 0.01],
			[3, -0.01],
			[5, 0.0]
		];
		const r = pca(pts, { k: 2 });
		expect(r.eigenvalues.length).toBe(2);
		const ratio = r.eigenvalues[0] / (r.eigenvalues[0] + r.eigenvalues[1]);
		expect(ratio).toBeGreaterThan(0.99);
	});

	it('projects centered data onto axes with expected magnitude', () => {
		const pts = [
			[2, 0],
			[-2, 0],
			[0, 2],
			[0, -2]
		];
		const r = pca(pts, { k: 2 });
		// Each point should land at ±2 on one of the two principal axes.
		for (const s of r.scores) {
			const mag = Math.sqrt(s[0] * s[0] + s[1] * s[1]);
			expect(mag).toBeCloseTo(2, 5);
		}
		// Eigenvalues are equal here (symmetric data) → each = 1
		// totalVariance = 8/4 = 2, split evenly
		expect(r.eigenvalues[0] + r.eigenvalues[1]).toBeCloseTo(r.totalVariance * pts.length, 4);
	});

	it('produces deterministic output for fixed seed', () => {
		const pts = Array.from({ length: 10 }, (_, i) => [Math.sin(i), Math.cos(i), i]);
		const a = pca(pts, { k: 2, seed: 42 });
		const b = pca(pts, { k: 2, seed: 42 });
		for (let i = 0; i < a.scores.length; i++) {
			for (let c = 0; c < 2; c++) {
				expect(a.scores[i][c]).toBeCloseTo(b.scores[i][c], 8);
			}
		}
	});

	it('handles D >> N (the embedding regime)', () => {
		// 6 points in 128-dim space — only 5 non-zero eigenvalues possible.
		const D = 128;
		const N = 6;
		const rng = mulberry32(1);
		const pts: number[][] = [];
		for (let i = 0; i < N; i++) {
			const row = new Array(D);
			for (let d = 0; d < D; d++) row[d] = (rng() - 0.5) * 2;
			pts.push(row);
		}
		const r = pca(pts, { k: 3 });
		expect(r.scores.length).toBe(N);
		expect(r.scores[0].length).toBe(3);
		expect(r.loadings.length).toBe(D);
		// Variance should decrease across components.
		expect(r.eigenvalues[0]).toBeGreaterThanOrEqual(r.eigenvalues[1]);
		expect(r.eigenvalues[1]).toBeGreaterThanOrEqual(r.eigenvalues[2]);
	});

	it('projectInto agrees with scores for in-sample points', () => {
		const pts = [
			[1, 2, 3],
			[2, 4, 6],
			[0, 0, 0],
			[-1, -2, -3],
			[3, 1, 2]
		];
		const r = pca(pts, { k: 2 });
		for (let i = 0; i < pts.length; i++) {
			const projected = projectInto(pts[i], r);
			for (let c = 0; c < 2; c++) {
				// 3 decimals — deflation error accumulates across components.
				// That's a ~0.1% drift, invisible in a 3D scatter but real.
				expect(projected[c]).toBeCloseTo(r.scores[i][c], 3);
			}
		}
	});
});

function mulberry32(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
