# Expanding phrase audio efficiently

Proven first (see `PHRASE_AUDIO_VALIDATION.md`): Yasser and Maher on Ta-Ha. The other 59 "promising" recitations are **not** integrated: each needs the same gate below, and rights are an owner decision (`PHRASE_AUDIO_LEGAL.md` §2a).

## The gate every recitation passes (cheap steps first)
1. **Catalogue** (done for all 102): Hafs, streamable source, CBR, zip checksum matches the release manifest.
2. **Host check** (once per host, 1 request): CORS `*` or the app's origin, `Range` → `206`, `Content-Range` exposed.
3. **Probe import** (`--probe`, 64 KB per surah, no download): byte size, bitrate, header offset and exact duration. Checked against local-file import for Yasser and Maher: **identical** (size, bitrate, offset, duration to the millisecond), so no 23 MB downloads are needed to import.
4. **Real-audio verification** (the expensive step, once per recitation, Ta-Ha first): run the engine over the file (`tests/realAudio.gen.test.ts`), transcribe every cut phrase, require zero clear leaks. ~25 MB download and ~10 minutes of CPU per recitation. This is what catches wrong-recording and offset problems that no metadata check can.
5. **Browser check** on one ayah (`e2e/realAudio.spec.ts`).
6. Then import the remaining surahs with `--probe` and spot-check a few surahs with step 4.

## Next candidates: all on the host already proven to work
Probe import of Ta-Ha succeeded for each (all constant-bitrate 128 kbps, `206`); steps 4–6 not run. Hafs ʿan ʿĀṣim.
| Recitation | Host | Ta-Ha file |
|---|---|---|
| `abdulbasit_abdulsamad_tarteel` (murattal) | audio-cdn.tarteel.ai | 30.5 MB |
| `abdulrahman_al_sudais_tarteel` | audio-cdn.tarteel.ai | 18.3 MB |
| `abu_bakr_al_shatri_tarteel` | audio-cdn.tarteel.ai | 25.4 MB |
| `saad_al_ghamdi_tarteel` | audio-cdn.tarteel.ai | 21.7 MB |
| `khalifa_al_tunaiji_tarteel` | audio-cdn.tarteel.ai | 24.5 MB |
| `abdulbasit_abdulsamad_mujawwad_tarteel`, `mahmoud_khalil_al_husary_mujawwad_tarteel` | audio-cdn.tarteel.ai | 53.8 / 59.7 MB (mujawwad: slow, long; gaps are different; verify separately) |
Then, by host: `download.quranicaudio.com` (19 recitations incl. Maher 96 kbps, Hani Ar-Rifai, Husary, Afasy), `cdn.mp3quran.net` (27 incl. Minshawi, Shuraim, Afasy, Husary), `archive.org` (Yasser taraweeh). Each needs its host allowed and step 2 first.

## Known cost drivers and fixes
* **Data size.** A full Qur'an per recitation is ≈1.3 MB of JSON (Ta-Ha alone is 29 KB). Before importing whole Qur'ans: split per surah (lazy-load only the surah in view), shorten the format (word starts only), and keep the data out of the service-worker precache.
* **Refusals.** 6–8% of phrases (and whole ayahs with an abandoned take) are refused and fall back to the whole ayah in the same reciter, with a plain message. A better fix: store, per recitation, the measured real pauses at word boundaries (computed at import from the decoded audio) and let the phrase planner use them, so the chosen phrase boundaries are exactly where the reciter breathes and every chip plays. Not built.
* **Reciter identity.** Phrase audio plays the QUA recording; the whole-ayah button still plays the EveryAyah file for the same reciter. For Maher and Yasser that means two different recordings of one reciter. A cleaner product: when a reciter has a verified recording, play the whole ayah from the same recording too (a window of the same file). Not built; flagged because the learner may hear a different take/room between "Hear" and "A/B".
* **Phrase quality** is still the grammar/stop-sign/pause engine; a qualified reader's review is outstanding.
