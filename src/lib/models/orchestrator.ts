/**
 * Picks the right embedder for a model, given current backend availability
 * and the user's preference. Hot-swaps embedders when the model changes.
 *
 * Selection rules:
 *   - preferred='transformers': use HF; if unavailable for this model, try Ollama; else error.
 *   - preferred='ollama':       use Ollama; if unavailable, try HF; else error.
 *   - preferred='auto':         prefer HF when WebGPU or WASM is up, else Ollama.
 */

import { detectBackends } from './detect.ts';
import { OllamaEmbedder } from './ollama-embedder.ts';
import { TransformersEmbedder } from './transformers-embedder.ts';
import type { Backend, BackendAvailability, Embedder, ModelInfo } from './types.ts';

export type BackendPreference = 'auto' | 'transformers' | 'ollama';

export interface SelectionPlan {
	embedder: Embedder;
	backend: Backend;
	device?: 'webgpu' | 'wasm';
	rationale: string;
}

export async function chooseEmbedder(
	model: ModelInfo,
	pref: BackendPreference,
	cachedAvailability?: BackendAvailability
): Promise<SelectionPlan> {
	const avail = cachedAvailability ?? (await detectBackends());

	const wantHf = pref === 'transformers' || pref === 'auto';
	const wantOllama = pref === 'ollama' || pref === 'auto';

	if (wantHf && model.hf && (avail.webgpu || avail.wasm)) {
		// Prefer WebGPU when available — large models (Qwen3) blow the WASM heap.
		// The short-input buffer bug from earlier transformers.js versions has
		// been verified to no longer reproduce on v3.8+ (re-checked 2026-05-26).
		// Per-model `preferredDevice` overrides this for architectures whose ops
		// don't yet work on WebGPU (ModernBERT and Gemma both fail on the rotary
		// embedding multiply kernel; they need WASM).
		let device: 'webgpu' | 'wasm';
		if (model.preferredDevice === 'wasm') {
			device = 'wasm';
		} else if (model.preferredDevice === 'webgpu' && avail.webgpu) {
			device = 'webgpu';
		} else {
			device = avail.webgpu ? 'webgpu' : 'wasm';
		}
		return {
			embedder: new TransformersEmbedder(model, { device }),
			backend: 'transformers',
			device,
			rationale: `HuggingFace · ${device.toUpperCase()}`
		};
	}

	if (wantOllama && model.ollama && avail.ollama) {
		return {
			embedder: new OllamaEmbedder(model),
			backend: 'ollama',
			rationale: `Ollama ${avail.ollamaVersion ?? ''}`.trim()
		};
	}

	// Last-ditch: if preferred path failed, swap.
	if (model.hf && (avail.webgpu || avail.wasm)) {
		const device = avail.webgpu ? 'webgpu' : 'wasm';
		return {
			embedder: new TransformersEmbedder(model, { device }),
			backend: 'transformers',
			device,
			rationale: `HuggingFace · ${device.toUpperCase()} (fallback)`
		};
	}
	if (model.ollama && avail.ollama) {
		return {
			embedder: new OllamaEmbedder(model),
			backend: 'ollama',
			rationale: `Ollama (fallback)`
		};
	}

	throw new Error(
		`No backend available for ${model.id}. WebGPU: ${avail.webgpu}, WASM: ${avail.wasm}, Ollama: ${avail.ollama}`
	);
}
