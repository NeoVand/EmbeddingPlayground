/**
 * The Anatomy engine. Loads a custom MiniLM ONNX export whose graph exposes
 * every internal as a named output — 7 hidden states (embeddings output +
 * one per block) and 6 post-softmax attention tensors — and runs it on user
 * text. transformers.js surfaces every named ONNX output automatically, so
 * this needs no library patches; the model ships with the app under
 * static/models/minilm-anatomy/ (int8, ~23 MB).
 *
 * This model is the teaching skeleton: it is always all-MiniLM-L6-v2
 * regardless of the playground's selected model — 6 layers × 12 heads × 384
 * dims is the right size to actually see.
 */

import { AutoModel, AutoTokenizer, env } from '@huggingface/transformers';
import { base } from '$app/paths';
import type { Token } from '$lib/models/types.js';

export const ANATOMY = {
	layers: 6,
	heads: 12,
	dim: 384,
	headDim: 32,
	mlpDim: 1536,
	vocab: 30522,
	/** Hard cap so attention matrices stay readable and cheap. */
	maxTokens: 32,
	modelName: 'all-MiniLM-L6-v2'
} as const;

export interface AnatomyRun {
	text: string;
	tokens: Token[];
	seq: number;
	/** hidden[l] = layer l's output, flat seq×384; hidden[0] = embeddings. */
	hidden: Float32Array[];
	/** attn[l] = layer l's post-softmax attention, flat 12×seq×seq. */
	attn: Float32Array[];
	/** Mean-pooled final hidden state, before normalization. */
	pooledRaw: Float32Array;
	/** L2-normalized pooled vector — the sentence embedding. */
	pooled: Float32Array;
	elapsedMs: number;
}

export interface AnatomyLoadState {
	status: 'idle' | 'loading' | 'ready' | 'error';
	/** 0..1 when a download is in flight. */
	progress?: number;
	message?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let model: any = null;
let tokenizer: any = null;
let loadPromise: Promise<void> | null = null;
// The ONNX session recycles output buffers between runs — serialize.
let queue: Promise<unknown> = Promise.resolve();

export async function loadAnatomy(onProgress?: (s: AnatomyLoadState) => void): Promise<void> {
	if (loadPromise) return loadPromise;
	loadPromise = (async () => {
		onProgress?.({ status: 'loading', message: 'tokenizer' });
		// Tokenizer first, while local-model resolution is still off.
		tokenizer = await AutoTokenizer.from_pretrained('Xenova/all-MiniLM-L6-v2');

		// The anatomy model lives in the app's own static files. Scope the
		// local-model flags to this load; the registry models stay remote.
		const prevAllow = env.allowLocalModels;
		const prevRemote = env.allowRemoteModels;
		const prevPath = env.localModelPath;
		env.allowLocalModels = true;
		env.allowRemoteModels = false; // 'minilm-anatomy' is not a HF repo — don't 401 the hub
		env.localModelPath = `${location.origin}${base}/models/`;
		try {
			const device = 'gpu' in navigator ? 'webgpu' : 'wasm';
			model = await AutoModel.from_pretrained('minilm-anatomy', {
				device,
				dtype: 'q8',
				progress_callback: (p: { status?: string; progress?: number; file?: string }) => {
					onProgress?.({
						status: 'loading',
						progress: typeof p.progress === 'number' ? p.progress / 100 : undefined,
						message: p.file ?? p.status
					});
				}
			});
			onProgress?.({ status: 'ready', progress: 1 });
		} catch (e) {
			loadPromise = null;
			onProgress?.({ status: 'error', message: e instanceof Error ? e.message : String(e) });
			throw e;
		} finally {
			env.allowLocalModels = prevAllow;
			env.allowRemoteModels = prevRemote;
			env.localModelPath = prevPath;
		}
	})();
	return loadPromise;
}

export function anatomyReady(): boolean {
	return model != null && tokenizer != null;
}

export function runAnatomy(text: string): Promise<AnatomyRun> {
	const next = queue.then(() => runInternal(text));
	queue = next.catch(() => undefined);
	return next;
}

async function runInternal(text: string): Promise<AnatomyRun> {
	if (!model || !tokenizer) throw new Error('Anatomy model not loaded');
	const t0 = performance.now();

	const enc = await tokenizer(text, { truncation: true, max_length: ANATOMY.maxTokens });
	const idsRaw = enc.input_ids.data as BigInt64Array;
	const seq = idsRaw.length;
	const tokens: Token[] = [];
	for (let i = 0; i < seq; i++) {
		const id = Number(idsRaw[i]);
		const t = String(tokenizer.decode([id], { skip_special_tokens: false }));
		tokens.push({ id, text: t, position: i, isSpecial: /^\[(CLS|SEP|PAD|MASK|UNK)\]$/.test(t) });
	}

	const out = await model(enc);

	const hidden: Float32Array[] = [];
	for (let l = 0; l <= ANATOMY.layers; l++) {
		// Defensive copy off the shared ONNX output buffer.
		hidden.push(new Float32Array(out[`hidden_${l}`].data as Float32Array));
	}
	const attn: Float32Array[] = [];
	for (let l = 0; l < ANATOMY.layers; l++) {
		attn.push(new Float32Array(out[`attn_${l}`].data as Float32Array));
	}

	// Mean pooling over all tokens (no padding in a single-text run), then L2.
	const dim = ANATOMY.dim;
	const last = hidden[ANATOMY.layers];
	const pooledRaw = new Float32Array(dim);
	for (let i = 0; i < seq; i++) {
		const b = i * dim;
		for (let d = 0; d < dim; d++) pooledRaw[d] += last[b + d];
	}
	for (let d = 0; d < dim; d++) pooledRaw[d] /= seq;
	const pooled = new Float32Array(pooledRaw);
	let n = 0;
	for (let d = 0; d < dim; d++) n += pooled[d] * pooled[d];
	n = Math.sqrt(n) || 1;
	for (let d = 0; d < dim; d++) pooled[d] /= n;

	return {
		text,
		tokens,
		seq,
		hidden,
		attn,
		pooledRaw,
		pooled,
		elapsedMs: performance.now() - t0
	};
}
