# Part-by-part memorisation of a long ayah

**What it is.** A long ayah is learned a part at a time, across as many sessions as it takes, and joined back into the whole ayah. It is the existing Sound → Flow → Recall method applied to one part at a time. There is no new tab, no setting, no phrase configuration.

## Which ayahs
Ayahs the app splits into **three or more** practice phrases **and** that are **longer than 20 words** (`PARTS_MIN_PHRASES`, `PARTS_MIN_WORDS` in `src/lib/engine/parts.ts`). Everything else keeps the ordinary ladder exactly as before: short ayahs stay whole, two-phrase ayahs and 13–20-word ayahs keep Sound → A→B ladder → Recall. An ayah the learner has already recalled successfully also keeps the ordinary ladder (and its slip repair). "Learn this ayah whole" remains one quiet tap. The phrases are the ones the app already uses for the Flow ladder: the learner's own breaks if any, otherwise the mushaf's printed stop signs (`suggestBoundaries`). The learner never has to set them.

## The learning flow (per part, in the learner's words: "I'm learning this part")
For part *P* (A, B, C, …):
1. **Sound** — the text up to this part with earlier parts dimmed and the part in hand highlighted; the ordinary player plays the whole ayah (the screen says so). "I know this part already: test me" skips ahead.
2. **Flow** — the familiar tap-counter and Tangled / Improving / Natural rating, on: the part alone → the join with the part before it (A → B) → from the third part on, the chain from the start (A → B → C). These are ordinary `FlowEvent`s, so slip marks, repair ladders and the planner's reasons are unchanged.
3. **Recall** — the part from memory (hint: first word only; "on my own" is not offered with a hint). Then, from B on, the whole span so far (A → B) from memory, which is what tests the join. If it goes wrong the learner may tap the word where they slipped; words before it count as recited, words after it as not reached, and only the phrase that contains the slip is reopened.
4. **Part done** — "Next: part B" or **Finish for today**. Both are equal outcomes; finishing is not "abandoning".
5. After the last part, the final join *is* the whole ayah, so the ordinary whole-ayah recall appears. Only that (a `ReviewEvent`) can make the ayah memorised and schedule its revision. If it goes wrong the ordinary repair path applies.

## Where progress lives (and why leaving never loses it)
* New evidence type **`PartEvent`**: ayah, a **word span** (not phrase numbers, so a later change of phrase layout can never turn old records into false progress), grade, cue level, optional slip word, duration, time. Stored in a new IndexedDB table `parts` (Dexie v2, additive; existing tables and rows untouched; upgrade tested). Included in backups (`parts`, defaulting to empty so old backups still import).
* The learner's place is **derived** from those events (`partProgress`), never saved as a screen position: first phrase not currently "secured" = the next part; a phrase is secured when the latest recall covering it was accurate (independent or hesitant, at most the first word shown). A failed recall with no slip marked reopens every phrase it covered; with a slip marked it reopens only the phrase containing the slip.
* **Never mixed with memory.** `deriveState` does not feed `PartEvent`s into the memory model. Learning A, B, C and D separately does not make the ayah "memorised"; only a whole-ayah recall does (tested).
* Evidence levels kept distinct: heard (audio, `listenedFirst`); repeated with assistance (flow reps); oral fluency (flow "natural"); independent recall of a part (`PartEvent`, accurate, no hint beyond the first word); held over a break (an accurate recall ≥ 6 h after the first); connected (an accurate recall spanning ≥ 2 phrases); whole ayah (`ReviewEvent`).
* A reload mid-part returns to the same step (the existing 12-hour resume), a half-finished recall is never graded for the learner.

## Resuming and revision (through the existing daily planner)
* A started long ayah is a "New" plan item titled "start with / continue with part C of N", whose time estimate is **only the parts that fit the session** (at least the next one), so a five-minute session can be one meaningful part. The reasons say what is learned, what is next, and which part went wrong last time.
* After 6 hours the parts already learned are checked first (a recall of A, or A → B …) before a new part is added. If the check goes wrong, the part in hand becomes the first phrase that is not secured, with a plain message; nothing is relearned from scratch.
* An ayah started outside any goal still comes back. When every part is secured but the whole ayah has not been recited, the item is "join the parts" with a small estimate.
* The session summary reports part progress as progress ("Learned part of a long ayah … next time continues from there"), also when the learner left early.
* Once the whole ayah has been recalled, it is an ordinary ayah: normal revision, normal repair, normal junction drills.

