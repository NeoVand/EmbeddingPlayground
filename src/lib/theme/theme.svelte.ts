/**
 * Reactive theme store. Three consumers:
 *   1. The DOM — `theme.cssVarsText` is mounted in <style> on the root layout.
 *   2. Three.js — reads `theme.scene` / `theme.pointRgb()` and re-renders on change.
 *   3. Canvas viz — reads `theme.tokens` / `theme.primitives` for scales.
 *
 * Every color in the app routes through here (or through palette.ts helpers
 * fed with `theme.primitives`) — never hardcode a hex or oklch literal.
 */

import {
	DEFAULT_PRIMITIVES,
	deriveSceneColors,
	deriveTokens,
	dotRgb,
	hueCss,
	pointRgb,
	tokensToCssVars,
	type Primitives,
	type SceneColors,
	type Tokens
} from './palette.ts';

function createTheme() {
	let primitives = $state<Primitives>({ ...DEFAULT_PRIMITIVES });
	const tokens = $derived<Tokens>(deriveTokens(primitives));
	const cssVarsText = $derived(tokensToCssVars(tokens));
	const scene = $derived<SceneColors>(deriveSceneColors(primitives));

	return {
		get primitives() {
			return primitives;
		},
		get tokens() {
			return tokens;
		},
		get cssVarsText() {
			return cssVarsText;
		},
		get scene() {
			return scene;
		},
		/** Bright color triplet for a labeled point, at current primitives. */
		pointRgb(hue: number): [number, number, number] {
			return pointRgb(hue, primitives);
		},
		/** Dim color triplet for a background dot, at current primitives. */
		dotRgb(hue: number): [number, number, number] {
			return dotRgb(hue, primitives);
		},
		/** CSS color for a data hue — use for chips/badges instead of literals. */
		hueCss(hue: number, opts?: { l?: number; c?: number; a?: number }): string {
			return hueCss(hue, primitives, opts);
		},
		setPrimitive<K extends keyof Primitives>(k: K, v: Primitives[K]) {
			primitives = { ...primitives, [k]: v };
		},
		reset() {
			primitives = { ...DEFAULT_PRIMITIVES };
		}
	};
}

export const theme = createTheme();
