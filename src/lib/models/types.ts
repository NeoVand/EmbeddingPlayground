/**
 * Shared types for the embedding layer. Keep this file dependency-free so
 * UI code can import types without pulling in transformers.js / ollama clients.
 */

export type Backend = 'transformers' | 'ollama';

export interface HfConfig {
	/** HF repo, e.g. `Xenova/all-MiniLM-L6-v2`. */
	repo: string;
	/** Quantization. Default 'q8' (small + accurate). */
	dtype?: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16' | 'int8' | 'uint8';
}

export interface OllamaConfig {
	/** Ollama tag, e.g. `nomic-embed-text` or `mxbai-embed-large:latest`. */
	name: string;
}

export interface ModelInfo {
	/** Stable id used in URLs / state. */
	id: string;
	/** Display name. */
	name: string;
	/** Short label for compact UI (chips, axis labels). */
	shortName: string;
	/** One- or two-sentence description shown in the model selector. */
	description: string;
	/**
	 * 'sentence' — contextual transformer with a sentence-level head. Strong on
	 *              semantic similarity for full sentences, weak on word analogies.
	 * 'static'  — table-lookup embedding (EmbeddingBag / word2vec style). Linear
	 *              vector-space arithmetic actually works; great for analogies.
	 */
	kind: 'sentence' | 'static';
	/** Vector dimensionality. */
	dimensions: number;
	/** Approximate parameter count in millions. Used for display only. */
	approxParamsM: number;
	/** Approximate download size in MB at the chosen dtype, for the HUD. */
	approxDownloadMB: number;
	/** Pooling strategy used to produce the sentence vector from token vectors. */
	pooling: 'mean' | 'cls' | 'last_token';
	/**
	 * Which transformers.js loader path to use.
	 *   'pipeline' — standard `pipeline('feature-extraction', repo)`; we pool ourselves.
	 *   'sentence-embedding-head' — needs `AutoModel.from_pretrained()` and reads
	 *     the `sentence_embedding` output key (Gemma uses this — its dense
	 *     projection heads aren't applied by the feature-extraction pipeline).
	 */
	loaderKind?: 'pipeline' | 'sentence-embedding-head';
	/**
	 * Some architectures (ModernBERT, Gemma) have ops that don't yet run on
	 * WebGPU in transformers.js — rotary-embedding multiplies fail. When set
	 * to 'wasm', the orchestrator forces the WASM device even if WebGPU is
	 * available. WASM is slower but reliable for these models.
	 */
	preferredDevice?: 'webgpu' | 'wasm';
	/** Whether the model expects L2-normalized output (most modern ones do). */
	normalize: boolean;
	/** Matryoshka-supported dimensions, descending. UI can offer truncation. */
	matryoshkaDims?: number[];
	/** When non-null, the model can be fetched / run via transformers.js. */
	hf?: HfConfig;
	/** When non-null, the model can be served via a local Ollama instance. */
	ollama?: OllamaConfig;
	/**
	 * Prefix templates the model expects for query / document text.
	 * The placeholder `{text}` is replaced with the user input. If a role's
	 * template is absent, the raw text is used.
	 */
	prefixes?: { query?: string; document?: string };
	/**
	 * What pedagogical use this model is best for. UI uses this to highlight
	 * the right model for each tab.
	 */
	bestFor?: ('sentences' | 'analogies' | 'matryoshka' | 'baseline')[];
}

export interface Token {
	/** Decoded token text — may include special markers like ##suffix or ▁prefix. */
	text: string;
	/** Vocab id. */
	id: number;
	/** Index in the sequence (0-based). */
	position: number;
	/** True for [CLS], [SEP], [PAD], <s>, </s>, etc. */
	isSpecial: boolean;
}

export interface EmbeddingResult {
	/** Pooled, optionally-normalized sentence embedding. Length = model.dimensions. */
	vector: Float32Array;
	/** Convenience — equals vector.length. */
	dim: number;
	/** Tokens, in order. Undefined when the backend doesn't expose tokenization (Ollama). */
	tokens?: Token[];
	/** Flat row-major tokens.length × dim matrix of per-token contextual vectors. */
	tokenVectors?: Float32Array;
	/** Where this embedding came from. */
	backend: Backend;
	/** Snapshot of the model that produced it. */
	model: ModelInfo;
	/** Source text. */
	text: string;
	/** End-to-end embedding time in ms (includes tokenization + model + pooling). */
	elapsedMs: number;
}

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface LoadProgress {
	modelId: string;
	backend: Backend;
	status: LoadStatus;
	/** Currently-downloading file, when known. */
	file?: string;
	/** 0..1, when known. */
	progress?: number;
	loadedBytes?: number;
	totalBytes?: number;
	/** Free-form status message for the HUD. */
	message?: string;
	error?: string;
}

export interface Embedder {
	readonly backend: Backend;
	readonly model: ModelInfo;
	/** Idempotent — calling twice is fine. */
	load(onProgress?: (p: LoadProgress) => void): Promise<void>;
	embed(text: string): Promise<EmbeddingResult>;
	dispose(): Promise<void>;
}

export interface BackendAvailability {
	webgpu: boolean;
	wasm: boolean;
	ollama: boolean;
	/** When ollama is true, the version string it reported. */
	ollamaVersion?: string;
}
