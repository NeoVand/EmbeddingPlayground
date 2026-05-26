/**
 * Vector and matrix statistics — kept independent of similarity so callers
 * can import just what they need.
 */

import type { Vec } from './similarity.ts';

export function sum(a: Vec): number {
	let s = 0;
	for (let i = 0; i < a.length; i++) s += a[i];
	return s;
}

export function mean(a: Vec): number {
	return a.length === 0 ? 0 : sum(a) / a.length;
}

export function variance(a: Vec): number {
	if (a.length === 0) return 0;
	const m = mean(a);
	let s = 0;
	for (let i = 0; i < a.length; i++) {
		const d = a[i] - m;
		s += d * d;
	}
	return s / a.length;
}

export function stddev(a: Vec): number {
	return Math.sqrt(variance(a));
}

export function min(a: Vec): number {
	let m = Infinity;
	for (let i = 0; i < a.length; i++) if (a[i] < m) m = a[i];
	return m;
}

export function max(a: Vec): number {
	let m = -Infinity;
	for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i];
	return m;
}

export function absMax(a: Vec): number {
	let m = 0;
	for (let i = 0; i < a.length; i++) {
		const v = Math.abs(a[i]);
		if (v > m) m = v;
	}
	return m;
}

/** L2-normalize a vector in place (returns the same array). No-op for zero vectors. */
export function l2NormalizeInPlace(a: number[] | Float32Array): typeof a {
	let s = 0;
	for (let i = 0; i < a.length; i++) s += a[i] * a[i];
	const n = Math.sqrt(s);
	if (n === 0) return a;
	for (let i = 0; i < a.length; i++) a[i] /= n;
	return a;
}

/** Per-column mean across an N×D matrix of row-vectors. */
export function columnMeans(rows: Vec[]): Float32Array {
	if (rows.length === 0) return new Float32Array(0);
	const d = rows[0].length;
	const out = new Float32Array(d);
	for (const r of rows) {
		for (let i = 0; i < d; i++) out[i] += r[i];
	}
	for (let i = 0; i < d; i++) out[i] /= rows.length;
	return out;
}
