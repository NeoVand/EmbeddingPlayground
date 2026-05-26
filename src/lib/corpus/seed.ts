/**
 * Seed corpus — short, diverse texts that anchor the semantic-neighborhood
 * view. Chosen so the categories cluster cleanly with any decent model,
 * which gives users a real "ah-ha" moment when they paste their first
 * input and watch it land somewhere meaningful.
 *
 * Editable: this is just a const array. Phase 2 can let users add their own.
 */

export interface CorpusItem {
	id: string;
	text: string;
	category: CorpusCategory;
}

export type CorpusCategory = 'animal' | 'code' | 'food' | 'emotion' | 'place' | 'abstract' | 'science';

export const SEED_CORPUS: readonly CorpusItem[] = [
	// animals — concrete, physical creatures
	{ id: 'a-dog', text: 'A golden retriever bounding across a sunlit lawn.', category: 'animal' },
	{ id: 'a-cat', text: 'A tabby cat curled on a windowsill in the afternoon.', category: 'animal' },
	{ id: 'a-octopus', text: 'An octopus changing color as it slips between coral reefs.', category: 'animal' },
	{ id: 'a-hawk', text: 'A red-tailed hawk circling thermal updrafts above a canyon.', category: 'animal' },

	// code — programming + computers
	{ id: 'c-rec', text: 'A recursive function that walks a binary tree depth-first.', category: 'code' },
	{ id: 'c-bug', text: 'Debugging a race condition between two async workers.', category: 'code' },
	{ id: 'c-git', text: 'git rebase --interactive HEAD~5 to clean up the commit history.', category: 'code' },
	{ id: 'c-react', text: 'A React component that memoizes its expensive render with useMemo.', category: 'code' },

	// food — meals, cooking
	{ id: 'f-soup', text: 'A bowl of miso soup with cubed tofu and ribbons of wakame.', category: 'food' },
	{ id: 'f-pizza', text: 'Neapolitan pizza, charred at the edges, dripping with mozzarella.', category: 'food' },
	{ id: 'f-coffee', text: 'A pour-over coffee, bright with notes of citrus and chocolate.', category: 'food' },
	{ id: 'f-curry', text: 'Slow-cooked Massaman curry, fragrant with cardamom and peanut.', category: 'food' },

	// emotion — feelings, mental states
	{ id: 'e-joy', text: 'The quiet joy of watching a long project finally come together.', category: 'emotion' },
	{ id: 'e-grief', text: 'The hollow ache of grief that arrives in unexpected moments.', category: 'emotion' },
	{ id: 'e-anger', text: 'White-hot anger at an injustice you cannot immediately fix.', category: 'emotion' },
	{ id: 'e-calm', text: 'A deep, unhurried calm settling in after a long walk.', category: 'emotion' },

	// place — geography, locations
	{ id: 'p-tokyo', text: 'A neon-lit alley in Shinjuku just before midnight.', category: 'place' },
	{ id: 'p-fjord', text: 'A Norwegian fjord, glass-still water under sheer granite cliffs.', category: 'place' },
	{ id: 'p-desert', text: 'The Atacama desert at dawn, stars still visible above the salt flats.', category: 'place' },
	{ id: 'p-london', text: 'A foggy morning along the Thames, the dome of St. Paul’s catching first light.', category: 'place' },

	// abstract — philosophy, math, ideas
	{ id: 'b-infinity', text: 'The idea that some infinities are larger than others.', category: 'abstract' },
	{ id: 'b-free', text: 'Whether free will is compatible with a deterministic universe.', category: 'abstract' },
	{ id: 'b-justice', text: 'Justice as fairness, behind a veil of ignorance about your own position.', category: 'abstract' },
	{ id: 'b-time', text: 'The strangeness of time appearing to flow in only one direction.', category: 'abstract' },

	// science — physical phenomena
	{ id: 's-blackhole', text: 'A black hole bending light around its event horizon.', category: 'science' },
	{ id: 's-protein', text: 'A protein folding into its native conformation in microseconds.', category: 'science' },
	{ id: 's-photo', text: 'Photosynthesis converting sunlight into chemical bonds inside a leaf.', category: 'science' },
	{ id: 's-quantum', text: 'A quantum particle existing in superposition until measured.', category: 'science' },
	{ id: 's-tectonic', text: 'Tectonic plates drifting centimeters per year and reshaping continents.', category: 'science' }
] as const;

export const CATEGORY_LABELS: Record<CorpusCategory, string> = {
	animal: 'Animals',
	code: 'Code',
	food: 'Food',
	emotion: 'Emotion',
	place: 'Place',
	abstract: 'Abstract',
	science: 'Science'
};

/** Stable hue assignment per category — feeds the SemanticCloud's color encoding. */
export const CATEGORY_HUES: Record<CorpusCategory, number> = {
	animal: 30,
	code: 200,
	food: 60,
	emotion: 330,
	place: 160,
	abstract: 270,
	science: 130
};
