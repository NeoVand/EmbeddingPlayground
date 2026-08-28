import { describe, expect, it } from 'vitest';
import { columnMass, computeHeadStats } from '../stats.ts';

/** Build a flat [heads, seq, seq] attention tensor from a per-row builder. */
function makeAttn(seq: number, heads: number, row: (h: number, q: number) => number[]): Float32Array {
	const a = new Float32Array(heads * seq * seq);
	for (let h = 0; h < heads; h++) {
		for (let q = 0; q < seq; q++) {
			const r = row(h, q);
			for (let k = 0; k < seq; k++) a[h * seq * seq + q * seq + k] = r[k];
		}
	}
	return a;
}

function oneHot(seq: number, k: number): number[] {
	const r = new Array(seq).fill(0);
	r[Math.max(0, Math.min(seq - 1, k))] = 1;
	return r;
}

describe('computeHeadStats', () => {
	it('detects a previous-token head', () => {
		const seq = 8;
		const attn = makeAttn(seq, 1, (_h, q) => oneHot(seq, q - 1));
		const [s] = computeHeadStats(attn, seq, 1, 0);
		expect(s.prev).toBeGreaterThan(0.9);
		expect(s.kind).toBe('prev');
	});

	it('detects a [SEP] sink head', () => {
		const seq = 8;
		const attn = makeAttn(seq, 1, () => oneHot(seq, seq - 1));
		const [s] = computeHeadStats(attn, seq, 1, 0);
		expect(s.sep).toBeGreaterThan(0.9);
		expect(s.kind).toBe('sep');
	});

	it('labels uniform attention as broad with entropy ≈ 1', () => {
		const seq = 8;
		const attn = makeAttn(seq, 1, () => new Array(seq).fill(1 / seq));
		const [s] = computeHeadStats(attn, seq, 1, 0);
		expect(s.entropy).toBeCloseTo(1, 2);
		expect(s.kind).toBe('broad');
	});

	it('detects a self-attention head with low entropy', () => {
		const seq = 8;
		const attn = makeAttn(seq, 1, (_h, q) => oneHot(seq, q));
		const [s] = computeHeadStats(attn, seq, 1, 0);
		expect(s.self).toBeGreaterThan(0.9);
		expect(s.entropy).toBeLessThan(0.1);
		expect(s.kind).toBe('self');
	});

	it('computes per-head stats independently', () => {
		const seq = 6;
		const attn = makeAttn(seq, 2, (h, q) => (h === 0 ? oneHot(seq, q - 1) : oneHot(seq, seq - 1)));
		const [a, b] = computeHeadStats(attn, seq, 2, 3);
		expect(a.kind).toBe('prev');
		expect(b.kind).toBe('sep');
		expect(a.layer).toBe(3);
		expect(b.head).toBe(1);
	});
});

describe('columnMass', () => {
	it('concentrates mass on the attended column', () => {
		const seq = 5;
		const attn = makeAttn(seq, 2, () => oneHot(seq, 2));
		const mass = columnMass(attn, seq, 2, null);
		expect(mass[2]).toBeCloseTo(1, 5);
		expect(mass[0]).toBeCloseTo(0, 5);
	});

	it('respects head selection', () => {
		const seq = 4;
		const attn = makeAttn(seq, 2, (h) => oneHot(seq, h === 0 ? 0 : 3));
		expect(columnMass(attn, seq, 2, 0)[0]).toBeCloseTo(1, 5);
		expect(columnMass(attn, seq, 2, 1)[3]).toBeCloseTo(1, 5);
	});
});
