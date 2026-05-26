/**
 * Reactive theme store. Two consumers:
 *   1. The DOM — `theme.cssVarsText` is mounted in <style> on the root layout.
 *   2. Programmatic viz (Three.js, canvas) — they read `theme.tokens` / `theme.primitives`
 *      and re-render when these change.
 */

import { DEFAULT_PRIMITIVES, deriveTokens, tokensToCssVars, type Primitives, type Tokens } from './palette.ts';

function createTheme() {
	let primitives = $state<Primitives>({ ...DEFAULT_PRIMITIVES });
	const tokens = $derived<Tokens>(deriveTokens(primitives));
	const cssVarsText = $derived(tokensToCssVars(tokens));

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
		setPrimitive<K extends keyof Primitives>(k: K, v: Primitives[K]) {
			primitives = { ...primitives, [k]: v };
		},
		reset() {
			primitives = { ...DEFAULT_PRIMITIVES };
		}
	};
}

export const theme = createTheme();
