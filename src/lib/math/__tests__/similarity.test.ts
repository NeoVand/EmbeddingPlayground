import { describe, it, expect } from 'vitest';
import { dot, norm, cosine, cosineNormalized, euclidean } from '../similarity.ts';

describe('similarity', () => {
	it('dot of orthogonal vectors is zero', () => {
		expect(dot([1, 0, 0], [0, 1, 0])).toBe(0);
	});

	it('dot of identical unit vectors is 1', () => {
		expect(dot([1, 0, 0], [1, 0, 0])).toBe(1);
	});

	it('throws on length mismatch', () => {
		expect(() => dot([1, 2], [1, 2, 3])).toThrow();
	});

	it('norm of unit vector is 1', () => {
		expect(norm([1, 0, 0])).toBeCloseTo(1);
		expect(norm([0.6, 0.8])).toBeCloseTo(1);
	});

	it('cosine of identical vectors is 1', () => {
		expect(cosine([2, 3, 4], [2, 3, 4])).toBeCloseTo(1);
	});

	it('cosine of opposite vectors is -1', () => {
		expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
	});

	it('cosine of orthogonal vectors is 0', () => {
		expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
	});

	it('cosine returns 0 for zero vector instead of NaN', () => {
		expect(cosine([0, 0, 0], [1, 2, 3])).toBe(0);
	});

	it('cosineNormalized equals dot', () => {
		expect(cosineNormalized([0.6, 0.8], [0.8, 0.6])).toBeCloseTo(0.96);
	});

	it('euclidean of identical vectors is 0', () => {
		expect(euclidean([1, 2, 3], [1, 2, 3])).toBe(0);
	});

	it('euclidean of [0,0] and [3,4] is 5', () => {
		expect(euclidean([0, 0], [3, 4])).toBeCloseTo(5);
	});
});
