# One record of what the learner knows

> Hifz OS should track what you actually know, not how many screens you have completed.

## 1. Audit (what existed before this change)
**Already unified.** Every ayah has one memory record (`AyahMemory`) derived from the immutable review log (`derive.ts`). Goals store **no progress of their own**: their progress is read from the ayahs. Transition (ayah → next ayah) records are global per pair. Practice events (Flow) never touch memory. The planner builds a day from the ayah records, so two goals over the same ayahs cannot ask for them twice.

**Not unified (the real gaps):**
1. **A session was a frozen snapshot.** Evidence recorded after the plan was made (in another session, goal or screen) did not change what the session asked for: the learner could be asked to prove the same ayah again.
2. **The learning flow ignored existing progress.** Opening Learn on an ayah already recalled re-ran Sound and Flow and then Recall.
3. **Sound and Flow were two screens**, and Flow's three self-ratings gated progress although a rating establishes no memory evidence.
4. **Part-by-part state ignored whole-ayah attempts.** A recall that went wrong at a marked word said nothing about the parts before it.
5. **A transition could be re-drilled right after it was recited cleanly.**
6. The only stage- or screen-specific progress is local and not evidence: the Learn resume position (`localStorage`) and the session queue (`completed` / `skipped`).

## 2. The model
Exercises produce **evidence**; evidence updates **shared state**; every screen asks the same state what is needed (`evidence.ts`).

| What the learner did | Evidence | Updates |
|---|---|---|
| Listened, read aloud with the text visible, repeated, practised a transition | **practice** (`FlowEvent`) | practice record only (reps, time, a "tricky" mark). **Never memory.** |
| Recalled with the text hidden, then checked | `ReviewEvent` (cue 4) | the ayah record(s), to the extent demonstrated (existing attribution) |
| Recalled with hints | `ReviewEvent` (cue < 4) | weaker evidence; never "on my own" |
| Recited a transition from memory | `ReviewEvent` kind `junction` | that transition only; **not** either whole ayah |
| Recalled part of an ayah | `PartEvent` | part progress only; never the ayah's memory |
| Flagged a word (forgot / wrong / pronunciation) | `wordIssues` on the review | recorded as what it is; pronunciation is not forgetting |

**Derived, never stored:** what a whole-ayah attempt shows about its parts (`partcredit.ts`): an accurate recall secures every part; a recall that went wrong at a marked word secures the parts before it; a failure with no marked word, a hinted recall and practice show nothing.

**One definition of "needed" (`reviewObligation`)** is used by the planner, by the session and by the learning flow:
* `neededRange` re-checks a planned item when it comes up. Ayahs already recalled since the plan was made are dropped from its ends, an entirely covered item is passed over ("Already covered", with when it returns), and an ayah that is still due is never dropped.
* The learning flow skips an ayah that is already in place, opens a due ayah straight at recall (practice one tap away), and still practises an ayah that needs repair or has a spot marked tricky.
* `junctionDue` does not re-drill a transition that was recited cleanly in the last 12 hours.
* Spaced revision is unchanged: an ayah recalled now returns at its interval.

## 3. The learning experience
**Practise → Recall → Connect** (the three steps), replacing Sound → Flow → Recall → Connect.
* **Practise** is one screen: the text (current step highlighted), its meaning, the reference audio, an optional repetition counter and one primary button. The overlapping transitions are all still there (A, A → B, B → C …), one tap each; the button says where it leads ("Next: A → B", then "Recall from memory"). **No rating is required to move on**: nothing is being claimed. Practice records that it happened (reps, time), never that it went well. "This part is tricky" is the only judgement offered. "Skip to recall" is one tap away. The explicit Tangled / Improving / Natural rating remains only where a rating **is** the evidence: clearing a spot marked tricky.
* **Recall** is unchanged: text hidden, then checked (see `REVISION_CHECKING.md`).
* **Connect** is offered, never forced ("Finish without joining").
* Part-by-part learning, meanings, reference audio, targeted repair and the Phrases editor are unchanged.

## 4. Migration and reversibility
* **No data migration.** No stored shape changed: `ReviewEvent`, `FlowEvent`, `PartEvent`, sessions and targets are as before. The only additions are derived (part credit) or optional (`ActiveSession.covered`, which older versions ignore).
* **History is not inflated.** Existing practice events are still practice; no old event is reinterpreted as recall. Deriving ayah, transition and practice state gives identical results to before for any history (tested). Part credit comes only from past recalls with the text hidden (or only the first word shown).
* **Rollback is safe.** This version writes the Learn resume position with stage `"flow"` for practise, so the previous version resumes it correctly; it reads `"sound"` and `"flow"` as practise.

## 5. Not claimed
The app still cannot hear a recitation; evidence is what the learner reports. A partly covered or covered item is judged only from recorded recalls, never guessed. The memory model's parameters are unchanged (hand-set defaults).

## 6. Tests
`tests/unifiedEvidence.test.ts` (shared record, overlapping goals, no duplicate obligations, reading is not recall, transitions, part credit, history not inflated), `e2e/unified.spec.ts` (practise as one screen, no required ratings, overlapping transitions, known ayahs recognised, session reconcile, saved positions, optional joining), plus every existing journey updated to the unified stages.
