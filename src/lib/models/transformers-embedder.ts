/**
 * In-browser embedder via @huggingface/transformers (v3+) with WebGPU
 * acceleration when available, WASM fallback otherwise.
 *
 * Returns the *full* embedding picture — pooled vector AND per-token
 * contextual vectors AND token strings — in a single forward pass.
 * This is what makes the token-heatmap viz possible.
 */

import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { l2NormalizeInPlace } from '../math/stats.ts';
import type { Embedder, EmbeddingResult, LoadProgress, ModelInfo, Token } from './types.ts';

// HF is the source of truth — never look for models on the local filesystem.
env.allowLocalModels = false;

export class TransformersEmbedder implements Embedder {
	readonly backend = 'transformers' as const;
	private extractor: FeatureExtractionPipeline | null = null;
	private loadPromise: Promise<void> | null = null;
	private device: 'webgpu' | 'wasm';
	// ONNX Runtime reuses output tensor buffers across inferences. Running two
	// embed() calls concurrently lets the second one's results overwrite the
	// first's tensor.data before we copy from it. Serialize so each call has
	// exclusive access to the underlying buffer.
	private queue: Promise<unknown> = Promise.resolve();

	constructor(
		public readonly model: ModelInfo,
		opts: { device?: 'webgpu' | 'wasm' } = {}
	) {
		if (!model.hf) {
			throw new Error(`Model ${model.id} has no Hugging Face configuration`);
		}
		this.device = opts.device ?? 'webgpu';
	}

	load(onProgress?: (p: LoadProgress) => void): Promise<void> {
		if (this.loadPromise) return this.loadPromise;
		this.loadPromise = this._load(onProgress);
		return this.loadPromise;
	}

	private async _load(onProgress?: (p: LoadProgress) => void): Promise<void> {
		const hf = this.model.hf!;
		const baseProgress: Omit<LoadProgress, 'status'> = {
			modelId: this.model.id,
			backend: this.backend
		};
		onProgress?.({ ...baseProgress, status: 'loading', message: `Resolving ${hf.repo}…` });

		try {
			// `pipeline()` has many overloads; flattening into a plain options
			// object + a cast keeps the TS resolver from blowing up.
			const options = {
				device: this.device,
				dtype: hf.dtype ?? 'q8',
				progress_callback: (data: ProgressEvent) => {
					forwardProgress(data, this.model.id, this.backend, onProgress);
				}
			};
			// The pipeline() return type is a union of every pipeline class —
			// too complex for TS to represent at the call site. Cast through unknown.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const callable = pipeline as unknown as (task: string, model: string, opts: unknown) => Promise<unknown>;
			this.extractor = (await callable('feature-extraction', hf.repo, options)) as FeatureExtractionPipeline;

			onProgress?.({
				...baseProgress,
				status: 'ready',
				progress: 1,
				message: `Ready · ${this.device.toUpperCase()}`
			});
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			onProgress?.({ ...baseProgress, status: 'error', error: message });
			this.loadPromise = null; // allow retry
			throw e;
		}
	}

	embed(text: string): Promise<EmbeddingResult> {
		// Chain through the serialization queue so we never run two inferences
		// against the same pipeline at once.
		const next = this.queue.then(() => this.embedInternal(text));
		this.queue = next.catch(() => undefined);
		return next;
	}

