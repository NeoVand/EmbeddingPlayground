import { describe, it, expect } from 'vitest';
import { mean, variance, stddev, min, max, absMax, l2NormalizeInPlace, columnMeans } from '../stats.ts';

describe('stats', () => {
	it('mean of [1,2,3] is 2', () => {
		expect(mean([1, 2, 3])).toBe(2);
	});

	it('mean of [] is 0', () => {
		expect(mean([])).toBe(0);
	});

	it('variance of constants is 0', () => {
		expect(variance([5, 5, 5, 5])).toBe(0);
	});

	it('variance of [1,2,3] is 2/3', () => {
		expect(variance([1, 2, 3])).toBeCloseTo(2 / 3);
	});

	it('stddev = sqrt(variance)', () => {
		expect(stddev([1, 2, 3])).toBeCloseTo(Math.sqrt(2 / 3));
	});

	it('min and max work', () => {
		expect(min([3, 1, 4, 1, 5])).toBe(1);
		expect(max([3, 1, 4, 1, 5])).toBe(5);
	});

	it('absMax', () => {
		expect(absMax([-3, 1, -4, 2])).toBe(4);
		expect(absMax([0.5, -0.7, 0.6])).toBeCloseTo(0.7);
	});

	it('l2NormalizeInPlace gives unit vector', () => {
		const v = [3, 4];
		l2NormalizeInPlace(v);
		expect(v[0]).toBeCloseTo(0.6);
		expect(v[1]).toBeCloseTo(0.8);
	});

	it('l2NormalizeInPlace is no-op on zero vector', () => {
		const v = [0, 0, 0];
		l2NormalizeInPlace(v);
		expect(v).toEqual([0, 0, 0]);
	});

	it('columnMeans averages per dimension', () => {
		const m = columnMeans([
			[1, 10],
			[2, 20],
			[3, 30]
		]);
		expect(Array.from(m)).toEqual([2, 20]);
	});
});
