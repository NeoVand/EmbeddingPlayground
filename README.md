# Embedding Playground

An interactive browser playground for understanding modern text-embedding models. Everything runs locally — WebGPU first, WebAssembly as a fallback, Ollama as an optional local-daemon backend. No server, no API keys, no telemetry.

**Live demo:** https://neovand.github.io/EmbeddingPlayground/

![status](https://github.com/NeoVand/EmbeddingPlayground/actions/workflows/deploy.yml/badge.svg)

## The idea

One full-bleed 3D cloud — a live PCA projection of embedding vectors — with everything else floating on top of it as glass panels. An icon rail on the left switches between five labs, a curriculum that reads top to bottom: *meaning → sequence → retrieval → decision → structure*.

| Lab | Question it answers |
| --- | --- |
| **Compare** | What does cosine similarity *mean*? Two texts plus reference points so the visual scale carries information. |
| **Trajectory** | How does meaning build up across a sentence? Each prefix `word_1..k` is embedded independently; the path through latent space is drawn (and replayable), and the word that caused the biggest lurch is highlighted. |
| **Retrieve** | Which chunks of a document semantically match a query? Four chunking strategies (sentence / paragraph / fixed / sliding), role-correct query/document prefixes, top-N ranking by cosine or euclidean, lexical-overlap highlighting as a tell. |
| **Classify** | Can you classify with no training? Nearest-prototype over class-mean embeddings, with a *visible* softmax temperature so the confidence is honest. |
| **Cluster** | What structure falls out with no labels? K-means (k-means++ on the unit hypersphere), silhouette score, and a Rand index against ground-truth topics. |

Click any point in the cloud and the **scope bar** along the bottom fills with its vitals; pull it up and the full inspector opens — per-token × dimension heatmap and signed dimension bars. Every lab ships a short **guide** (the book icon on the rail): a few steps that drive real state, not a static tour.

## Models

Twelve models in the registry, all running in the browser via `@huggingface/transformers` v4, managed from the model panel (the chip on the rail — download states, backend badges, live progress):

| Model | Params | Dims | Pooling | Notes |
| --- | --- | --- | --- | --- |
| all-MiniLM-L6-v2 | 22M | 384 | mean | the classic baseline (default) |
| mdbr-leaf-ir | 23M | 768 | head | best <30M on MTEB v2, 23 MB download |
| mxbai-embed-xsmall-v1 | 24M | 384 | mean | instant-load tier |
| granite-embedding-small-english-r2 | 47M | 384 | mean | ModernBERT, 8k context |
| granite-embedding-97m-multilingual-r2 | 97M | 384 | cls | 200+ languages + code, 32k context |
| nomic-embed-text-v1.5 | 137M | 768 | mean | Matryoshka-trained, query/doc prefixes |
| granite-embedding-english-r2 | 149M | 768 | mean | long-document retrieval |
| snowflake-arctic-embed-m-v2.0 | 305M | 768 | cls | multilingual, query prefix |
| embeddinggemma-300m | 300M | 768 | head | custom `sentence_embedding` loader (WASM) |
| voyage-4-nano | 340M | 2048 | mean | first open Voyage, Matryoshka to 256 |
| Qwen3-Embedding-0.6B | 596M | 1024 | last-token | strong MTEB, instruct-style queries |
| pplx-embed-v1-0.6b | 600M | 1024 | mean | Perplexity, prompt-free, WebGPU-only q4 |

WebGPU is the default device when available (transformers.js v4's runtime fixed quantized inference on WebGPU, so the ModernBERT models no longer force WASM — only EmbeddingGemma still does, pending re-validation of its quantized output). Models with instruction prefixes get them **per role** — queries embed with the query template, documents with the document template. Weights are cached by the browser; full embedding results are cached in memory and pooled vectors in localStorage.

## Run it locally

```bash
git clone https://github.com/NeoVand/EmbeddingPlayground
cd EmbeddingPlayground
npm install
npm run dev
```

Then open http://localhost:5173. The first model load takes a few seconds to ~30s depending on connection.

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
- **@huggingface/transformers** for in-browser inference (+ optional Ollama backend)
- **Three.js** for the 3D cloud (WebGL + CSS2DRenderer labels, incremental scene updates, animated projection transitions)
- **@lucide/svelte** icons via a central registry
- **vitest** for unit tests

Every color in the app — DOM, Three.js materials, canvas scales, per-lab identity hues — derives from five OKLCH primitives in `src/lib/theme/palette.ts`. Change a primitive and the whole app re-colors, 3D scene included.

## Project layout

```
src/
├── lib/
│   ├── corpus/            # Seed sentences for Compare's context toggle
│   ├── labs/              # The five labs + shared embed orchestration
│   │   ├── CompareLab.svelte
│   │   ├── TrajectoryLab.svelte
│   │   ├── RAGLab.svelte        # the Retrieve lab
│   │   ├── ClassifyLab.svelte
│   │   ├── ClusterLab.svelte
│   │   ├── embed.svelte.ts      # debounced, generation-guarded single/batch embeds
│   │   └── labState.svelte.ts   # per-lab localStorage persistence
│   ├── math/              # PCA, k-means, similarity, stats — all unit-tested
│   ├── models/            # Registry + orchestrator + transformers.js / Ollama embedders
│   ├── rag/               # Sample documents + chunking strategies
│   ├── shell/             # Rail, docks, scope bar, guide, model manager, busy pill
│   ├── stores/            # Shared shell store (model, caches, lab switcher)
│   ├── theme/             # OKLCH primitives → every color in the app
│   └── viz/               # SemanticCloud, TokenHeatmap, DimensionBars
└── routes/
    ├── +layout.svelte
    ├── +layout.ts         # ssr=false (everything is client-only)
    └── +page.svelte       # Rail + lab host + overlays
```

## Known limitations

- **Static-embedding models** (model2vec, static-retrieval-mrl) and **Qwen3 ≥ 4B** are not wired up — static models need an `offsets` input for `EmbeddingBag`, and the bigger Qwen3 variants ship browser-prohibitive unquantized ONNX. This is also why there is no Analogies lab: word arithmetic doesn't really work on sentence transformers, and we'd rather show it honestly on a static model when one lands.
- **Matryoshka truncation** is modeled in the registry (`matryoshkaDims`) but not yet surfaced as a UI slider.
- **Ollama** backend covers only the models with an Ollama config (MiniLM, Nomic) and returns pooled vectors only — the token heatmap degrades gracefully.

## License

MIT.
