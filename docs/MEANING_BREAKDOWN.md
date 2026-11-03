# Meaning-aware practice phrases (4 Nov 2026)

**Status (5 Nov 2026): in production as learning scaffolding.** The automatic boundaries have **not** been reviewed by a qualified reader, and the part screen says where each ayah's breaks come from (mushaf signs or a reviewed list / automatic and unreviewed / the learner's own). Ta-Ha 20:10 uses the five units its owner specified (`src/data/phrase-review.json`, status `owner-specified`). Phrase audio and the preview/test-access work are NOT in production.

## The idea, and what it needed
An ayah should be broken where its **meaning** turns (Ta-Ha 20:10: *when he saw a fire | said to his family "Stay here" | indeed, I have perceived a fire | perhaps I can bring you a torch from it | or find guidance at the fire*), not at a word count. The translation's clause structure is one more piece of evidence, never the authority: translations paraphrase, reorder, expand and omit, and English punctuation is not Arabic phrasing.

## What I found when I looked at the existing splitter
* For 20:10 the existing grammar splitter made **two long pieces (11 + 7 words)** with one cut in the middle of a clause. The reason is not the length rule alone: the grammar model (trained on printed stop signs, spelling-only) gives almost no support at the clause starters of this ayah (before فَقَالَ, إِنِّيٓ, لَعَلِّيٓ). So the translation alone could not have helped; the Arabic needed a clause-opener signal too.
* Resources (checked; none adopted):
  * **QUL word-by-word English** (resource 92) exists, and QUL has ~20 English translations, but the downloads are gated behind a sign-in and each resource's Licence page says *"We don't have copyright information for this resource."* Not used. (Their public per-ayah preview pages were only read to understand the format.)
  * **Hugging Face community word-by-word sets** (for example zaibihassan's, Apache-2.0 per a third-party index; Tadabur, CC BY-NC) are audio-and-text datasets whose recordings' rights are unclear. Not used.
  * **The Quranic Arabic Corpus** (syntax and word-by-word) is GNU GPL and is already kept out of the shipped data (`PHRASE_AUDIO_LEGAL.md`). Not used.
  * **Second translations:** quran.com, Tanzil and alquran.cloud are not reachable from my sandbox, QUL's downloads are gated, and npm has no usable public-domain package. So **only Saheeh International** (already in the app, "personal, verbatim, attributed") was used. A second translation is **not** done; see "Multiple translations".
* So the approach is built only from what the app already holds (the Arabic text and the Saheeh translation) plus rules I wrote.

## The method (all deterministic at run time)
Evidence per gap between two Arabic words, combined in the same scoring the splitter already used (`src/lib/engine/breakdown.ts`):
1. **Printed stop signs** (strong, as before). The position of the *weaker* signs (ۖ ۛ) now also counts as clause-end evidence (not as a place to stop reciting).
2. **Arabic grammar model** (as before, probabilities per gap).
3. **Arabic clause-opener rules** (new, deterministic, reviewable list): inna and sisters (إِنَّ إِنِّي إِنَّا إِنَّهُ…), لَعَلَّ, ثُمَّ, أَوْ, forms of قَالَ, and the temporal/conditional openers إِذۡ إِذَا لَمَّا كُلَّمَا أَمَّا لَوۡ (leading و/ف looked through). They only raise a gap's probability.
4. **English clause evidence** (new, precomputed offline into `src/data/generated/meaning-evidence.json`, 420 KB, 97 KB gzipped): a word alignment between the Arabic and the English was **learned from the Qur'an and the Saheeh translation themselves** (an IBM-model-1-style model with a diagonal prior, both directions, keeping only links both directions agree on). English clause boundaries (`; : . ?`, spaced dashes, commas, quotation marks, clause-opening words such as *indeed / perhaps / then / so / but / when / if / or*) are mapped onto the Arabic gaps. A comma after a sentence adverb ("Indeed,") ends no clause, and "those who" is one unit. A quotation opening straight after "said …," is *weak*, so *he said to his family, "Stay here"* stays together. When the alignment is uncertain a boundary's strength is shared between the gaps it could belong to.
5. **Reciter pauses** (as before, when verified timings exist).
6. **Length**: pieces are held to about 8 words (a three-word clause such as "When he saw a fire" is allowed). Ayahs of 12 words or fewer stay whole.

**Guards (all tested):** the translation can strengthen a break the Arabic supports and can rescue a weak candidate, but it **can never create a break with no Arabic support** (neither can a pause); it can never override the avoid rules (the "do not stop" sign; a word that completes what precedes it); it is attached to the best-supported Arabic gap within one word of where the alignment put it; and where there is no clear English counterpart it contributes nothing.

## Measured results (read the caveats)
Two small reference sets, **written by me** (not a qualified reader), `data/validation/meaning-reference.json` (11 ayahs, 45 major boundaries; I tuned on these) and `data/validation/meaning-heldout.json` (7 ayahs, 21 major boundaries, annotated *before* the method was run on them). Precision counts breaks that are neither a major nor an acceptable boundary as errors.

| Method | Tuned set P / R / F1 | **Held-out P / R / F1** |
|---|---|---|
| Printed stop signs only | 1.00 / 0.33 / 0.50 | 1.00 / 0.24 / 0.38 |
| **Existing splitter** (Arabic grammar + stop signs) | 0.96 / 0.53 / 0.69 | 0.75 / 0.43 / 0.55 |
| + smaller pieces | 0.88 / 0.62 / 0.73 | 0.75 / 0.43 / 0.55 |
| + Arabic clause-opener rules | 0.91 / 0.71 / 0.80 | 0.79 / 0.52 / 0.63 |
| + three-word clauses allowed (still **no translation**) | 0.92 / 0.76 / 0.83 | 0.81 / 0.62 / 0.70 |
| **+ the translation (new method)** | **0.93 / 0.84 / 0.88** | **0.88 / 0.71 / 0.79** |

* On both sets the **translation adds recall** on top of the Arabic-only rules (0.76 → 0.84 tuned; 0.62 → 0.71 held-out), at similar precision. **Most of the gain over the existing splitter, however, comes from the Arabic clause-opener rules and the smaller length target, not from English.** If the translation were removed the method would still be much better than before.
* Ta-Ha 20:10 now breaks at *…Stay here | indeed I have perceived a fire | perhaps I can bring you a torch | or find at the fire some guidance* (the owner's five units, except that the first two stay together: 6 + 3 + 4 + 5 words).
* A correction I made to my own annotation: in 2:255 I had marked the last major boundary one word late (47); the printed sign is after word 46. Fixed before the final numbers.
* **Caveats:** tiny sets; the reference was written by the same person who wrote the method (the principle "a reporting clause stays with its quotation" is the owner's, applied by me); tuning steps were made after seeing the tuned set (the held-out set was not touched); confidence intervals are wide. Treat these numbers as a sanity check, not proof.

**Whole Qur'an, ayahs over 12 words (2,451):**

| | Existing splitter | New |
|---|---|---|
| Ayahs split at all | 2,284 | 2,414 |
| Ayahs with 3+ parts | 1,466 | 1,905 |
| Median / 90th-percentile piece (words) | 6 / 10 | 5 / 9 |
| Pieces over 14 words | 43 | 13 |
| Pieces under 3 words | 0 | 0 |

**Where translation and Arabic disagree** (`data/validation/meaning-agreement.json`): of 6,966 strong English clause boundaries, **52%** also have Arabic support. In **44% (3,084)** the English suggests a break the Arabic gives no support for, and none is made. That is the intended behaviour (English is not the authority), and also where my alignment is most likely wrong. 3,940 of the 6,759 breaks made have translation support, 2,819 stand on the Arabic alone, and in 306 a weak Arabic candidate was rescued by the translation. The most informative of these (600 rows) are in `data/review/meaning-boundaries-for-review.csv` for a qualified reader.

**Audio.** Meaning units are smaller than where reciters pause: only **41% (Yasser) / 34% (Maher)** of the new breaks fall on a measured pause of ≥100 ms (the existing splitter: 45% / 38%; printed stop signs alone: 62% / 51%). So on verified recordings **more phrase-audio requests will be refused** ("no genuine pause") and fall back to the whole ayah, as designed. The splitter still prefers a paused gap when timings exist. This is a real trade-off between "meaningful" and "playable on its own".

## Meaning beside each part
In part-by-part learning (long ayahs) the Sound screen can show a line **Meaning:** under the part, and the Flow screen shows it for a single part. It is taken **verbatim** from the translation already shown, cut where the matching English clause begins and ends. It is shown only when both cuts are known and the English is a plausible length for the Arabic (1.0–2.8 English words per Arabic word); otherwise nothing is shown. It **fades** once that part has been recalled accurately again after a break, and it is never shown during Recall, so it cannot become the prompt. One setting controls it (Settings → Show translation; a small "hide" link next to the line turns it off). It is not a separate learning mode.
* Coverage: 81% of the phrases of split ayahs get a meaning (7,453 of 9,171).
* Accuracy: on my audit of 14 ayahs (44 meanings shown) about **9 in 10 were right**, a few cut a clause early or late. The length guard removed the worst cases I found (for example 19:4). **No one else has audited this.**
* It displays pieces of one translation under the Arabic. The translation's terms ("personal, verbatim, attributed; review before public release") still need that review before any public release.

## Multiple translations (not done; why)
Averaging several translations could reveal which clause breaks are robust, but: only one translation was available to me; the common English translations (Saheeh, Hilali-Khan, Pickthall, Yusuf Ali) share interpretive lineage, so their **agreement** is weak evidence of independence, while their **disagreement** is the useful signal (it flags a clause structure that translators read differently). A sound design for later: use a second, independently-derived translation only to **flag** low-confidence boundaries for human review, never to add confidence.

## Review (required before any release)
1. A qualified Qur'an reader should review `data/review/meaning-boundaries-for-review.csv` and the reference sets, and list rejections in `src/data/phrase-review.json` (which the splitter already honours).
2. Review the meanings shown (a sample) for accuracy and for the translation's terms.
3. Confirm with a teacher that learning in these units suits memorisation (the units are for practice, never for where to stop).

## What is not claimed
* Not claimed: that these are the right places to pause; that the translation is a reliable guide to Arabic phrasing; that the alignment is accurate (it is crude, learned from 6,236 pairs, and weakest on rare words); that learners do better with these units (not tested with learners).
* Reproduce: `MEANING_REPORT=1 npx vitest run tests/meaning.eval.test.ts`, `MEANING_REVIEW=1 npx vitest run tests/meaning.review.gen.test.ts`. The offline alignment tool (Python, no dependencies) is described in `scripts/meaning/README.md`.

## Files
`src/lib/engine/breakdown.ts` (rules, evidence, scoring), `src/lib/engine/meaning.ts` (the meaning shown), `src/data/generated/meaning-evidence.json` (offline output), `tests/meaning*.test.ts`, `data/validation/meaning-*.json`, `data/review/meaning-boundaries-for-review.csv`.
