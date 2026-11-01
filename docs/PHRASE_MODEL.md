# How Hifz OS prepares practice phrases automatically

**The learner never chooses where to split.** For each ayah the app decides whether to break it and where, from independent kinds of evidence. Phrases are for memorising; they are never presented as places to stop when reciting. A tucked-away "Advanced → Adjust phrases" remains only as a fallback for a phrase that is clearly wrong; "Learn this ayah whole" is one quiet tap.

## Rules of the engine (`src/lib/engine/breakdown.ts`)
1. **Short ayahs stay whole.** 12 words or fewer (3,785 of 6,236 ayahs, 61%) are never broken.
2. **Printed recitation guidance** (stop signs that permit or prefer a pause) is taken when the resulting pieces stay sensible. The "do not stop" sign (ۙ) is never a break.
3. **Grammar.** A model scores every word boundary as a natural clause boundary (below). A break is used only where the score is good enough that holding the stretch whole would be worse; a mid-length stretch (13–16 words) with weak evidence is **left whole rather than guessed at**. Inside long ayahs (over 16 words) pieces are held to about 10 words.
4. **The reciter's pause** (only when verified word timings exist for the recording) can strengthen a grammatical candidate (+) or weaken one the reciter ran straight through (−). **A pause alone never creates a break:** a position needs grammatical or printed evidence first (tested).
5. A piece of one or two words is almost never worth a break (heavy cost); every break records its basis (`stop sign`, `grammar`, `grammar and the reciter's pause`) and confidence.
6. All consumers (Learn, the slip repair after Recall) use the one function, so a slip marked in one place refers to the same phrases elsewhere.

Result across the Qur'an (no timing data): 4,023 ayahs whole, 2,213 phrased (1,892 breaks from printed signs, 2,351 from grammar). Phrases per ayah: 1 → 4,023; 2 → 1,076; 3 → 656; 4 → 266; 5 or more → 215.

## The grammar model (`scripts/build-phrase-candidates.mjs`)
* **Evidence:** the Quranic Arabic Corpus word-by-word morphology (v0.4, via the `mustafa0x/quran-morphology` fork; pinned by SHA-256): part of speech, case, definiteness, conjunctions, resumption/subordinating/conditional/vocative particles, relative pronouns, negations, verb aspect, pronoun suffixes, construct (idafa) and noun-adjective pairs.
* **Training signal:** the ~2,600 positions where the mushaf itself marks a possible pause (ۘ ۗ ۚ ۜ) versus all other positions (71,145 labelled boundaries). A logistic model learns what a natural clause boundary looks like grammatically; it never sees the stop signs as an input.
* **Validation, on surahs it never saw** (5-fold, grouped by surah): **AUC 0.94**; in the 1,304 held-out ayahs with exactly one printed sign, its top-ranked position is that sign **68%** of the time (chance is roughly 10%). At p ≥ 0.2: precision 40%, recall 57% against the printed signs (low precision is expected, because most clause boundaries carry no printed sign). Report: `data/crosscheck/phrase-model-report.json`.
* **What it learned** (a sanity check on reasoning): it strongly refuses a break after a relative pronoun, a vocative, a negation or the particle *inna*, and separating *inna* from its noun; it favours a break before a new clause (a conjunction beginning a new clause, a future or interrogative opener, a new *inna*-sentence). These are the linguistic rules a reader would expect.
* **Shipped:** only per-position probabilities (`src/data/generated/phrase-candidates.json`, 158 KB) for ayahs over 12 words; a candidate list is ignored unless the ayah's word count matches exactly.

## Limits (be honest)
* Not reviewed by a qualified reader. `docs/PHRASE_GALLERY.md` shows the engine's output with evidence for 14 hard cases (Ta-Ha 40, 71, 86, 97, 53, 130, 94, 47; Ayat al-Kursi; 2:282; …) for review. Some splits are second-best (for example Ta-Ha 86 separates "غَضَبٞ" from "مِّن رَّبِّكُمۡ"), which is why they stay practice phrases.
* The model reproduces the mushaf's pause practice; it does not understand meaning. Where meaning and grammar disagree it can be wrong.
* Not yet combined with real reciter pauses: no verified timing data exists in this build (see `PHRASE_AUDIO_SOURCES.md`). Until it does, phrase *audio* (hearing each phrase alone) stays dormant, but the phrases themselves are already used in the Flow ladder.
* **Licence:** the corpus is distributed by its authors under the GNU GPL with attribution to corpus.quran.com (stated by the original project; the fork's page does not restate it and the original site could not be read here). The raw morphology is not committed or shipped; only derived scores are. If Hifz OS is ever published widely, confirm the licence position and add the corpus credit to About.
