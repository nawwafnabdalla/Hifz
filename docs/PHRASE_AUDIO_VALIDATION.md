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
