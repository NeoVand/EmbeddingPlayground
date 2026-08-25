/**
 * The lab lineup — one place for identity: name, tagline, icon, hue.
 * The curriculum reads top to bottom: meaning → sequence → retrieval →
 * decision → structure.
 */

import type { Component } from 'svelte';
import {
	IconClassify,
	IconCluster,
	IconCompare,
	IconRetrieve,
	IconTrajectory
} from '$lib/icons.js';
import type { LabId } from '$lib/stores/playground.svelte.js';
import { LAB_HUES } from '$lib/theme/palette.js';

export interface LabMeta {
	id: LabId;
	name: string;
	tagline: string;
	icon: Component<{ size?: number | string; class?: string }>;
	hue: number;
}

export const LABS: readonly LabMeta[] = [
	{
		id: 'compare',
		name: 'Compare',
		tagline: 'How close are two meanings?',
		icon: IconCompare,
		hue: LAB_HUES.compare
	},
	{
		id: 'trajectory',
		name: 'Trajectory',
		tagline: 'A sentence as a path through space',
		icon: IconTrajectory,
		hue: LAB_HUES.trajectory
	},
	{
		id: 'rag',
		name: 'Retrieve',
		tagline: 'Semantic search over document chunks',
		icon: IconRetrieve,
		hue: LAB_HUES.rag
	},
	{
		id: 'classify',
		name: 'Classify',
		tagline: 'Labels from nearest prototypes',
		icon: IconClassify,
		hue: LAB_HUES.classify
	},
	{
		id: 'cluster',
		name: 'Cluster',
		tagline: 'Structure emerges with k-means',
		icon: IconCluster,
		hue: LAB_HUES.cluster
	}
] as const;

export function labMeta(id: LabId): LabMeta {
	const m = LABS.find((l) => l.id === id);
	if (!m) throw new Error(`Unknown lab: ${id}`);
	return m;
}