	private async embedInternal(text: string): Promise<EmbeddingResult> {
		if (!this.extractor) throw new Error('Model not loaded — call load() first.');
		const t0 = performance.now();

		// Apply the model's "document" prefix (slots are treated as documents).
		const prefixTemplate = this.model.prefixes?.document ?? this.model.prefixes?.query;
		const input = prefixTemplate ? prefixTemplate.replace('{text}', text) : text;

		// Run with no built-in pooling. We pool ourselves so we keep per-token
		// vectors for sentence transformers; static models output already-pooled
		// tensors so we just unwrap them.
		const tensor = await this.extractor(input, { pooling: 'none' });
		const dims = tensor.dims as number[];
		// IMPORTANT: copy tensor.data immediately. ONNX Runtime may recycle the
		// underlying buffer for the next inference.
		const rawData = new Float32Array(tensor.data as Float32Array);

		let pooled: Float32Array;
		let hiddenDim: number;
		let seqLen = 1;
		let tokens: Token[] | undefined;
		let tokenVectors: Float32Array | undefined;

		if (dims.length === 3) {
			// [1, seqLen, hiddenDim] — contextual transformer output.
			seqLen = dims[1];
			hiddenDim = dims[2];

			const tokenizer = this.extractor.tokenizer;
			const encoded = (await tokenizer(input, { return_tensor: false })) as {
				input_ids: number[];
			};
			const tokenIds = encoded.input_ids;
			tokens = tokenIds.slice(0, seqLen).map((id, i) => {
				const text = String(tokenizer.decode([id], { skip_special_tokens: false }));
				return { id, text, position: i, isSpecial: isSpecialToken(text) };
			});

			pooled = pool(rawData, seqLen, hiddenDim, this.model.pooling);
			tokenVectors = rawData.slice(0, seqLen * hiddenDim);
		} else if (dims.length === 2) {
			// [1, hiddenDim] — already pooled (static-embedding models).
			hiddenDim = dims[1];
			pooled = rawData.slice(0, hiddenDim);
			// No per-token vectors available — that's expected for static models.
		} else {
			throw new Error(`Unexpected output tensor shape: [${dims.join(', ')}]`);
		}

		// Matryoshka truncation: if the model has a configured max < returned dim,
		// truncate then re-normalize. (Phase 3.1 will surface this in UI.)
		// For now we leave it at the model's natural dim.

		if (this.model.normalize) l2NormalizeInPlace(pooled);

		return {
			vector: pooled,
			dim: hiddenDim,
			tokens,
			tokenVectors,
			backend: this.backend,
			model: this.model,
			text,
			elapsedMs: performance.now() - t0
		};
	}

	async dispose(): Promise<void> {
		if (this.extractor) {
			await this.extractor.dispose?.();
			this.extractor = null;
		}
		this.loadPromise = null;
	}
}

// ---------- helpers ----------

interface ProgressEvent {
	status?: string;
	file?: string;
	name?: string;
	progress?: number; // 0..100 in transformers.js
	loaded?: number;
	total?: number;
}

function forwardProgress(
	data: ProgressEvent,
	modelId: string,
	backend: 'transformers',
	onProgress?: (p: LoadProgress) => void
): void {
	if (!onProgress) return;
	const file = data.file ?? data.name;
	const progress = typeof data.progress === 'number' ? data.progress / 100 : undefined;
	onProgress({
		modelId,
		backend,
		status: data.status === 'ready' ? 'ready' : 'loading',
		file,
		progress,
		loadedBytes: data.loaded,
		totalBytes: data.total,
		message: file ? `${data.status ?? 'loading'} · ${file}` : data.status
	});
}

function pool(
	flat: Float32Array,
	seqLen: number,
	dim: number,
	mode: 'mean' | 'cls' | 'last_token'
): Float32Array {
	const out = new Float32Array(dim);
	if (mode === 'cls') {
		// First token is [CLS] for BERT-family models.
		for (let d = 0; d < dim; d++) out[d] = flat[d];
		return out;
	}
	if (mode === 'last_token') {
		// Decoder-based embedders (Qwen3, etc.) put the sentence representation
		// in the final token's hidden state.
		const base = (seqLen - 1) * dim;
		for (let d = 0; d < dim; d++) out[d] = flat[base + d];
		return out;
	}
	// mean
	for (let i = 0; i < seqLen; i++) {
		const base = i * dim;
		for (let d = 0; d < dim; d++) out[d] += flat[base + d];
	}
	for (let d = 0; d < dim; d++) out[d] /= seqLen;
	return out;
}

function isSpecialToken(t: string): boolean {
	return /^\[(CLS|SEP|PAD|MASK|UNK)\]$|^<\/?s>$|^<pad>$|^<unk>$/.test(t);
}
