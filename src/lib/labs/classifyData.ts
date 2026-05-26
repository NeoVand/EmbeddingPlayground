/**
 * Pre-built classification datasets. Each dataset is a small handful of
 * labeled examples per class — enough to compute a meaningful prototype
 * embedding without slogging through dozens of forward passes.
 *
 * Users can edit examples and upload CSVs of their own.
 */

export interface LabeledExample {
	id: string;
	label: string;
	text: string;
}

export interface ClassifyDataset {
	id: string;
	name: string;
	description: string;
	classes: string[];
	examples: LabeledExample[];
	testQueries: string[]; // suggested queries to try
}

let _idCounter = 0;
const id = () => `ex_${++_idCounter}`;

export const CLASSIFY_DATASETS: readonly ClassifyDataset[] = [
	{
		id: 'sentiment',
		name: 'Sentiment',
		description: 'Three-way: positive / negative / neutral. Movie & restaurant reviews.',
		classes: ['positive', 'negative', 'neutral'],
		examples: [
			{ id: id(), label: 'positive', text: 'This is hands down the best meal I have had all year.' },
			{ id: id(), label: 'positive', text: 'A genuinely uplifting film, I left the theater smiling.' },
			{ id: id(), label: 'positive', text: 'The service was warm, attentive, and made the evening special.' },
			{ id: id(), label: 'positive', text: 'Beautifully shot and emotionally resonant from start to finish.' },
			{ id: id(), label: 'positive', text: 'Incredible flavor balance — every bite was a delight.' },
			{ id: id(), label: 'negative', text: 'Two hours of my life I will never get back.' },
			{ id: id(), label: 'negative', text: 'The food was cold, bland, and overpriced.' },
			{ id: id(), label: 'negative', text: 'Plot holes everywhere and the acting was painfully wooden.' },
			{ id: id(), label: 'negative', text: 'Awful experience — I would not recommend it to anyone.' },
			{ id: id(), label: 'negative', text: 'The waitstaff was rude and the kitchen forgot half our order.' },
			{ id: id(), label: 'neutral', text: 'The movie was okay, kind of forgettable.' },
			{ id: id(), label: 'neutral', text: 'Standard café food — nothing remarkable either way.' },
			{ id: id(), label: 'neutral', text: 'It is what it is; I would not actively avoid it.' },
			{ id: id(), label: 'neutral', text: 'Mediocre acting carried by a passable script.' },
			{ id: id(), label: 'neutral', text: 'An average dining experience overall.' }
		],
		testQueries: [
			'I absolutely loved every minute of it.',
			'The worst dish I have ever ordered.',
			'It was fine, I guess.',
			'The cinematography was breathtaking.',
			'Service was slow but the food eventually came.'
		]
	},
	{
		id: 'topic',
		name: 'Topic',
		description: 'Five classes from headlines: tech, sports, politics, food, science.',
		classes: ['tech', 'sports', 'politics', 'food', 'science'],
		examples: [
			{ id: id(), label: 'tech', text: 'A new open-source large language model released this week.' },
			{ id: id(), label: 'tech', text: 'The startup raised forty million dollars in series B funding.' },
			{ id: id(), label: 'tech', text: 'Engineers shipped a major refactor of the database layer.' },
			{ id: id(), label: 'tech', text: 'A critical zero-day vulnerability was patched in the kernel.' },
			{ id: id(), label: 'sports', text: 'Lakers defeat Celtics in overtime to advance to the finals.' },
			{ id: id(), label: 'sports', text: 'The young striker scored a hat trick in the cup match.' },
			{ id: id(), label: 'sports', text: 'A record-breaking marathon time was set in Berlin yesterday.' },
			{ id: id(), label: 'sports', text: 'The team announced a new coach ahead of the spring season.' },
			{ id: id(), label: 'politics', text: 'The senator filibustered the proposed budget legislation.' },
			{ id: id(), label: 'politics', text: 'Voters rejected the constitutional amendment by a slim margin.' },
			{ id: id(), label: 'politics', text: 'A bipartisan committee announced new infrastructure spending.' },
			{ id: id(), label: 'politics', text: 'The prime minister called for early parliamentary elections.' },
			{ id: id(), label: 'food', text: 'A simple recipe for slow-cooked Massaman curry.' },
			{ id: id(), label: 'food', text: 'How to make sourdough from a fresh starter at home.' },
			{ id: id(), label: 'food', text: 'The best ramen shops in Tokyo, ranked by broth quality.' },
			{ id: id(), label: 'food', text: 'A new bistro opened downtown with a seasonal tasting menu.' },
			{ id: id(), label: 'science', text: 'Astronomers detected an unusual radio signal from a distant galaxy.' },
			{ id: id(), label: 'science', text: 'A new study links mitochondrial function to aging in mice.' },
			{ id: id(), label: 'science', text: 'CRISPR-edited bacteria show promise in treating rare diseases.' },
			{ id: id(), label: 'science', text: 'Researchers published a fresh proof of the four-color theorem.' }
		],
		testQueries: [
			'Apple announced a new line of M-series chips at the conference.',
			'The opposition called for the prime minister to resign.',
			'A bowl of miso soup with cubed tofu and ribbons of wakame.',
			'Olympic swimmers broke two world records over the weekend.',
			'A new vaccine entered phase III clinical trials.'
		]
	},
	{
		id: 'spam',
		name: 'Spam vs ham',
		description: 'Two classes: legitimate ("ham") vs spammy promotional / phishing.',
		classes: ['ham', 'spam'],
		examples: [
			{ id: id(), label: 'ham', text: 'Hey, are we still on for dinner Thursday at seven?' },
			{ id: id(), label: 'ham', text: 'Could you review the pull request when you get a minute?' },
			{ id: id(), label: 'ham', text: 'Reminder: the kids have a dentist appointment tomorrow morning.' },
			{ id: id(), label: 'ham', text: 'Thanks for the help debugging last night — finally got it working.' },
			{ id: id(), label: 'ham', text: 'Mom called — she wants you to call her back when you can.' },
			{ id: id(), label: 'spam', text: 'YOU HAVE WON $1,000,000! Click here to claim your prize NOW!' },
			{ id: id(), label: 'spam', text: 'Hot singles in your area are waiting to meet you tonight!' },
			{ id: id(), label: 'spam', text: 'URGENT: Your account has been compromised. Verify your password immediately.' },
			{ id: id(), label: 'spam', text: 'Lose 30 pounds in 30 days with this one weird trick doctors hate!' },
			{ id: id(), label: 'spam', text: 'Limited time offer! Click now to get 80% off premium membership!' }
		],
		testQueries: [
			'Want to grab coffee tomorrow afternoon?',
			'CONGRATULATIONS!!! You are our lucky winner today!',
			'I pushed the fix to the staging branch — can you verify?',
			'Click here for an exclusive deal you cannot refuse'
		]
	}
] as const;

