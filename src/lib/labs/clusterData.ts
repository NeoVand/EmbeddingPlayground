/**
 * Pre-built sentence sets for the Clustering lab. Each is intentionally a
 * mix of distinguishable topics — you should be able to see clusters form
 * when you run k-means at the right K.
 */

export interface ClusterSentence {
	id: string;
	text: string;
	/** Optional ground-truth topic for the "what would a perfect cluster look like?" overlay. */
	topic?: string;
}

export interface ClusterDataset {
	id: string;
	name: string;
	description: string;
	defaultK: number;
	sentences: ClusterSentence[];
}

let _id = 0;
const sid = () => `s_${++_id}`;

export const CLUSTER_DATASETS: readonly ClusterDataset[] = [
	{
		id: 'mixed-topics',
		name: 'Mixed topics',
		description: '40 sentences across 4 topics: travel, cooking, programming, finance.',
		defaultK: 4,
		sentences: [
			{ id: sid(), topic: 'travel', text: 'The train wound through the Swiss Alps past snow-capped peaks.' },
			{ id: sid(), topic: 'travel', text: 'A bustling market in Marrakech filled the evening air with spice.' },
			{ id: sid(), topic: 'travel', text: 'Backpacking through Patagonia takes you past glaciers and condors.' },
			{ id: sid(), topic: 'travel', text: 'Kyoto in spring is full of cherry blossoms and quiet temples.' },
			{ id: sid(), topic: 'travel', text: 'The ferry to Santorini stops at small islands scattered across the Aegean.' },
			{ id: sid(), topic: 'travel', text: 'A road trip down Highway One reveals the rugged California coast.' },
			{ id: sid(), topic: 'travel', text: 'Reykjavik in winter is dim, snowy, and lit by the northern lights.' },
			{ id: sid(), topic: 'travel', text: 'Hiking the Inca Trail to Machu Picchu takes four memorable days.' },
			{ id: sid(), topic: 'travel', text: 'Venice canals at dawn are quieter and more golden than at any other hour.' },
			{ id: sid(), topic: 'travel', text: 'The Serengeti during the great migration is unlike any other safari.' },
			{ id: sid(), topic: 'cooking', text: 'Sear the steak in a hot cast-iron pan, then rest it for ten minutes.' },
			{ id: sid(), topic: 'cooking', text: 'A good pesto needs basil, pine nuts, parmesan, garlic, and oil.' },
			{ id: sid(), topic: 'cooking', text: 'Sourdough rises slowly — give the starter at least twelve hours.' },
			{ id: sid(), topic: 'cooking', text: 'Toast the spices in oil before adding the onions for deeper flavor.' },
			{ id: sid(), topic: 'cooking', text: 'Caramelizing onions properly takes forty-five patient minutes.' },
			{ id: sid(), topic: 'cooking', text: 'The Maillard reaction is what makes a crust on a roasted chicken.' },
			{ id: sid(), topic: 'cooking', text: 'Use a kitchen scale for baking — volume measurements are inconsistent.' },
			{ id: sid(), topic: 'cooking', text: 'Deglaze the pan with wine and scrape up all the fond.' },
			{ id: sid(), topic: 'cooking', text: 'Risotto is mostly about patience and the right ratio of stock to rice.' },
			{ id: sid(), topic: 'cooking', text: 'Salt the pasta water generously — it is your one chance to season the noodle.' },
			{ id: sid(), topic: 'programming', text: 'Use a hash map for O(1) lookups when key uniqueness is guaranteed.' },
			{ id: sid(), topic: 'programming', text: 'Recursive solutions are clearer but watch out for stack overflow on deep trees.' },
			{ id: sid(), topic: 'programming', text: 'Always handle the empty input case before writing the main loop.' },
			{ id: sid(), topic: 'programming', text: 'A race condition between two async workers caused the intermittent test failure.' },
			{ id: sid(), topic: 'programming', text: 'Refactor the function into smaller units so each one is independently testable.' },
			{ id: sid(), topic: 'programming', text: 'Git rebase keeps history linear at the cost of rewriting commits.' },
			{ id: sid(), topic: 'programming', text: 'Cache invalidation is one of the hardest problems in computer science.' },
			{ id: sid(), topic: 'programming', text: 'Profile before optimizing — your intuition about hot paths is usually wrong.' },
			{ id: sid(), topic: 'programming', text: 'Pure functions are easier to test and reason about than methods with side effects.' },
			{ id: sid(), topic: 'programming', text: 'Use a B-tree index when range queries dominate, hash when only equality.' },
			{ id: sid(), topic: 'finance', text: 'Compound interest is the eighth wonder of the world.' },
			{ id: sid(), topic: 'finance', text: 'Diversify across asset classes to reduce idiosyncratic risk.' },
			{ id: sid(), topic: 'finance', text: 'A bond yields the inverse of its price as interest rates move.' },
			{ id: sid(), topic: 'finance', text: 'Index funds outperform most actively managed funds over the long run.' },
			{ id: sid(), topic: 'finance', text: 'Dollar-cost averaging smooths your entry into the market over time.' },
			{ id: sid(), topic: 'finance', text: 'Pay off high-interest credit card debt before any other investing.' },
			{ id: sid(), topic: 'finance', text: 'A Roth IRA grows tax-free and is withdrawn tax-free in retirement.' },
			{ id: sid(), topic: 'finance', text: 'Market timing is consistently shown to underperform buy-and-hold.' },
			{ id: sid(), topic: 'finance', text: 'Inflation erodes the purchasing power of cash sitting in a savings account.' },
			{ id: sid(), topic: 'finance', text: 'Always read the expense ratio before buying into a mutual fund.' }
		]
	},
	{
		id: 'emotions',
		name: 'Emotional tone',
		description: '24 sentences across joy / sadness / anger. Subtler than topics — interesting failure mode for embedding models.',
		defaultK: 3,
		sentences: [
			{ id: sid(), topic: 'joy', text: 'I cannot stop smiling — today has been wonderful.' },
			{ id: sid(), topic: 'joy', text: 'The kids ran around the garden laughing all afternoon.' },
			{ id: sid(), topic: 'joy', text: 'When she said yes, I felt my whole chest light up.' },
			{ id: sid(), topic: 'joy', text: 'There is a particular kind of joy in finally finishing a long project.' },
			{ id: sid(), topic: 'joy', text: 'Her favorite song came on and she started dancing in the kitchen.' },
			{ id: sid(), topic: 'joy', text: 'We laughed so hard our cheeks hurt.' },
			{ id: sid(), topic: 'joy', text: 'The puppy crashed into me and licked my face — pure happiness.' },
			{ id: sid(), topic: 'joy', text: 'A perfect sunset over the lake left everyone speechless.' },
			{ id: sid(), topic: 'sadness', text: 'I sat by the window watching the rain and thinking about her.' },
			{ id: sid(), topic: 'sadness', text: 'After the funeral the house felt unbearably empty.' },
			{ id: sid(), topic: 'sadness', text: 'It is the small unexpected reminders that hurt the most.' },
			{ id: sid(), topic: 'sadness', text: 'He said goodbye and I knew it was the last time.' },
			{ id: sid(), topic: 'sadness', text: 'I miss the way things used to be.' },
			{ id: sid(), topic: 'sadness', text: 'There is a quiet grief that no one else can really see.' },
			{ id: sid(), topic: 'sadness', text: 'The old photographs made me cry in a way I did not expect.' },
			{ id: sid(), topic: 'sadness', text: 'Some losses you carry with you forever.' },
			{ id: sid(), topic: 'anger', text: 'I cannot believe they cancelled the project after all that work.' },
			{ id: sid(), topic: 'anger', text: 'He lied to my face and expected me to thank him for it.' },
			{ id: sid(), topic: 'anger', text: 'The injustice of it makes my blood boil.' },
			{ id: sid(), topic: 'anger', text: 'They keep making decisions without even asking us.' },
			{ id: sid(), topic: 'anger', text: 'I am furious that nothing has been done about this.' },
			{ id: sid(), topic: 'anger', text: 'How dare they speak to her that way?' },
			{ id: sid(), topic: 'anger', text: 'After the third time I just snapped.' },
			{ id: sid(), topic: 'anger', text: 'The whole situation is infuriating and completely avoidable.' }
		]
	}
] as const;

export function getClusterDataset(id: string): ClusterDataset | undefined {
	return CLUSTER_DATASETS.find((d) => d.id === id);
}

/** CSV: one column of text, one optional `topic` column for ground truth. */
export function parseClusterCsv(raw: string): ClusterSentence[] {
	const lines = raw.split(/\r?\n/).filter((l) => l.trim());
	if (lines.length < 2) return [];
	const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
	const textIdx = headers.findIndex((h) => h === 'text' || h === 'sentence' || h === 'input');
	const topicIdx = headers.findIndex((h) => h === 'topic' || h === 'label' || h === 'class' || h === 'category');
	if (textIdx < 0) throw new Error('CSV needs a `text` or `sentence` column.');
	const out: ClusterSentence[] = [];
	for (let i = 1; i < lines.length; i++) {
		const row = lines[i].split(',').map((s) => s.trim());
		const text = row[textIdx];
		if (!text) continue;
		out.push({
			id: `up_${i}_${Date.now()}`,
			text,
			topic: topicIdx >= 0 ? row[topicIdx] : undefined
		});
	}
	return out;
}
