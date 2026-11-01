# Next generation: what I verified, decided, built and deferred

Baseline: commit 167d9a3 (live). Research read in full: *Hifz OS — Research & Next-Generation Vision* (1 Nov 2026). Checked against the code, not taken on trust.

## What I checked in the report
| Claim | Finding |
|---|---|
| "A four-phrase ayah takes 20–25 taps." | True only for the tail. **71% of ayahs (4,399 of 6,236) are a single phrase, 21% have two, 6% three, and only 1.5% have four or more.** A typical ayah took about 10 taps *if* you tapped every repetition, 5–6 if you only rated. The cost was less the tap count than three screens (Sound, Flow, Recall) and a counter. The report's priority is right, its headline number overstates the common case. |
| "Cold check should open each session." | Already how it works: the planner orders recent revision first, and reviews start with the text hidden. No change needed. |
| "Word timings exist for Maher and Yasser (QuranLab, QUL)." | **Not verifiable from here.** Hugging Face, QUL and the Quran.com API are unreachable from the build environment, so I could not check availability, licence, alignment drift or file match. Phrase-level audio is therefore **not built**. |
| "The learner needs a ramp, not a cliff." | Agreed, and it did not need new data: the word renderer already supported fading. |
| "Flow rating is unreliable evidence." | Agreed. It never affected retention (flow ≠ recall); it only steered the ladder. |

## What I built (and why only this)
**The support ramp** replaces the repetition counter, the three-way rating and the separate Sound screen.
* One screen per ayah. You hear it (audio bar sits above the button on the first step), say it aloud, and tap **Said it**. That is the only control.
* Pieces are added cumulatively; earlier pieces thin to their first word; the last step is the whole ayah from first words only. Short opening pieces are taken together; very short ayahs (<5 words) are said once; long ayahs join back every third piece.
* If you cannot continue, **Show me** reveals the text. That is remembered as a tangle on the joint the new piece attaches to; a clean pass clears it. Targeted repair reads exactly this, so it keeps working, and now repairs run through the same ramp.
* Evidence model untouched: flow events never create retention evidence (tested). Hints still cap grades. Recall, the append-only history, and the planner are unchanged. No database change.
* Removed: Sound/Flow/Recall/Connect stepper, the Sound screen's Continue tap, the counter, the rating buttons (they remain for the repeated-recitation arm of the experiment and for in-place repair after a slip).
* **Measured over all 6,236 ayahs:** flow-stage taps average **6.4 → 2.2** (one tap per step) when counting repetitions, and 1.6 → 2.2 if you only ever rated (the ramp adds a faded pass, which is learning, not operating). Whole ayah, hear to graded: **about 10.4 → 5.2 taps**, with fading added. In the browser, an ordinary Ta-Ha ayah is five taps (listen, say, say from the first word, reveal, grade).

## Deliberately not built
* **Phrase-level audio and the first-word cue.** Needs the timing data (unreachable here) and a real iPhone to check that seeking inside a streamed MP3 lands cleanly. Highest-value next step once someone can fetch and spot-check the timings.
* **Recitation tracking ("the listener").** The report itself says it must be validated against a labelled test set first. Nothing here makes that honest to ship blind.
* **Two-button grading.** Mapping four grades to two changes what the memory model learns from. Needs data from cold checks first.
* **Merging Settings and Progress, a new "Mihrab", Understand mode, teacher links, family circles.** Each adds surface; none is needed for the ramp to deliver. Not started.
* **Recovery diagnostic** (random-start probes for half-known surahs): the strongest remaining idea for you personally, and needs no new data. It touches the planner and evidence attribution, so it deserves its own release with its own tests rather than riding along.

## Honest limits
Nothing here is verified on an iPhone. The ramp's thresholds (when to join pieces, when a piece is "short") are sensible defaults, not tuned values; the next-day cold check is the real judge, and the 14-day experiment (arm A vs the ramp) will show whether the ramp helps your retention. The first-word-only step is the one to watch on your phone for readability in the Madinah font.