## Balance of part repair and whole-ayah revision (a decision, with its limits)
Revision of a learned ayah is always **whole-ayah** recall, because only that tests continuous recitation and it is what the retention estimate is built from. Part-level work is a *warm-up and repair* around it: the slip tap marks the exact joint (existing mechanism), the planner and repair ladder practise that joint, then the whole ayah is recited again. Part events never replace whole-ayah evidence.
**Evidence base, honestly:** a search found no strong research showing one part/whole ordering is best. A 2002 meta-analysis of motor skills found the support for part-versus-whole recommendations weaker than commonly assumed, with clearest part advantages for complex tasks that can be fractionated ([Templet & Hebert, abstract via AAHPERD](https://aahperd.confex.com/aahperd/2002/finalprogram/paper_2084.htm)); an early perceptual-motor study found the whole method superior, which the authors attributed largely to distributed practice ([McGuigan & MacCaslin 1955, listing](https://www.bohrium.com/paper-details/variation-of-whole-part-methods-of-learning/812083616933740545-11152)). Traditional hifz sources describe the sabaq / sabqi / manzil structure the app already follows ([example](https://www.quransheikh.com/hifz-teaching-methodology-used-by-quran-sheikh-tutors/)); I could not confirm line-by-line joining from them. So: parts are used only where an ayah is too long for one sitting (> 20 words, ≥ 3 phrases), cumulative joining is used because the final goal is continuous recitation, and everything is easy to change. **I have not validated that this beats the ordinary ladder for learners; that needs your use and, ideally, a teacher's view.**

## Not done / limits
* `PartEvent`s are **local only**: no server table exists yet, so they are not synced (they are in backups). Adding sync needs a reviewed Supabase migration (new `part_events` table, RLS like `review_events`) — **not applied, needs your explicit approval before production**. Until then, partial progress on one device is not on another.
* Not verified on an iPhone.

## "I already know further than this" (4 Nov 2026)
On the Sound screen of any part, a quiet link lets the learner say how far they already know. They tap the last part they are sure of (or "all of it"); the app tests them **from the start up to that part, from memory** (the same part recall, first-word hint allowed). A pass counts every part up to there as learned and continues at the next part; a slip (tap the word) reopens only the part that went wrong; "Never mind" returns. "All of it" goes straight to the ordinary whole-ayah recall. It is evidence like any other part recall: it never makes the ayah "memorised" by itself. The part in hand is also softly highlighted on the Sound screen.
**Not built:** moving highlighting while a recording plays (it needs word timings); "test me only up to ayah N" for multi-ayah passages in revision.

## Continuous recitation, not isolated parts (5 Nov 2026)
Parts are how Hifz OS **teaches** an ayah; the whole ayah is what it **tests**. After the owner's testing on a phone the progression became:
* **A:** Sound → Flow → recite A from memory.
* **B:** introduced with its words; practised with the text (B alone, then A → B); then **A → B is recited from the beginning**. B is never asked for on its own. If a hint is wanted it is the first word of the part being added (B), because that is where a join slips.
* **C:** the same, then **A → B → C** from the beginning; and so on. The last step is the whole ayah, tested like any whole-ayah recall.
* **A slip while reciting the growing sequence:** tap the word (optional). Only the joint around it is practised briefly (a short rung), then the learner is back at reciting from the start. Sound and Flow for the parts already learned are not repeated. Without a marked slip the newest joint is practised, and the parts that were already secured stay secured (`partProgress`: an unlocated failure reopens only the newest part when everything before it was secured).
* **Evidence stays separate:** help (Flow), a successful join (a `PartEvent` spanning from word 0), reciting the whole ayah (a `ReviewEvent`), and retention on later days (further `ReviewEvent`s). Joins never reach the memory model. A hinted whole-ayah recall is weaker evidence (cue 3, never "on my own"), schedules an early check and makes the ayah "reviewing", not "strong".
* **Parts are not places to stop:** the Sound screen says so ("These parts are only a way to learn… keep the ayah joined").
* Independent retrieval of an isolated part (what the earlier version asked for) is **not** part of first-time learning. Events saved by that version still count.

## The first-word hint (bug fixed)
The hint revealed "word 0 of the ayah" for every part (`visibleAt(cue 3, i)` counted from the ayah's first word), so any part that does not start the ayah showed **nothing**. Now (`src/lib/engine/hints.ts`): the pipeline is current part → its word range → the word to reveal → display; the cue patterns are counted from the start of the range being recalled; the hint in a joined recitation points at the first word of the part being added; in whole-ayah recall it is the ayah's first word. Hints are never stored, so changed boundaries cannot leave a stale or blank hint. Regression tests: `tests/hints.test.ts` (Ta-Ha 20:10, automatic and manual breaks) and `e2e/parts.spec.ts` (every part).
