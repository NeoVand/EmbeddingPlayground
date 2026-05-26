/**
 * Chunking strategies for the RAG lab.
 *
 * Each strategy takes a text and returns an ordered list of chunks. A chunk
 * knows its own text and where it lived in the original document (so we can
 * highlight matches in context later).
 */

export interface Chunk {
	id: string;
	index: number;
	text: string;
	startChar: number;
	endChar: number;
}

export type ChunkStrategy = 'sentence' | 'paragraph' | 'fixed' | 'sliding';

export interface ChunkOptions {
	strategy: ChunkStrategy;
	/** Target chunk size in words (for fixed / sliding). */
	size?: number;
	/** Overlap in words (for sliding only). */
	overlap?: number;
}

export function chunkText(text: string, opts: ChunkOptions): Chunk[] {
	const t = text.trim();
	if (!t) return [];

	switch (opts.strategy) {
		case 'sentence':
			return chunkBySentence(t);
		case 'paragraph':
			return chunkByParagraph(t);
		case 'fixed':
			return chunkFixed(t, opts.size ?? 30);
		case 'sliding':
			return chunkSliding(t, opts.size ?? 30, opts.overlap ?? 10);
	}
}

function chunkBySentence(text: string): Chunk[] {
	// Match sentence-ending punctuation followed by whitespace. Keeps the
	// punctuation attached to the sentence. Handles abbreviations crudely.
	const out: Chunk[] = [];
	const re = /[^.!?]+[.!?]+(?:\s+|$)/g;
	let m: RegExpExecArray | null;
	let idx = 0;
	while ((m = re.exec(text)) != null) {
		const piece = m[0].trim();
		if (!piece) continue;
		const start = m.index;
		const end = start + m[0].length;
		out.push({
			id: `s${idx}`,
			index: idx,
			text: piece,
			startChar: start,
			endChar: end
		});
		idx++;
	}
	// Anything after the last sentence ender (no punctuation at EOF)
	const lastEnd = out.length > 0 ? out[out.length - 1].endChar : 0;
	const tail = text.slice(lastEnd).trim();
	if (tail) {
		out.push({
			id: `s${idx}`,
			index: idx,
			text: tail,
			startChar: lastEnd,
			endChar: text.length
		});
	}
	return out;
}

function chunkByParagraph(text: string): Chunk[] {
	const parts = text.split(/\n\s*\n+/);
	const out: Chunk[] = [];
	let cursor = 0;
	let idx = 0;
	for (const raw of parts) {
		const t = raw.trim();
		if (!t) continue;
		const start = text.indexOf(t, cursor);
		const end = start + t.length;
		out.push({
			id: `p${idx}`,
			index: idx,
			text: t,
			startChar: start,
			endChar: end
		});
		cursor = end;
		idx++;
	}
	return out;
}

function chunkFixed(text: string, size: number): Chunk[] {
	const wordRe = /\S+/g;
	const words: { word: string; start: number; end: number }[] = [];
	let m: RegExpExecArray | null;
	while ((m = wordRe.exec(text)) != null) {
		words.push({ word: m[0], start: m.index, end: m.index + m[0].length });
	}
	const out: Chunk[] = [];
	for (let i = 0, idx = 0; i < words.length; i += size, idx++) {
		const slice = words.slice(i, i + size);
		const start = slice[0].start;
		const end = slice[slice.length - 1].end;
		out.push({
			id: `f${idx}`,
			index: idx,
			text: text.slice(start, end),
			startChar: start,
			endChar: end
		});
	}
	return out;
}

function chunkSliding(text: string, size: number, overlap: number): Chunk[] {
	const wordRe = /\S+/g;
	const words: { word: string; start: number; end: number }[] = [];
	let m: RegExpExecArray | null;
	while ((m = wordRe.exec(text)) != null) {
		words.push({ word: m[0], start: m.index, end: m.index + m[0].length });
	}
	const step = Math.max(1, size - overlap);
	const out: Chunk[] = [];
	for (let i = 0, idx = 0; i < words.length; i += step, idx++) {
		const slice = words.slice(i, i + size);
		if (slice.length === 0) break;
		const start = slice[0].start;
		const end = slice[slice.length - 1].end;
		out.push({
			id: `w${idx}`,
			index: idx,
			text: text.slice(start, end),
			startChar: start,
			endChar: end
		});
		if (i + size >= words.length) break; // already covered the tail
	}
	return out;
}

export const STRATEGY_LABELS: Record<ChunkStrategy, string> = {
	sentence: 'Sentence',
	paragraph: 'Paragraph',
	fixed: 'Fixed (N words)',
	sliding: 'Sliding window'
};

export const STRATEGY_DESCRIPTIONS: Record<ChunkStrategy, string> = {
	sentence: 'Split at sentence boundaries. Small chunks, fine-grained ranking.',
	paragraph: 'Split at blank lines. Larger chunks; each one has more context.',
	fixed: 'Fixed-size chunks of N words. The strategy most production RAG systems start with.',
	sliding:
		'Sliding window of N words with M overlap. Reduces the chance of losing context at chunk boundaries.'
};
