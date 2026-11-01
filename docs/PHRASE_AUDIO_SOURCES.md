# Timing sources investigated (1 Nov 2026)

**Network context.** This build environment sends every outbound connection through a policy proxy that answers `403` to most hosts. Reachable: `raw.githubusercontent.com`, the npm registry, PyPI, crates, Go proxy. Blocked: everything below marked 403. A 403 from the proxy is a policy decision for this environment, not evidence the resource does not exist. Nothing was circumvented.

| Route | Result | Detail |
|---|---|---|
| Quran Align, `github.com/cpfair/quran-align` and its Releases | **blocked (403)** | `github.com`, `api.github.com`, `codeload.github.com` all 403. `release-assets.githubusercontent.com` answers but release files need a signed link issued by `github.com`. |
| Quran Align README via `raw.githubusercontent.com` | **read** | Word-precise segments for EveryAyah-style recordings; data in Releases; **CC BY 4.0**; format `[word_start, word_end_exclusive, start_ms, end_ms]` per ayah; accuracy against an independent system: mean error < 73 ms (SD 139 ms), 98.5–99.9% of words segmented; some words may be omitted. Which reciters are published could not be read. The tool and training script are not usable (key script unpublishable). |
| QUL `qul.tarteel.ai/resources/recitation`, `/docs/with-segments` | **blocked (403)** | Format and licence unread. |
| Quran.com API (`api.quran.com`, `api.qurancdn.com`), Quran Foundation docs | **blocked (403)** | |
| QuranLab on Hugging Face (`huggingface.co/api/datasets/quranlab/quran-audio`) | **blocked (403)** | |
| jsDelivr / unpkg / gist mirrors | **blocked (403)** | |
| PyPI `quran-align` | 404 | No such package. |
| npm registry, ~25 searches (quran + segments/timing/align/timestamps/audio/recitation/reciter/tarteel/qul, scopes) | **reachable, nothing usable** | Found no package that ships verse-segment timings. Found: recitation-recognition models (`@tilawi/quran-asr`, `react-native-recite-quran`, `@tilawa/core`), a downloader (`quran-audio`), a Quran.com client (`@quranjs/api`), text datasets (`@quran.ws/text`), and `@kmaslesa/holy-quran-word-by-word-full-data` (word-by-word data, not examined: isolated word recordings would not meet the requirement anyway). |
| Audio hosts (EveryAyah, Islamic Network CDN, Quran.com audio) | **blocked (403)** | So alignments cannot be generated or validated here: there is no lawfully reachable audio. |
| Generating alignments ourselves | **not possible here** | Needs the audio plus an Arabic forced aligner or recogniser; neither audio nor a validated aligner is reachable. An on-device recogniser exists on npm (`@tilawi/quran-asr`), unevaluated. |

## Linguistic evidence (found, and used)
`raw.githubusercontent.com` serves `mustafa0x/quran-morphology/master/quran-morphology.txt` (6.3 MB, 130,030 segments; Quranic Arabic Corpus v0.4 fork). Used at build time to learn grammatical clause boundaries (see `PHRASE_MODEL.md`). Its licence is not restated in the fork; see the note there. `kaisdukes/quranic-corpus` (QAC v2) README was readable but its data files were not located.

## What this means
Phrase audio is built, tested on synthetic audio, and **waiting for real timing data**. Two ways to supply it:

1. **Allow the hosts for a session** (Network access → Allowed domains in the cloud environment settings): `github.com`, `release-assets.githubusercontent.com`, `objects.githubusercontent.com`, `everyayah.com`, `cdn.islamic.network`, and optionally `qul.tarteel.ai`, `api.qurancdn.com`, `huggingface.co`. Then the whole path (download timings and Ta-Ha audio, import, validate against the real audio, wire up) can be done and checked end to end.
2. **Do the data step yourself**: download the Quran Align release for the reciter (Maher or Yasser, if published) and their Ta-Ha audio from EveryAyah, then run
   `node scripts/import-timings.mjs --reciter dossary --recording everyayah:Yasser_Ad-Dussary_128kbps --format align --input <release.json> --audio-dir <folder of 020001.mp3 …> --source "quran-align <version>" --licence CC-BY-4.0 --url https://github.com/cpfair/quran-align --surahs 20`
   It checks every ayah against the canonical text and the real file lengths, lists what it skipped and why, and writes `src/data/timings/dossary.json` with provenance.

## Licences
* Timings from Quran Align: **CC BY 4.0** (attribution; credit to be shown in About when data is imported). Verified from the README only.
* QUL / Quran.com timings: **not verified** (pages unreachable).
* **Audio rights are separate and unchanged:** EveryAyah recordings may be streamed and played, never saved; Islamic Network copies may be saved. A timing licence does not change either.
* Badr Al-Turki: no per-ayah recording source exists, so no phrase audio is possible for him.
