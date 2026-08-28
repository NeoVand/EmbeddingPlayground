/**
 * Per-head attention statistics and auto-badges, after Clark et al. 2019
 * ("What Does BERT Look At?"): heads specialize into recognizable types —
 * positional-offset heads, delimiter sinks, broad bag-of-words heads —
 * and cheap statistics identify them live, which teaches far better than
 * 72 raw heatmaps.
 *
 * Attention tensors are row-stochastic: attn[h, q, k] is how much query
 * token q attends to key token k, rows summing to 1.
 */

export type HeadKind = 'prev' | 'next' | 'self' | 'cls' | 'sep' | 'broad' | 'focused' | 'mixed';

export interface HeadStat {
	layer: number;
	head: number;
	/** Mean attention at offset −1 / +1 / 0, over interior query rows. */
	prev: number;
	next: number;
	self: number;
	/** Mean attention mass landing on [CLS] (k=0) / [SEP] (k=seq−1). */
	cls: number;
	sep: number;
	/** Mean row entropy, normalized by log(seq) to 0..1. */
	entropy: number;
	kind: HeadKind;
	label: string;
}

const LABELS: Record<HeadKind, string> = {
	prev: '← prev token',
	next: 'next token →',
	self: 'self',
	cls: '[CLS] sink',
	sep: '[SEP] sink',
	broad: 'broad',
	focused: 'focused',
	mixed: 'mixed'
};

/** attn: flat [heads, seq, seq]; returns one stat per head. */
export function computeHeadStats(
	attn: Float32Array,
	seq: number,
	heads: number,
	layer: number
): HeadStat[] {
	const out: HeadStat[] = [];
	const logSeq = Math.log(Math.max(2, seq));
	for (let h = 0; h < heads; h++) {
		const base = h * seq * seq;
		let prev = 0;
		let next = 0;
		let self = 0;
		let cls = 0;
		let sep = 0;
		let interior = 0;
		let entSum = 0;
		for (let q = 0; q < seq; q++) {
			const row = base + q * seq;
			// Row entropy over all rows.
			let ent = 0;
			for (let k = 0; k < seq; k++) {
				const p = attn[row + k];
				if (p > 1e-9) ent -= p * Math.log(p);
			}
			entSum += ent / logSeq;
			// Offset + delimiter stats over interior rows only, so [CLS]/[SEP]
			// edge rows don't distort them.
			if (q === 0 || q === seq - 1) continue;
			interior++;
			prev += attn[row + q - 1];
			next += attn[row + q + 1];
			self += attn[row + q];
			cls += attn[row];
			sep += attn[row + seq - 1];
		}
		const n = Math.max(1, interior);
		const stat: Omit<HeadStat, 'kind' | 'label'> = {
			layer,
			head: h,
			prev: prev / n,
			next: next / n,
			self: self / n,
			cls: cls / n,
			sep: sep / n,
			entropy: entSum / seq
		};
		const kind = classify(stat);
		out.push({ ...stat, kind, label: LABELS[kind] });
	}
	return out;
}

function classify(s: Omit<HeadStat, 'kind' | 'label'>): HeadKind {
	// Priority order: strong positional signatures first, then delimiter
	// sinks, then the entropy extremes.
	if (s.prev > 0.4) return 'prev';
	if (s.next > 0.4) return 'next';
	if (s.sep > 0.5) return 'sep';
	if (s.cls > 0.4) return 'cls';
	if (s.self > 0.35) return 'self';
	if (s.entropy > 0.88) return 'broad';
	if (s.entropy < 0.35) return 'focused';
	return 'mixed';
}

/** Distinct hue per attention head — golden-angle spacing, no two neighbors alike. */
export function headHue(h: number): number {
	return (h * 137.5) % 360;
}

/** Per-token attention received (column mass), for sizing token emphasis. */
export function columnMass(attn: Float32Array, seq: number, heads: number, head: number | null): Float32Array {
	const out = new Float32Array(seq);
	const hs = head == null ? [...Array(heads).keys()] : [head];
	for (const h of hs) {
		const base = h * seq * seq;
		for (let q = 0; q < seq; q++) {
			for (let k = 0; k < seq; k++) out[k] += attn[base + q * seq + k];
		}
	}
	const denom = hs.length * seq;
	for (let k = 0; k < seq; k++) out[k] /= denom;
	return out;
}
