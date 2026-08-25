/**
 * Curated model registry. Twelve embedding models spanning ~22M to ~600M
 * params, four pooling strategies, two loader paths. All verified to run via
 * @huggingface/transformers v4 (WebGPU primary, WASM fallback).
 *
 * Pedagogical spread:
 *   MiniLM-L6            22M  · 384d  · mean      · baseline reference
 *   leaf-ir              23M  · 768d  · head      · best <30M on MTEB, 23 MB
 *   mxbai-xsmall         24M  · 384d  · mean      · instant-load tier
 *   granite-small-r2     47M  · 384d  · mean      · ModernBERT, 8k context
 *   granite-multi-97m    97M  · 384d  · cls       · 200+ languages + code
 *   nomic-1.5           137M  · 768d  · mean      · Matryoshka truncation
 *   granite-r2          149M  · 768d  · mean      · long-doc, 8k context
 *   arctic-m-v2         305M  · 768d  · cls       · multilingual (100+ langs)
 *   embedding-gemma     300M  · 768d  · head      · Google flagship (custom loader)
 *   voyage-4-nano       340M  · 2048d · mean      · first open Voyage, Matryoshka
 *   pplx-embed-0.6b     600M  · 1024d · mean      · prompt-free bidirectional Qwen3
 *   qwen3-0.6b          596M  · 1024d · last_tok  · strong MTEB, instruct queries
 *
 * transformers.js v4 notes (2026-04): the new WebGPU runtime fixed the
 * silent q8/int8 dequant bug (#1512), so ModernBERT models no longer need
 * the WASM force. EmbeddingGemma stays on WASM q8 — its quantized WebGPU
 * output was silently wrong pre-v4 (#1728) and hasn't been re-validated
 * here, and its activations don't support fp16.
 *
 * Removed / rejected:
 *   - Qwen3-Embedding-4B / 8B — 16 / 30 GB unquantized ONNX only.
 *   - static-retrieval / model2vec — EmbeddingBag offsets input not wired.
 *   - Nomic v2 (MoE) — no ONNX, requires trust_remote_code.
 *   - jina v5 nano — runs (EuroBERT, v4+) but CC BY-NC license.
 *   - harrier-oss-270m — needs manual last-token pooling + instruct templates.
 *   - jina-code-embeddings — no ONNX conversion exists.
 */

import type { ModelInfo } from './types.ts';

