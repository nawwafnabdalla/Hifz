# Release: part-by-part memorisation of long ayahs

Built from production (`1c57bc6`) as an isolated branch (`release/part-by-part`). It contains **only** the items below. Everything else from `claude/hifz-os-phrase-audio` stays on that branch.

## In this release
* Long ayahs (more than 20 words that the app's existing practice phrases split into three or more parts) are learned a part at a time: Sound → Flow → Recall for each part, joined A → B → C…, then the ordinary whole-ayah recall.
* Saved progress: what was recalled is remembered across sessions; the next session picks up at the first part not yet secured, after a quick check of what was learned (if it has been 6+ hours).
* "I already know further than this": tap the last part you are sure of; you are tested from the start up to it.
* Planner: a started long ayah comes back as "continue with part C of N", sized to the session (a five-minute session can be one part); session summary counts part progress as progress.
* Small learning-UI improvements: the part in hand is softly highlighted; "Finish for today" after any part; "Learn this ayah whole / part by part" (only on ayahs this applies to).

## Not in this release (and why)
| Held back | Why |
|---|---|
| Phrase audio, recording timings, byte-window decoding, test-code gate, preview-build changes | Recording rights are not cleared; kept on `claude/hifz-os-phrase-audio`. |
| The grammar-model automatic breakdown (`breakdown.ts`, `phrase-candidates.json`) | Its boundaries have not been reviewed by a qualified reader. |
| Wrangler `previews` block, branch-aware build, hostname guard | Build/preview infrastructure for the audio branch; not needed for this feature; the branch-aware build could, if misconfigured, blank production's cloud settings. |

## The one dependency, stated plainly
Part boundaries come from the **mushaf's own printed stop signs** (`suggestBoundaries`), the same boundaries production already uses for the Flow ladder, or from the learner's own phrase edits. No new boundary source is introduced. Where an ayah has fewer than three practice phrases (including long ayahs with few printed signs) nothing changes from today. With this rule, 377 of the 954 ayahs longer than 20 words use part-by-part learning (6% of the Qur'an); 572 long ayahs keep today's behaviour. Parts are uneven where signs are far apart (for example 2:61 starts with a 30-word part). The learner can always choose "Learn this ayah whole". Phrases are for practice, never rulings on where to stop reciting.

## Qur'an integrity and memory evidence
* The Qur'an text is untouched (text-integrity tests unchanged and passing). Parts only choose which words to show or hide; nothing is altered, re-ordered or cut mid-word.
* A recall of part of an ayah is stored as a **`PartEvent`**. The memory model, the planner's retention estimates and the review schedule never read it: learning A, B, C and D separately does not make an ayah "memorised". Only a recall of the **whole ayah** (the existing `ReviewEvent`) does (tested).
* "I already know further" counts as part evidence only; "all of it" goes to the ordinary whole-ayah recall.

## Stored data and compatibility
* New IndexedDB table `parts` (Dexie version 2). Additive: existing tables and rows are untouched; databases from production upgrade automatically. **No Supabase migration; part progress is not synced** between devices yet (it is in backups). A cross-device sync table would be a separate, reviewed change.
* Backups made before this release import unchanged (the `parts` list defaults to empty); backups made after include it.
* Rollback safe: the previous code opens the upgraded database and ignores `parts`; checked in a real browser (see the verification record).
* The existing 12-hour resume of the Learn screen accepts old saved positions; a saved position is used only if it is still the next part by the evidence.

## Rollback
`backup/prod-before-part-by-part` is a branch at `1c57bc6`. To roll back: push that commit to the production branch (`git push origin backup/prod-before-part-by-part:claude/hifz-os-feasibility-btrmfb --force-with-lease`), or revert the release merge. Learners' records stay intact either way (the `parts` rows remain, unused).

## Update (5 Nov 2026): continuous recitation and the first-word hint
* **Learning progression changed after phone testing:** each new part is introduced, practised, and then tested by reciting the growing sequence from the beginning (A → B, then A → B → C …); an isolated part is no longer asked for in first-time learning. A slip is repaired briefly at the joint and the learner returns to the recitation; nothing already learned is repeated. Progress saved by the previous version still counts. Parts are not places to stop (the screen says so). See `PART_BY_PART.md`.
* **Bug fixed:** the first-word hint showed nothing for any part that does not start the ayah (it always pointed at word 0 of the ayah). It now reveals the first word of the part being added, or the ayah's first word in a whole-ayah recall.
* Still held back from production: the translation-aware boundaries and meaning lines (unreviewed; preview only), phrase audio, the preview and test-access infrastructure.

## Update (5 Nov 2026): a run-up into revised passages
Revision (any recall that is not first-time learning) now begins with the ayah before the passage, shown and readable ("Run-up"), above the hidden passage; the learner reads it to get into the rhythm and continues from memory. It is never hidden, graded or recorded, and need not have been memorised: only the passage is assessed and saved. A very long preceding ayah shows only its last 14 words; at the start of a surah the cue is the surah's name ("begins here, after the Basmala", except al-Fatiha and al-Tawbah). The existing first-words hint is unchanged and refers to the passage. First-time learning is unchanged. No stored data changed. See `src/lib/engine/leadin.ts`, `tests/leadin.test.ts`, `e2e/leadin.spec.ts`.
