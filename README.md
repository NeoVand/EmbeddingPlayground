# Embedding Playground

An interactive browser playground for poking at modern text-embedding models. Everything runs locally — WebGPU first, WebAssembly as a fallback. No server, no API keys, no telemetry.

**Live demo:** https://neovand.github.io/EmbeddingPlayground/

![status](https://github.com/NeoVand/EmbeddingPlayground/actions/workflows/deploy.yml/badge.svg)

## What it does

Five focused labs, each one teaches a different aspect of how text embeddings behave:

| Lab | Question it answers |
| --- | --- |
| **Compare** | What does cosine similarity *mean*? Two texts plus reference points so the visual scale carries information. |
| **Trajectory** | How does meaning build up across a sentence? Embed each prefix `word_1..k`, render the path through latent space, surface the word that caused each lurch. |
| **RAG** | Which chunks of a document semantically match a query? Pre-loaded docs, four chunking strategies (sentence / paragraph / fixed / sliding), top-N re-ranking by cosine or euclidean. |
| **Analogies** | Does `king − man + woman ≈ queen` work on sentence transformers? (Spoiler: only sort of — see the caveat in the lab.) |
| **Plane** | What does a single direction in embedding space encode? Pick two anchor texts, project everything onto their axis. Sentiment, formality, concreteness presets included. |

All five labs share a 3D PCA cloud rendered with Three.js (WebGL + CSS2DRenderer for crisp HTML labels), a vector cache that survives reloads, and a model selector.

## Models

Currently in the registry, all running in the browser:

- **all-MiniLM-L6-v2** — 22M params, 384-d, mean pooled. The classic baseline.
- **nomic-embed-text-v1.5** — 137M, 768-d, Matryoshka-trained (truncate to 512 / 256 / 128 / 64).
- **Qwen3-Embedding-0.6B** — 596M, 1024-d, last-token pooled. Top of MTEB for its size.

WebGPU is the default device when available; everything falls back to WASM if not. The model load is cached in IndexedDB by transformers.js, and pooled vectors are cached in localStorage by us — switching between models is fast after the first download.

## Run it locally

```bash
git clone https://github.com/NeoVand/EmbeddingPlayground
cd EmbeddingPlayground
npm install
npm run dev
```

Then open http://localhost:5173. The first model load takes ~30 seconds depending on connection.

## Build

```bash
npm run build       # static site → build/
npm run preview     # serve build/ locally
npm test            # vitest unit tests for math + cache
npm run check       # svelte-check + tsc
```

The `main` branch deploys to GitHub Pages on every push via `.github/workflows/deploy.yml`.

## Stack

- **Svelte 5** (runes) + **SvelteKit** with `adapter-static`
- **TypeScript** strict mode
- **Tailwind CSS 4**
- **@huggingface/transformers** for in-browser inference
- **Three.js** for the 3D cloud (CSS2DRenderer for labels)
- **driver.js** for the optional tour
- **vitest** for unit tests

## Project layout

```
src/
├── lib/
│   ├── corpus/            # Seed sentences for the Compare lab's neighborhood
│   ├── labs/              # The five labs — each is a self-contained mini-app
│   │   ├── CompareLab.svelte
│   │   ├── TrajectoryLab.svelte
│   │   ├── RAGLab.svelte
│   │   ├── AnalogiesLab.svelte
│   │   └── PlaneLab.svelte
│   ├── math/              # PCA, similarity, stats — all unit-tested
│   ├── models/            # Embedder abstraction + transformers.js / Ollama backends
│   ├── rag/               # Sample documents + chunking strategies
│   ├── stores/            # Shared shell store (model, cache, corpus, lab switcher)
│   ├── theme/             # OKLCH-derived theme tokens
│   └── viz/               # SemanticCloud, TokenHeatmap, DimensionBars
└── routes/
    ├── +layout.svelte
    ├── +layout.ts         # ssr=false (everything is client-only)
    └── +page.svelte       # Top bar + lab host
```

## Known limitations

- **EmbeddingGemma**, **static-embedding models** (model2vec, sentence-transformers' static-retrieval-mrl), and **Qwen3 ≥ 4B** are not yet wired up. They need a custom loader path — Gemma needs `AutoModel` with the `sentence_embedding` head, static models need an `offsets` input for `EmbeddingBag`, and the bigger Qwen3 variants are bandwidth-prohibitive without quantization tuning. Tracked in the project's memory notes.
- **Word-arithmetic analogies** on sentence transformers don't fully land (the parallelogram property gets destroyed by `[CLS] + word + [SEP]` mean-pooling). The Analogies lab is honest about this.
- **WebGPU buffer-recycling bug** in older transformers.js (≤ 3.7) caused short single-token inputs to return stale data. Fixed in 3.8 and verified.

## License

MIT.