export const MODELS: readonly ModelInfo[] = [
	{
		id: 'mxbai-xsmall',
		name: 'mxbai-embed-xsmall-v1',
		shortName: 'MXBAI xs',
		description:
			'Mixedbread 24M (2024), 384-d, mean pooled. The smallest viable model — q8 weights are only ~24 MB so it loads almost instantly. Useful as the speed/footprint floor.',
		kind: 'sentence',
		dimensions: 384,
		approxParamsM: 24,
		approxDownloadMB: 24,
		pooling: 'mean',
		normalize: true,
		hf: { repo: 'mixedbread-ai/mxbai-embed-xsmall-v1', dtype: 'q8' },
		bestFor: ['baseline']
	},
	{
		id: 'minilm-l6',
		name: 'all-MiniLM-L6-v2',
		shortName: 'MiniLM',
		description:
			'The classic 22M-param baseline (2021), 384-d, mean pooled. Kept as a reference point for "this is what every paper benchmarks against" — but the Granite Small R2 below is the modern upgrade.',
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
		id: 'leaf-ir',
		name: 'mdbr-leaf-ir',
		shortName: 'LEAF',
		description:
			'MongoDB LEAF-IR (2025), 23M, 768-d — #1 on MTEB v2 English under 30M params, distilled from arctic-embed. The ONNX bakes pooling + a dense head and returns the sentence vector directly, so the token heatmap is unavailable. 23 MB download.',
		kind: 'sentence',
		dimensions: 768,
		approxParamsM: 23,
		approxDownloadMB: 23,
		pooling: 'mean',
		normalize: true,
		loaderKind: 'sentence-embedding-head',
		hf: { repo: 'onnx-community/mdbr-leaf-ir-ONNX', dtype: 'q8' },
		prefixes: {
			query: 'Represent this sentence for searching relevant passages: {text}'
		},
		bestFor: ['baseline', 'sentences']
	},
	{
		id: 'granite-small-r2',
		name: 'granite-embedding-small-english-r2',
		shortName: 'Granite S',
		description:
			'IBM Granite Small R2 (2025), 47M, 384-d, ModernBERT backbone with 8192-token context (16× MiniLM). The honest "modern small" replacement for MiniLM — same speed tier, same dimension, longer context, better MTEB.',
		kind: 'sentence',
		dimensions: 384,
		approxParamsM: 47,
		approxDownloadMB: 30,
		pooling: 'mean',
		normalize: true,
		hf: { repo: 'onnx-community/granite-embedding-small-english-r2-ONNX', dtype: 'q8' }
	},
	{
		id: 'granite-multi-97m',
		name: 'granite-embedding-97m-multilingual-r2',
		shortName: 'Granite ML',
		description:
			'IBM Granite Multilingual R2 (2026), 97M ModernBERT, 384-d, CLS pooled, 32k context. Covers 200+ languages plus 9 programming languages — the registry’s multilingual and code model, and the best open multilingual retriever under 100M params.',
		kind: 'sentence',
		dimensions: 384,
		approxParamsM: 97,
		approxDownloadMB: 98,
		pooling: 'cls',
		normalize: true,
		hf: { repo: 'onnx-community/granite-embedding-97m-multilingual-r2-ONNX', dtype: 'q8' },
		bestFor: ['sentences']
	},
	{
		id: 'nomic-1.5',
		name: 'nomic-embed-text-v1.5',
		shortName: 'Nomic 1.5',
		description:
			'Nomic AI 137M (2024), 768-d, Matryoshka-trained — you can truncate to 512 / 256 / 128 / 64 and quality degrades gracefully. The teaching point for "how few dimensions do you really need?"',
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
		id: 'granite-r2',
		name: 'granite-embedding-english-r2',
		shortName: 'Granite',
		description:
			'IBM Granite English R2 (2025), 149M, 768-d, ModernBERT with 8192-token context. Strong long-document retrieval — the model to pick when chunks are large or you want full passages.',
		kind: 'sentence',
		dimensions: 768,
		approxParamsM: 149,
		approxDownloadMB: 144,
		pooling: 'mean',
		normalize: true,
		hf: { repo: 'onnx-community/granite-embedding-english-r2-ONNX', dtype: 'q8' },
		bestFor: ['sentences']
	},
	{
		id: 'arctic-m-v2',
		name: 'snowflake-arctic-embed-m-v2.0',
		shortName: 'Arctic M',
		description:
			'Snowflake Arctic Embed M v2.0 (2024), 305M, 768-d, CLS pooled. XLM-RoBERTa backbone covering 100+ languages — the multilingual workhorse in the registry.',
		kind: 'sentence',
		dimensions: 768,
		approxParamsM: 305,
		approxDownloadMB: 311,
		pooling: 'cls',
		normalize: true,
		hf: { repo: 'Snowflake/snowflake-arctic-embed-m-v2.0', dtype: 'q8' },
		prefixes: {
			query: 'query: {text}'
		},
		bestFor: ['sentences']
	},
	{
		id: 'embedding-gemma',
		name: 'embeddinggemma-300m',
		shortName: 'Gemma',
		description:
			'Google EmbeddingGemma 300M (Sept 2025), 768-d, Matryoshka (512 / 256 / 128). Uses a sentence_embedding output head — needs the custom AutoModel loader. Kept on WASM: its quantized WebGPU output was silently wrong pre-transformers.js-v4 and is not yet re-validated.',
		kind: 'sentence',
		dimensions: 768,
		approxParamsM: 300,
		approxDownloadMB: 309,
		pooling: 'mean',
		normalize: true,
		matryoshkaDims: [768, 512, 256, 128],
		loaderKind: 'sentence-embedding-head',
		preferredDevice: 'wasm',
		hf: { repo: 'onnx-community/embeddinggemma-300m-ONNX', dtype: 'q8' },
		prefixes: {
			query: 'task: search result | query: {text}',
			document: 'title: none | text: {text}'
		},
		bestFor: ['sentences', 'matryoshka']
	},
	{
		id: 'voyage-4-nano',
		name: 'voyage-4-nano',
		shortName: 'Voyage 4n',
		description:
			'Voyage’s first open-weights model (Jan 2026), 340M bidirectional Qwen3, 2048-d, Matryoshka down to 256, 32k context, multilingual, Apache 2.0. Quantization-aware trained, so the q4f16 weights stay accurate — top quality-per-megabyte here.',
		kind: 'sentence',
		dimensions: 2048,
		approxParamsM: 340,
		approxDownloadMB: 211,
		pooling: 'mean',
		normalize: true,
		matryoshkaDims: [2048, 1024, 512, 256],
		hf: { repo: 'onnx-community/voyage-4-nano-ONNX', dtype: 'q4f16' },
		prefixes: {
			query: 'Represent the query for retrieving supporting documents: {text}',
			document: 'Represent the document for retrieval: {text}'
		},
		bestFor: ['sentences', 'matryoshka']
	},
	{
		id: 'pplx-embed-0.6b',
		name: 'pplx-embed-v1-0.6b',
		shortName: 'PPLX',
		description:
			'Perplexity pplx-embed v1 (Jan 2026), 0.6B bidirectional Qwen3, 1024-d, mean pooled, Matryoshka, 32k context, MIT. Deliberately prompt-free — no instruction prefixes at all. q4 weights; WebGPU strongly recommended.',
		kind: 'sentence',
		dimensions: 1024,
		approxParamsM: 600,
		approxDownloadMB: 399,
		pooling: 'mean',
		normalize: true,
		preferredDevice: 'webgpu',
		hf: { repo: 'perplexity-ai/pplx-embed-v1-0.6b', dtype: 'q4' },
		bestFor: ['sentences']
	},
	{
		id: 'qwen3-0.6b',
		name: 'Qwen3-Embedding-0.6B',
		shortName: 'Qwen3',
		description:
			'Alibaba Qwen3-Embedding 596M (June 2025), 1024-d, decoder-based with last-token pooling. Top of MTEB for its size. The big download, but the cleanest neighborhoods.',
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

// Default to MiniLM — small, fast, WebGPU-compatible, instant on first load.
// Users can switch to Granite Small R2 for the same speed tier with longer
// context and better quality (but WASM-only, so a hair slower).
export const DEFAULT_MODEL_ID = 'minilm-l6';

/** Returns the best model id for a given purpose. Falls back to default. */
export function recommendedFor(
	purpose: 'sentences' | 'analogies' | 'matryoshka' | 'baseline'
): string {
	const m = MODELS.find((m) => m.bestFor?.includes(purpose));
	if (m) return m.id;
	if (purpose === 'analogies') return 'minilm-l6';
	return DEFAULT_MODEL_ID;
}
