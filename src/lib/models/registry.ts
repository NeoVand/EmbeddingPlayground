/**
 * Phase 4 registry — three sentence transformers that actually work via the
 * standard transformers.js feature-extraction pipeline, spanning small /
 * medium / large:
 *
 *   MiniLM    — Xenova/all-MiniLM-L6-v2          (22M, 384-d, mean)
 *   Nomic 1.5 — nomic-ai/nomic-embed-text-v1.5   (137M, 768-d, Matryoshka)
 *   Qwen3     — onnx-community/Qwen3-Embedding-0.6B-ONNX
 *               (596M, 1024-d, last-token pooled, top of MTEB)
 *
 * Removed pending custom loader:
 *   • EmbeddingGemma — needs AutoModel + sentence_embedding output head.
 *   • static-retrieval / model2vec — needs EmbeddingBag offsets input.
 *
 * Both will return once the custom-loader code path lands.
 */

import type { ModelInfo } from './types.ts';

export const MODELS: readonly ModelInfo[] = [
	{
		id: 'minilm-l6',
		name: 'all-MiniLM-L6-v2',
		shortName: 'MiniLM',
		description:
			'The classic 22M-param baseline (2021). 384-d, mean pooled. Fast to load, weak on long text and word analogies — kept as a reference point.',
		kind: 'sentence',
		dimensions: 384,
		approxParamsM: 22,
		approxDownloadMB: 22,
		pooling: 'mean',
		normalize: true,
		hf: { repo: 'Xenova/all-MiniLM-L6-v2', dtype: 'q8' },
		ollama: { name: 'all-minilm' },
		bestFor: ['baseline']
	},
	{
		id: 'nomic-1.5',
		name: 'nomic-embed-text-v1.5',
		shortName: 'Nomic 1.5',
		description:
			'Nomic AI 137M, 768-d (2024). Matryoshka-trained — you can truncate to 512 / 256 / 128 / 64 and the model degrades gracefully. The teaching point for "how few dimensions is enough?"',
		kind: 'sentence',
		dimensions: 768,
		approxParamsM: 137,
		approxDownloadMB: 140,
		pooling: 'mean',
		normalize: true,
		matryoshkaDims: [768, 512, 256, 128, 64],
		hf: { repo: 'nomic-ai/nomic-embed-text-v1.5', dtype: 'q8' },
		ollama: { name: 'nomic-embed-text' },
		prefixes: {
			query: 'search_query: {text}',
			document: 'search_document: {text}'
		},
		bestFor: ['matryoshka', 'sentences']
	},
	{
		id: 'qwen3-0.6b',
		name: 'Qwen3-Embedding-0.6B',
		shortName: 'Qwen3',
		description:
			'Alibaba Qwen3-Embedding 596M, 1024-d (June 2025). Decoder-based, last-token pooled, top of MTEB. The big download, but the cleanest neighborhoods.',
		kind: 'sentence',
		dimensions: 1024,
		approxParamsM: 596,
		approxDownloadMB: 567,
		pooling: 'last_token',
		normalize: true,
		hf: { repo: 'onnx-community/Qwen3-Embedding-0.6B-ONNX', dtype: 'q4f16' },
		prefixes: {
			query: 'Instruct: Given a web search query, retrieve relevant passages\nQuery: {text}'
		},
		bestFor: ['sentences']
	}
] as const;

export function getModel(id: string): ModelInfo {
	const m = MODELS.find((m) => m.id === id);
	if (!m) throw new Error(`Unknown model id: ${id}`);
	return m;
}

export const DEFAULT_MODEL_ID = 'minilm-l6';

/** Returns the best model id for a given purpose. Falls back to default. */
export function recommendedFor(purpose: 'sentences' | 'analogies' | 'matryoshka' | 'baseline'): string {
	const m = MODELS.find((m) => m.bestFor?.includes(purpose));
	if (m) return m.id;
	// Analogies have no real winner in our current sentence-only lineup —
	// MiniLM is the least bad because it has the fewest learned biases.
	if (purpose === 'analogies') return 'minilm-l6';
	return DEFAULT_MODEL_ID;
}
