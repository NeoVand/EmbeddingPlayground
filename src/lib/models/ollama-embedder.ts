/**
 * Ollama HTTP embedder — the fallback when HuggingFace assets can't load
 * (corp network blocks, model too big for WebGPU, etc).
 *
 * Tradeoff: Ollama only returns the pooled sentence vector. No token-level
 * vectors, no token strings. The TokenHeatmap viz is disabled when this
 * backend is selected; DimensionBars and SemanticCloud still work.
 */

import { OLLAMA_URL } from './detect.ts';
import type { Embedder, EmbeddingResult, LoadProgress, ModelInfo } from './types.ts';

export class OllamaEmbedder implements Embedder {
	readonly backend = 'ollama' as const;
	private loaded = false;
	private loadPromise: Promise<void> | null = null;

	constructor(
		public readonly model: ModelInfo,
		private baseUrl: string = OLLAMA_URL
	) {
		if (!model.ollama) throw new Error(`Model ${model.id} has no Ollama configuration`);
	}

	load(onProgress?: (p: LoadProgress) => void): Promise<void> {
		if (this.loadPromise) return this.loadPromise;
		this.loadPromise = this._load(onProgress);
		return this.loadPromise;
	}

	private async _load(onProgress?: (p: LoadProgress) => void): Promise<void> {
		const tag = this.model.ollama!.name;
		const base: Omit<LoadProgress, 'status'> = { modelId: this.model.id, backend: this.backend };
		onProgress?.({ ...base, status: 'loading', message: `Checking ${tag}…` });

		try {
			// Is the model already pulled?
			const showResp = await fetch(`${this.baseUrl}/api/show`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: tag })
			});
			if (showResp.ok) {
				this.loaded = true;
				onProgress?.({ ...base, status: 'ready', progress: 1, message: `Ready · OLLAMA` });
				return;
			}

			// Pull it. /api/pull streams NDJSON with progress.
			onProgress?.({ ...base, status: 'loading', message: `Pulling ${tag}…`, progress: 0 });
			await this.pullWithProgress(tag, (loaded, total, file) => {
				const progress = total > 0 ? loaded / total : undefined;
				onProgress?.({
					...base,
					status: 'loading',
					file,
					progress,
					loadedBytes: loaded,
					totalBytes: total,
					message: file ? `pulling · ${file}` : 'pulling'
				});
			});
			this.loaded = true;
			onProgress?.({ ...base, status: 'ready', progress: 1, message: `Ready · OLLAMA` });
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			onProgress?.({ ...base, status: 'error', error: message });
			this.loadPromise = null;
			throw e;
		}
	}

	private async pullWithProgress(
		tag: string,
		onChunk: (loaded: number, total: number, file?: string) => void
	): Promise<void> {
		const resp = await fetch(`${this.baseUrl}/api/pull`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: tag, stream: true })
		});
		if (!resp.ok || !resp.body) throw new Error(`Ollama pull failed: HTTP ${resp.status}`);
		const reader = resp.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let nl: number;
			while ((nl = buffer.indexOf('\n')) >= 0) {
				const line = buffer.slice(0, nl).trim();
				buffer = buffer.slice(nl + 1);
				if (!line) continue;
				try {
					const j = JSON.parse(line) as {
						status?: string;
						digest?: string;
						completed?: number;
						total?: number;
						error?: string;
					};
					if (j.error) throw new Error(j.error);
					if (j.total && j.completed != null) onChunk(j.completed, j.total, j.digest ?? j.status);
				} catch {
					/* ignore parse glitches on partial chunks */
				}
			}
		}
	}

	async embed(text: string): Promise<EmbeddingResult> {
		if (!this.loaded) throw new Error('Ollama model not loaded — call load() first.');
		const t0 = performance.now();
		const tag = this.model.ollama!.name;
		const tpl = this.model.prefixes?.document ?? this.model.prefixes?.query;
		const input = tpl ? tpl.replace('{text}', text) : text;

		const r = await fetch(`${this.baseUrl}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: tag, prompt: input })
		});
		if (!r.ok) throw new Error(`Ollama /api/embeddings failed: HTTP ${r.status}`);
		const data = (await r.json()) as { embedding: number[] };

		const vector = Float32Array.from(data.embedding);
		return {
			vector,
			dim: vector.length,
			backend: this.backend,
			model: this.model,
			text,
			elapsedMs: performance.now() - t0
		};
	}

	async dispose(): Promise<void> {
		this.loaded = false;
		this.loadPromise = null;
	}
}
