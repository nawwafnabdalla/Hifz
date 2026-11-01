# Getting the real data: exact files and the simplest legitimate route

The build environment's proxy denies GitHub, Hugging Face, QUL, EveryAyah and MP3Quran. Nothing was bypassed. Pick one:

## Route A: allow hosts for one session (simplest)
Cloud environment → Network access → Allowed domains, add:
`github.com`, `api.github.com`, `codeload.github.com`, `release-assets.githubusercontent.com`, `objects.githubusercontent.com`
and, for audio checks, the audio hosts of the recitations you want (read them from `catalog.json`; typically `server10.mp3quran.net`, `everyayah.com`).
Optional: `huggingface.co`, `qul.tarteel.ai`. Then ask me to continue: the importer, the Ta-Ha validation and the expansion run without any other manual step.

## Route B: send the files
From https://github.com/QUD-Technologies/quranic-universal-audio/releases (v4.0.0, 24 Oct 2026), for **one** recitation first (Maher or Yasser):
1. The release manifest and `catalog.json` (to get recitation ids, audio URLs, recording metadata, riwayah and licence).
2. That recitation's package: its word-timestamp file (`word_timestamps.json` or `.json.gz`) and `data/surah_info.json` if present, plus the checksum listed in the manifest. **Verify the checksum yourself** (`shasum -a 256`).
3. The **matching** surah recordings for Ta-Ha (`020.mp3`) at minimum, from the exact URL the catalogue lists for that recitation. Do not substitute an EveryAyah or Islamic Network copy: different encodings shift positions by tens of milliseconds, and timings of one recording are not valid for another.
Put them in a folder and run:
```
node scripts/import-qua.mjs --inspect --timings word_timestamps.json.gz
node scripts/import-qua.mjs --reciter maher --recording qua:<id> --timings word_timestamps.json.gz \
  --audio-dir ./maher-surahs --url-template 'https://<host>/<path>/{SSS}.mp3' \
  --source "Quranic Universal Audio v4.0.0" --licence "<from catalog>" \
  --url https://github.com/QUD-Technologies/quranic-universal-audio --riwayah hafs --surahs 20
```
Read the "skipped" list. If `--inspect` prints `NOTHING understood`, send me the first lines of the file: the reader needs one small adjustment (`ayahsOf` in `scripts/import-qua.mjs`).

## Route C: Quran Align (EveryAyah-style per-ayah recordings)
Quran Align release JSON for the reciter plus the same reciter's per-ayah MP3s from EveryAyah (`020001.mp3` …), then `scripts/import-timings.mjs --format align` (command in `PHRASE_AUDIO_SOURCES.md`).

## After import
`ReciterCheck` (Settings) reports whether phrase audio is available for the selected reciter and why not. On the phone: Learn → Ta-Ha → verse 94, listen to each phrase, then follow `IPHONE_CHECKLIST.md`.
