# How Hifz OS prepares practice phrases automatically

**The learner never chooses where to split.** For each ayah the app decides whether to break it and where, from independent kinds of evidence. Phrases are for memorising; they are never presented as places to stop when reciting. A tucked-away "Advanced → Adjust phrases" remains only as a fallback for a phrase that is clearly wrong; "Learn this ayah whole" is one quiet tap.

## Rules of the engine (`src/lib/engine/breakdown.ts`)
1. **Short ayahs stay whole.** 12 words or fewer (3,785 of 6,236 ayahs, 61%) are never broken.
2. **Printed recitation guidance** (stop signs that permit or prefer a pause) is taken when the resulting pieces stay sensible. The "do not stop" sign (ۙ) is never a break.
3. **Grammar.** A model scores every word boundary as a natural clause boundary (below). A break is used only where the score is good enough that holding the stretch whole would be worse; a mid-length stretch (13–16 words) with weak evidence is **left whole rather than guessed at**. Inside long ayahs (over 16 words) pieces are held to about 10 words.
4. **The reciter's pause** (only when verified word timings exist for the recording) can strengthen a grammatical candidate (+) or weaken one the reciter ran straight through (−). **A pause alone never creates a break:** a position needs grammatical or printed evidence first (tested).
5. A piece of one or two words is almost never worth a break (heavy cost); every break records its basis (`stop sign`, `grammar`, `grammar and the reciter's pause`) and confidence.
6. All consumers (Learn, the slip repair after Recall) use the one function, so a slip marked in one place refers to the same phrases elsewhere.

Result across the Qur'an with the shipped model (no timing data): 3,952 ayahs whole, 2,284 phrased (1,891 breaks from printed signs, 3,227 from grammar). Phrases per ayah: 1 → 3,952; 2 → 818; 3 → 781; 4 → 366; 5 or more → 319.

## The grammar model (`scripts/build-phrase-candidates.mjs --features orth`, shipped)
* **Evidence:** the canonical text only. Spelling-based features of each word and its neighbours: function words and particles from lists we wrote ourselves (conjunctions, subordinators such as أَن / كَيۡ / إِلَّا, conditionals, negations, vocatives, relative pronouns, *inna* and its sisters), definiteness, pronoun suffixes, word endings, word length, position in the ayah. **No third-party linguistic data** (the Quranic Arabic Corpus is GPL; see `PHRASE_AUDIO_LEGAL.md`).
* **Training signal:** the ~2,600 positions where the mushaf itself marks a possible pause (ۘ ۗ ۚ ۜ) versus all other positions (71,191 labelled boundaries). A logistic model learns what a natural clause boundary looks like; it never sees the stop signs as an input.
* **Validation, on surahs it never saw** (5-fold, grouped by surah): **AUC 0.89**; in the 1,306 held-out ayahs with exactly one printed sign, its top-ranked position is that sign **48%** of the time. At p ≥ 0.2: precision 30%, recall 34%. Report: `data/crosscheck/phrase-model-report.json`. (A corpus-based variant reached AUC 0.94 / 68%; it is developer-only and not shipped. It is a *comparison*, which is why AUC 0.94 alone was never treated as sufficient.)
* **Compensation for the weaker model:** a veto for breaks that detach a subordinating particle from what follows; floors on the evidence needed (higher for mid-length stretches than for very long ones); heavy penalties for one- and two-word pieces; and an explicit review ledger (`src/data/phrase-review.json`) where a qualified reader's rejections are recorded and honoured.
* **Shipped:** only per-position probabilities (`src/data/generated/phrase-candidates.json`) for ayahs over 12 words; a candidate list is ignored unless the ayah's word count matches exactly.

## Limits (be honest)
* **Not reviewed by a qualified reader.** `docs/PHRASE_GALLERY.md` (regenerated from the shipped engine: `GALLERY=1 npx vitest run tests/gallery.gen.test.ts`) shows 14 hard cases with the evidence for each break. Ta-Ha 86 had a break separating "غَضَبٞ" from "مِّن رَّبِّكُمۡ" (second-best on grammar); it is recorded as *provisionally rejected* in the ledger, pending review.
* The model reproduces the mushaf's pause practice; it does not understand meaning. Where meaning and grammar disagree it can be wrong. These phrases are for memorising, never presented as places to stop when reciting.
* Reciter pauses can only *strengthen or veto* a grammatical candidate; they never create a break alone, and phrase audio is cut only where the decoded recording has a real pause. When grammar wants a break the reciter did not pause at, that audio phrase is refused (whole ayah plays in the same reciter's voice) rather than cut through speech.
* **Deployment:** none of this is deployed. Production remains on the restored version until real phrase-by-phrase audio is verified on real recordings.