export function getDataset(id: string): ClassifyDataset | undefined {
	return CLASSIFY_DATASETS.find((d) => d.id === id);
}

/**
 * Minimal CSV parser. Expects a `text,label` header (in either order)
 * plus subsequent rows. Returns LabeledExample[]. Quotes handled simply
 * for fields with commas inside.
 */
export function parseCsv(raw: string): LabeledExample[] {
	const lines = raw.split(/\r?\n/).filter((l) => l.trim());
	if (lines.length < 2) return [];
	const headers = splitCsvRow(lines[0]).map((h) => h.trim().toLowerCase());
	const textIdx = headers.findIndex((h) => h === 'text' || h === 'sentence' || h === 'input');
	const labelIdx = headers.findIndex((h) => h === 'label' || h === 'class' || h === 'category');
	if (textIdx < 0 || labelIdx < 0) {
		throw new Error('CSV must have a `text` (or `sentence`) and `label` (or `class`) column.');
	}
	const out: LabeledExample[] = [];
	for (let i = 1; i < lines.length; i++) {
		const row = splitCsvRow(lines[i]);
		const text = row[textIdx]?.trim();
		const label = row[labelIdx]?.trim();
		if (!text || !label) continue;
		out.push({ id: `up_${i}_${Date.now()}`, text, label });
	}
	return out;
}

function splitCsvRow(line: string): string[] {
	const out: string[] = [];
	let cur = '';
	let inQuote = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === '"') {
			if (inQuote && line[i + 1] === '"') {
				cur += '"';
				i++;
			} else {
				inQuote = !inQuote;
			}
		} else if (c === ',' && !inQuote) {
			out.push(cur);
			cur = '';
		} else {
			cur += c;
		}
	}
	out.push(cur);
	return out;
}
