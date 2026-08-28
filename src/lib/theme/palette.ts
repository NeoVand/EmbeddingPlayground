/**
 * Theme palette — a tiny set of primitives from which every UI and viz color
 * is derived. Change a primitive, and the whole app re-derives in unison.
 *
 * Colors are expressed in OKLCH for perceptual uniformity. Helpers below
 * produce CSS strings (oklch / oklab) and `[r, g, b]` triplets in [0,1] for
 * Three.js / WebGPU consumers.
 */

export interface Primitives {
	/** Hue of the dominant accent, 0–360 (degrees). */
	accentHue: number;
	/** Hue of the contrast accent used for diverging scales, 0–360. */
	contrastHue: number;
	/** Chroma of accent colors, 0–0.37. Higher = more saturated. */
	accentChroma: number;
	/** Base background lightness in OKLCH, 0–1. Keep very low for dark UI. */
	bgL: number;
	/** Base foreground lightness in OKLCH, 0–1. Keep very high. */
	fgL: number;
}

export const DEFAULT_PRIMITIVES: Primitives = {
	accentHue: 200, // cool cyan-blue — anchors the chrome
	contrastHue: 30, // warm orange — anchors diverging scales
	accentChroma: 0.18,
	bgL: 0.14,
	fgL: 0.96
};

export interface Tokens {
	// chrome
	bgBase: string;
	surface0: string;
	surface1: string;
	surface2: string;
	border: string;
	borderStrong: string;
	textPrimary: string;
	textSecondary: string;
	textMuted: string;
	textSubtle: string;
	// accents
	accent: string;
	accentMuted: string;
	accentStrong: string;
	accentGlow: string;
	contrast: string;
	contrastMuted: string;
	// semantic
	good: string;
	warn: string;
	bad: string;
}

const oklch = (l: number, c: number, h: number, a = 1) =>
	a >= 1 ? `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})` : `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)} / ${a})`;

export function deriveTokens(p: Primitives): Tokens {
	const { accentHue: h, contrastHue: ch, accentChroma: c, bgL, fgL } = p;
	const neutralChroma = 0.008;
	return {
		bgBase: oklch(bgL - 0.07, neutralChroma, h),
		surface0: oklch(bgL - 0.03, neutralChroma, h, 0.92),
		surface1: oklch(bgL + 0.02, neutralChroma * 1.2, h, 0.94),
		surface2: oklch(bgL + 0.07, neutralChroma * 1.6, h, 0.96),
		border: oklch(bgL + 0.12, c * 0.15, h, 0.4),
		borderStrong: oklch(bgL + 0.2, c * 0.3, h, 0.6),
		textPrimary: oklch(fgL, neutralChroma, h),
		textSecondary: oklch(fgL * 0.92, neutralChroma, h),
		textMuted: oklch(fgL * 0.72, neutralChroma * 1.2, h),
		textSubtle: oklch(fgL * 0.52, neutralChroma * 1.4, h),
		accent: oklch(0.78, c, h),
		accentMuted: oklch(0.55, c * 0.55, h, 0.7),
		accentStrong: oklch(0.88, c, h),
		accentGlow: oklch(0.78, c, h, 0.35),
		contrast: oklch(0.78, c * 0.95, ch),
		contrastMuted: oklch(0.6, c * 0.5, ch, 0.7),
		good: oklch(0.78, 0.16, 150),
		warn: oklch(0.82, 0.17, 80),
		bad: oklch(0.7, 0.2, 25)
	};
}

/** Render Tokens as CSS custom-property declarations (no selector). */
export function tokensToCssVars(t: Tokens): string {
	const entries = Object.entries(t) as [keyof Tokens, string][];
	return entries.map(([k, v]) => `--${camelToKebab(k)}: ${v};`).join('\n');
}

function camelToKebab(s: string): string {
	return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

// ---------- OKLCH → RGB conversion (for Three.js / WebGPU consumers) ----------

/** Convert oklch components to linear sRGB triplet (each 0..1, not clamped). */
export function oklchToRgb(l: number, c: number, hDeg: number): [number, number, number] {
	const hRad = (hDeg * Math.PI) / 180;
	const a = c * Math.cos(hRad);
	const b = c * Math.sin(hRad);
	return oklabToRgb(l, a, b);
}

function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
	// OKLab → LMS → linear sRGB (Björn Ottosson)
	const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = L - 0.0894841775 * a - 1.291485548 * b;

	const l = l_ * l_ * l_;
	const m = m_ * m_ * m_;
	const s = s_ * s_ * s_;

	let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
	let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
	let bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

	// linear → sRGB gamma
	r = linToSrgb(clamp01(r));
	g = linToSrgb(clamp01(g));
	bb = linToSrgb(clamp01(bb));
	return [r, g, bb];
}

