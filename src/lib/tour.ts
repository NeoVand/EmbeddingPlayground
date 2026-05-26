/**
 * Driver.js-powered first-time tour. Runs once on first visit (gated by
 * playground.tourSeen) and again on demand via the Help button.
 */

import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { playground } from '$lib/stores/playground.svelte.js';

export function startTour(opts: { force?: boolean } = {}): void {
	if (typeof document === 'undefined') return;
	if (!opts.force && playground.tourSeen) return;

	const d = driver({
		showProgress: true,
		animate: true,
		allowClose: true,
		stagePadding: 6,
		popoverClass: 'driverjs-theme',
		onDestroyed: () => {
			playground.tourSeen = true;
		},
		steps: [
			{
				element: '[data-tour="tabs"]',
				popover: {
					title: 'Five focused labs',
					description:
						'Each lab teaches one concept and has its own workspace — nothing leaks across.<br/><br/><b>Explore</b> · what an embedding looks like<br/><b>Compare</b> · what cosine similarity means<br/><b>Trajectory</b> · how meaning builds up across a sentence<br/><b>Analogies</b> · vector arithmetic<br/><b>Plane</b> · pick a direction in embedding space and see what aligns with it'
				}
			},
			{
				element: '[data-tour="model"]',
				popover: {
					title: 'Model',
					description:
						'Three sentence transformers spanning small / medium / large. Switching re-embeds everything; the cache makes round trips instant.'
				}
			},
			{
				element: '[data-tour="cloud"]',
				popover: {
					title: 'The cloud',
					description:
						'A 3D PCA projection of whichever points the active lab is showing. Drag to rotate, scroll to zoom, right-drag to pan. Hover any point to see what it is.'
				}
			},
			{
				element: '[data-tour="help"]',
				popover: {
					title: 'You’re set',
					description: 'Click <b>?</b> anytime to replay this tour. Try the <b>Trajectory</b> lab next — it’s the most surprising one.'
				}
			}
		]
	});

	d.drive();
}
