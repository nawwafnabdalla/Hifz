# Import and validation pipeline for phrase audio

Everything is a script you can re-run; none of it touches the learner's data. Output is compact, versioned JSON under `src/data/timings/` (timings) and `data/validation/` (what was checked).

```
1. node scripts/qua-survey.mjs         --release-dir <v4.0.0>                  # integrity + coverage of every recitation in a release
2. node scripts/build-reciter-matrix.mjs --release-dir <v4.0.0>                # docs/QUA_V4_MATRIX.md + the Ta-Ha URL list
3. node scripts/import-qua.mjs --release-dir <v4.0.0> --slug <slug> --reciter <app id> --probe    # timings -> src/data/timings, whole Qur'an in ~30 s
4. REAL_FAST=1 REAL_TIMINGS=… REAL_MP3_DIR=<downloaded surah files> REAL_SURAH=all REAL_OUT=<dir> npx vitest run tests/realAudio.gen.test.ts
5. (sample) transcribe the written clips, compare with the canonical text (a short Python script; not part of the app)
6. node scripts/summarize-verification.mjs --report <dir>/report.json --slug <slug> --out data/validation/<slug>.json [--asr <asr.json>]
```

## What each step establishes
| Step | Checks | Does not establish |
|---|---|---|
| 1 | zip SHA-256 = release manifest; riwayah; source streamable (no YouTube/Drive); CBR; word counts equal the app's canonical text; usable-take coverage | that the audio matches |
| 3 | zip checksum again; Hafs only; no YouTube/Drive; per-surah byte size, bitrate, header offset and exact duration read from the real host by Range (identical to measuring the downloaded file); bitrate equals the catalogue's; the reciter's last continuous take kept, abandoned takes recorded as seams with their time span; ayah windows; word order and ≥85% words timed | that timings are correct for the audio |
| 4 | the app's real engine over the real file: file size equals the recorded size (identity), every phrase the app would offer cut from the same byte window the app fetches, refused where there is no genuine pause or the range crosses an abandoned take; padding kept around the words; speech-level energy outside the timed words (a leak signature) | correct recitation; that the words inside are the right words |
| 5 | the right words are in the clip (best match among the exact phrase and ±1 word variants) on a sample | tajwīd; every clip; anything about meaning |
| 6 | per-surah / per-ayah status: `ok`, `partial`, `whole-isolation-refused`, `review` | human review |
Human review is still required for: phrase boundaries (a qualified reader), every `review` ayah, and any use for teaching tajwīd.

## Scale
Per reciter: download ≈1.3–1.5 GB (≈1 minute here), import ≈30 s, whole-Qur'an engine run ≈20 minutes (one decode per ayah), transcription ≈3.5 s per clip on 4 CPU cores (sample, not all ≈10,000 phrases ≈ 10 h).
Adding a recitation = steps 3–6 plus its rights (`PHRASE_AUDIO_RIGHTS.md`). Recordings must be constant-bitrate MP3 on a host that serves Range with CORS (`scripts/import-qua.mjs --probe` fails loudly otherwise).
