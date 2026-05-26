/**
 * Driver.js tour. Opens only on demand via the ? button — no auto-trigger.
 * The tourSeen flag is set when the tour completes so it doesn't surprise
 * users who want to dismiss it.
 */

import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { playground } from '$lib/stores/playground.svelte.js';

export function startTour(_opts: { force?: boolean } = {}): void {
	if (typeof document === 'undefined') return;

	const d = driver({
		showProgress: true,
		animate: true,
		allowClose: true,
		stagePadding: 8,
		popoverClass: 'driverjs-theme',
		nextBtnText: 'Next →',
		prevBtnText: '← Back',
		doneBtnText: 'Done',
		progressText: '{{current}} / {{total}}',
		onDestroyed: () => {
			playground.tourSeen = true;
		},
		steps: [
			{
				popover: {
					title: 'Welcome',
					description:
						'A browser playground for poking at modern text-embedding models. Everything runs locally via WebGPU — no API keys, no server, no telemetry. Five labs, each focused on one concept.'
				}
			},
			{
				element: '[data-tour="tabs"]',
				popover: {
					title: 'Five labs',
					description:
						'<b>Compare</b> · two texts, pair metrics<br/><b>Trajectory</b> · how a sentence builds up word by word<br/><b>RAG</b> · semantic search over a document<br/><b>Analogies</b> · vector arithmetic like king − man + woman<br/><b>Plane</b> · pick a direction (sentiment, formality…) and project items onto it'
				}
			},
			{
				element: '[data-tour="model"]',
				popover: {
					title: 'Model',
					description:
						'Pick from sentence transformers spanning tiny to multi-billion. The first selection downloads the weights; after that it’s cached. Re-embedding existing inputs is instant.'
				}
			},
			{
				element: '[data-tour="cloud"]',
				popover: {
					title: 'The 3D cloud',
					description:
						'Whatever the active lab is showing, projected to 3D via PCA. Drag to rotate, scroll to zoom, right-drag to pan. The faint cube and XYZ triad at the bottom-left orient you. Hover any point.'
				}
			},
			{
				element: '[data-tour="help"]',
				popover: {
					title: 'That’s it',
					description: 'Hit <b>?</b> anytime to replay this. Have fun.'
				}
			}
		]
	});

	d.drive();
}
