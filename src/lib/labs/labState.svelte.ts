/**
 * Tiny helper so each lab can persist its own state under its own key,
 * without re-implementing the load/save dance.
 *
 *   const state = createLabState('explore', { text: '' });
 *   state.value.text = '…';   // auto-persists, $state-reactive
 */

const PREFIX = 'embedding-playground:lab:';

export function createLabState<T extends object>(labId: string, defaults: T) {
	const key = `${PREFIX}${labId}:v1`;
	let initial = defaults;
	if (typeof localStorage !== 'undefined') {
		try {
			const raw = localStorage.getItem(key);
			if (raw) initial = { ...defaults, ...(JSON.parse(raw) as Partial<T>) };
		} catch {
			/* ignore */
		}
	}

	const value = $state(initial);

	function persist() {
		try {
			localStorage.setItem(key, JSON.stringify(value));
		} catch {
			/* quota */
		}
	}

	$effect.root(() => {
		$effect(() => {
			// Trigger reactivity on any field of `value`.
			for (const k of Object.keys(value)) void value[k as keyof T];
			persist();
		});
	});

	return value;
}
