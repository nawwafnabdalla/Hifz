# Phrase-by-phrase audio

Status: **built and tested against synthetic recitation; dormant in production until real timing data is imported and checked on a phone.** Lives on branch `claude/hifz-os-phrase-audio`, not deployed.

## What the learner gets (when a reciter's timings are installed)
* **Sound step:** under the player, "Hear a phrase on its own": tap A, B, C to hear only that phrase, in the chosen reciter's own recording; repeat chips 1× / 3× / 5×. Long ayahs offer one quiet link, "Learn this ayah whole".
* **Flow step:** under the familiar counter and ratings, **Hear this part** plays exactly the part being practised (A, then A → B, then the whole chain), with the reciter's own breaths kept between phrases. The old repetition counter, fluency rating and ladder are unchanged.
* **Recall, Connect, revision:** unchanged.
* **Without timings** (most reciters today, and every ayah not yet aligned) the Learn flow is exactly the familiar one; no new control appears. If a boundary cannot be cut cleanly, that part says so and plays the whole ayah in the same reciter.

## How it works
1. **Timings propose, the audio decides.** A timing file lists which words are spoken when, for ONE recording (source + folder). The app asks for the range of words [first of phrase … last of phrase], then decodes the real recording and snaps each boundary to a genuine pause (≥ 30 ms of near-silence, a quarter of the speech level) within ±110 ms of the proposal. No genuine pause means that boundary is refused, never cut through a word.
2. **Web Audio, not `<audio>` seeking.** The ayah is decoded once (kept for fast repeats); start, stop and every repeat are scheduled on the audio clock, so playback is sample-accurate and repeats are gapless, with 6 ms fades. `<audio>` reports time in ~250 ms steps and stops "about" where asked.
3. **Joining uses the same machinery:** A → B is one continuous range from the start of A to the end of B, so the reciter's own pause between them is kept.
4. **Never the wrong recording:** timings are keyed by recording (e.g. `everyayah:Yasser_Ad-Dussary_128kbps`). Another reciter, another encoding, or a file whose decoded length differs by more than 60 ms gets no phrase audio.
5. **Offline:** a saved copy is used only when it came from the same recording as the timings (Islamic Network copies match Islamic Network timings only).

## How phrase breaks are chosen
Automatically, from printed stop signs, a grammar model and, when timings exist, the reciter's pauses. The learner never places a break; see `docs/PHRASE_MODEL.md` for the evidence, validation and limits, and `docs/PHRASE_GALLERY.md` for hard cases.

## Sources investigated
See `docs/PHRASE_AUDIO_SOURCES.md`.

## Tests
* `tests/phraseAudio.test.ts` (14): cut accuracy at sample level on synthetic recitation: no clipped word, no word from a neighbouring phrase, including 300 randomised timings drifted by up to ±80 ms; refusal when words flow together; timing validation; recording scoping.
* `tests/breakdown.test.ts` (7): practice breaks over all 6,236 ayahs; Ta-Ha's long ayahs now break; words are never altered.
* `tests/importTimings.test.ts` (2): the importer rejects mismatched, mis-ordered, out-of-range or unmatched timings.
* `e2e/phraseAudio.spec.ts`: plays through the real engine in Chromium and **listens to the output**: each word has its own pitch, so a test knows exactly which words were audible, whether any was clipped, and whether repeats are evenly spaced.

**What these tests do not prove:** that real recitation has the same pause structure as the synthetic signal, or that a real dataset's words line up with real audio. Only the on-device check (Settings → About → Audio sources → Check my three reciters → "Phrase audio") and listening can show that.

## Real-device test plan (nothing here has been run on an iPhone)
Do this once timings are installed for a reciter (the Network step in `PHRASE_AUDIO_SOURCES.md`).
1. Settings → About → Audio sources & checks → **Check my three reciters**. The **Phrase audio** line must say "Timings fit the real audio: N of N pauses … are genuine". If it says the host cannot be read, phrase audio is falling back to whole ayahs (cross-origin restriction on that host); tell me the line.
2. Learn a long Ta-Ha ayah (for example 20:40 or 20:71). In the Sound step tap **A**, **B**, **C**, listening with headphones: does each begin on its first word and end after its last, without a clipped syllable or a stray word from the next phrase?
3. Tap **3×**, then a phrase: three whole, evenly spaced copies, no click at the joins.
4. Flow step → **Hear this part** on **A → B**: one continuous recitation with the reciter's own breath in the middle.
5. Silent switch on and off: does phrase audio play? (Web Audio may follow the ringer switch on iPhone; if it is silent with the switch on, tell me.)
6. Lock the screen mid-phrase: expected to stop (phrase audio is Web Audio, not the lock-screen player). Whole-ayah audio and Echo are unchanged.
7. Airplane mode after saving the audio (Maher via Islamic Network only): phrase audio still plays from the saved copy.
8. Switch reciter: phrase controls disappear for a reciter without timings, and the whole-ayah player still works.
