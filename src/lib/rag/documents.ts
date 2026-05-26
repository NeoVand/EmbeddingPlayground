/**
 * Curated sample documents for the RAG lab. Each one is long enough to
 * chunk into 20+ pieces with the default strategies, and varied enough
 * that semantic search has interesting results.
 */

export interface SampleDoc {
	id: string;
	title: string;
	source: string;
	text: string;
}

export const SAMPLE_DOCS: readonly SampleDoc[] = [
	{
		id: 'photosynthesis',
		title: 'How photosynthesis actually works',
		source: 'Sample · plant biology',
		text: `Photosynthesis is the process by which plants, algae, and some bacteria convert sunlight into chemical energy stored in glucose. The overall reaction takes carbon dioxide and water as inputs and produces glucose and oxygen.

Inside a leaf, photosynthesis happens in specialized organelles called chloroplasts. A single leaf cell can contain dozens of chloroplasts. Inside each chloroplast are stacked membrane discs called thylakoids, surrounded by a fluid called stroma.

The process splits into two stages. The light-dependent reactions happen on the thylakoid membranes. The light-independent reactions, also called the Calvin cycle, happen in the stroma.

When a photon of light hits chlorophyll, an electron is excited to a higher energy state. This excited electron is passed down a chain of proteins called the electron transport chain. As it moves, it pumps hydrogen ions across the thylakoid membrane, creating a gradient.

That gradient is what powers ATP synthase, a remarkable rotary enzyme that spins as protons flow back through it, attaching phosphate groups to ADP to form ATP. The same light-driven process also reduces NADP+ to NADPH. ATP and NADPH are the two energy currencies that drive the next stage.

Water is split during the light reactions to replace the electrons that chlorophyll donates. This is where the oxygen we breathe comes from — a byproduct of plants extracting electrons from water molecules.

In the Calvin cycle, the enzyme rubisco grabs carbon dioxide from the air and attaches it to a five-carbon sugar called RuBP. The resulting unstable six-carbon molecule immediately splits into two three-carbon molecules. ATP and NADPH from the light reactions then power a series of steps that rearrange these molecules to ultimately produce glucose, while regenerating RuBP so the cycle can continue.

Rubisco is famously the most abundant protein on Earth, and also famously sluggish — it only processes about three carbon dioxide molecules per second. Plants compensate by making enormous quantities of it.

The efficiency of photosynthesis is much lower than you might expect. Only about one to two percent of the solar energy hitting a leaf is converted into stored chemical energy. The rest is reflected, transmitted, or lost as heat. Yet over geological time, this slow trickle has fundamentally reshaped the Earth's atmosphere and powered nearly all life on the planet.

Different plants have evolved variations of photosynthesis to handle different climates. C4 plants like corn and sugarcane use a spatial separation to concentrate carbon dioxide where rubisco can grab it more efficiently. CAM plants like cacti and pineapples use a temporal separation — opening their stomata only at night to avoid water loss in hot desert conditions.

Understanding photosynthesis matters for far more than botany. It connects to climate science, because plants are the primary land-based carbon sink. It connects to agriculture, because boosting photosynthetic efficiency could increase crop yields. And it connects to engineering, because researchers are trying to design artificial photosynthesis systems that can produce hydrogen fuel directly from sunlight and water.`
	},
	{
		id: 'alexandria',
		title: 'The Library at Alexandria',
		source: 'Sample · history',
		text: `The Library of Alexandria, founded in the third century BCE in the Egyptian city of Alexandria, was one of the largest and most significant libraries of the ancient world. It was part of a larger research institution called the Mouseion, which translates roughly as "the place of the Muses."

Alexandria itself was a planned city, founded by Alexander the Great in 331 BCE after his conquest of Egypt. After Alexander's death, his general Ptolemy seized control of Egypt and founded a dynasty that would rule for nearly three centuries. The Ptolemies actively cultivated Alexandria as a center of Hellenistic culture and learning.

Demetrius of Phalerum, a former governor of Athens, is traditionally credited with proposing the Library to Ptolemy I. The early Ptolemaic kings poured resources into acquiring books from across the known world. Every ship that docked in Alexandria's harbor was searched, and any books found were copied. The originals went to the Library, and the copies were returned to the owners — a state-sponsored intellectual property heist on a remarkable scale.

The Library housed papyrus scrolls rather than codices, the bound books that came later. Estimates of its collection vary wildly, from 40,000 to 700,000 scrolls. A single ancient text often required several scrolls, so the actual number of distinct works is harder to pin down.

The librarians at Alexandria were not just keepers of books but active scholars. Eratosthenes, who served as chief librarian in the third century BCE, calculated the circumference of the Earth to remarkable accuracy by comparing the angle of the sun at noon in two Egyptian cities. Other Alexandrian scholars made foundational contributions to mathematics, astronomy, medicine, and literary criticism.

The Library is most famous, of course, for its destruction. The truth is complicated. There was no single dramatic fire. Instead, the Library's decline was gradual, spanning centuries. Julius Caesar's troops accidentally set fire to part of the collection during a siege in 48 BCE. The Library suffered further damage during civil wars in the third century CE. Religious and political upheavals in the late Roman period continued to erode it. By the time of the Arab conquest in the seventh century, what remained of the Library was probably already gone, despite a persistent legend that blames Caliph Omar for its final destruction.

What we lost is impossible to measure. Many ancient works are known only by name, mentioned in surviving texts but with their actual contents gone. The medical writings of Herophilus, who pioneered the dissection of human bodies. The history of Theopompus, a contemporary of Plato. The poetry of countless authors whose names we no longer remember.

The Library remains a cultural symbol of immense power. It represents the dream of universal knowledge, the fragility of accumulated wisdom, and the catastrophe of cultural loss. Modern librarians and digital archivists frequently invoke it as both inspiration and warning. The new Bibliotheca Alexandrina, opened in 2002 on a site near the ancient Library, is part homage, part rebuilding, and entirely a recognition that what was lost was irreplaceable.`
	},
	{
		id: 'compiler',
		title: 'How a compiler turns code into a program',
		source: 'Sample · computer science',
		text: `A compiler is a program that translates source code written in a high-level programming language into a lower-level form that a computer can execute. The translation typically involves several distinct phases, each with its own responsibilities.

The first phase is lexical analysis, often called scanning. The lexer reads the raw source text character by character and groups characters into tokens — the smallest meaningful units of the language. Keywords, identifiers, numbers, operators, and punctuation each become tokens. The lexer also typically strips out whitespace and comments at this stage.

Next comes parsing, also called syntactic analysis. The parser takes the stream of tokens and builds a tree structure called an abstract syntax tree, or AST, that represents the program's grammatical structure. The parser enforces the language's grammar — it catches syntax errors like missing semicolons or unmatched braces. Modern parsers are usually built from a formal grammar specification using tools like ANTLR or hand-written using techniques like recursive descent.

After parsing, the compiler performs semantic analysis. This phase walks the AST and enforces the language's type and scope rules. It checks that variables are declared before use, that functions are called with the right number and types of arguments, and that operations make sense for their operands. Semantic analysis is where type-checking happens in statically typed languages.

Once the program is known to be syntactically and semantically valid, the compiler moves to intermediate code generation. Many compilers translate the AST into an intermediate representation, or IR, that is closer to machine code but still platform-independent. LLVM's IR is a famous example — it lets you write a compiler frontend for any language and then use LLVM's existing backends to target many different processor architectures.

Optimization is where compilers can spend most of their time. The compiler analyzes the IR and rewrites it to be faster or smaller without changing what the program does. Common optimizations include constant folding, dead code elimination, loop unrolling, function inlining, and register allocation. Modern optimizing compilers can produce code that runs orders of magnitude faster than a naive translation of the source.

Code generation is the final phase. The compiler translates the optimized IR into actual machine instructions for a specific processor architecture. This involves choosing the right instructions, allocating values to registers, and emitting the binary encoding the processor expects.

Linking happens after compilation, usually as a separate step. Most real programs are split across multiple source files and use library code. The linker resolves references between compiled object files and library code, producing a final executable.

Some languages skip ahead-of-time compilation entirely and use interpretation or just-in-time compilation. An interpreter executes the AST or a bytecode representation directly. A JIT compiler combines interpretation with on-the-fly compilation — hot code paths get compiled to machine code while the program is running.

Modern compiler infrastructure is increasingly modular. LLVM, GCC, and the Java HotSpot VM are all built around the idea that you can mix and match frontends, optimizers, and backends. This modularity is why new languages can ship with reasonably good performance from day one — they can plug into existing toolchains rather than building everything from scratch.`
	}
] as const;

export function getDoc(id: string): SampleDoc | undefined {
	return SAMPLE_DOCS.find((d) => d.id === id);
}
