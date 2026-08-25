/**
 * Shell-level UI state shared across labs, so dock/inspector geometry feels
 * continuous when switching labs instead of resetting.
 */

const SPIN_KEY = 'embedding-playground:spin:v1';

function createShellUI() {
	let inspectorOpen = $state(false);
	let leftOpen = $state(true);
	let rightOpen = $state(true);
	let guideOpen = $state(false);
	let spin = $state(
		typeof localStorage !== 'undefined' && localStorage.getItem(SPIN_KEY) === '1'
	);

	return {
		get inspectorOpen() {
			return inspectorOpen;
		},
		set inspectorOpen(v: boolean) {
			inspectorOpen = v;
		},
		get leftOpen() {
			return leftOpen;
		},
		set leftOpen(v: boolean) {
			leftOpen = v;
		},
		get rightOpen() {
			return rightOpen;
		},
		set rightOpen(v: boolean) {
			rightOpen = v;
		},
		get guideOpen() {
			return guideOpen;
		},
		set guideOpen(v: boolean) {
			guideOpen = v;
		},
		/** Slow camera orbit around the cloud — a global, persisted preference. */
		get spin() {
			return spin;
		},
		set spin(v: boolean) {
			spin = v;
			try {
				localStorage.setItem(SPIN_KEY, v ? '1' : '0');
			} catch {
				/* ignore */
			}
		}
	};
}

export const shellUI = createShellUI();