function linToSrgb(x: number): number {
	return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function clamp01(x: number): number {
	return Math.max(0, Math.min(1, x));
}

/**
 * Convenience: viz color for a value t ∈ [-1, 1] using a diverging
 * accent↔contrast scale. Dark-anchored: near-zero values sink toward the
 * background instead of sitting at mid-lightness, so heatmaps read as
 * signal-on-dark rather than a saturated wall.
 */
export function divergingRgb(t: number, p: Primitives): [number, number, number] {
	const tt = Math.max(-1, Math.min(1, t));
	const hueA = p.accentHue;
	const hueB = p.contrastHue;
	// magnitude → lightness/chroma; sign → hue
	const mag = Math.abs(tt);
	const l = 0.22 + 0.6 * mag;
	const c = p.accentChroma * (0.12 + 1.05 * mag);
	const h = tt < 0 ? hueA : hueB;
	return oklchToRgb(l, c, h);
}

/** Convenience: viz color for a value t ∈ [0, 1] using a sequential accent scale. */
export function sequentialRgb(t: number, p: Primitives): [number, number, number] {
	const tt = clamp01(t);
	const l = 0.25 + 0.65 * tt;
	const c = p.accentChroma * (0.4 + 0.6 * tt);
	return oklchToRgb(l, c, p.accentHue);
}

// ---------- Lab identity hues ----------
// Every lab owns a hue. Rail icon, dock accents, and default cloud points all
// agree on it, and all of them run the hue through the same lightness/chroma
// curve below so the five labs read as one family.

export const LAB_HUES = {
	compare: 200, // teal — the app's own accent
	trajectory: 285, // violet
	rag: 85, // gold — matches the pinned-query marker
	classify: 150, // green
	cluster: 30, // warm red
	anatomy: 340 // pink — the dissection table
} as const;

/** The hue used for pinned "query" points (RAG / Classify) and their links. */
export const PIN_HUE = 85;

/** Bright point color for labeled spheres and UI chips carrying a data hue. */
export function pointRgb(hue: number, p: Primitives): [number, number, number] {
	return oklchToRgb(0.78, p.accentChroma * 1.1, hue);
}

/** Dimmer color for background dots. */
export function dotRgb(hue: number, p: Primitives): [number, number, number] {
	return oklchToRgb(0.6, p.accentChroma * 0.55, hue);
}

/** CSS color string for a data hue — the one way UI chips derive hue colors. */
export function hueCss(hue: number, p: Primitives, opts: { l?: number; c?: number; a?: number } = {}): string {
	return oklch(opts.l ?? 0.78, opts.c ?? p.accentChroma, hue, opts.a ?? 1);
}

/**
 * Scene furniture colors for the 3D cloud, derived from the primitives so a
 * theme change propagates into Three.js. All triplets in [0,1] sRGB.
 */
export interface SceneColors {
	grid: [number, number, number];
	gridCenter: [number, number, number];
	cube: [number, number, number];
	axisX: [number, number, number];
	axisY: [number, number, number];
	axisZ: [number, number, number];
	linkDefault: [number, number, number];
	fillLight: [number, number, number];
}

export function deriveSceneColors(p: Primitives): SceneColors {
	const h = p.accentHue;
	return {
		grid: oklchToRgb(p.bgL + 0.14, 0.012, h),
		gridCenter: oklchToRgb(p.bgL + 0.07, 0.01, h),
		cube: oklchToRgb(p.bgL + 0.25, 0.02, h),
		axisX: oklchToRgb(0.62, 0.1, p.contrastHue),
		axisY: oklchToRgb(0.68, 0.1, 150),
		axisZ: oklchToRgb(0.62, 0.1, h + 60),
		linkDefault: oklchToRgb(0.72, 0.015, h),
		fillLight: oklchToRgb(0.6, 0.08, h + 60)
	};
}
