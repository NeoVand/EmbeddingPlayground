/**
 * Backend probing — answers "what can I actually use right now?"
 * Runs once at app boot and again on retry.
 */

import type { BackendAvailability } from './types.ts';

const OLLAMA_URL = 'http://localhost:11434';

export async function detectBackends(): Promise<BackendAvailability> {
	const [webgpu, ollama] = await Promise.all([detectWebGpu(), detectOllama()]);
	return {
		webgpu: webgpu.available,
		wasm: true, // transformers.js ships a WASM runtime; always available
		ollama: ollama.available,
		ollamaVersion: ollama.version
	};
}

async function detectWebGpu(): Promise<{ available: boolean }> {
	if (typeof navigator === 'undefined' || !('gpu' in navigator)) return { available: false };
	try {
		const adapter = await navigator.gpu.requestAdapter();
		return { available: !!adapter };
	} catch {
		return { available: false };
	}
}

async function detectOllama(): Promise<{ available: boolean; version?: string }> {
	try {
		const ctl = new AbortController();
		const timer = setTimeout(() => ctl.abort(), 800);
		const r = await fetch(`${OLLAMA_URL}/api/version`, { signal: ctl.signal });
		clearTimeout(timer);
		if (!r.ok) return { available: false };
		const data = (await r.json()) as { version?: string };
		return { available: true, version: data.version };
	} catch {
		return { available: false };
	}
}

export { OLLAMA_URL };
