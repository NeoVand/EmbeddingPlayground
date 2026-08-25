/**
 * Shell-level UI state shared across labs, so dock/inspector geometry feels
 * continuous when switching labs instead of resetting.
 */

function createShellUI() {
	let inspectorOpen = $state(false);
	let leftOpen = $state(true);
	let rightOpen = $state(true);
	let guideOpen = $state(false);

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
		}
	};
}

export const shellUI = createShellUI();
