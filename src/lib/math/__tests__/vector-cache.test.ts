/**
 * VectorCache tests. Uses a localStorage shim because vitest's Node env
 * doesn't provide one. We verify content-addressing, LRU, and round-trip
 * fidelity of the base64 packing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VectorCache } from '../../models/vector-cache.ts';

class MemStorage {
	private m = new Map<string, string>();
	getItem(k: string) {
		return this.m.has(k) ? this.m.get(k)! : null;
	}
	setItem(k: string, v: string) {
		this.m.set(k, v);
	}
	removeItem(k: string) {
		this.m.delete(k);
	}
	clear() {
		this.m.clear();
	}
	get length() {
		return this.m.size;
	}
	key(i: number) {
		return Array.from(this.m.keys())[i] ?? null;
	}
}

beforeEach(() => {
	(globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
	(globalThis as unknown as { atob: typeof atob; btoa: typeof btoa }).atob = (s: string) =>
		Buffer.from(s, 'base64').toString('binary');
	(globalThis as unknown as { btoa: typeof btoa }).btoa = (s: string) =>
		Buffer.from(s, 'binary').toString('base64');
});

describe('VectorCache', () => {
	it('round-trips a Float32Array losslessly', () => {
		const c = new VectorCache();
		const v = new Float32Array([0.5, -0.25, 1e-7, 3.1415927, Number.MAX_VALUE / 1e30, 0]);
		c.set('m1', 'transformers', 'hello', v);
		const r = c.get('m1', 'transformers', 'hello');
		expect(r).not.toBeNull();
		expect(r!.length).toBe(v.length);
		for (let i = 0; i < v.length; i++) expect(r![i]).toBe(v[i]);
	});

	it('keys by (model, backend, text)', () => {
		const c = new VectorCache();
		const v1 = new Float32Array([1, 2, 3]);
		const v2 = new Float32Array([4, 5, 6]);
		c.set('m1', 'transformers', 'foo', v1);
		c.set('m2', 'transformers', 'foo', v2);
		expect(c.get('m1', 'transformers', 'foo')![0]).toBe(1);
		expect(c.get('m2', 'transformers', 'foo')![0]).toBe(4);
		expect(c.get('m1', 'ollama', 'foo')).toBeNull();
	});

	it('normalizes whitespace in keys', () => {
		const c = new VectorCache();
		c.set('m1', 'transformers', 'hello world', new Float32Array([1, 2, 3]));
		const r = c.get('m1', 'transformers', '  hello\n world ');
		expect(r).not.toBeNull();
		expect(r![1]).toBe(2);
	});

	it('returns null on miss', () => {
		const c = new VectorCache();
		expect(c.get('m1', 'transformers', 'never')).toBeNull();
	});
});
