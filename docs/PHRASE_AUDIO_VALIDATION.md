# Phrase audio validated on real recordings (Ta-Ha, 2 Nov 2026)

Recordings: Quranic Universal Audio v4.0.0 recitations `yasser_al_dosari_tarteel` and `maher_al_muaiqly_tarteel`, streamed from `audio-cdn.tarteel.ai`. Timings: QUA word timestamps (CC BY 4.0). **Nothing here is iPhone-verified.**

## 1. The host, as observed
* No redirects. `Range` requests return `206` with `Content-Range`. Preflight `OPTIONS` returns `204`.
* `access-control-allow-origin: *`, `access-control-allow-headers: *`, `access-control-expose-headers` includes `Content-Range`, `Accept-Ranges`, `Content-Length`, `Etag`. Cloudflare in front of Wasabi S3; `cache-control: max-age=16070400`; stable `etag`/`last-modified`.
* Real Chromium, real host, no interception: every audio request was `206`, every response carried the CORS header, none failed.

| | Yasser | Maher |
|---|---|---|
| File | `…/yasserAlDosari/murattal/mp3/020.mp3` | `…/maherAlMuaiqly/murattal/mp3/020.mp3` |
| Size / duration | 23,089,508 B / 1443.056 s | 22,676,563 B / 1417.247 s |
| Actual encoding | MP3, 128 kbps CBR, 44.1 kHz stereo | same |
| SHA-256 | `3abbb6c8…f16` | `6038f9b0…eb3b` |
| Catalogue said | sample rate 48,000, bitrate unknown | 128 kbps, 44.1 kHz |

**The catalogue's metadata for Yasser was wrong** (48 kHz vs the real 44.1 kHz). Catalogue metadata is therefore never trusted for identity; the importer measures the bitrate, header offset and byte size from the file itself and stores them, and the app refuses any file whose size differs.

## 2. Do the right words play? (transcribed with a speech recogniser)
I cannot listen, so each cut phrase was transcribed with Whisper (large-v3-turbo, int8, Arabic) and compared, on the consonant skeleton, with the app's canonical text for **exactly that phrase**, and with four alternatives (one word more at the start, one more at the end, one fewer at either end). A clip passes if the exact phrase is the best match; a *clear* defect is a neighbouring-word variant scoring ≥ 0.08 better.

Every phrase the engine produces for all 135 ayahs of Ta-Ha was cut by the app's real engine from the same byte window the app fetches (`tests/realAudio.gen.test.ts`):

| | Yasser | Maher |
|---|---|---|
| Phrases cut | 159 | 146 |
| Refused (no clean pause) | 11 | 15 |
| Whole ayah not isolatable (reciter's abandoned take inside) | 10 ayahs | 27 ayahs |
| Exact phrase is the best match | **156 / 159** | **144 / 146** |
| Clear leak or clip | **0** | **0** |
| Mean similarity to the exact phrase | 0.967 | 0.971 |
| Max padding kept after / before the phrase | 342 / 199 ms | 342 / 262 ms |

The three/two non-exact winners are one-word ties inside recogniser noise (<0.08) in short phrases.

**Defects this found, and the fixes (each now a unit test):**
1. First run: 5 (Yasser) and 3 (Maher) clear leaks of the *next* word. Cause: where the gap after a phrase was large (a long breath, or an abandoned take the reciter restarted from), the cut was placed in the middle of that gap. Fix: for wide gaps the cut is made within 400 ms of the phrase's own word.
2. Second run: 1 and 1 remained. Cause: some reciters abandon an attempt and restart; the abandoned attempt can begin immediately after a phrase with **no pause**. QUA lists those words twice; the importer keeps the last continuous take, records a *seam* and the time span of the abandoned attempt, and a cut may never reach into it. If there is no genuine pause before it, the phrase is refused and the whole ayah plays.
3. Maher 20:94's second phrase is the real example: the app says "The reciter does not pause cleanly at this point. Playing the whole ayah instead."

## 3. In the app (real Chromium, real host, shipped timing files)
Ta-Ha 94, Yasser: two phrases ("قَالَ يَبْنَؤُمَّ … بِرَأْسِي" / "إِنِّي خَشِيتُ … قَوْلِي"). Captured from the speakers and transcribed:
* Phrase A, similarity 0.93 to the exact text; phrase B, 0.975 (best match among the variants).
* **Repetition ×3:** three speech blocks of 5.67 s, 5.67 s, 6.12 s separated by equal ~0.9 s gaps (sample-clock scheduling); each block, transcribed separately, is the same phrase (0.93, 0.96, 0.93).
* **Joined (A → B):** the whole ayah in one pass, similarity 0.957, with the reciter's own pause preserved.
Maher, Ta-Ha 94: three phrases; A and C verified the same way (0.93, 0.96); B refused with the message above.

**Cost on the device (Chromium numbers, not iPhone):** a whole Ta-Ha 94 session fetched 3–4 byte-windows totalling **0.62–0.68 MB** out of a 23 MB file (the whole file is never downloaded). Time to first sound 0.6–1.1 s for the first phrase, 0.13–0.25 s for later ones. JS heap grew 17–33 MB. Design bound: a decoded window (≈10 s, stereo, float32) is ≈3.5 MB; at most five are kept.

## 4. What this does and does not establish
* It establishes that, for these two recordings and Ta-Ha, the words in each cut are the words of that phrase, without neighbouring words, played from the exact file the timings describe (size, bitrate, header offset checked; a different file is refused).
* It does **not** establish tajwīd or the religious correctness of anything; the recogniser is not a qualified reader. It does not prove the cut is at the ideal point, only that no neighbouring word is in it and none of the phrase is missing (to the recogniser's resolution).
* **Not verified:** iPhone/Safari (see `IPHONE_CHECKLIST.md`; the specific risk is `decodeAudioData` on an MP3 byte window that starts mid-stream — Chromium accepted it), surahs other than Ta-Ha, other hosts.
* **Identity limit still stands:** timings consistently offset from the real file cannot be detected at play time (pinned by a test). The ASR check above is the import-time guard and must be run for each new recitation.

## 5. Reproduce
```
node scripts/import-qua.mjs --release-dir <release> --slug yasser_al_dosari_tarteel --reciter dossary --surahs 20 --probe
REAL_TIMINGS=… REAL_MP3=… REAL_OUT=… npx vitest run tests/realAudio.gen.test.ts      # engine over the real file, writes clips
REAL_BUILTIN=1 REAL_TIMINGS=… REAL_RECITER=dossary REAL_OUT=… npx playwright test e2e/realAudio.spec.ts --project=mobile
```
The transcription step is a short Python script using `sherpa-onnx` and the Whisper turbo model from the k2-fsa GitHub release; it is not part of the app.

## 6. Whole Qur'an (2 Nov 2026): Maher and Yasser, Tarteel recordings
> **Superseded by §8.** These are the numbers from the first whole-Qur'an run (110 ms cut tolerance). Real-audio transcription showed that tolerance could start a cut inside a short first word, so it was reduced to 40 ms and everything was re-run. Kept for the record; use §8.

Imported by remote probe in ~30 s each (114 surahs, 6,236 ayahs, nothing skipped). All 114 audio files downloaded (1.2–1.4 GB each) and the app's engine run over **every ayah**: every phrase the app would offer was cut from the real file, the file size was checked against the recorded size (identity), and cuts were measured acoustically (padding, energy outside the timed words).

| | Yasser | Maher |
|---|---|---|
| Phrases offered by the engine | 10,680 | 10,746 |
| Cut cleanly | 8,498 (79.6%) | 7,879 (73.3%) |
| Refused: no genuine pause | 1,525 | 1,919 |
| Not isolatable (the ayah contains the reciter's abandoned attempt) | 657 | 948 |
| Ayahs containing an abandoned take | 1,102 | 1,497 |
| **Ayahs verified (every phrase cut cleanly, no unexplained acoustic warning)** | **4,891 (78.4%)** | **4,508 (72.3%)** |
| Surahs fully verified / ≥90% / <50% | 39 / 57 / 4 | 36 / 55 / 14 |
| Transcription sample (every 30th cut, all surahs) | 283 clips, 281 exact-best, 0 clear defects, mean similarity 0.982 | 262 clips, all exact-best, 0 clear defects, 0.977 |
| Acoustically warned phrases, all re-cut and transcribed | 165 / 165 exact-best | 229 / 229 exact-best |

The acoustic warning (≥250 ms padding containing speech-level energy) turned out to be over-cautious: all 394 warned phrases transcribe to the exact phrase, so the warning marks natural decay or elongation of the last word, not a neighbouring word. They are counted as verified because each was transcribed, not because the warning was ignored.
Low-coverage surahs are real, not misalignment: for Surah 9 (Yasser, 58% of phrases refused) and Surah 60 (Maher, 0 of 13 ayahs verified) the timings were checked by transcribing the timed spans directly (similarity 0.89–1.0, one long ayah truncated by the recogniser's 30 s limit) and the audio simply has no clean pauses at the proposed boundaries; the engine correctly refuses.
**The five non-exact results** of the Ta-Ha transcription: four were the same phrase ("لَأٓيَٰتٖ لِّأُوْلِي ٱلنُّهَىٰ", recognised as "لاولنها", margin < 0.01); one (Yasser 20:40, phrase 4) was Whisper repeating its output: transcribing each half of the clip separately gives the phrase once. None is a clip or a leak.

**What the app now does with it:** `verified` ayah lists are stored inside each timing file (`scripts/apply-verification.mjs`); phrase audio and whole-ayah-from-this-recording are offered **only** for those ayahs. For the others the ordinary source plays and nothing phrase-related appears. Checked in a real browser against the real host: whole-ayah audio cut by the app from the same recording transcribes to the full ayah (Yasser 20:94 0.957, 20:2 0.957; Maher 20:2, 20:5 1.0, 20:71 0.996) and is *not* offered for ayahs that are not verified (Yasser 20:71, Maher 20:94).

**Not done / limits:** transcription is a sample plus the warned set, not all ≈21,000 phrases; the recogniser can miss a partial-syllable leak; no human review of any boundary; no iPhone. Cut-by-cut transcription of every phrase was done only for Ta-Ha (all phrases) and for the warned set; elsewhere it is the sample, plus direct timing checks on Surahs 9 and 60.

## 7. Why the remaining ayahs do not verify (3 Nov 2026)
Planner change: phrases are now planned from pauses **measured in the decoded audio** at every word boundary (QUA times words edge to edge, so the timed gaps say nothing about breaths). Measured pauses are stored in the timing file (`pa`) and used by the app at run time. Results, whole Qur'an:

| | Yasser | Maher |
|---|---|---|
| Phrases cut, old planner → measured-pause planner | 8,498 → 8,479 | 7,879 → 7,404 |
| Phrases refused (no genuine pause), old → new | 1,525 → **1,081** | 1,919 → **1,507** |
| Ayahs verified or warned-only, old → new (before transcription clearing) | 4,891 → 4,933 | 4,508 → 4,515 |
| Ayahs where some phrase is refused ("partial"), old → new | 709 → **362** | 830 → **449** |

Every remaining refusal (1,081 and 1,507) is a phrase whose boundary has **no measured pause at all** (<30 ms of quiet): the recording runs through that point and the planner had no better choice. None is a refusal despite a measured pause. Nothing was forced.
The other blocker is the recording itself: **1,102 Yasser ayahs and 1,497 Maher ayahs contain an abandoned take** (the reciter restarted a passage), so the whole ayah cannot be isolated from that file. They fall back to the ordinary source, as designed.
So the gap to 100% is: recordings with abandoned takes (18% / 24% of ayahs) + stretches recited without pauses (about 6% / 7%). Neither is an alignment defect; neither should be "fixed" by cutting through speech. Coverage can still grow by adding other recordings of the same reciters (e.g. Maher's QuranicAudio recording, whose abandoned-take count is lower in the catalogue survey: 326 ayahs), which needs that host allowed.

## 8. Final numbers: re-run with the 40 ms cut tolerance (2 Nov 2026)
Why: transcription of the previous run's output found two phrases whose first word was clipped (Surah 7:57 and 34:2; lead −51/−52 ms). The tolerance within which a cut may be moved to reach a quiet run was reduced from 110 ms to 40 ms (`cutTuning.snapMs`). On four surahs this removed every cut that began inside a word and cost about 3% more refusals — the safe direction. Then the whole pipeline was repeated for **three** recordings: engine over every ayah of the real audio, pauses measured at every word boundary, acoustic checks, **all** acoustically warned phrases re-cut and transcribed, and a transcription sample (every 30th cut).

| | Yasser (Tarteel) | Maher (Tarteel) | Sudais (Tarteel) |
|---|---|---|---|
| Ayahs imported | 6,236 | 6,236 | 6,116 (Surah 5 refused: file is 160 kbps, catalogue says 128) |
| Phrases offered by the engine | 10,478 | 10,295 | 9,960 |
| Cut cleanly | 8,229 (78.5%) | 7,269 (70.6%) | 7,625 (76.6%) |
| Refused: no genuine pause at the boundary | 1,225 | 1,597 | 1,817 |
| Not isolatable (ayah contains an abandoned take) | 1,024 | 1,429 | 518 |
| Ayahs containing an abandoned take | 1,102 | 1,497 | 611 |
| **Ayahs verified** | **4,875 (78.2%)** | **4,476 (71.8%)** | **4,963 (81.1%)** |
| Surahs fully verified / ≥90% / <50% | 39 / 57 / 4 | 36 / 55 / 16 | 50 / 68 / 3 |
| Acoustically warned phrases, re-cut and transcribed | 25 / 25 exact-best | 12 / 12 | 30 / 30 |
| Transcription sample | 274 clips, 271 exact-best, **1 clear defect**, mean similarity 0.979 | 242 clips, 241 exact-best, 0 defects, 0.975 | 254 clips, 253 exact-best, 0 defects, 0.978 |

* The coverage barely moved (78.4 → 78.2, 72.3 → 71.8) while the unsafe cuts disappeared. That is the intended trade: **no cut is forced to raise the percentage.**
* The one clear defect (Yasser 38:57, "هذا فليذوقوه حميم وغساق": the transcription matched the phrase *without* its first word best) is now **held back**: any transcription-confirmed defect removes its ayah from the verified list (`summarize-verification.mjs`). 4,876 → 4,875.
* Warned phrases dropped from 394 to 67 because far fewer cuts now sit loosely against a pause; all 67 transcribe to the exact phrase.
* **The remaining gap to 100% is not alignment:** abandoned takes in the recording (Yasser 17.7%, Maher 24.0%, Sudais 10.0% of ayahs) plus stretches recited without a pause at the proposed boundary (ayahs with a refused phrase: Yasser 420 = 6.7%, Maher 472 = 7.6%, Sudais 672 = 11.0%). A boundary with no measured pause is refused, and the whole ayah falls back to the ordinary source.
* Sudais was produced with `scripts/verify-recitation.sh` (probe → import → download → engine → warned re-cut → transcription → apply) with no hand steps: the pipeline is reusable for the other Tarteel recordings.

**Validation level per recording** (the five levels are never merged):

| Recording | Imported | Acoustically validated | Independently checked (transcription) | Human-reviewed | Rights-cleared |
|---|---|---|---|---|---|
| Yasser (Tarteel) | yes, all 114 surahs | yes, 4,875 ayahs | sample + warned set | **no** | **no** |
| Maher (Tarteel) | yes | yes, 4,476 ayahs | sample + warned set | **no** | **no** |
| Sudais (Tarteel) | yes, 113 surahs | yes, 4,963 ayahs | sample + warned set | **no** | **no** |

Transcription is a recogniser (Whisper turbo), not a judge of tajwīd; it can miss a partial-syllable leak. Nothing here replaces review by a qualified reciter, which has not happened.

### 8.1 Browser run against the real host with the final data (Chromium, desktop, datacentre network — **not an iPhone**)
`e2e/realAudio.spec.ts` with the shipped timing files; audio fetched from audio-cdn.tarteel.ai by HTTP Range, decoded by the browser, captured at the speakers and transcribed.

| Case | Result |
|---|---|
| Yasser 20:94 (3 chips), 20:40 (5 chips, long) | every chip's exact phrase was the best transcription match (0.93–1.0); phrase repeated 3×; joined chips transcribe to the ayah (0.94–0.98) |
| Maher 20:71 (5 chips, longest verified Ta-Ha ayah) | every chip exact-best (0.98–1.0); repeat ×3 correct; join 1.0 |
| Maher 20:94 (contains the reciter's restart; not verified) | no phrase controls, no whole-ayah-from-this-recording: falls back to the ordinary source, as designed |
| Maher 20:4 (6 words, short) | stays whole: no phrase chips by design |
| Whole ayah cut from the same recording | passes (Yasser, Maher) |
| First-sound latency | 0.5–0.6 s for the first phrase (includes fetching + decoding the byte window), 0.15–0.35 s for later phrases |
| JS heap growth over a full session on the page | 44–75 MB |
Playwright flag-off suite: 44 passed. Flag-on suite: 61 passed, 2 skipped (the real-host specs, which need env). Unit tests: 270 passed, 2 skipped.
A stale part of the real-host spec (it planned phrases from the timed gaps, which are 0 ms, rather than from the measured pauses the app uses) produced a 2-phrase layout against the app's 3 chips; this looked like a truncated phrase and was in fact the spec; fixed to use the measured pauses.
Latency and memory on a real iPhone are not known.
